import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A learner who cannot fill a Bug Hunt run is pointed at debugging they CAN do.
 *
 * Playtest finding: the refusal said "Play some Code Blitz first", which
 * blocked all debugging behind unrelated practice -- while every early concept
 * already has a "find the problem" rung. A learner below a full run is now
 * dealt a shorter one; only below BUG_HUNT_MIN_INCIDENTS_PER_SESSION is the
 * run refused, and then the refusal points at debugging they can do.
 */

vi.mock("../auth/middleware.js", () => ({
    requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
        (req as express.Request & { user: { id: string } }).user = { id: "7" };
        next();
    }
}));

vi.mock("../sessions/queries.js", () => ({
    findActiveSession: vi.fn(async () => null),
    findResumableSession: vi.fn(async () => null),
    resumePausedSession: vi.fn()
}));

vi.mock("../curriculum/lessons.js", () => ({
    findCurrentConcept: vi.fn()
}));

vi.mock("./queries.js", () => ({
    countDealableIncidents: vi.fn(),
    countReachableIncidents: vi.fn(),
    findDebugPractice: vi.fn(),
    createSessionWithRounds: vi.fn()
}));

const { bugHuntRouter } = await import("./routes.js");
const lessons = await import("../curriculum/lessons.js");
const db = await import("./queries.js");
const { BUG_HUNT_MIN_INCIDENTS_PER_SESSION } = await import("./scoring.js");

function app() {
    const a = express();
    a.use(express.json());
    a.use("/api/bug-hunt", bugHuntRouter);
    return a;
}

beforeEach(() => {
    // Default: one below the minimum, and everything reachable is dealable --
    // the "too few" state.
    vi.mocked(db.countDealableIncidents).mockResolvedValue(BUG_HUNT_MIN_INCIDENTS_PER_SESSION - 1);
    vi.mocked(db.countReachableIncidents).mockResolvedValue(BUG_HUNT_MIN_INCIDENTS_PER_SESSION - 1);
    vi.mocked(lessons.findCurrentConcept).mockResolvedValue({ slug: "console-output", id: "11" });
    vi.mocked(db.findDebugPractice).mockResolvedValue({
        slug: "console-output",
        name: "Running Code and Reading Output"
    });
    vi.mocked(db.createSessionWithRounds).mockReset();
});

describe("POST /api/bug-hunt/sessions before a run can be filled", () => {
    it("points at debugging in the current concept, not at another game", async () => {
        const res = await request(app()).post("/api/bug-hunt/sessions").send({});

        expect(res.status).toBe(503);
        expect(res.body.error).toBe("Not enough to hunt yet");
        expect(res.body.practice).toEqual({ slug: "console-output", name: "Running Code and Reading Output" });

        const message: string = res.body.details[0].message;
        expect(message).toMatch(/Running Code and Reading Output/);
        expect(message).not.toMatch(/Code Blitz first/);
    });

    it("too few: says how many are open against the minimum, with the real numbers", async () => {
        const res = await request(app()).post("/api/bug-hunt/sessions").send({});
        const open = BUG_HUNT_MIN_INCIDENTS_PER_SESSION - 1;

        expect(res.body).toMatchObject({ reason: "too-few", eligible: open, reachable: open, needed: BUG_HUNT_MIN_INCIDENTS_PER_SESSION });
        expect(res.body.details[0].message).toMatch(
            new RegExp(`at least ${BUG_HUNT_MIN_INCIDENTS_PER_SESSION} bugs about ideas you have learned\\. So far ${open} are open\\.`)
        );
    });

    it("not met: says no bug is open yet, and that lessons are a way in", async () => {
        vi.mocked(db.countDealableIncidents).mockResolvedValue(0);
        vi.mocked(db.countReachableIncidents).mockResolvedValue(0);

        const res = await request(app()).post("/api/bug-hunt/sessions").send({});
        const message: string = res.body.details[0].message;

        expect(res.body.reason).toBe("not-met");
        expect(message).toMatch(/none are open yet/);
        expect(message).toMatch(/lessons on your Journey/);
        expect(message).not.toMatch(/does not open bugs/);
    });

    it("difficulty: says the ideas ARE met, and that the bugs are a step harder -- not 'not met'", async () => {
        // The QA account: three console-output bugs reachable, all above the frontier.
        vi.mocked(db.countDealableIncidents).mockResolvedValue(0);
        vi.mocked(db.countReachableIncidents).mockResolvedValue(3);

        const res = await request(app()).post("/api/bug-hunt/sessions").send({});
        const message: string = res.body.details[0].message;

        expect(res.body).toMatchObject({ reason: "difficulty", eligible: 0, reachable: 3 });
        expect(message).toMatch(/You have learned the ideas behind 3, but 3 of them are a step harder/);
        expect(message).toMatch(/so none are open yet/);
        expect(message).toMatch(/Practicing those ideas in Code Blitz opens them here/);
        expect(message).not.toMatch(/not met|none are open yet\. Bugs open/);
    });

    it("difficulty, partly: counts the open and the harder separately", async () => {
        vi.mocked(db.countDealableIncidents).mockResolvedValue(2);
        vi.mocked(db.countReachableIncidents).mockResolvedValue(5);

        const res = await request(app()).post("/api/bug-hunt/sessions").send({});
        expect(res.body.details[0].message).toMatch(/behind 5, but 3 of them are a step harder .* so only 2 are open yet/);
    });

    it("does not invent a place to practise when the concept has none", async () => {
        vi.mocked(db.findDebugPractice).mockResolvedValue(null);

        const res = await request(app()).post("/api/bug-hunt/sessions").send({});

        expect(res.body.practice).toBeNull();
        expect(res.body.details[0].message).not.toMatch(/last step of that lesson/);
    });

    it("deals nothing below the minimum", async () => {
        await request(app()).post("/api/bug-hunt/sessions").send({});
        expect(db.createSessionWithRounds).not.toHaveBeenCalled();
    });

    it("deals a short run at the minimum rather than refusing it", async () => {
        vi.mocked(db.countDealableIncidents).mockResolvedValue(BUG_HUNT_MIN_INCIDENTS_PER_SESSION);
        vi.mocked(db.countReachableIncidents).mockResolvedValue(BUG_HUNT_MIN_INCIDENTS_PER_SESSION);
        // Stops the route right after the deal; what matters is that it dealt.
        vi.mocked(db.createSessionWithRounds).mockRejectedValue(new Error("dealt"));

        const res = await request(app()).post("/api/bug-hunt/sessions").send({});

        expect(db.createSessionWithRounds).toHaveBeenCalledTimes(1);
        expect(res.status).not.toBe(503);
    });

    it("reports the same answer read-only at GET /readiness, and starts nothing", async () => {
        const start = await request(app()).post("/api/bug-hunt/sessions").send({});
        const ask = await request(app()).get("/api/bug-hunt/readiness");

        expect(ask.status).toBe(200);
        expect(ask.body).toMatchObject({
            ready: false,
            eligible: start.body.eligible,
            needed: start.body.needed,
            reason: start.body.reason,
            practice: start.body.practice,
            message: start.body.details[0].message
        });
        expect(db.createSessionWithRounds).not.toHaveBeenCalled();
    });

    it("says ready, with the count, once a run can be dealt", async () => {
        vi.mocked(db.countDealableIncidents).mockResolvedValue(BUG_HUNT_MIN_INCIDENTS_PER_SESSION + 1);

        const ask = await request(app()).get("/api/bug-hunt/readiness");

        expect(ask.body).toMatchObject({ ready: true, eligible: BUG_HUNT_MIN_INCIDENTS_PER_SESSION + 1, message: null });
        expect(db.createSessionWithRounds).not.toHaveBeenCalled();
    });
});

describe("POST /api/bug-hunt/sessions with relaxed: true", () => {
    it("deals the run with no clock on any round", async () => {
        vi.mocked(db.countDealableIncidents).mockResolvedValue(10);
        vi.mocked(db.countReachableIncidents).mockResolvedValue(10);
        vi.mocked(db.createSessionWithRounds).mockRejectedValue(new Error("stop after dealing"));

        await request(app()).post("/api/bug-hunt/sessions").send({ relaxed: true });
        expect(vi.mocked(db.createSessionWithRounds).mock.calls[0]?.[2]).toBe(true);

        vi.mocked(db.createSessionWithRounds).mockClear();
        await request(app()).post("/api/bug-hunt/sessions").send({});
        expect(vi.mocked(db.createSessionWithRounds).mock.calls[0]?.[2]).toBe(false);
    });
});
