import type { PoolClient } from "pg";
import { pool } from "../db.js";
import { isActiveSessionConflict } from "../game/conflicts.js";
import { adapterFor } from "./adapters.js";

/**
 * Platform-level session lifecycle.
 *
 *     in_progress ──pause──> paused ──resume──> in_progress
 *          │                    │
 *          ├──complete──> completed
 *          └──abandon───> abandoned <──abandon──┘
 *
 * Everything here operates on (user_id, game_slug) rather than on a session id
 * supplied by the caller. Nothing in a request identifies a row that could belong
 * to somebody else, so there is no ownership check to get wrong and no IDOR
 * surface to audit.
 *
 * Naming the game is not redundant on pause even though a user has at most one
 * in-progress session: it stops a stale tab left open for an hour from pausing
 * whichever game the player has started since.
 *
 * There is deliberately no automatic abandonment anywhere in this file. abandoned
 * is written by exactly one thing -- a player explicitly choosing to quit.
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
 *
 * Paused sessions are invisible here, and that is the point -- the index's
 * predicate is `WHERE status = 'in_progress'`, so a paused row leaves it without
 * any change to the index, and stops blocking other games for free.
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

export interface ResumableSession {
    id: string;
    gameSlug: string;
    gameName: string;
    status: "in_progress" | "paused";
    startedAt: Date;
    pausedAt: Date | null;
    pauseCount: number;
}

interface ResumableRow {
    id: string;
    game_slug: string;
    game_name: string;
    status: "in_progress" | "paused";
    started_at: Date;
    paused_at: Date | null;
    pause_count: number;
}

function toResumable(row: ResumableRow): ResumableSession {
    return {
        id: row.id,
        gameSlug: row.game_slug,
        gameName: row.game_name,
        status: row.status,
        startedAt: row.started_at,
        pausedAt: row.paused_at,
        pauseCount: row.pause_count
    };
}

/**
 * This player's unfinished session for one game, live or paused.
 *
 * game_sessions_one_resumable_per_game_idx guarantees there is at most one, so
 * this returns a single row rather than a list. A start route uses it to decide
 * between resuming, offering a choice, and dealing a fresh game.
 */
export async function findResumableSession(
    userId: string,
    gameSlug: string
): Promise<ResumableSession | null> {
    const result = await pool.query<ResumableRow>(
        `SELECT gs.id, g.slug AS game_slug, g.name AS game_name, gs.status,
                gs.started_at, gs.paused_at, gs.pause_count
         FROM game_sessions gs
         JOIN games g ON g.id = gs.game_id
         WHERE gs.user_id = $1
           AND g.slug = $2
           AND gs.status IN ('in_progress', 'paused')`,
        [userId, gameSlug]
    );

    const row = result.rows[0];

    return row ? toResumable(row) : null;
}

export interface ResumableSummary extends ResumableSession {
    /** Units already resolved -- answered, timed out, completed or failed. */
    unitsDone: number;
    /** Units in the session's plan. */
    unitsTotal: number;
    /** Points banked so far, recomputed from stored units. */
    score: number;
}

interface ResumableSummaryRow extends ResumableRow {
    units_done: string;
    units_total: string;
}

/**
 * Everything the player currently has open, newest activity first.
 *
 * The unit counts come from a UNION ALL across both games' round tables rather
 * than a join: session_questions and flush_rounds have the same grain but are
 * different relations, and a session appears in exactly one of them. Adding
 * game #3 means adding a branch here -- the alternative, a shared polymorphic
 * round table, would have cost every database-enforced invariant those two
 * tables carry.
 *
 * Scores are then filled in per session through the game adapters, because a
 * partial score is a game-specific derivation (Code Blitz sums a decaying speed
 * bonus; Flush sums escalating placements and a completion multiplier) and cannot
 * be expressed once in SQL. That is one extra query per open session, bounded by
 * game_sessions_one_resumable_per_game_idx at one per game -- currently at most
 * two, not an unbounded N+1.
 */
export async function listResumableSessions(userId: string): Promise<ResumableSummary[]> {
    const result = await pool.query<ResumableSummaryRow>(
        `WITH resumable AS (
             SELECT gs.id, gs.game_id, gs.status, gs.started_at, gs.paused_at, gs.pause_count
             FROM game_sessions gs
             WHERE gs.user_id = $1 AND gs.status IN ('in_progress', 'paused')
         ),
         units AS (
             SELECT sq.game_session_id,
                    COUNT(*)                                        AS total,
                    COUNT(*) FILTER (WHERE sq.status <> 'pending')  AS done
             FROM session_questions sq
             WHERE sq.game_session_id IN (SELECT id FROM resumable)
             GROUP BY sq.game_session_id

             UNION ALL

             SELECT fr.game_session_id,
                    COUNT(*)                                        AS total,
                    COUNT(*) FILTER (WHERE fr.status <> 'pending')  AS done
             FROM flush_rounds fr
             WHERE fr.game_session_id IN (SELECT id FROM resumable)
             GROUP BY fr.game_session_id
         )
         SELECT r.id,
                g.slug  AS game_slug,
                g.name  AS game_name,
                r.status,
                r.started_at,
                r.paused_at,
                r.pause_count,
                COALESCE(u.done, 0)  AS units_done,
                COALESCE(u.total, 0) AS units_total
         FROM resumable r
         JOIN games g ON g.id = r.game_id
         LEFT JOIN units u ON u.game_session_id = r.id
         ORDER BY COALESCE(r.paused_at, r.started_at) DESC`,
        [userId]
    );

    return Promise.all(
        result.rows.map(async (row) => {
            const adapter = adapterFor(row.game_slug);

            return {
                ...toResumable(row),
                unitsDone: Number(row.units_done),
                unitsTotal: Number(row.units_total),
                // A game with no adapter is a programming error, not a runtime
                // one: report 0 rather than crashing the whole list.
                score: adapter ? await adapter.scoreSoFar(row.id) : 0
            };
        })
    );
}

export interface PausedSession {
    id: string;
    gameSlug: string;
    gameName: string;
    pauseCount: number;
}

/**
 * Pauses the caller's live session for one game.
 *
 * RETURNING is what makes the answer honest: no row means there was nothing
 * in progress for that game, which is reported rather than guessed. A second
 * click, a stale button and a double-submit are therefore all no-ops.
 *
 * Nothing is settled or adjudicated first. A unit already past its deadline when
 * the player pauses stays past it by exactly the same margin once resumed -- see
 * shiftQuestionClock -- so a "settle before pausing" step would change no
 * outcome while adding a second write to get wrong.
 */
export async function pauseActiveSession(
    userId: string,
    gameSlug: string
): Promise<PausedSession | null> {
    const result = await pool.query<{
        id: string;
        game_slug: string;
        game_name: string;
        pause_count: number;
    }>(
        `WITH paused AS (
             UPDATE game_sessions gs
             SET status = 'paused',
                 paused_at = CURRENT_TIMESTAMP,
                 pause_count = gs.pause_count + 1
             WHERE gs.user_id = $1
               AND gs.status = 'in_progress'
               AND gs.game_id = (SELECT id FROM games WHERE slug = $2)
             RETURNING gs.id, gs.game_id, gs.pause_count
         )
         SELECT p.id, g.slug AS game_slug, g.name AS game_name, p.pause_count
         FROM paused p
         JOIN games g ON g.id = p.game_id`,
        [userId, gameSlug]
    );

    const row = result.rows[0];

    return row
        ? {
              id: row.id,
              gameSlug: row.game_slug,
              gameName: row.game_name,
              pauseCount: row.pause_count
          }
        : null;
}

export type ResumeResult =
    | { outcome: "resumed"; session: ResumableSession }
    /** Nothing was paused for that game. */
    | { outcome: "none" }
    /** Another game holds the one in-progress slot. */
    | { outcome: "blocked" };

/**
 * Resumes the caller's paused session for one game.
 *
 * A transaction is mandatory: the clock shift and the status flip have to land
 * together. Shifting without flipping would give away free time on a session that
 * is still paused; flipping without shifting would hand the player a session
 * whose live unit expired while they were away.
 *
 * Order matters within it -- shiftClock reads gs.paused_at, so it must run before
 * paused_at is cleared.
 *
 * SELECT ... FOR UPDATE locks the session row, so two concurrent resumes of the
 * same session serialise instead of both shifting the clock. The second finds it
 * no longer 'paused' and reports "none".
 */
export async function resumePausedSession(
    userId: string,
    gameSlug: string
): Promise<ResumeResult> {
    const client: PoolClient = await pool.connect();

    try {
        await client.query("BEGIN");

        const found = await client.query<ResumableRow>(
            `SELECT gs.id, g.slug AS game_slug, g.name AS game_name, gs.status,
                    gs.started_at, gs.paused_at, gs.pause_count
             FROM game_sessions gs
             JOIN games g ON g.id = gs.game_id
             WHERE gs.user_id = $1 AND g.slug = $2 AND gs.status = 'paused'
             FOR UPDATE OF gs`,
            [userId, gameSlug]
        );

        const row = found.rows[0];

        if (!row) {
            await client.query("ROLLBACK");
            return { outcome: "none" };
        }

        const adapter = adapterFor(gameSlug);

        if (!adapter) {
            // Resuming without shifting the clock would look like it worked and
            // then time the player out instantly. Refuse loudly instead.
            await client.query("ROLLBACK");
            throw new Error(`No session adapter registered for game "${gameSlug}"`);
        }

        await adapter.shiftClock(client, row.id);

        const resumed = await client.query<ResumableRow>(
            `UPDATE game_sessions
             SET status = 'in_progress',
                 total_paused_ms = total_paused_ms
                     + GREATEST(0, (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - paused_at)) * 1000)::BIGINT),
                 paused_at = NULL
             WHERE id = $1
             RETURNING id, status, started_at, paused_at, pause_count`,
            [row.id]
        );

        await client.query("COMMIT");

        return {
            outcome: "resumed",
            session: toResumable({
                ...row,
                status: "in_progress",
                paused_at: null,
                pause_count: resumed.rows[0]!.pause_count
            })
        };
    } catch (err) {
        await client.query("ROLLBACK");

        // The flip to in_progress can lose game_sessions_one_active_per_user_idx
        // if another game went live between the caller's check and this write.
        // That is a legitimate outcome the player can act on, not a 500.
        if (isActiveSessionConflict(err)) {
            return { outcome: "blocked" };
        }

        throw err;
    } finally {
        client.release();
    }
}

export interface AbandonedSession {
    id: string;
    gameSlug: string;
    gameName: string;
    /** The status it was abandoned from, so the caller can word the result. */
    previousStatus: "in_progress" | "paused";
}

/**
 * Permanently quits the caller's unfinished session for one game, live or paused.
 *
 * The session stays in history with its real score -- never a fabricated
 * completed score -- and counts toward gamesAbandoned. It is the only path in the
 * codebase that writes abandoned_at.
 *
 * paused_at is cleared in the same statement, because the timestamp matrix
 * requires abandoned rows to carry abandoned_at and nothing else.
 */
export async function abandonResumableSession(
    userId: string,
    gameSlug: string
): Promise<AbandonedSession | null> {
    const result = await pool.query<{
        id: string;
        game_slug: string;
        game_name: string;
        previous_status: "in_progress" | "paused";
    }>(
        // Two CTEs rather than one: RETURNING exposes the NEW row, so the status
         // being replaced has to be read before the UPDATE. Both CTEs share the
         // statement's snapshot, so `target` sees the pre-update value.
         //
         // PostgreSQL 18 does offer RETURNING OLD.status, which would collapse this
         // to a single CTE, and the local database is 18.3. It is deliberately not
         // used: nothing else in this codebase requires 18, and buying one less CTE
         // with a hard floor on the server version is a bad trade. Reading the value
         // back with a subquery inside RETURNING would be shorter still, but leans on
         // snapshot subtleties rather than stating the intent.
         `WITH target AS (
             SELECT gs.id, gs.game_id, gs.status AS previous_status
             FROM game_sessions gs
             WHERE gs.user_id = $1
               AND gs.status IN ('in_progress', 'paused')
               AND gs.game_id = (SELECT id FROM games WHERE slug = $2)
         ),
         abandoned AS (
             UPDATE game_sessions gs
             SET status = 'abandoned',
                 abandoned_at = CURRENT_TIMESTAMP,
                 paused_at = NULL
             WHERE gs.id IN (SELECT id FROM target)
             RETURNING gs.id
         )
         SELECT a.id, g.slug AS game_slug, g.name AS game_name, t.previous_status
         FROM abandoned a
         JOIN target t ON t.id = a.id
         JOIN games g ON g.id = t.game_id`,
        [userId, gameSlug]
    );

    const row = result.rows[0];

    return row
        ? {
              id: row.id,
              gameSlug: row.game_slug,
              gameName: row.game_name,
              previousStatus: row.previous_status
          }
        : null;
}
