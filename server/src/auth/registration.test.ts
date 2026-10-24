import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import express from "express";
import session from "express-session";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * POST /api/auth/register, end to end against the repository's migrations in
 * an in-memory PGlite: what a valid sign-up creates, what an invalid one is
 * told, and that no failure leaves a half-made account behind.
 *
 * QA context: a register 400 on the deployed app turned out to be validation
 * (the route has no other 400). These pin that each such reason names its
 * field, and that the success path signs the learner in.
 */

const db = new PGlite();

const pool = {
    query: async <T>(text: string, params?: unknown[]) => {
        const result = await db.query<T>(text, params as never[]);
        return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    }
};

vi.mock("../db.js", () => ({ pool }));

const { authRouter, meHandler } = await import("./routes.js");
const { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } = await import("./cookie.js");
const { errorHandler } = await import("../requestErrors.js");

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
    app.use(errorHandler);
    return app;
}

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await db.query<T>(sql, params as never[])).rows;
}

const userCount = async () => Number((await rows<{ n: string }>(`SELECT COUNT(*)::text AS n FROM users`))[0]!.n);

let n = 0;
const fresh = () => {
    n += 1;
    return { email: `signup-${n}@jolt.test`, username: `signup${n}`, password: `a-long-password-${n}` };
};

beforeAll(async () => {
    const base = new URL("../../migrations/", import.meta.url);
    for (const file of readdirSync(base).filter((f) => f.endsWith(".sql")).sort()) {
        await db.exec(readFileSync(new URL(file, base), "utf8"));
    }
});

describe("a valid sign-up", () => {
    it("creates one account, returns it without the password, and signs the learner in", async () => {
        const app = buildApp();
        const input = fresh();
        const before = await userCount();

        const res = await request(app)
            .post("/api/auth/register")
            .send({ ...input, email: `  ${input.email.toUpperCase()} ` });

        expect(res.status).toBe(201);
        expect(res.body.user).toMatchObject({ email: input.email, username: input.username });
        // Nothing about the password travels back.
        expect(JSON.stringify(res.body)).not.toContain(input.password);
        expect(JSON.stringify(res.body)).not.toMatch(/argon2|password/i);
        expect(await userCount()).toBe(before + 1);

        // Signed in: the cookie it set opens a protected route as this learner.
        const cookie = res.headers["set-cookie"]?.[0]?.split(";")[0];
        expect(cookie, "a session cookie must be issued").toBeDefined();
        const me = await request(app).get("/api/users/me").set("Cookie", cookie!);
        expect(me.status).toBe(200);
        expect(me.body.user.id).toBe(res.body.user.id);
    });

    it("stores an argon2id hash, never the password", async () => {
        const input = fresh();
        await request(buildApp()).post("/api/auth/register").send(input).expect(201);

        const [row] = await rows<Record<string, unknown>>(`SELECT * FROM users WHERE email = $1`, [input.email]);
        expect(String(row!.password_hash).startsWith("$argon2id$")).toBe(true);
        // In no column at all, not only the hash column.
        expect(JSON.stringify(row)).not.toContain(input.password);
    });
});

describe("an invalid sign-up", () => {
    it.each([
        ["an email without a dotted domain", { email: "test@test" }, "email", "Enter a full email address, like name@example.com"],
        ["a short username", { username: "ab" }, "username", "Username must be at least 3 characters"],
        ["a short password", { password: "short" }, "password", "Password must be at least 8 characters"]
    ])("refuses %s with a 400 naming the field, and creates nothing", async (_label, override, field, message) => {
        const app = buildApp();
        const before = await userCount();

        const res = await request(app).post("/api/auth/register").send({ ...fresh(), ...override });

        expect(res.status).toBe(400);
        expect(res.body.details).toEqual([{ field, message }]);
        expect(res.headers["set-cookie"], "a refusal must not issue a session").toBeUndefined();
        expect(await userCount()).toBe(before);
    });

    it("names every missing field at once", async () => {
        const res = await request(buildApp()).post("/api/auth/register").send({});

        expect(res.status).toBe(400);
        expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual(["email", "password", "username"]);
    });

    it("answers a body that is not JSON with a plain 400, revealing nothing", async () => {
        const before = await userCount();

        const res = await request(buildApp())
            .post("/api/auth/register")
            .set("Content-Type", "application/json")
            .send('{"email": "a@b.co", ');

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "Bad Request" });
        expect(await userCount()).toBe(before);
    });
});

describe("a duplicate sign-up", () => {
    it("refuses a taken username, whatever its case, and leaves one account", async () => {
        const app = buildApp();
        const first = fresh();
        await request(app).post("/api/auth/register").send(first).expect(201);
        const before = await userCount();

        const res = await request(app)
            .post("/api/auth/register")
            .send({ ...fresh(), username: first.username.toUpperCase() });

        expect(res.status).toBe(409);
        expect(res.body.details).toEqual([{ field: "username", message: "That username is already taken" }]);
        expect(res.headers["set-cookie"]).toBeUndefined();
        expect(await userCount()).toBe(before);
    });

    it("refuses a taken email, whatever its case or spacing", async () => {
        const app = buildApp();
        const first = fresh();
        await request(app).post("/api/auth/register").send(first).expect(201);
        const before = await userCount();

        const res = await request(app)
            .post("/api/auth/register")
            .send({ ...fresh(), email: ` ${first.email.toUpperCase()} ` });

        expect(res.status).toBe(409);
        expect(res.body.details).toEqual([{ field: "email", message: "That email is already taken" }]);
        expect(await userCount()).toBe(before);
    });
});
