import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Moving from one Code Blitz question to the next.
 *
 * Measured in the browser: Next to the next question took ~215ms locally,
 * 170ms of it the exit animation, then GET /sessions/current. Two findings:
 *
 *   - the answered question came back on screen, unanswered and clickable,
 *     for the whole round trip of that request;
 *   - with reduced motion the 170ms wait ran although the animation did not.
 *
 * The request itself still waits for the exit, because it stamps served_at:
 * fetching earlier would start a timed question's clock before it is seen.
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

const question = (n: number, text: string) => ({
    sessionQuestionId: String(30 + n),
    topic: "operators",
    practisingNow: null,
    challengeType: "predict-output",
    questionNumber: n,
    totalQuestions: 10,
    prompt: `What does this log?\n\nconsole.log(${text});`,
    options: [
        { id: `${n}a`, text: "8" },
        { id: `${n}b`, text: "53" },
        { id: `${n}c`, text: "5 + 3" },
        { id: `${n}d`, text: "2" }
    ],
    servedAt: new Date().toISOString(),
    deadlineAt: null,
    msRemaining: null,
    relaxed: true,
    struckOptionIds: [] as string[],
    hintsLeft: 2
});

function reducedMotion(on: boolean) {
    vi.stubGlobal("matchMedia", (query: string) => ({
        matches: on && query.includes("reduce"),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined
    }));
}

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
});

/** Answers question 1 and leaves the request for question 2 waiting. */
async function answerFirst(explanation = "+ adds numbers.") {
    let serveNext!: () => void;
    const nextServed = new Promise<unknown>((resolve) => {
        serveNext = () => resolve({ complete: false, scoreSoFar: 100, question: question(2, "6 * 7") });
    });

    vi.mocked(api.get).mockImplementation(((path: string) => {
        if (path === "/api/me/sessions/resumable") return Promise.resolve({ sessions: [] });
        if (path === "/api/curriculum/introduction") return Promise.resolve({ introduction: null });
        if (path === "/api/sessions/current") return nextServed;
        return Promise.reject(new ApiError(404, "Not found"));
    }) as never);
    vi.mocked(api.post).mockImplementation(((path: string) => {
        if (path === "/api/sessions") return Promise.resolve({ resumed: false, sessionId: "5", scoreSoFar: 0, question: question(1, "5 + 3") });
        if (path.endsWith("/answers")) {
            return Promise.resolve({
                outcome: "correct", pointsAwarded: 100, scoreSoFar: 100, responseTimeMs: 4000,
                correctOption: "8", explanation, complete: false, question: null, session: null
            });
        }
        return Promise.reject(new Error(`unexpected ${path}`));
    }) as never);

    render(
        <MemoryRouter initialEntries={["/code-blitz"]}>
            <GamePage />
        </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: /start code blitz/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^1\s*8$/ }, { timeout: 5000 }));
    await screen.findByText(/Correct · \+100/);

    return { serveNext };
}

const currentRequests = () => vi.mocked(api.get).mock.calls.filter(([p]) => p === "/api/sessions/current").length;
const stage = () => document.querySelector(".play-stage")!;
const options = () => [...document.querySelectorAll<HTMLButtonElement>(".option")];

describe("advancing to the next Code Blitz question", () => {
    it("keeps the answered question hidden and locked until the next one arrives", async () => {
        reducedMotion(false);
        const { serveNext } = await answerFirst();

        const before = currentRequests();
        fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
        await waitFor(() => expect(currentRequests()).toBe(before + 1));

        // The request is out and has not come back: question 1 must not
        // reappear as if unanswered.
        expect(stage().className).toMatch(/leaving/);
        expect(options().every((b) => b.disabled)).toBe(true);

        serveNext();

        await waitFor(() => expect(document.querySelector(".prompt")?.textContent).toBe("console.log(6 * 7);"));
        expect(stage().className).not.toMatch(/leaving/);
        expect(options().some((b) => !b.disabled)).toBe(true);
    });

    it("waits for the exit animation before asking, so the clock starts when the question shows", async () => {
        reducedMotion(false);
        await answerFirst();

        const before = currentRequests();
        fireEvent.click(screen.getByRole("button", { name: /^Next/ }));

        expect(currentRequests()).toBe(before);
        await waitFor(() => expect(currentRequests()).toBe(before + 1));
    });

    it("asks straight away with reduced motion, where there is no exit animation to wait for", async () => {
        reducedMotion(true);
        await answerFirst();

        const before = currentRequests();
        fireEvent.click(screen.getByRole("button", { name: /^Next/ }));

        expect(currentRequests()).toBe(before + 1);
        expect(stage().className).toMatch(/leaving/);
    });

    it("lets Enter open the explanation's optional detail instead of moving on", async () => {
        reducedMotion(false);
        await answerFirst(
            "`+` adds two numbers into one. The sum is worked out before it is shown. Joining would need text on one side."
        );
        const before = currentRequests();

        const summary = screen.getByText("More on why");
        summary.focus();
        fireEvent.keyDown(summary, { key: "Enter" });

        // Not advanced: the Next button is still there and nothing was asked for.
        expect(screen.getByRole("button", { name: /^Next/ })).toBeTruthy();
        await new Promise((r) => setTimeout(r, 250));
        expect(currentRequests()).toBe(before);

        // Anywhere else, Enter still moves on.
        fireEvent.keyDown(window, { key: "Enter" });
        await waitFor(() => expect(currentRequests()).toBe(before + 1));
    });
});
