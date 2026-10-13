import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A fresh learner is sent to the Learn Beat, not handed a 503.
 *
 * WHY THIS IS A ROUTE TEST AND NOT A SOURCE-SHAPE ONE. The decision under test
 * is a branch -- which of three answers POST /api/sessions gives -- and a
 * string match on routes.ts cannot tell a branch that fires from one that is
 * written and unreachable. So the real router runs, with only the database
 * modules stubbed, the same way auth/logout.test.ts exercises the real auth
 * router.
 *
 * WHAT THE NUMBERS MEAN. Measured against the repository's own migrations and
 * seeds, a learner's dealable pool is 0 at registration, 7 after the
 * console-output Learn Beat and 14 after arithmetic-operators. Practice is
 * withheld until its concept has been ENCOUNTERED (roles.ts), so an early
 * learner is not short of content -- they are short of having met any. The
 * stubs below reproduce exactly those three states.
 */

vi.mock("../auth/middleware.js", () => ({
    requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
        (req as express.Request & { user: { id: string } }).user = { id: "7" };
        next();
    }
}));

vi.mock("../questions/queries.js", () => ({
    countDealableQuestions: vi.fn()
}));

vi.mock("../curriculum/queries.js", () => ({
    findNextIntroduction: vi.fn()
}));

vi.mock("../curriculum/lessons.js", () => ({
    findCurrentConcept: vi.fn(async () => null),
    findJourneyPath: vi.fn(async () => [])
}));

vi.mock("../sessions/queries.js", () => ({
    findActiveSession: vi.fn(async () => null),
    findResumableSession: vi.fn(async () => null),
    resumePausedSession: vi.fn()
}));

vi.mock("../questions/topUp.js", () => ({
    ensureQuestionPool: vi.fn(async () => undefined)
}));

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
const { QUESTIONS_PER_SESSION } = await import("./scoring.js");
const questions = await import("../questions/queries.js");
const curriculum = await import("../curriculum/queries.js");
const db = await import("./queries.js");

/** The shape GET /api/curriculum/introduction already returns. */
const CONSOLE_OUTPUT = {
    challengeId: "8",
    conceptSlug: "console-output",
    conceptName: "Printing a value",
    objective: "print a value to the console",
    meaning: "console.log shows a value while the program runs.",
    topicSlug: "values"
};

function buildApp() {
    const app = express();

    app.use(express.json());
    app.use("/api", gameRouter);

    return app;
}

const dealable = (n: number) =>
    vi.mocked(questions.countDealableQuestions).mockResolvedValue(n);

const nextBeat = (introduction: typeof CONSOLE_OUTPUT | null) =>
    vi.mocked(curriculum.findNextIntroduction).mockResolvedValue(introduction);

beforeEach(() => {
    vi.clearAllMocks();
});

describe("POST /api/sessions when the pool is too thin", () => {
    it("sends a brand-new learner to their first Learn Beat instead of a 503", async () => {
        // The measured registration state: nothing met, so nothing dealable.
        dealable(0);
        nextBeat(CONSOLE_OUTPUT);

        const res = await request(buildApp()).post("/api/sessions").send({}).expect(200);

        expect(res.body.introduction).toEqual(CONSOLE_OUTPUT);
        // Nothing was dealt and nothing was created. The learner goes and meets
        // the concept; they do not get a short round out of sympathy.
        expect(res.body.sessionId).toBeUndefined();
        expect(res.body.question).toBeUndefined();
        expect(db.createSessionWithQuestions).not.toHaveBeenCalled();
    });

    it("keeps sending them back while one Learn Beat is not enough", async () => {
        // One beat unlocks seven questions and a round needs ten, so the second
        // concept is offered rather than the loop stalling on an error.
        dealable(7);
        nextBeat({ ...CONSOLE_OUTPUT, challengeId: "9", conceptSlug: "arithmetic-operators" });

        const res = await request(buildApp()).post("/api/sessions").send({}).expect(200);

        expect(res.body.introduction.conceptSlug).toBe("arithmetic-operators");
        expect(db.createSessionWithQuestions).not.toHaveBeenCalled();
    });

    it("answers 200 rather than an error status, because this is not a fault", async () => {
        // A 4xx or 5xx would have the client render "you have something left to
        // learn" as a failure -- the same reason GET /api/curriculum/
        // introduction is always 200.
        dealable(0);
        nextBeat(CONSOLE_OUTPUT);

        const res = await request(buildApp()).post("/api/sessions").send({});

        expect(res.status).toBe(200);
        expect(res.body.error).toBeUndefined();
    });

    it("still 503s when the pool is thin AND there is nothing left to teach", async () => {
        // A learner who has met everything reachable and still cannot be dealt a
        // round is a genuine content fault, and keeps the answer it always had.
        dealable(3);
        nextBeat(null);

        const res = await request(buildApp()).post("/api/sessions").send({}).expect(503);

        expect(res.body.error).toBe("Not enough questions available");
        expect(res.body.details[0].message).toContain(`found 3`);
        expect(db.createSessionWithQuestions).not.toHaveBeenCalled();
    });

    it("never deals a short session on either branch", async () => {
        for (const [count, beat] of [
            [0, CONSOLE_OUTPUT],
            [QUESTIONS_PER_SESSION - 1, CONSOLE_OUTPUT],
            [0, null],
            [QUESTIONS_PER_SESSION - 1, null]
        ] as const) {
            vi.clearAllMocks();
            dealable(count);
            nextBeat(beat);

            await request(buildApp()).post("/api/sessions").send({});

            expect(db.createSessionWithQuestions).not.toHaveBeenCalled();
        }
    });
});

describe("POST /api/sessions when the pool is healthy", () => {
    it("deals exactly as before and never asks for an introduction", async () => {
        dealable(QUESTIONS_PER_SESSION);
        vi.mocked(db.createSessionWithQuestions).mockResolvedValue({
            id: "42",
            status: "in_progress",
            started_at: new Date(),
            completed_at: null,
            abandoned_at: null,
            score: 0,
            xp_earned: 0
        });

        const res = await request(buildApp()).post("/api/sessions").send({}).expect(201);

        expect(res.body.sessionId).toBe("42");
        expect(res.body.introduction).toBeUndefined();
        // The Learn Beat lookup is a cost, not a decoration: it must not run on
        // the path every ordinary round takes.
        expect(curriculum.findNextIntroduction).not.toHaveBeenCalled();
    });
});
