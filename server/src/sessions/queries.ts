import { pool } from "../db.js";

/**
 * Platform-level session queries. Abandoning a session touches game_sessions
 * only -- no round table, no scoring -- so it is genuinely game-agnostic and
 * lives here rather than in either game's module.
 *
 * This also replaces the identical abandonSession that previously existed in
 * both game/queries.ts and flush/queries.ts.
 */

export interface ActiveSession {
    id: string;
    gameSlug: string;
    gameName: string;
    startedAt: Date;
}

interface ActiveSessionRow {
    id: string;
    game_slug: string;
    game_name: string;
    started_at: Date;
}

/**
 * The caller's one in-progress session, whichever game it belongs to.
 *
 * The game is part of the answer, not an afterthought: game_sessions_one_active_
 * per_user_idx is scoped to the user rather than to (user, game), so a start
 * endpoint has to know whether the live session is even its own game. Looking it
 * up without the game is how a Flush session got silently completed by Code
 * Blitz's resume path.
 */
export async function findActiveSession(userId: string): Promise<ActiveSession | null> {
    const result = await pool.query<ActiveSessionRow>(
        `SELECT gs.id, g.slug AS game_slug, g.name AS game_name, gs.started_at
         FROM game_sessions gs
         JOIN games g ON g.id = gs.game_id
         WHERE gs.user_id = $1 AND gs.status = 'in_progress'`,
        [userId]
    );

    const row = result.rows[0];

    return row
        ? {
              id: row.id,
              gameSlug: row.game_slug,
              gameName: row.game_name,
              startedAt: row.started_at
          }
        : null;
}

/** Abandons a specific session. Used by the 15-minute lazy sweep in both games. */
export async function abandonSession(sessionId: string): Promise<void> {
    await pool.query(
        `UPDATE game_sessions
         SET status = 'abandoned', abandoned_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'in_progress'`,
        [sessionId]
    );
}

export interface AbandonedSession {
    id: string;
    gameSlug: string;
    gameName: string;
}

/**
 * Abandons whatever the caller currently has running.
 *
 * Scoped by user_id rather than by a session id from the URL: there is nothing to
 * tamper with, so no ownership check can be got wrong. `status = 'in_progress'`
 * means a completed session can never be caught by this, and RETURNING is what
 * makes the result honest -- an empty result means there was nothing to abandon,
 * which is reported rather than guessed. That makes a second click a no-op.
 *
 * Setting status = 'abandoned' also drops the row out of the partial unique
 * index's predicate, so the one-active-session slot is freed by this same
 * statement -- no separate cleanup.
 */
export async function abandonActiveSession(userId: string): Promise<AbandonedSession | null> {
    const result = await pool.query<{ id: string; game_slug: string; game_name: string }>(
        `WITH abandoned AS (
             UPDATE game_sessions
             SET status = 'abandoned', abandoned_at = CURRENT_TIMESTAMP
             WHERE user_id = $1 AND status = 'in_progress'
             RETURNING id, game_id
         )
         SELECT a.id, g.slug AS game_slug, g.name AS game_name
         FROM abandoned a
         JOIN games g ON g.id = a.game_id`,
        [userId]
    );

    const row = result.rows[0];

    return row ? { id: row.id, gameSlug: row.game_slug, gameName: row.game_name } : null;
}
