import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Code Blitz results adapt to how the run went (games/runTone.ts): after a
 * tough run the next step is worded as a look back at the lesson; after a
 * strong one, a line says so. The destination, the single primary and every
 * figure are unchanged, and nothing is recorded.
 */

vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {},
    api: { get: vi.fn() }
}));

vi.mock("../games/useRunContext.js", () => ({
    useRunContext: () => ({ previousBest: null, improvement: null })
}));

const { api } = await import("../api/client.js");
const { ResultsPage } = await import("./ResultsPage.js");

afterEach(() => {
    cleanup();
    vi.mocked(api.get).mockReset();
});

function session(correct: number, total = 10) {
    return {
        id: "41",
        status: "completed",
        score: correct * 100,
        xpEarned: correct * 10 + 25,
        startedAt: "2026-10-18T10:00:00.000Z",
        completedAt: "2026-10-18T10:03:00.000Z",
        totalQuestions: total,
        correctCount: correct,
        incorrectCount: total - correct,
        timedOutCount: 0,
        bestStreak: 1,
        averageResponseMs: 4000,
        successRate: correct / total,
        questions: []
    };
}

function open(correct: number, rungs = { cleared: 1, playable: 3 }) {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
        if (path === "/api/sessions/41") {
            return {
                session: session(correct),
                curriculum: {
                    concept: { slug: "console-output", name: "Running Code", topic: null },
                    rungs,
                    earned: []
                }
            };
        }
        throw new Error(`unexpected request ${path}`);
    });

    return render(
        <MemoryRouter initialEntries={["/results/41"]}>
            <Routes>
                <Route path="/results/:id" element={<ResultsPage />} />
            </Routes>
        </MemoryRouter>
    );
}

describe("Code Blitz results after a tough run", () => {
    it("leads with a look back at the lesson, to the same concept", async () => {
        const { container } = open(3);

        const next = await screen.findByRole("link", { name: "Look back at Running Code" });
        expect(next.getAttribute("href")).toBe("/concept/console-output");
        expect(screen.getByText(/A tough run: 3 of 10 right/)).toBeTruthy();
        expect(container.querySelectorAll("a.button.primary")).toHaveLength(1);
        // The score and XP are shown exactly as before.
        expect(container.querySelector(".run-score")?.textContent).toContain("300");
    });

    it("still offers the demonstration when every stop is already cleared", async () => {
        open(2, { cleared: 3, playable: 3 });
        expect(await screen.findByRole("link", { name: "Demonstrate Running Code" })).toBeTruthy();
        expect(screen.queryByRole("link", { name: /Look back/ })).toBeNull();
    });

    it("does not also tell the learner to look back at the lesson above a Demonstrate button", async () => {
        // QA finding: "A tough run... Looking back at the lesson first usually
        // helps." sat directly above "Demonstrate", two contradictory next steps.
        open(3, { cleared: 1, playable: 1 });

        expect(await screen.findByRole("link", { name: "Demonstrate Running Code" })).toBeTruthy();
        expect(screen.queryByText(/A tough run/)).toBeNull();
        expect(screen.queryByText(/Looking back at the lesson/)).toBeNull();
    });
});

describe("Code Blitz results after a strong run", () => {
    it("says so in one line and continues as usual", async () => {
        open(9);
        expect(await screen.findByRole("link", { name: "Continue: Running Code" })).toBeTruthy();
        expect(screen.getByText("Strong run: 9 of 10 right.")).toBeTruthy();
    });
});
