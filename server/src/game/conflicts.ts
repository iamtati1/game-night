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
