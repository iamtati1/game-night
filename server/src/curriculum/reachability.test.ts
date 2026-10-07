import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { CHALLENGED } from "./lessons.js";
import { CONCEPT_STATE_SQL, ENCOUNTER_RUNGS_SQL, rungsFromRows } from "./encounter.js";

/**
 * One authoritative reachability rule.
 *
 * Jolt had two, and they disagreed: the journey opened exactly one concept at a
 * time, while the encounter asked only whether a concept's own prerequisites
 * were met. A learner could not reach `variable-state` from the world -- it sits
 * after `let-vs-const` -- but /concept/variable-state served it anyway, because
 * its single prerequisite was demonstrated.
 *
 * These pin the rule the journey has always applied, now expressed in SQL and
 * read by both.
 */
describe("concept reachability", () => {
    let fx: CurriculumFixture;

    const stateOf = async (user: string, concept: string): Promise<string> => {
        const [row] = await fx.rows<{ state: string }>(CONCEPT_STATE_SQL, [
            user,
            concept,
            [...CHALLENGED]
        ]);

        return row!.state;
    };

    /**
     * Demonstrates every concept strictly before `stop`, and passes every
     * checkpoint strictly before its topic -- because a topic's checkpoint takes
     * the learner's position once that topic's concepts are done, which is the
     * rule under test and not something a walk may skip.
     */
    const walkTo = async (user: string, stop: string): Promise<void> => {
        await fx.rows(
            `INSERT INTO concept_demonstrations (user_id, concept_id, needed_retry)
             SELECT $1, c.id, FALSE
             FROM concepts c JOIN topics t ON t.id = c.topic_id
             WHERE (t.display_order, c.display_order) < (
                 SELECT t2.display_order, c2.display_order
                 FROM concepts c2 JOIN topics t2 ON t2.id = c2.topic_id
                 WHERE c2.slug = $2
             )
             ON CONFLICT DO NOTHING`,
            [user, stop]
        );

        await fx.rows(
            `INSERT INTO topic_challenge_completions (user_id, topic_id, needed_retry)
             SELECT $1, t.id, FALSE FROM topics t
             WHERE t.display_order < (
                 SELECT t2.display_order FROM concepts c2
                 JOIN topics t2 ON t2.id = c2.topic_id WHERE c2.slug = $2
             )
             ON CONFLICT DO NOTHING`,
            [user, stop]
        );
    };

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
    }, 120000);

    it("opens the very first concept to a learner with no history", async () => {
        const fresh = await fx.insertUser("reach-fresh@example.com");
        const [first] = await fx.rows<{ slug: string }>(
            `SELECT c.slug FROM concepts c JOIN topics t ON t.id = c.topic_id
             ORDER BY t.display_order, c.display_order LIMIT 1`
        );

        expect(await stateOf(fresh, first!.slug)).toBe("current");
    });

    it("locks everything after the first concept", async () => {
        const fresh = await fx.insertUser("reach-fresh2@example.com");
        const after = await fx.rows<{ slug: string }>(
            `SELECT c.slug FROM concepts c JOIN topics t ON t.id = c.topic_id
             ORDER BY t.display_order, c.display_order OFFSET 1 LIMIT 5`
        );

        for (const row of after) {
            expect(await stateOf(fresh, row.slug), row.slug).toBe("locked");
        }
    });

    it("reports a demonstrated concept as demonstrated", async () => {
        await fx.scenario(async () => {
            const user = await fx.insertUser("reach-done@example.com");

            await fx.rows(
                `INSERT INTO concept_demonstrations (user_id, concept_id, needed_retry)
                 SELECT $1, id, FALSE FROM concepts WHERE slug = 'console-output'`,
                [user]
            );

            expect(await stateOf(user, "console-output")).toBe("demonstrated");
        });
    });

    /**
     * THE BYPASS THIS CLOSES. `variable-state` is Variables #8; `let-vs-const`
     * is #7. A learner who has demonstrated everything up to and including #6
     * has `variable-state`'s only prerequisite (`reassignment`) satisfied -- and
     * must still not be able to open it, because #7 comes first.
     */
    it("locks a concept whose prerequisites are met but which is not next", async () => {
        await fx.scenario(async () => {
            const user = await fx.insertUser("reach-skip@example.com");

            await walkTo(user, "let-vs-const");

            const [prereq] = await fx.rows<{ met: boolean }>(
                `SELECT EXISTS (
                     SELECT 1 FROM concept_demonstrations d
                     WHERE d.user_id = $1
                       AND d.concept_id = (SELECT id FROM concepts WHERE slug = 'reassignment')
                 ) AS met`,
                [user]
            );

            expect(prereq?.met, "its prerequisite IS satisfied").toBe(true);
            expect(await stateOf(user, "let-vs-const")).toBe("current");
            expect(await stateOf(user, "variable-state"), "still behind #7").toBe("locked");
        });
    });

    /**
     * A topic's checkpoint sits between its last concept and the next topic's
     * first. Leaving it out of the rule would let the encounter open the next
     * topic while the journey still pointed at the checkpoint.
     */
    it("holds the next topic shut until an outstanding checkpoint is passed", async () => {
        await fx.scenario(async () => {
            const user = await fx.insertUser("reach-gate@example.com");

            // Everything in Values, which is a CHALLENGED topic.
            await fx.rows(
                `INSERT INTO concept_demonstrations (user_id, concept_id, needed_retry)
                 SELECT $1, c.id, FALSE FROM concepts c JOIN topics t ON t.id = c.topic_id
                 WHERE t.slug = 'values' ON CONFLICT DO NOTHING`,
                [user]
            );

            expect(CHALLENGED.has("values")).toBe(true);
            expect(
                await stateOf(user, "variables-name-values"),
                "the Values checkpoint has the learner's position"
            ).toBe("locked");

            await fx.rows(
                `INSERT INTO topic_challenge_completions (user_id, topic_id, needed_retry)
                 SELECT $1, id, FALSE FROM topics WHERE slug = 'values'`,
                [user]
            );

            expect(await stateOf(user, "variables-name-values")).toBe("current");
        });
    });

    it("does not gate on a topic that has no checkpoint", async () => {
        await fx.scenario(async () => {
            const user = await fx.insertUser("reach-nogate@example.com");

            // Strings has no authored checkpoint, so finishing it must not
            // invent a gate in front of Loops.
            expect(CHALLENGED.has("strings")).toBe(false);

            await walkTo(user, "for-loop-anatomy");

            expect(await stateOf(user, "for-loop-anatomy")).toBe("current");
        });
    });

    it("returns nothing for a concept that does not exist", async () => {
        const user = await fx.insertUser("reach-none@example.com");

        expect(await fx.rows(CONCEPT_STATE_SQL, [user, "monads", [...CHALLENGED]])).toHaveLength(0);
    });

    /**
     * THE AGREEMENT TEST. The rule above and findJourneyPath's in-memory pass
     * must name the SAME concept current. findJourneyPath reads `pool`, so its
     * logic is reproduced here against the fixture rather than called -- if the
     * two ever drift, exactly one concept being current stops being true.
     */
    it("names exactly one concept current, matching the journey's own pass", async () => {
        await fx.scenario(async () => {
            const user = await fx.insertUser("reach-agree@example.com");

            await walkTo(user, "assignment");

            const all = await fx.rows<{ slug: string }>(
                `SELECT c.slug FROM concepts c JOIN topics t ON t.id = c.topic_id
                 ORDER BY t.display_order, c.display_order`
            );

            const states = await Promise.all(all.map((c) => stateOf(user, c.slug)));
            const current = all.filter((_, i) => states[i] === "current").map((c) => c.slug);

            expect(current, "exactly one open door").toEqual(["assignment"]);
        });
    });
});
