import type { GameStatus } from "../components/GameCard.js";
import { BUG_HUNT, CODE_BLITZ, FLUSH, MEMORY, REACTION } from "./catalog.js";
import { STATE } from "../vocabulary.js";

/**
 * What each game card says about whether it can be played now.
 *
 * NOTHING HERE DECIDES ELIGIBILITY. Flush and Bug Hunt's answers come from
 * their read-only GET /readiness endpoints, which share one function with the
 * start route -- so a card cannot say "ready" for a game that would refuse,
 * or the reverse. This only words those answers for a card.
 *
 * The other three were audited rather than assumed:
 *
 *   Code Blitz  never refuses a learner: it deals a round, or opens the next
 *               short intro when there is too little to deal. Ready.
 *   Reaction,   no content and no prerequisite. Ready, and they record XP
 *   Memory      only, so they do not count toward the course -- which is
 *               said as "just for fun", never as locked.
 */

/** GET /api/flush/readiness */
export interface FlushReadiness {
    ready: boolean;
    eligible: number;
    needed: number;
    full: number;
    message: string | null;
}

/** GET /api/bug-hunt/readiness */
export interface BugHuntReadiness {
    ready: boolean;
    eligible: number;
    needed: number;
    full: number;
    reason: "not-met" | "difficulty" | "too-few" | null;
    reachable: number | null;
    practice: { slug: string; name: string } | null;
    message: string | null;
}

const READY = `${STATE.readyToPlay}.`;

export function flushStatus(r: FlushReadiness): GameStatus {
    if (r.ready) {
        return {
            kind: "ready",
            text: r.eligible < r.full ? `Ready: a short game of ${r.eligible} puzzles.` : READY,
            counts: true
        };
    }

    return {
        kind: "needs",
        text: `Opens at ${r.needed} puzzles on ideas you’ve learned (${r.eligible} so far). Lessons on your Journey open more.`,
        counts: true
    };
}

export function bugHuntStatus(r: BugHuntReadiness): GameStatus {
    if (r.ready) {
        return {
            kind: "ready",
            text: r.eligible < r.full ? `Ready: a short run of ${r.eligible} bugs.` : READY,
            counts: true
        };
    }

    if (r.reason === "difficulty" && r.reachable !== null) {
        const harder = r.reachable - r.eligible;

        return {
            kind: "needs",
            text:
                `Opens at ${r.needed} bugs (${r.eligible} so far). ` +
                (harder === 1
                    ? "1 bug needs more practice on its idea first, in Code Blitz."
                    : `${harder} bugs need more practice on their ideas first, in Code Blitz.`),
            counts: true
        };
    }

    return {
        kind: "needs",
        text:
            `Opens at ${r.needed} bugs on ideas you’ve learned (${r.eligible} so far). ` +
            (r.practice ? `You can fix a bug now in ${r.practice.name}.` : "Lessons on your Journey open more."),
        counts: true
    };
}

/**
 * Every card's status. A game whose readiness has not loaded (or failed to)
 * gets null -- no line at all -- rather than a guess.
 */
export function gameStatuses(readiness: {
    flush: FlushReadiness | null;
    bugHunt: BugHuntReadiness | null;
}): Record<string, GameStatus | null> {
    return {
        [CODE_BLITZ]: { kind: "ready", text: READY, counts: true },
        [FLUSH]: readiness.flush ? flushStatus(readiness.flush) : null,
        [BUG_HUNT]: readiness.bugHunt ? bugHuntStatus(readiness.bugHunt) : null,
        [REACTION]: { kind: "ready", text: READY, counts: false },
        [MEMORY]: { kind: "ready", text: READY, counts: false }
    };
}
