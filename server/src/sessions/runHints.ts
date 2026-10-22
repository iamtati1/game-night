import type { Request } from "express";

/**
 * Which questions and rounds a learner took a hint on.
 *
 * THE COST OF A HINT: a hinted answer earns half points -- in Code Blitz a
 * hinted correct answer scores 50 and no speed bonus; in Flush a hinted round
 * banks half. XP, correctness, rounds and progression are untouched: XP counts
 * correct answers and completed rounds, not points.
 *
 * WHERE THIS LIVES, AND WHY: the same reasoning as relaxedRuns.ts. There is no
 * column for it and this work adds no migration; the server-side login session
 * is the same object on every request that serves, answers, resumes or scores
 * a run. Keyed by the unit's id (session_questions.id for Code Blitz,
 * flush_rounds.id for Flush), in separate maps because the two id spaces can
 * overlap.
 *
 * THE FAILURE MODE: if the login session is lost mid-run (signed out and back
 * in, another browser), the hint is forgotten and that answer scores in full.
 * Points only -- never XP, evidence or progress. docs/KNOWN_LIMITATIONS.md
 * says so.
 */

/** Hints a Code Blitz question can give: each rules out one wrong answer. */
export const MAX_BLITZ_HINTS = 2;

const MAX_REMEMBERED = 200;

interface HintStore {
    blitz?: Record<string, number>;
    flush?: Record<string, string>;
}

type WithHints = Request["session"] & { runHints?: HintStore };

function store(req: Request): HintStore | null {
    const session = req.session as WithHints | undefined;
    if (!session) return null;
    session.runHints ??= {};
    return session.runHints;
}

/** Keeps only the newest entries, so a long login cannot grow without limit. */
function trim<T>(map: Record<string, T>): Record<string, T> {
    const keys = Object.keys(map);
    if (keys.length <= MAX_REMEMBERED) return map;
    return Object.fromEntries(keys.slice(-MAX_REMEMBERED).map((k) => [k, map[k]!]));
}

export function blitzHintCount(req: Request, sessionQuestionId: string): number {
    return store(req)?.blitz?.[String(sessionQuestionId)] ?? 0;
}

export function recordBlitzHint(req: Request, sessionQuestionId: string): number {
    const s = store(req);
    if (!s) return 0;
    const id = String(sessionQuestionId);
    const next = Math.min(MAX_BLITZ_HINTS, (s.blitz?.[id] ?? 0) + 1);
    const map = { ...(s.blitz ?? {}) };
    delete map[id];
    map[id] = next;
    s.blitz = trim(map);
    return next;
}

/** A predicate over session_questions ids: was a hint taken on this one? */
export function blitzHinted(req: Request): (sessionQuestionId: string) => boolean {
    const map = store(req)?.blitz ?? {};
    return (id) => (map[String(id)] ?? 0) > 0;
}

/** The output a Flush round's hint pointed at, or null when none was taken. */
export function flushHint(req: Request, roundId: string): string | null {
    return store(req)?.flush?.[String(roundId)] ?? null;
}

export function recordFlushHint(req: Request, roundId: string, outputId: string): void {
    const s = store(req);
    if (!s) return;
    const map = { ...(s.flush ?? {}) };
    delete map[String(roundId)];
    map[String(roundId)] = String(outputId);
    s.flush = trim(map);
}

/** A predicate over flush_rounds ids: was a hint taken in this round? */
export function flushHinted(req: Request): (roundId: string) => boolean {
    const map = store(req)?.flush ?? {};
    return (id) => map[String(id)] !== undefined;
}

/** Both Code Blitz readings at once, for a request's handlers to pass around. */
export interface BlitzHints {
    count: (sessionQuestionId: string) => number;
    hinted: (sessionQuestionId: string) => boolean;
}

export const NO_HINTS: BlitzHints = { count: () => 0, hinted: () => false };

export function blitzHints(req: Request): BlitzHints {
    return {
        count: (id) => blitzHintCount(req, id),
        hinted: (id) => blitzHintCount(req, id) > 0
    };
}

/** Both Flush readings at once: was a round hinted, and which output it showed. */
export interface FlushHints {
    hinted: (roundId: string) => boolean;
    outputFor: (roundId: string) => string | null;
}

export const NO_FLUSH_HINTS: FlushHints = { hinted: () => false, outputFor: () => null };

export function flushHints(req: Request): FlushHints {
    return {
        hinted: (id) => flushHint(req, id) !== null,
        outputFor: (id) => flushHint(req, id)
    };
}
