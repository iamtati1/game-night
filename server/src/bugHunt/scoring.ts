// Pure rules for Bug Hunt: no database, no Express, no clock reads. Every input
// is passed in, so each rule here is directly unit-testable -- the same
// discipline the other four scoring modules follow.

import { COMPLETION_BONUS_XP, perUnitXp } from "../games/xp.js";

export const BUG_HUNT_INCIDENTS_PER_SESSION = 10;

/**
 * Which difficulty each hunt of a run is drawn from.
 *
 * Three trivial openers before anything real is asked of the player, then a
 * climb. Held as a literal rather than computed because the shape of the ramp is
 * a design decision someone should be able to read and argue with -- a formula
 * would hide exactly where the game stops being gentle.
 */
export const DIFFICULTY_RAMP = [1, 1, 1, 2, 2, 3, 3, 4, 4, 5] as const;

/** The last incident of a run. Framed as a critical failure and scored higher. */
export const BOSS_DISPLAY_ORDER = BUG_HUNT_INCIDENTS_PER_SESSION;

/**
 * Two diagnoses per incident.
 *
 * Not unlimited: with four options, unlimited guesses is elimination rather than
 * debugging, and the player would win every incident while learning nothing. Not
 * one either -- a single wrong click ending the incident makes the explanation
 * arrive too late to be used. Two gives exactly one "PATCH FAILED, one attempt
 * left" beat, which is where the clue the game just handed over gets spent.
 */
export const MAX_ATTEMPTS = 2;

/** Ceiling on an incident's hint ladder; the schema enforces the same range. */
export const MAX_HINTS = 3;

// ---------------------------------------------------------------- challenge types

/** Every type the schema accepts. Adding one later is content plus a renderer. */
export const CHALLENGE_TYPES = ["find_line", "choose_patch", "diagnose", "trace"] as const;

export type ChallengeType = (typeof CHALLENGE_TYPES)[number];

/**
 * What the client can actually render today.
 *
 * The schema deliberately accepts four types so a fifth migration is never
 * needed, but only these two have an interaction built. An incident of an
 * unbuilt type reaching the client must fail loudly rather than fall through to
 * whichever renderer happens to be last -- silently showing a "pick the line"
 * interface for a "trace the failure" incident would be unanswerable, and the
 * player would blame themselves.
 */
export const PLAYABLE_CHALLENGE_TYPES: readonly ChallengeType[] = ["find_line", "choose_patch"];

export function isPlayableChallengeType(value: string): value is ChallengeType {
    return (PLAYABLE_CHALLENGE_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------- timing

/**
 * An incident's window, scaled to how much there is to read.
 *
 * Bug Hunt's whole premise is reading unfamiliar code carefully, so the clock
 * has to cover reading it at least once before any thinking starts. A flat limit
 * would squeeze the longest snippets hardest -- least time where there is most
 * to take in -- which is the mistake Flush's flat 60s made.
 *
 * Generous on purpose, per the platform tuning principle: difficulty should come
 * from the bug, not from the timer. A player who reasons it out in forty seconds
 * should feel like they solved it, not like they nearly ran out.
 */
/**
 * Reading time, granted per line regardless of difficulty.
 *
 * Kept separate from the difficulty allowance below because they answer
 * different questions: this one is "how long does it take to READ this", which
 * depends only on how much there is. A twelve-line hard bug should not be
 * punished for being long on top of being hard.
 */
export const BUG_HUNT_TIME_PER_LINE_MS = 2_500;

/**
 * Thinking time, by difficulty. This is the ramp.
 *
 * Tier one is null: those hunts have no clock at all. "Very generous" is not the
 * same as untimed -- a countdown sitting at ninety seconds still tells a player
 * who is still learning the game that they are being measured, and the whole
 * point of the opening is that they are not. The deadline arrives once they have
 * found a few bugs and know what they are looking for.
 */
const THINKING_MS: Record<number, number | null> = {
    1: null,
    2: 30_000,
    3: 22_000,
    4: 14_000,
    // Deliberately a bigger step than the tiers below it. Measured against the
    // real bank, 8s put tier five within a second of tier four -- the final hunt
    // has to feel like the final hunt, and one second of difference does not.
    5: 4_000
};

/** However hard the bug, nobody should be asked to read and answer in under this. */
export const BUG_HUNT_MIN_TIME_MS = 18_000;
export const BUG_HUNT_MAX_TIME_MS = 90_000;

/** Lines of code in a snippet, which reading time is scaled to. */
export function countCodeLines(code: string): number {
    const lines = code.split("\n").filter((line) => line.trim() !== "").length;

    return Math.max(1, lines);
}

/**
 * A hunt's budget, or null when it has no deadline.
 *
 * Difficulty drives it, which it did not before: the previous formula took line
 * count alone, so difficulty was stored, used to order the run, and then ignored
 * by the clock. The result was a flat 61-72s across every tier, and one measured
 * inversion where a difficulty-1 off-by-one and a difficulty-5 race condition
 * both received exactly 66 seconds.
 */
export function timeLimitMs(difficulty: number, codeLineCount: number): number | null {
    const tier = Math.min(5, Math.max(1, Math.trunc(difficulty)));
    const thinking = THINKING_MS[tier];

    if (thinking === null || thinking === undefined) return null;

    const lines = Math.max(1, Math.trunc(codeLineCount));

    return Math.min(
        BUG_HUNT_MAX_TIME_MS,
        Math.max(BUG_HUNT_MIN_TIME_MS, thinking + BUG_HUNT_TIME_PER_LINE_MS * lines)
    );
}

/** True when this hunt runs without a deadline. */
export function isUntimed(limitMs: number | null): boolean {
    return limitMs === null;
}

/**
 * Whether the incident's deadline has passed.
 *
 * Server-side only. The client runs a countdown for tension, but the client's
 * clock is not evidence -- a paused laptop or a fiddled system time would make
 * it say anything.
 */
export function isExpired(servedAt: Date, now: Date, limitMs: number | null): boolean {
    // An untimed hunt cannot run out. Stated here as well as in SQL so neither
    // side depends on the other's handling of NULL.
    if (limitMs === null) return false;

    return now.getTime() - servedAt.getTime() > limitMs;
}

// ----------------------------------------------------------------------- hints

/**
 * Which hint comes next, or null when the ladder is spent.
 *
 * The client never names a hint. It asks for "the next one" and the server
 * answers with the one at hints_used, then increments. Revealing out of order or
 * twice is therefore not something the API can express, rather than something it
 * has to police -- and hints_used stays a number only the server ever writes.
 */
export function nextHintIndex(hintsUsed: number, hintsAvailable: number): number | null {
    const used = Math.max(0, Math.trunc(hintsUsed));
    const available = Math.min(Math.max(0, Math.trunc(hintsAvailable)), MAX_HINTS);

    return used >= available ? null : used;
}

// --------------------------------------------------------------------- scoring

/** Awarded for stabilising the incident at all. Correctness is the whole game. */
const RESOLUTION_POINTS = 100;

/** For getting there without a wasted patch. */
const FIRST_TRY_BONUS = 50;

/** The most speed can ever be worth -- deliberately less than a third of what
 *  correctness pays, so rushing is never the optimal strategy. */
const SPEED_BONUS_MAX = 40;

/** Share of the budget that costs nothing. Reading carefully has to be free. */
const SPEED_GRACE_FRACTION = 0.4;

const HINT_PENALTY = 15;

/** However many hints were spent, a resolution is still worth having. Without a
 *  floor, a hinted late resolution could pay less than the streak it breaks. */
const RESOLUTION_FLOOR = 40;

const STREAK_BONUS_PER_STEP = 20;
const STREAK_BONUS_CAP = 80;

/** The boss is worth more because it is harder, not to manufacture a comeback. */
const BOSS_MULTIPLIER = 1.5;

/**
 * One round, reduced to the facts the database actually stores.
 *
 * Everything here is a persisted column or a subtraction of two of them, which
 * is what makes the score reproducible: replaying these rows always produces the
 * same number, and there is no stored score to disagree with them.
 */
export interface ScoredRound {
    status: "pending" | "resolved" | "failed";
    displayOrder: number;
    attempts: number;
    hintsUsed: number;
    /** ended_at - served_at. Null while the round is still open. */
    elapsedMs: number | null;
    /** Null on an untimed hunt. */
    timeLimitMs: number | null;
}

/**
 * Speed pays nothing for the first 40% of the window, then decays to zero at the
 * deadline.
 *
 * The flat opening is the important half: it means a player who reads the code
 * twice before answering loses nothing at all, which is the difference between
 * a debugging game and a reflex game.
 */
export function speedBonus(elapsedMs: number | null, limitMs: number | null): number {
    // An untimed hunt pays nothing for speed, because speed is not being asked
    // for yet. Awarding it anyway would quietly reintroduce a clock the player
    // was told they did not have, and inflate the easiest scores in the run.
    if (elapsedMs === null || limitMs === null || limitMs <= 0) return 0;

    const grace = limitMs * SPEED_GRACE_FRACTION;

    if (elapsedMs <= grace) return SPEED_BONUS_MAX;

    const remaining = limitMs - elapsedMs;

    if (remaining <= 0) return 0;

    return Math.round(SPEED_BONUS_MAX * (remaining / (limitMs - grace)));
}

/** Streak bonus for the nth consecutive resolution. The first is worth nothing
 *  extra -- a streak of one is not a streak. */
export function streakBonus(streak: number): number {
    const steps = Math.max(0, Math.trunc(streak) - 1);

    return Math.min(STREAK_BONUS_CAP, STREAK_BONUS_PER_STEP * steps);
}

/**
 * Points for one round.
 *
 * `streak` is the run length INCLUDING this round, so the caller owns the only
 * piece of cross-round state and this stays a pure function of one row.
 */
export function pointsForRound(round: ScoredRound, streak: number): number {
    if (round.status !== "resolved") return 0;

    const firstTry = round.attempts === 1 ? FIRST_TRY_BONUS : 0;
    const hints = HINT_PENALTY * Math.max(0, Math.trunc(round.hintsUsed));

    const subtotal = Math.max(
        RESOLUTION_FLOOR,
        RESOLUTION_POINTS + firstTry + speedBonus(round.elapsedMs, round.timeLimitMs) - hints
    );

    const withStreak = subtotal + streakBonus(streak);

    return round.displayOrder === BOSS_DISPLAY_ORDER
        ? Math.round(withStreak * BOSS_MULTIPLIER)
        : withStreak;
}

/** Rounds in the order they were played. Sorted here rather than trusted, so a
 *  caller passing them back in id order cannot change the streaks. */
function inPlayOrder(rounds: ScoredRound[]): ScoredRound[] {
    return [...rounds].sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * The streak as it stood at the end of a given round, counting that round.
 *
 * The routes need this to report the streak for the incident just played, and
 * pointsForRound needs it as its second argument. Deriving it here rather than
 * tracking it in a column keeps the streak reproducible from the same rows
 * everything else derives from.
 */
export function streakThrough(rounds: ScoredRound[], displayOrder: number): number {
    let streak = 0;

    for (const round of inPlayOrder(rounds)) {
        if (round.displayOrder > displayOrder) break;

        streak = round.status === "resolved" ? streak + 1 : 0;
    }

    return streak;
}

export function scoreForSession(rounds: ScoredRound[]): number {
    let streak = 0;

    return inPlayOrder(rounds).reduce((total, round) => {
        streak = round.status === "resolved" ? streak + 1 : 0;

        return total + pointsForRound(round, streak);
    }, 0);
}

// ------------------------------------------------------------------ session facts

export function resolvedCount(rounds: ScoredRound[]): number {
    return rounds.filter((r) => r.status === "resolved").length;
}

export function firstTryCount(rounds: ScoredRound[]): number {
    return rounds.filter((r) => r.status === "resolved" && r.attempts === 1).length;
}

export function hintsSpent(rounds: ScoredRound[]): number {
    return rounds.reduce((total, r) => total + Math.max(0, Math.trunc(r.hintsUsed)), 0);
}

export function bestStreak(rounds: ScoredRound[]): number {
    let best = 0;
    let current = 0;

    for (const round of inPlayOrder(rounds)) {
        current = round.status === "resolved" ? current + 1 : 0;
        best = Math.max(best, current);
    }

    return best;
}

/** Mean time to stabilise, over resolved rounds only. A failed incident has no
 *  resolution time, and averaging its full budget in as "slow" would be a lie. */
export function averageResolutionMs(rounds: ScoredRound[]): number | null {
    const timed = rounds.filter(
        (r) => r.status === "resolved" && r.elapsedMs !== null
    ) as (ScoredRound & { elapsedMs: number })[];

    if (timed.length === 0) return null;

    return Math.round(timed.reduce((sum, r) => sum + r.elapsedMs, 0) / timed.length);
}

/**
 * What each mistake costs the system.
 *
 * Exported because the client shows these numbers to the player as the reason
 * their decisions matter. A legend that quietly disagrees with the arithmetic is
 * worse than no legend, so the client reads them from here and a test pins the
 * two together.
 */
export const INTEGRITY_FAILED_COST = 10;
export const INTEGRITY_EXTRA_ATTEMPT_COST = 3;
export const INTEGRITY_HINT_COST = 1;

/**
 * System integrity, 0-100.
 *
 * Derived, never stored: a column would drift from the rounds it claims to
 * summarise and then neither could be trusted. It is a reading of how the run
 * has actually gone, which is why a flawless player arrives at the boss on 100%
 * and finishes on 100%. The escalation at incident five comes from the framing,
 * not from quietly draining a meter to manufacture tension.
 */
export function systemIntegrity(rounds: ScoredRound[]): number {
    const failed = rounds.filter((r) => r.status === "failed").length;
    const extraAttempts = rounds.reduce(
        (total, r) => total + Math.max(0, Math.trunc(r.attempts) - 1),
        0
    );

    const damage =
        INTEGRITY_FAILED_COST * failed +
        INTEGRITY_EXTRA_ATTEMPT_COST * extraAttempts +
        INTEGRITY_HINT_COST * hintsSpent(rounds);

    return Math.max(0, Math.min(100, 100 - damage));
}

const XP_PER_RESOLVED_INCIDENT = perUnitXp(BUG_HUNT_INCIDENTS_PER_SESSION);

/**
 * XP for a finished run.
 *
 * Hints cost score, never XP. XP is the one number compared across games, and
 * bolting a Bug-Hunt-only penalty onto it would make this game a worse way to
 * earn the same skill -- so five resolved incidents is 125, exactly as a perfect
 * run of every other game is.
 */
export function xpForSession(rounds: ScoredRound[]): number {
    return (
        Math.round(resolvedCount(rounds) * XP_PER_RESOLVED_INCIDENT) + COMPLETION_BONUS_XP
    );
}

// ------------------------------------------------------------- state transitions

export type DiagnosisOutcome = "resolved" | "retry" | "failed";

/**
 * What a submitted diagnosis does to the round.
 *
 * `attemptsAfter` is the count including the attempt being judged, so this
 * describes the state the round is moving INTO. Kept pure and separate from the
 * route so the transition table is a thing tests can enumerate rather than
 * something inferred from SQL.
 */
export function outcomeFor(correct: boolean, attemptsAfter: number): DiagnosisOutcome {
    if (correct) return "resolved";

    return attemptsAfter >= MAX_ATTEMPTS ? "failed" : "retry";
}

/** Whether another diagnosis is allowed on a round that has already had some. */
export function canAttempt(status: string, attempts: number): boolean {
    return status === "pending" && attempts < MAX_ATTEMPTS;
}
