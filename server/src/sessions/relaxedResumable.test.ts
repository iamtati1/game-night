import express from "express";
import session from "express-session";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

/**
 * The paused card agrees with the run.
 *
 * Browser QA found it: a relaxed Code Blitz run at 300 points (three correct,
 * base points only) showed "350 PTS" on its paused card, because the shared
 * resumable listing recomputed the score as if the run were timed and paid a
 * speed bonus on the fast answers. The listing now asks the login session
 * which runs are relaxed.
 */

vi.mock("../auth/middleware.js", () => ({
    requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
        (req as express.Request & { user: { id: string } }).user = { id: "7" };
        next();
    }
}));

vi.mock("./queries.js", () => ({
    abandonResumableSession: vi.fn(),
    pauseActiveSession: vi.fn(),
    listResumableSessions: vi.fn(async (_user: string, isRelaxedRun: (id: string) => boolean) => [
        {
            id: "41", gameSlug: "code-blitz", gameName: "Code Blitz", status: "paused",
            score: isRelaxedRun("41") ? 300 : 350, unitsDone: 3, unitsTotal: 10, pauseCount: 1,
            startedAt: new Date(0), pausedAt: new Date(1)
        }
    ])
}));

const { sessionsRouter } = await import("./routes.js");
const { markRelaxed } = await import("./relaxedRuns.js");

function app(relaxedIds: string[]) {
    const a = express();
    a.use(session({ secret: "t", resave: false, saveUninitialized: true }));
    a.use((req, _res, next) => {
        for (const id of relaxedIds) markRelaxed(req, id);
        next();
    });
    a.use("/api/me/sessions", sessionsRouter);
    return a;
}

describe("GET /api/me/sessions/resumable", () => {
    it("scores a relaxed run as relaxed", async () => {
        const res = await request(app(["41"])).get("/api/me/sessions/resumable").expect(200);
        expect(res.body.sessions[0].score).toBe(300);
    });

    it("scores any other run as timed, as before", async () => {
        const res = await request(app([])).get("/api/me/sessions/resumable").expect(200);
        expect(res.body.sessions[0].score).toBe(350);
    });
});
