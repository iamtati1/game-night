import { describe, expect, it } from "vitest";
import { TREND_WINDOW, toGameProgress, type UnitRow } from "./progress.js";

/** Rows as the query emits them: newest run first, units in play order. */
function run(game: string, session: string, results: [boolean, number | null][]): UnitRow[] {
    return results.map(([success, duration_ms], i) => ({
        game_slug: game,
        session_id: session,
        ordinal: i + 1,
        success,
        duration_ms
    }));
}

describe("toGameProgress", () => {
    it("returns nothing for a player with no completed runs", () => {
        expect(toGameProgress([])).toEqual({});
    });

    it("keeps each game separate", () => {
        const rows = [
            ...run("code-blitz", "1", [[true, 1000], [true, 1000]]),
            ...run("flush", "2", [[true, 5000], [false, null]])
        ];
        const progress = toGameProgress(rows);

        expect(Object.keys(progress).sort()).toEqual(["code-blitz", "flush"]);
        expect(progress["code-blitz"]!.averageMs).toBe(1000);
        expect(progress["flush"]!.averageMs).toBe(5000);
    });

    it("takes the best streak from any single run, not across runs", () => {
        // Two runs ending and starting on successes must not be joined into one
        // streak -- a streak lives inside a game.
        const rows = [
            ...run("code-blitz", "1", [[false, 1], [true, 1], [true, 1]]),
            ...run("code-blitz", "2", [[true, 1], [true, 1], [false, 1]])
        ];

        expect(toGameProgress(rows)["code-blitz"]!.bestStreak).toBe(2);
    });

    it("coerces the numeric strings pg returns", () => {
        const rows = run("code-blitz", "1", [[true, null]]).map((r) => ({
            ...r,
            duration_ms: "1500.6" as unknown as string
        }));

        expect(toGameProgress(rows)["code-blitz"]!.averageMs).toBe(1501);
    });

    it("withholds a trend until both windows are full", () => {
        const rows = Array.from({ length: TREND_WINDOW * 2 - 1 }, (_, i) =>
            run("code-blitz", String(i), [[true, 1000]])
        ).flat();

        expect(toGameProgress(rows)["code-blitz"]!.trend).toBeNull();
    });

    it("appears on the fourth completed run, not the sixth", () => {
        // The threshold is a product decision, so it is pinned: six runs was more
        // history than players reached before the improvement idea had shown them
        // anything.
        expect(TREND_WINDOW).toBe(2);

        const four = [0, 1, 2, 3].map((i) => run("code-blitz", `s${i}`, [[true, 1000]])).flat();
        const three = [0, 1, 2].map((i) => run("code-blitz", `s${i}`, [[true, 1000]])).flat();

        expect(toGameProgress(three)["code-blitz"]!.trend).toBeNull();
        expect(toGameProgress(four)["code-blitz"]!.trend).not.toBeNull();
    });

    it("compares recent form against the form before it", () => {
        // Sized from TREND_WINDOW rather than a literal, so changing the threshold
        // cannot silently leave a fixture straddling both windows -- which is what
        // happened when it moved from three a side to two.
        const group = (prefix: string, results: [boolean, number | null][]) =>
            Array.from({ length: TREND_WINDOW }, (_, i) => run("code-blitz", `${prefix}${i}`, results));

        const recent = group("r", [[true, 1000], [true, 1000]]);
        const older = group("o", [[true, 2000], [false, 2000]]);
        const progress = toGameProgress([...recent.flat(), ...older.flat()]);
        const trend = progress["code-blitz"]!.trend!;

        expect(trend.speed.previous).toBe(2000);
        expect(trend.speed.recent).toBe(1000);
        expect(trend.speed.changePercent).toBe(-50);

        expect(trend.successRate.previous).toBe(0.5);
        expect(trend.successRate.recent).toBe(1);
        expect(trend.successRate.changePercent).toBe(100);
    });

    it("ignores runs older than both windows", () => {
        const group = (prefix: string, ms: number) =>
            Array.from({ length: TREND_WINDOW }, (_, i) => run("code-blitz", `${prefix}${i}`, [[true, ms]]));

        const recent = group("r", 1000);
        const older = group("o", 2000);
        const ancient = group("a", 9999);
        const trend = toGameProgress([...recent.flat(), ...older.flat(), ...ancient.flat()])[
            "code-blitz"
        ]!.trend!;

        expect(trend.speed.previous).toBe(2000);
    });

    it("still reports a best streak when timings are missing entirely", () => {
        // Flush rounds that timed out have no duration; the streak must survive it.
        const rows = run("flush", "1", [[true, null], [true, null], [false, null]]);
        const progress = toGameProgress(rows)["flush"]!;

        expect(progress.bestStreak).toBe(2);
        expect(progress.averageMs).toBeNull();
    });
});
