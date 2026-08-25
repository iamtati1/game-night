import type { PoolClient } from "pg";
import { pool } from "../db.js";
import { REACTION } from "../games/constants.js";
import { REACTION_ROUNDS_PER_SESSION, scoreForSession } from "./scoring.js";

export interface ReactionSessionRow {
    id: string;
    status: string;
    started_at: Date;
    completed_at: Date | null;
    abandoned_at: Date | null;
    score: number;
    xp_earned: number;
}

export interface ReactionRoundRow {
    id: string;
    display_order: number;
    status: string;
    served_at: Date | null;
    ended_at: Date | null;
    reaction_ms: number | null;
}

const ROUND_COLUMNS = `id, display_order, status, served_at, ended_at, reaction_ms`;
const SESSION_COLUMNS = `id, status, started_at, completed_at, abandoned_at, score, xp_earned`;

export async function findReactionSessionForUser(
    sessionId: string,
    userId: string
): Promise<ReactionSessionRow | null> {
    const result = await pool.query<ReactionSessionRow>(
        `SELECT gs.id, gs.status, gs.started_at, gs.completed_at, gs.abandoned_at,
                gs.score, gs.xp_earned
         FROM game_sessions gs
         JOIN games g ON g.id = gs.game_id
         WHERE gs.id = $1 AND gs.user_id = $2 AND g.slug = $3`,
        [sessionId, userId, REACTION]
    );

    return result.rows[0] ?? null;
}

/**
 * Creates a Reaction session and its five rounds atomically.
 *
 * No content to deal: a round is an empty slot until the player reacts in it,
 * because the challenge is generated in the moment rather than authored. That is
 * the property that makes this game infinitely replayable where Code Blitz and
 * Flush depend on a bank.
 *
 * Clears any unfinished Reaction session first, for the same reason the other two
 * games do: game_sessions_one_resumable_per_game_idx permits one, and the route
 * has already decided nothing is being resumed.
 */
export async function createSessionWithRounds(userId: string): Promise<ReactionSessionRow> {
    const client: PoolClient = await pool.connect();

    try {
        await client.query("BEGIN");

        await client.query(
            `UPDATE game_sessions
             SET status = 'abandoned',
                 abandoned_at = CURRENT_TIMESTAMP,
                 paused_at = NULL
             WHERE user_id = $1
               AND status IN ('in_progress', 'paused')
               AND game_id = (SELECT id FROM games WHERE slug = $2)`,
            [userId, REACTION]
        );

        const session = await client.query<ReactionSessionRow>(
            `INSERT INTO game_sessions (user_id, game_id)
             VALUES ($1, (SELECT id FROM games WHERE slug = $2))
             RETURNING ${SESSION_COLUMNS}`,
            [userId, REACTION]
        );

        const sessionId = session.rows[0]!.id;

        await client.query(
            `INSERT INTO reaction_rounds (game_session_id, display_order, status)
             SELECT $1, n, 'pending'
             FROM generate_series(1, $2) AS n`,
            [sessionId, REACTION_ROUNDS_PER_SESSION]
        );

        await client.query("COMMIT");

        return session.rows[0]!;
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}

export async function listRounds(sessionId: string): Promise<ReactionRoundRow[]> {
    const result = await pool.query<ReactionRoundRow>(
        `SELECT ${ROUND_COLUMNS} FROM reaction_rounds
         WHERE game_session_id = $1 ORDER BY display_order`,
        [sessionId]
    );

    return result.rows;
}

export async function findNextPendingRound(
    sessionId: string
): Promise<ReactionRoundRow | null> {
    const result = await pool.query<ReactionRoundRow>(
        `SELECT ${ROUND_COLUMNS} FROM reaction_rounds
         WHERE game_session_id = $1 AND status = 'pending'
         ORDER BY display_order LIMIT 1`,
        [sessionId]
    );

    return result.rows[0] ?? null;
}

export async function findRound(
    roundId: string,
    sessionId: string
): Promise<ReactionRoundRow | null> {
    const result = await pool.query<ReactionRoundRow>(
        `SELECT ${ROUND_COLUMNS} FROM reaction_rounds
         WHERE id = $1 AND game_session_id = $2`,
        [roundId, sessionId]
    );

    return result.rows[0] ?? null;
}

/** Stamps served_at once. Re-serving a round must not rewrite when it started. */
export async function markServed(roundId: string): Promise<Date> {
    const updated = await pool.query<{ served_at: Date }>(
        `UPDATE reaction_rounds SET served_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND served_at IS NULL
         RETURNING served_at`,
        [roundId]
    );

    if (updated.rows[0]) {
        return updated.rows[0].served_at;
    }

    const existing = await pool.query<{ served_at: Date }>(
        `SELECT served_at FROM reaction_rounds WHERE id = $1`,
        [roundId]
    );

    return existing.rows[0]!.served_at;
}

/**
 * Records a reaction, but only against a round still pending.
 *
 * The `status = 'pending'` predicate is the duplicate-submission guard: a second
 * submission for the same round updates nothing and the caller sees it, rather
 * than the first result being silently overwritten by a slower retry.
 */
export async function recordReaction(
    roundId: string,
    reactionMs: number
): Promise<ReactionRoundRow | null> {
    const result = await pool.query<ReactionRoundRow>(
        `UPDATE reaction_rounds
         SET status = 'reacted', reaction_ms = $2, ended_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'pending'
         RETURNING ${ROUND_COLUMNS}`,
        [roundId, reactionMs]
    );

    return result.rows[0] ?? null;
}

export async function recordFalseStart(roundId: string): Promise<ReactionRoundRow | null> {
    const result = await pool.query<ReactionRoundRow>(
        `UPDATE reaction_rounds
         SET status = 'false_start', ended_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'pending'
         RETURNING ${ROUND_COLUMNS}`,
        [roundId]
    );

    return result.rows[0] ?? null;
}

export async function completeSession(
    sessionId: string,
    score: number,
    xpEarned: number
): Promise<ReactionSessionRow> {
    const result = await pool.query<ReactionSessionRow>(
        `UPDATE game_sessions
         SET status = 'completed', completed_at = CURRENT_TIMESTAMP, score = $2, xp_earned = $3
         WHERE id = $1
         RETURNING ${SESSION_COLUMNS}`,
        [sessionId, score, xpEarned]
    );

    return result.rows[0]!;
}

/** Points banked so far, recomputed from stored rounds. */
export async function scoreSoFar(sessionId: string): Promise<number> {
    const rounds = await listRounds(sessionId);

    return scoreForSession(
        rounds.map((r) => ({ status: r.status, reactionMs: r.reaction_ms }))
    );
}

/**
 * Required by the session adapter, and deliberately a no-op.
 *
 * The other two games hold a countdown per unit, so resuming has to push
 * served_at forward or the player returns to an expired clock. Reaction has no
 * countdown: a round waits indefinitely for a signal the client fires. There is
 * nothing to shift, and inventing a clock so the adapter looked symmetrical would
 * add a rule the game does not have.
 */
export async function shiftClock(_client: PoolClient, _sessionId: string): Promise<void> {
    return;
}
