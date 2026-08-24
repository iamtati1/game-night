import { useEffect, useState } from "react";

interface CountdownProps {
    deadlineAt: string;
    totalMs: number;
    onExpire: () => void;
}

/** Purely cosmetic. The server enforces the deadline against its own served_at,
 *  so a tampered or frozen clock here changes nothing about scoring. */
export function Countdown({ deadlineAt, totalMs, onExpire }: CountdownProps) {
    const deadline = new Date(deadlineAt).getTime();
    const [remaining, setRemaining] = useState(() => Math.max(0, deadline - Date.now()));

    useEffect(() => {
        setRemaining(Math.max(0, deadline - Date.now()));

        const id = setInterval(() => {
            const next = Math.max(0, deadline - Date.now());
            setRemaining(next);

            if (next === 0) {
                clearInterval(id);
                onExpire();
            }
        }, 100);

        return () => clearInterval(id);
    }, [deadline, onExpire]);

    const seconds = Math.ceil(remaining / 1000);
    const pct = Math.max(0, Math.min(100, (remaining / totalMs) * 100));

    /**
     * Three tiers rather than two. One threshold means the clock reads the same
     * for 25 of its 30 seconds and then snaps -- so it carries no information
     * until the moment it panics. `warn` gives the player a reason to look up
     * before it is already too late to matter.
     */
    const tier = remaining <= 5000 ? "urgent" : remaining <= 10000 ? "warn" : "calm";

    return (
        <div
            className={`countdown ${tier}`}
            role="timer"
            aria-label={`${seconds} seconds remaining`}
        >
            <div className="countdown-track">
                <div className={`countdown-fill ${tier}`} style={{ width: `${pct}%` }} />
            </div>
            {/* aria-hidden because the label above already carries the value: a
                node updating ten times a second would flood a screen reader. */}
            <span className={`countdown-value ${tier}`} aria-hidden="true">
                {seconds}s
            </span>
        </div>
    );
}
