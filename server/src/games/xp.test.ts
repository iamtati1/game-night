import { describe, expect, it } from "vitest";
import { COMPLETION_BONUS_XP, PERFECT_GAME_XP, perUnitXp, xpForUnits } from "./xp.js";
import { QUESTIONS_PER_SESSION, xpForSession as blitzXp } from "../game/scoring.js";
import { FLUSH_ROUNDS_PER_SESSION, xpForSession as flushXp } from "../flush/scoring.js";

describe("perUnitXp", () => {
    it("derives Code Blitz's existing rate of 10 per question", () => {
        // Not a new rule: this reproduces the constant Code Blitz already shipped,
        // which is what makes the platform rule credible rather than retrofitted.
        expect(perUnitXp(10)).toBe(10);
    });

    it("derives 20 per round for a five-round game", () => {
        expect(perUnitXp(5)).toBe(20);
    });

    it("rejects a game with no scoring units", () => {
        expect(() => perUnitXp(0)).toThrow();
        expect(() => perUnitXp(-1)).toThrow();
    });
});

describe("xpForUnits", () => {
    it("awards the completion bonus even for a flawless-zero game", () => {
        expect(xpForUnits(0, 10)).toBe(COMPLETION_BONUS_XP);
    });

    it("reaches exactly PERFECT_GAME_XP for a flawless game of any length", () => {
        for (const units of [1, 4, 5, 10, 20, 25]) {
            expect(xpForUnits(units, units), `${units}-unit game`).toBe(PERFECT_GAME_XP);
        }
    });
});

describe("cross-game XP parity", () => {
    /**
     * The invariant that makes a cross-game leaderboard meaningful. If a perfect
     * game were worth more XP in one game than another, the cheaper game would
     * become the optimal way to climb the rankings and XP would stop measuring
     * skill. Score is deliberately NOT comparable across games; XP is.
     */
    it("pays the same for a perfect game of Code Blitz and a perfect game of Flush", () => {
        const perfectBlitz = Array.from({ length: QUESTIONS_PER_SESSION }, () => ({
            isCorrect: true,
            servedAt: new Date(0),
            answeredAt: new Date(1000)
        }));

        const perfectFlush = Array.from({ length: FLUSH_ROUNDS_PER_SESSION }, () => ({
            correctPlacements: 4,
            status: "completed"
        }));

        expect(blitzXp(perfectBlitz)).toBe(PERFECT_GAME_XP);
        expect(flushXp(perfectFlush)).toBe(PERFECT_GAME_XP);
        expect(blitzXp(perfectBlitz)).toBe(flushXp(perfectFlush));
    });

    it("pays the same for a game where nothing went right", () => {
        expect(blitzXp([{ isCorrect: false, servedAt: null, answeredAt: null }])).toBe(
            flushXp([{ correctPlacements: 0, status: "failed" }])
        );
    });
});
