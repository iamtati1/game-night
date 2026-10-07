import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import {
    CLEARED_RUNGS_CTE,
    CONCEPT_HEAD_SQL,
    CONCEPT_STANDING_SQL,
    ENCOUNTER_RUNGS_SQL,
    EXERCISE_SQL,
    splitPrompt,
    isPlayable,
    rungsFromRows,
    type ConceptEncounter,
    type EncounterRung
} from "./encounter.js";

/**
 * The encounter: one concept, its own demands, in order.
 *
 * These assert INVARIANTS wherever they can. A test that hardcodes "booleans has
 * two rungs" has to be edited every time content lands, and an assertion edited
 * that often stops being read. The one deliberate exception is the live coverage
 * gap at the bottom, which exists so that closing it breaks the test and forces
 * the claim to be rewritten.
 */
describe("a concept encounter", () => {
    let fx: CurriculumFixture;
    let user: string;

    const rungsFor = async (concept: string): Promise<EncounterRung[]> =>
        rungsFromRows(await fx.rows(ENCOUNTER_RUNGS_SQL, [user, concept]));

    const declaredDemands = async (concept: string): Promise<string[]> => {
        const rows = await fx.rows<{ slug: string }>(
            `SELECT d.slug FROM concept_demands cd
             JOIN concepts c ON c.id = cd.concept_id
             JOIN demands  d ON d.id = cd.demand_id
             WHERE c.slug = $1
             ORDER BY d.display_order`,
            [concept]
        );

        return rows.map((r) => r.slug);
    };

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
        user = await fx.insertUser("encounter@example.com");
    }, 120000);

    it("names the concept, its topic and its prerequisites", async () => {
        const [head] = await fx.rows<{
            slug: string;
            name: string;
            topic_slug: string;
            prerequisites: string[];
        }>(CONCEPT_HEAD_SQL, [user, "booleans"]);

        expect(head?.slug).toBe("booleans");
        expect(head?.topic_slug).toBe("values");
        expect(head?.prerequisites).toEqual(["primitive-types"]);
        expect(head?.name.length).toBeGreaterThan(0);
    });

    it("returns nothing for a slug the curriculum does not have", async () => {
        expect(await fx.rows(CONCEPT_HEAD_SQL, [user, "monads"])).toHaveLength(0);
    });

    /**
     * The ladder is the concept's own -- not a uniform progression applied to
     * everything. booleans stops at predict; assignment climbs to produce;
     * type-coercion runs predict, diagnose, repair. Nothing is padded, and
     * nothing declared is dropped.
     */
    it("walks exactly the demands the concept declares, in order", async () => {
        for (const concept of ["booleans", "assignment", "equality", "typeof", "type-coercion"]) {
            const declared = await declaredDemands(concept);
            const rungs = await rungsFor(concept);

            expect(rungs.map((r) => r.demandSlug), concept).toEqual(declared);
            expect(rungs.map((r) => r.demandOrder), concept).toEqual(
                [...rungs.map((r) => r.demandOrder)].sort((a, b) => a - b)
            );
        }
    });

    /**
     * The regression that shaped this module. A challenge is ONE exercise, not
     * one rung: booleans holds five challenges and all five are `predict`. A
     * query walking outward from `challenges` collapses to five rungs that are
     * really one, and can never surface a demand that has no exercises at all.
     */
    it("groups many exercises at one rung, rather than one rung each", async () => {
        const rungs = await rungsFor("booleans");
        const predict = rungs.find((r) => r.demandSlug === "predict");

        expect(predict?.options.length, "seed 023 wrote several").toBeGreaterThan(1);
        expect(
            new Set(rungs.map((r) => r.demandSlug)).size,
            "one rung per demand, however many exercises hang off it"
        ).toBe(rungs.length);
    });

    it("never offers an exercise from another concept", async () => {
        for (const concept of ["booleans", "assignment", "equality"]) {
            const rungs = await rungsFor(concept);
            const ids = rungs.flatMap((r) => r.options.map((o) => o.challengeId));

            if (ids.length === 0) continue;

            const owners = await fx.rows<{ slug: string }>(
                `SELECT DISTINCT c.slug FROM challenges ch
                 JOIN concepts c ON c.id = ch.concept_id
                 WHERE ch.id = ANY($1::BIGINT[])`,
                [ids]
            );

            expect(owners.map((o) => o.slug), concept).toEqual([concept]);
        }
    });

    /**
     * A rung is cleared by GETTING SOMETHING RIGHT, not by being shown it.
     * demand.ts derives `met_demands` from the same two tables but counts a
     * timed-out question as met, because that CTE feeds a difficulty ceiling and
     * exposure is the right thing for a ceiling to track. Progress is not.
     */
    it("marks a rung cleared only when the learner got an exercise right", async () => {
        await fx.scenario(async () => {
            const before = await rungsFor("booleans");
            expect(before.every((r) => !r.cleared)).toBe(true);

            const predict = before.find((r) => r.demandSlug === "predict")!;
            const target = predict.options[0]!;

            expect(target.content.kind).toBe("question");
            await fx.encounter(user, target.content.id, "timed_out");

            expect(
                (await rungsFor("booleans")).find((r) => r.demandSlug === "predict")?.cleared,
                "timing out is exposure, not progress"
            ).toBe(false);

            await fx.encounter(user, target.content.id, "answered");

            const after = await rungsFor("booleans");
            expect(after.find((r) => r.demandSlug === "predict")?.cleared).toBe(true);
            expect(
                after.find((r) => r.demandSlug === "recognise")?.cleared,
                "clearing one rung says nothing about another"
            ).toBe(false);
        });
    });

    /**
     * THE REASON THERE IS NO MIGRATION.
     *
     * Widening concept_demonstrations to (user, concept, demand) was the obvious
     * way to hold a ladder, and it would have broken both of its existing
     * readers. These two assertions pin the semantics that made the derived
     * approach the right one instead.
     */
    describe("the progression semantics that ruled out a schema change", () => {
        it("keeps one demonstration row per concept, however many rungs are cleared", async () => {
            await fx.scenario(async () => {
                const rungs = await rungsFor("booleans");

                for (const option of rungs.flatMap((r) => r.options)) {
                    if (option.content.kind === "question") {
                        await fx.encounter(user, option.content.id, "answered");
                    }
                }

                await fx.rows(
                    `INSERT INTO concept_demonstrations (user_id, concept_id, needed_retry)
                     SELECT $1, id, FALSE FROM concepts WHERE slug = 'booleans'
                     ON CONFLICT DO NOTHING`,
                    [user]
                );

                const [count] = await fx.rows<{ n: number }>(
                    `SELECT COUNT(*)::INT AS n FROM concept_demonstrations
                     WHERE user_id = $1
                       AND concept_id = (SELECT id FROM concepts WHERE slug = 'booleans')`,
                    [user]
                );

                // findLearnerPoints counts these rows at POINTS_PER_CONCEPT each.
                // More than one here is a silent points change.
                expect(count?.n).toBe(1);
            });
        });

        it("lists each concept exactly once in the world path", async () => {
            // findJourneyPath reads `pool`, not the fixture, so it cannot be
            // called here. The invariant it depends on is asserted directly:
            // its LEFT JOIN yields one row per concept only while the table
            // holds at most one row per (user, concept).
            const [dupes] = await fx.rows<{ n: number }>(
                `SELECT COUNT(*)::INT AS n FROM (
                     SELECT user_id, concept_id FROM concept_demonstrations
                     GROUP BY user_id, concept_id HAVING COUNT(*) > 1
                 ) AS d`
            );

            expect(dupes?.n, "a fan-out here duplicates concepts in the world").toBe(0);
        });
    });

    it("reports the concept-level demonstration separately from the rungs", async () => {
        await fx.scenario(async () => {
            const [before] = await fx.rows<{ demonstrated: boolean }>(
                CONCEPT_HEAD_SQL, [user, "booleans"]);
            expect(before?.demonstrated).toBe(false);

            await fx.rows(
                `INSERT INTO concept_demonstrations (user_id, concept_id, needed_retry)
                 SELECT $1, id, FALSE FROM concepts WHERE slug = 'booleans'`,
                [user]
            );

            const [after] = await fx.rows<{ demonstrated: boolean }>(
                CONCEPT_HEAD_SQL, [user, "booleans"]);

            // A lesson records this without clearing a single rung. Meeting a
            // concept and being able to do something with it are different facts.
            expect(after?.demonstrated).toBe(true);
            expect((await rungsFor("booleans")).every((r) => !r.cleared)).toBe(true);
        });
    });

    it("declares the cleared CTE with the user placeholder it reads", () => {
        expect(CLEARED_RUNGS_CTE).toContain("$1");
        expect(CLEARED_RUNGS_CTE, "exposure is not success").toContain("sq.is_correct");
        expect(CLEARED_RUNGS_CTE).toContain("'resolved'");
    });

    it("treats a rung with no exercises as unplayable", () => {
        const encounter = (rungs: EncounterRung[]): ConceptEncounter => ({
            conceptSlug: "x", name: "X", objective: "o", meaning: "m",
            topicSlug: "t", prerequisites: [], demonstrated: false, rungs
        });
        const full: EncounterRung = {
            demandSlug: "predict", demandOrder: 3, cleared: false,
            options: [{ challengeId: "1", difficulty: 1, content: { kind: "question", id: "9" } }]
        };
        const empty: EncounterRung = {
            demandSlug: "recognise", demandOrder: 2, cleared: false, options: []
        };

        expect(isPlayable(encounter([full]))).toBe(true);
        expect(isPlayable(encounter([empty, full]))).toBe(false);
        expect(isPlayable(encounter([])), "a concept declaring nothing is not an arc").toBe(false);
    });

    /**
     * A HOLE IS REPORTED, NOT SWALLOWED.
     *
     * This asserted that booleans/recognise was an EMPTY rung, with a note
     * saying the failure would be the point once it was filled. Seed 032 filled
     * it, so the claim is now the other half of the same rule: a declared rung
     * appears whether or not anything is built for it, and booleans has both of
     * its rungs realised.
     *
     * The empty-rung behaviour itself is still asserted -- against
     * `this-binding`, in a topic that has not been built yet. It used to be
     * `let-vs-const/explain`, which was the last gap in the first thirteen
     * topics until seed 067 closed it.
     */
    it("reports every declared rung, built or not", async () => {
        const booleans = await rungsFor("booleans");

        expect(booleans.map((r) => r.demandSlug)).toEqual(["recognise", "predict"]);

        for (const rung of booleans) {
            expect(rung.options.length, `booleans/${rung.demandSlug}`).toBeGreaterThan(0);
        }

        /*
         * `this-binding/predict` STOOD HERE AS THE UNBUILT EXAMPLE and is now
         * built, which was the last one. What the test is really about -- that
         * a rung appears because it is DECLARED, not because something fills
         * it -- cannot be shown by example any more, so it is shown by
         * construction instead: every demand concept_demands declares for the
         * concept comes back, in order.
         */
        const bound = await rungsFor("this-binding");

        expect(bound.map((r) => r.demandSlug)).toEqual([
            "predict",
            "diagnose",
            "repair",
            "explain"
        ]);
    });
    /**
     * The standing around a concept: what blocks it, what it may assume, what
     * follows. Decided here so React never has to.
     */
    describe("where the concept sits in the path", () => {
        interface Standing {
            unmet_prerequisites: string[];
            allowed_concepts: string[];
            next_slug: string | null;
            next_name: string | null;
        }

        const standingFor = async (concept: string): Promise<Standing> => {
            const [row] = await fx.rows<Standing>(CONCEPT_STANDING_SQL, [user, concept]);

            return row!;
        };

        it("reports an unmet prerequisite as what blocks the concept", async () => {
            const blocked = await standingFor("booleans");

            expect(blocked.unmet_prerequisites).toEqual(["primitive-types"]);
        });

        it("clears the prerequisite once it has been demonstrated", async () => {
            await fx.scenario(async () => {
                await fx.rows(
                    `INSERT INTO concept_demonstrations (user_id, concept_id, needed_retry)
                     SELECT $1, id, FALSE FROM concepts WHERE slug = 'primitive-types'`,
                    [user]
                );

                expect((await standingFor("booleans")).unmet_prerequisites).toEqual([]);
            });
        });

        it("names the next concept in curriculum order", async () => {
            const standing = await standingFor("booleans");

            // Values #4 -> #5. Read from the ordering, not hardcoded anywhere.
            const [expected] = await fx.rows<{ slug: string }>(
                `SELECT c.slug FROM concepts c
                 JOIN topics t ON t.id = c.topic_id
                 WHERE (t.display_order, c.display_order) > (
                     SELECT t2.display_order, c2.display_order
                     FROM concepts c2 JOIN topics t2 ON t2.id = c2.topic_id
                     WHERE c2.slug = 'booleans'
                 )
                 ORDER BY t.display_order, c.display_order LIMIT 1`
            );

            expect(standing.next_slug).toBe(expected?.slug);
            expect(standing.next_name).toBeTruthy();
        });

        it("returns no next concept for the last one in the curriculum", async () => {
            const [last] = await fx.rows<{ slug: string }>(
                `SELECT c.slug FROM concepts c
                 JOIN topics t ON t.id = c.topic_id
                 ORDER BY t.display_order DESC, c.display_order DESC LIMIT 1`
            );

            expect((await standingFor(last!.slug)).next_slug).toBeNull();
        });

        /**
         * The boundary an exercise may assume. A learner at booleans has not
         * been taught arrays, so an array cannot be inside it -- and a concept
         * they HAVE passed but which comes later must not be either.
         */
        it("allows only earlier concepts the learner has demonstrated", async () => {
            await fx.scenario(async () => {
                await fx.rows(
                    `INSERT INTO concept_demonstrations (user_id, concept_id, needed_retry)
                     SELECT $1, id, FALSE FROM concepts
                     WHERE slug IN ('console-output', 'primitive-types', 'equality')`,
                    [user]
                );

                const allowed = (await standingFor("booleans")).allowed_concepts;

                expect(allowed).toContain("console-output");
                expect(allowed).toContain("primitive-types");
                expect(allowed, "equality is later in the path, demonstrated or not")
                    .not.toContain("equality");
                expect(allowed, "the concept itself is added by findEncounterView")
                    .not.toContain("booleans");
            });
        });

        it("allows nothing at the very first concept", async () => {
            const [first] = await fx.rows<{ slug: string }>(
                `SELECT c.slug FROM concepts c
                 JOIN topics t ON t.id = c.topic_id
                 ORDER BY t.display_order, c.display_order LIMIT 1`
            );

            expect((await standingFor(first!.slug)).allowed_concepts).toEqual([]);
        });
    });
});

/**
 * The defect the Scope walk found.
 *
 * Every seed writes the correct option first, so served in display order the
 * entire curriculum answers to "press the top button". Evidence that can be
 * produced without reading the question is not evidence.
 */
describe("exercise options are not in a guessable order", () => {
    let fx: CurriculumFixture;

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
    }, 120000);

    it("does not put the correct option first for every learner", async () => {
        const rows = await fx.rows<{ challenge: string; correct: string }>(
            `SELECT ch.id AS challenge,
                    (SELECT o.id::TEXT FROM question_options o
                     WHERE o.question_id = q.id AND o.is_correct AND o.is_active LIMIT 1) AS correct
             FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN topics t      ON t.id  = c.topic_id
             WHERE q.is_active AND ch.role = 'practise' AND ch.is_active
               AND t.slug IN ('values', 'variables', 'operators', 'control-flow',
                              'strings', 'loops', 'functions', 'scope')
               AND (SELECT COUNT(*) FROM question_options o
                    WHERE o.question_id = q.id AND o.is_active) > 2`
        );

        expect(rows.length, "there are curriculum questions to check").toBeGreaterThan(50);

        const learner = "7";
        let first = 0;

        for (const row of rows) {
            const served = await fx.rows<{ option_id: string }>(EXERCISE_SQL, [
                row.challenge,
                learner
            ]);

            if (String(served[0]?.option_id) === row.correct) first += 1;
        }

        /*
         * A share, not zero -- with three or four options the right answer
         * lands first about a quarter of the time by chance, and demanding
         * otherwise would be demanding a biased shuffle. Before the fix this
         * was every single question.
         */
        expect(first / rows.length, `${first} of ${rows.length} served correct-first`)
            .toBeLessThan(0.5);
    });

    it("shows one learner the same order twice", async () => {
        const [row] = await fx.rows<{ challenge: string }>(
            `SELECT ch.id AS challenge FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             WHERE q.is_active AND ch.role = 'practise' LIMIT 1`
        );
        const once = await fx.rows<{ option_id: string }>(EXERCISE_SQL, [row!.challenge, "7"]);
        const again = await fx.rows<{ option_id: string }>(EXERCISE_SQL, [row!.challenge, "7"]);

        expect(once.map((r) => String(r.option_id))).toEqual(
            again.map((r) => String(r.option_id))
        );
    });
});

/**
 * The shape every curriculum prompt is written in.
 *
 * `splitPrompt` documents it -- a line of prose, a blank line, then the
 * snippet -- and splits on exactly that. Every `repair` question was authored
 * the other way round, so the encounter rendered the CODE as the question and
 * the QUESTION inside the code box, on all ten of them across nine topics.
 *
 * Found by playing a repair rung in a browser, not by any test, which is the
 * reason this one exists.
 */
describe("a prompt with a snippet puts the question first", () => {
    let fx: CurriculumFixture;

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
    }, 120000);

    it("never puts the code above the question", async () => {
        const rows = await fx.rows<{ concept: string; demand: string; prompt: string }>(
            `SELECT c.slug AS concept, d.slug AS demand, q.prompt
             FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN demands d     ON d.id  = ch.demand_id
             WHERE q.is_active AND ch.role = 'practise' AND q.prompt LIKE '%' || chr(10) || chr(10) || '%'`
        );

        expect(rows.length, "there are two-part prompts to check").toBeGreaterThan(20);

        const wrong: string[] = [];

        for (const row of rows) {
            const { ask, code } = splitPrompt(row.prompt);
            const where = `${row.concept}/${row.demand}`;

            // The half shown as prose has to be the one that asks.
            if (!ask.includes("?")) wrong.push(`${where}: code first`);

            // And the half shown in the code box must not be asking --
            // "Which line is the cause?" rendered in monospace, under the
            // snippet, on every diagnose question until this was found.
            if (code?.trimEnd().endsWith("?")) wrong.push(`${where}: question in the code box`);
        }

        expect(wrong).toEqual([]);
    });
});

/**
 * THE ANSWER MUST NOT BE GUESSABLE FROM ITS SHAPE.
 *
 * Found by measuring, not by reading: 31 of 32 `explain` rungs could be
 * cleared by picking the longest option without reading the question at all.
 * A learner could demonstrate `explain` across the whole curriculum on shape.
 *
 * The cause was this codebase's own standard. Every topic's contract test
 * asserts an explain answer is longer than 25 characters -- "a mechanism takes
 * a clause, not a word" -- and the distractors were written as short
 * dismissals, so the rule that was meant to raise quality became a tell.
 *
 * The fix is better distractors, not shorter answers: a wrong option should be
 * a full, plausible account of the mechanism that happens to be wrong. This
 * asserts the outcome rather than the method, so it stays true however the
 * content is written.
 */
describe("the correct option cannot be picked by length alone", () => {
    let fx: CurriculumFixture;

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
    }, 120000);

    it("does not let the longest option be the answer most of the time", async () => {
        const rows = await fx.rows<{ demand: string; correct: string; options: string[] }>(
            `SELECT d.slug AS demand,
                    (SELECT o.option_text FROM question_options o
                     WHERE o.question_id = q.id AND o.is_correct AND o.is_active LIMIT 1) AS correct,
                    ARRAY(SELECT o.option_text FROM question_options o
                          WHERE o.question_id = q.id AND o.is_active) AS options
             FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN demands d     ON d.id  = ch.demand_id
             WHERE q.is_active AND ch.role = 'practise'
               AND q.source LIKE 'jolt-%'`
        );

        expect(rows.length, "there is authored content to measure").toBeGreaterThan(100);

        const byDemand = new Map<string, { longest: number; total: number }>();

        for (const row of rows) {
            if (!row.correct || row.options.length < 2) continue;

            const tally = byDemand.get(row.demand) ?? { longest: 0, total: 0 };
            const max = Math.max(...row.options.map((o) => o.length));

            tally.total += 1;

            if (row.correct.length === max) tally.longest += 1;

            byDemand.set(row.demand, tally);
        }

        /*
         * A share, not zero. With three or four options the right answer is
         * the longest about a quarter to a third of the time by chance, and
         * demanding otherwise would be demanding a rigged shuffle. Half is
         * comfortably above chance and well below a tell.
         */
        const tells: string[] = [];

        for (const [demand, { longest, total }] of byDemand) {
            if (total >= 8 && longest / total > 0.5) {
                tells.push(`${demand}: ${longest}/${total} answered by picking the longest`);
            }
        }

        expect(tells).toEqual([]);
    });
});
