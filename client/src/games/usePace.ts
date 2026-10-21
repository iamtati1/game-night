import { useState } from "react";

/**
 * The remembered pace choice for curriculum games: relaxed unless this device
 * last chose the clock. See components/PaceChoice.tsx for why relaxed is the
 * default. A convenience only -- storage can be unavailable, and then the
 * choice simply lasts for this visit.
 */
const KEY = "jolt.pace";

function readTimed(): boolean {
    try {
        return window.localStorage.getItem(KEY) === "timed";
    } catch {
        return false;
    }
}

export function usePace(): [timed: boolean, setTimed: (timed: boolean) => void] {
    const [timed, setTimedState] = useState(readTimed);

    const setTimed = (next: boolean) => {
        setTimedState(next);
        try {
            window.localStorage.setItem(KEY, next ? "timed" : "relaxed");
        } catch {
            // Storage unavailable: the choice still applies to this visit.
        }
    };

    return [timed, setTimed];
}
