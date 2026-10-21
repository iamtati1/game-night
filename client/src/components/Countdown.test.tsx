import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Countdown } from "./Countdown.js";

/**
 * The countdown can be held while a finished round's feedback is on screen.
 *
 * Flush's reveal now stays until the learner moves on, and its bar kept
 * draining underneath it, which read as time still running out on a round that
 * was already over. `paused` freezes it; leaving it off changes nothing.
 */
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

const label = () => screen.getByRole("timer").getAttribute("aria-label");

describe("Countdown", () => {
    it("counts down and expires as before when not paused", () => {
        const onExpire = vi.fn();
        render(<Countdown deadlineAt={new Date(Date.now() + 3000).toISOString()} totalMs={3000} onExpire={onExpire} />);

        expect(label()).toBe("3 seconds remaining");
        act(() => vi.advanceTimersByTime(3200));
        expect(label()).toBe("0 seconds remaining");
        expect(onExpire).toHaveBeenCalledTimes(1);
    });

    it("holds its value, and never expires, while paused", () => {
        const onExpire = vi.fn();
        const deadlineAt = new Date(Date.now() + 10_000).toISOString();
        const { rerender } = render(<Countdown deadlineAt={deadlineAt} totalMs={10_000} onExpire={onExpire} />);

        act(() => vi.advanceTimersByTime(4000));
        expect(label()).toBe("6 seconds remaining");

        rerender(<Countdown deadlineAt={deadlineAt} totalMs={10_000} onExpire={onExpire} paused />);
        act(() => vi.advanceTimersByTime(9000));

        expect(label()).toBe("6 seconds remaining");
        expect(onExpire).not.toHaveBeenCalled();
    });
});
