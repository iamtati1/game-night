import argon2 from "argon2";
import express from "express";
import session from "express-session";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The database is the only thing stubbed. The router, requireAuth, the session
// middleware and the cookie definition are all the real ones, because the bug
// this file exists to catch lives in exactly those pieces.
vi.mock("./queries.js", () => ({
    findActiveUserByEmail: vi.fn(),
    findActiveUserById: vi.fn(),
    insertUser: vi.fn()
}));

const { authRouter, meHandler } = await import("./routes.js");
const { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } = await import("./cookie.js");
const queries = await import("./queries.js");

const USER = { id: "7", email: "player@jolt.test", username: "player" };
const PASSWORD = "correct-horse-battery";

let passwordHash: string;

/**
 * The real app with an in-memory session store.
 *
 * express-session's default MemoryStore implements the same get/set/destroy
 * contract connect-pg-simple does, so "did destroy() actually end the session?"
 * is answered faithfully here -- and without Postgres, which this environment
 * cannot reach. What it does NOT cover is connect-pg-simple's own DELETE; that
 * is noted in the report rather than pretended away.
 */
function buildApp() {
    const app = express();
    const store = new session.MemoryStore();

    app.use(express.json());
    app.use(
        session({
            store,
            name: SESSION_COOKIE_NAME,
            secret: "test-secret",
            resave: false,
            saveUninitialized: false,
            cookie: SESSION_COOKIE_OPTIONS
        })
    );
    app.use("/api/auth", authRouter);
    app.get("/api/users/me", ...meHandler);

    return { app, store };
}

/** Logs in against the real /login route and returns the session cookie. */
async function login(app: express.Express): Promise<string> {
    const res = await request(app)
        .post("/api/auth/login")
        .send({ email: USER.email, password: PASSWORD });

    expect(res.status).toBe(200);

    const cookie = res.headers["set-cookie"]?.[0];
    expect(cookie, "login must issue a session cookie").toBeDefined();

    return cookie!.split(";")[0]!;
}

beforeEach(async () => {
    passwordHash ??= await argon2.hash(PASSWORD, { type: argon2.argon2id });

    vi.mocked(queries.findActiveUserByEmail).mockResolvedValue({
        ...USER,
        passwordHash
    } as never);
    vi.mocked(queries.findActiveUserById).mockResolvedValue(USER as never);
});

describe("logout ends the session, not just the UI", () => {
    it("rejects the pre-logout cookie afterwards", async () => {
        // The acceptance criterion. Everything else in this file is detail.
        const { app } = buildApp();
        const cookie = await login(app);

        await request(app).get("/api/users/me").set("Cookie", cookie).expect(200);
        await request(app).post("/api/auth/logout").set("Cookie", cookie).expect(204);

        // Replaying the exact cookie the browser held a moment ago. If the store
        // row survived, this is a 200 and the player is still logged in behind a
        // logged-out header -- the bug.
        const replayed = await request(app).get("/api/users/me").set("Cookie", cookie);

        expect(replayed.status).toBe(401);
    });

    it("stays logged out across a page refresh", async () => {
        // A refresh is just AuthProvider asking /api/users/me again with whatever
        // cookie the browser still has. Nothing about it re-authenticates.
        const { app } = buildApp();
        const cookie = await login(app);

        await request(app).post("/api/auth/logout").set("Cookie", cookie).expect(204);

        for (const attempt of [1, 2, 3]) {
            const res = await request(app).get("/api/users/me").set("Cookie", cookie);
            expect(res.status, `refresh ${attempt}`).toBe(401);
        }
    });

    it("locks the session out of every authenticated route, not only /me", async () => {
        // requireAuth is the single gate in front of stats, history, sessions and
        // every game. Asserting it here covers all of them: a dead session that
        // still satisfied requireAuth would open all of them at once.
        const { app } = buildApp();

        app.get("/api/protected", ...[meHandler[0]!, (_req, res) => res.status(200).end()]);

        const cookie = await login(app);

        await request(app).get("/api/protected").set("Cookie", cookie).expect(200);
        await request(app).post("/api/auth/logout").set("Cookie", cookie).expect(204);
        await request(app).get("/api/protected").set("Cookie", cookie).expect(401);
    });

    it("tells the browser to delete the cookie, matching how it was set", async () => {
        // The store is what ends the session; this is the second line of defence.
        // A cleared cookie whose attributes do not match the original is a no-op
        // the browser reports no error for, so name and path are asserted.
        const { app } = buildApp();
        const cookie = await login(app);

        const res = await request(app).post("/api/auth/logout").set("Cookie", cookie);
        const cleared = res.headers["set-cookie"]?.[0] ?? "";

        expect(cleared).toContain(`${SESSION_COOKIE_NAME}=;`);
        expect(cleared).toContain("Path=/");
        expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    });

    it("is idempotent, so a second click cannot 500", async () => {
        // The button is clickable again the moment the header re-renders, and a
        // logout that only works once would surface as an error on a no-op.
        const { app } = buildApp();
        const cookie = await login(app);

        await request(app).post("/api/auth/logout").set("Cookie", cookie).expect(204);
        await request(app).post("/api/auth/logout").set("Cookie", cookie).expect(204);
        await request(app).post("/api/auth/logout").expect(204);
    });

    it("lets the same account log in again afterwards", async () => {
        // The opposite regression: over-aggressive invalidation that leaves the
        // account unable to start a new session.
        const { app } = buildApp();
        const first = await login(app);

        await request(app).post("/api/auth/logout").set("Cookie", first).expect(204);

        const second = await login(app);

        expect(second).not.toBe(first);
        await request(app).get("/api/users/me").set("Cookie", second).expect(200);
        await request(app).get("/api/users/me").set("Cookie", first).expect(401);
    });

    it("reports a failure instead of clearing the cookie over a live session", async () => {
        // The dangerous half of this bug. If destroy() fails the session is still
        // live; clearing the cookie would hide it rather than end it, and the
        // client would render the logged-out header over a working session. A 500
        // with the cookie untouched is the honest outcome, and it is what lets the
        // client keep the player signed in and say so.
        const { app, store } = buildApp();
        const cookie = await login(app);

        store.destroy = (_sid, cb) => cb?.(new Error("session store offline"));

        const res = await request(app).post("/api/auth/logout").set("Cookie", cookie);

        expect(res.status).toBe(500);
        expect(res.headers["set-cookie"]).toBeUndefined();
    });
});

describe("the session cookie is defined once", () => {
    it("uses the same name and attributes for setting and clearing", async () => {
        // The structural half of the fix: session.ts and the logout handler both
        // read this module, so they cannot drift into describing different
        // cookies. A rename here changes both call sites at once.
        const SESSION = await import("node:fs").then((fs) =>
            fs.readFileSync(new URL("../session.ts", import.meta.url), "utf8")
        );
        const ROUTES = await import("node:fs").then((fs) =>
            fs.readFileSync(new URL("./routes.ts", import.meta.url), "utf8")
        );

        expect(SESSION).toMatch(/name: SESSION_COOKIE_NAME/);
        expect(SESSION).toMatch(/cookie: SESSION_COOKIE_OPTIONS/);
        expect(ROUTES).toMatch(/clearCookie\(SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS\)/);

        // A literal cookie name at either site is the drift this prevents.
        expect(SESSION).not.toMatch(/"gn\.sid"/);
        expect(ROUTES).not.toMatch(/"gn\.sid"/);
    });

    it("only marks the cookie Secure in production", async () => {
        // Local dev is plain HTTP over the Vite proxy. A Secure cookie there is
        // silently dropped by the browser, which looks exactly like a login that
        // did not take.
        expect(SESSION_COOKIE_OPTIONS.secure).toBe(process.env.NODE_ENV === "production");
        expect(SESSION_COOKIE_OPTIONS.httpOnly).toBe(true);
        expect(SESSION_COOKIE_OPTIONS.sameSite).toBe("lax");
        expect(SESSION_COOKIE_OPTIONS.path).toBe("/");
    });
});
