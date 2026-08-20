import { describe, expect, it } from "vitest";
import {
    computeAccuracy,
    toGameStats,
    toNullableNumber,
    toNumber,
    toStatTotals,
    toUserStats,
    type GameStatsRow,
    type StatTotalsRow
} from "./stats.js";

function totalsRow(overrides: Partial<StatTotalsRow> = {}): StatTotalsRow {
    return {
        games_completed: "0",
        games_abandoned: "0",
        games_in_progress: "0",
        total_xp: "0",
        total_score: "0",
        ...overrides
    };
}

/** Shaped as Postgres returns it: COUNT/SUM as strings, MAX as a number,
 *  AVG as a long numeric string. */
function gameRow(overrides: Partial<GameStatsRow> = {}): GameStatsRow {
    return {
        game_slug: "code-blitz",
        game_name: "Code Blitz",
        games_completed: "0",
        games_abandoned: "0",
        total_xp: "0",
        total_score: "0",
        best_score: null,
        average_score: null,
        total_units: "0",
        correct_count: "0",
        incorrect_count: "0",
        timed_out_count: "0",
        ...overrides
    };
}

describe("numeric coercion", () => {
    it("converts Postgres bigint strings to numbers", () => {
        // Without this, "840" + 100 would evaluate to "840100".
        expect(toNumber("840")).toBe(840);
        expect(toNumber(840)).toBe(840);
    });

    it("treats a missing aggregate as zero, not NaN", () => {
        expect(toNumber(null)).toBe(0);
        expect(toNumber(undefined)).toBe(0);
    });

    it("preserves null for values that are genuinely unknown", () => {
        expect(toNullableNumber(null)).toBeNull();
        expect(toNullableNumber("1310")).toBe(1310);
    });
});

describe("computeAccuracy", () => {
    it("excludes timed-out units by only taking correct and incorrect", () => {
        expect(computeAccuracy(71, 37)).toBe(0.657);
    });

    it("returns null when nothing was attempted", () => {
        // Distinct from 0, which would mean "attempted and got everything wrong".
        expect(computeAccuracy(0, 0)).toBeNull();
    });

    it("returns 0 when everything attempted was wrong", () => {
        expect(computeAccuracy(0, 5)).toBe(0);
    });

    it("returns 1 for a flawless record", () => {
        expect(computeAccuracy(10, 0)).toBe(1);
    });
});

describe("toStatTotals", () => {
    it("maps a fresh account to zeros", () => {
        expect(toStatTotals(totalsRow())).toEqual({
            gamesCompleted: 0,
            gamesAbandoned: 0,
            gamesInProgress: 0,
            totalXp: 0,
            totalScore: 0
        });
    });

    it("coerces every count out of string form", () => {
        expect(
            toStatTotals(
                totalsRow({
                    games_completed: "12",
                    games_abandoned: "3",
                    games_in_progress: "1",
                    total_xp: "840",
                    total_score: "8910"
                })
            )
        ).toEqual({
            gamesCompleted: 12,
            gamesAbandoned: 3,
            gamesInProgress: 1,
            totalXp: 840,
            totalScore: 8910
        });
    });

    it("carries no bestScore or averageScore", () => {
        // Deliberate: Code Blitz scores a speed bonus and Tick scores escalating
        // placements, so a best score spanning both compares different scales.
        // Those belong per game. XP is uniform by design, so it is summable.
        const totals = toStatTotals(totalsRow({ total_xp: "500" }));

        expect(totals).not.toHaveProperty("bestScore");
        expect(totals).not.toHaveProperty("averageScore");
        expect(totals.totalXp).toBe(500);
    });
});

describe("toGameStats", () => {
    it("attaches the game it belongs to", () => {
        const stats = toGameStats(gameRow({ game_slug: "tick", game_name: "Tick" }));

        expect(stats.game).toEqual({ slug: "tick", name: "Tick" });
    });

    it("leaves best and average score null for a game never finished", () => {
        const stats = toGameStats(gameRow());

        // null, not 0: no finished game means no best score, and rendering 0
        // would read as failure rather than absence.
        expect(stats.bestScore).toBeNull();
        expect(stats.averageScore).toBeNull();
        expect(stats.accuracy).toBeNull();
    });

    it("coerces counts and rounds the average to one decimal", () => {
        const stats = toGameStats(
            gameRow({
                games_completed: "12",
                total_xp: "840",
                best_score: 1310,
                average_score: "742.4666666666666667"
            })
        );

        expect(stats.gamesCompleted).toBe(12);
        expect(stats.totalXp).toBe(840);
        expect(stats.bestScore).toBe(1310);
        expect(stats.averageScore).toBe(742.5);
    });

    it("derives accuracy from correct and incorrect, never from total units", () => {
        // 6 correct, 2 incorrect, 2 timed out across 10 units. Including
        // timeouts gives 0.6; excluding them gives 0.75.
        const stats = toGameStats(
            gameRow({
                total_units: "10",
                correct_count: "6",
                incorrect_count: "2",
                timed_out_count: "2"
            })
        );

        expect(stats.progress).toEqual({ total: 10, correct: 6, incorrect: 2, timedOut: 2 });
        expect(stats.accuracy).toBe(0.75);
    });

    it("keeps every numeric field a number, never a string", () => {
        const stats = toGameStats(gameRow({ games_completed: "2", total_xp: "70" }));

        for (const key of ["gamesCompleted", "gamesAbandoned", "totalXp", "totalScore"] as const) {
            expect(typeof stats[key], `${key} must be numeric`).toBe("number");
        }

        for (const [key, value] of Object.entries(stats.progress)) {
            expect(typeof value, `progress.${key} must be numeric`).toBe("number");
        }
    });
});

describe("toUserStats", () => {
    it("returns an empty perGame list for a player who has never played", () => {
        const stats = toUserStats(totalsRow(), []);

        expect(stats.totals.gamesCompleted).toBe(0);
        expect(stats.perGame).toEqual([]);
    });

    it("keeps one entry per game while totals stay cross-game", () => {
        const stats = toUserStats(totalsRow({ games_completed: "7", total_xp: "300" }), [
            gameRow({ game_slug: "code-blitz", game_name: "Code Blitz", games_completed: "5", total_xp: "200" }),
            gameRow({ game_slug: "tick", game_name: "Tick", games_completed: "2", total_xp: "100" })
        ]);

        expect(stats.totals.gamesCompleted).toBe(7);
        expect(stats.totals.totalXp).toBe(300);
        expect(stats.perGame.map((g) => g.game.slug)).toEqual(["code-blitz", "tick"]);
        expect(stats.perGame.map((g) => g.totalXp)).toEqual([200, 100]);
    });

    it("keeps cross-game XP equal to the sum of per-game XP", () => {
        // The invariant that makes a cross-game leaderboard on XP meaningful.
        const perGame = [gameRow({ total_xp: "200" }), gameRow({ game_slug: "tick", total_xp: "145" })];
        const stats = toUserStats(totalsRow({ total_xp: "345" }), perGame);

        expect(stats.totals.totalXp).toBe(stats.perGame.reduce((sum, g) => sum + g.totalXp, 0));
    });
});
