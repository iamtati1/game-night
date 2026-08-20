import { describe, expect, it } from "vitest";
import { computeAccuracy, toNullableNumber, toNumber, toUserStats, type UserStatsRow } from "./stats.js";

/** A row as Postgres actually returns it: COUNT/SUM as strings, MAX as a
 *  number, AVG as a numeric string. */
function row(overrides: Partial<UserStatsRow> = {}): UserStatsRow {
    return {
        games_completed: "0",
        games_abandoned: "0",
        games_in_progress: "0",
        total_xp: "0",
        total_score: "0",
        best_score: null,
        average_score: null,
        total_questions: "0",
        questions_answered: "0",
        correct_answers: "0",
        incorrect_answers: "0",
        timed_out_questions: "0",
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
    it("excludes timed-out questions by only taking correct and incorrect", () => {
        // 71 correct, 37 incorrect, and 12 timeouts that never reach this call.
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

    it("rounds to three decimals", () => {
        expect(computeAccuracy(1, 2)).toBe(0.333);
    });
});

describe("toUserStats", () => {
    it("maps a fresh account to zeros with unknown values left null", () => {
        const stats = toUserStats(row());

        expect(stats.gamesCompleted).toBe(0);
        expect(stats.totalXp).toBe(0);
        // The distinction that matters: a new player has no best score, rather
        // than a best score of zero, which would read as failure in the UI.
        expect(stats.bestScore).toBeNull();
        expect(stats.averageScore).toBeNull();
        expect(stats.accuracy).toBeNull();
    });

    it("coerces every count out of string form", () => {
        const stats = toUserStats(
            row({
                games_completed: "12",
                games_abandoned: "3",
                games_in_progress: "1",
                total_xp: "840",
                total_score: "8910",
                best_score: 1310,
                average_score: "742.5000000000000000",
                total_questions: "120",
                questions_answered: "108",
                correct_answers: "71",
                incorrect_answers: "37",
                timed_out_questions: "12"
            })
        );

        expect(stats).toEqual({
            gamesCompleted: 12,
            gamesAbandoned: 3,
            gamesInProgress: 1,
            totalXp: 840,
            totalScore: 8910,
            bestScore: 1310,
            averageScore: 742.5,
            totalQuestions: 120,
            questionsAnswered: 108,
            correctAnswers: 71,
            incorrectAnswers: 37,
            timedOutQuestions: 12,
            accuracy: 0.657
        });
    });

    it("rounds Postgres's long numeric average to one decimal", () => {
        const stats = toUserStats(row({ average_score: "742.4666666666666667" }));
        expect(stats.averageScore).toBe(742.5);
    });

    it("keeps every field a number, never a string", () => {
        const stats = toUserStats(row({ games_completed: "2", total_xp: "70" }));

        for (const [key, value] of Object.entries(stats)) {
            if (value !== null) {
                expect(typeof value, `${key} must be numeric`).toBe("number");
            }
        }
    });

    it("derives accuracy from the answer counts, not from totalQuestions", () => {
        // 6 correct, 2 incorrect, 2 timed out across 10 questions.
        // Including timeouts would give 0.6; excluding them gives 0.75.
        const stats = toUserStats(
            row({
                total_questions: "10",
                questions_answered: "8",
                correct_answers: "6",
                incorrect_answers: "2",
                timed_out_questions: "2"
            })
        );

        expect(stats.accuracy).toBe(0.75);
    });
});
