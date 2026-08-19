import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { loginRateLimiter } from "./rateLimit.js";

/** Mounts only the limiter, so this exercises its configuration without booting
 *  the app, a database, or a session store. */
function appWithLimiter(status: number) {
    const app = express();
    app.use(express.json());
    app.post("/login", loginRateLimiter, (_req, res) => {
        res.status(status).json({ error: "Invalid email or password" });
    });
    return app;
}

describe("login rate limiter", () => {
    it("allows 10 failed attempts, then returns a clear 429", async () => {
        const app = appWithLimiter(401);

        for (let attempt = 1; attempt <= 10; attempt += 1) {
            const res = await request(app).post("/login").send({ email: "a@b.c", password: "x" });
            expect(res.status, `attempt ${attempt} should still be allowed`).toBe(401);
        }

        const blocked = await request(app).post("/login").send({ email: "a@b.c", password: "x" });

        expect(blocked.status).toBe(429);
        expect(blocked.body.error).toBe("Too many login attempts");
        expect(blocked.body.details[0].message).toContain("15 minutes");
    });

    it("advertises the limit via standard RateLimit headers", async () => {
        const res = await request(appWithLimiter(401)).post("/login").send({});

        expect(res.headers).toHaveProperty("ratelimit");
        expect(res.headers).not.toHaveProperty("x-ratelimit-limit");
    });
});
