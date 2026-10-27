import { pool } from "../db.js";

/**
 * What a learner has actually answered, concept by concept.
 *
 * READ ONLY, AND NOT EVIDENCE. Progress is CLEARED_RUNGS_CTE's (encounter.ts):
 * this counts every graded attempt on content tagged to a concept, right or
 * wrong, and changes nothing. It exists so the Skills page can say "8 answered,
 * 6 right" and "2 of your last 5" instead of only "practised".
 *
 * An ATTEMPT is one graded unit of play on content whose challenge names the
 * concept (any role):
 *
 *     Code Blitz   a session question answered or timed out (a timeout is not right)
 *     Bug Hunt     an incident resolved or failed; right only if resolved on
 *                  the first attempt (attempts = 1: the resolving patch is
 *                  counted, so a fix after a wrong patch ends at 2)
 *     Flush        a round completed (right) or failed or timed out
 *
 * Not counted: lesson and mission completions (activity_completions records
 * only successes, so it cannot give a fair right-of-total), Reaction and
 * Memory (no concept), and anything still pending.
 *
 * RECENT is the concept's last five attempts and EARLIER the five before
 * them, by when each was graded, so the client can show a trend only when
 * there are ten.
 */
export interface ConceptPracticeRecord {
    slug: string;
    attempts: number;
    correct: number;
    recent: { attempts: number; correct: number };
    earlier: { attempts: number; correct: number };
    lastAt: string;
}

export const RECENT_WINDOW = 5;

export async function findPracticeRecord(userId: string): Promise<ConceptPracticeRecord[]> {
    const result = await pool.query<{
        slug: string;
        attempts: string;
        correct: string;
        recent_attempts: string;
        recent_correct: string;
        earlier_attempts: string;
        earlier_correct: string;
        last_at: Date | string;
    }>(
        `WITH attempts AS (
             SELECT ch.concept_id,
                    COALESCE(sq.is_correct, FALSE) AS correct,
                    COALESCE(sq.answered_at, sq.timed_out_at) AS at
             FROM session_questions sq
             JOIN game_sessions gs ON gs.id = sq.game_session_id
             JOIN questions q ON q.id = sq.question_id
             JOIN challenges ch ON ch.id = q.challenge_id
             WHERE gs.user_id = $1
               AND sq.status IN ('answered', 'timed_out')

             UNION ALL

             SELECT ch.concept_id,
                    r.status = 'resolved' AND r.attempts = 1,
                    r.ended_at
             FROM bug_hunt_rounds r
             JOIN game_sessions gs ON gs.id = r.game_session_id
             JOIN bug_hunt_incidents i ON i.id = r.incident_id
             JOIN challenges ch ON ch.id = i.challenge_id
             WHERE gs.user_id = $1
               AND r.status IN ('resolved', 'failed')

             UNION ALL

             SELECT ch.concept_id,
                    fr.status = 'completed',
                    fr.ended_at
             FROM flush_rounds fr
             JOIN game_sessions gs ON gs.id = fr.game_session_id
             JOIN flush_snippets s ON s.id = fr.snippet_id
             JOIN challenges ch ON ch.id = s.challenge_id
             WHERE gs.user_id = $1
               AND fr.status IN ('completed', 'failed', 'timed_out')
         ),
         ranked AS (
             SELECT concept_id, correct, at,
                    ROW_NUMBER() OVER (PARTITION BY concept_id ORDER BY at DESC) AS rn
             FROM attempts
             WHERE at IS NOT NULL
         )
         SELECT c.slug,
                COUNT(*) AS attempts,
                COUNT(*) FILTER (WHERE r.correct) AS correct,
                COUNT(*) FILTER (WHERE r.rn <= $2) AS recent_attempts,
                COUNT(*) FILTER (WHERE r.rn <= $2 AND r.correct) AS recent_correct,
                COUNT(*) FILTER (WHERE r.rn > $2 AND r.rn <= 2 * $2) AS earlier_attempts,
                COUNT(*) FILTER (WHERE r.rn > $2 AND r.rn <= 2 * $2 AND r.correct) AS earlier_correct,
                MAX(r.at) AS last_at
         FROM ranked r
         JOIN concepts c ON c.id = r.concept_id
         GROUP BY c.slug
         ORDER BY c.slug`,
        [userId, RECENT_WINDOW]
    );

    return result.rows.map((row) => ({
        slug: row.slug,
        attempts: Number(row.attempts),
        correct: Number(row.correct),
        recent: { attempts: Number(row.recent_attempts), correct: Number(row.recent_correct) },
        earlier: { attempts: Number(row.earlier_attempts), correct: Number(row.earlier_correct) },
        lastAt: new Date(row.last_at).toISOString()
    }));
}
