import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * How a press on the signal is reported.
 *
 * QA finding: a press faster than the server's 80ms floor was sent as a
 * reaction, refused, and the run stopped on "A reaction must be between 80ms
 * and 5000ms...". Faster than any human reaction is an anticipation, so it is
 * now a false start; an ordinary press is still a reaction, and a stale one
 * past the deadline still a timeout.
 */

vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {},
    api: { get: vi.fn(), post: vi.fn() }
}));

const { api } = await import("../api/client.js");
const { ReactionPage } = await import("./ReactionPage.js");

let now = 0;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(performance, "now").mockImplementation(() => now);
    now = 0;
    // Each test reads its own requests: reset, not just re-stubbed.
    vi.mocked(api.get).mockReset().mockResolvedValue({ sessions: [] });
    vi.mocked(api.post).mockReset().mockImplementation(async (path: string) => {
        if (path === "/api/reaction/sessions") {
            return { resumed: false, sessionId: "9", scoreSoFar: 0, round: { roundId: "r1", roundNumber: 1, totalRounds: 5 } };
        }
        if (path.endsWith("/rounds")) {
            return { outcome: "false_start", reactionMs: null, tier: null, pointsAwarded: 0, scoreSoFar: 0, complete: false, round: null, session: null };
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
    // findBy* polls on timers, which are fake here: flush with fake time instead.
    for (let i = 0; i < 20 && !screen.queryByRole("button", { name: /start reaction/i }); i++) {
        await act(async () => {
            vi.advanceTimersByTime(50);
            await Promise.resolve();
        });
    }
    fireEvent.click(screen.getByRole("button", { name: /start reaction/i }));

    // Through any count-in and the start request, to the signal: Math.random is
    // 0, so the wait is exactly READY_MS + MIN_WAIT_MS after the round begins.
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
    });
};

const roundPosts = () => vi.mocked(api.post).mock.calls.filter(([p]) => String(p).endsWith("/rounds"));

describe("a press on the signal", () => {
    it("faster than any human reaction is a false start, not a refused reaction", async () => {
        const signal = await toSignal();

        await press(30, signal);

        expect(roundPosts()).toHaveLength(1);
        expect(roundPosts()[0]![1]).toEqual({ outcome: "false_start", roundId: "r1" });
    });

    it("at a human speed is a reaction, with its time", async () => {
        const signal = await toSignal();

        await press(250, signal);

        expect(roundPosts()[0]![1]).toEqual({ outcome: "reacted", roundId: "r1", reactionMs: 250 });
    });

    it("exactly at the floor still counts as a reaction", async () => {
        const signal = await toSignal();

        await press(80, signal);

        expect(roundPosts()[0]![1]).toEqual({ outcome: "reacted", roundId: "r1", reactionMs: 80 });
    });
});
