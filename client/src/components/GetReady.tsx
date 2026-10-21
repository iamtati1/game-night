import { useEffect, useRef, useState } from "react";

interface GetReadyProps {
    /** Fired once the count reaches zero. */
    onDone: () => void;
    /** What the player is getting ready for. */
    label?: string;
}

const TICKS = ["3", "2", "1", "Go"];
const TICK_MS = 550;

/**
 * The beat between deciding to play and the clock running.
 *
 * Written first for Resume: pausing preserves the remaining time exactly, which
 * is the correct rule but a harsh arrival -- come back a day later to a question
 * you paused with three seconds left and the run is over before you have read
 * the code. A fresh start turned out to need the same beat for the same reason,
 * so this now covers both. Named for what it shows rather than for the one
 * caller it began with.
 *
 * The rule that makes it honest: NOTHING may be served while it runs. The server
 * stamps served_at when it hands over a question, and that stamp is the
 * deadline -- so a countdown placed after the question was fetched would be
 * spending the player's own time showing them a countdown. Every caller runs
 * this BEFORE the request that starts the round, never after.
 *
 * Keeps the resume-* class names it was born with. They are only hooks for
 * styling that already works, and renaming them would mean touching the visual
 * language for no visible gain.
 */
export function GetReady({ onDone, label = "Get ready" }: GetReadyProps) {
    const [tick, setTick] = useState(0);

    /*
     * ONCE, NO MATTER HOW OFTEN THE PARENT RENDERS.
     *
     * Every caller passes an inline arrow, so `onDone` is a new function on
     * each render -- and onDone itself sets state in the parent. With onDone
     * in the effect's dependencies, the parent's re-render re-ran the effect at
     * the final tick and fired onDone a second time: two concurrent "start a
     * session" requests, the second of which collided with the first on the
     * one-active-game index and came back as a 500. Memory showed that 500 as
     * "Internal Server Error" over a game the first request had started fine.
     *
     * The latest onDone is kept in a ref so the call still uses current state.
     */
    const latest = useRef(onDone);
    const fired = useRef(false);

    useEffect(() => {
        latest.current = onDone;
    });

    useEffect(() => {
        if (tick >= TICKS.length) {
            if (!fired.current) {
                fired.current = true;
                latest.current();
            }
            return;
        }

        const id = window.setTimeout(() => setTick((n) => n + 1), TICK_MS);

        return () => window.clearTimeout(id);
    }, [tick]);

    return (
        <section className="resume-count" aria-live="assertive">
            <p className="resume-label">{label}</p>
            {/* Keyed so each number remounts and replays its own entrance. */}
            <p key={tick} className="resume-tick">
                {TICKS[Math.min(tick, TICKS.length - 1)]}
            </p>
        </section>
    );
}
