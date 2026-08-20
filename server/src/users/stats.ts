/**
 * Pure stats shaping: no database, no Express. The query layer hands raw rows
 * here, which keeps the arithmetic and the null-handling unit-testable.
 */

export interface UserStats {
    gamesCompleted: number;
    gamesAbandoned: number;
    gamesInProgress: number;
    totalXp: number;
    totalScore: number;
    /** null, not 0: a player with no finished games has no best score. */
    bestScore: number | null;
    averageScore: number | null;
    totalQuestions: number;
    questionsAnswered: number;
    correctAnswers: number;
    incorrectAnswers: number;
    timedOutQuestions: number;
    /** correct / (correct + incorrect). Timeouts are excluded -- see below. */
    accuracy: number | null;
}

/**
 * Postgres hands aggregates back in mixed shapes: COUNT and SUM over bigint
 * arrive as strings, MAX over integer as a number, AVG as a numeric string.
 * Rather than guess per column, coerce defensively at the boundary -- an
 * uncoerced "840" would make "840" + 100 evaluate to "840100".
 */
type Numeric = string | number | null | undefined;

export function toNumber(value: Numeric): number {
    return value === null || value === undefined ? 0 : Number(value);
}

export function toNullableNumber(value: Numeric): number | null {
    return value === null || value === undefined ? null : Number(value);
}

/**
 * Accuracy deliberately ignores timed-out questions. Speed is already fully
 * expressed in the score through the 50-point bonus, so letting a timeout also
 * depress accuracy would penalise slowness twice and make accuracy a worse
 * signal of what the player actually knows.
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

function roundToOneDecimal(value: number | null): number | null {
    return value === null ? null : Math.round(value * 10) / 10;
}

export interface UserStatsRow {
    games_completed: Numeric;
    games_abandoned: Numeric;
    games_in_progress: Numeric;
    total_xp: Numeric;
    total_score: Numeric;
    best_score: Numeric;
    average_score: Numeric;
    total_questions: Numeric;
    questions_answered: Numeric;
    correct_answers: Numeric;
    incorrect_answers: Numeric;
    timed_out_questions: Numeric;
}

export function toUserStats(row: UserStatsRow): UserStats {
    const correctAnswers = toNumber(row.correct_answers);
    const incorrectAnswers = toNumber(row.incorrect_answers);

    return {
        gamesCompleted: toNumber(row.games_completed),
        gamesAbandoned: toNumber(row.games_abandoned),
        gamesInProgress: toNumber(row.games_in_progress),
        totalXp: toNumber(row.total_xp),
        totalScore: toNumber(row.total_score),
        bestScore: toNullableNumber(row.best_score),
        averageScore: roundToOneDecimal(toNullableNumber(row.average_score)),
        totalQuestions: toNumber(row.total_questions),
        questionsAnswered: toNumber(row.questions_answered),
        correctAnswers,
        incorrectAnswers,
        timedOutQuestions: toNumber(row.timed_out_questions),
        accuracy: computeAccuracy(correctAnswers, incorrectAnswers)
    };
}
