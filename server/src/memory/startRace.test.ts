import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Two Memory starts in flight at once must never produce a 500.
 *
 * The client used to fire every pre-game countdown's onDone twice, so pressing
 * Start sent two POST /api/memory/sessions. The first created the game; the
 * second's INSERT was rejected by the one-active-session index and came back
 * as "Internal Server Error" -- and that was the response the page showed.
 * The client no longer double-fires, but a double click or a second tab can
 * still race, so the route answers the loser the way Flush and Code Blitz do.
 */

vi.mock("../auth/middleware.js", () => ({
    requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
        (req as express.Request & { user: { id: string } }).user = { id: "7" };
        next();
    }
}));

vi.mock("../sessions/queries.js", () => ({
    findActiveSession: vi.fn(),
    findResumableSession: vi.fn(async () => null),
    resumePausedSession: vi.fn()
}));

vi.mock("./queries.js", () => ({
    createSessionWithRounds: vi.fn(),
    findNextPendingRound: vi.fn(),
    markServed: vi.fn(async () => undefined),
    scoreSoFar: vi.fn(async () => 0),
    listRounds: vi.fn(async () => []),
    findMemorySessionForUser: vi.fn(),
    toScored: vi.fn(() => [])
}));

const { memoryRouter } = await import("./routes.js");
const sessions = await import("../sessions/queries.js");
const db = await import("./queries.js");

const lostRace = Object.assign(new Error("duplicate key"), {
    code: "23505",
    constraint: "game_sessions_one_active_per_user_idx"
});

const ROUND = {
    id: "61",
    display_order: 1,
    sequence: ["ring", "star", "moon", "bolt"],
    display_ms: 4000,
    status: "pending",
    served_at: null,
    ended_at: null,
    submitted: null,
    correct_positions: null
};

function app() {
    const a = express();
    a.use(express.json());
    a.use("/api/memory", memoryRouter);
    // The real handler, so an unhandled rejection shows up as the 500 it was.
    a.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(500).json({ error: "Internal Server Error" });
    });
    return a;
}

beforeEach(() => {
    vi.mocked(sessions.findActiveSession).mockReset();
    vi.mocked(db.createSessionWithRounds).mockReset();
    vi.mocked(db.findNextPendingRound).mockReset();
});

describe("POST /api/memory/sessions when another start won the race", () => {
    it("serves the game the other request started, rather than a 500", async () => {
        vi.mocked(sessions.findActiveSession)
            .mockResolvedValueOnce(null) // the pre-check: nothing active yet
            .mockResolvedValueOnce({ id: "35", gameSlug: "memory", gameName: "Memory", startedAt: new Date() });
        vi.mocked(db.createSessionWithRounds).mockRejectedValueOnce(lostRace);
        vi.mocked(db.findNextPendingRound).mockResolvedValue(ROUND);

        const res = await request(app()).post("/api/memory/sessions").send({ fresh: true });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ resumed: true, sessionId: "35", round: { roundId: "61" } });
    });

    it("answers with the usual conflict when a different game won", async () => {
        vi.mocked(sessions.findActiveSession)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: "36", gameSlug: "flush", gameName: "Flush", startedAt: new Date() });
        vi.mocked(db.createSessionWithRounds).mockRejectedValueOnce(lostRace);

        const res = await request(app()).post("/api/memory/sessions").send({ fresh: true });

        expect(res.status).toBe(409);
        expect(res.body.activeGame).toEqual({ slug: "flush", name: "Flush" });
    });

    it("still reports an unrelated database failure as a server error", async () => {
        vi.mocked(sessions.findActiveSession).mockResolvedValue(null);
        vi.mocked(db.createSessionWithRounds).mockRejectedValueOnce(new Error("connection reset"));

        const res = await request(app()).post("/api/memory/sessions").send({ fresh: true });

        expect(res.status).toBe(500);
    });
});
