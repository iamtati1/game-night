import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The Log page is named for what it is. Its heading used to be the count --
 * "1 run" -- so the page had no heading that said where you were.
 */
vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {},
    api: { get: vi.fn() }
}));

const { api } = await import("../api/client.js");
const { HistoryPage } = await import("./HistoryPage.js");

afterEach(cleanup);

describe("the game log", () => {
    it("is headed by its name, with the count beside it, and titles the tab", async () => {
        vi.mocked(api.get).mockResolvedValue({
            sessions: [
                {
                    id: "1",
                    game: { slug: "reaction", name: "Reaction" },
                    status: "completed",
                    score: 900,
                    xpEarned: 30,
                    startedAt: "2026-10-19T10:00:00Z",
                    endedAt: "2026-10-19T10:02:00Z",
                    progress: { total: 5, correct: 5, incorrect: 0, timedOut: 0 }
                }
            ],
            pagination: { limit: 20, offset: 0, total: 1, hasMore: false }
        });

        render(
            <MemoryRouter>
                <HistoryPage />
            </MemoryRouter>
        );

        expect(await screen.findByRole("heading", { level: 1, name: "Your game log" })).toBeTruthy();
        expect(screen.getByText("1 run")).toBeTruthy();
        expect(document.title).toBe("Game log · Jolt");
    });
});
