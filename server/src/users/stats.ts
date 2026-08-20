import {
    computeAccuracy,
    roundToOneDecimal,
    toNullableNumber,
    toNumber,
    toProgress,
    type GameRef,
    type Numeric,
    type Progress,
    type ProgressRow
} from "./shared.js";

// Re-exported so existing importers keep working and there is one obvious place
// to find these.
export { computeAccuracy, toNullableNumber, toNumber };

/**
 * Cross-game totals.
 *
 * XP is here because it is deliberately uniform across games (10 per correct
 * unit plus 25 for finishing), so summing it is meaningful. bestScore and
 * averageScore are deliberately NOT here: Code Blitz scores a speed bonus while
 * Tick scores escalating placements and a completion multiplier, so a "best
 * score" spanning both compares two different scales. Those live per game.
 */
export interface StatTotals {
    gamesCompleted: number;
    gamesAbandoned: number;
    gamesInProgress: number;
    totalXp: number;
    totalScore: number;
}

export interface GameStats {
    game: GameRef;
    gamesCompleted: number;
    gamesAbandoned: number;
    totalXp: number;
    totalScore: number;
    bestScore: number | null;
    averageScore: number | null;
    progress: Progress;
    accuracy: number | null;
}

export interface UserStats {
    totals: StatTotals;
    perGame: GameStats[];
}

export interface StatTotalsRow {
    games_completed: Numeric;
    games_abandoned: Numeric;
    games_in_progress: Numeric;
    total_xp: Numeric;
    total_score: Numeric;
}

export interface GameStatsRow extends ProgressRow {
    game_slug: string;
    game_name: string;
    games_completed: Numeric;
    games_abandoned: Numeric;
    total_xp: Numeric;
    total_score: Numeric;
    best_score: Numeric;
    average_score: Numeric;
}

export function toStatTotals(row: StatTotalsRow): StatTotals {
    return {
        gamesCompleted: toNumber(row.games_completed),
        gamesAbandoned: toNumber(row.games_abandoned),
        gamesInProgress: toNumber(row.games_in_progress),
        totalXp: toNumber(row.total_xp),
        totalScore: toNumber(row.total_score)
    };
}

export function toGameStats(row: GameStatsRow): GameStats {
    const progress = toProgress(row);

    return {
        game: { slug: row.game_slug, name: row.game_name },
        gamesCompleted: toNumber(row.games_completed),
        gamesAbandoned: toNumber(row.games_abandoned),
        totalXp: toNumber(row.total_xp),
        totalScore: toNumber(row.total_score),
        // null, not 0: a player with no finished games has no best score.
        bestScore: toNullableNumber(row.best_score),
        averageScore: roundToOneDecimal(toNullableNumber(row.average_score)),
        progress,
        accuracy: computeAccuracy(progress.correct, progress.incorrect)
    };
}

export function toUserStats(totals: StatTotalsRow, perGame: GameStatsRow[]): UserStats {
    return {
        totals: toStatTotals(totals),
        perGame: perGame.map(toGameStats)
    };
}
