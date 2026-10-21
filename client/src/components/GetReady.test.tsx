import { act, cleanup, render } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GetReady } from "./GetReady.js";

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

/**
 * The countdown's one promise: onDone fires once.
 *
 * Shaped like every real caller -- an inline arrow, and a handler that sets
 * the parent's state while the countdown is still on screen. That combination
 * used to re-run the final tick and start two sessions at once (Memory: one
 * 201 and one 500, and the page showed the 500).
 */
function Parent({ onStart }: { onStart: () => void }) {
    const [, setStarting] = useState(0);

    return (
        <GetReady
            onDone={() => {
                onStart();
                setStarting((n) => n + 1);
            }}
        />
    );
}

describe("GetReady", () => {
    it("fires onDone exactly once, even when onDone re-renders its parent", () => {
        vi.useFakeTimers();
        const onStart = vi.fn();

        render(
            <StrictMode>
                <Parent onStart={onStart} />
            </StrictMode>
        );

        expect(onStart).not.toHaveBeenCalled();
        for (let i = 0; i < 10; i++) {
            act(() => {
                vi.advanceTimersByTime(600);
            });
        }

        expect(onStart).toHaveBeenCalledTimes(1);
    });

    it("does not fire before the count is over", () => {
        vi.useFakeTimers();
        const onStart = vi.fn();

        render(<Parent onStart={onStart} />);
        act(() => {
            vi.advanceTimersByTime(550 * 3);
        });

        expect(onStart).not.toHaveBeenCalled();
    });
});
