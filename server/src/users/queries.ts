import { pool } from "../db.js";
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
