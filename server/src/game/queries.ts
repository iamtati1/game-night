import type { PoolClient } from "pg";
import { pool } from "../db.js";
import { ELIGIBLE_QUESTION_PREDICATE } from "../questions/queries.js";
import { QUESTIONS_PER_SESSION } from "./scoring.js";

export interface GameSessionRow {
    id: string;
    status: string;
    started_at: Date;
    completed_at: Date | null;
    abandoned_at: Date | null;
    score: number;
    xp_earned: number;
}

export interface SessionQuestionRow {
    id: string;
    question_id: string;
    display_order: number;
    prompt_text: string;
    status: string;
    served_at: Date | null;
    selected_option_id: string | null;
    selected_option_text: string | null;
    correct_option_text: string | null;
    is_correct: boolean | null;
    answered_at: Date | null;
    timed_out_at: Date | null;
}

export interface OptionRow {
    id: string;
    option_text: string;
}

export async function countActiveQuestions(): Promise<number> {
    const result = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM questions WHERE is_active`
    );

    return Number(result.rows[0]!.count);
}

export async function findInProgressSession(userId: string): Promise<GameSessionRow | null> {
    const result = await pool.query<GameSessionRow>(
        `SELECT id, status, started_at, completed_at, abandoned_at, score, xp_earned
         FROM game_sessions
         WHERE user_id = $1 AND status = 'in_progress'`,
        [userId]
    );

    return result.rows[0] ?? null;
}

export async function findSessionForUser(
    sessionId: string,
    userId: string
): Promise<GameSessionRow | null> {
    const result = await pool.query<GameSessionRow>(
        `SELECT id, status, started_at, completed_at, abandoned_at, score, xp_earned
         FROM game_sessions
         WHERE id = $1 AND user_id = $2`,
        [sessionId, userId]
    );

    return result.rows[0] ?? null;
}

export async function abandonSession(sessionId: string): Promise<void> {
    await pool.query(
        `UPDATE game_sessions
         SET status = 'abandoned', abandoned_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'in_progress'`,
        [sessionId]
    );
}

/**
 * Creates the session and its full question plan atomically. A transaction is
 * mandatory here: pool.query() may hand out a different connection per call, so
 * BEGIN/COMMIT must run on one dedicated client. Without it a crash mid-loop
 * would leave a session with 4 of its 10 questions.
 */
export async function createSessionWithQuestions(userId: string): Promise<GameSessionRow> {
    const client: PoolClient = await pool.connect();

    try {
        await client.query("BEGIN");

        const session = await client.query<GameSessionRow>(
            `INSERT INTO game_sessions (user_id)
             VALUES ($1)
             RETURNING id, status, started_at, completed_at, abandoned_at, score, xp_earned`,
            [userId]
        );

        const sessionId = session.rows[0]!.id;

        // ORDER BY RANDOM() is a full scan plus sort. Correct and fast enough
        // for an MVP question bank; revisit past ~100k questions.
        await client.query(
            `INSERT INTO session_questions
                 (game_session_id, question_id, display_order, prompt_text, status)
             SELECT $1,
                    q.id,
                    ROW_NUMBER() OVER (),
                    q.prompt,
                    'pending'
             FROM (
                 SELECT q.id, q.prompt
                 FROM questions q
                 WHERE ${ELIGIBLE_QUESTION_PREDICATE}
                 ORDER BY RANDOM()
                 LIMIT $2
             ) AS q`,
            [sessionId, QUESTIONS_PER_SESSION]
        );

        await client.query("COMMIT");

        return session.rows[0]!;
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        // Always return the connection, or the pool leaks and eventually stalls.
        client.release();
    }
}

export async function listSessionQuestions(sessionId: string): Promise<SessionQuestionRow[]> {
    const result = await pool.query<SessionQuestionRow>(
        `SELECT id, question_id, display_order, prompt_text, status, served_at,
                selected_option_id, selected_option_text, correct_option_text,
                is_correct, answered_at, timed_out_at
         FROM session_questions
         WHERE game_session_id = $1
         ORDER BY display_order`,
        [sessionId]
    );

    return result.rows;
}

export async function findNextPendingQuestion(
    sessionId: string
): Promise<SessionQuestionRow | null> {
    const result = await pool.query<SessionQuestionRow>(
        `SELECT id, question_id, display_order, prompt_text, status, served_at,
                selected_option_id, selected_option_text, correct_option_text,
                is_correct, answered_at, timed_out_at
         FROM session_questions
         WHERE game_session_id = $1 AND status = 'pending'
         ORDER BY display_order
         LIMIT 1`,
        [sessionId]
    );

    return result.rows[0] ?? null;
}

export async function findSessionQuestion(
    sessionQuestionId: string,
    sessionId: string
): Promise<SessionQuestionRow | null> {
    const result = await pool.query<SessionQuestionRow>(
        `SELECT id, question_id, display_order, prompt_text, status, served_at,
                selected_option_id, selected_option_text, correct_option_text,
                is_correct, answered_at, timed_out_at
         FROM session_questions
         WHERE id = $1 AND game_session_id = $2`,
        [sessionQuestionId, sessionId]
    );

    return result.rows[0] ?? null;
}

/** Stamps served_at once. Re-serving the same question must not reset its timer. */
export async function markServed(sessionQuestionId: string): Promise<Date> {
    const result = await pool.query<{ served_at: Date }>(
        `UPDATE session_questions
         SET served_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND served_at IS NULL
         RETURNING served_at`,
        [sessionQuestionId]
    );

    if (result.rows[0]) {
        return result.rows[0].served_at;
    }

    const existing = await pool.query<{ served_at: Date }>(
        `SELECT served_at FROM session_questions WHERE id = $1`,
        [sessionQuestionId]
    );

    return existing.rows[0]!.served_at;
}

/** Player-facing options: no is_correct, no retired rows. */
export async function listActiveOptions(questionId: string): Promise<OptionRow[]> {
    const result = await pool.query<OptionRow>(
        `SELECT id, option_text
         FROM question_options
         WHERE question_id = $1 AND is_active
         ORDER BY display_order`,
        [questionId]
    );

    return result.rows;
}

export async function findOption(
    optionId: string,
    questionId: string
): Promise<{ id: string; optionText: string; isCorrect: boolean } | null> {
    const result = await pool.query<{ id: string; option_text: string; is_correct: boolean }>(
        `SELECT id, option_text, is_correct
         FROM question_options
         WHERE id = $1 AND question_id = $2 AND is_active`,
        [optionId, questionId]
    );

    const row = result.rows[0];

    return row ? { id: row.id, optionText: row.option_text, isCorrect: row.is_correct } : null;
}

export async function findCorrectOptionText(questionId: string): Promise<string | null> {
    const result = await pool.query<{ option_text: string }>(
        `SELECT option_text
         FROM question_options
         WHERE question_id = $1 AND is_correct AND is_active`,
        [questionId]
    );

    return result.rows[0]?.option_text ?? null;
}

export async function recordAnswer(
    sessionQuestionId: string,
    selectedOptionId: string,
    selectedOptionText: string,
    correctOptionText: string,
    isCorrect: boolean
): Promise<Date> {
    const result = await pool.query<{ answered_at: Date }>(
        `UPDATE session_questions
         SET status = 'answered',
             selected_option_id = $2,
             selected_option_text = $3,
             correct_option_text = $4,
             is_correct = $5,
             answered_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING answered_at`,
        [sessionQuestionId, selectedOptionId, selectedOptionText, correctOptionText, isCorrect]
    );

    return result.rows[0]!.answered_at;
}

export async function recordTimeout(
    sessionQuestionId: string,
    correctOptionText: string
): Promise<void> {
    await pool.query(
        `UPDATE session_questions
         SET status = 'timed_out',
             correct_option_text = $2,
             timed_out_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [sessionQuestionId, correctOptionText]
    );
}

export async function completeSession(
    sessionId: string,
    score: number,
    xpEarned: number
): Promise<GameSessionRow> {
    const result = await pool.query<GameSessionRow>(
        `UPDATE game_sessions
         SET status = 'completed',
             completed_at = CURRENT_TIMESTAMP,
             score = $2,
             xp_earned = $3
         WHERE id = $1
         RETURNING id, status, started_at, completed_at, abandoned_at, score, xp_earned`,
        [sessionId, score, xpEarned]
    );

    return result.rows[0]!;
}
