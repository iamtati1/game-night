import { pool } from "../db.js";
import {
    toHistoryPage,
    totalFromRows,
    type HistoryPage,
    type HistorySessionRow
} from "./history.js";
import { toUserStats, type UserStats, type UserStatsRow } from "./stats.js";

/**
 * Two CTEs rather than one join, deliberately.
 *
 * Joining game_sessions to session_questions fans out: one session with ten
 * questions becomes ten rows, so COUNT(*) FILTER (WHERE status = 'completed')
 * would report ten games where the player played one. Two different grains
 * therefore get two separate aggregations, cross-joined as single rows.
 *
 * COALESCE guards the SUMs but not MAX/AVG on purpose: total XP for a new
 * player genuinely is 0, but their best and average score are genuinely unknown.
 *
 * FILTER (WHERE sq.is_correct) relies on three-valued logic -- NULL is not TRUE,
 * so timed-out questions fall out of both the correct and incorrect counts
 * without an explicit exclusion.
 */
export async function getUserStats(userId: string): Promise<UserStats> {
    const result = await pool.query<UserStatsRow>(
        `WITH session_stats AS (
             SELECT
                 COUNT(*) FILTER (WHERE status = 'completed')                     AS games_completed,
                 COUNT(*) FILTER (WHERE status = 'abandoned')                     AS games_abandoned,
                 COUNT(*) FILTER (WHERE status = 'in_progress')                   AS games_in_progress,
                 COALESCE(SUM(xp_earned) FILTER (WHERE status = 'completed'), 0)  AS total_xp,
                 COALESCE(SUM(score)     FILTER (WHERE status = 'completed'), 0)  AS total_score,
                 MAX(score)              FILTER (WHERE status = 'completed')      AS best_score,
                 AVG(score)              FILTER (WHERE status = 'completed')      AS average_score
             FROM game_sessions
             WHERE user_id = $1
         ),
         answer_stats AS (
             SELECT
                 COUNT(*)                                        AS total_questions,
                 COUNT(*) FILTER (WHERE sq.status = 'answered')  AS questions_answered,
                 COUNT(*) FILTER (WHERE sq.is_correct)           AS correct_answers,
                 COUNT(*) FILTER (WHERE sq.is_correct = FALSE)   AS incorrect_answers,
                 COUNT(*) FILTER (WHERE sq.status = 'timed_out') AS timed_out_questions
             FROM session_questions sq
             JOIN game_sessions gs ON gs.id = sq.game_session_id
             WHERE gs.user_id = $1 AND gs.status = 'completed'
         )
         SELECT * FROM session_stats, answer_stats`,
        [userId]
    );

    return toUserStats(result.rows[0]!);
}

/**
 * One page of a player's games, newest first.
 *
 * Paginate first, aggregate second. If the per-question counts were joined
 * before the LIMIT, the aggregate would run for every session the player has
 * ever played in order to return ten rows. The CTE narrows to the page, then
 * LEFT JOIN LATERAL executes exactly `limit` times.
 *
 * ORDER BY started_at DESC, id DESC is a *total* order -- id is unique, so no
 * two rows can tie. Without the id, two sessions sharing a started_at could
 * appear on both page 1 and page 2, or on neither.
 *
 * LEFT (not INNER) so a session with no question rows still appears; COALESCE
 * turns its missing counts into zeros.
 */
export async function listUserSessions(
    userId: string,
    limit: number,
    offset: number
): Promise<HistoryPage> {
    const result = await pool.query<HistorySessionRow>(
        `WITH page AS (
             SELECT id,
                    status,
                    score,
                    xp_earned,
                    started_at,
                    COALESCE(completed_at, abandoned_at) AS ended_at,
                    COUNT(*) OVER ()                     AS total_rows
             FROM game_sessions
             WHERE user_id = $1
             ORDER BY started_at DESC, id DESC
             LIMIT $2 OFFSET $3
         )
         SELECT p.*,
                COALESCE(q.total, 0)     AS total_questions,
                COALESCE(q.correct, 0)   AS correct_count,
                COALESCE(q.incorrect, 0) AS incorrect_count,
                COALESCE(q.timed_out, 0) AS timed_out_count
         FROM page p
         LEFT JOIN LATERAL (
             SELECT COUNT(*)                                     AS total,
                    COUNT(*) FILTER (WHERE is_correct)           AS correct,
                    COUNT(*) FILTER (WHERE is_correct = FALSE)   AS incorrect,
                    COUNT(*) FILTER (WHERE status = 'timed_out') AS timed_out
             FROM session_questions
             WHERE game_session_id = p.id
         ) q ON TRUE
         ORDER BY p.started_at DESC, p.id DESC`,
        [userId, limit, offset]
    );

    // COUNT(*) OVER () yields nothing when the page is empty, which happens for
    // a player with no games and for an offset past the end. Those two cases
    // need different UI, so the count is fetched separately rather than assumed.
    const total = totalFromRows(result.rows) ?? (await countUserSessions(userId));

    return toHistoryPage(result.rows, limit, offset, total);
}

async function countUserSessions(userId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM game_sessions WHERE user_id = $1`,
        [userId]
    );

    return Number(result.rows[0]!.count);
}
