import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Code Blitz hints: rule out a wrong answer at a stated cost (a correct answer
 * then scores half). The page shows the cost, never lets a ruled-out option be
 * chosen by click or key, and says the hint in the verdict.
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

async function open(served = QUESTION) {
    vi.mocked(api.get).mockImplementation(((path: string) => {
        if (path === "/api/me/sessions/resumable") return Promise.resolve({ sessions: [] });
        if (path === "/api/curriculum/introduction") return Promise.resolve({ introduction: null });
        return Promise.reject(new ApiError(404, "Not found"));
    }) as never);
    vi.mocked(api.post).mockImplementation(((path: string) => {
        if (path === "/api/sessions") return Promise.resolve({ resumed: false, sessionId: "5", scoreSoFar: 0, question: served });
        if (path.endsWith("/pause")) return Promise.resolve({ paused: true });
        if (path.endsWith("/hints")) return Promise.resolve({ struckOptionIds: ["3"], hintsLeft: 1, hintsUsed: 1 });
        if (path.endsWith("/answers")) {
            return Promise.resolve({
                outcome: "correct", pointsAwarded: 50, scoreSoFar: 50, responseTimeMs: 4000,
                correctOption: "8", explanation: "+ adds numbers.", complete: false, question: null, session: null
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
    await screen.findByRole("button", { name: /^1\s*8$/ }, { timeout: 5000 });
}

const posts = (suffix: string) => vi.mocked(api.post).mock.calls.filter(([p]) => String(p).endsWith(suffix));

describe("Code Blitz hints", () => {
    it("say what they cost before you take one", async () => {
        await open();
        expect(screen.getByRole("button", { name: "Hint: rule out a wrong answer" })).toBeTruthy();
        expect(screen.getByText("A correct answer then scores half.")).toBeTruthy();
    });

    it("rule out the option the server chose, which then cannot be picked by click or key", async () => {
        await open();
        fireEvent.click(screen.getByRole("button", { name: "Hint: rule out a wrong answer" }));

        const struck = await screen.findByRole("button", { name: "5 + 3, ruled out by a hint" }, { timeout: 4000 });
        expect((struck as HTMLButtonElement).disabled).toBe(true);
        expect(posts("/hints")[0]![1]).toEqual({ sessionQuestionId: "31" });
        expect(screen.getByText("Hint used: a correct answer scores half.")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Rule out another" })).toBeTruthy();

        fireEvent.keyDown(window, { key: "3" });
        await new Promise((r) => setTimeout(r, 50));
        expect(posts("/answers")).toHaveLength(0);
    });

    it("say the hint in the verdict, with the half points the server awarded", async () => {
        await open();
        fireEvent.click(screen.getByRole("button", { name: "Hint: rule out a wrong answer" }));
        await screen.findByRole("button", { name: "5 + 3, ruled out by a hint" }, { timeout: 4000 });

        fireEvent.keyDown(window, { key: "1" });
        expect(await screen.findByText(/Correct · \+50 \(hint\)/, {}, { timeout: 4000 })).toBeTruthy();
    });

    it("keep a ruled-out option ruled out when the question comes back (reload, resume)", async () => {
        await open({ ...QUESTION, struckOptionIds: ["2", "4"], hintsLeft: 0 });

        expect(screen.getByRole("button", { name: "53, ruled out by a hint" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "2, ruled out by a hint" })).toBeTruthy();
        expect((screen.getByRole("button", { name: "No hints left" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("are not offered on an assembly question", async () => {
        await open({ ...QUESTION, challengeType: "complete-code", hintsLeft: 0 });
        expect(screen.queryByRole("button", { name: /Hint/ })).toBeNull();
    });
});
