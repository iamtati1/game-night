import { PGlite } from "@electric-sql/pglite";
import express from "express";
import { readFileSync, readdirSync } from "node:fs";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * POST /api/curriculum/challenges/:id/completion accepts mission movements only.
 *
 * Audit finding: the route checked that the concept was open and that the
 * challenge was a practice rung -- not that it was a mission. Any practice rung
 * of an open concept, including one with a question the server is meant to
 * judge, could be cleared by a hand-made request with no answer, and the concept
 * then demonstrated. The app itself only ever posts here for mission rungs.
 *
 * Runs the REAL router against the repository's migrations and seeds in an
 * in-memory PGlite; only authentication is stubbed, so the learner can change.
 */

const db = new PGlite();

const pool = {
    query: async <T>(text: string, params?: unknown[]) => {
        const result = await db.query<T>(text, params as never[]);
        return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
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
const { findJourneyPath } = await import("./lessons.js");

function app() {
    const a = express();
    a.use(express.json());
    a.use("/api/curriculum", curriculumRouter);
    return a;
}

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await db.query<T>(sql, params as never[])).rows;
}

let n = 0;
async function newUser(): Promise<string> {
    n += 1;
    const [user] = await rows<{ id: string }>(
        `INSERT INTO users (email, username, password_hash)
         VALUES ($1, $1, 'x') RETURNING id`,
        [`mission-completion-${n}@jolt.test`]
    );
    return user!.id;
}

async function completions(userId: string): Promise<number> {
    const [row] = await rows<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM activity_completions WHERE user_id = $1`,
        [userId]
    );
    return row!.n;
}

/** The learner's current concept, read from the same path the app uses. */
async function currentConcept(userId: string): Promise<string> {
    const path = await findJourneyPath(userId);
    const current = path.flatMap((t) => t.concepts).find((c) => c.state === "current");
    expect(current, "a new learner has a current concept").toBeDefined();
    return current!.slug;
}

/**
 * Opens a concept the honest way the path reads it: every concept before it
 * demonstrated and every checkpoint before it passed. Fixture setup only.
 */
async function openUpTo(userId: string, conceptId: string): Promise<void> {
    await db.query(
        `INSERT INTO concept_demonstrations (user_id, concept_id)
         SELECT $1, c.id
         FROM concepts c JOIN topics t ON t.id = c.topic_id,
              concepts target JOIN topics tt ON tt.id = target.topic_id
         WHERE target.id = $2
           AND (t.display_order, c.display_order) < (tt.display_order, target.display_order)
         ON CONFLICT DO NOTHING`,
        [userId, conceptId]
    );
    await db.query(
        `INSERT INTO topic_challenge_completions (user_id, topic_id)
         SELECT $1, t.id
         FROM topics t, concepts target JOIN topics tt ON tt.id = target.topic_id
         WHERE target.id = $2 AND t.display_order < tt.display_order
         ON CONFLICT DO NOTHING`,
        [userId, conceptId]
    );
}

beforeAll(async () => {
    for (const dir of ["migrations", "seeds"]) {
        const base = new URL(`../../${dir}/`, import.meta.url);

        for (const f of readdirSync(base).filter((f) => f.endsWith(".sql")).sort()) {
            await db.exec(readFileSync(new URL(f, base), "utf8"));
        }
    }
}, 300000);

describe("reporting a rung done from the browser", () => {
    it("refuses a question-backed rung of an open concept, and records nothing", async () => {
        const user = await newUser();
        currentUser = user;
        const concept = await currentConcept(user);

        const [rung] = await rows<{ id: string }>(
            `SELECT ch.id::text AS id
             FROM challenges ch
             JOIN concepts c ON c.id = ch.concept_id
             JOIN questions q ON q.challenge_id = ch.id AND q.is_active
             WHERE c.slug = $1 AND ch.role = 'practise' AND ch.is_active
             LIMIT 1`,
            [concept]
        );
        expect(rung, `${concept} has a question-backed practice rung`).toBeDefined();

        const res = await request(app())
            .post(`/api/curriculum/challenges/${rung!.id}/completion`)
            .send({});

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/answering it/);
        expect(await completions(user)).toBe(0);
    });

    it("refuses every non-mission practice rung, whatever backs it", async () => {
        // Question, incident or Flush snippet: all are cleared by an answer the
        // server judges. A learner with the whole course open, so "not open" can
        // never be the reason for the refusal.
        const user = await newUser();
        currentUser = user;
        const [last] = await rows<{ id: string }>(
            `SELECT c.id::text AS id FROM concepts c JOIN topics t ON t.id = c.topic_id
             ORDER BY t.display_order DESC, c.display_order DESC LIMIT 1`
        );
        await openUpTo(user, last!.id);

        const backed = await rows<{ id: string; kind: string }>(
            `SELECT DISTINCT ON (kind) id, kind FROM (
                 SELECT ch.id::text AS id,
                        CASE WHEN q.id IS NOT NULL THEN 'question'
                             WHEN i.id IS NOT NULL THEN 'incident'
                             ELSE 'snippet' END AS kind
                 FROM challenges ch
                 LEFT JOIN questions q          ON q.challenge_id = ch.id AND q.is_active
                 LEFT JOIN bug_hunt_incidents i ON i.challenge_id = ch.id AND i.is_active
                 LEFT JOIN flush_snippets f     ON f.challenge_id = ch.id
                 WHERE ch.role = 'practise' AND ch.is_active
                   AND ch.activity IS DISTINCT FROM 'mission'
                   AND (q.id IS NOT NULL OR i.id IS NOT NULL OR f.id IS NOT NULL)
             ) k ORDER BY kind, id`
        );
        // Flush snippets share rungs that also carry a question, so a
        // snippet-only rung may not exist in the seeds; questions and incidents
        // always do.
        expect(backed.map((b) => b.kind)).toEqual(expect.arrayContaining(["incident", "question"]));

        for (const rung of backed) {
            const res = await request(app())
                .post(`/api/curriculum/challenges/${rung.id}/completion`)
                .send({});
            expect(res.status, `${rung.kind} rung ${rung.id}`).toBe(403);
        }
        expect(await completions(user)).toBe(0);
    });

    it("still records a mission movement once its concept is open", async () => {
        const [mission] = await rows<{ id: string; concept_id: string }>(
            `SELECT ch.id::text AS id, ch.concept_id::text AS concept_id
             FROM challenges ch
             WHERE ch.activity = 'mission' AND ch.role = 'practise' AND ch.is_active
               AND NOT EXISTS (SELECT 1 FROM questions q WHERE q.challenge_id = ch.id AND q.is_active)
               AND NOT EXISTS (SELECT 1 FROM bug_hunt_incidents i WHERE i.challenge_id = ch.id AND i.is_active)
             ORDER BY ch.id LIMIT 1`
        );
        expect(mission, "the seeds author at least one mission movement").toBeDefined();

        const user = await newUser();
        currentUser = user;
        await openUpTo(user, mission!.concept_id);

        const res = await request(app())
            .post(`/api/curriculum/challenges/${mission!.id}/completion`)
            .send({ neededRetry: true });

        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body).toEqual({ recorded: true });
        expect(await completions(user)).toBe(1);
    });

    it("still refuses a mission whose concept is locked", async () => {
        const [mission] = await rows<{ id: string }>(
            `SELECT ch.id::text AS id FROM challenges ch
             WHERE ch.activity = 'mission' AND ch.role = 'practise' AND ch.is_active
             ORDER BY ch.id LIMIT 1`
        );
        const user = await newUser();
        currentUser = user;

        const res = await request(app())
            .post(`/api/curriculum/challenges/${mission!.id}/completion`)
            .send({});

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/not open/);
        expect(await completions(user)).toBe(0);
    });
});
