import { pool } from "../db.js";
import {
    toHistoryPage,
    totalFromRows,
    type HistoryPage,
    type HistorySessionRow
} from "./history.js";
import { toGameProgress, type UnitRow } from "./progress.js";
import {
    toUserStats,
    type GameStatsRow,
    type StatTotalsRow,
    type UserStats
} from "./stats.js";

/**
 * Player statistics, in two parts.
 *
 * Two queries rather than one because they have different cardinalities: totals
 * is a single row, perGame is one row per game. Forcing them together would mean
 * cross-joining the totals onto every game row and reading them from row zero --
 * more clever than clear, for no measurable gain at this size.
 *
 * Cross-game totals carry XP and session counts. bestScore, averageScore and
 * accuracy are per-game only: Code Blitz awards a speed bonus while Flush awards
 * escalating placements and a completion multiplier, so a best score spanning
 * both would compare two different scales.
 */
export async function getUserStats(userId: string): Promise<UserStats> {
    const totals = await pool.query<StatTotalsRow>(
        `SELECT
             COUNT(*) FILTER (WHERE status = 'completed')                     AS games_completed,
             COUNT(*) FILTER (WHERE status = 'abandoned')                     AS games_abandoned,
             COUNT(*) FILTER (WHERE status = 'in_progress')                   AS games_in_progress,
             COALESCE(SUM(xp_earned) FILTER (WHERE status = 'completed'), 0)  AS total_xp,
             COALESCE(SUM(score)     FILTER (WHERE status = 'completed'), 0)  AS total_score
         FROM game_sessions
         WHERE user_id = $1`,
        [userId]
    );

    /*
     * unit_stats aggregates session_questions -- Code Blitz's round table --
     * grouped by game. Joining it directly to the session aggregate would fan
     * out: one session with ten questions becomes ten rows, and the session
     * counts would be multiplied by the question counts. Separate grains,
     * separate aggregations, joined afterwards on game_id.
     *
     * When Flush lands, its rounds get a sibling CTE and the two are UNIONed.
     * The output shape does not change.
     */
    const perGame = await pool.query<GameStatsRow>(
        `WITH session_stats AS (
             SELECT gs.game_id,
                    COUNT(*) FILTER (WHERE gs.status = 'completed')                     AS games_completed,
                    COUNT(*) FILTER (WHERE gs.status = 'abandoned')                     AS games_abandoned,
                    COALESCE(SUM(gs.xp_earned) FILTER (WHERE gs.status = 'completed'), 0) AS total_xp,
                    COALESCE(SUM(gs.score)     FILTER (WHERE gs.status = 'completed'), 0) AS total_score,
                    MAX(gs.score)              FILTER (WHERE gs.status = 'completed')     AS best_score,
                    AVG(gs.score)              FILTER (WHERE gs.status = 'completed')     AS average_score
             FROM game_sessions gs
             WHERE gs.user_id = $1
             GROUP BY gs.game_id
         ),
         /*
          * Every game's units, mapped onto one vocabulary so this aggregate does
          * not need to know which game it is looking at. A win is a right answer,
          * a flushed round or a landed reaction; a lapse is running out of time,
          * which Reaction has no equivalent of.
          *
          * Adding game #4 is a fourth branch here and nothing else.
          */
         units AS (
             SELECT gs.game_id,
                    CASE
                        WHEN sq.is_correct THEN 'win'
                        WHEN sq.status = 'timed_out' THEN 'lapse'
                        WHEN sq.status = 'pending' THEN 'pending'
                        ELSE 'loss'
                    END AS outcome
             FROM session_questions sq
             JOIN game_sessions gs ON gs.id = sq.game_session_id
             WHERE gs.user_id = $1 AND gs.status = 'completed'

             UNION ALL

             SELECT gs.game_id,
                    CASE fr.status
                        WHEN 'completed' THEN 'win'
                        WHEN 'timed_out' THEN 'lapse'
                        WHEN 'failed' THEN 'loss'
                        ELSE 'pending'
                    END
             FROM flush_rounds fr
             JOIN game_sessions gs ON gs.id = fr.game_session_id
             WHERE gs.user_id = $1 AND gs.status = 'completed'

             UNION ALL

             SELECT gs.game_id,
                    CASE rr.status
                        WHEN 'reacted' THEN 'win'
                        WHEN 'false_start' THEN 'loss'
                        ELSE 'pending'
                    END
             FROM reaction_rounds rr
             JOIN game_sessions gs ON gs.id = rr.game_session_id
             WHERE gs.user_id = $1 AND gs.status = 'completed'

             UNION ALL

             SELECT gs.game_id,
                    CASE
                        WHEN mr.status <> 'answered' THEN 'pending'
                        WHEN mr.correct_positions = array_length(mr.sequence, 1) THEN 'win'
                        ELSE 'loss'
                    END
             FROM memory_rounds mr
             JOIN game_sessions gs ON gs.id = mr.game_session_id
             WHERE gs.user_id = $1 AND gs.status = 'completed'
         ),
         unit_stats AS (
             SELECT u.game_id,
                    COUNT(*)                                   AS total_units,
                    COUNT(*) FILTER (WHERE u.outcome = 'win')   AS correct_count,
                    COUNT(*) FILTER (WHERE u.outcome = 'loss')  AS incorrect_count,
                    COUNT(*) FILTER (WHERE u.outcome = 'lapse') AS timed_out_count
             FROM units u
             GROUP BY u.game_id
         )
         SELECT g.slug                     AS game_slug,
                g.name                     AS game_name,
                s.games_completed,
                s.games_abandoned,
                s.total_xp,
                s.total_score,
                s.best_score,
                s.average_score,
                COALESCE(u.total_units, 0)     AS total_units,
                COALESCE(u.correct_count, 0)   AS correct_count,
                COALESCE(u.incorrect_count, 0) AS incorrect_count,
                COALESCE(u.timed_out_count, 0) AS timed_out_count
         FROM session_stats s
         JOIN games g ON g.id = s.game_id
         LEFT JOIN unit_stats u ON u.game_id = s.game_id
         ORDER BY g.id`,
        [userId]
    );

    return toUserStats(totals.rows[0]!, perGame.rows, await getImprovement(userId));
}

/**
 * Every scoring unit of every completed run, newest run first, in play order.
 *
 * One UNION rather than one query per game: both round tables have the same
 * grain -- one row per thing the player got right or wrong -- so the shaping
 * afterwards does not need to know which game it is looking at. Adding game #3
 * is a third branch here and nothing else.
 *
 * Only completed runs. An abandoned or paused game is a partial sample, and
 * averaging it in would report someone as slower or less accurate than they are.
 *
 * The SQL's only judgement is ordering; what counts as a streak or a fair
 * comparison is decided in users/progress.ts, where it can be tested.
 */
async function getImprovement(userId: string) {
    const result = await pool.query<UnitRow>(
        `WITH runs AS (
             SELECT gs.id, gs.game_id, gs.completed_at
             FROM game_sessions gs
             WHERE gs.user_id = $1 AND gs.status = 'completed'
         ),
         units AS (
             SELECT r.game_id,
                    r.id                        AS session_id,
                    r.completed_at,
                    sq.display_order            AS ordinal,
                    (sq.is_correct IS TRUE)     AS success,
                    CASE
                        WHEN sq.answered_at IS NOT NULL AND sq.served_at IS NOT NULL
                        THEN EXTRACT(EPOCH FROM (sq.answered_at - sq.served_at)) * 1000
                    END                         AS duration_ms
             FROM runs r
             JOIN session_questions sq ON sq.game_session_id = r.id

             UNION ALL

             SELECT r.game_id,
                    r.id,
                    r.completed_at,
                    fr.display_order,
                    (fr.status = 'completed'),
                    CASE
                        WHEN fr.ended_at IS NOT NULL AND fr.served_at IS NOT NULL
                        THEN EXTRACT(EPOCH FROM (fr.ended_at - fr.served_at)) * 1000
                    END
             FROM runs r
             JOIN flush_rounds fr ON fr.game_session_id = r.id

             UNION ALL

             -- reaction_ms is already milliseconds, so no interval arithmetic.
             -- This makes Reaction's average the most literally meaningful of the
             -- three: it IS the player's reaction time.
             SELECT r.game_id,
                    r.id,
                    r.completed_at,
                    rr.display_order,
                    (rr.status = 'reacted'),
                    rr.reaction_ms
             FROM runs r
             JOIN reaction_rounds rr ON rr.game_session_id = r.id

             UNION ALL

             -- Memory has no per-unit duration worth averaging: the display timer
             -- is fixed by the curve and the player takes as long as they like to
             -- play back. NULL keeps it out of the speed trend while still
             -- contributing streaks and success rate.
             SELECT r.game_id,
                    r.id,
                    r.completed_at,
                    mr.display_order,
                    (mr.correct_positions = array_length(mr.sequence, 1)),
                    NULL
             FROM runs r
             JOIN memory_rounds mr ON mr.game_session_id = r.id
         )
         SELECT g.slug AS game_slug, u.session_id, u.ordinal, u.success, u.duration_ms
         FROM units u
         JOIN games g ON g.id = u.game_id
         ORDER BY g.slug, u.completed_at DESC, u.session_id DESC, u.ordinal`,
        [userId]
    );

    return toGameProgress(result.rows);
}

/**
 * One page of a player's games, newest first.
 *
 * Paginate first, aggregate second. If the per-unit counts were joined before
 * the LIMIT, the aggregate would run for every session the player has ever
 * played in order to return ten rows. The CTE narrows to the page, then the
 * LATERAL executes exactly `limit` times.
 *
 * ORDER BY started_at DESC, id DESC is a *total* order -- id is unique, so no
 * two rows can tie. Without the id, two sessions sharing a started_at could
 * appear on both page 1 and page 2, or on neither.
 *
 * The progress counts come from session_questions, which is Code Blitz's round
 * table. When Flush lands, this LATERAL becomes a game-aware branch reading
 * flush_rounds instead -- the *shape* it produces stays identical, so neither the
 * response nor the client changes.
 */
export async function listUserSessions(
    userId: string,
    limit: number,
    offset: number
): Promise<HistoryPage> {
    const result = await pool.query<HistorySessionRow>(
        `WITH page AS (
             SELECT gs.id,
                    gs.game_id,
                    gs.status,
                    gs.score,
                    gs.xp_earned,
                    gs.started_at,
                    COALESCE(gs.completed_at, gs.abandoned_at) AS ended_at,
                    COUNT(*) OVER ()                           AS total_rows
             FROM game_sessions gs
             WHERE gs.user_id = $1
             ORDER BY gs.started_at DESC, gs.id DESC
             LIMIT $2 OFFSET $3
         )
         SELECT p.id,
                p.status,
                p.score,
                p.xp_earned,
                p.started_at,
                p.ended_at,
                p.total_rows,
                g.slug                   AS game_slug,
                g.name                   AS game_name,
                COALESCE(q.total, 0)     AS total_units,
                COALESCE(q.correct, 0)   AS correct_count,
                COALESCE(q.incorrect, 0) AS incorrect_count,
                COALESCE(q.timed_out, 0) AS timed_out_count
         FROM page p
         JOIN games g ON g.id = p.game_id
         /*
          * One LATERAL over all three round tables. Before this it read
          * session_questions only, so a Flush row in history reported 0/0 and a
          * Reaction row would have done the same -- the counts were Code Blitz's
          * counts wearing a generic label.
          *
          * Pending units still count toward the total, so an abandoned run reads
          * "3/10" rather than "3/3": the ten were dealt, and seven went unplayed.
          */
         LEFT JOIN LATERAL (
             SELECT COUNT(*)                                   AS total,
                    COUNT(*) FILTER (WHERE u.outcome = 'win')   AS correct,
                    COUNT(*) FILTER (WHERE u.outcome = 'loss')  AS incorrect,
                    COUNT(*) FILTER (WHERE u.outcome = 'lapse') AS timed_out
             FROM (
                 SELECT CASE
                            WHEN sq.is_correct THEN 'win'
                            WHEN sq.status = 'timed_out' THEN 'lapse'
                            WHEN sq.status = 'pending' THEN 'pending'
                            ELSE 'loss'
                        END AS outcome
                 FROM session_questions sq
                 WHERE sq.game_session_id = p.id

                 UNION ALL

                 SELECT CASE fr.status
                            WHEN 'completed' THEN 'win'
                            WHEN 'timed_out' THEN 'lapse'
                            WHEN 'failed' THEN 'loss'
                            ELSE 'pending'
                        END
                 FROM flush_rounds fr
                 WHERE fr.game_session_id = p.id

                 UNION ALL

                 SELECT CASE rr.status
                            WHEN 'reacted' THEN 'win'
                            WHEN 'false_start' THEN 'loss'
                            ELSE 'pending'
                        END
                 FROM reaction_rounds rr
                 WHERE rr.game_session_id = p.id

                 UNION ALL

                 SELECT CASE
                            WHEN mr.status <> 'answered' THEN 'pending'
                            WHEN mr.correct_positions = array_length(mr.sequence, 1) THEN 'win'
                            ELSE 'loss'
                        END
                 FROM memory_rounds mr
                 WHERE mr.game_session_id = p.id
             ) AS u
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
