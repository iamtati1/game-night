import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import express from "express";
import session from "express-session";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * THE WHOLE CYCLE, AGAINST A REAL DATABASE.
 *
 * Register -> use Jolt -> log out -> log back in -> find the same learner with
 * the same evidence. `logout.test.ts` already proves the session half of this
 * with the database stubbed; what it cannot show is the half that only a real
 * database can answer:
 *
 *   - is there exactly ONE user row after a register-logout-login cycle
 *   - is the stored password an argon2id hash rather than the password
 *   - does the evidence written before logout still belong to that account
 *     when they come back
 *
 * So this runs the real auth router, the real queries, the real curriculum
 * router and real argon2 against PostgreSQL built from this repository's own
 * migrations and seeds. Nothing about authentication is stubbed.
 *
 * WHAT IS NOT COVERED, stated rather than implied: the session STORE here is
 * express-session's MemoryStore, not connect-pg-simple, because the latter
 * drives its own schema against a live pg Pool. Session rows surviving a server
 * restart is therefore config (`session.ts`) plus a manual check, not this
 * file. What this file proves is that the learner and their evidence survive --
 * which is the thing a learner would actually lose.
 */

const db = new PGlite();

/** PGlite under the small part of the pg Pool surface the queries use. */
const pool = {
    query: async <T>(text: string, params?: unknown[]) => {
        const result = await db.query<T>(text, params as never[]);
        return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    }
};

vi.mock("../db.js", () => ({ pool }));

const { authRouter, meHandler } = await import("./routes.js");
const { curriculumRouter } = await import("../curriculum/routes.js");
const { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } = await import("./cookie.js");

const EMAIL = "returning@jolt.test";
const USERNAME = "returning";
const PASSWORD = "correct-horse-battery";

/** The real app, minus only the session store. */
function buildApp() {
    const app = express();

    app.use(express.json());
    app.use(
        session({
            store: new session.MemoryStore(),
            name: SESSION_COOKIE_NAME,
            secret: "test-secret",
            resave: false,
            saveUninitialized: false,
            cookie: SESSION_COOKIE_OPTIONS
        })
    );
    app.use("/api/auth", authRouter);
    app.get("/api/users/me", ...meHandler);
    app.use("/api/curriculum", curriculumRouter);

    return app;
}

function cookieFrom(res: request.Response): string {
    const raw = res.headers["set-cookie"]?.[0];
    expect(raw, "a session cookie must be issued").toBeDefined();
    return raw!.split(";")[0]!;
}

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await db.query<T>(sql, params as never[])).rows;
}

beforeAll(async () => {
    for (const dir of ["migrations", "seeds"]) {
        const base = new URL(`../../${dir}/`, import.meta.url);

        for (const file of readdirSync(base).filter((f) => f.endsWith(".sql")).sort()) {
            await db.exec(readFileSync(new URL(file, base), "utf8"));
        }
    }
});

describe("a learner who comes back", () => {
    it("is the same learner, with the same evidence", async () => {
        const app = buildApp();

        /* 1. Create the account. */
        const registered = await request(app)
            .post("/api/auth/register")
            .send({ email: EMAIL, username: USERNAME, password: PASSWORD })
            .expect(201);

        const userId = registered.body.user.id as string;
        const firstCookie = cookieFrom(registered);

        /* 2. Registration alone must leave them inside Jolt -- a new learner
              should never have to log in to the account they just made. */
        const me = await request(app)
            .get("/api/users/me")
            .set("Cookie", firstCookie)
            .expect(200);

        expect(me.body.user.id).toBe(userId);

        /* 3. Real progress, through the route the client actually calls: the
              first rung of the first concept, answered correctly. */
        const encounter = await request(app)
            .get("/api/curriculum/concepts/console-output/encounter")
            .set("Cookie", firstCookie)
            .expect(200);

        const rung = encounter.body.rungs.find(
            (r: { options: unknown[] }) => r.options.length > 0
        );
        const challengeId = rung.options[0].challengeId as string;

        const exercise = await request(app)
            .get(`/api/curriculum/challenges/${challengeId}/exercise`)
            .set("Cookie", firstCookie)
            .expect(200);

        /* The correct option is read from the database rather than guessed, so
           this test exercises a CORRECT answer rather than whichever came
           first -- the options are shuffled per learner. */
        const [answer] = await rows<{ id: string }>(
            `SELECT o.id FROM question_options o
             JOIN questions q ON q.id = o.question_id
             WHERE q.challenge_id = $1 AND o.is_correct`,
            [challengeId]
        );

        const judged = await request(app)
            .post(`/api/curriculum/challenges/${challengeId}/answer`)
            .set("Cookie", firstCookie)
            .send({ optionId: answer!.id })
            .expect(200);

        expect(judged.body.correct, "the fixture must answer correctly").toBe(true);
        expect(exercise.body.challengeId).toBe(challengeId);

        const clearedBefore = await request(app)
            .get("/api/curriculum/concepts/console-output/encounter")
            .set("Cookie", firstCookie)
            .expect(200);

        const demandCleared = clearedBefore.body.rungs.find(
            (r: { cleared: boolean }) => r.cleared
        );

        expect(demandCleared, "a rung must actually have cleared").toBeDefined();

        /* 4. Log out. */
        await request(app).post("/api/auth/logout").set("Cookie", firstCookie).expect(204);
        await request(app).get("/api/users/me").set("Cookie", firstCookie).expect(401);

        /* 5. Log back in with the same credentials. */
        const back = await request(app)
            .post("/api/auth/login")
            .send({ email: EMAIL, password: PASSWORD })
            .expect(200);

        const secondCookie = cookieFrom(back);

        /* 6. The same learner -- not a new one that happens to look alike. */
        expect(back.body.user.id).toBe(userId);
        expect(back.body.user.createdAt).toBe(registered.body.user.createdAt);

        const [{ count }] = await rows<{ count: string }>(
            `SELECT COUNT(*)::TEXT AS count FROM users WHERE email = $1`,
            [EMAIL]
        );

        expect(count, "logging in must not create a second learner").toBe("1");

        /* 7. The evidence is still theirs. */
        const after = await request(app)
            .get("/api/curriculum/concepts/console-output/encounter")
            .set("Cookie", secondCookie)
            .expect(200);

        expect(after.body.rungs.filter((r: { cleared: boolean }) => r.cleared)).toHaveLength(
            clearedBefore.body.rungs.filter((r: { cleared: boolean }) => r.cleared).length
        );
        expect(after.body.currentRung).toBe(clearedBefore.body.currentRung);

        const evidence = await rows<{ user_id: string }>(
            `SELECT user_id FROM activity_completions WHERE user_id = $1`,
            [userId]
        );

        expect(evidence.length).toBeGreaterThan(0);
        expect(new Set(evidence.map((r) => r.user_id))).toEqual(new Set([userId]));
    });

    it("never stores the password itself", async () => {
        const [row] = await rows<{ password_hash: string }>(
            `SELECT password_hash FROM users WHERE email = $1`,
            [EMAIL]
        );

        // argon2id, which is what auth/routes.ts hashes with. Asserting the
        // prefix rather than merely "not the password" catches a downgrade to a
        // weaker algorithm as well as a plaintext write.
        expect(row!.password_hash.startsWith("$argon2id$")).toBe(true);
        expect(row!.password_hash).not.toContain(PASSWORD);
    });

    it("refuses the wrong password for an account that exists", async () => {
        const app = buildApp();

        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: EMAIL, password: "not-the-password" });

        expect(res.status).toBe(401);
        expect(res.headers["set-cookie"], "a refusal must not issue a session").toBeUndefined();
    });

    it("refuses an account that does not exist, in the same words", async () => {
        const app = buildApp();

        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "nobody@jolt.test", password: PASSWORD });

        expect(res.status).toBe(401);
        // Identical to the wrong-password message: a different one would tell an
        // attacker which addresses have accounts.
        expect(res.body.error).toBe("Invalid email or password");
    });

    it("refuses a second account on the same email", async () => {
        const app = buildApp();

        const res = await request(app)
            .post("/api/auth/register")
            .send({ email: EMAIL, username: "someone-else", password: PASSWORD });

        expect(res.status).toBe(409);

        const [{ count }] = await rows<{ count: string }>(
            `SELECT COUNT(*)::TEXT AS count FROM users WHERE email = $1`,
            [EMAIL]
        );

        expect(count).toBe("1");
    });

    it("keeps protected routes closed to a visitor with no session", async () => {
        const app = buildApp();

        await request(app).get("/api/users/me").expect(401);
        await request(app).get("/api/curriculum/path").expect(401);
        await request(app)
            .get("/api/curriculum/concepts/console-output/encounter")
            .expect(401);
    });
});
