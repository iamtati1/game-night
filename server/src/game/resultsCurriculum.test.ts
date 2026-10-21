import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/sessions/:id names the topic of the concept the learner is on.
 *
 * UX audit: the results screen showed "Your variables journey" to every
 * learner, because the response carried the concept but not its topic and the
 * client had nothing to ask about but a hardcoded `variables`. The topic is
 * read from the same path the concept is -- no new rule -- and is null rather
 * than guessed when the path cannot place the concept.
 *
 * Same shape as learnBeatRouting.test.ts: the real router, database modules
 * stubbed.
 */

vi.mock("../auth/middleware.js", () => ({
    requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
        (req as express.Request & { user: { id: string } }).user = { id: "7" };
        next();
    }
}));

vi.mock("../questions/queries.js", () => ({ countDealableQuestions: vi.fn() }));
vi.mock("../curriculum/queries.js", () => ({ findNextIntroduction: vi.fn() }));

vi.mock("../curriculum/lessons.js", () => ({
    findCurrentConcept: vi.fn(async () => null),
    findJourneyPath: vi.fn(async () => [])
}));

vi.mock("../sessions/queries.js", () => ({
    findActiveSession: vi.fn(async () => null),
    findResumableSession: vi.fn(async () => null),
    resumePausedSession: vi.fn()
}));

vi.mock("../questions/topUp.js", () => ({ ensureQuestionPool: vi.fn(async () => undefined) }));

vi.mock("./queries.js", () => ({
    createSessionWithQuestions: vi.fn(),
    findSessionForUser: vi.fn(),
    listSessionQuestions: vi.fn(async () => []),
    scoreSoFar: vi.fn(async () => 0),
    conceptForQuestion: vi.fn(async () => null),
    rungsEarnedInSession: vi.fn(async () => []),
    findNextPendingQuestion: vi.fn(async () => null),
    markServed: vi.fn(),
    markTimedOut: vi.fn(),
    listOptionsForQuestion: vi.fn(async () => []),
    recordAnswer: vi.fn(),
    completeSession: vi.fn(),
    countActiveQuestions: vi.fn(async () => 0)
}));

const { gameRouter } = await import("./routes.js");
const lessons = await import("../curriculum/lessons.js");
const db = await import("./queries.js");

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use("/api", gameRouter);
    return app;
}

const concept = (slug: string, name: string) => ({
    slug,
    name,
    objective: "",
    state: "current" as const,
    neededRetry: false,
    rungs: { cleared: 1, playable: 3 }
});

/** Two topics, so "the right topic" is distinguishable from "the first one". */
const PATH = [
    { slug: "values", name: "Values and Types", principle: "", order: 1, state: "complete" as const, concepts: [], challenge: null },
    {
        slug: "operators",
        name: "Operators",
        principle: "",
        order: 3,
        state: "current" as const,
        concepts: [concept("operator-precedence", "Operator Precedence")],
        challenge: null
    }
];

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.findSessionForUser).mockResolvedValue({
        id: "41",
        status: "completed",
        started_at: new Date("2026-10-18T10:00:00Z"),
        completed_at: new Date("2026-10-18T10:03:00Z"),
        abandoned_at: null,
        score: 640,
        xp_earned: 64
    });
});

describe("GET /api/sessions/:id, the curriculum block", () => {
    it("names the topic the learner's current concept sits in", async () => {
        vi.mocked(lessons.findCurrentConcept).mockResolvedValue({ slug: "operator-precedence", id: "30" });
        vi.mocked(lessons.findJourneyPath).mockResolvedValue(PATH as never);

        const res = await request(buildApp()).get("/api/sessions/41").expect(200);

        expect(res.body.curriculum.concept).toEqual({
            slug: "operator-precedence",
            name: "Operator Precedence",
            topic: { slug: "operators", name: "Operators" }
        });
        expect(res.body.curriculum.rungs).toEqual({ cleared: 1, playable: 3 });
    });

    it("names no concept, and so no topic, when the learner is on none", async () => {
        vi.mocked(lessons.findCurrentConcept).mockResolvedValue(null);

        const res = await request(buildApp()).get("/api/sessions/41").expect(200);

        expect(res.body.curriculum.concept).toBeNull();
        expect(lessons.findJourneyPath).not.toHaveBeenCalled();
    });

    it("says null rather than guessing when the path cannot place the concept", async () => {
        // The current concept is not in any topic the path returned.
        vi.mocked(lessons.findCurrentConcept).mockResolvedValue({ slug: "operator-precedence", id: "30" });
        vi.mocked(lessons.findJourneyPath).mockResolvedValue([PATH[0]] as never);

        const res = await request(buildApp()).get("/api/sessions/41").expect(200);

        // No standing for it either, so the concept block is null as before.
        expect(res.body.curriculum.concept).toBeNull();
    });
});
