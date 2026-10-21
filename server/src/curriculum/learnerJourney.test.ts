import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { metConceptsCte } from "./eligibility.js";
import { difficultyCeilingCte, metDifficultiesCte } from "./frontier.js";
import { demandCeilingCte, metDemandsCte } from "./demand.js";
import {
    COMPLETABLE_INTRODUCTION_SQL,
    NEXT_INTRODUCTION_SQL,
    RECORD_INTRODUCTION_SQL
} from "./queries.js";
import { CODE_BLITZ_CANDIDATES_SQL, byCurriculumPreference } from "../game/queries.js";
import { dealSession } from "../game/curve.js";
import { QUESTIONS_PER_SESSION } from "../game/scoring.js";

/**
 * One learner, one concept, all the way through.
 *
 *     fresh learner -> introduction owed -> Learn Beat completed
 *       -> practice released -> Code Blitz actually deals it
 *       -> answered -> exposure recorded -> next session sees the new state
 *
 * Every step runs the SHIPPING artefact: the exported SQL statements, the
 * exported candidate query, the real byCurriculumPreference, and the real
 * dealSession. Nothing is re-typed, so this cannot pass against a copy of the
 * pipeline that has drifted from the one in production.
 *
 * The layer-by-layer suites live next door and are unchanged. This file exists
 * to prove they connect.
 */

/** Seeded by 016: primitive-types, introduce at recognise + practise at predict. */
/*
 * THE SEEDED PRACTICE FOR primitive-types.
 *
 * Was `console.log(typeof "5", typeof 5)`. That is a typeof question and typeof
 * comes after primitive-types, so the concept's only exercise required the
 * concept that follows it; seed 029 moved it and seed 030 gave primitive-types
 * practice of its own. The concept under test is unchanged -- only which
 * question is its one tagged exercise.
 *
 * Then `console.log(7 / 2)`, which is arithmetic; seed 086 rewrote that row in
 * place to a question about kinds of value.
 */
const PRACTICE_PROMPT = 'What does this log?\n\nconsole.log("true");\nconsole.log(true);';

let fx: CurriculumFixture;
let practiceId: string;

beforeAll(async () => {
    fx = await buildCurriculumFixture();

    const [practice] = await fx.rows<{ id: string }>(
        `SELECT id FROM questions WHERE prompt = $1`,
        [PRACTICE_PROMPT]
    );

    practiceId = practice!.id;
}, 120_000);

// ── the shipping pipeline, driven exactly as the route drives it ─────────

interface Row {
    id: string;
    difficulty: number | null;
    topic: string | null;
    prompt: string;
    challenge_id: string | null;
    concept_id: string | null;
    role: string | null;
    challenge_difficulty: number | null;
    demand_order: number | null;
    difficulty_ceiling: number | null;
    demand_ceiling: number | null;
    seen_recently: boolean;
}

/** What createSessionWithQuestions would fetch for this learner. */
async function candidates(userId: string): Promise<Row[]> {
    // $1 is the session being created, excluded from its own lookback. No such
    // session exists mid-test, and 0 is an id no row can have.
    return fx.rows<Row>(CODE_BLITZ_CANDIDATES_SQL, ["0", userId, "code-blitz"]);
}

/** What the player would actually be dealt. Deterministic random, real dealer. */
async function dealt(userId: string): Promise<Row[]> {
    return dealSession(
        byCurriculumPreference(await candidates(userId)),
        QUESTIONS_PER_SESSION,
        () => 0.5
    );
}

async function introduction(userId: string) {
    const found = await fx.rows<{ challengeId: string; conceptSlug: string }>(
        NEXT_INTRODUCTION_SQL,
        [userId]
    );

    return found[0] ?? null;
}

/** Exactly what POST /introductions/:id/complete does. */
/**
 * Walks the journey until `concept` is the one on offer.
 *
 * The curriculum has a root ahead of primitive-types now: seed 019 connected
 * every authored lesson, so a brand-new learner is offered console-output and
 * primitive-types sits two steps in. This file uses primitive-types as its
 * specimen for the Learn -> Play loop, not as a claim about what comes first,
 * so it arrives there the way a learner does.
 */
async function arriveAt(userId: string, concept: string): Promise<void> {
    for (let step = 0; step < 10; step += 1) {
        const next = await introduction(userId);

        if (next === null || next === undefined || next.conceptSlug === concept) return;

        await completeIntroduction(userId, next.challengeId);
    }

    throw new Error(`never reached ${concept}`);
}

async function completeIntroduction(userId: string, challengeId: string): Promise<void> {
    const allowed = await fx.rows(COMPLETABLE_INTRODUCTION_SQL, [userId, challengeId]);

    expect(allowed, "the route would have 404ed").toHaveLength(1);
    await fx.db.query(RECORD_INTRODUCTION_SQL, [userId, challengeId]);
}

/** Answers a question the way the game records it. */
async function answer(userId: string, questionId: string, correct = true): Promise<void> {
    const [session] = await fx.rows<{ id: string }>(
        `INSERT INTO game_sessions (user_id, game_id, status, completed_at)
         VALUES ($1, (SELECT id FROM games WHERE slug = 'code-blitz'),
                 'completed', CURRENT_TIMESTAMP)
         RETURNING id`,
        [userId]
    );

    await fx.db.query(
        `INSERT INTO session_questions
             (game_session_id, question_id, display_order, prompt_text, status,
              served_at, answered_at, is_correct, selected_option_id,
              selected_option_text, correct_option_text)
         SELECT $1, $2, 1, 'p', 'answered',
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $3, o.id, o.option_text, o.option_text
         FROM question_options o
         WHERE o.question_id = $2 AND o.is_active AND o.is_correct = $3
         LIMIT 1`,
        [session!.id, questionId, correct]
    );
}

/** The learner's derived curriculum state, in one place. */
async function state(userId: string) {
    const [concepts, difficulties, demands] = await Promise.all([
        fx.rows<{ slug: string }>(
            `WITH ${metConceptsCte("$1")}
             SELECT c.slug FROM met JOIN concepts c ON c.id = met.concept_id`,
            [userId]
        ),
        fx.rows<{ slug: string; difficulty: number }>(
            `WITH ${metDifficultiesCte("$1")}
             SELECT c.slug, md.difficulty FROM met_difficulties md
             JOIN concepts c ON c.id = md.concept_id`,
            [userId]
        ),
        fx.rows<{ slug: string; demand: string }>(
            `WITH ${metDemandsCte("$1")}
             SELECT c.slug, d.slug AS demand FROM met_demands md
             JOIN concepts c ON c.id = md.concept_id
             JOIN demands d  ON d.display_order = md.demand_order`,
            [userId]
        )
    ]);

    return {
        concepts: concepts.map((r) => r.slug).sort(),
        difficulties: difficulties.map((r) => `${r.slug}:${r.difficulty}`).sort(),
        demands: demands.map((r) => `${r.slug}:${r.demand}`).sort()
    };
}

async function ceilings(userId: string, concept: string) {
    const [row] = await fx.rows<{ difficulty: number; demand: string }>(
        `WITH ${difficultyCeilingCte("$1")},
              ${demandCeilingCte("$1")}
         SELECT dc.ceiling AS difficulty, d.slug AS demand
         FROM concepts c
         LEFT JOIN difficulty_ceiling dc ON dc.concept_id = c.id
         LEFT JOIN demand_ceiling mc     ON mc.concept_id = c.id
         LEFT JOIN demands d             ON d.display_order = mc.ceiling_order
         WHERE c.slug = $2`,
        [userId, concept]
    );

    return row!;
}

// ── 1-3 · fresh learner, Learn, then Play ────────────────────────────────

describe("a fresh learner is taught before being tested", () => {
    it("1 · is owed the curriculum's root introduction", async () => {
        // console-output, not primitive-types: the root became reachable when
        // seed 019 connected the authored lessons to the curriculum.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j1@example.com");

            expect((await introduction(learner))?.conceptSlug).toBe("console-output");
        });
    });

    it("1b · is not yet offered its practice", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j1b@example.com");
            await arriveAt(learner, "primitive-types");

            expect((await candidates(learner)).map((r) => r.id)).not.toContain(practiceId);
        });
    });

    it("2 · completing the Learn Beat releases the practice", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j2@example.com");
            await arriveAt(learner, "primitive-types");
            const owed = await introduction(learner);

            await completeIntroduction(learner, owed!.challengeId);

            expect((await candidates(learner)).map((r) => r.id)).toContain(practiceId);
            expect(
                (await introduction(learner))?.conceptSlug,
                "primitive-types is no longer owed; the journey has moved on"
            ).not.toBe("primitive-types");
        });
    });

    it("3 · Code Blitz actually deals it", async () => {
        // Not "is a candidate" -- is in the ten the player would be handed, by
        // the real dealer, from the real query.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j3@example.com");
            await arriveAt(learner, "primitive-types");
            const owed = await introduction(learner);

            await completeIntroduction(learner, owed!.challengeId);

            const run = await dealt(learner);

            expect(run).toHaveLength(QUESTIONS_PER_SESSION);
            expect(run.map((r) => r.id)).toContain(practiceId);
        });
    });

    it("3b · and does not deal it before the introduction", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j3b@example.com");
            await arriveAt(learner, "primitive-types");
            const run = await dealt(learner);

            expect(run).toHaveLength(QUESTIONS_PER_SESSION);
            expect(run.map((r) => r.id)).not.toContain(practiceId);
        });
    });
});

// ── 4-6 · playing it changes what comes next ─────────────────────────────

describe("answering the practice moves the learner's curriculum state", () => {
    it("4 · records concept, difficulty and demand exposure", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j4@example.com");
            await arriveAt(learner, "primitive-types");
            const owed = await introduction(learner);

            await completeIntroduction(learner, owed!.challengeId);

            const before = await state(learner);

            // Arriving here met the concepts in front of primitive-types, so
            // the baseline is "introductions only" rather than "nothing".
            expect(before.concepts, "the introduction alone").toContain("primitive-types");
            expect(before.difficulties, "no rung stood on yet").toEqual([]);
            expect(before.demands, "no thinking done yet").toEqual([]);

            await answer(learner, practiceId);

            const after = await state(learner);

            // An introduction is an encounter; a rung and a demand are only
            // recorded by PLAYING. That distinction is what this test protects.
            expect(after.concepts).toEqual(before.concepts);
            expect(after.difficulties).toEqual(["primitive-types:1"]);
            expect(after.demands).toEqual(["primitive-types:predict"]);
        });
    });

    it("5 · the ceilings move with it", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j5@example.com");
            await arriveAt(learner, "primitive-types");
            const owed = await introduction(learner);

            await completeIntroduction(learner, owed!.challengeId);

            expect(await ceilings(learner, "primitive-types")).toEqual({
                difficulty: 1,
                demand: "recognise"
            });

            await answer(learner, practiceId);

            expect(
                await ceilings(learner, "primitive-types"),
                "one rung of content, so the difficulty ceiling stays; demand advances"
            ).toEqual({ difficulty: 1, demand: "predict" });
        });
    });

    it("6 · the next session's candidates reflect the new state", async () => {
        // A second rung authored at difficulty 2 is out of reach until the
        // first has been played, and reachable immediately after.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j6@example.com");
            await arriveAt(learner, "primitive-types");
            const owed = await introduction(learner);
            const harder = await fx.challengeFor("primitive-types", "practise", {
                difficulty: 2
            });

            await completeIntroduction(learner, owed!.challengeId);

            expect((await candidates(learner)).map((r) => r.id)).not.toContain(
                harder.questionId
            );

            await answer(learner, practiceId);

            expect((await candidates(learner)).map((r) => r.id)).toContain(harder.questionId);
        });
    });

    it("6b · and the policy puts the newly reached rung first", async () => {
        // byCurriculumPreference orders by distance from the frontier, so once
        // difficulty 2 is reachable it outranks the difficulty 1 the learner has
        // already stood on.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j6b@example.com");
            await arriveAt(learner, "primitive-types");
            const owed = await introduction(learner);
            const harder = await fx.challengeFor("primitive-types", "practise", {
                difficulty: 2
            });

            await completeIntroduction(learner, owed!.challengeId);
            await answer(learner, practiceId);

            const ordered = byCurriculumPreference(await candidates(learner));
            const tagged = ordered.filter((r) => r.concept_id !== null);

            // The newly reached rung leads the tagged content. Stated as
            // "ahead of the rung already stood on" rather than "is first
            // overall": the Values practice released on the way here is tagged
            // too, and where it sits is the policy's business, not this test's.
            const positions = tagged.map((r) => r.id);

            expect(positions.indexOf(harder.questionId)).toBeLessThan(
                positions.indexOf(practiceId)
            );
        });
    });
});

// ── 7 · isolation ────────────────────────────────────────────────────────

describe("7 · another learner is untouched", () => {
    it("keeps its own introduction owed and its own practice withheld", async () => {
        await fx.scenario(async () => {
            const studious = await fx.insertUser("j7a@example.com");
            await arriveAt(studious, "primitive-types");
            const bystander = await fx.insertUser("j7b@example.com");
            await arriveAt(bystander, "primitive-types");
            const owed = await introduction(studious);

            // What the bystander has purely from walking to the same place.
            // Compared against, rather than assumed empty, because arriving at
            // a concept now means meeting the ones in front of it.
            const untouched = await state(bystander);

            await completeIntroduction(studious, owed!.challengeId);
            await answer(studious, practiceId);

            expect((await introduction(bystander))?.conceptSlug).toBe("primitive-types");
            expect((await candidates(bystander)).map((r) => r.id)).not.toContain(practiceId);
            expect(await state(bystander)).toEqual(untouched);
        });
    });
});

// ── 8-9 · the transitional bank ──────────────────────────────────────────

describe("untagged content is transitional fallback, not curriculum content", () => {
    it("8 · fills a whole run for a learner who has met nothing", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j8@example.com");
            await arriveAt(learner, "primitive-types");
            const run = await dealt(learner);

            expect(run, "a fresh learner still gets a full game").toHaveLength(
                QUESTIONS_PER_SESSION
            );
            // This asserted that every dealt question was UNTAGGED, which was
            // true when the beginner topics held three legacy questions between
            // them. A learner who has walked to primitive-types is now dealt
            // the Values practice they just unlocked -- which is the outcome
            // this whole slice exists to produce.
            expect(
                run.some((r) => r.concept_id !== null),
                "curriculum content reaches the run"
            ).toBe(true);
        });
    });

    it("8b · is the whole pool, and the journey keeps it to one topic", async () => {
        // 25, not 232. Everything the learner is offered is untagged legacy
        // content, and all of it is `values` or `variables`, because the journey
        // gate holds a fresh learner at the start of the course. That number
        // falling from 232 to 25 IS the fix: before it, a beginner's closing
        // slots were drawn from async and scope.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j8b@example.com");
            await arriveAt(learner, "primitive-types");
            const pool = await candidates(learner);

            // THE TOPIC GATE IS THE CLAIM, not the ratio. A learner here is
            // offered Values and nothing else -- that is the fix this test was
            // written for, and it still holds.
            //
            // The ratio no longer does, and correctly so. `primitive-types` is
            // now Values #2 and `expressions-produce-values` sits behind
            // `arithmetic-operators`, so the six expression questions are
            // properly withheld from a learner who has not met arithmetic yet.
            // Asserting that tagged content outnumbers untagged was really
            // asserting how much content happened to be unlocked at one point in
            // the path, which is a content fact, not a gating one.
            expect(
                pool.some((r) => r.concept_id !== null),
                "curriculum content reaches the run"
            ).toBe(true);
            expect(new Set(pool.map((r) => r.topic))).toEqual(new Set(["values"]));
        });
    });

    it("9 · serving it advances no curriculum state whatsoever", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j9@example.com");
            await arriveAt(learner, "primitive-types");

            // The baseline is what walking here produced. The claim is that
            // playing UNTAGGED content adds nothing to it -- unchanged, not
            // empty.
            const before = await state(learner);
            /*
             * AUTHORED HERE SINCE SEED 079, which retired the legacy bank: a
             * learner at primitive-types is now dealt tagged Values content and
             * nothing else, so there is no untagged row in the pool to sample.
             *
             * The claim is unchanged and is the narrow one this test always
             * made -- serving untagged content moves no curriculum state. It
             * holds for any untagged row, because every arm of metConceptsCte
             * and CLEARED_RUNGS_CTE joins through questions.challenge_id, so
             * supplying the row is more honest than hoping the dealer offers
             * one. challenge_id is still nullable; the invariant still matters.
             */
            const [untagged] = await fx.rows<{ id: string }>(
                `INSERT INTO questions
                     (prompt, difficulty, topic, challenge_type, challenge_id, source)
                 VALUES ('untagged question, no rung', 1, 'values',
                         'predict-output', NULL, 'fixture-untagged')
                 RETURNING id`
            );

            await fx.db.query(
                `INSERT INTO question_options (question_id, option_text, display_order, is_correct)
                 VALUES ($1, 'right', 1, TRUE), ($1, 'wrong', 2, FALSE)`,
                [untagged!.id]
            );

            await answer(learner, untagged!.id);

            expect(
                await state(learner),
                "untagged questions played, nothing derived"
            ).toEqual(before);

            expect(
                (await introduction(learner))?.conceptSlug,
                "and the introduction is still owed"
            ).toBe("primitive-types");
        });
    });

    it("9b · is ordered after curriculum content, never removed by it", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j9b@example.com");
            await arriveAt(learner, "primitive-types");
            const owed = await introduction(learner);

            await completeIntroduction(learner, owed!.challengeId);

            const ordered = byCurriculumPreference(await candidates(learner));

            // CURRICULUM CONTENT LEADS, which is the claim. Not a specific id:
            // primitive-types now has two tagged exercises (seed 030) and the
            // shallower rung sorts first, so pinning one of them was pinning
            // the content, not the ordering.
            expect(ordered[0]!.concept_id, "the curriculum's pick leads").not.toBeNull();
            expect(
                ordered.map((r) => r.id),
                "and the practice is in the pool"
            ).toContain(practiceId);
            // Ordering never removes anything. Compared against the unordered
            // pool rather than a fixed number, which stops being true the
            // moment the bank grows.
            expect(ordered, "and nothing was dropped").toHaveLength(
                (await candidates(learner)).length
            );
        });
    });
});

// ── 10 · nothing about pacing changed ────────────────────────────────────

describe("10 · pacing, scoring and XP are untouched", () => {
    it("still deals ten questions on the existing difficulty curve", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j10@example.com");
            await arriveAt(learner, "primitive-types");
            const owed = await introduction(learner);

            await completeIntroduction(learner, owed!.challengeId);

            const run = await dealt(learner);
            const tiers = run.map((r) => r.difficulty ?? 2);

            expect(run).toHaveLength(QUESTIONS_PER_SESSION);
            expect(tiers[0], "a run still opens on the fundamentals").toBe(1);

            // The "and still climbs" assertion that used to sit here is gone
            // ON PURPOSE, and it is worth saying why.
            //
            // It passed when a beginner's ceiling opened into Variables and
            // dragged in difficulty 2 and 3 alongside. Now the journey holds
            // them at Values, everything in reach is pacing difficulty 1, and
            // the run is flat.
            //
            // That is the intended experience, not a regression: a learner who
            // has met one concept should be practising that concept, not being
            // escalated for the sake of a curve. The curve returns on its own
            // as the learner earns topics whose content is harder. What must
            // still hold is that the run FILLS and never jumps a tier, both
            // asserted here.

            for (let i = 1; i < tiers.length; i += 1) {
                expect(
                    Math.abs(tiers[i]! - tiers[i - 1]!),
                    "no slot may jump a whole tier"
                ).toBeLessThanOrEqual(1);
            }
        });
    });

    it("paces the curriculum question by questions.difficulty, not the curriculum's", async () => {
        // The two numbers stay separate. This question is pacing tier 1 and
        // curriculum rung 1 today, so the assertion is on the COLUMNS rather
        // than on their values agreeing by luck.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j10b@example.com");
            await arriveAt(learner, "primitive-types");
            const owed = await introduction(learner);

            await completeIntroduction(learner, owed!.challengeId);
            await fx.db.query(`UPDATE questions SET difficulty = 4 WHERE id = $1`, [
                practiceId
            ]);

            const [row] = (await candidates(learner)).filter((r) => r.id === practiceId);

            expect(row!.difficulty, "pacing").toBe(4);
            expect(row!.challenge_difficulty, "curriculum").toBe(1);
        });
    });
});
