import type { PoolClient } from "pg";
import { pool } from "../db.js";
import { FLUSH } from "../games/constants.js";
import { FLUSH_ROUNDS_PER_SESSION, scoreForSession } from "./scoring.js";

export interface FlushSessionRow {
    id: string;
    status: string;
    started_at: Date;
    completed_at: Date | null;
    abandoned_at: Date | null;
    score: number;
    xp_earned: number;
}

export interface FlushRoundRow {
    id: string;
    snippet_id: string;
    display_order: number;
    prompt_text: string;
    total_outputs: number;
    status: string;
    served_at: Date | null;
    ended_at: Date | null;
    correct_placements: number;
}

export interface OutputRow {
    id: string;
    output_text: string;
    position: number | null;
}

/**
 * A snippet is playable only if it has at least two real (non-distractor)
 * outputs whose positions are exactly 1..n with no gaps. A snippet missing
 * position 2 would be unplayable -- the sequence could never be completed --
 * so it must never be dealt into a session. Same spirit as the eligible-question
 * predicate for Code Blitz.
 */
export const ELIGIBLE_SNIPPET_PREDICATE = `
    s.is_active
    AND (
        SELECT COUNT(*) FROM flush_outputs o
        WHERE o.snippet_id = s.id AND o.is_active AND NOT o.is_distractor
    ) >= 2
    AND (
        SELECT COUNT(*) = MAX(o.position) FROM flush_outputs o
        WHERE o.snippet_id = s.id AND o.is_active AND NOT o.is_distractor
    )
`;

export async function countEligibleSnippets(): Promise<number> {
    const result = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM flush_snippets s WHERE ${ELIGIBLE_SNIPPET_PREDICATE}`
    );

    return Number(result.rows[0]!.count);
}

export async function findFlushSessionForUser(
    sessionId: string,
    userId: string
): Promise<FlushSessionRow | null> {
    const result = await pool.query<FlushSessionRow>(
        `SELECT gs.id, gs.status, gs.started_at, gs.completed_at, gs.abandoned_at,
                gs.score, gs.xp_earned
         FROM game_sessions gs
         JOIN games g ON g.id = gs.game_id
         WHERE gs.id = $1 AND gs.user_id = $2 AND g.slug = $3`,
        [sessionId, userId, FLUSH]
    );

    return result.rows[0] ?? null;
}

/**
 * Creates a Flush session and its five rounds atomically.
 *
 * Rounds are dealt in ascending difficulty, so a session ramps -- the thing that
 * distinguishes Flush's pacing from Code Blitz's flat random ten. Within a
 * difficulty tier the order is random, so replaying does not give the same five.
 *
 * A transaction is mandatory: pool.query() may hand out a different connection
 * per call, so BEGIN/COMMIT must run on one pinned client. Without it a crash
 * mid-loop would leave a session holding two of its five rounds.
 */
export async function createSessionWithRounds(userId: string): Promise<FlushSessionRow> {
    const client: PoolClient = await pool.connect();

    try {
        await client.query("BEGIN");

        // Same reason as Code Blitz: one resumable session per game is enforced by
        // game_sessions_one_resumable_per_game_idx, so any unfinished Flush game must end
        // or live Flush game must end before a new one is dealt. Inside the transaction,
        // cannot half-happen. The route decides; this only carries it out.
        await client.query(
            `UPDATE game_sessions
             SET status = 'abandoned',
                 abandoned_at = CURRENT_TIMESTAMP,
                 paused_at = NULL
             WHERE user_id = $1
               AND status IN ('in_progress', 'paused')
               AND game_id = (SELECT id FROM games WHERE slug = $2)`,
            [userId, FLUSH]
        );

        const session = await client.query<FlushSessionRow>(
            `INSERT INTO game_sessions (user_id, game_id)
             VALUES ($1, (SELECT id FROM games WHERE slug = $2))
             RETURNING id, status, started_at, completed_at, abandoned_at, score, xp_earned`,
            [userId, FLUSH]
        );

        const sessionId = session.rows[0]!.id;

        await client.query(
            `INSERT INTO flush_rounds
                 (game_session_id, snippet_id, display_order, prompt_text, total_outputs, status)
             SELECT $1,
                    picked.id,
                    ROW_NUMBER() OVER (ORDER BY picked.difficulty, picked.shuffle),
                    picked.prompt,
                    picked.total_outputs,
                    'pending'
             FROM (
                 SELECT s.id,
                        s.prompt,
                        s.difficulty,
                        RANDOM() AS shuffle,
                        (SELECT COUNT(*) FROM flush_outputs o
                         WHERE o.snippet_id = s.id AND o.is_active AND NOT o.is_distractor
                        ) AS total_outputs
                 FROM flush_snippets s
                 WHERE ${ELIGIBLE_SNIPPET_PREDICATE}
                 ORDER BY RANDOM()
                 LIMIT $2
             ) AS picked`,
            [sessionId, FLUSH_ROUNDS_PER_SESSION]
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

export async function listRounds(sessionId: string): Promise<FlushRoundRow[]> {
    const result = await pool.query<FlushRoundRow>(
        `SELECT id, snippet_id, display_order, prompt_text, total_outputs, status,
                served_at, ended_at, correct_placements
         FROM flush_rounds
         WHERE game_session_id = $1
         ORDER BY display_order`,
        [sessionId]
    );

    return result.rows;
}

export async function findNextPendingRound(sessionId: string): Promise<FlushRoundRow | null> {
    const result = await pool.query<FlushRoundRow>(
        `SELECT id, snippet_id, display_order, prompt_text, total_outputs, status,
                served_at, ended_at, correct_placements
         FROM flush_rounds
         WHERE game_session_id = $1 AND status = 'pending'
         ORDER BY display_order
         LIMIT 1`,
        [sessionId]
    );

    return result.rows[0] ?? null;
}

export async function findRound(
    roundId: string,
    sessionId: string
): Promise<FlushRoundRow | null> {
    const result = await pool.query<FlushRoundRow>(
        `SELECT id, snippet_id, display_order, prompt_text, total_outputs, status,
                served_at, ended_at, correct_placements
         FROM flush_rounds
         WHERE id = $1 AND game_session_id = $2`,
        [roundId, sessionId]
    );

    return result.rows[0] ?? null;
}

/** Stamps served_at once. Re-fetching a round must not restart its clock. */
export async function markServed(roundId: string): Promise<Date> {
    const updated = await pool.query<{ served_at: Date }>(
        `UPDATE flush_rounds SET served_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND served_at IS NULL
         RETURNING served_at`,
        [roundId]
    );

    if (updated.rows[0]) {
        return updated.rows[0].served_at;
    }

    const existing = await pool.query<{ served_at: Date }>(
        `SELECT served_at FROM flush_rounds WHERE id = $1`,
        [roundId]
    );

    return existing.rows[0]!.served_at;
}

/**
 * The tiles offered to the player: every active output including distractors,
 * with NO position. Position is the answer -- it must not cross the wire until
 * the round is over.
 */
export async function listTiles(snippetId: string): Promise<{ id: string; text: string }[]> {
    const result = await pool.query<{ id: string; output_text: string }>(
        `SELECT id, output_text FROM flush_outputs
         WHERE snippet_id = $1 AND is_active
         ORDER BY id`,
        [snippetId]
    );

    return result.rows.map((row) => ({ id: row.id, text: row.output_text }));
}

export async function findOutput(
    outputId: string,
    snippetId: string
): Promise<OutputRow | null> {
    const result = await pool.query<OutputRow>(
        `SELECT id, output_text, position FROM flush_outputs
         WHERE id = $1 AND snippet_id = $2 AND is_active`,
        [outputId, snippetId]
    );

    return result.rows[0] ?? null;
}

/** The full correct order. Only ever read once a round has ended. */
export async function correctSequence(snippetId: string): Promise<string[]> {
    const result = await pool.query<{ output_text: string }>(
        `SELECT output_text FROM flush_outputs
         WHERE snippet_id = $1 AND is_active AND NOT is_distractor
         ORDER BY position`,
        [snippetId]
    );

    return result.rows.map((row) => row.output_text);
}

export async function listPlacements(
    roundId: string
): Promise<{ output_id: string; output_text: string; placement_index: number }[]> {
    const result = await pool.query<{
        output_id: string;
        output_text: string;
        placement_index: number;
    }>(
        `SELECT output_id, output_text, placement_index
         FROM flush_round_placements
         WHERE round_id = $1
         ORDER BY placement_index`,
        [roundId]
    );

    return result.rows;
}

/**
 * Records one placement and updates the round, atomically.
 *
 * Both writes must land together: a placement without its correct_placements
 * increment would understate the score, and an increment without its placement
 * would leave the results screen unable to show what the player actually did.
 */
export async function recordPlacement(params: {
    roundId: string;
    snippetId: string;
    outputId: string;
    outputText: string;
    placementIndex: number;
    isCorrect: boolean;
    endsRound: boolean;
    completesRound: boolean;
}): Promise<void> {
    const client: PoolClient = await pool.connect();

    try {
        await client.query("BEGIN");

        await client.query(
            `INSERT INTO flush_round_placements
                 (round_id, snippet_id, output_id, placement_index, is_correct, output_text)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                params.roundId,
                params.snippetId,
                params.outputId,
                params.placementIndex,
                params.isCorrect,
                params.outputText
            ]
        );

        if (params.completesRound) {
            await client.query(
                `UPDATE flush_rounds
                 SET correct_placements = correct_placements + 1,
                     status = 'completed',
                     ended_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [params.roundId]
            );
        } else if (params.endsRound) {
            await client.query(
                `UPDATE flush_rounds
                 SET status = 'failed', ended_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [params.roundId]
            );
        } else {
            await client.query(
                `UPDATE flush_rounds
                 SET correct_placements = correct_placements + 1
                 WHERE id = $1`,
                [params.roundId]
            );
        }

        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}

export async function markRoundTimedOut(roundId: string): Promise<void> {
    await pool.query(
        `UPDATE flush_rounds
         SET status = 'timed_out', ended_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'pending'`,
        [roundId]
    );
}

export async function completeSession(
    sessionId: string,
    score: number,
    xpEarned: number
): Promise<FlushSessionRow> {
    const result = await pool.query<FlushSessionRow>(
        `UPDATE game_sessions
         SET status = 'completed', completed_at = CURRENT_TIMESTAMP, score = $2, xp_earned = $3
         WHERE id = $1
         RETURNING id, status, started_at, completed_at, abandoned_at, score, xp_earned`,
        [sessionId, score, xpEarned]
    );

    return result.rows[0]!;
}

/**
 * Points banked in this session so far, recomputed from the stored rounds.
 *
 * Like Code Blitz, nothing accumulates a running total, so pausing and resuming
 * cannot desynchronise the score from what the database actually holds.
 */
export async function scoreSoFar(sessionId: string): Promise<number> {
    const rounds = await listRounds(sessionId);

    return scoreForSession(
        rounds.map((r) => ({ correctPlacements: r.correct_placements, status: r.status }))
    );
}

/**
 * Pushes the live round's clock forward by the paused interval. See
 * shiftQuestionClock in game/queries.ts for the full reasoning -- the mechanism
 * is identical, only the table differs, which is the whole point of keeping one
 * timing column per game rather than a shared polymorphic one.
 *
 * Flush needs this even though it has no speed bonus: served_at still drives the
 * deadline and the expiry check, so an unshifted round would time out the instant
 * the player came back.
 */
export async function shiftRoundClock(client: PoolClient, sessionId: string): Promise<void> {
    await client.query(
        `UPDATE flush_rounds fr
         SET served_at = fr.served_at + (CURRENT_TIMESTAMP - gs.paused_at)
         FROM game_sessions gs
         WHERE gs.id = fr.game_session_id
           AND fr.game_session_id = $1
           AND gs.paused_at IS NOT NULL
           AND fr.status = 'pending'
           AND fr.served_at IS NOT NULL`,
        [sessionId]
    );
}
