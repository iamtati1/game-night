import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Reaction's sound cues match its outcomes, as in the other games.
 *
 * A false start was the only outcome with a cue, so the press that landed was
 * the silent one. play() itself still decides whether anything sounds: it
 * stays quiet unless the learner turned sound on (games/sound.ts).
 */

vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {},
    api: { get: vi.fn(), post: vi.fn() }
}));

vi.mock("../games/sound.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../games/sound.js")>()),
    play: vi.fn()
}));

const { api } = await import("../api/client.js");
const { play } = await import("../games/sound.js");
const { ReactionPage } = await import("./ReactionPage.js");

let now = 0;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(performance, "now").mockImplementation(() => now);
    now = 0;
    vi.mocked(play).mockReset();
    vi.mocked(api.get).mockReset().mockResolvedValue({ sessions: [] });
    vi.mocked(api.post).mockReset().mockImplementation(async (path: string, body?: unknown) => {
        if (path === "/api/reaction/sessions") {
            return { resumed: false, sessionId: "9", scoreSoFar: 0, round: { roundId: "r1", roundNumber: 1, totalRounds: 5 } };
        }
        if (path.endsWith("/rounds")) {
            const reacted = (body as { outcome: string }).outcome === "reacted";
            return {
                outcome: reacted ? "reacted" : "false_start",
                reactionMs: reacted ? 250 : null,
                tier: reacted ? { key: "fast", label: "Fast" } : null,
                pointsAwarded: reacted ? 100 : 0,
                scoreSoFar: 0,
                complete: false,
                round: null,
                session: null
            };
        }
        return {};
    });
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

/** Starts a run and brings round one to its signal. Returns the clock at the signal. */
async function toSignal(): Promise<number> {
    render(
        <MemoryRouter initialEntries={["/reaction"]}>
            <ReactionPage />
        </MemoryRouter>
    );
    for (let i = 0; i < 20 && !screen.queryByRole("button", { name: /start reaction/i }); i++) {
        await act(async () => {
            vi.advanceTimersByTime(50);
            await Promise.resolve();
        });
    }
    fireEvent.click(screen.getByRole("button", { name: /start reaction/i }));

    for (let i = 0; i < 40 && !screen.queryByText("Hit it"); i++) {
        await act(async () => {
            vi.advanceTimersByTime(250);
            await Promise.resolve();
        });
    }
    expect(screen.getByText("Hit it")).toBeTruthy();
    return now;
}

const press = async (msAfterSignal: number, signal: number) => {
    now = signal + msAfterSignal;
    await act(async () => {
        fireEvent.keyDown(window, { key: " " });
        await Promise.resolve();
        await Promise.resolve();
    });
};

const cues = () => vi.mocked(play).mock.calls.map(([cue]) => cue).filter((cue) => cue !== "signal");

describe("Reaction's cues", () => {
    it("a press that lands plays the correct cue", async () => {
        const signal = await toSignal();

        await press(250, signal);

        expect(cues()).toEqual(["correct"]);
    });

    it("a false start keeps its own cue", async () => {
        const signal = await toSignal();

        await press(30, signal);

        expect(cues()).toEqual(["early"]);
    });
});
