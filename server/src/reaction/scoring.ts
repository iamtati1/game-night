// Pure scoring rules for Reaction: no database, no Express, no clock reads.
// Everything is passed in, so every rule here is directly unit-testable.

import { COMPLETION_BONUS_XP, perUnitXp } from "../games/xp.js";

export const REACTION_ROUNDS_PER_SESSION = 5;

/**
 * Plausibility bounds for a submitted reaction.
 *
 * The client measures the reaction with performance.now(), because only the
 * browser knows when the signal was painted and when the player moved. The server
 * cannot reproduce that, so it validates rather than recomputes -- see the note in
 * routes.ts. 80ms is below human simple-reaction latency, so anything faster was
 * not a reaction; 5s means the player stopped playing rather than reacted slowly.
 *
 * Duplicated as a CHECK in migration 012, so a bad value cannot be stored even if
 * it reaches the table by another path.
 */
export const MIN_PLAUSIBLE_MS = 80;
export const MAX_PLAUSIBLE_MS = 5000;

export function isPlausibleReaction(ms: unknown): ms is number {
    return (
        typeof ms === "number" &&
        Number.isFinite(ms) &&
        Number.isInteger(ms) &&
        ms >= MIN_PLAUSIBLE_MS &&
        ms <= MAX_PLAUSIBLE_MS
    );
}

/** Below this, a reaction earns full speed points. */
const FLOOR_MS = 150;
/** At or above this, a reaction earns none. */
const CEILING_MS = 600;
/** Awarded for reacting at all, however slowly. */
const BASE_POINTS = 200;
/** The most speed can add on top. */
const MAX_SPEED_POINTS = 1500;

/**
 * Points for one reaction.
 *
 * A floor of BASE_POINTS for reacting at all, plus a linear speed bonus between
 * 150ms and 600ms. The floor matters: a slow round should still feel like it
 * counted, because a game that pays nothing for a 500ms reaction reads as
 * punishment rather than scoring.
 *
 * A false start scores zero -- moving before the signal is the one thing the game
 * asks you not to do -- but it costs no XP. Performance and progression are
 * separate currencies here on purpose.
 */
export function pointsForReaction(reactionMs: number | null): number {
    if (reactionMs === null) {
        return 0;
    }

    const span = CEILING_MS - FLOOR_MS;
    const fromFloor = Math.min(Math.max(CEILING_MS - reactionMs, 0), span);

    return BASE_POINTS + Math.round((fromFloor / span) * MAX_SPEED_POINTS);
}

export interface ScoredRound {
    status: string;
    reactionMs: number | null;
}

export function isReacted(round: ScoredRound): boolean {
    return round.status === "reacted" && round.reactionMs !== null;
}

export function scoreForSession(rounds: ScoredRound[]): number {
    return rounds.reduce(
        (total, round) => total + (isReacted(round) ? pointsForReaction(round.reactionMs) : 0),
        0
    );
}

/**
 * XP for a session.
 *
 * Counts every round the player RESOLVED -- reacted or jumped early -- not every
 * round they were fast on. XP is progression, not performance: someone who plays
 * all five rounds has played the game, and docking their progression for slow
 * reflexes would make Jolt punitive. Speed is already expressed in the score, the
 * tier, the average, the best and the personal best.
 *
 * Derived from the platform rule, so a completed Reaction run is worth exactly
 * what a completed Code Blitz or Flush run is worth.
 */
export function xpForSession(rounds: ScoredRound[]): number {
    const resolved = rounds.filter((r) => r.status !== "pending").length;

    return Math.round(resolved * perUnitXp(REACTION_ROUNDS_PER_SESSION)) + COMPLETION_BONUS_XP;
}

export interface ReactionTier {
    label: string;
    /** Machine-readable, so the UI is not matching on display copy. */
    key: "lightning" | "incredible" | "fast" | "solid" | "sharp";
}

const TIERS: { maxMs: number; tier: ReactionTier }[] = [
    { maxMs: 200, tier: { key: "lightning", label: "Lightning" } },
    { maxMs: 250, tier: { key: "incredible", label: "Incredible" } },
    { maxMs: 300, tier: { key: "fast", label: "Fast" } },
    { maxMs: 400, tier: { key: "solid", label: "Solid" } },
    { maxMs: Infinity, tier: { key: "sharp", label: "Keep sharp" } }
];

/**
 * The emotional read on a reaction time.
 *
 * The label is what the player remembers; the number is what they try to beat.
 * "Keep sharp" rather than "Slow" for the bottom tier deliberately -- the worst
 * outcome in a game you play for fun should not read as a verdict on you.
 */
export function tierFor(reactionMs: number): ReactionTier {
    return TIERS.find(({ maxMs }) => reactionMs < maxMs)!.tier;
}

/** Fastest reaction of the run, or null if none landed. */
export function bestReactionMs(rounds: ScoredRound[]): number | null {
    const times = rounds.filter(isReacted).map((r) => r.reactionMs!);

    return times.length ? Math.min(...times) : null;
}

/** Mean of the reactions that landed. False starts have no time to average. */
export function averageReactionMs(rounds: ScoredRound[]): number | null {
    const times = rounds.filter(isReacted).map((r) => r.reactionMs!);

    if (times.length === 0) {
        return null;
    }

    return Math.round(times.reduce((total, ms) => total + ms, 0) / times.length);
}
