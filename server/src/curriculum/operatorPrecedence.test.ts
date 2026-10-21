import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { ENCOUNTER_RUNGS_SQL, rungsFromRows } from "./encounter.js";

/**
 * OPERATOR PRECEDENCE, THE CONCEPT THAT WAS BEING TESTED WITHOUT BEING TAUGHT.
 *
 * arithmetic-operators teaches one operation at a time -- 2 + 3, 10 - 4, 3 * 2,
 * 8 / 2 -- and its lesson says nothing about which operator runs first. Four of
 * the questions anchored to it asked exactly that:
 *
 *     2 + 3 * 4      multiplication before addition
 *     (2 + 3) * 4    brackets first
 *     6 / 2 * 3      equal rank, left to right
 *     5 + 5 - 4      equal rank, left to right
 *
 * A learner who walked the lesson in front of them had been shown nothing that
 * answers any of them. The fix was a concept, not a rewrite: the questions were
 * already correct and already carried their explanations, so they moved to a
 * concept whose lesson teaches the rule they depend on.
 *
 * These tests hold the four properties that make that true, each of which can
 * regress on its own and none of which the generic topic tests can see:
 *
 *     PLACEMENT   the five questions are HERE and not back there
 *     DEMANDS     what the concept declares is what it can actually offer
 *     LESSON      the lesson teaches the rule those questions require
 *     ORDERING    the concept is reachable before anything that assumes it
 */
describe("the operator-precedence concept", () => {
    let fx: CurriculumFixture;
    let user: string;

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
        user = await fx.insertUser("precedence@example.com");
    }, 120000);

    /** The expressions whose answer IS the precedence rule. */
    const PRECEDENCE = ["2 + 3 * 4", "(2 + 3) * 4", "6 / 2 * 3", "5 + 5 - 4"] as const;

    const questionsOn = async (concept: string) =>
        fx.rows<{ prompt: string; demand: string }>(
            `SELECT q.prompt, d.slug AS demand
             FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN demands  d    ON d.id  = ch.demand_id
             WHERE c.slug = $1 AND q.is_active`,
            [concept]
        );

    describe("question placement", () => {
        it("holds every multi-operator expression that arithmetic-operators never taught", async () => {
            // Filtered to predict first: the explain prompt quotes 2 + 3 * 4
            // too, and matching it here would hide a missing prediction.
            const here = (await questionsOn("operator-precedence")).filter(
                (q) => q.demand === "predict"
            );

            for (const expression of PRECEDENCE) {
                expect(
                    here.find((q) => q.prompt.includes(expression)),
                    `${expression} is not a prediction on operator-precedence`
                ).toBeTruthy();
            }
        });

        it("leaves none of them behind on arithmetic-operators", async () => {
            const there = await questionsOn("arithmetic-operators");

            for (const expression of PRECEDENCE) {
                expect(
                    there.find((q) => q.prompt.includes(expression))?.prompt ?? null,
                    `${expression} is still on arithmetic-operators`
                ).toBeNull();
            }
        });

        it("brings the question that states the rule, not just the ones that use it", async () => {
            // "Why does console.log(2 + 3 * 4) display 14?" asks for the
            // mechanism rather than the outcome, which is the whole of what
            // this concept teaches. It travelled with the four predictions.
            const explain = (await questionsOn("operator-precedence")).filter(
                (q) => q.demand === "explain"
            );

            expect(explain).toHaveLength(1);
            expect(explain[0]!.prompt).toContain("2 + 3 * 4");
            expect(explain[0]!.prompt.toLowerCase()).toContain("why");
        });

        it("takes arithmetic-operators' explain rung with it, leaving none declared", async () => {
            // That rung had exactly one candidate and it was a precedence
            // question. A concept that teaches one operation at a time has no
            // mechanism of its own to explain, so the rung is gone rather than
            // left empty -- which operatorsTopic.test.ts would fail on.
            const declared = await fx.rows<{ demand: string }>(
                `SELECT d.slug AS demand
                 FROM concept_demands cd
                 JOIN concepts c ON c.id = cd.concept_id
                 JOIN demands  d ON d.id = cd.demand_id
                 WHERE c.slug = 'arithmetic-operators'`
            );

            expect(declared.map((r) => r.demand)).not.toContain("explain");
        });

        it("does not hollow out the concept it took them from", async () => {
            // Moving questions out can empty a rung as easily as adding a
            // concept can, and an empty rung is a learner who cannot finish.
            const rungs = rungsFromRows(
                await fx.rows(ENCOUNTER_RUNGS_SQL, [user, "arithmetic-operators"])
            );

            expect(rungs.length).toBeGreaterThan(0);

            for (const rung of rungs) {
                expect(rung.options.length, `arithmetic-operators/${rung.demandSlug}`)
                    .toBeGreaterThan(0);
            }
        });
    });

    describe("declared demands", () => {
        it("declares exactly what it has questions for", async () => {
            // predict reads an expression; explain states the rule that made it
            // come out that way. Both arrived with questions that already
            // existed, so neither rung is a promise waiting on content.
            const declared = await fx.rows<{ demand: string }>(
                `SELECT d.slug AS demand
                 FROM concept_demands cd
                 JOIN concepts c ON c.id = cd.concept_id
                 JOIN demands  d ON d.id = cd.demand_id
                 WHERE c.slug = 'operator-precedence'
                 ORDER BY d.display_order`
            );

            expect(declared.map((r) => r.demand)).toEqual(["predict", "explain"]);
        });

        it("can actually offer every rung it declares", async () => {
            const rungs = rungsFromRows(
                await fx.rows(ENCOUNTER_RUNGS_SQL, [user, "operator-precedence"])
            );

            expect(rungs).toHaveLength(2);

            for (const rung of rungs) {
                expect(rung.options.length, rung.demandSlug).toBeGreaterThan(0);
            }
        });
    });

    describe("lesson alignment", () => {
        // Read rather than imported, for the reason learningPath.test.ts gives:
        // the server does not build the client, and the point is to check what
        // was actually written down.
        const lessons = readFileSync(
            new URL("../../../client/src/games/lessons.ts", import.meta.url),
            "utf8"
        );
        const lesson = (() => {
            const start = lessons.indexOf(`concept: "operator-precedence"`);
            const next = lessons.indexOf("concept: ", start + 1);

            return start < 0 ? "" : lessons.slice(start, next < 0 ? undefined : next);
        })();

        it("is authored at all", () => {
            expect(lesson.length, "no operator-precedence lesson found").toBeGreaterThan(0);
        });

        it("teaches the rule its questions turn on, before asking", () => {
            const teaching = lesson.slice(0, lesson.indexOf("steps:"));

            // The three things a learner needs to answer all four questions:
            // rank, brackets, and what happens when rank ties.
            expect(teaching).toMatch(/\*|multiplication/i);
            expect(teaching).toMatch(/bracket|parenthes/i);
            expect(teaching).toMatch(/left to right/i);
        });

        it("works the same expressions the questions ask about", () => {
            // Not a coincidence worth leaving to chance: the lesson is the
            // reason the questions are answerable.
            expect(lesson).toContain("2 + 3 * 4");
            expect(lesson).toContain("(2 + 3) * 4");
        });
    });

    describe("progression ordering", () => {
        const positions = async () =>
            new Map(
                (
                    await fx.rows<{ slug: string; pos: number }>(
                        `SELECT c.slug, t.display_order * 100 + c.display_order AS pos
                         FROM concepts c JOIN topics t ON t.id = c.topic_id`
                    )
                ).map((r) => [r.slug, Number(r.pos)])
            );

        it("comes after the arithmetic it is built on", async () => {
            const pos = await positions();

            expect(pos.get("operator-precedence")!)
                .toBeGreaterThan(pos.get("arithmetic-operators")!);
        });

        it("comes before the conditions that quietly rely on it", async () => {
            // `a > 1 && b < 3` is a precedence question wearing a different
            // operator. Teaching precedence after it would be teaching the rule
            // after the exam again, one concept further along.
            const pos = await positions();

            expect(pos.get("operator-precedence")!).toBeLessThan(pos.get("logical-operators")!);
        });

        it("names arithmetic-operators as its prerequisite", async () => {
            const rows = await fx.rows<{ requires: string }>(
                `SELECT r.slug AS requires
                 FROM prerequisites p
                 JOIN concepts c ON c.id = p.concept_id
                 JOIN concepts r ON r.id = p.requires_id
                 WHERE c.slug = 'operator-precedence'`
            );

            expect(rows.map((r) => r.requires)).toEqual(["arithmetic-operators"]);
        });
    });
});
