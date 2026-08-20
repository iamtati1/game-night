/**
 * Platform XP rule.
 *
 * XP is the only currency compared across games -- it is what a cross-game
 * leaderboard and the cross-game totals in /api/users/me/stats are built on.
 * Score is not comparable: Code Blitz awards a speed bonus while Tick awards
 * escalating placements and a completion multiplier.
 *
 * For that comparison to mean anything, a perfect game must be worth the same
 * XP in every game. Otherwise the shortest or easiest game becomes the optimal
 * way to farm the leaderboard, and ranking stops measuring skill.
 *
 * So each game declares how many scoring units a perfect game contains, and
 * derives its per-unit rate from that. Game #3 only has to answer the same
 * question: "how many units is a perfect game?"
 */

/** Awarded once for finishing, regardless of performance. */
export const COMPLETION_BONUS_XP = 25;

/** What a flawless game is worth, in any game. */
export const PERFECT_GAME_XP = 125;

/**
 * XP per successful unit, given how many units a perfect game contains.
 *
 *   Code Blitz: 10 questions -> 10 XP each -> 10*10 + 25 = 125
 *   Tick:        5 rounds    -> 20 XP each ->  5*20 + 25 = 125
 */
export function perUnitXp(unitsInPerfectGame: number): number {
    if (unitsInPerfectGame <= 0) {
        throw new Error("A game must contain at least one scoring unit");
    }

    return (PERFECT_GAME_XP - COMPLETION_BONUS_XP) / unitsInPerfectGame;
}

/** XP for a finished game: the completion bonus plus one rate per successful unit. */
export function xpForUnits(successfulUnits: number, unitsInPerfectGame: number): number {
    return Math.round(successfulUnits * perUnitXp(unitsInPerfectGame)) + COMPLETION_BONUS_XP;
}
