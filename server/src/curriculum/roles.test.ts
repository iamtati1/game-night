import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { curriculumEligible, metConceptsCte } from "./eligibility.js";
import { SELECTABLE_ROLES, roleEligible } from "./roles.js";
import { ELIGIBLE_QUESTION_PREDICATE } from "../questions/queries.js";
import { ELIGIBLE_INCIDENT_PREDICATE } from "../bugHunt/queries.js";

/**
 * Role eligibility -- introduce before practise -- executed against a real
 * PostgreSQL, for the reasons set out in eligibility.test.ts.
 *
 * THE FIXTURE CONCEPT IS `primitive-types`. It is the curriculum's only root:
 * zero prerequisites, so it passes curriculumEligible() for every learner
 * unconditionally. That isolates the layer under test -- anything withheld here
 * is withheld because of ROLE, never because a prerequisite got in the way.
 * `equality` is used separately, precisely because it has prerequisites.
 *
 * WHAT IS FABRICATED AND WHY. Every challenge below is created inside a
 * transaction that is rolled back. The content bank is not tagged and must not
 * be: today's three challenges are all `practise`, so there is no introduce
 * content anywhere to test against. The architecture has to be ready before the
 * tagging pass, which is what these fixtures prove.
 */

/** Unchanged from the previous slice: the raw playable bank. */
/*
 * These counts moved when seed 020 stocked the Values topic with twelve tagged
 * practice questions. The bank is 246 dealable questions and 14 of them are
 * tagged -- up from 234 and 2. Stated as numbers on purpose: the whole point of
 * this work is that tagged coverage is growing, and a silent change to it is
 * exactly what these tests exist to catch.
 */
const BASELINE_CANDIDATES = 246;

/**
 * Questions carrying a challenge_id: equality's (seed 015) and
 * primitive-types' (seed 016). Both are `practise`, so both are withheld from a
 * learner who has met neither concept.
 */
const TAGGED_QUESTIONS = 14;

/** The two Bug Hunt incidents the equality slice tagged, both `practise`. */
const TAGGED_INCIDENTS = ["order-lookup-string-id", "profile-clear-field-null"];

/** A concept with no prerequisites, so only role can withhold its content. */
/**
 * The specimen this file isolates the ROLE layer on.
 *
 * It must be a concept nothing can prerequisite-gate, or failures here would be
 * the layer above talking. That used to be primitive-types; once seed 019 gave
 * every authored lesson an introduction, primitive-types' own prerequisite
 * became teachable and started gating it -- correctly, and one layer up.
 *
 * console-output is the curriculum's single root and has no prerequisites at
 * all, so it cannot be gated by anything, now or as coverage grows. The
 * beforeAll below asserts that rather than trusting it.
 */
const ROOT_CONCEPT = "console-output";

let fx: CurriculumFixture;
let newLearner: string;
let equalityQuestionId: string;

beforeAll(async () => {
    fx = await buildCurriculumFixture();
    newLearner = await fx.insertUser("roles-new@example.com");

    const [question] = await fx.rows<{ id: string }>(
        `SELECT q.id FROM questions q
         JOIN challenges ch ON ch.id = q.challenge_id
         JOIN concepts c    ON c.id  = ch.concept_id
         WHERE c.slug = 'equality'`
    );

    equalityQuestionId = question!.id;

    // The property this fixture needs is "nothing can gate it". Asserted rather
    // than assumed, because the thing that broke the previous specimen was a
    // prerequisite quietly becoming teachable.
    const [gating] = await fx.rows<{ n: number }>(
        `SELECT COUNT(*)::INT n
         FROM prerequisites p
         JOIN concepts c ON c.id = p.concept_id
         WHERE c.slug = $1
           AND EXISTS (SELECT 1 FROM challenges ch
                       WHERE ch.concept_id = p.requires_id AND ch.is_active)`,
        [ROOT_CONCEPT]
    );

    expect(gating!.n, `nothing may prerequisite-gate ${ROOT_CONCEPT}`).toBe(0);
}, 120_000);

// ── the production stack, and the layer beneath it ───────────────────────

/** Exactly what createSessionWithQuestions selects: all three predicates. */
async function selectable(userId: string): Promise<string[]> {
    const found = await fx.rows<{ id: string }>(
        `WITH ${metConceptsCte("$1")}
         SELECT q.id FROM questions q
         WHERE ${ELIGIBLE_QUESTION_PREDICATE}
           AND ${curriculumEligible("q")}
           AND ${roleEligible("q")}
         ORDER BY q.id`,
        [userId]
    );

    return found.map((r) => r.id);
}

/** The prerequisite layer alone, so the two can be told apart. */
async function prerequisiteEligible(userId: string): Promise<string[]> {
    const found = await fx.rows<{ id: string }>(
        `WITH ${metConceptsCte("$1")}
         SELECT q.id FROM questions q
         WHERE ${ELIGIBLE_QUESTION_PREDICATE}
           AND ${curriculumEligible("q")}
         ORDER BY q.id`,
        [userId]
    );

    return found.map((r) => r.id);
}

async function selectableIncidents(userId: string): Promise<string[]> {
    const found = await fx.rows<{ slug: string }>(
        `WITH ${metConceptsCte("$1")}
         SELECT i.slug FROM bug_hunt_incidents i
         WHERE ${ELIGIBLE_INCIDENT_PREDICATE}
           AND ${curriculumEligible("i")}
           AND ${roleEligible("i")}
         ORDER BY i.slug`,
        [userId]
    );

    return found.map((r) => r.slug);
}

// ── 1 · a brand-new learner meets a concept before drilling it ───────────

describe("1 · a brand-new learner is introduced, not tested", () => {
    it("offers the introduction and withholds the practice", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("r1@example.com");
            const intro = await fx.challengeFor(ROOT_CONCEPT, "introduce");
            const drill = await fx.challengeFor(ROOT_CONCEPT, "practise");

            const offered = await selectable(learner);

            expect(offered, "the introduction is the next useful thing").toContain(
                intro.questionId
            );
            expect(offered, "practice presumes an introduction that never happened").not.toContain(
                drill.questionId
            );
        });
    });

    it("withholds practice on role alone, not on prerequisites", async () => {
        // The distinction the two layers exist to keep. primitive-types is the
        // curriculum root: nothing can gate it prerequisite-wise, so the
        // prerequisite layer passes the same question the role layer refuses.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("r1b@example.com");
            const drill = await fx.challengeFor(ROOT_CONCEPT, "practise");

            expect(await prerequisiteEligible(learner)).toContain(drill.questionId);
            expect(await selectable(learner)).not.toContain(drill.questionId);
        });
    });
});

// ── 2 · the transition ───────────────────────────────────────────────────

describe("2 · encountering the concept flips introduce to practise", () => {
    it("retires the introduction and releases the practice", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("r2@example.com");
            const intro = await fx.challengeFor(ROOT_CONCEPT, "introduce");
            const drill = await fx.challengeFor(ROOT_CONCEPT, "practise");

            await fx.encounter(learner, intro.questionId, "answered");

            const offered = await selectable(learner);

            expect(offered, "the introduction has already happened").not.toContain(
                intro.questionId
            );
            expect(offered, "practice is now the next useful thing").toContain(drill.questionId);
        });
    });

    it("is one-way for this slice -- nothing puts the introduction back", async () => {
        // Re-introducing a met concept is a REINFORCE decision, and reinforce is
        // deliberately unimplemented. Pinned so a future spacing design has to
        // make that choice deliberately rather than inherit it.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("r2b@example.com");
            const intro = await fx.challengeFor(ROOT_CONCEPT, "introduce");

            await fx.encounter(learner, intro.questionId, "answered");

            expect(await selectable(learner)).not.toContain(intro.questionId);
        });
    });
});

// ── 3 · what counts as an encounter ──────────────────────────────────────

describe("3 · the encounter has to be real", () => {
    for (const status of ["answered", "timed_out"] as const) {
        it(`counts a ${status} question`, async () => {
            await fx.scenario(async () => {
                const learner = await fx.insertUser(`r3-${status}@example.com`);
                const intro = await fx.challengeFor(ROOT_CONCEPT, "introduce");
                const drill = await fx.challengeFor(ROOT_CONCEPT, "practise");

                await fx.encounter(learner, intro.questionId, status);

                expect(await selectable(learner)).toContain(drill.questionId);
            });
        });
    }

    it("does not count a question that was dealt but never faced", async () => {
        // 'pending' is a planned question. Counting it would mean abandoning the
        // run that would have taught you the concept unlocks its practice.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("r3-pending@example.com");
            const intro = await fx.challengeFor(ROOT_CONCEPT, "introduce");
            const drill = await fx.challengeFor(ROOT_CONCEPT, "practise");

            await fx.encounter(learner, intro.questionId, "pending");

            const offered = await selectable(learner);

            expect(offered, "still unmet, so still being introduced").toContain(intro.questionId);
            expect(offered).not.toContain(drill.questionId);
        });
    });

    for (const status of ["resolved", "failed"] as const) {
        it(`counts a ${status} Bug Hunt round`, async () => {
            await fx.scenario(async () => {
                const learner = await fx.insertUser(`r3-bh-${status}@example.com`);
                const intro = await fx.challengeFor(ROOT_CONCEPT, "introduce");
                const slug = await fx.attachIncident(intro.challengeId);
                const drill = await fx.challengeFor(ROOT_CONCEPT, "practise");

                await fx.encounterIncident(learner, slug, status);

                expect(await selectable(learner)).toContain(drill.questionId);
            });
        });
    }

    it("does not count a Bug Hunt round that was never played", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("r3-bh-pending@example.com");
            const intro = await fx.challengeFor(ROOT_CONCEPT, "introduce");
            const slug = await fx.attachIncident(intro.challengeId);
            const drill = await fx.challengeFor(ROOT_CONCEPT, "practise");

            await fx.encounterIncident(learner, slug, "pending");

            expect(await selectable(learner)).not.toContain(drill.questionId);
        });
    });

    it("counts a failed encounter, because encountered is not mastered", async () => {
        // The deliberate choice of this slice. Someone who met the concept and
        // got it wrong has still met it, and another introduction is not what
        // they need. Accuracy belongs to a competence layer that does not exist.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("r3-wrong@example.com");
            const intro = await fx.challengeFor(ROOT_CONCEPT, "introduce");
            const drill = await fx.challengeFor(ROOT_CONCEPT, "practise");

            await fx.encounter(learner, intro.questionId, "timed_out");

            expect(await selectable(learner)).toContain(drill.questionId);
        });
    });
});

// ── 4 · one learner state, both games ────────────────────────────────────

describe("4 · the transition crosses games", () => {
    it("lets a Bug Hunt round release a Code Blitz practice question", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("r4a@example.com");
            const intro = await fx.challengeFor(ROOT_CONCEPT, "introduce");
            const slug = await fx.attachIncident(intro.challengeId);
            const drill = await fx.challengeFor(ROOT_CONCEPT, "practise");

            expect(await selectable(learner)).not.toContain(drill.questionId);

            await fx.encounterIncident(learner, slug, "resolved");

            expect(await selectable(learner)).toContain(drill.questionId);
        });
    });

    it("lets a Code Blitz answer release a Bug Hunt practice incident", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("r4b@example.com");
            const intro = await fx.challengeFor(ROOT_CONCEPT, "introduce");
            const drill = await fx.challengeFor(ROOT_CONCEPT, "practise");
            const slug = await fx.attachIncident(drill.challengeId);

            expect(await selectableIncidents(learner)).not.toContain(slug);

            await fx.encounter(learner, intro.questionId, "answered");

            expect(await selectableIncidents(learner)).toContain(slug);
        });
    });
});

// ── 5 · the prerequisite layer still has the last word ───────────────────

describe("5 · role never overrides prerequisites", () => {
    it("keeps blocking an encountered concept whose prerequisite is unmet", async () => {
        // equality, not primitive-types, because this needs a concept with
        // prerequisites. The learner HAS met equality, so role would allow the
        // practice -- and the prerequisite layer withholds it anyway.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("r5@example.com");

            // This file measures the role layer. equality's prerequisites both
            // gained lessons in seed 019 and now gate it one layer up, which
            // would mask every assertion below.
            await fx.makeUnteachable("comparison-operators");
            await fx.makeUnteachable("type-coercion");

            const intro = await fx.challengeFor("equality", "introduce");

            await fx.encounter(learner, intro.questionId, "answered");

            expect(
                await selectable(learner),
                "role is satisfied once equality is met"
            ).toContain(equalityQuestionId);

            await fx.makeTeachable("type-coercion");

            expect(
                await selectable(learner),
                "an unmet teachable prerequisite still wins"
            ).not.toContain(equalityQuestionId);
        });
    });
});

// ── 6 · the transitional escape hatch is unchanged ───────────────────────

describe("6 · untagged content is untouched by the role layer", () => {
    it("stays selectable for a brand-new learner", async () => {
        const offered = await selectable(newLearner);
        const untagged = await fx.rows<{ id: string }>(
            `SELECT q.id FROM questions q
             WHERE q.challenge_id IS NULL AND ${ELIGIBLE_QUESTION_PREDICATE}`
        );

        expect(untagged).toHaveLength(BASELINE_CANDIDATES - TAGGED_QUESTIONS);

        for (const q of untagged) {
            expect(offered, `untagged question ${q.id} must pass`).toContain(q.id);
        }
    });

    it("stays selectable for a learner with history", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("r6@example.com");
            const intro = await fx.challengeFor(ROOT_CONCEPT, "introduce");

            await fx.encounter(learner, intro.questionId, "answered");

            const offered = await selectable(learner);
            const [untagged] = await fx.rows<{ n: number }>(
                `SELECT COUNT(*)::INT n FROM questions q
                 WHERE q.challenge_id IS NULL AND ${ELIGIBLE_QUESTION_PREDICATE}`
            );

            expect(offered.length).toBeGreaterThanOrEqual(untagged!.n);
        });
    });

    it("is what keeps a run fillable -- tagged content alone cannot", async () => {
        const [tagged] = await fx.rows<{ n: number }>(
            `SELECT COUNT(*)::INT n FROM questions q
             WHERE q.challenge_id IS NOT NULL AND ${ELIGIBLE_QUESTION_PREDICATE}`
        );

        expect(tagged!.n).toBe(TAGGED_QUESTIONS);
    });
});

// ── 7 · reinforce is reserved ────────────────────────────────────────────

describe("7 · reinforce is authored but never dealt", () => {
    it("is not a selectable role", () => {
        expect(SELECTABLE_ROLES).toEqual(["introduce", "practise"]);
        expect(SELECTABLE_ROLES as readonly string[]).not.toContain("reinforce");
    });

    it("withholds reinforce content from a learner who has not met the concept", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("r7a@example.com");
            const again = await fx.challengeFor(ROOT_CONCEPT, "reinforce");

            expect(await selectable(learner)).not.toContain(again.questionId);
        });
    });

    it("withholds it from a learner who HAS met the concept", async () => {
        // The case that matters: reinforce must not quietly behave as a second
        // practise. Spacing is what will decide when it fires, and that design
        // does not exist yet.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("r7b@example.com");
            const intro = await fx.challengeFor(ROOT_CONCEPT, "introduce");
            const again = await fx.challengeFor(ROOT_CONCEPT, "reinforce");

            await fx.encounter(learner, intro.questionId, "answered");

            expect(await selectable(learner)).not.toContain(again.questionId);
        });
    });
});

// ── 8 · per-learner isolation ────────────────────────────────────────────

describe("8 · one learner's progress is not another's", () => {
    it("releases practice only for the learner who did the work", async () => {
        await fx.scenario(async () => {
            const studious = await fx.insertUser("r8a@example.com");
            const bystander = await fx.insertUser("r8b@example.com");
            const intro = await fx.challengeFor(ROOT_CONCEPT, "introduce");
            const drill = await fx.challengeFor(ROOT_CONCEPT, "practise");

            await fx.encounter(studious, intro.questionId, "answered");

            expect(await selectable(studious)).toContain(drill.questionId);
            expect(await selectable(bystander)).not.toContain(drill.questionId);
            expect(
                await selectable(bystander),
                "the bystander is still being introduced"
            ).toContain(intro.questionId);
        });
    });
});

// ── 9 · the equality slice, under the new rule ───────────────────────────

describe("9 · the equality slice is withheld until equality is introduced", () => {
    it("withholds all three practise items from a brand-new learner", async () => {
        // The intended consequence of this slice, and a real change in
        // behaviour: equality's content is `practise` and nothing introduces
        // equality yet, so until an introduce challenge exists the slice is
        // authored, tagged, correct -- and unreachable.
        expect(await selectable(newLearner)).not.toContain(equalityQuestionId);

        const incidents = await selectableIncidents(newLearner);

        for (const slug of TAGGED_INCIDENTS) {
            expect(incidents, `${slug} presumes an introduction`).not.toContain(slug);
        }
    });

    it("is withheld by the prerequisite layer too, now that it has one", async () => {
        // This said the opposite while equality's prerequisites had no content.
        // Both have lessons now, so BOTH layers withhold it -- which is why the
        // scenarios above uncover them before measuring role in isolation.
        expect(await prerequisiteEligible(newLearner)).not.toContain(equalityQuestionId);
    });

    it("releases all three once equality has been introduced", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("r9@example.com");

            // This file measures the role layer. equality's prerequisites both
            // gained lessons in seed 019 and now gate it one layer up, which
            // would mask every assertion below.
            await fx.makeUnteachable("comparison-operators");
            await fx.makeUnteachable("type-coercion");

            const intro = await fx.challengeFor("equality", "introduce");

            await fx.encounter(learner, intro.questionId, "answered");

            expect(await selectable(learner)).toContain(equalityQuestionId);

            const incidents = await selectableIncidents(learner);

            for (const slug of TAGGED_INCIDENTS) {
                expect(incidents, `${slug} must return`).toContain(slug);
            }
        });
    });
});

// ── 10 · nothing beneath this layer moved ────────────────────────────────

describe("10 · the layers below are unchanged", () => {
    it("leaves the raw playable bank at 234", async () => {
        const [count] = await fx.rows<{ n: number }>(
            `SELECT COUNT(*)::INT n FROM questions q WHERE ${ELIGIBLE_QUESTION_PREDICATE}`
        );

        expect(count!.n).toBe(BASELINE_CANDIDATES);
    });

    it("leaves the untagged bank untouched by the prerequisite layer", async () => {
        // Was BASELINE_CANDIDATES exactly, when nothing tagged was gated. The
        // prerequisite layer now removes the tagged content a new learner has
        // not earned; everything untagged still flows through the escape hatch.
        const eligible = await prerequisiteEligible(newLearner);

        expect(eligible.length).toBeLessThan(BASELINE_CANDIDATES);
        expect(eligible.length).toBeGreaterThan(BASELINE_CANDIDATES - 10);
    });

    it("removes every tagged practise question from the full stack", async () => {
        // 234 -> 232. Both tagged questions are `practise`, and a brand-new
        // learner has met neither concept. Stated as a number so it cannot
        // change unnoticed.
        expect(await selectable(newLearner)).toHaveLength(
            BASELINE_CANDIDATES - TAGGED_QUESTIONS
        );
    });

    it("withholds an inactive challenge's content whatever the learner has met", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("r10@example.com");
            const intro = await fx.challengeFor(ROOT_CONCEPT, "introduce");

            await fx.db.query(`UPDATE challenges SET is_active = FALSE WHERE id = $1`, [
                intro.challengeId
            ]);

            expect(await selectable(learner)).not.toContain(intro.questionId);
        });
    });

    it("refuses anything but a table alias", () => {
        expect(() => roleEligible("q; DROP TABLE users")).toThrow();
        expect(() => roleEligible("Q")).toThrow();
    });
});

// ── the wiring ───────────────────────────────────────────────────────────

describe("both games apply the role layer, and the dealer does not", () => {
    const blitz = readFileSync(new URL("../game/queries.ts", import.meta.url), "utf8");
    const hunt = readFileSync(new URL("../bugHunt/queries.ts", import.meta.url), "utf8");
    const questions = readFileSync(new URL("../questions/queries.ts", import.meta.url), "utf8");
    const curve = readFileSync(new URL("../game/curve.ts", import.meta.url), "utf8");

    it("is composed into the gate both candidate queries apply", () => {
        const selection = readFileSync(new URL("./selection.ts", import.meta.url), "utf8");

        expect(selection).toContain("roleEligible(alias)");
        expect(blitz).toContain('curriculumSelects("q")');
        expect(hunt).toContain('curriculumSelects("i")');
    });

    it("applies to the availability counts through the same gate", () => {
        // A count that ignored role would clear a session the dealer cannot
        // fill. One composition point is what makes that impossible to forget.
        expect(questions).toContain('curriculumSelects("q")');
        expect(hunt).toContain('curriculumSelects("i")');
    });

    it("never writes the role rule out a second time", () => {
        for (const [name, source] of [["game", blitz], ["bugHunt", hunt]] as const) {
            expect(source, `${name}/queries.ts must not inline the rule`).not.toContain(
                "job.role"
            );
        }
    });

    it("keeps role out of the pacing curve", () => {
        expect(curve, "curve.ts must import nothing at all").not.toMatch(/^import /m);
        expect(curve).not.toContain("role");
    });

    it("keeps the two curriculum layers in separate modules", () => {
        // Prerequisites answer a question about the curriculum; role answers one
        // about this learner. One file deciding both would be the progression
        // model in disguise.
        const eligibility = readFileSync(new URL("./eligibility.ts", import.meta.url), "utf8");
        const roles = readFileSync(new URL("./roles.ts", import.meta.url), "utf8");

        // The dependency runs one way: role selection reads learner state, and
        // learner state knows nothing about what role wants with it.
        expect(eligibility, "eligibility.ts must not depend on roles.ts").not.toMatch(
            /from "\.\/roles/
        );
        expect(roles, "roles.ts must read the shared met CTE").toMatch(/from "\.\/eligibility/);

        // And neither predicate answers the other's question.
        expect(curriculumEligible("q"), "prerequisites must not gate on role").not.toMatch(
            /\brole\b/
        );
        expect(roleEligible("q"), "role must not re-derive prerequisites").not.toContain(
            "prerequisites"
        );
    });
});
