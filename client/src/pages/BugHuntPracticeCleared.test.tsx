import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The Bug Hunt results say which course practice stops the run cleared, from
 * the server's `earned` -- and keep that apart from XP, which counts every
 * resolved bug.
 */

vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {
        detailText = "";
    },
    api: { get: vi.fn(), post: vi.fn() }
}));

vi.mock("../games/useRunContext.js", () => ({
    useRunContext: () => ({ previousBest: null, improvement: null })
}));

const { api } = await import("../api/client.js");
const { BugHuntResultsPage } = await import("./BugHuntResultsPage.js");

const SESSION = {
    id: "7",
    status: "completed",
    score: 410,
    xpEarned: 41,
    bestStreak: 2,
    incidentsResolved: 4,
    totalIncidents: 6,
    firstTryFixes: 3,
    hintsUsed: 1,
    systemIntegrity: 80,
    averageResolutionMs: 20000,
    byCategory: [],
    incidents: []
};

function openResults(body: unknown) {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
        if (path === "/api/bug-hunt/sessions/7") return body;
        if (path === "/api/curriculum/path") throw new Error("not needed");
        return {};
    });

    render(
        <MemoryRouter initialEntries={["/bug-hunt/results/7"]}>
            <Routes>
                <Route path="/bug-hunt/results/:id" element={<BugHuntResultsPage />} />
            </Routes>
        </MemoryRouter>
    );
}

afterEach(() => {
    cleanup();
    vi.mocked(api.get).mockReset();
});

describe("Bug Hunt results: course practice", () => {
    it("names each practice stop the run cleared, in the learner's words", async () => {
        openResults({
            session: SESSION,
            earned: [
                { conceptSlug: "console-output", conceptName: "Running Code and Reading Output", demandSlug: "diagnose" },
                { conceptSlug: "assignment", conceptName: "Assigning a Value", demandSlug: "repair" }
            ]
        });

        const block = await screen.findByRole("region", { name: "Course practice" });
        const items = within(block).getAllByRole("listitem").map((li) => li.textContent);
        expect(items).toEqual([
            "✓ Find the problem · Running Code and Reading Output",
            "✓ Fix it · Assigning a Value"
        ]);
        expect(within(block).getByText(/these stops count toward your course/i)).toBeTruthy();
        // XP is said to be a different thing.
        expect(within(block).getByText(/XP counts every bug you fix/)).toBeTruthy();
    });

    it("says plainly when the run cleared no practice stop, while XP was still earned", async () => {
        openResults({ session: SESSION, earned: [] });

        const block = await screen.findByRole("region", { name: "Course practice" });
        expect(within(block).queryAllByRole("listitem")).toHaveLength(0);
        expect(within(block).getByText(/no practice stops cleared this run/i)).toBeTruthy();
        expect(screen.getByText("+41")).toBeTruthy();
    });

    it("shows no practice block when the server does not say (an older server)", async () => {
        openResults({ session: SESSION });

        await screen.findByText("410");
        expect(screen.queryByRole("region", { name: "Course practice" })).toBeNull();
    });
});
