import { Router, type Request, type Response } from "express";
import { findCurrentConcept } from "../curriculum/lessons.js";
import { requireAuth } from "../auth/middleware.js";
import { toFieldErrors } from "../auth/schemas.js";
import { BUG_HUNT } from "../games/constants.js";
import { seededShuffle } from "../games/optionOrder.js";
import { findActiveSession, findResumableSession, resumePausedSession } from "../sessions/queries.js";
import { wantsFreshSession, wantsRelaxedRun } from "../sessions/schemas.js";
import * as db from "./queries.js";
import { diagnosisSchema } from "./schemas.js";
import {
    BOSS_DISPLAY_ORDER,
    BUG_HUNT_INCIDENTS_PER_SESSION,
    BUG_HUNT_MIN_INCIDENTS_PER_SESSION,
    MAX_ATTEMPTS,
    averageResolutionMs,
    bestStreak,
    canAttempt,
    firstTryCount,
    hintsSpent,
    isPlayableChallengeType,
    nextHintIndex,
    outcomeFor,
    pointsForRound,
    resolvedCount,
    scoreForSession,
    streakThrough,
    systemIntegrity,
    xpForSession
} from "./scoring.js";

export const bugHuntRouter = Router();

/**
 * WHAT THE SERVER GUARANTEES HERE -- read before changing anything.
 *
 * Unlike Memory, Bug Hunt can withhold everything that matters, and does:
 *
 *   - which incidents a run contains  (dealt at creation, stored)
 *   - which option is correct         (never leaves the server until the round ends)
 *   - the hint texts                  (released one at a time, on a recorded write)
 *   - hints_used                      (a column only the server increments)
 *   - attempts and the state machine  (enforced here and by CHECK constraints)
 *   - the deadline                    (served_at + the round's own stored limit)
 *   - timeouts                        (adjudicated from stored timestamps, lazily)
 *   - score, integrity, XP            (derived from stored round facts)
 *
 * The client is authoritative over nothing. It renders a countdown for tension,
 * but that countdown is decoration: every deadline question is answered here
 * against served_at, because a client clock is not evidence.
 */

// ------------------------------------------------------------------- presenting

/**
 * The incident as the player sees it. No answers, no explanations, no hint text.
 *
 * Calling this STARTS THE CLOCK -- markServed stamps served_at the first time,
 * and never again. That is why the diagnosis response does not call it: serving
 * the next incident inside the previous incident's response would start its
 * timer while the player was still reading feedback, which is exactly the bug
 * that cost Code Blitz 1.8s and Flush 3.3s per unit.
 */
/**
 * Patch options are shuffled; line options are not.
 *
 * Kept as a named function rather than a ternary at the call site so the rule --
 * and the reason there is a rule -- is visible to whoever adds the next
 * challenge type.
 */
function orderOptionsFor<T>(challengeType: string, roundId: string, options: T[]): T[] {
    return challengeType === "choose_patch" ? seededShuffle(options, roundId) : options;
}

async function serveIncident(round: db.BugHuntRoundRow, now = new Date()) {
    const incident = await db.findIncident(round.incident_id);

    if (!incident) throw new Error(`Incident ${round.incident_id} missing for round ${round.id}`);

    // Belt and braces: the eligibility predicate already excludes unbuilt
    // challenge types, so reaching this means the bank and the code disagree.
    // Failing loudly beats handing the client an incident it would render with
    // the wrong interaction -- the player would be unable to answer and would
    // reasonably blame themselves.
    if (!isPlayableChallengeType(incident.challenge_type)) {
        throw new Error(
            `Incident ${incident.slug} has challenge type "${incident.challenge_type}", ` +
                `which no client renderer supports`
        );
    }

    const servedAt = await db.markServed(round.id);
    // Null deadline on an untimed hunt -- the client renders no countdown at all
    // rather than a very large one, which would still say "you are being timed".
    const deadline =
        round.time_limit_ms === null ? null : servedAt.getTime() + round.time_limit_ms;

    return {
        roundId: round.id,
        incidentNumber: round.display_order,
        // The incidents this run was dealt, which is fewer than six for a
        // learner with few bugs open -- never a number the run will not reach.
        totalIncidents: await db.countRoundsInSessionOf(round.id),
        /** Incident ten is the boss. Positional, so it is known before it is played. */
        isBoss: round.display_order === BOSS_DISPLAY_ORDER,
        title: incident.title,
        theme: incident.theme,
        bugReport: incident.bug_report,
        errorLog: incident.error_log,
        challengeType: incident.challenge_type,
        code: incident.code,
        codeLanguage: incident.code_language,
        difficulty: incident.difficulty,
        /**
         * The curriculum's own words for what this incident teaches, or null for
         * a legacy incident that carries no challenge.
         *
         * Present is what tells the client to render the beginner layout: code
         * first, one line of expectation, and a teaching explanation on a wrong
         * answer. Absent keeps the incident-report presentation the fifty
         * existing incidents were written for.
         */
        concept: await db.findIncidentConcept(incident.id),
        // Mapped to camelCase rather than passed through: every other payload in
        // this API is camelCase, and a raw row shape would make the column names
        // part of the client contract.
        // find_line keeps the query's line order -- you are picking a line, and
        // showing the snippet's lines out of sequence would be its own puzzle.
        // choose_patch is shuffled, because there the query order IS authoring
        // order, and every incident in the bank was written with its correct
        // patch first. Seeded on the round so a refresh or a resume re-serves
        // the same arrangement.
        options: orderOptionsFor(incident.challenge_type, round.id, [
            ...(await db.listOptionsForPlay(incident.id))
        ]).map((o) => ({
            id: o.id,
            text: o.option_text,
            lineNumber: o.line_number
        })),
        timeLimitMs: round.time_limit_ms,
        /** What is actually left, so a refresh or a resume picks up the real
         *  remaining time rather than restarting the countdown. */
        remainingMs: deadline === null ? null : Math.max(0, deadline - now.getTime()),
        attemptsRemaining: MAX_ATTEMPTS - round.attempts,
        hintsUsed: round.hints_used,
        /** A count, never the text. */
        hintsAvailable: incident.hints.length
    };
}

// --------------------------------------------------------------------- results

function summarize(session: db.BugHuntSessionRow, rounds: db.BugHuntResultRow[]) {
    const scored = db.toScored(rounds);

    return {
        id: session.id,
        status: session.status,
        score: session.score,
        xpEarned: session.xp_earned,
        startedAt: session.started_at.toISOString(),
        completedAt: session.completed_at?.toISOString() ?? null,
        totalIncidents: rounds.length,
        incidentsResolved: resolvedCount(scored),
        firstTryFixes: firstTryCount(scored),
        hintsUsed: hintsSpent(scored),
        bestStreak: bestStreak(scored),
        averageResolutionMs: averageResolutionMs(scored),
        systemIntegrity: systemIntegrity(scored),
        incidents: rounds.map((r) => ({
            incidentNumber: r.display_order,
            isBoss: r.display_order === BOSS_DISPLAY_ORDER,
            title: r.title,
            theme: r.theme,
            bugCategory: r.bug_category,
            concept: r.concept_name,
            difficulty: r.difficulty,
            status: r.status,
            attempts: r.attempts,
            hintsUsed: r.hints_used,
            resolutionMs:
                r.served_at && r.ended_at
                    ? r.ended_at.getTime() - r.served_at.getTime()
                    : null,
            code: r.code,
            codeLanguage: r.code_language,
            bugReport: r.bug_report,
            // The answer, revealed only on a finished round. A resumed run reads
            // its live incident through serveIncident, which carries none of this.
            correctOption: r.status === "pending" ? null : r.correct_option_text,
            explanation: r.status === "pending" ? null : r.correct_explanation,
            selectedOption: r.selected_option_text,
            pointsAwarded: pointsForRound(
                db.toScored([r])[0]!,
                streakThrough(scored, r.display_order)
            )
        })),
        // What the player is actually good at, counted from the incidents they
        // met rather than asserted. Only categories they saw appear.
        //
        // Named by the lesson concept the incident practises when it has one.
        // bug_category is a taxonomy of bugs, not of lessons: a beginner's
        // misspelt console.log is filed under "scope-closures", and the readout
        // told them they were strong at scope and closures.
        byCategory: Object.entries(
            rounds.reduce<Record<string, { seen: number; resolved: number }>>((acc, r) => {
                const entry = (acc[r.concept_name ?? r.bug_category] ??= { seen: 0, resolved: 0 });
                entry.seen += 1;
                if (r.status === "resolved") entry.resolved += 1;
                return acc;
            }, {})
        ).map(([category, counts]) => ({ category, ...counts }))
    };
}

async function finishSession(sessionId: string): Promise<db.BugHuntSessionRow> {
    // Any round still pending at this point ran out of time. Adjudicate before
    // scoring, or an abandoned incident would count as neither resolved nor failed.
    await db.expireOverdueRounds(sessionId);

    const scored = db.toScored(await db.listRounds(sessionId));

    return db.completeSession(sessionId, scoreForSession(scored), xpForSession(scored));
}

function conflictBody(active: { gameSlug: string; gameName: string }) {
    return {
        error: "Another game is in progress",
        details: [
            {
                field: "game",
                message: `You have a ${active.gameName} game in progress. Resume it, pause it, or quit it before starting Bug Hunt.`
            }
        ],
        activeGame: { slug: active.gameSlug, name: active.gameName }
    };
}

async function respondWithLiveIncident(
    res: Response,
    sessionId: string,
    resumed: boolean,
    status = 200
): Promise<void> {
    await db.expireOverdueRounds(sessionId);

    const round = await db.findNextPendingRound(sessionId);

    if (!round) {
        const finished = await finishSession(sessionId);

        res.status(status).json({
            resumed,
            complete: true,
            session: summarize(finished, await db.listRoundsForResults(sessionId))
        });
        return;
    }

    const scored = db.toScored(await db.listRounds(sessionId));

    res.status(status).json({
        resumed,
        complete: false,
        sessionId,
        scoreSoFar: scoreForSession(scored),
        systemIntegrity: systemIntegrity(scored),
        // The streak carried INTO this hunt. Without it a refresh or a resume
        // showed 0 while the server still held a run of six -- the streak is the
        // thing the player is protecting, so losing sight of it loses the stake.
        streak: streakThrough(scored, round.display_order - 1),
        incident: await serveIncident(round)
    });
}

// ------------------------------------------------------------------- endpoints

/**
 * Whether this learner can be dealt a Bug Hunt run, and what to tell them if not.
 *
 * ONE ANSWER, TWO READERS: the start route refuses on it, and GET /readiness
 * reports it so the Games page can say the same thing before anything is
 * started. Nothing here deals, records or changes anything.
 */
export interface BugHuntReadiness {
    ready: boolean;
    eligible: number;
    needed: number;
    full: number;
    /** Only when not ready. */
    reason: "not-met" | "difficulty" | "too-few" | null;
    reachable: number | null;
    practice: { slug: string; name: string } | null;
    message: string | null;
}

export async function bugHuntReadiness(userId: string): Promise<BugHuntReadiness> {
    // Counted with the same curriculum eligibility the dealer applies, so this
    // check and the candidate query can never disagree about the pool size.
    const eligible = await db.countDealableIncidents(userId);

    if (eligible >= BUG_HUNT_MIN_INCIDENTS_PER_SESSION) {
        return {
            ready: true,
            eligible,
            needed: BUG_HUNT_MIN_INCIDENTS_PER_SESSION,
            full: BUG_HUNT_INCIDENTS_PER_SESSION,
            reason: null,
            reachable: null,
            practice: null,
            message: null
        };
    }

    // WRITTEN FOR THE LEARNER, and it points somewhere.
    //
    // This used to say "Play some Code Blitz first", which blocked all
    // debugging until enough unrelated practice had piled up. The curriculum
    // already has beginner debugging -- every early concept has a "find the
    // problem" rung, scaffolded by its lesson -- so the refusal names the
    // learner's current concept when it has one, and says what opens a run.
    const current = await findCurrentConcept(userId).catch(() => null);
    const practice = current ? await db.findDebugPractice(current.id).catch(() => null) : null;
    const reachable = await db.countReachableIncidents(userId);

    // THREE DIFFERENT REASONS, and each has its own remedy. Conflating them
    // told a learner who had met the ideas that they had not.
    //
    //   not-met     no bug here is on an idea met in a game yet
    //   difficulty  the ideas are met, but these bugs are a rung above
    //               anything played on them -- the frontier
    //   too-few     everything reachable is dealable, just not enough of it
    //
    // "Met" is what the dealer reads (curriculum/eligibility.ts): Code
    // Blitz questions, Bug Hunt rounds, Learn Beats, and lesson steps
    // passed or lessons finished.
    const reason = reachable === 0 ? "not-met" : reachable > eligible ? "difficulty" : "too-few";
    const harder = reachable - eligible;
    const need = BUG_HUNT_MIN_INCIDENTS_PER_SESSION;

    const why =
        reason === "not-met"
            ? `Bug Hunt needs at least ${need} bugs about ideas you have learned, and none are open yet. `
            : reason === "difficulty"
              ? `Bug Hunt needs at least ${need} bugs. You have learned the ideas behind ${reachable}, but ` +
                `${harder === 1 ? "1 of them is" : `${harder} of them are`} a step harder than anything ` +
                `you have practiced on those ideas, so ${eligible === 0 ? "none are" : `only ${eligible} ${eligible === 1 ? "is" : "are"}`} open yet. `
              : `Bug Hunt needs at least ${need} bugs about ideas you have learned. ` +
                `So far ${eligible === 1 ? "1 is" : `${eligible} are`} open. `;

    const remedy =
        reason === "difficulty"
            ? "Practicing those ideas in Code Blitz opens them here."
            : "Bugs open as you work through lessons on your Journey, or meet ideas in Code Blitz.";

    const message =
        why +
        (practice
            ? `You can find a bug right now in ${practice.name}: the last step of that lesson ` +
              "is a broken program to fix. "
            : "") +
        remedy;

    return {
        ready: false,
        eligible,
        needed: need,
        full: BUG_HUNT_INCIDENTS_PER_SESSION,
        reason,
        reachable,
        practice,
        message
    };
}

// GET /api/bug-hunt/readiness -- what the start route would say, without starting.
// Read-only: no session, no round, no evidence.
bugHuntRouter.get("/readiness", requireAuth, async (req: Request, res: Response) => {
    res.status(200).json(await bugHuntReadiness(req.user!.id));
});

// POST /api/bug-hunt/sessions -- resume this player's run, or deal a new one.
bugHuntRouter.post("/sessions", requireAuth, async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const fresh = wantsFreshSession(req.body);
    const active = await findActiveSession(userId);

    if (active && active.gameSlug !== BUG_HUNT) {
        res.status(409).json(conflictBody(active));
        return;
    }

    const existing = fresh ? null : await findResumableSession(userId, BUG_HUNT);

    if (existing) {
        if (existing.status === "paused") {
            const resumed = await resumePausedSession(userId, BUG_HUNT);

            if (resumed.outcome === "blocked") {
                const holder = await findActiveSession(userId);

                res.status(409).json(
                    holder ? conflictBody(holder) : { error: "Another game is in progress" }
                );
                return;
            }
        }

        const full = await db.findBugHuntSessionForUser(existing.id, userId);

        if (full && full.status === "in_progress") {
            await respondWithLiveIncident(res, existing.id, true);
            return;
        }
    }

    // A full run is six incidents; a learner with fewer open is dealt a SHORTER
    // run from what there is, and every total the client sees is the dealt
    // count, so nothing scores out of a number the run never reaches. Only
    // below the minimum is the learner refused.
    const readiness = await bugHuntReadiness(userId);

    if (!readiness.ready) {
        res.status(503).json({
            error: "Not enough to hunt yet",
            details: [{ field: "incidents", message: readiness.message }],
            reason: readiness.reason,
            eligible: readiness.eligible,
            reachable: readiness.reachable,
            needed: readiness.needed,
            practice: readiness.practice
        });
        return;
    }

    /**
     * THE CURRICULUM'S ANSWER, NOT THE CLIENT'S -- identical to Code Blitz.
     * There is no concept field in this route's body and never should be: a
     * resolved hunt clears a rung, so naming the concept is naming the evidence.
     * A failure yields an ordinary run rather than a 500.
     */
    const current = await findCurrentConcept(userId).catch(() => null);

    const session = await db.createSessionWithRounds(userId, current?.id ?? null, wantsRelaxedRun(req.body));

    await respondWithLiveIncident(res, session.id, false, 201);
});

// GET /api/bug-hunt/sessions/current -- the incident on screen. Fetching it
// starts its timer, which is why the client asks only when ready to render.
bugHuntRouter.get("/sessions/current", requireAuth, async (req: Request, res: Response) => {
    const active = await findActiveSession(req.user!.id);

    if (!active || active.gameSlug !== BUG_HUNT) {
        res.status(404).json({ error: "No Bug Hunt game in progress" });
        return;
    }

    await respondWithLiveIncident(res, active.id, false);
});

// POST /api/bug-hunt/sessions/:id/diagnoses -- reveal a hint, or submit a fix.
bugHuntRouter.post("/sessions/:id/diagnoses", requireAuth, async (req: Request, res: Response) => {
    const parsed = diagnosisSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ error: "Invalid request", details: toFieldErrors(parsed.error) });
        return;
    }

    const sessionId = String(req.params.id);
    const session = await db.findBugHuntSessionForUser(sessionId, req.user!.id);

    // 404 rather than 403: do not confirm that someone else's session exists.
    if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
    }

    if (session.status !== "in_progress") {
        res.status(409).json({ error: `Session is ${session.status}` });
        return;
    }

    // Adjudicate the clock before reading the round, so a submission that arrives
    // after the deadline meets a round that is already failed.
    await db.expireOverdueRounds(sessionId);

    const round = await db.findRound(parsed.data.roundId, sessionId);

    // Scoped to this session, so a round id belonging to another run -- or to
    // this player's own earlier run -- resolves to nothing.
    if (!round) {
        res.status(404).json({ error: "Round not part of this session" });
        return;
    }

    if (round.status !== "pending") {
        res.status(409).json({
            error: round.status === "failed" ? "Incident already lost" : "Incident already resolved",
            status: round.status
        });
        return;
    }

    if (parsed.data.action === "reveal-hint") {
        await revealHint(res, sessionId, round);
        return;
    }

    await submitDiagnosis(res, sessionId, round, parsed.data.optionId);
});

/**
 * Releases the next rung of the hint ladder.
 *
 * Deliberately does not touch attempts, status or ended_at: asking for help is
 * not a guess, and a hint that consumed an attempt would make the ladder a trap.
 */
async function revealHint(
    res: Response,
    sessionId: string,
    round: db.BugHuntRoundRow
): Promise<void> {
    const incident = await db.findIncident(round.incident_id);

    if (!incident) {
        res.status(500).json({ error: "Internal Server Error" });
        return;
    }

    const index = nextHintIndex(round.hints_used, incident.hints.length);

    if (index === null) {
        res.status(409).json({ error: "No hints left for this incident" });
        return;
    }

    // The count is advanced BEFORE the text is released, and the write is
    // conditional on the count still being what we read. Two rapid clicks cannot
    // both receive hint two, and neither can skip to hint three.
    const hintsUsed = await db.recordHintReveal(round.id, round.hints_used);

    if (hintsUsed === null) {
        res.status(409).json({ error: "Incident is no longer open" });
        return;
    }

    // Integrity moves the moment the hint is recorded, because that is when it
    // actually changes. Without it here the meter kept reading the pre-hint value
    // until the next diagnosis, which made it wrong for as long as the player
    // spent thinking -- exactly the window the hint was pulled for.
    const scored = db.toScored(await db.listRounds(sessionId));

    res.status(200).json({
        action: "reveal-hint",
        hint: { order: index + 1, text: incident.hints[index] },
        hintsUsed,
        hintsRemaining: incident.hints.length - hintsUsed,
        systemIntegrity: systemIntegrity(scored)
    });
}

/**
 * Judges a submitted fix.
 *
 * The response deliberately does NOT carry the next incident. The client asks
 * for it via GET /sessions/current once the feedback beat is over, so the next
 * incident's clock starts when the player can actually see it.
 */
async function submitDiagnosis(
    res: Response,
    sessionId: string,
    round: db.BugHuntRoundRow,
    optionId: string
): Promise<void> {
    if (!canAttempt(round.status, round.attempts)) {
        res.status(409).json({ error: "No attempts left for this incident" });
        return;
    }

    // Proves the option belongs to THIS round's incident. Without it, an option
    // id copied from an easier incident would be adjudicated on its own terms.
    const option = await db.findOptionForIncident(optionId, round.incident_id);

    if (!option) {
        res.status(404).json({ error: "Option not part of this incident" });
        return;
    }

    const attemptsAfter = round.attempts + 1;
    const outcome = outcomeFor(option.is_correct, attemptsAfter);

    const updated =
        outcome === "retry"
            ? await db.recordFailedAttempt(round.id, round.attempts)
            : await db.endRound(round.id, outcome, option.id, true);

    // Null means the row stopped matching between the read and the write -- a
    // double submit racing itself. The first submission stands.
    if (!updated) {
        res.status(409).json({ error: "Incident already judged" });
        return;
    }

    const scored = db.toScored(await db.listRounds(sessionId));
    const thisRound = scored.find((r) => r.displayOrder === round.display_order)!;
    const streak = streakThrough(scored, round.display_order);

    const remaining = await db.findNextPendingRound(sessionId);
    const finished = remaining ? null : await finishSession(sessionId);

    res.status(200).json({
        action: "diagnose",
        outcome,
        correct: option.is_correct,
        // On a retry this explains why the pick was wrong without naming the
        // right answer -- the clue the second attempt is meant to be spent on.
        explanation: option.explanation,
        attemptsRemaining: MAX_ATTEMPTS - updated.attempts,
        pointsAwarded: pointsForRound(thisRound, streak),
        streak,
        scoreSoFar: scoreForSession(scored),
        systemIntegrity: systemIntegrity(scored),
        complete: !remaining,
        // Never the next incident. See the note above.
        session: finished
            ? summarize(finished, await db.listRoundsForResults(sessionId))
            : null
    });
}

// GET /api/bug-hunt/sessions/:id -- the mission report.
bugHuntRouter.get("/sessions/:id", requireAuth, async (req: Request, res: Response) => {
    const sessionId = String(req.params.id);
    const session = await db.findBugHuntSessionForUser(sessionId, req.user!.id);

    if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
    }

    res.status(200).json({
        session: summarize(session, await db.listRoundsForResults(sessionId))
    });
});
