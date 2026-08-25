// Pure scoring rules for Memory: no database, no Express, no clock reads.

import { COMPLETION_BONUS_XP, perUnitXp } from "../games/xp.js";
import { SYMBOLS, type Symbol } from "./symbols.js";

export const MEMORY_ROUNDS_PER_SESSION = 5;

export interface RoundConfig {
    /** 1-based position in the session. */
    round: number;
    /** How many symbols to remember. */
    length: number;
    /** How long the sequence stays on screen. */
    displayMs: number;
}

/**
 * The difficulty curve, in one place.
 *
 * Two dials move together -- the sequence grows while the look shortens -- so
 * round five is harder than round one on both axes rather than just being
 * longer. Held here rather than computed, because a curve someone can read is
 * one they can tune; a formula would hide the shape.
 *
 * The client reads displayMs from the served round rather than recomputing it,
 * so there is exactly one definition of how long round three lasts.
 *
 * Tuned across two playtests. The original curve (2500ms down to 1700ms) read
 * as out of reach rather than demanding; the second (3500ms down to 2250ms)
 * was closer but the sequence still vanished before it could be encoded. This
 * curve adds roughly half a second to every round.
 *
 * What did NOT change is the shape: the sequence still grows while the window
 * shrinks, so milliseconds per symbol falls every round -- 1000, 700, 542, 429,
 * 344 -- and round five still asks for eight symbols in under three seconds.
 * The difficulty comes from having more to hold in mind, not from the clock
 * being unfairly short.
 */
export const ROUND_CONFIG: RoundConfig[] = [
    { round: 1, length: 4, displayMs: 4000 },
    { round: 2, length: 5, displayMs: 3500 },
    { round: 3, length: 6, displayMs: 3250 },
    { round: 4, length: 7, displayMs: 3000 },
    { round: 5, length: 8, displayMs: 2750 }
];

export function configForRound(round: number): RoundConfig {
    const config = ROUND_CONFIG.find((c) => c.round === round);

    if (!config) {
        throw new Error(`No Memory configuration for round ${round}`);
    }

    return config;
}

/** Longest sequence the curve ever asks for, so the vocabulary can be checked
 *  against it at import time rather than failing on round five in production. */
export const MAX_SEQUENCE_LENGTH = Math.max(...ROUND_CONFIG.map((c) => c.length));

if (MAX_SEQUENCE_LENGTH > SYMBOLS.length) {
    throw new Error(
        `Memory needs ${MAX_SEQUENCE_LENGTH} distinct symbols, vocabulary has ${SYMBOLS.length}`
    );
}

/**
 * How many symbols the player put in the right place.
 *
 * Position-wise, not set-wise: remembering which symbols appeared but not their
 * order is a different achievement, and scoring it as a near-miss would tell the
 * player they were close when they were not.
 *
 * A short answer is not padded and a long one is not truncated -- only the
 * positions that exist in both are compared, so an over-long submission cannot
 * score more than the sequence is worth.
 */
export function correctPositions(sequence: string[], submitted: string[]): number {
    const shared = Math.min(sequence.length, submitted.length);
    let correct = 0;

    for (let i = 0; i < shared; i++) {
        if (sequence[i] === submitted[i]) {
            correct += 1;
        }
    }

    return correct;
}

export function isPerfect(sequence: string[], submitted: string[]): boolean {
    return (
        sequence.length === submitted.length &&
        correctPositions(sequence, submitted) === sequence.length
    );
}

/** Every correct position pays, and longer sequences pay more per position. */
const BASE_PER_POSITION = 10;
const LENGTH_BONUS_PER_POSITION = 5;
/** Paid only for a flawless round. */
const PERFECT_BONUS_PER_SYMBOL = 25;

/**
 * Points for one round.
 *
 * Accuracy is the whole scale: nothing here reads a clock. Memory should not
 * quietly become a second reaction game, so a player who takes their time
 * reconstructing an eight-symbol sequence is not penalised for it.
 *
 * Partial recall pays proportionally, which is what keeps a fumbled round worth
 * finishing. The perfect bonus is what makes flawless feel different from nearly.
 */
export function pointsForRound(
    length: number,
    correct: number,
    perfect: boolean
): number {
    const perPosition = BASE_PER_POSITION + length * LENGTH_BONUS_PER_POSITION;
    const earned = correct * perPosition;

    return earned + (perfect ? length * PERFECT_BONUS_PER_SYMBOL : 0);
}

export interface ScoredRound {
    status: string;
    length: number;
    correct: number;
    perfect: boolean;
}

export function scoreForSession(rounds: ScoredRound[]): number {
    return rounds.reduce(
        (total, r) =>
            total + (r.status === "answered" ? pointsForRound(r.length, r.correct, r.perfect) : 0),
        0
    );
}

/**
 * XP for a session.
 *
 * Counts rounds RESOLVED, not rounds aced -- the same rule Reaction uses. XP is
 * progression; someone who played all five rounds played the game. Recall quality
 * is expressed in the score, the accuracy, the streak and the perfect count.
 */
export function xpForSession(rounds: ScoredRound[]): number {
    const resolved = rounds.filter((r) => r.status === "answered").length;

    return Math.round(resolved * perUnitXp(MEMORY_ROUNDS_PER_SESSION)) + COMPLETION_BONUS_XP;
}

/**
 * Longest run of consecutive perfect rounds.
 *
 * A mistake breaks the streak but never the session: all five rounds are always
 * played. Ending a run early would punish the exact player who most needs the
 * next round -- the one who just got something wrong.
 */
export function bestStreak(rounds: ScoredRound[]): number {
    let best = 0;
    let current = 0;

    for (const round of rounds) {
        current = round.status === "answered" && round.perfect ? current + 1 : 0;
        best = Math.max(best, current);
    }

    return best;
}

/** Share of all presented symbols placed correctly, across the whole run. */
export function recallAccuracy(rounds: ScoredRound[]): number | null {
    const answered = rounds.filter((r) => r.status === "answered");

    if (answered.length === 0) {
        return null;
    }

    const presented = answered.reduce((n, r) => n + r.length, 0);
    const remembered = answered.reduce((n, r) => n + r.correct, 0);

    return Math.round((remembered / presented) * 1000) / 1000;
}

/** Longest sequence the player got flawlessly right. */
export function bestSequenceLength(rounds: ScoredRound[]): number | null {
    const perfect = rounds.filter((r) => r.status === "answered" && r.perfect);

    return perfect.length ? Math.max(...perfect.map((r) => r.length)) : null;
}

export function isKnownSubmission(submitted: unknown): submitted is Symbol[] {
    return (
        Array.isArray(submitted) &&
        submitted.length > 0 &&
        submitted.length <= SYMBOLS.length &&
        submitted.every((s) => (SYMBOLS as readonly string[]).includes(s as string))
    );
}
