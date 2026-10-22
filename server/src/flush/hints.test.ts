import express from "express";
import session from "express-session";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Flush hints: one per round, it names the next output to place, and the round
 * then banks half. The real router runs with a real in-memory login session;
 * only the database is stubbed.
 */

vi.mock("../auth/middleware.js", () => ({
    requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
        (req as express.Request & { user: { id: string } }).user = { id: "7" };
        next();
    }
}));

let served = new Date();
vi.mock("./queries.js", async (original) => ({
    ...(await original<typeof import("./queries.js")>()),
    findFlushSessionForUser: vi.fn(async () => ({ id: "61", status: "in_progress" })),
    findRound: vi.fn(async () => ({
        id: "301",
        snippet_id: "12",
        display_order: 1,
        prompt_text: 'console.log("a")',
        total_outputs: 3,
        status: "pending",
        served_at: served,
        ended_at: null,
        correct_placements: 1
    })),
    nextCorrectOutputId: vi.fn(async () => "88")
}));

const { flushRouter } = await import("./routes.js");
const db = await import("./queries.js");

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: true }));
    app.use("/api/flush", flushRouter);
    return app;
}

beforeEach(() => {
    vi.clearAllMocks();
    served = new Date();
});

const hint = (agent: ReturnType<typeof request.agent>) => agent.post("/api/flush/sessions/61/hints").send({ roundId: "301" });

describe("Flush hints", () => {
    it("name the next output to place, by position", async () => {
        const res = await hint(request.agent(buildApp())).expect(200);

        expect(res.body.outputId).toBe("88");
        // One correct placement so far: the hint is for position 2.
        expect(vi.mocked(db.nextCorrectOutputId)).toHaveBeenCalledWith("12", 2);
        // What the round has banked so far (10 for one placement), halved.
        expect(res.body.pointsBanked).toBe(5);
    });

    it("are one per round: asking again returns the same output", async () => {
        const agent = request.agent(buildApp());
        await hint(agent).expect(200);
        const again = await hint(agent).expect(200);

        expect(again.body.outputId).toBe("88");
        expect(vi.mocked(db.nextCorrectOutputId)).toHaveBeenCalledTimes(1);
    });

    it("are refused once the round's time is up", async () => {
        served = new Date(Date.now() - 10 * 60_000);
        await hint(request.agent(buildApp())).expect(409);
    });

    it("are refused for a malformed round id", async () => {
        await request(buildApp()).post("/api/flush/sessions/61/hints").send({ roundId: "x" }).expect(400);
    });
});
