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
const PRACTICE_PROMPT = 'What does this log?\n\nconsole.log(typeof "5", typeof 5);';

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
    it("1 · is owed the primitive-types introduction", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j1@example.com");

            expect((await introduction(learner))?.conceptSlug).toBe("primitive-types");
        });
    });

    it("1b · is not yet offered its practice", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j1b@example.com");

            expect((await candidates(learner)).map((r) => r.id)).not.toContain(practiceId);
        });
    });

    it("2 · completing the Learn Beat releases the practice", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j2@example.com");
            const owed = await introduction(learner);

            await completeIntroduction(learner, owed!.challengeId);

            expect((await candidates(learner)).map((r) => r.id)).toContain(practiceId);
            expect(
                (await introduction(learner))?.conceptSlug,
                "primitive-types is no longer owed; assignment is next"
            ).toBe("assignment");
        });
    });

    it("3 · Code Blitz actually deals it", async () => {
        // Not "is a candidate" -- is in the ten the player would be handed, by
        // the real dealer, from the real query.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j3@example.com");
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
            const owed = await introduction(learner);

            await completeIntroduction(learner, owed!.challengeId);

            const before = await state(learner);

            expect(before.concepts, "the introduction alone").toEqual(["primitive-types"]);
            expect(before.difficulties, "no rung stood on yet").toEqual([]);
            expect(before.demands, "no thinking done yet").toEqual([]);

            await answer(learner, practiceId);

            const after = await state(learner);

            expect(after.concepts).toEqual(["primitive-types"]);
            expect(after.difficulties).toEqual(["primitive-types:1"]);
            expect(after.demands).toEqual(["primitive-types:predict"]);
        });
    });

    it("5 · the ceilings move with it", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j5@example.com");
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
            const owed = await introduction(learner);
            const harder = await fx.challengeFor("primitive-types", "practise", {
                difficulty: 2
            });

            await completeIntroduction(learner, owed!.challengeId);
            await answer(learner, practiceId);

            const ordered = byCurriculumPreference(await candidates(learner));
            const tagged = ordered.filter((r) => r.concept_id !== null);

            expect(tagged[0]!.id).toBe(harder.questionId);
        });
    });
});

// ── 7 · isolation ────────────────────────────────────────────────────────

describe("7 · another learner is untouched", () => {
    it("keeps its own introduction owed and its own practice withheld", async () => {
        await fx.scenario(async () => {
            const studious = await fx.insertUser("j7a@example.com");
            const bystander = await fx.insertUser("j7b@example.com");
            const owed = await introduction(studious);

            await completeIntroduction(studious, owed!.challengeId);
            await answer(studious, practiceId);

            expect((await introduction(bystander))?.conceptSlug).toBe("primitive-types");
            expect((await candidates(bystander)).map((r) => r.id)).not.toContain(practiceId);
            expect(await state(bystander)).toEqual({
                concepts: [],
                difficulties: [],
                demands: []
            });
        });
    });
});

// ── 8-9 · the transitional bank ──────────────────────────────────────────

describe("untagged content is transitional fallback, not curriculum content", () => {
    it("8 · fills a whole run for a learner who has met nothing", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j8@example.com");
            const run = await dealt(learner);

            expect(run, "a fresh learner still gets a full game").toHaveLength(
                QUESTIONS_PER_SESSION
            );
            expect(
                run.every((r) => r.concept_id === null),
                "every one of them untagged"
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
            const pool = await candidates(learner);

            expect(pool.filter((r) => r.concept_id === null)).toHaveLength(25);
            expect(pool.filter((r) => r.concept_id !== null)).toHaveLength(0);
            expect(new Set(pool.map((r) => r.topic))).toEqual(new Set(["values", "variables"]));
        });
    });

    it("9 · serving it advances no curriculum state whatsoever", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j9@example.com");
            const run = await dealt(learner);

            for (const question of run) {
                await answer(learner, question.id);
            }

            expect(
                await state(learner),
                "ten questions played, nothing tagged, nothing derived"
            ).toEqual({ concepts: [], difficulties: [], demands: [] });

            expect(
                (await introduction(learner))?.conceptSlug,
                "and the introduction is still owed"
            ).toBe("primitive-types");
        });
    });

    it("9b · is ordered after curriculum content, never removed by it", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j9b@example.com");
            const owed = await introduction(learner);

            await completeIntroduction(learner, owed!.challengeId);

            const ordered = byCurriculumPreference(await candidates(learner));

            expect(ordered[0]!.id, "the curriculum's pick leads").toBe(practiceId);
            expect(ordered, "and nothing was dropped").toHaveLength(26);
        });
    });
});

// ── 10 · nothing about pacing changed ────────────────────────────────────

describe("10 · pacing, scoring and XP are untouched", () => {
    it("still deals ten questions on the existing difficulty curve", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("j10@example.com");
            const owed = await introduction(learner);

            await completeIntroduction(learner, owed!.challengeId);

            const run = await dealt(learner);
            const tiers = run.map((r) => r.difficulty ?? 2);

            expect(run).toHaveLength(QUESTIONS_PER_SESSION);
            expect(tiers[0], "a run still opens on the fundamentals").toBe(1);
            expect(Math.max(...tiers), "and still climbs").toBeGreaterThan(1);

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
