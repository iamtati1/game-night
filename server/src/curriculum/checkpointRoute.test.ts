import { PGlite } from "@electric-sql/pglite";
import express from "express";
import { readFileSync, readdirSync } from "node:fs";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * POST /api/curriculum/topics/:topic/challenge judges the answers itself.
 *
 * Audit finding: the route read only `neededRetry`. Once a topic's concepts
 * were demonstrated, an empty request recorded the checkpoint -- which completes
 * the topic and opens the next one -- and a topic with no checkpoint at all
 * could be "passed" for POINTS_PER_CHALLENGE. Every test below that expects a
 * refusal passed (200, row written) against the original route.
 *
 * Runs the REAL router against the repository's migrations and seeds in an
 * in-memory PGlite; only authentication is stubbed, so the learner can change.
 */

const db = new PGlite();

const pool = {
    query: async <T>(text: string, params?: unknown[]) => {
        const result = await db.query<T>(text, params as never[]);
        // PGlite reports affectedRows 0 for a SELECT; pg's rowCount is the row
        // count there, which recordChallenge's existence check relies on.
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
const { findJourneyPath, findLearnerPoints } = await import("./lessons.js");

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
/** A new learner, signed in, with every concept in `topics` demonstrated. Fixture setup only. */
async function learnerWith(...topics: string[]): Promise<string> {
    n += 1;
    const [user] = await rows<{ id: string }>(
        `INSERT INTO users (email, username, password_hash) VALUES ($1, $1, 'x') RETURNING id`,
        [`checkpoint-route-${n}@jolt.test`]
    );
    for (const topic of topics) {
        await db.query(
            `INSERT INTO concept_demonstrations (user_id, concept_id)
             SELECT $1, c.id FROM concepts c JOIN topics t ON t.id = c.topic_id WHERE t.slug = $2`,
            [user!.id, topic]
        );
    }
    currentUser = user!.id;
    return user!.id;
}

async function recorded(userId: string): Promise<{ slug: string; needed_retry: boolean }[]> {
    return rows(
        `SELECT t.slug, tc.needed_retry FROM topic_challenge_completions tc
         JOIN topics t ON t.id = tc.topic_id WHERE tc.user_id = $1 ORDER BY t.slug`,
        [userId]
    );
}

const pass = (topic: string, body: unknown) =>
    request(app()).post(`/api/curriculum/topics/${topic}/challenge`).send(body as object);

const VALUES_RIGHT = [{ choice: "string" }, { choice: "number" }, { choice: "false" }];

beforeAll(async () => {
    for (const dir of ["migrations", "seeds"]) {
        const base = new URL(`../../${dir}/`, import.meta.url);

        for (const f of readdirSync(base).filter((f) => f.endsWith(".sql")).sort()) {
            await db.exec(readFileSync(new URL(f, base), "utf8"));
        }
    }
}, 300000);

describe("a claim without answers", () => {
    it("refuses an empty request and records nothing", async () => {
        const user = await learnerWith("values");

        const res = await pass("values", {});

        expect(res.status).toBe(400);
        expect(await recorded(user)).toEqual([]);
    });

    it("refuses a body that only says it passed", async () => {
        const user = await learnerWith("values");

        const res = await pass("values", { neededRetry: false, passed: true, completed: true });

        expect(res.status).toBe(400);
        expect(await recorded(user)).toEqual([]);
    });

    it.each([
        ["answers that are not a list", { answers: "string,number,false" }],
        ["too few answers", { answers: VALUES_RIGHT.slice(0, 2) }],
        ["an answer the question never offered", { answers: [{ choice: "boolean" }, ...VALUES_RIGHT.slice(1)] }],
        ["answers of the wrong type", { answers: [1, 2, 3] }]
    ])("refuses %s", async (_label, body) => {
        const user = await learnerWith("values");

        expect((await pass("values", body)).status).toBe(400);
        expect(await recorded(user)).toEqual([]);
    });
});

describe("wrong answers", () => {
    it("are refused with 422, and the next topic stays shut", async () => {
        const user = await learnerWith("values");

        const res = await pass("values", { answers: [{ choice: "number" }, ...VALUES_RIGHT.slice(1)] });

        expect(res.status).toBe(422);
        expect(res.body.error).toMatch(/try the checkpoint again/i);
        expect(await recorded(user)).toEqual([]);
        const path = await findJourneyPath(user);
        expect(path.find((t) => t.slug === "values")!.challenge!.state).toBe("current");
    });

    it("include a wrong retry", async () => {
        const user = await learnerWith("values");

        const res = await pass("values", {
            answers: [...VALUES_RIGHT.slice(0, 2), { choice: "true", retry: "true" }]
        });

        expect(res.status).toBe(422);
        expect(await recorded(user)).toEqual([]);
    });
});

describe("a real pass", () => {
    it("records the checkpoint and opens the next topic", async () => {
        const user = await learnerWith("values");

        const res = await pass("values", { answers: VALUES_RIGHT });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ completed: true, topic: "values" });
        expect(await recorded(user)).toEqual([{ slug: "values", needed_retry: false }]);

        const path = await findJourneyPath(user);
        expect(path.find((t) => t.slug === "values")!.challenge!.state).toBe("demonstrated");
        expect(path.find((t) => t.slug === "variables")!.concepts[0]!.state).toBe("current");
    });

    it("records a retry from the answers, whatever the flag says", async () => {
        const user = await learnerWith("values");

        const res = await pass("values", {
            neededRetry: false,
            answers: [...VALUES_RIGHT.slice(0, 2), { choice: "true", retry: "false" }]
        });

        expect(res.status).toBe(200);
        expect(await recorded(user)).toEqual([{ slug: "values", needed_retry: true }]);
    });

    it("judges the Variables and Operators keys too", async () => {
        await learnerWith("values", "variables", "operators");
        await rows(
            `INSERT INTO topic_challenge_completions (user_id, topic_id)
             SELECT $1, id FROM topics WHERE slug = 'values'`,
            [currentUser]
        );

        expect((await pass("variables", { answers: [{ choice: "10" }, { choice: "20" }, { choice: "8" }] })).status).toBe(200);
        expect((await pass("operators", { answers: [{ choice: "true" }, { choice: "true" }, { choice: "true" }] })).status).toBe(200);
        expect((await pass("operators", { answers: [{ choice: "false" }, { choice: "true" }, { choice: "true" }] })).status).toBe(
            422
        );
    });

    it("is idempotent: a second pass keeps the first record and adds none", async () => {
        const user = await learnerWith("values");

        await pass("values", { answers: VALUES_RIGHT });
        const again = await pass("values", { answers: [...VALUES_RIGHT.slice(0, 2), { choice: "true", retry: "false" }] });

        expect(again.status).toBe(200);
        expect(await recorded(user)).toEqual([{ slug: "values", needed_retry: false }]);
    });
});

describe("what the answers cannot get past", () => {
    it("still refuses a learner whose concepts are not demonstrated, right answers or not", async () => {
        const user = await learnerWith();

        const res = await pass("values", { answers: VALUES_RIGHT });

        expect(res.status).toBe(409);
        expect(await recorded(user)).toEqual([]);
    });

    it("refuses a topic that has no checkpoint, and pays no points for it", async () => {
        const user = await learnerWith("loops");
        const before = await findLearnerPoints(user);

        const res = await pass("loops", { answers: VALUES_RIGHT });

        expect(res.status).toBe(404);
        expect(await recorded(user)).toEqual([]);
        expect(await findLearnerPoints(user)).toEqual(before);
    });

    it("refuses an unknown or malformed topic", async () => {
        await learnerWith();

        expect((await pass("nope", { answers: VALUES_RIGHT })).status).toBe(404);
        expect((await pass("BAD!", { answers: VALUES_RIGHT })).status).toBe(404);
    });
});
