import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Code Blitz: running out of time teaches something.
 *
 * UX audit: a timeout showed "Time's up" for 1.4 seconds with no answer and
 * no reason, then moved on. The answer route already adjudicates a lapsed
 * question when sent with NO option -- recording a timeout, never a choice --
 * and returns the correct answer and explanation without serving the next
 * question. These drive the real page through Start and a clock that runs out.
 */
vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {
        status: number;
        detailText: string;

        constructor(status: number, message: string) {
            super(message);
            this.status = status;
            this.detailText = message;
        }
    },
    api: { get: vi.fn(), post: vi.fn() }
}));

const { ApiError, api } = await import("../api/client.js");
const { GamePage } = await import("./GamePage.js");

afterEach(() => {
    cleanup();
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
});

/** A question whose clock runs out shortly after it appears. */
const question = (ms: number) => ({
    sessionQuestionId: "31",
    topic: "operators",
    practisingNow: null,
    challengeType: "predict-output",
    questionNumber: 2,
    totalQuestions: 10,
    prompt: "What does this log?\n\nconsole.log(5 + 3);",
    options: [
        { id: "1", text: "8" },
        { id: "2", text: "53" }
    ],
    servedAt: new Date().toISOString(),
    deadlineAt: new Date(Date.now() + ms).toISOString(),
    msRemaining: ms
});

const TIMED_OUT = {
    outcome: "timed_out",
    pointsAwarded: 0,
    scoreSoFar: 40,
    correctOption: "8",
    explanation: "+ adds two numbers, so 5 + 3 is 8.",
    complete: false,
    question: null,
    session: null
};

/** Opens Code Blitz, starts a run, and waits for the question to be on screen. */
async function play(
    answer: (body: Record<string, unknown>) => Promise<unknown>,
    ms = 3600,
    served: ReturnType<typeof question> | Record<string, unknown> = question(ms)
) {
    vi.mocked(api.get).mockImplementation(((path: string) => {
        if (path === "/api/me/sessions/resumable") return Promise.resolve({ sessions: [] });
        if (path === "/api/curriculum/introduction") return Promise.resolve({ introduction: null });
        // No run in progress, and no curriculum to name: the plain entrance.
        return Promise.reject(new ApiError(404, "Not found"));
    }) as never);
    vi.mocked(api.post).mockImplementation(((path: string, body: Record<string, unknown>) => {
        if (path === "/api/sessions") {
            return Promise.resolve({ resumed: false, sessionId: "5", scoreSoFar: 40, question: served });
        }
        // Leaving a live round pauses it (usePauseOnLeave), and each test's
        // cleanup leaves one; that is not an answer.
        if (path.endsWith("/pause")) return Promise.resolve({ paused: true });
        return answer(body);
    }) as never);

    render(
        <MemoryRouter initialEntries={["/code-blitz"]}>
            <GamePage />
        </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: /start code blitz/i }));
    // Through the 3, 2, 1 count-in to the question.
    const first = (served as { options: { text: string }[] }).options[0]!.text;
    await screen.findByRole("button", { name: new RegExp(`^1\\s*${first.replace(/[+*?]/g, "\\$&")}$`) }, { timeout: 5000 });
}

const currentFetches = () => vi.mocked(api.get).mock.calls.filter(([p]) => p === "/api/sessions/current").length;
const answerBodies = () =>
    vi.mocked(api.post).mock.calls.filter(([p]) => String(p).endsWith("/answers")).map(([, b]) => b as Record<string, unknown>);

describe("Code Blitz, when the clock runs out", { timeout: 20000 }, () => {
    it("names the answer and the reason, and waits for the learner", async () => {
        await play(() => Promise.resolve(TIMED_OUT), 400);
        const before = currentFetches();

        expect(await screen.findByText("Time’s up: the answer was 8", {}, { timeout: 3000 })).toBeTruthy();
        expect(screen.getByText("+ adds two numbers, so 5 + 3 is 8.")).toBeTruthy();

        // Held: still there well after the old 1.4-second dwell, nothing fetched.
        await act(() => new Promise((r) => setTimeout(r, 1800)));
        expect(screen.getByText("Time’s up: the answer was 8")).toBeTruthy();
        expect(currentFetches()).toBe(before);

        // Only the learner's Next asks for the next question.
        fireEvent.click(screen.getByRole("button", { name: /next/i }));
        await waitFor(() => expect(currentFetches()).toBe(before + 1));
    });

    it("submits no answer the learner did not choose", async () => {
        await play(() => Promise.resolve(TIMED_OUT), 400);

        await screen.findByText(/the answer was 8/, {}, { timeout: 3000 });

        expect(answerBodies()).toEqual([{ sessionQuestionId: "31" }]);
    });

    it("waits out a server clock that has not quite reached the deadline", async () => {
        let asked = 0;
        await play(() => (++asked === 1 ? Promise.reject(new ApiError(400, "This question is answered by choosing one option")) : Promise.resolve(TIMED_OUT)), 400);

        expect(await screen.findByText(/the answer was 8/, {}, { timeout: 4000 })).toBeTruthy();
        expect(answerBodies()).toEqual([{ sessionQuestionId: "31" }, { sessionQuestionId: "31" }]);
    });

    it("names no answer when it could not get one, rather than inventing it", async () => {
        await play(() => Promise.reject(new TypeError("Failed to fetch")), 400);
        // The old path: the next question, from GET /sessions/current.
        vi.mocked(api.get).mockImplementation(((path: string) =>
            path === "/api/sessions/current"
                ? Promise.resolve({ complete: false, sessionId: "5", scoreSoFar: 40, question: question(18_000) })
                : Promise.reject(new ApiError(404, "Not found"))) as never);

        expect(await screen.findByText("Time’s up", {}, { timeout: 3000 })).toBeTruthy();
        expect(screen.queryByText(/the answer was/)).toBeNull();
    });
});

describe("Code Blitz, ordinary answers are unchanged", { timeout: 20000 }, () => {
    it("still marks a wrong answer with the correct one and lets the learner move on", async () => {
        await play((body) =>
            Promise.resolve({
                outcome: body.selectedOptionId === "1" ? "correct" : "incorrect",
                pointsAwarded: 0,
                scoreSoFar: 40,
                correctOption: "8",
                explanation: "+ adds two numbers, so 5 + 3 is 8.",
                complete: false,
                question: null,
                session: null
            })
        );

        fireEvent.click(screen.getByRole("button", { name: /^2\s*53$/ }));

        expect(await screen.findByText("Not quite: 8")).toBeTruthy();
        expect(screen.getByRole("button", { name: /next/i })).toBeTruthy();
        expect(answerBodies()).toEqual([{ sessionQuestionId: "31", selectedOptionId: "2" }]);
    });
});

describe("Code Blitz, resumed after a reload", { timeout: 20000 }, () => {
    // Browser QA (2026-10-18): reloading mid-run resumed the question but never
    // stored the run's id, and submit() returns early without one -- so no
    // answer did anything, and an untimed opening question could never be left.
    it("answers the resumed question against the run it belongs to", async () => {
        vi.mocked(api.get).mockImplementation(((path: string) => {
            if (path === "/api/me/sessions/resumable") return Promise.resolve({ sessions: [] });
            if (path === "/api/sessions/current") {
                return Promise.resolve({ complete: false, sessionId: "47", scoreSoFar: 0, question: question(18_000) });
            }
            return Promise.reject(new ApiError(404, "Not found"));
        }) as never);
        vi.mocked(api.post).mockResolvedValue({
            outcome: "correct",
            pointsAwarded: 100,
            scoreSoFar: 100,
            correctOption: "8",
            explanation: null,
            complete: false,
            question: null,
            session: null
        } as never);

        render(
            <MemoryRouter initialEntries={["/code-blitz"]}>
                <GamePage />
            </MemoryRouter>
        );

        // Straight back to the question -- no entrance, no Start.
        fireEvent.click(await screen.findByRole("button", { name: /^1\s*8$/ }));

        expect(await screen.findByText("Correct · +100")).toBeTruthy();
        expect(
            vi.mocked(api.post).mock.calls.map(([path]) => path).filter((p) => !String(p).endsWith("/pause"))
        ).toEqual(["/api/sessions/47/answers"]);
    });
});

describe("Code Blitz, a build-the-code question that runs out", { timeout: 20000 }, () => {
    // Not reachable in browser QA: no assembly question was dealt to the QA
    // learner. So it is pinned here, deterministically.
    const ASSEMBLY = {
        ...question(1500),
        challengeType: "complete-code",
        prompt: "What completes the line so it logs 6?\n\nlet n = 5;\nn/*?*/;\nconsole.log(n);",
        options: [
            { id: "1", text: "++" },
            { id: "2", text: "--" },
            { id: "3", text: "+=" }
        ]
    };

    it("names the answer, never what was placed but not submitted, and submits nothing", async () => {
        await play(
            () => Promise.resolve({ ...TIMED_OUT, correctOption: "++", explanation: "`++` adds one to `n`." }),
            1500,
            ASSEMBLY
        );

        // A token placed in the gap, never submitted.
        fireEvent.keyDown(window, { key: "2" });

        expect(await screen.findByText("Time\u2019s up: the answer was ++", {}, { timeout: 4000 })).toBeTruthy();
        // No "You built" row: nothing was built and handed in.
        expect(screen.queryByText("You built")).toBeNull();
        expect(answerBodies()).toEqual([{ sessionQuestionId: "31" }]);
        // And the explanation's code is code, not backticks.
        const why = document.querySelector(".feedback-why")!;
        expect(why.textContent).toBe("++ adds one to n.");
        expect([...why.querySelectorAll("code")].map((c) => c.textContent)).toEqual(["++", "n"]);
    });
});

describe("Code Blitz feedback, read and moved on from by keyboard", { timeout: 20000 }, () => {
    const WRONG = (body: Record<string, unknown>) =>
        Promise.resolve({
            outcome: body.selectedOptionId === "1" ? "correct" : "incorrect",
            pointsAwarded: 0,
            scoreSoFar: 40,
            correctOption: "8",
            explanation: "`+` adds two numbers, so `5 + 3` is 8.",
            complete: false,
            question: null,
            session: null
        });

    it("moves focus to Next once feedback is up, and one Enter advances once", async () => {
        await play(WRONG);
        vi.mocked(api.get).mockImplementation(((path: string) =>
            path === "/api/sessions/current"
                ? Promise.resolve({ complete: false, sessionId: "5", scoreSoFar: 40, question: question(18_000) })
                : Promise.reject(new ApiError(404, "Not found"))) as never);

        fireEvent.keyDown(window, { key: "2" });
        const next = await screen.findByRole("button", { name: /next/i });

        await waitFor(() => expect(document.activeElement).toBe(next));

        // The mount-time resume probe is one of these; count from here.
        const before = currentFetches();
        fireEvent.keyDown(next, { key: "Enter" });
        await waitFor(() => expect(currentFetches()).toBe(before + 1));
        await act(() => new Promise((r) => setTimeout(r, 400)));
        expect(currentFetches()).toBe(before + 1);
    });

    it("renders the explanation's inline code as code", async () => {
        await play(WRONG);

        fireEvent.keyDown(window, { key: "2" });
        await screen.findByText("Not quite: 8");

        const why = document.querySelector(".feedback-why")!;
        expect(why.textContent).not.toMatch(/`/);
        expect([...why.querySelectorAll("code")].map((c) => c.textContent)).toEqual(["+", "5 + 3"]);
    });
});


describe("Code Blitz, left mid-question", { timeout: 20000 }, () => {
    it("pauses the run, so its clock stops while the learner is elsewhere", async () => {
        await play(() => Promise.resolve(TIMED_OUT), 30_000);
        expect(vi.mocked(api.post).mock.calls.some(([p]) => p === "/api/me/sessions/code-blitz/pause")).toBe(false);

        cleanup(); // the learner follows the nav away

        expect(vi.mocked(api.post).mock.calls.some(([p]) => p === "/api/me/sessions/code-blitz/pause")).toBe(true);
    });
});
