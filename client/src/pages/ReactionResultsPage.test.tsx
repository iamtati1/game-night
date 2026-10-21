import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Reaction's results say which rounds were missed, and how.
 *
 * Browser QA (2026-10-18): two rounds that ran out of time were stored by the
 * server as `timed_out` and shown on the results strip as "-", styled exactly
 * like a round that was never played. The client type had left the status out.
 */
vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {
        detailText = "";
    },
    api: { get: vi.fn() }
}));
vi.mock("../games/useRunContext.js", () => ({
    useRunContext: () => ({ previousBest: null, improvement: null })
}));

const { api } = await import("../api/client.js");
const { ReactionResultsPage } = await import("./ReactionResultsPage.js");

afterEach(() => {
    cleanup();
    vi.mocked(api.get).mockReset();
});

const round = (roundNumber: number, status: string, reactionMs: number | null = null) => ({
    roundNumber,
    status,
    reactionMs,
    tier: status === "reacted" ? { key: "sharp", label: "Keep sharp" } : null,
    pointsAwarded: status === "reacted" ? 200 : 0
});

function open(rounds: ReturnType<typeof round>[]) {
    vi.mocked(api.get).mockImplementation(((path: string) =>
        path === "/api/reaction/sessions/46"
            ? Promise.resolve({
                  session: {
                      score: 600,
                      xpEarned: 125,
                      averageReactionMs: 3944,
                      bestReactionMs: 3674,
                      reactedRounds: 3,
                      totalRounds: 5,
                      tier: { key: "sharp", label: "Keep sharp" },
                      rounds
                  }
              })
            : Promise.reject(new Error("no path"))) as never);

    return render(
        <MemoryRouter initialEntries={["/reaction/results/46"]}>
            <Routes>
                <Route path="/reaction/results/:id" element={<ReactionResultsPage />} />
            </Routes>
        </MemoryRouter>
    );
}

describe("the Reaction results strip", () => {
    it("marks a round that ran out of time as slow, not as unplayed", async () => {
        open([round(1, "reacted", 3674), round(2, "false_start"), round(3, "timed_out"), round(4, "pending")]);

        const strip = await screen.findByRole("list", { name: "Every round" });
        const items = within(strip).getAllByRole("listitem");

        expect(items.map((li) => li.textContent)).toEqual(["13674", "2early", "3slow", "4-"]);
        // A miss looks like a miss; only a round never reached looks unplayed.
        expect(items[2]!.className).toBe("early");
        expect(items[3]!.className).toBe("unplayed");
    });
});
