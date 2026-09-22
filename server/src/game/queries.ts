import type { PoolClient } from "pg";
import { pool } from "../db.js";
import { demandCeilingCte } from "../curriculum/demand.js";
import { journeyCte, withinJourney } from "../curriculum/journey.js";
import { selectInOrder, type Candidate, type Ceilings } from "../curriculum/policy.js";
import { curriculumCtes, curriculumSelects } from "../curriculum/selection.js";
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
    topic: string | null;
    explanation: string | null;
    challenge_type: string;
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
 * The candidate query, exported so the integration test runs this exact string.
 *
 * Same reason the introduction statements are constants: a test that retyped it
 * would be testing its own copy of the pipeline rather than the one that ships.
 *
 * $1 session being created (excluded from its own lookback) · $2 user · $3 game slug
 */
export const CODE_BLITZ_CANDIDATES_SQL = `WITH recent AS (
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
         ),
         ${curriculumCtes("$2")},
         ${demandCeilingCte("$2")},
         ${journeyCte("$2", QUESTIONS_PER_SESSION)}
         SELECT q.id, q.difficulty, q.topic, q.prompt,
                q.challenge_id                                       AS challenge_id,
                ch.concept_id                                        AS concept_id,
                ch.role                                              AS role,
                ch.difficulty                                        AS challenge_difficulty,
                d.display_order                                      AS demand_order,
                dc.ceiling                                           AS difficulty_ceiling,
                mc.ceiling_order                                     AS demand_ceiling,
                (q.id IN (SELECT question_id FROM recent))           AS seen_recently
         FROM questions q
         LEFT JOIN challenges ch        ON ch.id = q.challenge_id
         LEFT JOIN demands d            ON d.id  = ch.demand_id
         LEFT JOIN difficulty_ceiling dc ON dc.concept_id = ch.concept_id
         LEFT JOIN demand_ceiling mc    ON mc.concept_id = ch.concept_id
         WHERE ${ELIGIBLE_QUESTION_PREDICATE}
           AND ${curriculumSelects("q")}
           AND ${withinJourney("q")}
         ORDER BY (q.id IN (SELECT question_id FROM recent)) ASC, RANDOM()`;

/**
 * One row of the Code Blitz candidate query.
 *
 * The first four columns are what dealSession has always read. The rest are the
 * curriculum's, and are NULL for every untagged question -- which is most of
 * them, deliberately, and for as long as the migration takes.
 */
interface CandidateRow {
    id: string;
    /** questions.difficulty -- PACING. Never the curriculum's number. */
    difficulty: number | null;
    topic: string | null;
    prompt: string;
    challenge_id: string | null;
    concept_id: string | null;
    role: string | null;
    /** challenges.difficulty -- CURRICULUM. Never pacing. */
    challenge_difficulty: number | null;
    demand_order: number | null;
    difficulty_ceiling: number | null;
    demand_ceiling: number | null;
    seen_recently: boolean;
}

/**
 * Orders the candidate array so the dealer meets curriculum-linked questions
 * first, without changing what the dealer does with them.
 *
 * WHY ORDERING IS THE WHOLE INTEGRATION. dealSession already treats the array's
 * order as a preference -- for each slot it filters to the pacing tier it wants
 * and takes the first acceptable match. So putting a curriculum-preferred
 * question earlier means "when the curve asks for a tier this question can fill,
 * prefer it", and means nothing otherwise. The curve still decides how hard each
 * slot is; the curriculum decides which question fills it. No change to
 * curve.ts, to questions.difficulty, to scoring or to session length.
 *
 * TWO SORT KEYS, IN THIS ORDER:
 *
 *   1. seen_recently  -- the pre-existing anti-repeat, untouched. A question
 *                        from the player's last three runs still sorts last,
 *                        curriculum-linked or not. Losing this would have the
 *                        one tagged question dealt every single game.
 *   2. curriculum     -- within a recency class, policy-ranked tagged questions
 *                        come before untagged ones.
 *
 * Legacy questions keep the SQL's RANDOM() order among themselves, because the
 * sort is stable and they all share a rank.
 *
 * HOW TAGGED AND UNTAGGED COEXIST. An untagged question has no challenge, so it
 * has no concept, no rung and no ceiling; the policy never sees it and it never
 * acquires curriculum state. It is transitional fallback content: fully
 * playable, sorted after the curriculum's picks, and invisible to every
 * curriculum derivation. Serving one records a session_questions row that no
 * curriculum CTE will ever join to, because those all go through
 * questions.challenge_id. That is what makes this an incremental migration
 * rather than a cutover -- 230 of the 232 dealable questions are untagged today
 * and every one of them still plays.
 */
export function byCurriculumPreference(rows: readonly CandidateRow[]): CandidateRow[] {
    const tagged = rows.filter(
        (r): r is CandidateRow & { concept_id: string } => r.concept_id !== null
    );

    // Ceilings are per concept. The demand ceiling is raised to at least the
    // deepest rung the concept actually has content at -- see the note in
    // createSessionWithQuestions on why demand cannot gate yet.
    const ceilings = new Map<string, Ceilings>();

    for (const row of tagged) {
        const seen = ceilings.get(row.concept_id);
        const demandOrder = Math.max(
            row.demand_ceiling ?? 0,
            row.demand_order ?? 0,
            seen?.demandOrder ?? 0
        );

        ceilings.set(row.concept_id, {
            difficulty: row.difficulty_ceiling ?? row.challenge_difficulty ?? 1,
            demandOrder
        });
    }

    const asCandidate = (row: CandidateRow & { concept_id: string }): Candidate => ({
        challengeId: row.challenge_id!,
        conceptId: row.concept_id,
        demandOrder: row.demand_order ?? 0,
        difficulty: row.challenge_difficulty ?? 1,
        role: row.role ?? "practise"
    });

    const rank = new Map<string, number>();

    selectInOrder(
        tagged.map(asCandidate),
        (conceptId) => ceilings.get(conceptId) ?? { difficulty: 1, demandOrder: 0 }
    ).forEach((candidate, index) => rank.set(candidate.challengeId, index));

    const keyOf = (row: CandidateRow) => [
        row.seen_recently ? 1 : 0,
        row.challenge_id === null
            ? Number.MAX_SAFE_INTEGER
            : (rank.get(row.challenge_id) ?? Number.MAX_SAFE_INTEGER - 1)
    ];

    // Stable, so untagged questions keep the RANDOM() order the query gave them.
    return [...rows].sort((a, b) => {
        const [aSeen, aRank] = keyOf(a);
        const [bSeen, bRank] = keyOf(b);

        return aSeen! - bSeen! || aRank! - bRank!;
    });
}

/**
 * Creates the session and its full question plan atomically. A transaction is
 * mandatory here: pool.query() may hand out a different connection per call, so
 * BEGIN/COMMIT must run on one dedicated client. Without it a crash mid-loop
 * would leave a session with 4 of its 10 questions.
 */
export async function createSessionWithQuestions(
    userId: string,
    /** Guarantees this topic an introduction slot and a reinforcement slot. */
    focusTopic: string | null = null
): Promise<GameSessionRow> {
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
        //
        // CURRICULUM SELECTION IS APPLIED HERE, not in the dealer.
        //
        // Two fragments, four separate questions, ANDed in one pass:
        //
        //   ELIGIBLE_QUESTION_PREDICATE  is this row playable at all?
        //   curriculumSelects            the three curriculum layers, composed
        //                                in curriculum/selection.ts --
        //                                prerequisites, then role, then the
        //                                practice difficulty frontier
        //
        // The JOURNEY gate is what makes a beginner's run feel like a course
        // rather than a sample of the bank: only topics the learner has reached
        // are in the pool at all. See curriculum/journey.ts -- and note it is
        // the one curriculum rule that counts untagged content, because
        // otherwise it could never move.
        //
        // The demand ceiling is read but NOT used as a gate, and that is a
        // measured decision rather than an oversight. A concept's demand ceiling
        // starts at the shallowest rung it DECLARES, while content is authored
        // at whatever rung it is authored at: primitive-types declares
        // recognise and predict, its only exercise is at predict, so gating on
        // demand would withhold the one piece of practice the Learn beat exists
        // to unlock. The same holds for every tagged concept today. Demand
        // therefore informs ordering and nothing else until shallow-rung content
        // exists; see byCurriculumPreference.
        //
        // dealSession decides pacing -- which tier each slot wants, from
        // questions.difficulty -- and must stay a pure function with no database
        // access. What it is allowed to choose FROM is a different question,
        // answered before the array ever reaches it. The curriculum's own
        // difficulty (challenges.difficulty) is read there and never here: the
        // two numbers mean different things and must not be conflated.
        const candidates = await client.query<CandidateRow>(CODE_BLITZ_CANDIDATES_SQL,             [sessionId, userId, CODE_BLITZ]
        );

        const dealt = dealSession(
            byCurriculumPreference(candidates.rows),
            QUESTIONS_PER_SESSION,
            Math.random,
            focusTopic
        );

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
        // Joined to questions for topic and explanation. The snapshot columns
        // above are still the record of what the player saw; these two are
        // teaching metadata, which is allowed to improve after the fact.
        `SELECT sq.id, sq.question_id, sq.display_order, sq.prompt_text, sq.status,
                sq.served_at, sq.selected_option_id, sq.selected_option_text,
                sq.correct_option_text, sq.is_correct, sq.answered_at, sq.timed_out_at,
                q.topic, q.explanation, q.challenge_type
         FROM session_questions sq
         JOIN questions q ON q.id = sq.question_id
         WHERE sq.game_session_id = $1
         ORDER BY sq.display_order`,
        [sessionId]
    );

    return result.rows;
}

export async function findNextPendingQuestion(
    sessionId: string
): Promise<SessionQuestionRow | null> {
    const result = await pool.query<SessionQuestionRow>(
        `SELECT sq.id, sq.question_id, sq.display_order, sq.prompt_text, sq.status,
                sq.served_at, sq.selected_option_id, sq.selected_option_text,
                sq.correct_option_text, sq.is_correct, sq.answered_at, sq.timed_out_at,
                q.topic, q.explanation, q.challenge_type
         FROM session_questions sq
         JOIN questions q ON q.id = sq.question_id
         WHERE sq.game_session_id = $1 AND sq.status = 'pending'
         ORDER BY sq.display_order
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
        `SELECT sq.id, sq.question_id, sq.display_order, sq.prompt_text, sq.status,
                sq.served_at, sq.selected_option_id, sq.selected_option_text,
                sq.correct_option_text, sq.is_correct, sq.answered_at, sq.timed_out_at,
                q.topic, q.explanation, q.challenge_type
         FROM session_questions sq
         JOIN questions q ON q.id = sq.question_id
         WHERE sq.id = $1 AND sq.game_session_id = $2`,
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
 * The correct assembly for a complete-code question, in answer order.
 *
 * Reads answer_position rather than display_order: display order is shuffled at
 * serve time so the bank does not give the answer away, and would be a different
 * sequence every time it was asked.
 */
export async function findAssemblyAnswer(
    questionId: string
): Promise<{ ids: string[]; text: string }> {
    const result = await pool.query<{ id: string; option_text: string }>(
        `SELECT id, option_text
         FROM question_options
         WHERE question_id = $1 AND is_active AND answer_position IS NOT NULL
         ORDER BY answer_position`,
        [questionId]
    );

    return {
        ids: result.rows.map((r) => r.id),
        text: result.rows.map((r) => r.option_text).join(" ")
    };
}

/**
 * The submitted tokens, in the order the player placed them.
 *
 * Returns null if any id is not an option of this question, which is what stops
 * a client assembling an answer out of another question's tokens. Preserves the
 * submitted order rather than the database's -- the order IS the answer.
 */
export async function findOptionsInOrder(
    optionIds: readonly string[],
    questionId: string
): Promise<{ id: string; optionText: string }[] | null> {
    const result = await pool.query<{ id: string; option_text: string }>(
        `SELECT id, option_text
         FROM question_options
         WHERE question_id = $1 AND is_active AND id = ANY($2::BIGINT[])`,
        [questionId, optionIds]
    );

    const byId = new Map(result.rows.map((r) => [r.id, r.option_text]));

    if (optionIds.some((id) => !byId.has(id))) {
        return null;
    }

    return optionIds.map((id) => ({ id, optionText: byId.get(id)! }));
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
    /** Null for complete-code: the answer is a sequence, not one option. */
    selectedOptionId: string | null,
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
