import { useEffect, useState } from "react";

interface ResumeCountdownProps {
    /** Fired once the count reaches zero. */
    onDone: () => void;
}

const TICKS = ["3", "2", "1", "Go"];
const TICK_MS = 550;

/**
 * A beat between pressing Resume and the clock running again.
 *
 * Pausing preserves the remaining time exactly, which is the correct rule but a
 * harsh arrival: come back a day later to a question you paused with three
 * seconds on it and the run is over before you have read the code. This does not
 * change the time -- it gives the player somewhere to put their attention before
 * it starts moving.
 *
 * The server clock is untouched by this: the session is not resumed until the
 * count finishes, so nothing is ticking while it runs.
 */
export function ResumeCountdown({ onDone }: ResumeCountdownProps) {
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (tick >= TICKS.length) {
            onDone();
            return;
        }

        const id = window.setTimeout(() => setTick((n) => n + 1), TICK_MS);

        return () => window.clearTimeout(id);
    }, [tick, onDone]);

    return (
        <section className="resume-count" aria-live="assertive">
            <p className="resume-label">Get ready</p>
            {/* Keyed so each number remounts and replays its own entrance. */}
            <p key={tick} className="resume-tick">
                {TICKS[Math.min(tick, TICKS.length - 1)]}
            </p>
        </section>
    );
}
