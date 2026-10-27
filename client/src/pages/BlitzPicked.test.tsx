import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * While an answer is being judged, the option that was taken stays marked.
 *
 * The request takes a moment and every option is disabled meanwhile, so before
 * this the screen showed no sign which answer had gone. The mark is display
 * only: what was right is still the server's to say.
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

const QUESTION = {
    sessionQuestionId: "31",
    topic: "operators",
    practisingNow: null,
    challengeType: "predict-output",
    questionNumber: 4,
    totalQuestions: 10,
    prompt: "What does this log?\n\nconsole.log(5 + 3);",
    options: [
        { id: "1", text: "8" },
        { id: "2", text: "53" },
        { id: "3", text: "5 + 3" },
        { id: "4", text: "2" }
    ],
    servedAt: new Date().toISOString(),
    deadlineAt: null,
    msRemaining: null,
    relaxed: true,
    struckOptionIds: [] as string[],
    hintsLeft: 2
};

const VERDICT = {
    outcome: "incorrect", pointsAwarded: 0, scoreSoFar: 0, responseTimeMs: 4000,
    correctOption: "8", explanation: "+ adds numbers.", complete: false, question: null, session: null
};

/** Opens a run whose answer request waits until the test settles it. */
async function open() {
    let settle!: (outcome: "judged" | "failed") => void;
    const answered = new Promise<unknown>((resolve, reject) => {
        settle = (outcome) => (outcome === "judged" ? resolve(VERDICT) : reject(new ApiError(503, "Try again")));
    });

    vi.mocked(api.get).mockImplementation(((path: string) => {
        if (path === "/api/me/sessions/resumable") return Promise.resolve({ sessions: [] });
        if (path === "/api/curriculum/introduction") return Promise.resolve({ introduction: null });
        return Promise.reject(new ApiError(404, "Not found"));
    }) as never);
    vi.mocked(api.post).mockImplementation(((path: string) => {
        if (path === "/api/sessions") return Promise.resolve({ resumed: false, sessionId: "5", scoreSoFar: 0, question: QUESTION });
        if (path.endsWith("/answers")) return answered;
        return Promise.reject(new Error(`unexpected ${path}`));
    }) as never);

    render(
        <MemoryRouter initialEntries={["/code-blitz"]}>
            <GamePage />
        </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: /start code blitz/i }));
    await screen.findByRole("button", { name: /^1\s*8$/ }, { timeout: 5000 });

    return { settle };
}

const option = (n: number) => document.querySelectorAll<HTMLButtonElement>(".option")[n - 1]!;
const picked = () => [...document.querySelectorAll(".option.picked")];

describe("a Code Blitz answer being judged", () => {
    it("keeps the taken option marked, and only that one, until the verdict", async () => {
        const { settle } = await open();

        fireEvent.click(option(2));

        await waitFor(() => expect(picked()).toEqual([option(2)]));
        // Still locked: the mark never re-enables a second answer.
        expect([1, 2, 3, 4].every((n) => option(n).disabled)).toBe(true);

        settle("judged");

        await screen.findByText("Not quite: 8");
        expect(picked()).toEqual([]);
        expect(option(2).className).toMatch(/chosen-incorrect/);
        expect(option(1).className).toMatch(/revealed/);
    });

    it("marks an answer taken by key the same way", async () => {
        await open();

        fireEvent.keyDown(window, { key: "3" });

        await waitFor(() => expect(picked()).toEqual([option(3)]));
    });

    it("drops the mark when the answer could not be sent", async () => {
        const { settle } = await open();

        fireEvent.click(option(2));
        await waitFor(() => expect(picked()).toHaveLength(1));

        settle("failed");

        await waitFor(() => expect(picked()).toEqual([]));
    });
});
