import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlushPage } from "./FlushPage.js";

/**
 * Flush hints: one per round, it marks the next output to place, and the round
 * then banks half -- said beside the button before and after.
 */

const ROUND = {
    roundId: "301",
    roundNumber: 1,
    totalRounds: 3,
    prompt: 'console.log("Ready");\nconsole.log("Set");\nconsole.log("Go");',
    practising: null,
    tiles: [
        { id: "a", text: "Set" },
        { id: "b", text: "Go" },
        { id: "c", text: "Ready" }
    ],
    placed: [],
    totalOutputs: 3,
    pointsBanked: 0,
    servedAt: new Date().toISOString(),
    deadlineAt: null,
    limitMs: null,
    msRemaining: null,
    relaxed: true,
    hinted: false,
    hintOutputId: null as string | null
};

let calls: { url: string; body: unknown }[] = [];

function stub(round = ROUND) {
    calls = [];
    vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
        const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
        if (url === "/api/me/sessions/resumable") return json({ sessions: [] });
        if (url === "/api/flush/readiness") return json({ ready: true, eligible: 5, needed: 3, full: 5, message: null });
        if (url === "/api/flush/sessions" && init?.method === "POST") {
            return json({ resumed: false, sessionId: "61", scoreSoFar: 0, round });
        }
        if (url === "/api/flush/sessions/61/hints") return json({ outputId: "c", hinted: true, pointsBanked: 0 });
        return json({});
    });
}

beforeEach(() => stub());
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

async function play() {
    render(
        <MemoryRouter initialEntries={["/flush"]}>
            <FlushPage />
        </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole("button", { name: /start flush/i }));
    await screen.findByRole("list", { name: "Available output" }, { timeout: 5000 });
}

describe("Flush hints", () => {
    it("say what they cost, then mark the next output to place", async () => {
        await play();
        expect(screen.getByText("The round then banks half.")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Hint: show the next output" }));

        expect(await screen.findByRole("button", { name: "Ready, next (your hint)" })).toBeTruthy();
        expect(calls.find((c) => c.url.endsWith("/hints"))?.body).toEqual({ roundId: "301" });
        expect(screen.getByText("This round banks half.")).toBeTruthy();
        expect((screen.getByRole("button", { name: "Hint used" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("keep the mark when the round comes back (reload, resume)", async () => {
        stub({ ...ROUND, hinted: true, hintOutputId: "c" });
        await play();

        await waitFor(() => expect(screen.getByRole("button", { name: "Ready, next (your hint)" })).toBeTruthy());
        expect((screen.getByRole("button", { name: "Hint used" }) as HTMLButtonElement).disabled).toBe(true);
    });
});
