import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * A finished lesson opens practice in Flush and Bug Hunt -- for its own concept
 * only -- and a learner short of a full run is dealt a shorter one.
 *
 * Learner report: Flush said zero ideas met, Bug Hunt five of six, and both
 * said only Code Blitz counted. The lesson flow already writes durable,
 * per-concept evidence (activity_completions, concept_demonstrations); the
 * dealer did not read it, and both games refused anything short of a full run.
 *
 * Runs the REAL dealers against the repository's migrations and seeds in an
 * in-memory PGlite, so what is asserted is what a learner would be dealt.
 */

const db = new PGlite();

const pool = {
    query: async <T>(text: string, params?: unknown[]) => {
        const result = await db.query<T>(text, params as never[]);
        return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    },
    // The dealers pin one client for BEGIN/COMMIT. PGlite is one connection,
    // so the pool itself is that client.
    connect: async () => ({ query: pool.query, release: () => undefined })
};

vi.mock("../db.js", () => ({ pool }));

const { metConceptsCte } = await import("./eligibility.js");
const flush = await import("../flush/queries.js");
const bugHunt = await import("../bugHunt/queries.js");
const { flushReadiness } = await import("../flush/routes.js");
const { bugHuntReadiness } = await import("../bugHunt/routes.js");
const { FLUSH_MIN_ROUNDS_PER_SESSION, FLUSH_ROUNDS_PER_SESSION } = await import("../flush/scoring.js");
const { BOSS_DISPLAY_ORDER, BUG_HUNT_INCIDENTS_PER_SESSION, BUG_HUNT_MIN_INCIDENTS_PER_SESSION } =
    await import("../bugHunt/scoring.js");

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await db.query<T>(sql, params as never[])).rows;
}

let n = 0;
async function newUser(): Promise<string> {
    n += 1;
    const [user] = await rows<{ id: string }>(
        `INSERT INTO users (email, username, password_hash)
         VALUES ($1, $1, 'x') RETURNING id`,
        [`lesson-evidence-${n}@jolt.test`]
    );
    return user!.id;
}

async function met(userId: string): Promise<string[]> {
    const got = await rows<{ slug: string }>(
        `WITH ${metConceptsCte("$1")}
         SELECT c.slug FROM met JOIN concepts c ON c.id = met.concept_id ORDER BY c.slug`,
        [userId]
    );
    return got.map((r) => r.slug);
}

/** What the lesson flow records as each playable rung of a concept is passed. */
async function passLessonRungs(userId: string, concept: string): Promise<void> {
    await db.query(
        `INSERT INTO activity_completions (user_id, challenge_id)
         SELECT $1, ch.id
         FROM challenges ch JOIN concepts c ON c.id = ch.concept_id
         WHERE c.slug = $2 AND ch.role = 'practise' AND ch.is_active
           AND (EXISTS (SELECT 1 FROM questions q WHERE q.challenge_id = ch.id AND q.is_active)
                OR EXISTS (SELECT 1 FROM bug_hunt_incidents i WHERE i.challenge_id = ch.id AND i.is_active)
                OR ch.activity IS NOT NULL)
         ON CONFLICT DO NOTHING`,
        [userId, concept]
    );
}

/** What the demonstrate route records once the whole lesson is done. */
async function demonstrate(userId: string, concept: string): Promise<void> {
    await db.query(
        `INSERT INTO concept_demonstrations (user_id, concept_id)
         SELECT $1, id FROM concepts WHERE slug = $2`,
        [userId, concept]
    );
}

async function finishLesson(userId: string, concept: string): Promise<void> {
    await passLessonRungs(userId, concept);
    await demonstrate(userId, concept);
}

beforeAll(async () => {
    for (const dir of ["migrations", "seeds"]) {
        const base = new URL(`../../${dir}/`, import.meta.url);

        for (const f of readdirSync(base).filter((f) => f.endsWith(".sql")).sort()) {
            await db.exec(readFileSync(new URL(f, base), "utf8"));
        }
    }
}, 300000);

describe("lesson evidence counts as meeting an idea -- only that idea", () => {
    it("a learner with no history has met nothing", async () => {
        expect(await met(await newUser())).toEqual([]);
    });

    it("a passed lesson rung meets its own concept and no other", async () => {
        const user = await newUser();
        await passLessonRungs(user, "console-output");

        expect(await met(user)).toEqual(["console-output"]);
    });

    it("a completed lesson meets its own concept and no other", async () => {
        const user = await newUser();
        await demonstrate(user, "arithmetic-operators");

        expect(await met(user)).toEqual(["arithmetic-operators"]);
    });

    it("Code Blitz still counts a faced question, and still ignores one only dealt", async () => {
        const [question] = await rows<{ id: string; slug: string }>(
            `SELECT q.id, c.slug FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             WHERE q.is_active AND ch.is_active AND c.slug = 'booleans'
             ORDER BY q.id LIMIT 1`
        );

        for (const [status, expected] of [
            ["pending", []],
            ["answered", ["booleans"]],
            ["timed_out", ["booleans"]]
        ] as const) {
            const user = await newUser();
            const [session] = await rows<{ id: string }>(
                `INSERT INTO game_sessions (user_id, game_id)
                 VALUES ($1, (SELECT id FROM games WHERE slug = 'code-blitz')) RETURNING id`,
                [user]
            );
            // Each status in the shape its CHECK constraint requires.
            await db.query(
                status === "answered"
                    ? `INSERT INTO session_questions
                           (game_session_id, question_id, display_order, prompt_text, status,
                            served_at, answered_at, is_correct, selected_option_id,
                            selected_option_text, correct_option_text)
                       SELECT $1, $2, 1, 'p', 'answered', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
                              FALSE, o.id, o.option_text, o.option_text
                       FROM question_options o WHERE o.question_id = $2 ORDER BY o.id LIMIT 1`
                    : status === "timed_out"
                      ? `INSERT INTO session_questions
                             (game_session_id, question_id, display_order, prompt_text, status,
                              served_at, timed_out_at, correct_option_text)
                         VALUES ($1, $2, 1, 'p', 'timed_out', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'x')`
                      : `INSERT INTO session_questions
                             (game_session_id, question_id, display_order, prompt_text, status)
                         VALUES ($1, $2, 1, 'p', 'pending')`,
                [session!.id, question!.id]
            );

            expect(await met(user), status).toEqual(expected);
        }
    });
});

describe("Flush after a first lesson", () => {
    it("deals a shorter game, of real puzzles on that lesson's concept only", async () => {
        const user = await newUser();
        await finishLesson(user, "console-output");

        const available = await flush.countEligibleSnippets(user);
        // The case this exists for: some, but fewer than a full game.
        expect(available).toBeGreaterThanOrEqual(FLUSH_MIN_ROUNDS_PER_SESSION);
        expect(available).toBeLessThan(FLUSH_ROUNDS_PER_SESSION);

        const session = await flush.createSessionWithRounds(user);
        const dealt = await rows<{ id: string; snippet_id: string; display_order: number; total_outputs: number; concept: string }>(
            `SELECT fr.id, fr.snippet_id, fr.display_order, fr.total_outputs, c.slug AS concept
             FROM flush_rounds fr
             JOIN flush_snippets s ON s.id = fr.snippet_id
             JOIN challenges ch    ON ch.id = s.challenge_id
             JOIN concepts c       ON c.id  = ch.concept_id
             WHERE fr.game_session_id = $1 ORDER BY fr.display_order`,
            [session.id]
        );

        expect(dealt).toHaveLength(available);
        expect(dealt.map((r) => r.display_order)).toEqual(dealt.map((_, i) => i + 1));
        expect(new Set(dealt.map((r) => r.snippet_id)).size).toBe(dealt.length);
        expect(new Set(dealt.map((r) => r.concept))).toEqual(new Set(["console-output"]));
        // Playable puzzles, not placeholders: every one has a real sequence.
        for (const r of dealt) expect(r.total_outputs).toBeGreaterThanOrEqual(2);
        // What the round tells the client as its total.
        expect(await flush.countRoundsInSessionOf(dealt[0]!.id)).toBe(dealt.length);
    });

    it("has nothing to deal to a learner who has learned nothing", async () => {
        expect(await flush.countEligibleSnippets(await newUser())).toBe(0);
    });
});

describe("Bug Hunt after a first lesson", () => {
    it("deals a shorter run, of real incidents, with no boss it never reaches", async () => {
        const user = await newUser();
        await finishLesson(user, "console-output");

        const available = await bugHunt.countDealableIncidents(user);
        expect(available).toBeGreaterThanOrEqual(BUG_HUNT_MIN_INCIDENTS_PER_SESSION);
        expect(available).toBeLessThan(BUG_HUNT_INCIDENTS_PER_SESSION);

        const [concept] = await rows<{ id: string }>("SELECT id FROM concepts WHERE slug = 'console-output'");
        const session = await bugHunt.createSessionWithRounds(user, concept!.id);
        const dealt = await bugHunt.listRounds(session.id);

        expect(dealt).toHaveLength(available);
        expect(dealt.map((r) => r.display_order)).toEqual(dealt.map((_, i) => i + 1));
        expect(new Set(dealt.map((r) => r.incident_id)).size).toBe(dealt.length);
        expect(dealt.some((r) => r.display_order === BOSS_DISPLAY_ORDER)).toBe(false);
        expect(await bugHunt.countRoundsInSessionOf(dealt[0]!.id)).toBe(dealt.length);
    });

    it("has nothing to deal to a learner who has learned nothing", async () => {
        expect(await bugHunt.countDealableIncidents(await newUser())).toBe(0);
    });
});

describe("starting a game is not evidence of anything", () => {
    it("leaves met concepts, demonstrations and topic completions exactly as they were", async () => {
        const user = await newUser();
        // Rungs passed but the lesson not completed: no demonstration yet.
        await passLessonRungs(user, "console-output");

        const snapshot = async () => ({
            met: await met(user),
            demonstrations: await rows("SELECT concept_id FROM concept_demonstrations WHERE user_id = $1", [user]),
            topics: await rows("SELECT topic_id FROM topic_challenge_completions WHERE user_id = $1", [user]),
            activities: await rows(
                "SELECT challenge_id FROM activity_completions WHERE user_id = $1 ORDER BY challenge_id",
                [user]
            )
        });
        const before = await snapshot();

        const flushRun = await flush.createSessionWithRounds(user);
        // One live game per learner: leave Flush before starting Bug Hunt,
        // exactly as the client's "one game at a time" dialog does.
        await db.query(
            "UPDATE game_sessions SET status = 'abandoned', abandoned_at = CURRENT_TIMESTAMP WHERE id = $1",
            [flushRun.id]
        );
        await bugHunt.createSessionWithRounds(user, null);

        expect(await snapshot()).toEqual(before);
        expect(before.demonstrations).toEqual([]);
    });
});

describe("what the Games page is told", () => {
    it("says not ready to a learner who has learned nothing, with the reason, and starts nothing", async () => {
        const user = await newUser();

        const flushNow = await flushReadiness(user);
        const huntNow = await bugHuntReadiness(user);

        expect(flushNow).toMatchObject({ ready: false, eligible: 0 });
        expect(flushNow.message).toMatch(/at least \d+ puzzles/);
        expect(huntNow).toMatchObject({ ready: false, eligible: 0 });
        expect(huntNow.message).toMatch(/at least \d+ bugs/);
        expect(await rows("SELECT id FROM game_sessions WHERE user_id = $1", [user])).toEqual([]);
    });

    it("says ready, with how many, after the first lesson -- the same counts the dealer uses", async () => {
        const user = await newUser();
        await finishLesson(user, "console-output");

        expect(await flushReadiness(user)).toMatchObject({
            ready: true,
            eligible: await flush.countEligibleSnippets(user),
            message: null
        });
        expect(await bugHuntReadiness(user)).toMatchObject({
            ready: true,
            eligible: await bugHunt.countDealableIncidents(user),
            message: null
        });
    });
});
