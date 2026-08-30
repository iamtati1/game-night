import type { PoolClient } from "pg";
import { pool } from "../db.js";
import { CODE_BLITZ } from "../games/constants.js";
import { ELIGIBLE_QUESTION_PREDICATE } from "../questions/queries.js";
import { QUESTIONS_PER_SESSION, scoreForSession } from "./scoring.js";
import { dealSession } from "./curve.js";

/**
 * How many of the player's previous runs are checked for questions to avoid.
 *
 * Three runs is thirty questions, so against the current bank a player has to get
 * through most of it before anything repeats. Raising it further would start
 * forcing the rarest questions to the front every game, which is its own kind of
 * predictability.
 */
export const RECENT_SESSIONS_AVOIDED = 3;

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

        // Clears the way for the INSERT below. game_sessions_one_resumable_per_
        // game_idx permits only one in_progress-or-paused session per game, so any
        // paused or live Code Blitz game has to end before a new one can begin.
        //
        // Doing it here rather than in a separate request is what makes "Start
        // New Game" atomic: two statements from the route would leave a window in
        // which the old session is gone and the new one does not exist yet, and a
        // crash inside it would lose the game silently. The decision to discard is
        // the caller's -- this function is only ever reached once the route has
        // established that nothing is being resumed.
        await client.query(
            `UPDATE game_sessions
             SET status = 'abandoned',
                 abandoned_at = CURRENT_TIMESTAMP,
                 paused_at = NULL
             WHERE user_id = $1
               AND status IN ('in_progress', 'paused')
               AND game_id = (SELECT id FROM games WHERE slug = $2)`,
            [userId, CODE_BLITZ]
        );

        // The game is resolved by slug inside the INSERT rather than passed in,
        // so a caller cannot accidentally attribute a Code Blitz session to
        // another game.
        const session = await client.query<GameSessionRow>(
            `INSERT INTO game_sessions (user_id, game_id)
             VALUES ($1, (SELECT id FROM games WHERE slug = $2))
             RETURNING id, status, started_at, completed_at, abandoned_at, score, xp_earned`,
            [userId, CODE_BLITZ]
        );

        const sessionId = session.rows[0]!.id;

        // ORDER BY RANDOM() is a full scan plus sort. Correct and fast enough
        // for an MVP question bank; revisit past ~100k questions.
        // Questions the player met in their last few runs of this game. Dealing
        // ten at random from a bank they have just seen is how a game becomes a
        // memory test: the concept stops mattering because the exact instance is
        // already known.
        //
        // The ordering PREFERS unseen questions rather than filtering seen ones
        // out. `ORDER BY (id IN recent) ASC` puts unseen first and seen last, so
        // a player who has exhausted the bank still gets a full game instead of a
        // 503 -- there is no pool size at which this can starve.
        // Candidates first, then the pick -- rather than one INSERT ... SELECT.
        //
        // Which tier each slot should draw from is a design decision, and it now
        // has a shape: a run opens on fundamentals and closes on a real-world
        // question. Expressing that as SQL would put the curve in a ROW_NUMBER()
        // window where it could be neither read as the rule it is nor tested
        // without a database. dealSession owns it instead, and is unit-tested.
        //
        // No LIMIT here on purpose: the dealer needs the whole eligible bank to
        // choose from, or it cannot find a tier-4 question that happened to sort
        // past position ten. The ordering still matters and is still the point --
        // unseen questions come first, randomised within that, and the dealer
        // takes the first acceptable match so both properties survive.
        const candidates = await client.query<{
            id: string;
            difficulty: number | null;
            prompt: string;
        }>(
            `WITH recent AS (
                 SELECT sq.question_id
                 FROM session_questions sq
                 WHERE sq.game_session_id IN (
                     SELECT gs.id
                     FROM game_sessions gs
                     WHERE gs.user_id = $2
                       AND gs.game_id = (SELECT id FROM games WHERE slug = $3)
                       AND gs.id <> $1
                     ORDER BY gs.started_at DESC
                     LIMIT ${RECENT_SESSIONS_AVOIDED}
                 )
             )
             SELECT q.id, q.difficulty, q.prompt
             FROM questions q
             WHERE ${ELIGIBLE_QUESTION_PREDICATE}
             ORDER BY (q.id IN (SELECT question_id FROM recent)) ASC, RANDOM()`,
            [sessionId, userId, CODE_BLITZ]
        );

        const dealt = dealSession(candidates.rows, QUESTIONS_PER_SESSION);

        for (const [index, question] of dealt.entries()) {
            await client.query(
                `INSERT INTO session_questions
                     (game_session_id, question_id, display_order, prompt_text, status)
                 VALUES ($1, $2, $3, $4, 'pending')`,
                [sessionId, question.id, index + 1, question.prompt]
            );
        }

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

/**
 * The one-line explanation shown after the question is over.
 *
 * Read on the answer path rather than served with the question, for the same
 * reason correct_option_text is: anything that gives the answer away must not be
 * in the payload the player is looking at while they decide. Null for the older
 * questions, which predate the column.
 */
export async function findExplanation(questionId: string): Promise<string | null> {
    const result = await pool.query<{ explanation: string | null }>(
        `SELECT explanation FROM questions WHERE id = $1`,
        [questionId]
    );

    return result.rows[0]?.explanation ?? null;
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

/**
 * Points banked in this session so far, recomputed from the stored answers.
 *
 * There is deliberately no running total anywhere -- not on the session row, not
 * in the client. That is what makes a reload, a resume, or a pause incapable of
 * desynchronising the score: there is nothing to drift.
 */
export async function scoreSoFar(sessionId: string): Promise<number> {
    const questions = await listSessionQuestions(sessionId);

    return scoreForSession(
        questions.map((q) => ({
            isCorrect: q.is_correct,
            servedAt: q.served_at,
            answeredAt: q.answered_at
        }))
    );
}

/**
 * Pushes the live question's clock forward by however long the session sat
 * paused, so the player resumes with exactly the time they had.
 *
 * Why move served_at rather than store "seconds remaining" somewhere: served_at
 * is the single input to four derived values -- the deadline, the expiry check,
 * the response time, and the speed bonus. A sidecar column would have to be
 * subtracted at all four sites, and missing one would silently zero the speed
 * bonus on every resumed answer. Moving the one field keeps all four consistent
 * by construction.
 *
 * The arithmetic is done in SQL against gs.paused_at, so no Node or browser clock
 * enters the path and the server stays authoritative about time.
 *
 * A question that was already past its deadline when the player paused stays past
 * it by exactly the same margin -- the shift is faithful, not forgiving -- and the
 * ordinary lazy timeout sweep adjudicates it on the next request. That is why
 * there is no "settle before pausing" step: it would not change the outcome.
 *
 * Runs on the caller's client so it lands in the same transaction as the status
 * flip, while paused_at is still set.
 */
export async function shiftQuestionClock(client: PoolClient, sessionId: string): Promise<void> {
    await client.query(
        `UPDATE session_questions sq
         SET served_at = sq.served_at + (CURRENT_TIMESTAMP - gs.paused_at)
         FROM game_sessions gs
         WHERE gs.id = sq.game_session_id
           AND sq.game_session_id = $1
           AND gs.paused_at IS NOT NULL
           AND sq.status = 'pending'
           AND sq.served_at IS NOT NULL`,
        [sessionId]
    );
}
