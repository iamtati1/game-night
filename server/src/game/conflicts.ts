/**
 * Pure predicates over PostgreSQL error objects. Kept free of any database
 * import so it can be unit-tested directly.
 */

export const ACTIVE_SESSION_INDEX = "game_sessions_one_active_per_user_idx";

const UNIQUE_VIOLATION = "23505";

/**
 * True only for a duplicate rejected by the one-active-session-per-user index.
 *
 * Deliberately narrow: matching any 23505 would silently swallow unrelated
 * unique violations -- a duplicate session_questions row, for instance -- and
 * turn a real bug into a resumed game.
 */
export function isActiveSessionConflict(err: unknown): boolean {
    if (typeof err !== "object" || err === null) {
        return false;
    }

    const candidate = err as { code?: unknown; constraint?: unknown };

    return candidate.code === UNIQUE_VIOLATION && candidate.constraint === ACTIVE_SESSION_INDEX;
}

/**
 * What to tell the request that lost a create-session race.
 *
 * The one-active-session index is the arbiter: the loser's INSERT is rejected,
 * and by the time it reads the table again the slot may be held by a different
 * game, by its own game, or by nobody at all. Each of those has a sensible
 * answer and NONE of them is a server error -- which is what the loser used to
 * get, because the route rethrew the rejected INSERT whenever the winner was not
 * its own game.
 *
 * Pure and separate from the route so the three outcomes can be tested without a
 * database, which is the whole reason this file has no database import.
 */
export type SessionRaceOutcome = "resume" | "conflict" | "retry";

export function resolveSessionRace(
    winner: { gameSlug: string } | null,
    wantedGame: string
): SessionRaceOutcome {
    // Nothing holds the slot any more: whatever won it finished, paused or was
    // quit between the rejected INSERT and this read. Nothing to resume and
    // nobody to name, but trying again will now succeed.
    if (!winner) {
        return "retry";
    }

    // Our own game won -- the ordinary double-submit. Resuming the winner is the
    // correct outcome, not merely a tolerable one.
    // Another game won: exactly what the check at the top of the route answers
    // with a conflict. Arriving a few milliseconds later does not change it.
    return winner.gameSlug === wantedGame ? "resume" : "conflict";
}
