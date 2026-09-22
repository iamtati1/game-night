import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { curriculumEligible, metConceptsCte } from "./eligibility.js";
import { ELIGIBLE_QUESTION_PREDICATE } from "../questions/queries.js";
import { ELIGIBLE_INCIDENT_PREDICATE } from "../bugHunt/queries.js";
import { QUESTIONS_PER_SESSION } from "../game/scoring.js";

/**
 * Curriculum eligibility, executed rather than inspected.
 *
 * Every other SQL-shaped test in this repository is source-level: it reads a
 * query and asserts its shape, which is the right call when the interesting part
 * is a decision that could have been written in TypeScript. This one cannot
 * follow that pattern and be worth anything. The property under test is "a
 * learner who has not met a teachable prerequisite is not dealt the content
 * behind it", and no amount of string matching can distinguish a predicate that
 * enforces that from one that quietly matches every row.
 *
 * So this file builds a real PostgreSQL -- PGlite, the whole migration set and
 * the whole seed set -- and runs the actual exported fragments against it. The
 * harness lives in database.fixture.ts, shared with roles.test.ts.
 *
 * THIS FILE TESTS ONE LAYER: prerequisites. Role selection is the layer above
 * and is tested separately, which is why dealableQuestions() below composes
 * curriculumEligible alone rather than the production query's full stack.
 *
 * WHAT THIS FILE PROVES vs WHAT THE STRUCTURAL SUITE PROVES. Here: that the
 * fragments implement the rule. At the bottom: that game/queries.ts and
 * bugHunt/queries.ts actually compose those fragments rather than carrying their
 * own copy, and that curve.ts stayed out of it. Neither half is sufficient
 * alone -- a correct predicate nobody calls is worth as much as a called
 * predicate that is wrong.
 */

/**
 * Today's Code Blitz candidate count, before curriculum eligibility existed.
 *
 * The regression net for the whole slice. 234 of the 237 active questions are
 * dealable (the three complete-code questions have no single correct option and
 * fail ELIGIBLE_QUESTION_PREDICATE), and wiring eligibility must not change that
 * number: almost nothing is tagged, and the one tagged question's prerequisites
 * are currently unteachable. If this moves, the transitional rules are wrong and
 * the answer is to diagnose them, never to edit this constant.
 */
const BASELINE_CANDIDATES = 234;

/**
 * How many of those carry a challenge_id.
 *
 * One from the equality slice (seed 015) and one from the primitive-types
 * Learn -> Play slice (seed 016). Everything else still flows through the
 * transitional escape hatch, which is why this number being small is the point
 * rather than an embarrassment.
 */
const TAGGED_QUESTIONS = 2;

/** The two Bug Hunt incidents the equality slice tagged. */
const TAGGED_INCIDENTS = ["order-lookup-string-id", "profile-clear-field-null"];

let fx: CurriculumFixture;

/** A learner with no history at all. Created once; never given an encounter. */
let newLearner: string;

/** The Code Blitz question the equality slice tagged, at demand `predict`. */
let equalityQuestionId: string;

beforeAll(async () => {
    fx = await buildCurriculumFixture();
    newLearner = await fx.insertUser("new@example.com");

    const tagged = await fx.rows<{ id: string }>(
        `SELECT q.id
         FROM questions q
         JOIN challenges ch ON ch.id = q.challenge_id
         JOIN concepts c    ON c.id  = ch.concept_id
         JOIN demands d     ON d.id  = ch.demand_id
         WHERE c.slug = 'equality' AND d.slug = 'predict'`
    );

    expect(tagged, "the equality slice's Code Blitz question must be seeded").toHaveLength(1);
    equalityQuestionId = tagged[0]!.id;
}, 120_000);

// ── the queries under test, composed from the real exported fragments ────

/** Code Blitz's candidate set, minus the ordering the dealer does not need here. */
async function dealableQuestions(userId: string): Promise<string[]> {
    const found = await fx.rows<{ id: string }>(
        `WITH ${metConceptsCte("$1")}
         SELECT q.id
         FROM questions q
         WHERE ${ELIGIBLE_QUESTION_PREDICATE}
           AND ${curriculumEligible("q")}
         ORDER BY q.id`,
        [userId]
    );

    return found.map((r) => r.id);
}

async function dealableIncidents(userId: string): Promise<string[]> {
    const found = await fx.rows<{ slug: string }>(
        `WITH ${metConceptsCte("$1")}
         SELECT i.slug
         FROM bug_hunt_incidents i
         WHERE ${ELIGIBLE_INCIDENT_PREDICATE}
           AND ${curriculumEligible("i")}
         ORDER BY i.slug`,
        [userId]
    );

    return found.map((r) => r.slug);
}

// ── step 2 · the baseline, measured without curriculum eligibility ───────

describe("step 2 · today's candidate pool, before curriculum eligibility", () => {
    it("offers 234 Code Blitz questions under the pre-existing predicate alone", async () => {
        // The real ELIGIBLE_QUESTION_PREDICATE, not a copy of it, so a change
        // there is felt here rather than silently diverging.
        const [count] = await fx.rows<{ count: number }>(
            `SELECT COUNT(*)::INT AS count FROM questions q WHERE ${ELIGIBLE_QUESTION_PREDICATE}`
        );

        expect(count!.count).toBe(BASELINE_CANDIDATES);
    });

    it("is comfortably more than one session needs", async () => {
        expect(BASELINE_CANDIDATES).toBeGreaterThan(QUESTIONS_PER_SESSION);
    });
});

// ── step 3 · the same pool, after ────────────────────────────────────────

describe("step 3 · curriculum eligibility does not shrink today's pool", () => {
    it("deals a brand-new learner the same 234 questions", async () => {
        // BEFORE = AFTER. Almost nothing is tagged, and the one tagged question's
        // prerequisites are unteachable, so the transitional rules let everything
        // through. This is what makes the wiring safe to ship.
        expect(await dealableQuestions(newLearner)).toHaveLength(BASELINE_CANDIDATES);
    });

    it("leaves every Bug Hunt incident dealable", async () => {
        const dealable = await dealableIncidents(newLearner);

        for (const slug of TAGGED_INCIDENTS) {
            expect(dealable, `${slug} must still be dealable`).toContain(slug);
        }
    });
});

// ── A · a new learner is not locked out ──────────────────────────────────

describe("A · a learner with no history is not locked out", () => {
    it("still reaches the untagged legacy bank", async () => {
        const dealable = await dealableQuestions(newLearner);
        const [untagged] = await fx.rows<{ count: number }>(
            `SELECT COUNT(*)::INT AS count FROM questions q
             WHERE q.challenge_id IS NULL AND ${ELIGIBLE_QUESTION_PREDICATE}`
        );

        expect(untagged!.count).toBe(BASELINE_CANDIDATES - TAGGED_QUESTIONS);
        expect(dealable.length).toBeGreaterThanOrEqual(untagged!.count);
    });

    it("derives an empty met set rather than failing on one", async () => {
        // NOT IN over an empty set is TRUE, which is the behaviour the rule
        // depends on. Worth pinning: the opposite would lock out every learner
        // on their first run and only on their first run.
        const met = await fx.rows(`WITH ${metConceptsCte("$1")} SELECT * FROM met`, [newLearner]);

        expect(met).toHaveLength(0);
    });
});

// ── B · untagged content bypasses the gate ───────────────────────────────

describe("B · untagged content is never gated", () => {
    it("stays dealable even when a tagged concept is blocked", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("b@example.com");

            await fx.makeTeachable("type-coercion");

            const dealable = await dealableQuestions(learner);
            const untagged = await fx.rows<{ id: string }>(
                `SELECT q.id FROM questions q
                 WHERE q.challenge_id IS NULL AND ${ELIGIBLE_QUESTION_PREDICATE}`
            );

            for (const q of untagged) {
                expect(dealable, `untagged question ${q.id} must pass`).toContain(q.id);
            }
        });
    });

    it("is the only reason the pool survives -- gating it would collapse the run", async () => {
        // The measurement behind the escape hatch, kept honest rather than
        // asserted in a comment: tagged content alone cannot fill a session.
        const [tagged] = await fx.rows<{ count: number }>(
            `SELECT COUNT(*)::INT AS count FROM questions q
             WHERE q.challenge_id IS NOT NULL AND ${ELIGIBLE_QUESTION_PREDICATE}`
        );

        expect(tagged!.count).toBeLessThan(QUESTIONS_PER_SESSION);
    });
});

// ── C/D/E · the three-way prerequisite rule ──────────────────────────────

describe("D · an unmet prerequisite Jolt CAN teach blocks its dependants", () => {
    it("excludes the equality question once type-coercion becomes teachable", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d@example.com");

            expect(
                await dealableQuestions(learner),
                "precondition: equality is dealable while type-coercion is unteachable"
            ).toContain(equalityQuestionId);

            await fx.makeTeachable("type-coercion");

            expect(await dealableQuestions(learner)).not.toContain(equalityQuestionId);
        });
    });

    it("blocks everything behind that prerequisite, and nothing else", async () => {
        // Two questions go, and the second one is the more interesting.
        //
        //   equality's question   -- equality requires type-coercion directly
        //   the fixture's own     -- makeTeachable tags a previously untagged
        //                            question to type-coercion, which in turn
        //                            requires primitive-types, and seed 016 made
        //                            primitive-types teachable
        //
        // So the graph is now gating transitively through real seeded content,
        // which it could not do while nothing was tagged.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d2@example.com");
            const teaching = await fx.makeTeachable("type-coercion");
            const dealable = await dealableQuestions(learner);

            expect(dealable).not.toContain(equalityQuestionId);
            expect(dealable, "behind an unmet primitive-types").not.toContain(
                teaching.questionId
            );
            expect(dealable).toHaveLength(BASELINE_CANDIDATES - 2);
        });
    });
});

describe("C · a met prerequisite restores its dependants", () => {
    it("re-admits the equality question once type-coercion is met", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("c@example.com");
            const { questionId: teachingQuestion } = await fx.makeTeachable("type-coercion");

            expect(await dealableQuestions(learner)).not.toContain(equalityQuestionId);

            await fx.encounter(learner, teachingQuestion);

            expect(await dealableQuestions(learner)).toContain(equalityQuestionId);
        });
    });

    it("counts an answered question and a timed-out one alike", async () => {
        // Encountered, not passed. Both are evidence the learner met the concept.
        for (const status of ["answered", "timed_out"] as const) {
            await fx.scenario(async () => {
                const learner = await fx.insertUser(`c-${status}@example.com`);
                const { questionId: teachingQuestion } = await fx.makeTeachable("type-coercion");

                await fx.encounter(learner, teachingQuestion, status);

                expect(
                    await dealableQuestions(learner),
                    `${status} must count as an encounter`
                ).toContain(equalityQuestionId);
            });
        }
    });

    it("does not count a question that was only planned", async () => {
        // 'pending' is a question dealt but never faced. Counting it would mean a
        // learner unlocked a concept by abandoning the run that would have taught
        // it.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("c-pending@example.com");
            const { questionId: teachingQuestion } = await fx.makeTeachable("type-coercion");

            await fx.encounter(learner, teachingQuestion, "pending");

            expect(await dealableQuestions(learner)).not.toContain(equalityQuestionId);
        });
    });

    it("scopes met concepts to the learner who earned them", async () => {
        await fx.scenario(async () => {
            const studious = await fx.insertUser("c-studious@example.com");
            const bystander = await fx.insertUser("c-bystander@example.com");
            const { questionId: teachingQuestion } = await fx.makeTeachable("type-coercion");

            await fx.encounter(studious, teachingQuestion);

            expect(await dealableQuestions(studious)).toContain(equalityQuestionId);
            expect(await dealableQuestions(bystander)).not.toContain(equalityQuestionId);
        });
    });
});

describe("E · an unmet prerequisite Jolt CANNOT teach does not block", () => {
    it("is why the equality slice is reachable at all today", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("e@example.com");
            const teachable = await fx.rows<{ slug: string }>(
                `SELECT c.slug FROM concepts c
                 WHERE c.slug IN ('comparison-operators', 'type-coercion')
                   AND EXISTS (SELECT 1 FROM challenges ch
                               WHERE ch.concept_id = c.id AND ch.is_active)`
            );

            expect(teachable, "neither prerequisite has content yet").toHaveLength(0);
            expect(await dealableQuestions(learner)).toContain(equalityQuestionId);
        });
    });

    it("stops applying the moment the prerequisite becomes teachable", async () => {
        // The rule is transitional by construction: it tightens as coverage
        // grows, with no code change. This is that tightening, observed.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("e2@example.com");

            expect(await dealableQuestions(learner)).toContain(equalityQuestionId);

            await fx.makeTeachable("comparison-operators");

            expect(await dealableQuestions(learner)).not.toContain(equalityQuestionId);
        });
    });

    it("ignores an inactive challenge, which teaches nobody", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("e3@example.com");

            await fx.db.query(
                `INSERT INTO challenges (concept_id, demand_id, role, difficulty, is_active)
                 SELECT c.id, d.id, 'practise', 1, FALSE
                 FROM concepts c, demands d
                 WHERE c.slug = 'type-coercion' AND d.slug = 'predict'`
            );

            expect(await dealableQuestions(learner)).toContain(equalityQuestionId);
        });
    });
});

// ── F · several prerequisites ────────────────────────────────────────────

describe("F · every teachable prerequisite must be met, not just one", () => {
    it("keeps blocking while one of two teachable prerequisites is unmet", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("f@example.com");
            const { questionId: coercion } = await fx.makeTeachable("type-coercion");

            await fx.makeTeachable("comparison-operators");
            await fx.encounter(learner, coercion);

            expect(
                await dealableQuestions(learner),
                "comparison-operators is still unmet"
            ).not.toContain(equalityQuestionId);
        });
    });

    it("admits the content once both are met", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("f2@example.com");
            const { questionId: coercion } = await fx.makeTeachable("type-coercion");
            const { questionId: comparison } = await fx.makeTeachable("comparison-operators");

            await fx.encounter(learner, coercion);
            await fx.encounter(learner, comparison);

            expect(await dealableQuestions(learner)).toContain(equalityQuestionId);
        });
    });
});

// ── G · direct prerequisites only ────────────────────────────────────────

describe("G · eligibility inspects direct prerequisites and does not walk the graph", () => {
    it("is not blocked by a teachable, unmet grandparent", async () => {
        // primitive-types is required by type-coercion and comparison-operators,
        // and so is an ancestor of equality -- but not a direct prerequisite of
        // it. Transitive safety comes from induction (a concept is only met by
        // being dealt, and is only dealt once its own direct prerequisites are
        // met), which is sound because the curriculum tests prove the graph is
        // acyclic. Re-deriving it here would cost a recursive CTE per deal.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("g@example.com");

            await fx.makeTeachable("primitive-types");

            expect(await dealableQuestions(learner)).toContain(equalityQuestionId);
        });
    });

    it("uses no recursive traversal", () => {
        expect(curriculumEligible("q")).not.toMatch(/RECURSIVE/i);
        expect(metConceptsCte("$1")).not.toMatch(/RECURSIVE/i);
    });
});

// ── H · the equality boundary, stated explicitly ─────────────────────────

describe("H · the equality slice's current boundary", () => {
    it("declares comparison-operators and type-coercion as its prerequisites", async () => {
        const prereqs = await fx.rows<{ slug: string }>(
            `SELECT r.slug FROM concepts c
             JOIN prerequisites p ON p.concept_id = c.id
             JOIN concepts r      ON r.id = p.requires_id
             WHERE c.slug = 'equality' ORDER BY r.slug`
        );

        expect(prereqs.map((r) => r.slug)).toEqual(["comparison-operators", "type-coercion"]);
    });

    it("remains dealable for everyone, because neither prerequisite has content", async () => {
        expect(await dealableQuestions(newLearner)).toContain(equalityQuestionId);
    });
});

// ── step 5 · Bug Hunt, through the same module ───────────────────────────

describe("step 5 · Bug Hunt is gated by the same rule", () => {
    it("deals both tagged incidents today", async () => {
        const dealable = await dealableIncidents(newLearner);

        expect(dealable).toEqual(expect.arrayContaining(TAGGED_INCIDENTS));
    });

    it("withholds both once type-coercion becomes teachable and unmet", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("bh@example.com");

            await fx.makeTeachable("type-coercion");

            const dealable = await dealableIncidents(learner);

            for (const slug of TAGGED_INCIDENTS) {
                expect(dealable, `${slug} must be withheld`).not.toContain(slug);
            }
        });
    });

    it("restores both once the prerequisite is met", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("bh2@example.com");
            const { questionId: teachingQuestion } = await fx.makeTeachable("type-coercion");

            await fx.encounter(learner, teachingQuestion);

            const dealable = await dealableIncidents(learner);

            for (const slug of TAGGED_INCIDENTS) {
                expect(dealable, `${slug} must return`).toContain(slug);
            }
        });
    });

    it("counts a Bug Hunt round as an encounter, not only a Code Blitz answer", async () => {
        // The met set spans games on purpose: meeting a concept in one game must
        // count in the other, or the curriculum fragments back into per-game
        // progress -- the thing challenges exist to prevent.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("bh3@example.com");
            const { challengeId } = await fx.makeTeachable("type-coercion");
            const slug = await fx.attachIncident(challengeId);

            expect(
                await dealableQuestions(learner),
                "precondition: type-coercion is teachable and unmet"
            ).not.toContain(equalityQuestionId);

            await fx.encounterIncident(learner, slug);

            expect(
                await dealableQuestions(learner),
                "a Bug Hunt round must unlock a Code Blitz question"
            ).toContain(equalityQuestionId);
        });
    });
});

// ── the met CTE itself ───────────────────────────────────────────────────

describe("the derived met set reads both games' history", () => {
    it("unions Code Blitz answers and Bug Hunt rounds", () => {
        const cte = metConceptsCte("$1");

        expect(cte).toContain("session_questions");
        expect(cte).toContain("bug_hunt_rounds");
        expect(cte).toMatch(/sq\.status IN \('answered', 'timed_out'\)/);
        expect(cte).toMatch(/bhr\.status IN \('resolved', 'failed'\)/);
    });

    it("refuses anything but a positional placeholder for the user", () => {
        // The one interpolation point in the module. A value here would be an
        // injection; a thrown error is the only acceptable outcome.
        expect(() => metConceptsCte("1")).toThrow();
        expect(() => metConceptsCte("$1; DROP TABLE users")).toThrow();
        expect(() => curriculumEligible("q; DROP TABLE users")).toThrow();
    });
});

// ── the wiring, asserted at source level ─────────────────────────────────

describe("both games consume the shared module rather than a copy", () => {
    const blitz = readFileSync(new URL("../game/queries.ts", import.meta.url), "utf8");
    const hunt = readFileSync(new URL("../bugHunt/queries.ts", import.meta.url), "utf8");
    const questions = readFileSync(new URL("../questions/queries.ts", import.meta.url), "utf8");
    const routes = readFileSync(new URL("../game/routes.ts", import.meta.url), "utf8");
    const huntRoutes = readFileSync(new URL("../bugHunt/routes.ts", import.meta.url), "utf8");
    const curve = readFileSync(new URL("../game/curve.ts", import.meta.url), "utf8");
    const selection = readFileSync(new URL("./selection.ts", import.meta.url), "utf8");

    it("reaches Code Blitz's candidate query through the composition point", () => {
        // The games compose curriculum/selection.ts, which composes this layer.
        // Asserted transitively so that adding a layer does not mean editing an
        // assertion in every game's test.
        expect(blitz).toContain('curriculumCtes("$2")');
        expect(blitz).toContain('curriculumSelects("q")');
        expect(selection).toContain("curriculumEligible(alias)");
        expect(selection).toContain("metConceptsCte(userParam)");
    });

    it("reaches Bug Hunt's candidate query the same way", () => {
        expect(hunt).toContain('curriculumCtes("$1")');
        expect(hunt).toContain('curriculumSelects("i")');
    });

    it("never writes the prerequisite join out a second time", () => {
        // One definition of the rule. A copy is how the two games start
        // disagreeing about what a learner is allowed to see.
        for (const [name, source] of [["game", blitz], ["bugHunt", hunt]] as const) {
            expect(source, `${name}/queries.ts must not inline the graph`).not.toContain(
                "JOIN prerequisites"
            );
        }
    });

    it("counts availability with the same rule the dealer applies", () => {
        // A wider count here would clear a session the candidate query cannot
        // fill -- a 503 the player meets halfway into starting.
        expect(questions).toContain("export async function countDealableQuestions");
        expect(hunt).toContain("export async function countDealableIncidents");
        expect(routes).toContain("countDealableQuestions(userId, QUESTIONS_PER_SESSION)");
        expect(huntRoutes).toContain("countDealableIncidents(userId)");
    });

    it("leaves the top-up looking at the whole bank", () => {
        // "Is the bank thin?" is a property of the bank. Importing questions
        // because one learner is prerequisite-gated would be the wrong reaction
        // to the wrong signal.
        const topUp = readFileSync(new URL("../questions/topUp.ts", import.meta.url), "utf8");

        expect(topUp).toContain("countEligibleQuestions()");
        expect(topUp).not.toContain("countDealableQuestions");
    });

    it("keeps the dealer curriculum-agnostic", () => {
        // Pacing and eligibility stay separate. curve.ts is a pure function with
        // no database access, and it must stay that way -- checked on what it
        // DOES rather than on the words in its comments, which legitimately
        // discuss curriculum units.
        expect(curve, "curve.ts must import nothing at all").not.toMatch(/^import /m);
        expect(curve, "curve.ts must not carry curriculum identity").not.toContain("challenge_id");
        expect(curve).not.toContain("concept_id");
    });

    it("leaves the dealer's own signature untouched", () => {
        // dealSession still takes (candidates, count, random, focusTopic). A new
        // parameter here would mean eligibility had leaked into pacing.
        expect(curve).toContain("export function dealSession<T extends Dealable>(");
        expect(curve).toContain("focusTopic: string | null = null");
    });

    it("gates on prerequisites only -- not on role or demand", () => {
        // Deliberately out of this slice: all three existing challenges are
        // `practise` and no `introduce` challenge exists, so a role gate would
        // hide every tagged item.
        const rule = curriculumEligible("q");

        expect(rule).not.toMatch(/\brole\b/);
        expect(rule).not.toMatch(/demand/);
    });
});
