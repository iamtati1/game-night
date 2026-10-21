import express from "express";
import session from "express-session";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A relaxed Code Blitz run: no clock, nothing times out, no speed bonus --
 * and nothing else about the run changes.
 *
 * The real router runs, with a real (in-memory) express-session so the run's
 * pace is carried between requests exactly as it is in production, and only
 * the database modules stubbed -- the same approach as learnBeatRouting.test.ts.
 *
 * The beat used is display order 5: past the untimed opening beats, so a timed
 * run WOULD put a clock on it. Its served_at is ten minutes ago, far past the
 * 18-second window, which is the strongest way to show the relaxed run ignores
 * the deadline rather than merely having a long one.
 */

vi.mock("../auth/middleware.js", () => ({
    requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
        (req as express.Request & { user: { id: string } }).user = { id: "7" };
        next();
    }
}));

vi.mock("../questions/queries.js", () => ({ countDealableQuestions: vi.fn(async () => 50) }));
vi.mock("../curriculum/queries.js", () => ({ findNextIntroduction: vi.fn(async () => null) }));
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

const TEN_MINUTES_AGO = () => new Date(Date.now() - 10 * 60_000);

/** One beat, mutable so the stubs can follow the run. */
let beat: Record<string, unknown>;
const sessionRow = () => ({
    id: "41",
    status: "in_progress",
    score: 0,
    xp_earned: 0,
    started_at: new Date(0),
    completed_at: null
});

vi.mock("./queries.js", () => ({
    createSessionWithQuestions: vi.fn(async () => sessionRow()),
    findSessionForUser: vi.fn(async () => sessionRow()),
    listSessionQuestions: vi.fn(async () => [beat]),
    scoreSoFar: vi.fn(async () => 0),
    conceptForQuestion: vi.fn(async () => null),
    rungsEarnedInSession: vi.fn(async () => []),
    findNextPendingQuestion: vi.fn(async () => (beat.status === "pending" ? beat : null)),
    markServed: vi.fn(async () => {
        beat.served_at = TEN_MINUTES_AGO();
        return beat.served_at;
    }),
    listActiveOptions: vi.fn(async () => [
        { id: "1", option_text: "10" },
        { id: "2", option_text: "55" }
    ]),
    findSessionQuestion: vi.fn(async () => beat),
    findCorrectOptionText: vi.fn(async () => "10"),
    findExplanation: vi.fn(async () => "Worked out first."),
    findOption: vi.fn(async (id: string) => ({ id, optionText: id === "1" ? "10" : "55", isCorrect: id === "1" })),
    recordAnswer: vi.fn(async () => {
        const answeredAt = new Date();
        Object.assign(beat, { status: "answered", is_correct: true, answered_at: answeredAt });
        return answeredAt;
    }),
    recordTimeout: vi.fn(async () => {
        Object.assign(beat, { status: "timed_out", is_correct: false });
    }),
    completeSession: vi.fn(async (_id: string, score: number, xp: number) => ({
        ...sessionRow(),
        status: "completed",
        score,
        xp_earned: xp,
        completed_at: new Date()
    }))
}));

const { gameRouter } = await import("./routes.js");
const db = await import("./queries.js");
const sessions = await import("../sessions/queries.js");
const { xpForSession } = await import("./scoring.js");

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: true }));
    app.use("/api", gameRouter);
    return app;
}

beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks keeps implementations; these are set per test.
    vi.mocked(sessions.findActiveSession).mockResolvedValue(null);
    vi.mocked(sessions.findResumableSession).mockResolvedValue(null);
    beat = {
        id: "900",
        question_id: "5",
        display_order: 5,
        prompt_text: "What does this log?\n\nconsole.log(5 + 5);",
        topic: "values",
        explanation: null,
        challenge_type: "predict-output",
        status: "pending",
        served_at: null,
        selected_option_id: null,
        selected_option_text: null,
        correct_option_text: null,
        is_correct: null,
        answered_at: null,
        timed_out_at: null
    };
});

const startAndAnswer = async (body: object) => {
    const agent = request.agent(buildApp());
    const start = await agent.post("/api/sessions").send(body).expect(201);
    vi.mocked(sessions.findActiveSession).mockResolvedValue({ id: "41", gameSlug: "code-blitz", gameName: "Code Blitz" } as never);
    const current = await agent.get("/api/sessions/current").expect(200);
    const answer = await agent
        .post("/api/sessions/41/answers")
        .send({ sessionQuestionId: "900", selectedOptionId: "1" })
        .expect(200);
    return { agent, start, current, answer };
};

describe("a relaxed Code Blitz run", () => {
    it("serves its beats with no deadline, on start and on every later fetch", async () => {
        const { start, current } = await startAndAnswer({ relaxed: true });

        expect(start.body.question.deadlineAt).toBeNull();
        expect(start.body.question.msRemaining).toBeNull();
        expect(start.body.question.relaxed).toBe(true);
        // A later request reads the pace from the login session, not the body.
        expect(current.body.question.deadlineAt).toBeNull();
        expect(current.body.question.relaxed).toBe(true);
    });

    it("accepts a correct answer however long it took, for base points and no speed bonus", async () => {
        const { answer } = await startAndAnswer({ relaxed: true });

        expect(answer.body.outcome).toBe("correct");
        expect(answer.body.pointsAwarded).toBe(100);
        expect(db.recordTimeout).not.toHaveBeenCalled();
    });

    it("finishes with the same XP a timed run earns for the same answers", async () => {
        const { answer } = await startAndAnswer({ relaxed: true });

        expect(answer.body.complete).toBe(true);
        expect(answer.body.session.relaxed).toBe(true);
        const [, score, xp] = vi.mocked(db.completeSession).mock.calls[0]!;
        expect(score).toBe(100);
        expect(xp).toBe(
            xpForSession([{ isCorrect: true, servedAt: new Date(0), answeredAt: new Date(1) }])
        );
        expect(answer.body.session.questions[0].pointsAwarded).toBe(100);
    });
});

describe("a timed Code Blitz run is unchanged", () => {
    it("still has a deadline and still times out a late beat", async () => {
        const agent = request.agent(buildApp());
        const start = await agent.post("/api/sessions").send({}).expect(201);

        expect(start.body.question.deadlineAt).not.toBeNull();
        expect(start.body.question.relaxed).toBe(false);

        // Ten minutes later the next request's sweep adjudicates the beat as
        // timed out, and an answer for it is then refused.
        vi.mocked(sessions.findActiveSession).mockResolvedValue({ id: "41", gameSlug: "code-blitz", gameName: "Code Blitz" } as never);
        const current = await agent.get("/api/sessions/current").expect(200);
        expect(db.recordTimeout).toHaveBeenCalledTimes(1);
        expect(current.body.complete).toBe(true);
        expect(current.body.session.relaxed).toBe(false);

        await agent
            .post("/api/sessions/41/answers")
            .send({ sessionQuestionId: "900", selectedOptionId: "1" })
            .expect(409);
    });

    it("does not inherit another login's relaxed run", async () => {
        await startAndAnswer({ relaxed: true });
        beat.status = "pending";
        beat.served_at = null;

        // A different browser: a fresh login session with no record of run 41.
        const other = request.agent(buildApp());
        const current = await other.get("/api/sessions/current").expect(200);

        expect(current.body.question.deadlineAt).not.toBeNull();
    });
});

describe("pause and resume keep the run's pace", () => {
    it("resumes a paused relaxed run without a clock, whatever the resume body says", async () => {
        const agent = request.agent(buildApp());
        await agent.post("/api/sessions").send({ relaxed: true }).expect(201);

        // The learner paused; Start now resumes that run rather than dealing.
        vi.mocked(sessions.findResumableSession).mockResolvedValue({ id: "41", status: "paused" } as never);
        vi.mocked(sessions.resumePausedSession).mockResolvedValue({ outcome: "resumed" } as never);

        const resumed = await agent.post("/api/sessions").send({}).expect(200);

        expect(resumed.body.resumed).toBe(true);
        expect(resumed.body.question.deadlineAt).toBeNull();
        expect(resumed.body.question.relaxed).toBe(true);
        expect(db.createSessionWithQuestions).toHaveBeenCalledTimes(1);
    });

    it("cannot turn a timed run relaxed by resuming with relaxed: true", async () => {
        const agent = request.agent(buildApp());
        await agent.post("/api/sessions").send({}).expect(201);

        vi.mocked(sessions.findResumableSession).mockResolvedValue({ id: "41", status: "in_progress" } as never);
        beat.served_at = new Date(); // still inside its window

        const resumed = await agent.post("/api/sessions").send({ relaxed: true }).expect(200);

        expect(resumed.body.question.deadlineAt).not.toBeNull();
        expect(resumed.body.question.relaxed).toBe(false);
    });
});
