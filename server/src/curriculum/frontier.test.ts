import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { difficultyCeilingCte, metDifficultiesCte, withinFrontier } from "./frontier.js";
import { curriculumCtes, curriculumSelects } from "./selection.js";
import { ELIGIBLE_QUESTION_PREDICATE } from "../questions/queries.js";
import { ELIGIBLE_INCIDENT_PREDICATE } from "../bugHunt/queries.js";

/**
 * The curriculum practice frontier, executed against a real PostgreSQL.
 *
 * The rung under test is how DEMANDING an exercise is (challenges.difficulty),
 * never how much time pressure it carries (questions.difficulty). Several tests
 * below exist purely to keep those two apart.
 *
 * The fixture concept is `primitive-types` throughout: the curriculum's only
 * root, so nothing prerequisite-related can interfere, and seed 016 already
 * gives it an introduction so the learner can be moved past the role gate the
 * way a real learner is.
 */

const CONCEPT = "primitive-types";

/** Seeded: one practise challenge at difficulty 1, one question behind it. */
const SEEDED_PRACTICE_PROMPT = 'What does this log?\n\nconsole.log(typeof "5", typeof 5);';

let fx: CurriculumFixture;
let seededPracticeId: string;

beforeAll(async () => {
    fx = await buildCurriculumFixture();

    const [seeded] = await fx.rows<{ id: string }>(
        `SELECT id FROM questions WHERE prompt = $1`,
        [SEEDED_PRACTICE_PROMPT]
    );

    seededPracticeId = seeded!.id;
}, 120_000);

// ── the production stack, and the layer beneath it ───────────────────────

/** Exactly what createSessionWithQuestions selects, composition point and all. */
async function selectable(userId: string): Promise<string[]> {
    const found = await fx.rows<{ id: string }>(
        `WITH ${curriculumCtes("$1")}
         SELECT q.id FROM questions q
         WHERE ${ELIGIBLE_QUESTION_PREDICATE}
           AND ${curriculumSelects("q")}
         ORDER BY q.id`,
        [userId]
    );

    return found.map((r) => r.id);
}

async function selectableIncidents(userId: string): Promise<string[]> {
    const found = await fx.rows<{ slug: string }>(
        `WITH ${curriculumCtes("$1")}
         SELECT i.slug FROM bug_hunt_incidents i
         WHERE ${ELIGIBLE_INCIDENT_PREDICATE}
           AND ${curriculumSelects("i")}`,
        [userId]
    );

    return found.map((r) => r.slug);
}

/** The frontier layer alone, so it can be told apart from the two above it. */
async function withinFrontierOnly(userId: string): Promise<string[]> {
    const found = await fx.rows<{ id: string }>(
        `WITH ${difficultyCeilingCte("$1")}
         SELECT q.id FROM questions q
         WHERE ${ELIGIBLE_QUESTION_PREDICATE}
           AND ${withinFrontier("q")}`,
        [userId]
    );

    return found.map((r) => r.id);
}

/**
 * A learner who has legitimately ARRIVED at the concept: they have completed
 * its introduction and the introductions of everything it directly requires.
 *
 * The prerequisites matter now in a way they did not before. Seed 019 gave
 * every concept with an authored lesson an introduction, so primitive-types'
 * prerequisite is teachable, and an unmet teachable prerequisite withholds the
 * concept's practice entirely -- correctly, and one layer above the one these
 * tests are about. Completing them here isolates the frontier, which is what
 * this file exists to measure; without it every assertion below fails for a
 * reason that has nothing to do with difficulty rungs.
 *
 * Direct prerequisites only, matching curriculumEligible, which does not walk
 * the graph.
 */
async function introducedLearner(email: string, concept: string = CONCEPT): Promise<string> {
    const learner = await fx.insertUser(email);

    await fx.db.query(
        `INSERT INTO introduction_completions (user_id, challenge_id)
         SELECT $1, ch.id
         FROM challenges ch
         JOIN concepts c ON c.id = ch.concept_id
         WHERE ch.role = 'introduce'
           AND ch.is_active
           AND (
               c.slug = $2
               OR c.id IN (
                   SELECT p.requires_id
                   FROM prerequisites p
                   JOIN concepts target ON target.id = p.concept_id
                   WHERE target.slug = $2
               )
           )
         ON CONFLICT DO NOTHING`,
        [learner, concept]
    );

    return learner;
}

/** Three practice rungs on one concept, each behind its own question. */
async function threeRungs() {
    return {
        one: seededPracticeId,
        two: (await fx.challengeFor(CONCEPT, "practise", { difficulty: 2 })).questionId,
        three: (await fx.challengeFor(CONCEPT, "practise", { difficulty: 3 })).questionId
    };
}

// ── 1 · the frontier opens at the bottom ─────────────────────────────────

describe("1 · a learner who has just met a concept starts at its lowest rung", () => {
    it("offers difficulty 1 and withholds 2 and 3", async () => {
        await fx.scenario(async () => {
            const learner = await introducedLearner("f1@example.com");
            const rung = await threeRungs();
            const offered = await selectable(learner);

            expect(offered, "the lowest rung is where practice starts").toContain(rung.one);
            expect(offered).not.toContain(rung.two);
            expect(offered).not.toContain(rung.three);
        });
    });

    it("withholds on the rung, not on role -- the concept has been met", async () => {
        // The distinction between this layer and the one above it. Role is
        // satisfied the moment the concept is encountered; the frontier still
        // has something to say about which exercise.
        await fx.scenario(async () => {
            const learner = await introducedLearner("f1b@example.com");
            const rung = await threeRungs();

            const roleWouldAllow = await fx.rows<{ id: string }>(
                `WITH ${curriculumCtes("$1")}
                 SELECT q.id FROM questions q WHERE q.id = $2`,
                [learner, rung.two]
            );

            expect(roleWouldAllow, "the row exists and the concept is met").toHaveLength(1);
            expect(await selectable(learner)).not.toContain(rung.two);
        });
    });
});

// ── 2 · the frontier advances on exposure ────────────────────────────────

describe("2 · facing a rung opens the next one", () => {
    it("opens difficulty 2 once difficulty 1 has been faced", async () => {
        await fx.scenario(async () => {
            const learner = await introducedLearner("f2@example.com");
            const rung = await threeRungs();

            await fx.encounter(learner, rung.one, "answered");

            const offered = await selectable(learner);

            expect(offered).toContain(rung.two);
            expect(offered, "difficulty 3 is still a rung away").not.toContain(rung.three);
        });
    });

    it("opens difficulty 3 once 1 and 2 have both been faced", async () => {
        await fx.scenario(async () => {
            const learner = await introducedLearner("f2b@example.com");
            const rung = await threeRungs();

            await fx.encounter(learner, rung.one, "answered");
            await fx.encounter(learner, rung.two, "answered");

            expect(await selectable(learner)).toContain(rung.three);
        });
    });

    it("keeps the easier rungs available -- a ceiling, not a step", async () => {
        // The explicit requirement: reaching difficulty 2 must not retire
        // difficulty 1. Nothing here is one-way.
        await fx.scenario(async () => {
            const learner = await introducedLearner("f2c@example.com");
            const rung = await threeRungs();

            await fx.encounter(learner, rung.one, "answered");

            const offered = await selectable(learner);

            expect(offered, "difficulty 1 stays on the table").toContain(rung.one);
            expect(offered).toContain(rung.two);
        });
    });

    it("stays at the top rung once every rung has been faced", async () => {
        await fx.scenario(async () => {
            const learner = await introducedLearner("f2d@example.com");
            const rung = await threeRungs();

            for (const q of [rung.one, rung.two, rung.three]) {
                await fx.encounter(learner, q, "answered");
            }

            const offered = await selectable(learner);

            expect(offered).toContain(rung.one);
            expect(offered).toContain(rung.two);
            expect(offered).toContain(rung.three);
        });
    });

    it("does not withdraw a rung reached out of order", async () => {
        // available {1,2,3}, faced {1,3} -> ceiling 3 -> eligible {1,2,3}.
        //
        // THE REGRESSION THIS FILE EXISTS FOR. The first version of the rule
        // took the lowest UNFACED rung, which made difficulty 3 disappear here
        // until the learner went back through 2 -- a ceiling that could fall.
        // Games are different modalities and exposure is not perfectly ordered;
        // taking something away because the order was untidy punishes the
        // learner for how the content happened to be dealt.
        await fx.scenario(async () => {
            const learner = await introducedLearner("f2e@example.com");
            const rung = await threeRungs();

            await fx.encounter(learner, rung.one, "answered");
            await fx.encounter(learner, rung.three, "answered");

            const offered = await selectable(learner);

            expect(offered).toContain(rung.one);
            expect(offered, "the skipped rung is still offered").toContain(rung.two);
            expect(offered, "and the reached rung is NOT withdrawn").toContain(rung.three);
        });
    });

    it("reaches the top from a single high encounter", async () => {
        // faced {3} alone: nothing above 3, so the ceiling is the top rung and
        // everything below it comes with.
        await fx.scenario(async () => {
            const learner = await introducedLearner("f2f@example.com");
            const rung = await threeRungs();

            await fx.encounter(learner, rung.three, "answered");

            const offered = await selectable(learner);

            expect(offered).toContain(rung.one);
            expect(offered).toContain(rung.two);
            expect(offered).toContain(rung.three);
        });
    });

    it("rises one rung at a time from the bottom", async () => {
        // The ordinary path, pinned as a sequence rather than three separate
        // facts: 1 -> {1,2} -> {1,2,3}.
        await fx.scenario(async () => {
            const learner = await introducedLearner("f2g@example.com");
            const rung = await threeRungs();

            expect(await selectable(learner)).not.toContain(rung.two);

            await fx.encounter(learner, rung.one, "answered");
            expect(await selectable(learner)).toContain(rung.two);
            expect(await selectable(learner)).not.toContain(rung.three);

            await fx.encounter(learner, rung.two, "answered");
            expect(await selectable(learner)).toContain(rung.three);
        });
    });
});

// ── 3 · exposure, not mastery ────────────────────────────────────────────

describe("3 · the frontier moves on exposure, never on correctness", () => {
    for (const status of ["answered", "timed_out"] as const) {
        it(`advances after a ${status} question`, async () => {
            await fx.scenario(async () => {
                const learner = await introducedLearner(`f3-${status}@example.com`);
                const rung = await threeRungs();

                await fx.encounter(learner, rung.one, status);

                expect(await selectable(learner)).toContain(rung.two);
            });
        });
    }

    it("advances even when the answer was wrong", async () => {
        await fx.scenario(async () => {
            const learner = await introducedLearner("f3-wrong@example.com");
            const rung = await threeRungs();
            const [session] = await fx.rows<{ id: string }>(
                `INSERT INTO game_sessions (user_id, game_id, status, completed_at)
                 VALUES ($1, (SELECT id FROM games WHERE slug = 'code-blitz'),
                         'completed', CURRENT_TIMESTAMP)
                 RETURNING id`,
                [learner]
            );

            await fx.db.query(
                `INSERT INTO session_questions
                     (game_session_id, question_id, display_order, prompt_text, status,
                      served_at, answered_at, is_correct, selected_option_id,
                      selected_option_text, correct_option_text)
                 SELECT $1, $2, 1, 'p', 'answered',
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, FALSE,
                        o.id, o.option_text, 'x'
                 FROM question_options o
                 WHERE o.question_id = $2 AND NOT o.is_correct
                 LIMIT 1`,
                [session!.id, rung.one]
            );

            expect(
                await selectable(learner),
                "exposure is the signal; correctness belongs to a mastery layer"
            ).toContain(rung.two);
        });
    });

    it("does not advance on a question that was dealt but never faced", async () => {
        await fx.scenario(async () => {
            const learner = await introducedLearner("f3-pending@example.com");
            const rung = await threeRungs();

            await fx.encounter(learner, rung.one, "pending");

            expect(await selectable(learner)).not.toContain(rung.two);
        });
    });

    it("does not advance on the introduction", async () => {
        // Completing a Learn Beat says the CONCEPT was met. It says nothing
        // about having stood on a practice rung, which is why
        // introduction_completions is absent from this derivation.
        expect(metDifficultiesCte("$1")).not.toContain("introduction_completions");

        await fx.scenario(async () => {
            const learner = await introducedLearner("f3-intro@example.com");
            const rung = await threeRungs();

            expect(await selectable(learner)).not.toContain(rung.two);
        });
    });
});

// ── 4 · one frontier, shared across games ────────────────────────────────

describe("4 · the frontier belongs to the learner, not to a game", () => {
    it("lets a Bug Hunt round advance a Code Blitz rung", async () => {
        await fx.scenario(async () => {
            const learner = await introducedLearner("f4a@example.com");
            const one = await fx.challengeFor(CONCEPT, "practise", { difficulty: 1 });
            const slug = await fx.attachIncident(one.challengeId);
            const two = await fx.challengeFor(CONCEPT, "practise", { difficulty: 2 });

            expect(await selectable(learner)).not.toContain(two.questionId);

            await fx.encounterIncident(learner, slug, "resolved");

            expect(await selectable(learner)).toContain(two.questionId);
        });
    });

    it("lets a Code Blitz answer advance a Bug Hunt rung", async () => {
        await fx.scenario(async () => {
            const learner = await introducedLearner("f4b@example.com");
            const rung = await threeRungs();
            const two = await fx.challengeFor(CONCEPT, "practise", { difficulty: 2 });
            const slug = await fx.attachIncident(two.challengeId);

            expect(await selectableIncidents(learner)).not.toContain(slug);

            await fx.encounter(learner, rung.one, "answered");

            expect(await selectableIncidents(learner)).toContain(slug);
        });
    });

    it("counts a failed hunt as exposure, the same as a timed-out question", async () => {
        await fx.scenario(async () => {
            const learner = await introducedLearner("f4c@example.com");
            const one = await fx.challengeFor(CONCEPT, "practise", { difficulty: 1 });
            const slug = await fx.attachIncident(one.challengeId);
            const two = await fx.challengeFor(CONCEPT, "practise", { difficulty: 2 });

            await fx.encounterIncident(learner, slug, "failed");

            expect(await selectable(learner)).toContain(two.questionId);
        });
    });
});

// ── 5 · the frontier is per concept ──────────────────────────────────────

describe("5 · rungs are counted per concept, not globally", () => {
    it("does not let progress on one concept open another's second rung", async () => {
        await fx.scenario(async () => {
            const learner = await introducedLearner("f5@example.com");
            const rung = await threeRungs();

            // A second concept, introduced and with two rungs of its own.
            const otherIntro = await fx.challengeFor("equality", "introduce");
            const otherTwo = await fx.challengeFor("equality", "practise", { difficulty: 2 });

            await fx.db.query(
                `INSERT INTO introduction_completions (user_id, challenge_id) VALUES ($1, $2)`,
                [learner, otherIntro.challengeId]
            );
            await fx.encounter(learner, rung.one, "answered");

            const offered = await selectable(learner);

            expect(offered, "primitive-types advanced").toContain(rung.two);
            expect(offered, "equality did not").not.toContain(otherTwo.questionId);
        });
    });

    it("measures a rung per difficulty, not per exercise", async () => {
        // equality ships two practice challenges at difficulty 2. Facing either
        // means the rung has been stood on -- the frontier is about how
        // demanding a level the learner has reached, not about exhausting the
        // exercises at it. Coverage is a different question.
        await fx.scenario(async () => {
            const learner = await introducedLearner("f5b@example.com");
            const first = await fx.challengeFor(CONCEPT, "practise", { difficulty: 2 });
            const second = await fx.challengeFor(CONCEPT, "practise", { difficulty: 2 });
            const third = await fx.challengeFor(CONCEPT, "practise", { difficulty: 3 });

            await fx.encounter(learner, seededPracticeId, "answered");
            await fx.encounter(learner, first.questionId, "answered");

            const offered = await selectable(learner);

            expect(offered, "the other difficulty-2 exercise stays available").toContain(
                second.questionId
            );
            expect(offered, "and the rung above has opened").toContain(third.questionId);
        });
    });
});

// ── 6 · per-learner isolation ────────────────────────────────────────────

describe("6 · one learner's rung is not another's", () => {
    it("advances only the learner who did the practice", async () => {
        await fx.scenario(async () => {
            const studious = await introducedLearner("f6a@example.com");
            const bystander = await introducedLearner("f6b@example.com");
            const rung = await threeRungs();

            await fx.encounter(studious, rung.one, "answered");

            expect(await selectable(studious)).toContain(rung.two);
            expect(await selectable(bystander)).not.toContain(rung.two);
        });
    });
});

// ── 7 · the two difficulty systems stay apart ────────────────────────────

describe("7 · curriculum difficulty and pacing difficulty are different numbers", () => {
    it("gates on challenges.difficulty and never on questions.difficulty", () => {
        const rule = withinFrontier("q");

        expect(rule).toContain("rung.difficulty");
        expect(rule, "pacing is not this layer's business").not.toContain("q.difficulty");
    });

    it("leaves the pacing curve unable to see curriculum difficulty", () => {
        const curve = readFileSync(new URL("../game/curve.ts", import.meta.url), "utf8");

        expect(curve, "curve.ts imports nothing at all").not.toMatch(/^import /m);
        expect(curve).not.toContain("challenge");
        expect(curve).not.toContain("concept_id");
    });

    it("withholds a hard-to-pace question that is an easy curriculum rung", async () => {
        // The example the distinction exists for. This question is
        // questions.difficulty 4 -- the dealer will treat it as a late,
        // high-pressure slot -- while its challenge is a difficulty-1
        // introductory drill. Both numbers apply, and neither is the other.
        await fx.scenario(async () => {
            const learner = await introducedLearner("f7@example.com");
            const easyRung = await fx.challengeFor(CONCEPT, "practise", { difficulty: 1 });

            await fx.db.query(`UPDATE questions SET difficulty = 4 WHERE id = $1`, [
                easyRung.questionId
            ]);

            const [row] = await fx.rows<{ pacing: number; curriculum: number }>(
                `SELECT q.difficulty AS pacing, ch.difficulty AS curriculum
                 FROM questions q JOIN challenges ch ON ch.id = q.challenge_id
                 WHERE q.id = $1`,
                [easyRung.questionId]
            );

            expect(row!.pacing).toBe(4);
            expect(row!.curriculum).toBe(1);
            expect(
                await selectable(learner),
                "an easy rung is offered however hard it is to pace"
            ).toContain(easyRung.questionId);
        });
    });

    it("changes no existing question difficulty", async () => {
        // The seeded bank's pacing values are untouched by this slice.
        const [spread] = await fx.rows<{ d1: number; d2: number; d3: number; d4: number }>(
            `SELECT COUNT(*) FILTER (WHERE difficulty = 1)::INT d1,
                    COUNT(*) FILTER (WHERE difficulty = 2)::INT d2,
                    COUNT(*) FILTER (WHERE difficulty = 3)::INT d3,
                    COUNT(*) FILTER (WHERE difficulty = 4)::INT d4
             FROM questions q WHERE ${ELIGIBLE_QUESTION_PREDICATE}`
        );

        // d1 has risen from 78 to 99 as seeds 020 and 021 added beginner
        // practice, all of it pacing difficulty 1. Nothing EXISTING moved,
        // which is what this test actually guards.
        expect(spread).toEqual({ d1: 99, d2: 81, d3: 52, d4: 23 });
    });
});

// ── 8 · everything below is unchanged ────────────────────────────────────

describe("8 · the layers below the frontier still behave", () => {
    it("leaves untagged content untouched", async () => {
        await fx.scenario(async () => {
            const learner = await introducedLearner("f8@example.com");
            const untagged = await fx.rows<{ id: string }>(
                `SELECT q.id FROM questions q
                 WHERE q.challenge_id IS NULL AND ${ELIGIBLE_QUESTION_PREDICATE}`
            );
            const offered = await selectable(learner);

            for (const q of untagged) {
                expect(offered, `untagged ${q.id}`).toContain(q.id);
            }
        });
    });

    it("does not gate an introduction, which has no rung", async () => {
        const rule = withinFrontier("q");

        expect(rule).toContain("rung.role <> 'practise'");
    });

    it("still needs the concept introduced first", async () => {
        // The frontier does not bypass the role layer. A learner who has met
        // nothing gets no practice, whatever rung it sits on.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("f8c@example.com");

            expect(await selectable(learner)).not.toContain(seededPracticeId);
            expect(
                await withinFrontierOnly(learner),
                "the frontier alone would have allowed it"
            ).toContain(seededPracticeId);
        });
    });

    it("leaves the seeded Learn -> Play loop working end to end", async () => {
        await fx.scenario(async () => {
            const learner = await introducedLearner("f8d@example.com");

            expect(
                await selectable(learner),
                "primitive-types has one rung, so it opens immediately"
            ).toContain(seededPracticeId);
        });
    });

    it("withholds equality's difficulty-2 incidents until its rung 1 is faced", async () => {
        // The one place the frontier bites on real seeded content: equality
        // ships a difficulty-1 question and two difficulty-2 incidents.
        await fx.scenario(async () => {
            // Arrives at equality properly: its own introduction plus those of
            // comparison-operators and type-coercion, both of which gained
            // lessons in seed 019 and would otherwise withhold equality's
            // practice one layer above the frontier.
            const learner = await introducedLearner("f8e@example.com", "equality");
            const [question] = await fx.rows<{ id: string }>(
                `SELECT q.id FROM questions q
                 JOIN challenges ch ON ch.id = q.challenge_id
                 JOIN concepts c ON c.id = ch.concept_id
                 WHERE c.slug = 'equality'`
            );

            expect(await selectable(learner), "rung 1 opens").toContain(question!.id);
            expect(await selectableIncidents(learner), "rung 2 does not").not.toContain(
                "order-lookup-string-id"
            );

            await fx.encounter(learner, question!.id, "answered");

            expect(await selectableIncidents(learner)).toContain("order-lookup-string-id");
            expect(await selectableIncidents(learner)).toContain("profile-clear-field-null");
        });
    });
});

// ── the wiring ───────────────────────────────────────────────────────────

describe("the frontier is composed like the layers above it", () => {
    const blitz = readFileSync(new URL("../game/queries.ts", import.meta.url), "utf8");
    const hunt = readFileSync(new URL("../bugHunt/queries.ts", import.meta.url), "utf8");
    const questions = readFileSync(new URL("../questions/queries.ts", import.meta.url), "utf8");
    const selection = readFileSync(new URL("./selection.ts", import.meta.url), "utf8");

    it("is part of the single composition point", () => {
        expect(selection).toContain("withinFrontier(alias)");
        expect(selection).toContain("difficultyCeilingCte(userParam)");
    });

    it("reaches both games and both availability counts through it", () => {
        expect(blitz).toContain('curriculumSelects("q")');
        expect(hunt).toContain('curriculumSelects("i")');
        expect(questions).toContain('curriculumSelects("q")');
    });

    it("is never written out a second time in a game's query", () => {
        for (const [name, source] of [["game", blitz], ["bugHunt", hunt]] as const) {
            expect(source, `${name}/queries.ts must not inline the frontier`).not.toContain(
                "met_difficulties"
            );
        }
    });

    it("keeps its own module rather than joining the two below it", () => {
        const eligibility = readFileSync(new URL("./eligibility.ts", import.meta.url), "utf8");
        const roles = readFileSync(new URL("./roles.ts", import.meta.url), "utf8");

        expect(eligibility).not.toContain("met_difficulties");
        expect(roles).not.toContain("met_difficulties");
        expect(withinFrontier("q"), "the frontier does not re-derive prerequisites").not.toContain(
            "prerequisites"
        );
    });

    it("refuses anything but a table alias or a placeholder", () => {
        expect(() => withinFrontier("q; DROP TABLE users")).toThrow();
        expect(() => metDifficultiesCte("1")).toThrow();
    });
});
