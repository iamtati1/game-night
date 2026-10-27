import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlushPage } from "./FlushPage.js";

/**
 * Each Flush reveal says whether the round counted toward the course, from
 * the server's `credited` -- in words, not by colour. The page never works it
 * out itself.
 */

const ROUND = {
    roundId: "r1",
    roundNumber: 1,
    totalRounds: 3,
    prompt: 'console.log("Hello");\nconsole.log(4);',
    practising: { name: "Running Code and Reading Output", meaning: "" },
    tiles: [
        { id: "a", text: "Hello" },
        { id: "b", text: "4" }
    ],
    placed: [{ outputId: "a", text: "Hello" }],
    totalOutputs: 2,
    pointsBanked: 10,
    servedAt: new Date().toISOString(),
    deadlineAt: null,
    limitMs: null,
    msRemaining: null,
    relaxed: true,
    hinted: false,
    hintOutputId: null
};

/** Starts a game whose single remaining placement ends the round with `outcome`. */
async function playRoundEnding(outcome: "round_complete" | "wrong", credited: boolean, practising = ROUND.practising) {
    vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
        const url = String(input);
        const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
        if (url === "/api/flush/readiness") return json({ ready: true, eligible: 5, needed: 3, full: 5, message: null });
        if (url === "/api/flush/sessions" && init?.method === "POST") {
            return json({ resumed: false, sessionId: "9", scoreSoFar: 0, round: { ...ROUND, practising } });
        }
        if (url.endsWith("/placements")) {
            return json({
                outcome,
                roundEnded: true,
                pointsBanked: 20,
                roundScore: outcome === "round_complete" ? 40 : 10,
                scoreSoFar: 40,
                correctSequence: ["Hello", "4"],
                yourSequence: outcome === "round_complete" ? ["Hello", "4"] : ["Hello", "Hello"],
                explanation: "Lines run top to bottom.",
                credited,
                complete: false,
                round: null,
                session: null
            });
        }
        return json({ sessions: [] });
    });

    render(
        <MemoryRouter initialEntries={["/flush"]}>
            <FlushPage />
        </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole("button", { name: /start flush/i }));
    fireEvent.click(await screen.findByRole("button", { name: "4" }, { timeout: 5000 }));
    await screen.findByText("Lines run top to bottom.", {}, { timeout: 3000 });
}

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("whether a Flush round counted", { timeout: 20000 }, () => {
    it("says a credited round counted, and what it practised", async () => {
        await playRoundEnding("round_complete", true);

        expect(screen.getByText("Counted toward your course")).toBeTruthy();
        expect(screen.getByText(/practised Running Code and Reading Output/)).toBeTruthy();
        expect(screen.queryByText("Not counted toward your course")).toBeNull();
    });

    it("says a solved round the server did not credit did not count", async () => {
        await playRoundEnding("round_complete", false);

        expect(screen.getByText("Not counted toward your course")).toBeTruthy();
        expect(screen.getByText(/this time\./)).toBeTruthy();
        expect(screen.queryByText("Counted toward your course")).toBeNull();
    });

    it("says a lost round did not count, and why", async () => {
        await playRoundEnding("wrong", false);

        expect(screen.getByText("Not counted toward your course")).toBeTruthy();
        expect(screen.getByText(/only a finished order counts/)).toBeTruthy();
    });

    it("names no concept when the round carries none", async () => {
        await playRoundEnding("round_complete", true, null as never);

        expect(screen.getByText("Counted toward your course")).toBeTruthy();
        expect(screen.queryByText(/practised/)).toBeNull();
    });
});

describe("the reveal's 'You said' list", { timeout: 20000 }, () => {
    const saidRows = () => [...document.querySelectorAll(".sequences > div:first-child .seq li")];

    it("marks the wrong placement with a mark and words, not colour alone", async () => {
        await playRoundEnding("wrong", false);

        const [first, second] = saidRows();
        expect(first!.className).toBe("ok");
        expect(first!.querySelector(".seq-mark")?.textContent).toBe("✓");
        expect(first!.textContent).toContain(", right");
        expect(second!.className).toBe("bad");
        expect(second!.querySelector(".seq-mark")?.textContent).toBe("✕");
        expect(second!.textContent).toContain(", wrong");
        // The mark is for the eye; the words carry it for a screen reader.
        expect(second!.querySelector(".seq-mark")?.getAttribute("aria-hidden")).toBe("true");
    });

    it("marks every placement right on a flushed round", async () => {
        await playRoundEnding("round_complete", true);

        expect(saidRows().map((li) => li.querySelector(".seq-mark")?.textContent)).toEqual(["✓", "✓"]);
    });
});
