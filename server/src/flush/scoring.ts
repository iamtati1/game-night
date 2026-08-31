// Pure scoring rules for Flush: no database, no Express, no clock reads.
// Everything is passed in, so every rule here is directly unit-testable.

import { COMPLETION_BONUS_XP, perUnitXp } from "../games/xp.js";

/**
 * A round's window, scaled to the work it actually contains.
 *
 * The flat 60s squeezed exactly the wrong rounds: the clock covers the WHOLE
 * round rather than each placement, so a six-output snippet at the top of the
 * difficulty ramp got ten seconds per decision while a three-output one got
 * twenty -- least time where the reasoning is hardest.
 *
 * Base plus per-output keeps the per-decision budget roughly constant, so
 * difficulty comes from the snippet rather than from arithmetic about how many
 * lines it prints.
 */
export const FLUSH_BASE_TIME_MS = 20_000;
export const FLUSH_TIME_PER_OUTPUT_MS = 10_000;

export function roundTimeLimitMs(totalOutputs: number): number {
    return FLUSH_BASE_TIME_MS + FLUSH_TIME_PER_OUTPUT_MS * Math.max(0, totalOutputs);
}

export const FLUSH_ROUNDS_PER_SESSION = 5;

/** First correct placement is worth this; each subsequent one is worth more. */
const BASE_PER_PLACEMENT = 10;

/** Completing a full sequence doubles the round. This is the whole risk. */
const COMPLETION_MULTIPLIER = 2;

const XP_PER_COMPLETED_ROUND = perUnitXp(FLUSH_ROUNDS_PER_SESSION);

/**
 * Points banked for n correct placements, escalating: 10, then 20, then 30...
 * so 10 + 20 + 30 = 60 for three.
 *
 * Deliberately NOT flat. Escalation is what makes the fifth placement worth
 * more than the first, and therefore what makes a wrong guess late in a round
 * expensive rather than neutral.
 */
export function pointsForPlacements(correctPlacements: number): number {
    const n = Math.max(0, Math.trunc(correctPlacements));

    // Sum of the first n multiples of BASE_PER_PLACEMENT.
    return (BASE_PER_PLACEMENT * n * (n + 1)) / 2;
}

/**
 * A round's score. The multiplier applies only to a fully completed sequence,
 * so one wrong placement forfeits it on everything banked beneath.
 *
 * There is deliberately no "cash out early" option: stopping would also forfeit
 * the multiplier, making it always weakly worse than guessing. A choice that is
 * never correct is clutter, not a mechanic. The tension is intrinsic instead --
 * every placement past the first risks the 2x.
 *
 * Note there is no speed bonus anywhere. Code Blitz rewards speed; Flush rewards
 * accuracy. Two games that both reward speed would be one game with two skins.
 */
export function roundScore(correctPlacements: number, completed: boolean): number {
    const banked = pointsForPlacements(correctPlacements);

    return completed ? banked * COMPLETION_MULTIPLIER : banked;
}

export interface ScoredRound {
    correctPlacements: number;
    status: string;
}

export function isCompletedRound(round: ScoredRound): boolean {
    return round.status === "completed";
}

export function scoreForSession(rounds: ScoredRound[]): number {
    return rounds.reduce(
        (total, round) => total + roundScore(round.correctPlacements, isCompletedRound(round)),
        0
    );
}

/**
 * XP for a session. Derived from the platform rule, so a perfect Flush game is
 * worth exactly as much as a perfect Code Blitz game -- otherwise the shorter
 * game becomes the optimal way to farm a cross-game leaderboard.
 */
export function xpForSession(rounds: ScoredRound[]): number {
    const completed = rounds.filter(isCompletedRound).length;

    return Math.round(completed * XP_PER_COMPLETED_ROUND) + COMPLETION_BONUS_XP;
}

/** Whether a round's window has closed. The limit depends on the round, so the
 *  output count has to come with it. */
export function isExpired(servedAt: Date, now: Date, totalOutputs: number): boolean {
    return now.getTime() - servedAt.getTime() > roundTimeLimitMs(totalOutputs);
}

/**
 * Whether a placement is correct: the chosen output must be the one expected at
 * this point in the sequence.
 *
 * `expectedPosition` is 1-based, matching flush_outputs.position. A distractor
 * has no position at all, so passing null can never be correct -- which is
 * exactly the behaviour wanted: placing a tile that never prints is a mistake.
 */
export function isPlacementCorrect(
    outputPosition: number | null,
    placementIndex: number
): boolean {
    return outputPosition !== null && outputPosition === placementIndex;
}
