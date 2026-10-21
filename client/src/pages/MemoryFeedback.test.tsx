import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Memory: the comparison stays until the learner moves on.
 *
 * UX audit: the "You played / It was" comparison -- the only place a miss is
 * explained -- disappeared after 2.6 seconds whether or not it had been read.
 * A Memory round has no server clock, so it now waits for "Next round" (or
 * "See results" after the last one). Scoring is untouched: the numbers shown
 * are the server's, exactly as before.
 */
vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {
        detailText = "";
        body: unknown = null;
    },
    api: { get: vi.fn(), post: vi.fn() }
}));

const { api } = await import("../api/client.js");
const { MemoryPage } = await import("./MemoryPage.js");

afterEach(() => {
    cleanup();
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
});

const round = (n: number, sequence: string[]) => ({
    roundId: `r${n}`,
    roundNumber: n,
    totalRounds: 5,
    sequence,
    displayMs: 300
});

/** Plays round one: watches it, picks `picks`, submits. Returns the next round's id. */
async function playRound(result: Record<string, unknown>, picks: string[], onRecall?: () => void) {
    vi.mocked(api.get).mockResolvedValue({ sessions: [] } as never);
    vi.mocked(api.post).mockImplementation(((path: string) =>
        path === "/api/memory/sessions"
            ? Promise.resolve({ resumed: false, sessionId: "8", scoreSoFar: 0, round: round(1, ["star", "circle"]) })
            : Promise.resolve(result)) as never);

    render(
        <MemoryRouter initialEntries={["/memory"]}>
            <Routes>
                <Route path="/memory" element={<MemoryPage />} />
                <Route path="/memory/results/:id" element={<p>the results</p>} />
            </Routes>
        </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Start Memory" }));

    // Count-in, the sequence, then the recall bank.
    for (const pick of picks) {
        fireEvent.click(await screen.findByRole("button", { name: pick }, { timeout: 8000 }));
    }
    onRecall?.();
    fireEvent.click(screen.getByRole("button", { name: /^submit/i }));
}

const MISS = {
    correct: 1,
    perfect: false,
    length: 2,
    sequence: ["star", "circle"],
    submitted: ["star", "triangle"],
    pointsAwarded: 10,
    scoreSoFar: 10,
    complete: false,
    round: round(2, ["moon", "cross", "star"]),
    session: null
};

describe("Memory feedback", { timeout: 25000 }, () => {
    it("keeps the comparison on screen until Next round is pressed", async () => {
        await playRound(MISS, ["star", "circle"]);

        expect(await screen.findByText("1 of 2 remembered")).toBeTruthy();

        // Well past the old 2.6 seconds: still here, and round two not begun.
        await act(() => new Promise((r) => setTimeout(r, 3200)));
        expect(screen.getByText("1 of 2 remembered")).toBeTruthy();
        expect(screen.getByText("+10")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Next round" }));

        await waitFor(() => expect(screen.queryByText("1 of 2 remembered")).toBeNull());
    });

    it("sends the learner to the results only when they ask, after the last round", async () => {
        await playRound(
            { ...MISS, complete: true, round: null, session: { id: "8" } },
            ["star", "circle"]
        );

        await screen.findByText("1 of 2 remembered");
        await act(() => new Promise((r) => setTimeout(r, 3200)));
        expect(screen.queryByText("the results")).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "See results" }));

        expect(await screen.findByText("the results")).toBeTruthy();
    });

    it("still reports a perfect round as perfect, with the server's points", async () => {
        await playRound(
            { ...MISS, correct: 2, perfect: true, submitted: ["star", "circle"], pointsAwarded: 40, scoreSoFar: 40 },
            ["star", "circle"]
        );

        expect(await screen.findByText("+40")).toBeTruthy();
        expect(screen.queryByText("1 of 2 remembered")).toBeNull();
        expect(screen.getByRole("button", { name: "Next round" })).toBeTruthy();
    });
});

describe("Memory for a screen reader", { timeout: 25000 }, () => {
    // Browser QA: every symbol was aria-hidden, so the sequence, the learner's
    // slots, and both rows of the comparison read as empty lists -- and right
    // versus wrong was told by colour alone.
    it("names the symbols the learner has placed", async () => {
        let slots: string[] = [];
        await playRound(MISS, ["star", "circle"], () => {
            const list = screen.getByRole("list", { name: "Your sequence" });
            slots = within(list).getAllByRole("img").map((img) => img.getAttribute("aria-label") ?? "");
        });

        expect(slots).toEqual(["star", "circle"]);
    });

    it("reads the comparison by name, and says which were right and wrong", async () => {
        await playRound(MISS, ["star", "circle"]);

        await screen.findByText("1 of 2 remembered");
        const [played, answer] = screen.getAllByRole("list").filter((l) => l.className.includes("mem-row"));

        expect(within(played!).getAllByRole("listitem").map((li) => li.textContent)).toEqual([", right", ", wrong"]);
        expect(within(played!).getAllByRole("img").map((i) => i.getAttribute("aria-label"))).toEqual(["star", "triangle"]);
        expect(within(answer!).getAllByRole("img").map((i) => i.getAttribute("aria-label"))).toEqual(["star", "circle"]);
    });
});

