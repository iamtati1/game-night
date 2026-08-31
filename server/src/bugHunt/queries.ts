import type { PoolClient } from "pg";
import { pool } from "../db.js";
import { BUG_HUNT } from "../games/constants.js";
import {
    BUG_HUNT_INCIDENTS_PER_SESSION,
    DIFFICULTY_RAMP,
    PLAYABLE_CHALLENGE_TYPES,
    countCodeLines,
    scoreForSession,
    timeLimitMs,
    type ScoredRound
} from "./scoring.js";

/**
 * How many of the player's previous Bug Hunt runs are checked for incidents to
 * avoid. Matches RECENT_SESSIONS_AVOIDED in flush/queries.ts and
 * game/queries.ts -- the games should not disagree about how long a player's
 * memory is assumed to be.
 */
export const RECENT_SESSIONS_AVOIDED = 3;

export interface BugHuntSessionRow {
    id: string;
    status: string;
    started_at: Date;
    completed_at: Date | null;
    abandoned_at: Date | null;
    score: number;
    xp_earned: number;
}

export interface BugHuntRoundRow {
    id: string;
    incident_id: string;
    display_order: number;
    time_limit_ms: number | null;
    status: string;
    served_at: Date | null;
    ended_at: Date | null;
    attempts: number;
    hints_used: number;
    selected_option_id: string | null;
}

export interface IncidentRow {
    id: string;
    slug: string;
    title: string;
    bug_report: string;
    error_log: string | null;
    theme: string;
    bug_category: string;
    challenge_type: string;
    code: string;
    code_language: string;
    difficulty: number;
    /** Never sent to the client wholesale -- see revealHint. */
    hints: string[];
}

export interface OptionRow {
    id: string;
    option_text: string;
    line_number: number | null;
    is_correct: boolean;
    explanation: string;
}

const ROUND_COLUMNS = `id, incident_id, display_order, time_limit_ms, status, served_at,
                       ended_at, attempts, hints_used, selected_option_id`;
const SESSION_COLUMNS = `id, status, started_at, completed_at, abandoned_at, score, xp_earned`;
const INCIDENT_COLUMNS = `id, slug, title, bug_report, error_log, theme, bug_category,
                          challenge_type, code, code_language, difficulty, hints`;

/**
 * An incident is playable only if it has a challenge type the client can render,
 * at least two active options, and exactly one active correct one.
 *
 * The single-correct rule is already a unique index, but "exactly one" also
 * needs the zero case excluded: an incident whose correct option was retired
 * would be unwinnable, and dealing it would waste one of a player's ten rounds
 * on something with no right answer. Same spirit as Flush's eligible-snippet
 * predicate.
 */
export const ELIGIBLE_INCIDENT_PREDICATE = `
    i.is_active
    AND i.challenge_type IN (${PLAYABLE_CHALLENGE_TYPES.map((t) => `'${t}'`).join(", ")})
    AND (
        SELECT COUNT(*) FROM bug_hunt_options o
        WHERE o.incident_id = i.id AND o.is_active
    ) >= 2
    AND (
        SELECT COUNT(*) FROM bug_hunt_options o
        WHERE o.incident_id = i.id AND o.is_active AND o.is_correct
    ) = 1
`;

export async function countEligibleIncidents(): Promise<number> {
    const result = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM bug_hunt_incidents i
         WHERE ${ELIGIBLE_INCIDENT_PREDICATE}`
    );

    return Number(result.rows[0]!.count);
}

export async function findBugHuntSessionForUser(
    sessionId: string,
    userId: string
): Promise<BugHuntSessionRow | null> {
    const result = await pool.query<BugHuntSessionRow>(
        `SELECT gs.id, gs.status, gs.started_at, gs.completed_at, gs.abandoned_at,
                gs.score, gs.xp_earned
         FROM game_sessions gs
         JOIN games g ON g.id = gs.game_id
         WHERE gs.id = $1 AND gs.user_id = $2 AND g.slug = $3`,
        [sessionId, userId, BUG_HUNT]
    );

    return result.rows[0] ?? null;
}

/**
 * Creates a Bug Hunt session and deals all ten incidents atomically.
 *
 * Dealt up front rather than one at a time, so a session is a complete, fixed
 * object the moment it exists -- the property every other game has, and what
 * makes a resumed run continue the incidents it started with.
 *
 * The clock is NOT started here. time_limit_ms is computed and stored now
 * because it is a property of the incident's code, but served_at stays NULL
 * until the round is actually handed to the client.
 */
/**
 * Picks one incident per hunt, following the difficulty ramp.
 *
 * Candidates arrive already ordered by "unseen first, then random", so taking
 * the first match of a tier keeps both the recency preference and the variation.
 *
 * Falls back to the nearest tier when the bank is thin in one: a run that is
 * three incidents short because difficulty 2 ran dry would be worse than a run
 * where hunt five is a shade easier than intended. The ramp is a target, not a
 * guarantee the bank can always meet.
 */
export function dealRun<T extends { id: string; difficulty: number }>(candidates: T[]): T[] {
    const remaining = [...candidates];
    const dealt: T[] = [];

    /** Nearest-first search outwards from the wanted tier: 3, then 2, 4, 1, 5. */
    const byDistance = (want: number) =>
        [...remaining].sort(
            (a, b) => Math.abs(a.difficulty - want) - Math.abs(b.difficulty - want)
        );

    for (const want of DIFFICULTY_RAMP) {
        const exact = remaining.find((c) => c.difficulty === want) ?? byDistance(want)[0];

        if (!exact) break;

        dealt.push(exact);
        remaining.splice(remaining.indexOf(exact), 1);
    }

    return dealt;
}

export async function createSessionWithRounds(userId: string): Promise<BugHuntSessionRow> {
    const client: PoolClient = await pool.connect();

    try {
        await client.query("BEGIN");

        // One resumable session per game. The route decides; this carries it out,
        // inside the transaction so it cannot half-happen.
        await client.query(
            `UPDATE game_sessions
             SET status = 'abandoned',
                 abandoned_at = CURRENT_TIMESTAMP,
                 paused_at = NULL
             WHERE user_id = $1
               AND status IN ('in_progress', 'paused')
               AND game_id = (SELECT id FROM games WHERE slug = $2)`,
            [userId, BUG_HUNT]
        );

        const session = await client.query<BugHuntSessionRow>(
            `INSERT INTO game_sessions (user_id, game_id)
             VALUES ($1, (SELECT id FROM games WHERE slug = $2))
             RETURNING ${SESSION_COLUMNS}`,
            [userId, BUG_HUNT]
        );

        const sessionId = session.rows[0]!.id;

        // The deal happens here rather than in one INSERT ... SELECT, because the
        // two rules that shape a run -- which difficulty each hunt is drawn from,
        // and how long that hunt gets -- are design decisions, not SQL. Encoding
        // them in the statement meant the difficulty ramp lived in a ROW_NUMBER
        // window and the clock lived in a LEAST(), where neither could be read or
        // tested as the rule it actually is.
        //
        // Recency deprioritises rather than excludes, so a player who has worked
        // through the bank still gets a full run instead of a 503.
        const candidates = await client.query<{
            id: string;
            difficulty: number;
            code: string;
        }>(
            `WITH recent AS (
                 SELECT bhr.incident_id
                 FROM bug_hunt_rounds bhr
                 WHERE bhr.game_session_id IN (
                     SELECT gs.id
                     FROM game_sessions gs
                     WHERE gs.user_id = $1
                       AND gs.game_id = (SELECT id FROM games WHERE slug = $2)
                     ORDER BY gs.started_at DESC
                     LIMIT ${RECENT_SESSIONS_AVOIDED}
                 )
             )
             SELECT i.id, i.difficulty, i.code
             FROM bug_hunt_incidents i
             WHERE ${ELIGIBLE_INCIDENT_PREDICATE}
             ORDER BY (i.id IN (SELECT incident_id FROM recent)) ASC, RANDOM()`,
            [userId, BUG_HUNT]
        );

        const dealt = dealRun(candidates.rows);

        for (const [index, incident] of dealt.entries()) {
            await client.query(
                `INSERT INTO bug_hunt_rounds
                     (game_session_id, incident_id, display_order, time_limit_ms, status)
                 VALUES ($1, $2, $3, $4, 'pending')`,
                [
                    sessionId,
                    incident.id,
                    index + 1,
                    timeLimitMs(incident.difficulty, countCodeLines(incident.code))
                ]
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

export async function listRounds(sessionId: string): Promise<BugHuntRoundRow[]> {
    const result = await pool.query<BugHuntRoundRow>(
        `SELECT ${ROUND_COLUMNS} FROM bug_hunt_rounds
         WHERE game_session_id = $1 ORDER BY display_order`,
        [sessionId]
    );

    return result.rows;
}

/**
 * Just enough about each round to draw the status panel.
 *
 * A narrow query rather than reusing listRoundsForResults: that one carries the
 * code and the correct answers, and pulling those into memory to render a
 * service list is a leak waiting for someone to forget which shape they are
 * holding.
 */
export async function listServiceStates(
    sessionId: string
): Promise<{ id: string; status: string; theme: string }[]> {
    const result = await pool.query<{ id: string; status: string; theme: string }>(
        `SELECT r.id, r.status, i.theme
         FROM bug_hunt_rounds r
         JOIN bug_hunt_incidents i ON i.id = r.incident_id
         WHERE r.game_session_id = $1
         ORDER BY r.display_order`,
        [sessionId]
    );

    return result.rows;
}

export async function findNextPendingRound(sessionId: string): Promise<BugHuntRoundRow | null> {
    const result = await pool.query<BugHuntRoundRow>(
        `SELECT ${ROUND_COLUMNS} FROM bug_hunt_rounds
         WHERE game_session_id = $1 AND status = 'pending'
         ORDER BY display_order LIMIT 1`,
        [sessionId]
    );

    return result.rows[0] ?? null;
}

/** Scoped to the session on purpose: a round id from someone else's run, or from
 *  the player's own earlier run, must not resolve here. */
export async function findRound(
    roundId: string,
    sessionId: string
): Promise<BugHuntRoundRow | null> {
    const result = await pool.query<BugHuntRoundRow>(
        `SELECT ${ROUND_COLUMNS} FROM bug_hunt_rounds WHERE id = $1 AND game_session_id = $2`,
        [roundId, sessionId]
    );

    return result.rows[0] ?? null;
}

export async function findIncident(incidentId: string): Promise<IncidentRow | null> {
    const result = await pool.query<IncidentRow>(
        `SELECT ${INCIDENT_COLUMNS} FROM bug_hunt_incidents WHERE id = $1`,
        [incidentId]
    );

    return result.rows[0] ?? null;
}

/**
 * The options for an incident, WITHOUT is_correct or the explanations.
 *
 * Deliberately a separate function from listOptionsWithAnswers. Sending the full
 * rows to the client would put the answer on the wire next to the question, and
 * "the client does not render it" is not a security model -- it is one DevTools
 * panel away from being the answer key.
 */
export async function listOptionsForPlay(
    incidentId: string
): Promise<{ id: string; option_text: string; line_number: number | null }[]> {
    const result = await pool.query<{
        id: string;
        option_text: string;
        line_number: number | null;
    }>(
        `SELECT id, option_text, line_number FROM bug_hunt_options
         WHERE incident_id = $1 AND is_active
         ORDER BY COALESCE(line_number, 0), id`,
        [incidentId]
    );

    return result.rows;
}

/** Full option rows including the answer. Server-side adjudication only. */
export async function listOptionsWithAnswers(incidentId: string): Promise<OptionRow[]> {
    const result = await pool.query<OptionRow>(
        `SELECT id, option_text, line_number, is_correct, explanation
         FROM bug_hunt_options
         WHERE incident_id = $1 AND is_active
         ORDER BY COALESCE(line_number, 0), id`,
        [incidentId]
    );

    return result.rows;
}

/**
 * Looks up a submitted option, proving it belongs to this round's incident.
 *
 * The incident_id predicate is the whole point: without it a player could post
 * an option id from a different, easier incident and have it adjudicated. The
 * composite foreign key stops that being *stored*; this stops it being *judged*.
 */
export async function findOptionForIncident(
    optionId: string,
    incidentId: string
): Promise<OptionRow | null> {
    const result = await pool.query<OptionRow>(
        `SELECT id, option_text, line_number, is_correct, explanation
         FROM bug_hunt_options
         WHERE id = $1 AND incident_id = $2 AND is_active`,
        [optionId, incidentId]
    );

    return result.rows[0] ?? null;
}

/** Stamps served_at once. Re-serving must not restart the clock -- that is the
 *  bug that cost Code Blitz and Flush real seconds per unit. */
export async function markServed(roundId: string): Promise<Date> {
    const result = await pool.query<{ served_at: Date }>(
        `UPDATE bug_hunt_rounds SET served_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND served_at IS NULL
         RETURNING served_at`,
        [roundId]
    );

    if (result.rows[0]) return result.rows[0].served_at;

    const existing = await pool.query<{ served_at: Date }>(
        `SELECT served_at FROM bug_hunt_rounds WHERE id = $1`,
        [roundId]
    );

    return existing.rows[0]!.served_at;
}

/**
 * Records that the server released one more hint.
 *
 * hints_used is incremented here and nowhere else, and never from a client
 * value. The status and hints_used predicates make it idempotent-safe under a
 * double-click: a concurrent second call either increments once more legitimately
 * or matches nothing, and can never skip a rung of the ladder.
 *
 * Returns the new count, or null when the round is no longer open.
 */
export async function recordHintReveal(
    roundId: string,
    expectedHintsUsed: number
): Promise<number | null> {
    const result = await pool.query<{ hints_used: number }>(
        `UPDATE bug_hunt_rounds
         SET hints_used = hints_used + 1
         WHERE id = $1 AND status = 'pending' AND hints_used = $2
         RETURNING hints_used`,
        [roundId, expectedHintsUsed]
    );

    return result.rows[0]?.hints_used ?? null;
}

/**
 * Records a wrong diagnosis that leaves the incident open.
 *
 * The attempts predicate is the duplicate-submission guard: a replayed request
 * matches nothing rather than burning a second attempt the player did not make.
 */
export async function recordFailedAttempt(
    roundId: string,
    expectedAttempts: number
): Promise<BugHuntRoundRow | null> {
    const result = await pool.query<BugHuntRoundRow>(
        `UPDATE bug_hunt_rounds
         SET attempts = attempts + 1
         WHERE id = $1 AND status = 'pending' AND attempts = $2
         RETURNING ${ROUND_COLUMNS}`,
        [roundId, expectedAttempts]
    );

    return result.rows[0] ?? null;
}

/** Ends a round, resolved or failed. `status = 'pending'` guards a second
 *  submission from overwriting the first with a better-informed one. */
export async function endRound(
    roundId: string,
    status: "resolved" | "failed",
    selectedOptionId: string | null,
    countAttempt: boolean
): Promise<BugHuntRoundRow | null> {
    const result = await pool.query<BugHuntRoundRow>(
        `UPDATE bug_hunt_rounds
         SET status = $2,
             selected_option_id = $3,
             attempts = attempts + $4,
             ended_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'pending'
         RETURNING ${ROUND_COLUMNS}`,
        [roundId, status, selectedOptionId, countAttempt ? 1 : 0]
    );

    return result.rows[0] ?? null;
}

/**
 * Fails every still-pending round whose deadline has passed.
 *
 * Timeouts are adjudicated lazily, on the server, from served_at and the round's
 * own stored limit -- never from a client saying "I ran out of time". A player
 * who closes the tab on incident three still has it recorded as failed the next
 * time the session is read.
 */
export async function expireOverdueRounds(sessionId: string): Promise<number> {
    const result = await pool.query(
        `UPDATE bug_hunt_rounds
         SET status = 'failed', ended_at = CURRENT_TIMESTAMP
         WHERE game_session_id = $1
           AND status = 'pending'
           AND served_at IS NOT NULL
           -- An untimed hunt has no deadline to miss. Comparing against NULL
           -- would already yield NULL rather than true; this states it.
           AND time_limit_ms IS NOT NULL
           AND CURRENT_TIMESTAMP > served_at + (time_limit_ms * INTERVAL '1 millisecond')`,
        [sessionId]
    );

    return result.rowCount ?? 0;
}

export async function completeSession(
    sessionId: string,
    score: number,
    xpEarned: number
): Promise<BugHuntSessionRow> {
    const result = await pool.query<BugHuntSessionRow>(
        `UPDATE game_sessions
         SET status = 'completed', completed_at = CURRENT_TIMESTAMP, score = $2, xp_earned = $3
         WHERE id = $1
         RETURNING ${SESSION_COLUMNS}`,
        [sessionId, score, xpEarned]
    );

    return result.rows[0]!;
}

/** Round rows reduced to the facts the scoring module takes. The one place the
 *  database shape meets the pure rules. */
export function toScored(rounds: BugHuntRoundRow[]): ScoredRound[] {
    return rounds.map((r) => ({
        status: r.status as ScoredRound["status"],
        displayOrder: r.display_order,
        attempts: r.attempts,
        hintsUsed: r.hints_used,
        elapsedMs:
            r.served_at && r.ended_at ? r.ended_at.getTime() - r.served_at.getTime() : null,
        timeLimitMs: r.time_limit_ms
    }));
}

export async function scoreSoFar(sessionId: string): Promise<number> {
    return scoreForSession(toScored(await listRounds(sessionId)));
}

/**
 * Moves the live incident's deadline forward by however long the run was paused.
 *
 * A real implementation, unlike Reaction's and Memory's no-ops: Bug Hunt holds a
 * genuine per-incident countdown, so without this every resumed run would time
 * out the instant the player came back. Same statement as Code Blitz's, against
 * this game's own round table.
 *
 * Must run on the caller's client, inside the resume transaction, while
 * paused_at is still set.
 */
export async function shiftClock(client: PoolClient, sessionId: string): Promise<void> {
    await client.query(
        `UPDATE bug_hunt_rounds bhr
         SET served_at = bhr.served_at + (CURRENT_TIMESTAMP - gs.paused_at)
         FROM game_sessions gs
         WHERE gs.id = bhr.game_session_id
           AND bhr.game_session_id = $1
           AND gs.paused_at IS NOT NULL
           AND bhr.status = 'pending'
           AND bhr.served_at IS NOT NULL`,
        [sessionId]
    );
}

export interface BugHuntResultRow extends BugHuntRoundRow {
    title: string;
    theme: string;
    bug_category: string;
    challenge_type: string;
    difficulty: number;
    code: string;
    code_language: string;
    bug_report: string;
    correct_option_text: string | null;
    correct_explanation: string | null;
    selected_option_text: string | null;
    selected_explanation: string | null;
}

/**
 * Everything the results screen needs, in one query.
 *
 * LEFT JOIN LATERAL for the correct option rather than a second round-trip per
 * round: the mission report shows what the bug actually was for every incident,
 * including the ones that were failed, and ten sequential lookups to build one
 * screen is ten chances for it to be slow.
 *
 * Safe to expose only because every round here has ended -- the caller is the
 * results endpoint. Nothing in this shape may be sent for a round still in play.
 */
export async function listRoundsForResults(sessionId: string): Promise<BugHuntResultRow[]> {
    const result = await pool.query<BugHuntResultRow>(
        `SELECT r.id, r.incident_id, r.display_order, r.time_limit_ms, r.status,
                r.served_at, r.ended_at, r.attempts, r.hints_used, r.selected_option_id,
                i.title, i.theme, i.bug_category, i.challenge_type, i.difficulty,
                i.code, i.code_language, i.bug_report,
                correct.option_text  AS correct_option_text,
                correct.explanation  AS correct_explanation,
                chosen.option_text   AS selected_option_text,
                chosen.explanation   AS selected_explanation
         FROM bug_hunt_rounds r
         JOIN bug_hunt_incidents i ON i.id = r.incident_id
         LEFT JOIN LATERAL (
             SELECT o.option_text, o.explanation
             FROM bug_hunt_options o
             WHERE o.incident_id = r.incident_id AND o.is_active AND o.is_correct
             LIMIT 1
         ) AS correct ON TRUE
         LEFT JOIN bug_hunt_options chosen ON chosen.id = r.selected_option_id
         WHERE r.game_session_id = $1
         ORDER BY r.display_order`,
        [sessionId]
    );

    return result.rows;
}
