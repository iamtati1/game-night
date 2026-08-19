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
    const urgent = remaining <= 5000;

    return (
        <div className="countdown">
            <div className="countdown-track">
                <div
                    className={`countdown-fill${urgent ? " urgent" : ""}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className={`countdown-value${urgent ? " urgent" : ""}`} aria-hidden="true">
                {seconds}s
            </span>
        </div>
    );
}
