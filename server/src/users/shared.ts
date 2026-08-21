/**
 * Types and coercions shared by every player-facing aggregate. Extracted so
 * history.ts and stats.ts can both use them without importing each other.
 *
 * This is the platform layer for player data: a reference to a game, and a
 * game-agnostic summary of how a session went. Anything game-specific stays out.
 */

export type Numeric = string | number | null | undefined;

/**
 * Postgres hands aggregates back in mixed shapes: COUNT and SUM over bigint
 * arrive as strings, MAX over integer as a number, AVG as a numeric string.
 * Rather than guess per column, coerce defensively -- an uncoerced "840" makes
 * "840" + 100 evaluate to "840100".
 */
export function toNumber(value: Numeric): number {
    return value === null || value === undefined ? 0 : Number(value);
}

export function toNullableNumber(value: Numeric): number | null {
    return value === null || value === undefined ? null : Number(value);
}

export function roundToOneDecimal(value: number | null): number | null {
    return value === null ? null : Math.round(value * 10) / 10;
}

export interface GameRef {
    slug: string;
    name: string;
}

/**
 * How a session or a run of sessions went, in game-agnostic terms. Code Blitz
 * counts questions; Flush will count rounds. Same shape, different source table.
 */
export interface Progress {
    total: number;
    correct: number;
    incorrect: number;
    timedOut: number;
}

export interface ProgressRow {
    total_units: Numeric;
    correct_count: Numeric;
    incorrect_count: Numeric;
    timed_out_count: Numeric;
}

export function toProgress(row: ProgressRow): Progress {
    return {
        total: toNumber(row.total_units),
        correct: toNumber(row.correct_count),
        incorrect: toNumber(row.incorrect_count),
        timedOut: toNumber(row.timed_out_count)
    };
}

/**
 * Accuracy deliberately ignores timed-out units. Speed is already expressed in
 * the score, so letting a timeout also depress accuracy would penalise slowness
 * twice and make accuracy a worse signal of what the player knows.
 *
 * Returns null rather than 0 when nothing was attempted: "no data" and
 * "attempted and got everything wrong" are different facts.
 */
export function computeAccuracy(correct: number, incorrect: number): number | null {
    const attempted = correct + incorrect;

    if (attempted === 0) {
        return null;
    }

    return Math.round((correct / attempted) * 1000) / 1000;
}
