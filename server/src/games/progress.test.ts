import { describe, expect, it } from "vitest";
import {
    successRate,
    averageDurationMs,
    longestStreak,
    percentChange,
    splitWindows,
    type PlayedUnit
} from "./progress.js";

const unit = (success: boolean, durationMs: number | null = 1000): PlayedUnit => ({
    success,
    durationMs
});

describe("longestStreak", () => {
    it("is zero with nothing played", () => {
        expect(longestStreak([])).toBe(0);
    });

    it("counts the longest run, not the last one", () => {
        // A trailing streak of 2 must not beat an earlier streak of 3.
        const units = [true, true, true, false, true, true].map((s) => unit(s));

        expect(longestStreak(units)).toBe(3);
    });

    it("resets on a failure", () => {
        expect(longestStreak([true, false, true].map((s) => unit(s)))).toBe(1);
    });

    it("handles an unbroken run", () => {
        expect(longestStreak([true, true, true, true].map((s) => unit(s)))).toBe(4);
    });

    it("is zero when nothing succeeded", () => {
        expect(longestStreak([false, false].map((s) => unit(s)))).toBe(0);
    });
});

describe("averageDurationMs", () => {
    it("returns null rather than zero when there is nothing to average", () => {
        // "No data yet" and "instant" are different claims.
        expect(averageDurationMs([])).toBeNull();
        expect(averageDurationMs([unit(false, null)])).toBeNull();
    });

    it("ignores units that were never answered", () => {
        // A timeout has no response time. Averaging it in as slow would misreport
        // the player, and averaging it as zero would flatter them.
        expect(averageDurationMs([unit(true, 2000), unit(false, null)])).toBe(2000);
    });

    it("rounds to whole milliseconds", () => {
        expect(averageDurationMs([unit(true, 1000), unit(true, 1001)])).toBe(1001);
    });
});

describe("successRate", () => {
    it("returns null with nothing played", () => {
        expect(successRate([])).toBeNull();
    });

    it("counts successes against everything played, timeouts included", () => {
        // Timeouts are excluded from timing but never from success -- running out
        // of time is a failure, not a missing data point.
        expect(successRate([unit(true), unit(false, null), unit(true), unit(false)])).toBe(0.5);
    });

    it("is a ratio, matching computeAccuracy's scale rather than a percentage", () => {
        // Two figures in one response measuring the same kind of thing on
        // different scales is how a client ends up dividing by a hundred twice.
        expect(successRate([unit(true), unit(true), unit(false)])).toBe(0.667);
    });
});

describe("splitWindows", () => {
    const runs = [1, 2, 3, 4, 5, 6, 7];

    it("refuses to compare until both windows are full", () => {
        // One recent run against one older run is noise with a percentage sign.
        expect(splitWindows(runs.slice(0, 3), 2)).toBeNull();
        expect(splitWindows([], 1)).toBeNull();
    });

    it("takes the newest runs as recent and the ones before as previous", () => {
        expect(splitWindows(runs, 2)).toEqual({ recent: [1, 2], previous: [3, 4] });
    });

    it("ignores runs older than both windows", () => {
        expect(splitWindows(runs, 3)).toEqual({ recent: [1, 2, 3], previous: [4, 5, 6] });
    });

    it("rejects a window of zero", () => {
        expect(splitWindows(runs, 0)).toBeNull();
    });
});

describe("percentChange", () => {
    it("reports a rise as positive and a fall as negative", () => {
        expect(percentChange(100, 112)).toBe(12);
        expect(percentChange(4800, 4100)).toBe(-14.6);
    });

    it("does not decide whether up is good", () => {
        // Same call, opposite meanings: accuracy climbing is progress, response
        // time climbing is not. The caller knows which it asked for.
        expect(percentChange(80, 88)).toBe(10);
        expect(percentChange(4000, 4400)).toBe(10);
    });

    it("returns null when there is nothing to compare against", () => {
        expect(percentChange(null, 90)).toBeNull();
        expect(percentChange(90, null)).toBeNull();
    });

    it("refuses to divide by zero", () => {
        expect(percentChange(0, 50)).toBeNull();
    });
});
