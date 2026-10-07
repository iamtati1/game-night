import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { ENCOUNTER_RUNGS_SQL, rungsFromRows } from "./encounter.js";

/**
 * Values, end to end.
 *
 * The first topic a learner walks, and the first one that can be finished
 * without a single database grant. It is the template the rest of the
 * curriculum is meant to follow, so what is asserted here is the CONTRACT --
 * every declared rung playable, nothing reaching forward, every question able
 * to explain itself -- rather than the particular questions that satisfy it.
 */
describe("the Values topic", () => {
    let fx: CurriculumFixture;
    let user: string;

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
        user = await fx.insertUser("values-topic@example.com");
    }, 120000);

    const conceptsInOrder = async (): Promise<string[]> =>
        (
            await fx.rows<{ slug: string }>(
                `SELECT c.slug FROM concepts c JOIN topics t ON t.id = c.topic_id
                 WHERE t.slug = 'values' ORDER BY c.display_order`
            )
        ).map((r) => r.slug);

    it("has a playable activity at every declared rung", async () => {
        const holes: string[] = [];

        for (const concept of await conceptsInOrder()) {
            const rungs = rungsFromRows(await fx.rows(ENCOUNTER_RUNGS_SQL, [user, concept]));

            expect(rungs.length, `${concept} declares nothing`).toBeGreaterThan(0);

            for (const rung of rungs) {
                if (rung.options.length === 0) holes.push(`${concept}/${rung.demandSlug}`);
            }
        }

        // The wall this topic used to end at. Every rung it declares can now be
        // played, which is what makes the topic finishable without a grant.
        expect(holes).toEqual([]);
    });

    it("covers recall and explain with ordinary questions", async () => {
        // Reported once as having "no renderer anywhere", which was wrong --
        // findExercise is demand-agnostic and a question needs no snippet. What
        // they lacked was content, and a recall question deliberately has none:
        // "with no instance in front of you" is the demand's own definition.
        const rows = await fx.rows<{ concept: string; demand: string; prompt: string }>(
            `SELECT c.slug AS concept, d.slug AS demand, q.prompt
             FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN topics t      ON t.id  = c.topic_id
             JOIN demands d     ON d.id  = ch.demand_id
             WHERE t.slug = 'values' AND d.slug IN ('recall', 'explain') AND q.is_active`
        );

        expect(rows.map((r) => r.demand).sort()).toContain("recall");
        expect(rows.map((r) => r.demand).sort()).toContain("explain");

        const recall = rows.find((r) => r.demand === "recall")!;

        expect(recall.prompt, "recall shows no code to read").not.toContain("console.log");
    });

    it("never uses a construct the learner has not reached", async () => {
        const rows = await fx.rows<{ concept: string; pos: number; prompt: string }>(
            `SELECT c.slug AS concept,
                    t.display_order * 100 + c.display_order AS pos,
                    q.prompt
             FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN topics t      ON t.id  = c.topic_id
             WHERE t.slug = 'values' AND q.is_active AND ch.role = 'practise'`
        );
        const positions = new Map(
            (
                await fx.rows<{ slug: string; pos: number }>(
                    `SELECT c.slug, t.display_order * 100 + c.display_order AS pos
                     FROM concepts c JOIN topics t ON t.id = c.topic_id`
                )
            ).map((r) => [r.slug, r.pos])
        );

        const owns: [RegExp, string][] = [
            [/\blet\b|\bconst\b/, "declaration"],
            [/[<>]=?/, "comparison-operators"],
            [/"[^"]*"\s*\+|\+\s*"/, "string-concatenation"],
            [/\bfunction\b|=>/, "function-declaration"]
        ];
        const offences: string[] = [];

        for (const row of rows) {
            for (const [pattern, owner] of owns) {
                const at = positions.get(owner);

                if (at !== undefined && at > row.pos && pattern.test(row.prompt)) {
                    offences.push(`${row.concept} needs ${owner}`);
                }
            }
        }

        expect([...new Set(offences)]).toEqual([]);
    });

    it("can explain itself wherever a learner is wrong", async () => {
        const silent = await fx.rows<{ concept: string }>(
            `SELECT DISTINCT c.slug AS concept
             FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN topics t      ON t.id  = c.topic_id
             WHERE t.slug = 'values' AND q.is_active AND q.explanation IS NULL`
        );

        expect(silent.map((r) => r.concept)).toEqual([]);
    });
});

/**
 * The topic checkpoint.
 *
 * It sits between the last concept of one topic and the first of the next, and
 * recording it used to require nothing at all -- a learner who had done nothing
 * could post it and open the next topic, going around every concept-level gate.
 */
describe("the checkpoint gate", () => {
    let fx: CurriculumFixture;

    const outstandingFor = async (user: string): Promise<string[]> =>
        (
            await fx.rows<{ slug: string }>(
                `SELECT c.slug FROM concepts c JOIN topics t ON t.id = c.topic_id
                 WHERE t.slug = 'values'
                   AND NOT EXISTS (
                       SELECT 1 FROM concept_demonstrations d
                       WHERE d.user_id = $1 AND d.concept_id = c.id
                   )
                 ORDER BY c.display_order`,
                [user]
            )
        ).map((r) => r.slug);

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
    }, 120000);

    it("is not ready for a learner who has done nothing", async () => {
        const learner = await fx.insertUser("gate-nothing@example.com");

        expect((await outstandingFor(learner)).length).toBe(8);
    });

    it("is ready only once every concept in the topic is demonstrated", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("gate-done@example.com");

            await fx.rows(
                `INSERT INTO concept_demonstrations (user_id, concept_id, needed_retry)
                 SELECT $1, c.id, FALSE FROM concepts c JOIN topics t ON t.id = c.topic_id
                 WHERE t.slug = 'values' ON CONFLICT DO NOTHING`,
                [learner]
            );

            expect(await outstandingFor(learner)).toEqual([]);
        });
    });

    it("is not ready while one concept is still outstanding", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("gate-almost@example.com");

            await fx.rows(
                `INSERT INTO concept_demonstrations (user_id, concept_id, needed_retry)
                 SELECT $1, c.id, FALSE FROM concepts c JOIN topics t ON t.id = c.topic_id
                 WHERE t.slug = 'values' AND c.slug <> 'null-vs-undefined'
                 ON CONFLICT DO NOTHING`,
                [learner]
            );

            expect(await outstandingFor(learner)).toEqual(["null-vs-undefined"]);
        });
    });
});

/**
 * The rules §17 asks to protect that the other files do not already cover:
 * that a declared demand corresponds to a real mechanic, that demonstration
 * requires evidence, and that finishing Values is what opens Variables.
 */
describe("the Values contract", () => {
    let fx: CurriculumFixture;

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
    }, 120000);

    /**
     * A DECLARED DEMAND MUST CORRESPOND TO A MECHANIC.
     *
     * `recall` and `explain` were once described as having no renderer. They do
     * -- findExercise is demand-agnostic and a question needs no snippet -- so
     * the rule to hold is the one that actually matters: nothing in Values may
     * declare a demand that no activity can realise.
     */
    it("declares no demand in Values that nothing can realise", async () => {
        const unsupported = await fx.rows<{ concept: string; demand: string }>(
            `SELECT c.slug AS concept, d.slug AS demand
             FROM concept_demands cd
             JOIN concepts c ON c.id = cd.concept_id
             JOIN topics   t ON t.id = c.topic_id
             JOIN demands  d ON d.id = cd.demand_id
             WHERE t.slug = 'values'
               AND NOT EXISTS (
                   SELECT 1 FROM challenges ch
                   LEFT JOIN questions q            ON q.challenge_id = ch.id AND q.is_active
                   LEFT JOIN bug_hunt_incidents i   ON i.challenge_id = ch.id AND i.is_active
                   WHERE ch.concept_id = cd.concept_id
                     AND ch.demand_id  = cd.demand_id
                     AND ch.role = 'practise' AND ch.is_active
                     AND (q.id IS NOT NULL OR i.id IS NOT NULL OR ch.activity IS NOT NULL)
               )`
        );

        expect(unsupported.map((u) => `${u.concept}/${u.demand}`)).toEqual([]);
    });

    it("keeps a recall question free of code to read", async () => {
        // "Retrieve what something does from memory, with no instance in front
        // of you" -- the demand's own definition. A recall question showing the
        // code is a prediction question wearing the wrong label.
        const rows = await fx.rows<{ prompt: string }>(
            `SELECT q.prompt FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN topics t      ON t.id  = c.topic_id
             JOIN demands d     ON d.id  = ch.demand_id
             WHERE t.slug = 'values' AND d.slug = 'recall' AND q.is_active`
        );

        expect(rows.length).toBeGreaterThan(0);

        for (const row of rows) {
            expect(row.prompt).not.toContain("console.log");
        }
    });

    /**
     * FINISHING VALUES IS WHAT OPENS VARIABLES -- not reading it, and not the
     * concepts alone. The checkpoint sits between the two.
     */
    it("opens Variables only after every Values concept AND the checkpoint", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("contract@example.com");

            const firstOfVariables = async (): Promise<boolean> => {
                const [row] = await fx.rows<{ blocked: boolean }>(
                    `SELECT EXISTS (
                         SELECT 1
                         FROM concepts c2 JOIN topics t2 ON t2.id = c2.topic_id
                         WHERE (t2.display_order, c2.display_order) <
                               ((SELECT t.display_order FROM concepts c
                                 JOIN topics t ON t.id = c.topic_id
                                 WHERE c.slug = 'variables-name-values'),
                                (SELECT c.display_order FROM concepts c
                                 WHERE c.slug = 'variables-name-values'))
                           AND NOT EXISTS (
                               SELECT 1 FROM concept_demonstrations d
                               WHERE d.user_id = $1 AND d.concept_id = c2.id)
                     ) OR EXISTS (
                         SELECT 1 FROM topics t3
                         WHERE t3.slug = 'values'
                           AND NOT EXISTS (
                               SELECT 1 FROM topic_challenge_completions tc
                               WHERE tc.user_id = $1 AND tc.topic_id = t3.id)
                     ) AS blocked`,
                    [learner]
                );

                return !row!.blocked;
            };

            expect(await firstOfVariables(), "nothing done yet").toBe(false);

            await fx.rows(
                `INSERT INTO concept_demonstrations (user_id, concept_id, needed_retry)
                 SELECT $1, c.id, FALSE FROM concepts c JOIN topics t ON t.id = c.topic_id
                 WHERE t.slug = 'values' ON CONFLICT DO NOTHING`,
                [learner]
            );

            expect(await firstOfVariables(), "concepts done, checkpoint not").toBe(false);

            await fx.rows(
                `INSERT INTO topic_challenge_completions (user_id, topic_id, needed_retry)
                 SELECT $1, id, FALSE FROM topics WHERE slug = 'values'`,
                [learner]
            );

            expect(await firstOfVariables(), "checkpoint passed").toBe(true);
        });
    });

    /**
     * Demonstration requires evidence at every PLAYABLE rung. Rungs with
     * nothing built are not counted -- holding a learner responsible for an
     * exercise nobody wrote would turn a content gap into a punishment.
     */
    it("counts only playable rungs toward demonstration", async () => {
        const rows = await fx.rows<{ concept: string; playable: number; declared: number }>(
            `SELECT c.slug AS concept,
                    COUNT(*) FILTER (WHERE EXISTS (
                        SELECT 1 FROM challenges ch
                        LEFT JOIN questions q          ON q.challenge_id = ch.id AND q.is_active
                        LEFT JOIN bug_hunt_incidents i ON i.challenge_id = ch.id AND i.is_active
                        WHERE ch.concept_id = cd.concept_id AND ch.demand_id = cd.demand_id
                          AND ch.role = 'practise' AND ch.is_active
                          AND (q.id IS NOT NULL OR i.id IS NOT NULL OR ch.activity IS NOT NULL)
                    ))::INT AS playable,
                    COUNT(*)::INT AS declared
             FROM concept_demands cd
             JOIN concepts c ON c.id = cd.concept_id
             JOIN topics t   ON t.id = c.topic_id
             WHERE t.slug = 'values'
             GROUP BY c.slug, c.display_order
             ORDER BY c.display_order`
        );

        expect(rows).toHaveLength(8);

        // In Values the two are equal: nothing is declared that cannot be
        // played, which is what makes the topic finishable.
        for (const row of rows) {
            expect(row.playable, row.concept).toBe(row.declared);
        }
    });
});
