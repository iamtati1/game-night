import { PGlite } from "@electric-sql/pglite";
import express from "express";
import { readFileSync, readdirSync } from "node:fs";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * GET /api/curriculum/practice-record counts what a learner actually answered.
 *
 * Runs the real router against the repository's migrations and seeds in an
 * in-memory PGlite; only authentication is stubbed. Rows are written the way
 * the games write them (completed sessions, graded units with timestamps).
 */

const db = new PGlite();

const pool = {
    query: async <T>(text: string, params?: unknown[]) => {
        const result = await db.query<T>(text, params as never[]);
        return { rows: result.rows, rowCount: result.affectedRows || result.rows.length };
    },
    connect: async () => ({ query: pool.query, release: () => undefined })
};

vi.mock("../db.js", () => ({ pool }));

let currentUser = "0";
vi.mock("../auth/middleware.js", () => ({
    requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
        (req as express.Request & { user: { id: string } }).user = { id: currentUser };
        next();
    }
}));

const { curriculumRouter } = await import("./routes.js");

function app() {
    const a = express();
    a.use(express.json());
    a.use("/api/curriculum", curriculumRouter);
    return a;
}

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await db.query<T>(sql, params as never[])).rows;
}

interface Tagged {
    id: string;
    concept: string;
}

let question: Tagged;
let incident: Tagged;
let snippet: Tagged;
let untaggedQuestion: string;

beforeAll(async () => {
    for (const dir of ["migrations", "seeds"]) {
        const base = new URL(`../../${dir}/`, import.meta.url);

        for (const f of readdirSync(base).filter((f) => f.endsWith(".sql")).sort()) {
            await db.exec(readFileSync(new URL(f, base), "utf8"));
        }
    }

    const tagged = (table: string) =>
        rows<Tagged>(
            `SELECT x.id, c.slug AS concept FROM ${table} x
             JOIN challenges ch ON ch.id = x.challenge_id
             JOIN concepts c ON c.id = ch.concept_id
             ORDER BY x.id LIMIT 1`
        );

    [question] = (await tagged("questions")) as [Tagged];
    [incident] = (await tagged("bug_hunt_incidents")) as [Tagged];
    [snippet] = (await tagged("flush_snippets")) as [Tagged];

    const [fresh] = await rows<{ id: string }>(
        `INSERT INTO questions (prompt, difficulty, topic, challenge_type, challenge_id, source)
         VALUES ('fixture untagged', 1, 'algorithms', 'predict-output', NULL, 'fixture-untagged')
         RETURNING id`
    );
    untaggedQuestion = fresh!.id;
    await db.query(
        `INSERT INTO question_options (question_id, option_text, display_order, is_correct) VALUES ($1, 'right', 1, TRUE)`,
        [untaggedQuestion]
    );
}, 300000);

let n = 0;
async function learner(): Promise<string> {
    n += 1;
    const [user] = await rows<{ id: string }>(
        `INSERT INTO users (email, username, password_hash) VALUES ($1, $1, 'x') RETURNING id`,
        [`practice-record-${n}@jolt.test`]
    );
    currentUser = user!.id;
    return user!.id;
}

async function session(userId: string, game: string): Promise<string> {
    const [s] = await rows<{ id: string }>(
        `INSERT INTO game_sessions (user_id, game_id, status, completed_at)
         SELECT $1, g.id, 'completed', CURRENT_TIMESTAMP FROM games g WHERE g.slug = $2
         RETURNING id`,
        [userId, game]
    );
    return s!.id;
}

/** A graded Code Blitz answer, `minutesAgo` before now, filled as the game fills one. */
async function answer(userId: string, questionId: string, outcome: "right" | "wrong" | "timed_out" | "pending", minutesAgo: number) {
    // One question appears once per run, so each attempt is its own run.
    const sessionId = await session(userId, "code-blitz");
    const order = 1;
    const at = `CURRENT_TIMESTAMP - make_interval(mins => ${minutesAgo})`;
    const [option] = await rows<{ id: string; text: string }>(
        `SELECT id, option_text AS text FROM question_options WHERE question_id = $1 ORDER BY id LIMIT 1`,
        [questionId]
    );
    await db.query(
        outcome === "timed_out"
            ? `INSERT INTO session_questions (game_session_id, question_id, display_order, prompt_text, status, served_at, correct_option_text, timed_out_at)
               VALUES ($1, $2, $3, 'x', 'timed_out', ${at}, 'x', ${at})`
            : outcome === "pending"
              ? `INSERT INTO session_questions (game_session_id, question_id, display_order, prompt_text, status, served_at)
                 VALUES ($1, $2, $3, 'x', 'pending', ${at})`
              : `INSERT INTO session_questions (game_session_id, question_id, display_order, prompt_text, status, served_at,
                     selected_option_id, selected_option_text, correct_option_text, is_correct, answered_at)
                 VALUES ($1, $2, $3, 'x', 'answered', ${at}, ${option!.id}, 'x', 'x', ${outcome === "right"}, ${at})`,
        [sessionId, questionId, order]
    );
}

const record = async () => (await request(app()).get("/api/curriculum/practice-record")).body as {
    window: number;
    concepts: {
        slug: string;
        attempts: number;
        correct: number;
        recent: { attempts: number; correct: number };
        earlier: { attempts: number; correct: number };
    }[];
};

const forConcept = async (slug: string) => (await record()).concepts.find((c) => c.slug === slug);

describe("a learner's practice record", () => {
    it("is empty before anything is played", async () => {
        await learner();

        const res = await request(app()).get("/api/curriculum/practice-record");
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ window: 5, concepts: [] });
    });

    it("counts Code Blitz answers right and wrong, a timeout as not right, and skips pending ones", async () => {
        const user = await learner();
        await answer(user, question.id, "right", 30);
        await answer(user, question.id, "wrong", 20);
        await answer(user, question.id, "timed_out", 10);
        await answer(user, question.id, "pending", 1);

        expect(await forConcept(question.concept)).toMatchObject({ attempts: 3, correct: 1 });
    });

    it("leaves out answers to content tagged to no concept", async () => {
        const user = await learner();
        await answer(user, untaggedQuestion, "right", 5);

        expect((await record()).concepts).toEqual([]);
    });

    it("counts a Bug Hunt incident right only when fixed on the first attempt", async () => {
        const user = await learner();
        const [patch] = await rows<{ id: string }>(
            `SELECT id FROM bug_hunt_options WHERE incident_id = $1 ORDER BY id LIMIT 1`,
            [incident.id]
        );
        // attempts as the game leaves them: the resolving patch is counted,
        // so a first-try fix ends at 1 and a fix after a wrong patch at 2.
        for (const [status, ended, option, attempts] of [
            ["resolved", "CURRENT_TIMESTAMP", patch!.id, 1],
            ["resolved", "CURRENT_TIMESTAMP", patch!.id, 2],
            ["failed", "CURRENT_TIMESTAMP", null, 2],
            ["pending", "NULL", null, 0]
        ] as const) {
            await db.query(
                `INSERT INTO bug_hunt_rounds (game_session_id, incident_id, display_order, status, served_at, ended_at, selected_option_id, attempts)
                 VALUES ($1, $2, 1, $3, CURRENT_TIMESTAMP, ${ended}, $4, $5)`,
                [await session(user, "bug-hunt"), incident.id, status, option, attempts]
            );
        }

        // Three graded (the pending one is not), and only the first-try fix is right.
        expect(await forConcept(incident.concept)).toMatchObject({ attempts: 3, correct: 1 });
    });

    it("counts Flush rounds: a completed order is right, a timeout is not", async () => {
        const user = await learner();
        for (const [status, placed] of [["completed", 2], ["failed", 1], ["timed_out", 0]] as const) {
            await db.query(
                `INSERT INTO flush_rounds (game_session_id, snippet_id, display_order, prompt_text, total_outputs, status, served_at, ended_at, correct_placements)
                 VALUES ($1, $2, 1, 'x', 2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $4)`,
                [await session(user, "flush"), snippet.id, status, placed]
            );
        }

        expect(await forConcept(snippet.concept)).toMatchObject({ attempts: 3, correct: 1 });
    });

    it("splits the last five attempts from the five before, newest first", async () => {
        const user = await learner();
        // Oldest five: all wrong. Newest five: four right.
        for (let i = 0; i < 5; i++) await answer(user, question.id, "wrong", 100 - i);
        for (let i = 0; i < 5; i++) await answer(user, question.id, i === 0 ? "wrong" : "right", 50 - i);

        expect(await forConcept(question.concept)).toMatchObject({
            attempts: 10,
            correct: 4,
            recent: { attempts: 5, correct: 4 },
            earlier: { attempts: 5, correct: 0 }
        });
    });

    it("is the signed-in learner's own, not anyone else's", async () => {
        const other = await learner();
        await answer(other, question.id, "right", 5);

        await learner();
        expect((await record()).concepts).toEqual([]);
    });
});
