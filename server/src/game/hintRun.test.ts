import express from "express";
import session from "express-session";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * (Harness shared with relaxedRun.test.ts.)
 *
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
        { id: "2", option_text: "55" },
        { id: "3", option_text: "5 + 5" },
        { id: "4", option_text: "1010" }
    ]),
    listOptionCorrectness: vi.fn(async () => [
        { id: "1", isCorrect: true },
        { id: "2", isCorrect: false },
        { id: "3", isCorrect: false },
        { id: "4", isCorrect: false }
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


const start = async (agent: ReturnType<typeof request.agent>) => {
    await agent.post("/api/sessions").send({}).expect(201);
    vi.mocked(sessions.findActiveSession).mockResolvedValue({ id: "41", gameSlug: "code-blitz", gameName: "Code Blitz" } as never);
};

const hint = (agent: ReturnType<typeof request.agent>) =>
    agent.post("/api/sessions/41/hints").send({ sessionQuestionId: "900" });

describe("Code Blitz hints", () => {
    it("rule out wrong answers, up to two, and then say none are left", async () => {
        const agent = request.agent(buildApp());
        await start(agent);
        beat.served_at = new Date();

        const first = await hint(agent).expect(200);
        expect(first.body.struckOptionIds).toHaveLength(1);
        expect(first.body.struckOptionIds).not.toContain("1");
        expect(first.body.hintsLeft).toBe(1);

        const second = await hint(agent).expect(200);
        expect(second.body.struckOptionIds).toHaveLength(2);
        expect(second.body.struckOptionIds).toEqual(expect.arrayContaining(first.body.struckOptionIds));
        expect(second.body.hintsLeft).toBe(0);

        await hint(agent).expect(409);
    });

    it("keep the ruled-out options when the question is served again (reload, resume)", async () => {
        const agent = request.agent(buildApp());
        await start(agent);
        beat.served_at = new Date();
        const taken = await hint(agent).expect(200);

        const current = await agent.get("/api/sessions/current").expect(200);
        expect(current.body.question.struckOptionIds).toEqual(taken.body.struckOptionIds);
        expect(current.body.question.hintsLeft).toBe(1);
    });

    it("make a correct answer score 50, with the same XP as without a hint", async () => {
        const agent = request.agent(buildApp());
        await start(agent);
        beat.served_at = new Date();
        await hint(agent).expect(200);

        const answer = await agent
            .post("/api/sessions/41/answers")
            .send({ sessionQuestionId: "900", selectedOptionId: "1" })
            .expect(200);

        expect(answer.body.outcome).toBe("correct");
        expect(answer.body.pointsAwarded).toBe(50);
        const [, score, xp] = vi.mocked(db.completeSession).mock.calls[0]!;
        expect(score).toBe(50);
        expect(xp).toBe(xpForSession([{ isCorrect: true, servedAt: new Date(0), answeredAt: new Date(1) }]));
        expect(answer.body.session.questions[0]).toMatchObject({ hinted: true, pointsAwarded: 50 });
    });

    it("are refused on a question that is no longer on screen", async () => {
        const agent = request.agent(buildApp());
        await start(agent);
        beat.served_at = new Date();
        await agent.post("/api/sessions/41/answers").send({ sessionQuestionId: "900", selectedOptionId: "2" }).expect(200);

        await hint(agent).expect(409);
    });

    it("cost nothing on a question where no hint was taken", async () => {
        const agent = request.agent(buildApp());
        await start(agent);
        beat.served_at = new Date();

        const answer = await agent
            .post("/api/sessions/41/answers")
            .send({ sessionQuestionId: "900", selectedOptionId: "1" })
            .expect(200);
        expect(answer.body.pointsAwarded).toBe(150);
    });
});
