import type { PoolClient } from "pg";
import { pool } from "../db.js";
import { MEMORY } from "../games/constants.js";
import { ROUND_CONFIG, scoreForSession } from "./scoring.js";
import { generateSequence } from "./symbols.js";

export interface MemorySessionRow {
    id: string;
    status: string;
    started_at: Date;
    completed_at: Date | null;
    abandoned_at: Date | null;
    score: number;
    xp_earned: number;
}

export interface MemoryRoundRow {
    id: string;
    display_order: number;
    sequence: string[];
    display_ms: number;
    status: string;
    served_at: Date | null;
    ended_at: Date | null;
    submitted: string[] | null;
    correct_positions: number | null;
}

const ROUND_COLUMNS = `id, display_order, sequence, display_ms, status, served_at,
                       ended_at, submitted, correct_positions`;
const SESSION_COLUMNS = `id, status, started_at, completed_at, abandoned_at, score, xp_earned`;

export async function findMemorySessionForUser(
    sessionId: string,
    userId: string
): Promise<MemorySessionRow | null> {
    const result = await pool.query<MemorySessionRow>(
        `SELECT gs.id, gs.status, gs.started_at, gs.completed_at, gs.abandoned_at,
                gs.score, gs.xp_earned
         FROM game_sessions gs
         JOIN games g ON g.id = gs.game_id
         WHERE gs.id = $1 AND gs.user_id = $2 AND g.slug = $3`,
        [sessionId, userId, MEMORY]
    );

    return result.rows[0] ?? null;
}

/**
 * Creates a Memory session and generates all five sequences atomically.
 *
 * Generated up front rather than per round, so a session is a complete, fixed
 * object the moment it exists -- the same property the other three games get from
 * dealing their content at creation. It also means a resumed run continues the
 * sequences it started with rather than inventing new ones.
 */
export async function createSessionWithRounds(userId: string): Promise<MemorySessionRow> {
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
            [userId, MEMORY]
        );

        const session = await client.query<MemorySessionRow>(
            `INSERT INTO game_sessions (user_id, game_id)
             VALUES ($1, (SELECT id FROM games WHERE slug = $2))
             RETURNING ${SESSION_COLUMNS}`,
            [userId, MEMORY]
        );

        const sessionId = session.rows[0]!.id;

        for (const config of ROUND_CONFIG) {
            await client.query(
                `INSERT INTO memory_rounds
                     (game_session_id, display_order, sequence, display_ms, status)
                 VALUES ($1, $2, $3, $4, 'pending')`,
                [sessionId, config.round, generateSequence(config.length), config.displayMs]
            );
        }

        await client.query("COMMIT");

        return session.rows[0]!;
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}

export async function listRounds(sessionId: string): Promise<MemoryRoundRow[]> {
    const result = await pool.query<MemoryRoundRow>(
        `SELECT ${ROUND_COLUMNS} FROM memory_rounds
         WHERE game_session_id = $1 ORDER BY display_order`,
        [sessionId]
    );

    return result.rows;
}

export async function findNextPendingRound(sessionId: string): Promise<MemoryRoundRow | null> {
    const result = await pool.query<MemoryRoundRow>(
        `SELECT ${ROUND_COLUMNS} FROM memory_rounds
         WHERE game_session_id = $1 AND status = 'pending'
         ORDER BY display_order LIMIT 1`,
        [sessionId]
    );

    return result.rows[0] ?? null;
}

export async function findRound(
    roundId: string,
    sessionId: string
): Promise<MemoryRoundRow | null> {
    const result = await pool.query<MemoryRoundRow>(
        `SELECT ${ROUND_COLUMNS} FROM memory_rounds WHERE id = $1 AND game_session_id = $2`,
        [roundId, sessionId]
    );

    return result.rows[0] ?? null;
}

/** Stamps served_at once. Re-serving must not rewrite when the round started. */
export async function markServed(roundId: string): Promise<void> {
    await pool.query(
        `UPDATE memory_rounds SET served_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND served_at IS NULL`,
        [roundId]
    );
}

/**
 * Records a playback.
 *
 * `status = 'pending'` is the duplicate-submission guard: a second attempt at the
 * same round updates nothing and the caller is told, rather than a first answer
 * being quietly replaced by a better-informed second one.
 */
export async function recordSubmission(
    roundId: string,
    submitted: string[],
    correct: number
): Promise<MemoryRoundRow | null> {
    const result = await pool.query<MemoryRoundRow>(
        `UPDATE memory_rounds
         SET status = 'answered',
             submitted = $2,
             correct_positions = $3,
             ended_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'pending'
         RETURNING ${ROUND_COLUMNS}`,
        [roundId, submitted, correct]
    );

    return result.rows[0] ?? null;
}

export async function completeSession(
    sessionId: string,
    score: number,
    xpEarned: number
): Promise<MemorySessionRow> {
    const result = await pool.query<MemorySessionRow>(
        `UPDATE game_sessions
         SET status = 'completed', completed_at = CURRENT_TIMESTAMP, score = $2, xp_earned = $3
         WHERE id = $1
         RETURNING ${SESSION_COLUMNS}`,
        [sessionId, score, xpEarned]
    );

    return result.rows[0]!;
}

function toScored(rounds: MemoryRoundRow[]) {
    return rounds.map((r) => ({
        status: r.status,
        length: r.sequence.length,
        correct: r.correct_positions ?? 0,
        perfect: r.correct_positions === r.sequence.length
    }));
}

export { toScored };

export async function scoreSoFar(sessionId: string): Promise<number> {
    return scoreForSession(toScored(await listRounds(sessionId)));
}

/**
 * Required by the session adapter, and deliberately a no-op.
 *
 * Memory holds no countdown between rounds: the display timer runs inside a
 * single round and a paused session is always paused between them, never
 * mid-flash. There is nothing to shift. See the same note in reaction/queries.ts.
 */
export async function shiftClock(_client: PoolClient, _sessionId: string): Promise<void> {
    return;
}
