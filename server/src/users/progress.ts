import {
    successRate,
    averageDurationMs,
    longestStreak,
    percentChange,
    splitWindows,
    type PlayedUnit
} from "../games/progress.js";

/**
 * Turns the flat unit rows both games produce into per-game improvement figures.
 *
 * Pure, so the shaping is testable without a database. The SQL's only job is to
 * hand over every scoring unit of every completed run in order; deciding what
 * counts as a streak or a fair comparison happens here.
 */

/** How many runs form each side of a comparison. Six completed runs are needed
 *  before a trend appears at all -- three is enough to damp a single lucky game
 *  without needing a long history. */
export const TREND_WINDOW = 3;

export interface UnitRow {
    game_slug: string;
    session_id: string;
    /** Position within its run. */
    ordinal: number;
    success: boolean;
    duration_ms: string | number | null;
}

export interface MetricTrend {
    previous: number | null;
    recent: number | null;
    /** Positive means the number rose. Whether that is good depends on which
     *  metric it is, which is why the direction is not baked in here. */
    changePercent: number | null;
}

export interface GameProgress {
    /** Best unbroken run of successes in any single completed game. */
    bestStreak: number;
    /** Typical time per unit across every completed run. */
    averageMs: number | null;
    /** Recent form against the form before it, or null until there is enough
     *  history for the comparison to mean anything. */
    trend: { successRate: MetricTrend; speed: MetricTrend } | null;
}

function toUnit(row: UnitRow): PlayedUnit {
    return {
        success: row.success,
        // BIGINT and numeric arrive from pg as strings.
        durationMs: row.duration_ms === null ? null : Math.round(Number(row.duration_ms))
    };
}

/**
 * Groups rows into runs, newest first, preserving the order the query returned.
 * A Map keeps insertion order, so the SQL's ORDER BY is the only place run
 * ordering is decided.
 */
function groupRuns(rows: UnitRow[]): PlayedUnit[][] {
    const runs = new Map<string, PlayedUnit[]>();

    for (const row of rows) {
        const units = runs.get(row.session_id) ?? [];
        units.push(toUnit(row));
        runs.set(row.session_id, units);
    }

    return [...runs.values()];
}

export function toGameProgress(rows: UnitRow[]): Record<string, GameProgress> {
    const byGame = new Map<string, UnitRow[]>();

    for (const row of rows) {
        byGame.set(row.game_slug, [...(byGame.get(row.game_slug) ?? []), row]);
    }

    const result: Record<string, GameProgress> = {};

    for (const [slug, gameRows] of byGame) {
        const runs = groupRuns(gameRows);
        const everyUnit = runs.flat();
        const windows = splitWindows(runs, TREND_WINDOW);

        result[slug] = {
            bestStreak: runs.reduce((best, run) => Math.max(best, longestStreak(run)), 0),
            averageMs: averageDurationMs(everyUnit),
            trend: windows
                ? {
                      successRate: buildTrend(
                          successRate(windows.previous.flat()),
                          successRate(windows.recent.flat())
                      ),
                      speed: buildTrend(
                          averageDurationMs(windows.previous.flat()),
                          averageDurationMs(windows.recent.flat())
                      )
                  }
                : null
        };
    }

    return result;
}

function buildTrend(previous: number | null, recent: number | null): MetricTrend {
    return { previous, recent, changePercent: percentChange(previous, recent) };
}
