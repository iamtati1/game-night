import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import {
    CONCEPT_STANDING_SQL,
    ENCOUNTER_RUNGS_SQL,
    EXERCISE_SQL,
    JUDGE_SQL,
    rungsFromRows,
    type EncounterRung
} from "./encounter.js";

/**
 * Variables, as the vertical slice makes it playable.
 *
 * The slice joined two content systems that could not see each other: the
 * curriculum in Postgres, and the mission movements authored in
 * client/src/games/missions.ts. Migration 030 gave challenges an `activity`
 * column, seed 024 created the four challenge rows, and seed 025 wrote the
 * explanation every Variables question was missing.
 *
 * These assert the JOIN and the progression, not the prose.
 */
describe("the variables slice", () => {
    let fx: CurriculumFixture;
    let user: string;

    const rungsFor = async (concept: string): Promise<EncounterRung[]> =>
        rungsFromRows(await fx.rows(ENCOUNTER_RUNGS_SQL, [user, concept]));

    /** The four (concept, demand) pairs the mission movements declare. */
    const MOVEMENTS = [
        ["initialization", "produce"],
        ["reading-variables", "apply"],
        ["reassignment", "apply"],
        ["variable-state", "produce"]
    ] as const;

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
        user = await fx.insertUser("variables@example.com");
    }, 120000);

    describe("the mission movements are curriculum rungs", () => {
        it("gives each movement a practise challenge at its own rung", async () => {
            for (const [concept, demand] of MOVEMENTS) {
                const rung = (await rungsFor(concept)).find((r) => r.demandSlug === demand);

                expect(rung, `${concept}/${demand} must be declared`).toBeDefined();
                expect(rung!.options, `${concept}/${demand} must be playable`).toHaveLength(1);
                expect(rung!.options[0]!.content.kind).toBe("mission");
            }
        });

        it("stores no identifier for the movement", async () => {
            // The pair IS the address, on both sides. A stored id would be a
            // second, weaker name and the first thing to drift.
            const rows = await fx.rows<{ activity: string }>(
                `SELECT activity FROM challenges WHERE activity IS NOT NULL`
            );

            // Four missions (024), two Variables practices (026), the
            // assignment-operators practice (034), two Control Flow practices
            // (036), three Strings practices (039), three Loops practices
            // (042), three Functions practices (045) and the classes practice
            // (075), which is the code-writing rung of the last topic.
            expect(rows).toHaveLength(32);
            expect(new Set(rows.map((r) => r.activity))).toEqual(new Set(["mission"]));
        });

        it("fills every rung it declares, now that the curriculum is complete", async () => {
            /*
             * THIS TEST HAS INVERTED, and that is the result rather than a
             * weakening. Three examples of a hole were retired here as the
             * curriculum filled in -- `declaration/produce` at seed 026,
             * `let-vs-const/explain` at seed 067, and `this-binding/predict`
             * at seed 075 -- and with the last topic authored there is no
             * fourth: all 281 declared rungs are realised by a question, an
             * incident or a movement.
             *
             * The original claim was "a challenge row nothing can play would
             * be worse than reporting the hole". It still holds; there is
             * simply nothing left to report, so what is asserted is the
             * absence of holes rather than the honesty about one.
             */
            const empty = await fx.rows<{ concept: string; demand: string }>(
                `SELECT c.slug AS concept, d.slug AS demand
                 FROM concept_demands cd
                 JOIN concepts c ON c.id = cd.concept_id
                 JOIN demands d  ON d.id = cd.demand_id
                 WHERE NOT EXISTS (
                     SELECT 1 FROM challenges ch
                     WHERE ch.concept_id = cd.concept_id
                       AND ch.demand_id  = cd.demand_id
                       AND ch.role = 'practise' AND ch.is_active
                       AND (EXISTS (SELECT 1 FROM questions q
                                     WHERE q.challenge_id = ch.id AND q.is_active)
                         OR EXISTS (SELECT 1 FROM bug_hunt_incidents i
                                     WHERE i.challenge_id = ch.id AND i.is_active)
                         OR ch.activity IS NOT NULL))`
            );

            expect(empty.map((r) => `${r.concept}/${r.demand}`)).toEqual([]);

            const rungs = await rungsFor("this-binding");
            const predict = rungs.find((r) => r.demandSlug === "predict");

            expect(predict, "declared").toBeDefined();
            expect(predict!.options, "and now realised, like every other rung")
                .not.toHaveLength(0);
        });

        it("refuses a challenge at a demand the concept does not declare", async () => {
            // The composite FK to concept_demands, still doing its job with the
            // new column present.
            await expect(
                fx.rows(
                    `INSERT INTO challenges (concept_id, demand_id, role, difficulty, activity)
                     SELECT c.id, d.id, 'practise', 1, 'mission'
                     FROM concepts c, demands d
                     WHERE c.slug = 'reassignment' AND d.slug = 'explain'`
                )
            ).rejects.toThrow();
        });

        it("rejects an unknown activity kind", async () => {
            await expect(
                fx.rows(
                    `INSERT INTO challenges (concept_id, demand_id, role, difficulty, activity)
                     SELECT c.id, d.id, 'practise', 1, 'wormhole'
                     FROM concepts c, demands d
                     WHERE c.slug = 'reassignment' AND d.slug = 'predict'`
                )
            ).rejects.toThrow();
        });
    });

    describe("clearing a rung", () => {
        it("clears a mission rung from a recorded completion", async () => {
            await fx.scenario(async () => {
                const before = (await rungsFor("reassignment"))
                    .find((r) => r.demandSlug === "apply")!;

                expect(before.cleared).toBe(false);

                await fx.rows(
                    `INSERT INTO activity_completions (user_id, challenge_id, needed_retry)
                     VALUES ($1, $2, FALSE)`,
                    [user, before.options[0]!.challengeId]
                );

                const after = (await rungsFor("reassignment"))
                    .find((r) => r.demandSlug === "apply")!;

                expect(after.cleared).toBe(true);
            });
        });

        it("leaves the other rungs of the same concept alone", async () => {
            await fx.scenario(async () => {
                const apply = (await rungsFor("reassignment"))
                    .find((r) => r.demandSlug === "apply")!;

                await fx.rows(
                    `INSERT INTO activity_completions (user_id, challenge_id, needed_retry)
                     VALUES ($1, $2, FALSE)`,
                    [user, apply.options[0]!.challengeId]
                );

                const rungs = await rungsFor("reassignment");

                expect(rungs.find((r) => r.demandSlug === "predict")?.cleared).toBe(false);
                expect(rungs.find((r) => r.demandSlug === "diagnose")?.cleared).toBe(false);
            });
        });

        it("records finishing twice as one fact", async () => {
            await fx.scenario(async () => {
                const apply = (await rungsFor("reading-variables"))
                    .find((r) => r.demandSlug === "apply")!;
                const id = apply.options[0]!.challengeId;

                for (const retry of [false, true]) {
                    await fx.rows(
                        `INSERT INTO activity_completions (user_id, challenge_id, needed_retry)
                         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                        [user, id, retry]
                    );
                }

                const [row] = await fx.rows<{ n: number; needed_retry: boolean }>(
                    `SELECT COUNT(*)::INT AS n, BOOL_OR(needed_retry) AS needed_retry
                     FROM activity_completions WHERE user_id = $1 AND challenge_id = $2`,
                    [user, id]
                );

                expect(row?.n).toBe(1);
                // The FIRST result is kept: a later clean run does not erase
                // that the first one took a miss.
                expect(row?.needed_retry).toBe(false);
            });
        });

        it("does not touch concept_demonstrations", async () => {
            await fx.scenario(async () => {
                const apply = (await rungsFor("reassignment"))
                    .find((r) => r.demandSlug === "apply")!;

                await fx.rows(
                    `INSERT INTO activity_completions (user_id, challenge_id, needed_retry)
                     VALUES ($1, $2, FALSE)`,
                    [user, apply.options[0]!.challengeId]
                );

                const [row] = await fx.rows<{ n: number }>(
                    `SELECT COUNT(*)::INT AS n FROM concept_demonstrations WHERE user_id = $1`,
                    [user]
                );

                // Clearing a rung is not completing a concept, and points are
                // counted from that table at POINTS_PER_CONCEPT each.
                expect(row?.n).toBe(0);
            });
        });
    });

    describe("a question rung", () => {
        const predictChallenge = async (concept: string): Promise<string> => {
            const rung = (await rungsFor(concept)).find((r) => r.demandSlug === "predict")!;

            return rung.options[0]!.challengeId;
        };

        it("sends no correctness with the options", async () => {
            const rows = await fx.rows<Record<string, unknown>>(
                EXERCISE_SQL, [await predictChallenge("reassignment"), user]);

            expect(rows.length).toBeGreaterThan(1);

            for (const row of rows) {
                expect(Object.keys(row)).not.toContain("is_correct");
            }
        });

        it("judges an answer and returns the reasoning either way", async () => {
            const challenge = await predictChallenge("reassignment");
            const options = await fx.rows<{ option_id: string }>(EXERCISE_SQL, [challenge, user]);

            const judged = await Promise.all(
                options.map(async (o) => {
                    const [row] = await fx.rows<{
                        is_correct: boolean;
                        explanation: string | null;
                    }>(JUDGE_SQL, [challenge, o.option_id]);

                    return row!;
                })
            );

            expect(judged.filter((j) => j.is_correct)).toHaveLength(1);

            // Seed 025. The explanation rides on the question, so it is returned
            // for a wrong answer exactly as for a right one.
            for (const j of judged) {
                expect(j.explanation, "every verdict carries its reasoning").toBeTruthy();
            }
        });

        it("gives every Variables question an explanation that is not the answer", async () => {
            const rows = await fx.rows<{
                concept: string;
                explanation: string | null;
                correct: string;
            }>(
                `SELECT c.slug AS concept, q.explanation,
                        (SELECT o.option_text FROM question_options o
                         WHERE o.question_id = q.id AND o.is_correct LIMIT 1) AS correct
                 FROM questions q
                 JOIN challenges ch ON ch.id = q.challenge_id
                 JOIN concepts c    ON c.id  = ch.concept_id
                 JOIN topics t      ON t.id  = c.topic_id
                 WHERE t.slug = 'variables' AND q.is_active`
            );

            expect(rows.length).toBeGreaterThan(0);

            for (const row of rows) {
                expect(row.explanation, `${row.concept} has no explanation`).toBeTruthy();
                expect(row.explanation!.length).toBeGreaterThan(20);
                expect(row.explanation!.length).toBeLessThanOrEqual(400);
                expect(
                    row.explanation!.trim().toLowerCase(),
                    "restating the answer teaches nothing the option did not"
                ).not.toBe(row.correct.trim().toLowerCase());
            }
        });
    });

    describe("what the slice may assume the learner knows", () => {
        it("never allows a later concept into an earlier one", async () => {
            for (const [concept] of MOVEMENTS) {
                const [standing] = await fx.rows<{ allowed_concepts: string[] }>(
                    CONCEPT_STANDING_SQL, [user, concept]);

                // Nothing from later topics, whatever the learner has done.
                const later = await fx.rows<{ slug: string }>(
                    `SELECT c.slug FROM concepts c JOIN topics t ON t.id = c.topic_id
                     WHERE t.slug IN ('loops', 'functions', 'arrays', 'objects')`
                );
                const forbidden = new Set(later.map((l) => l.slug));

                for (const allowed of standing!.allowed_concepts) {
                    expect(forbidden.has(allowed), `${allowed} leaked into ${concept}`).toBe(false);
                }
            }
        });
    });

    /**
     * THE WALK. One learner, one concept, from nothing to finished -- the same
     * sequence of server decisions the screen makes, in order.
     *
     * This is not a substitute for playing it, and it is not claimed as one. It
     * checks the progression the UI depends on: that clearing a rung advances
     * the current rung, that the advance lands on the next DECLARED rung rather
     * than skipping one, and that finishing the last one ends the ladder.
     */
    describe("walking reassignment from end to end", () => {
        it("advances one rung at a time and then finishes", async () => {
            await fx.scenario(async () => {
                const walker = await fx.insertUser("walker@example.com");

                const state = async () => {
                    const rungs = rungsFromRows(
                        await fx.rows(ENCOUNTER_RUNGS_SQL, [walker, "reassignment"])
                    );

                    return {
                        rungs,
                        current: rungs.find((r) => !r.cleared && r.options.length > 0) ?? null
                    };
                };

                const start = await state();

                // predict, apply, diagnose -- declared in that order.
                expect(start.rungs.map((r) => r.demandSlug)).toEqual([
                    "predict",
                    "apply",
                    "diagnose"
                ]);
                expect(start.current?.demandSlug).toBe("predict");

                // 1 · predict, answered correctly in Code Blitz.
                const predict = start.current!.options[0]!;

                expect(predict.content.kind).toBe("question");

                if (predict.content.kind === "question") {
                    await fx.encounter(walker, predict.content.id, "answered");
                }

                const afterPredict = await state();

                expect(afterPredict.rungs[0]!.cleared).toBe(true);
                expect(afterPredict.current?.demandSlug, "not skipped to diagnose").toBe("apply");

                // 2 · apply, a mission movement finished in the browser.
                const apply = afterPredict.current!.options[0]!;

                expect(apply.content.kind).toBe("mission");
                await fx.rows(
                    `INSERT INTO activity_completions (user_id, challenge_id, needed_retry)
                     VALUES ($1, $2, TRUE)`,
                    [walker, apply.challengeId]
                );

                const afterApply = await state();

                expect(afterApply.current?.demandSlug).toBe("diagnose");

                // 3 · diagnose, an incident resolved in Bug Hunt.
                const diagnose = afterApply.current!.options[0]!;

                expect(diagnose.content.kind).toBe("incident");

                const [incident] = await fx.rows<{ slug: string }>(
                    `SELECT slug FROM bug_hunt_incidents WHERE id = $1`,
                    [diagnose.content.kind === "incident" ? diagnose.content.id : ""]
                );

                await fx.encounterIncident(walker, incident!.slug, "resolved");

                const finished = await state();

                expect(finished.rungs.every((r) => r.cleared), "every rung cleared").toBe(true);
                expect(finished.current, "the ladder is done").toBeNull();

                // The concept is NOT completed by clearing rungs. That stays the
                // /demonstrate endpoint's decision and the world's meaning.
                const [demos] = await fx.rows<{ n: number }>(
                    `SELECT COUNT(*)::INT AS n FROM concept_demonstrations WHERE user_id = $1`,
                    [walker]
                );

                expect(demos?.n).toBe(0);
            });
        });

        it("does not advance on a failed attempt", async () => {
            await fx.scenario(async () => {
                const stuck = await fx.insertUser("stuck@example.com");
                const rungs = rungsFromRows(
                    await fx.rows(ENCOUNTER_RUNGS_SQL, [stuck, "reassignment"])
                );
                const predict = rungs.find((r) => r.demandSlug === "predict")!;

                if (predict.options[0]!.content.kind === "question") {
                    await fx.encounter(stuck, predict.options[0]!.content.id, "timed_out");
                }

                const after = rungsFromRows(
                    await fx.rows(ENCOUNTER_RUNGS_SQL, [stuck, "reassignment"])
                );

                expect(after.find((r) => r.demandSlug === "predict")?.cleared).toBe(false);
            });
        });
    });

    /**
     * THE FIRST STEP OF THE REMEDIATION LOOP IS "EXPLAIN WHY".
     *
     * A question with no explanation makes that step empty, and the loop starts
     * at the very first concept a learner meets -- console-output had six such
     * questions until seed 031. This covers the whole walkable path rather than
     * one topic, because the loop is only as good as its worst step.
     */
    it("gives every question on the taught path an explanation", async () => {
        const rows = await fx.rows<{
            concept: string;
            prompt: string;
            explanation: string | null;
            correct: string;
        }>(
            `SELECT c.slug AS concept, q.prompt, q.explanation,
                    (SELECT o.option_text FROM question_options o
                     WHERE o.question_id = q.id AND o.is_correct LIMIT 1) AS correct
             FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN topics t      ON t.id  = c.topic_id
             WHERE q.is_active AND ch.role = 'practise'
               AND t.slug IN ('values', 'variables')`
        );

        expect(rows.length).toBeGreaterThan(30);

        const silent = rows.filter((r) => !r.explanation).map((r) => r.concept);

        expect([...new Set(silent)]).toEqual([]);

        for (const row of rows) {
            expect(row.explanation!.length, row.concept).toBeGreaterThan(20);
            expect(
                row.explanation!.trim().toLowerCase(),
                "restating the answer is not an explanation"
            ).not.toBe(row.correct.trim().toLowerCase());
        }
    });
});
