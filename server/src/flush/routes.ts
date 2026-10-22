import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth/middleware.js";
import { toFieldErrors } from "../auth/schemas.js";
import { FLUSH } from "../games/constants.js";
import { isActiveSessionConflict, resolveSessionRace } from "../game/conflicts.js";
import { longestStreak, type PlayedUnit } from "../games/progress.js";
import {
    findActiveSession,
    findResumableSession,
    resumePausedSession
} from "../sessions/queries.js";
import { wantsFreshSession, wantsRelaxedRun } from "../sessions/schemas.js";
import { isRelaxed, markRelaxed } from "../sessions/relaxedRuns.js";
import { flushHints, NO_FLUSH_HINTS, recordFlushHint, type FlushHints } from "../sessions/runHints.js";
import { mayPlayChallenge, recordActivityCompletion } from "../curriculum/encounter.js";
import * as db from "./queries.js";
import { placementSchema } from "./schemas.js";
import {
    FLUSH_MIN_ROUNDS_PER_SESSION,
    FLUSH_ROUNDS_PER_SESSION,
    roundTimeLimitMs,
    isExpired,
    isPlacementCorrect,
    hintedHalf,
    pointsForPlacements,
    roundScore,
    scoreForSession,
    xpForSession
} from "./scoring.js";

export const flushRouter = Router();

/** Fisher-Yates. Tile order is randomised per serve and never persisted -- the
 *  client answers with an output id, so position on screen carries no meaning. */
function shuffle<T>(items: T[]): T[] {
    const copy = [...items];

    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }

    return copy;
}

/** The "another game is running" body, shared by the start route's up-front
 *  check and its post-resume recheck so the two cannot drift apart. */
function conflictBody(active: { gameSlug: string; gameName: string }) {
    return {
        error: "Another game is in progress",
        details: [
            {
                field: "game",
                message: `You have a ${active.gameName} game in progress. Resume it, pause it, or quit it before starting Flush.`
            }
        ],
        activeGame: { slug: active.gameSlug, name: active.gameName }
    };
}

function summarize(session: db.FlushSessionRow, rounds: db.FlushRoundRow[], hints: FlushHints = NO_FLUSH_HINTS) {
    // Only the streak. Flush has no per-unit response time worth reporting: a
    // round ends the moment a placement is wrong, so a bad run finishes faster
    // than a good one and "average round time" would reward failing quickly.
    const units: PlayedUnit[] = rounds.map((r) => ({
        success: r.status === "completed",
        durationMs: null
    }));

    return {
        bestStreak: longestStreak(units),
        id: session.id,
        status: session.status,
        score: session.score,
        xpEarned: session.xp_earned,
        startedAt: session.started_at.toISOString(),
        completedAt: session.completed_at?.toISOString() ?? null,
        totalRounds: rounds.length,
        completedRounds: rounds.filter((r) => r.status === "completed").length,
        failedRounds: rounds.filter((r) => r.status === "failed").length,
        timedOutRounds: rounds.filter((r) => r.status === "timed_out").length,
        rounds: rounds.map((r) => ({
            roundNumber: r.display_order,
            prompt: r.prompt_text,
            status: r.status,
            correctPlacements: r.correct_placements,
            totalOutputs: r.total_outputs,
            // A hint was taken: the round banked half.
            hinted: hints.hinted(r.id),
            pointsAwarded: roundScore(r.correct_placements, r.status === "completed", hints.hinted(r.id))
        }))
    };
}

async function finishSession(sessionId: string, hints: FlushHints = NO_FLUSH_HINTS): Promise<db.FlushSessionRow> {
    const rounds = await db.listRounds(sessionId);
    const scored = rounds.map((r) => ({
        correctPlacements: r.correct_placements,
        status: r.status,
        hinted: hints.hinted(r.id)
    }));

    return db.completeSession(sessionId, scoreForSession(scored), xpForSession(scored));
}

/**
 * Adjudicates any pending round whose 60s window has passed, then returns the
 * next genuinely playable one. Timeouts resolve lazily on the next request
 * rather than by a background job, matching Code Blitz.
 */
/**
 * What a finished round taught, and whether it counts.
 *
 * TWO SEPARATE QUESTIONS, deliberately. The EXPLANATION is always returned --
 * a learner who just got the order wrong deserves to know why regardless of
 * where they are in the curriculum, and withholding the reason until they
 * reach Async would be teaching nobody in order to protect a rung.
 *
 * The EVIDENCE is gated. `mayPlayChallenge` is the same check Code Blitz and
 * Bug Hunt apply before dealing: it refuses a challenge whose concept the
 * learner cannot reach yet. Without it, a beginner could complete an
 * `event-loop` snippet by luck and arrive at the concept weeks later to find
 * its practice already marked done.
 *
 * So Flush stays playable by everyone from day one, and starts clearing rungs
 * the moment the learner actually reaches Async.
 */
async function roundTeaching(
    userId: string,
    snippetId: string,
    resolved: boolean
): Promise<{ explanation: string | null; credited: boolean }> {
    const { explanation, challengeId } = await db.snippetTeaching(snippetId);

    if (!resolved || !challengeId || !(await mayPlayChallenge(userId, challengeId))) {
        return { explanation, credited: false };
    }

    await recordActivityCompletion(userId, challengeId, false);

    return { explanation, credited: true };
}

async function nextPlayableRound(
    sessionId: string,
    now: Date,
    /** A relaxed run has no deadline, so nothing in it times out. */
    relaxed = false
): Promise<db.FlushRoundRow | null> {
    for (;;) {
        const round = await db.findNextPendingRound(sessionId);

        if (!round) {
            return null;
        }

        if (!relaxed && round.served_at && isExpired(round.served_at, now, round.total_outputs)) {
            await db.markRoundTimedOut(round.id);
            continue;
        }

        return round;
    }
}

/**
 * The round as the player sees it.
 *
 * Note what is absent: `position`. Position IS the answer, so it must not cross
 * the wire until the round has ended -- the same reason Code Blitz withholds
 * correct_option_text until an answer is submitted.
 */
async function serveRound(round: db.FlushRoundRow, relaxed = false, hints: FlushHints = NO_FLUSH_HINTS) {
    const servedAt = round.served_at ?? (await db.markServed(round.id));
    const [tiles, placed] = await Promise.all([
        db.listTiles(round.snippet_id),
        db.listPlacements(round.id)
    ]);
    // The window depends on how many outputs this round holds, so the client is
    // told the limit rather than assuming a constant. Without this the countdown
    // bar would animate against a different number than the deadline it draws.
    // A relaxed run sends no deadline at all, and the client draws no clock --
    // the same contract as Code Blitz's untimed beats.
    const limitMs = relaxed ? null : roundTimeLimitMs(round.total_outputs);
    const deadline = limitMs === null ? null : servedAt.getTime() + limitMs;
    const placedIds = new Set(placed.map((p) => p.output_id));
    // The rounds this game was actually dealt. A learner with few puzzles open
    // gets a shorter game, and "Round 1 of 5" over a three-round game would
    // promise rounds that never come.
    const totalRounds = await db.countRoundsInSessionOf(round.id);
    // What this puzzle teaches, said before the learner starts ordering --
    // Understand before Try. Display only: it changes nothing that is scored.
    const practising = await db.snippetConcept(round.snippet_id);

    return {
        roundId: round.id,
        roundNumber: round.display_order,
        totalRounds,
        prompt: round.prompt_text,
        practising,
        // Tiles already placed are returned separately so the client can render
        // them in their slots rather than back in the pool.
        tiles: shuffle(tiles.filter((t) => !placedIds.has(t.id))),
        placed: placed.map((p) => ({ outputId: p.output_id, text: p.output_text })),
        totalOutputs: round.total_outputs,
        pointsBanked: hintedHalf(pointsForPlacements(round.correct_placements), hints.hinted(round.id)),
        servedAt: servedAt.toISOString(),
        deadlineAt: deadline === null ? null : new Date(deadline).toISOString(),
        limitMs,
        msRemaining: deadline === null ? null : Math.max(0, deadline - Date.now()),
        relaxed,
        // The hint: whether one was taken, and the output it showed while that
        // output is still to place (so a reload keeps the highlight).
        hinted: hints.hinted(round.id),
        hintOutputId: (() => {
            const shown = hints.outputFor(round.id);
            return shown && !placedIds.has(shown) ? shown : null;
        })()
    };
}

/** Serves whatever the player left behind: the next playable round, or the
 *  finished session if every round is already adjudicated. */
async function respondResumed(
    res: Response,
    sessionId: string,
    now: Date,
    relaxed = false,
    hints: FlushHints = NO_FLUSH_HINTS
): Promise<void> {
    const round = await nextPlayableRound(sessionId, now, relaxed);

    if (!round) {
        const finished = await finishSession(sessionId, hints);
        res.status(200).json({
            resumed: true,
            session: summarize(finished, await db.listRounds(finished.id), hints)
        });
        return;
    }

    res.status(200).json({
        resumed: true,
        sessionId,
        scoreSoFar: await db.scoreSoFar(sessionId, false, hints.hinted),
        round: await serveRound(round, relaxed, hints)
    });
}

/**
 * Whether this learner can be dealt a Flush game, and what to tell them if not.
 *
 * ONE ANSWER, TWO READERS: the start route below refuses on it, and GET
 * /readiness reports it so the Games page can say the same thing before
 * anything is started. Counted by the same predicate the dealer uses.
 */
export interface FlushReadiness {
    ready: boolean;
    /** Puzzles this learner could be dealt right now. */
    eligible: number;
    /** The fewest a game is dealt with. */
    needed: number;
    /** A full game's length; a ready game with fewer puzzles is a short one. */
    full: number;
    /** The learner-facing reason, when not ready. */
    message: string | null;
}

export async function flushReadiness(userId: string): Promise<FlushReadiness> {
    const available = await db.countEligibleSnippets(userId);
    const ready = available >= FLUSH_MIN_ROUNDS_PER_SESSION;

    // "Met" is what the dealer reads (curriculum/eligibility.ts): Code
    // Blitz questions, Bug Hunt rounds, Learn Beats, and lesson steps
    // passed or lessons finished. The remedy names the learning path first.
    const message = ready
        ? null
        : `Flush needs at least ${FLUSH_MIN_ROUNDS_PER_SESSION} puzzles about ideas you have learned. ` +
          (available === 0 ? "None are open yet. " : `So far ${available === 1 ? "1 is" : `${available} are`} open. `) +
          "Puzzles open as you work through lessons on your Journey, or meet ideas in Code Blitz.";

    return {
        ready,
        eligible: available,
        needed: FLUSH_MIN_ROUNDS_PER_SESSION,
        full: FLUSH_ROUNDS_PER_SESSION,
        message
    };
}

// GET /api/flush/readiness -- what the start route would say, without starting.
// Read-only: no session, no round, no evidence.
flushRouter.get("/readiness", requireAuth, async (req: Request, res: Response) => {
    res.status(200).json(await flushReadiness(req.user!.id));
});

// POST /api/flush/sessions -- resume this player's Flush game, or deal a new one.
//
// Body: { fresh?: boolean }. Default false, i.e. resume.
flushRouter.post("/sessions", requireAuth, async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const now = new Date();
    const fresh = wantsFreshSession(req.body);
    const active = await findActiveSession(userId);

    // One in-progress session per user across all games. Rather than silently
    // destroying a Code Blitz game the player may be nine questions into, say
    // which game is running and let them decide. `fresh` deliberately does not
    // override this -- it means "discard my unfinished Flush game", never
    // "discard whatever else is running".
    if (active && active.gameSlug !== FLUSH) {
        res.status(409).json(conflictBody(active));
        return;
    }

    const existing = fresh ? null : await findResumableSession(userId, FLUSH);

    if (existing) {
        if (existing.status === "paused") {
            const resumed = await resumePausedSession(userId, FLUSH);

            if (resumed.outcome === "blocked") {
                const holder = await findActiveSession(userId);

                res.status(409).json(
                    holder ? conflictBody(holder) : { error: "Another game is in progress" }
                );
                return;
            }
        }

        const full = await db.findFlushSessionForUser(existing.id, userId);

        if (full && full.status === "in_progress") {
            await respondResumed(res, existing.id, now, isRelaxed(req, existing.id), flushHints(req));
            return;
        }
    }

    // Per learner, through the curriculum gate: a game is built only from
    // puzzles whose concepts this learner has met. Below a full game but at or
    // above the minimum, a SHORTER game is dealt from the puzzles there are --
    // the dealer's LIMIT simply returns fewer. Only below the minimum is the
    // learner refused.
    const readiness = await flushReadiness(userId);

    if (!readiness.ready) {
        // A readiness answer, written for the learner, with somewhere to go --
        // the same shape as Bug Hunt's. The counts stay in the body for whoever
        // is debugging the bank.
        res.status(503).json({
            error: "Not enough to play yet",
            details: [{ field: "snippets", message: readiness.message }],
            eligible: readiness.eligible,
            needed: readiness.needed,
            practice: null
        });
        return;
    }

    let session: db.FlushSessionRow;

    try {
        session = await db.createSessionWithRounds(userId);
    } catch (err) {
        // The check at the top of this route and this INSERT are not atomic, so
        // the single active-session slot can change hands between them. The
        // trigger seen in practice is a double-submitted start -- GetReady fires
        // onDone from an effect keyed on a callback that is rebuilt every render,
        // so two identical POSTs can be in flight at once -- but two tabs do it
        // just as well.
        //
        // Without this the rejected INSERT reached the app error handler and the
        // player was told "Internal Server Error" for a state this same route
        // answers with a conflict fifty lines earlier. Code Blitz answers the
        // same three outcomes; resolveSessionRace is shared and takes the game so
        // neither has to restate the rule.
        if (!isActiveSessionConflict(err)) {
            throw err;
        }

        const winner = await findActiveSession(userId);

        switch (resolveSessionRace(winner, FLUSH)) {
            case "conflict":
                // Another game took the slot. Identical to the pre-check's answer,
                // and activeGame in the body is what raises the client's "one game
                // at a time" dialog.
                res.status(409).json(conflictBody(winner!));
                return;

            case "retry":
                // The slot was held when the INSERT was rejected and is free now.
                // Nothing to resume and no holder to name, so say what happened
                // rather than report a fault the player cannot act on.
                res.status(409).json({
                    error: "Could not start the game",
                    details: [
                        {
                            field: "game",
                            message:
                                "Another game was still finishing when this one tried to start. Try again."
                        }
                    ]
                });
                return;

            case "resume": {
                // The winner is this player's own Flush session -- the ordinary
                // double-submit. Serving it is the correct outcome, and goes
                // through the same helper the resume path above uses.
                const full = await db.findFlushSessionForUser(winner!.id, userId);

                if (!full) {
                    res.status(409).json({
                        error: "Could not start the game",
                        details: [
                            {
                                field: "game",
                                message: "That game ended as this one was starting. Try again."
                            }
                        ]
                    });
                    return;
                }

                await respondResumed(res, winner!.id, now, isRelaxed(req, winner!.id), flushHints(req));
                return;
            }
        }
    }

    // Chosen once, for a new run; a resumed run keeps its own pace.
    const relaxed = wantsRelaxedRun(req.body);
    if (relaxed) markRelaxed(req, session.id);

    const round = await nextPlayableRound(session.id, now, relaxed);

    res.status(201).json({
        resumed: false,
        sessionId: session.id,
        scoreSoFar: 0,
        round: round ? await serveRound(round, relaxed, flushHints(req)) : null
    });
});

// GET /api/flush/sessions/current -- the round on screen. Fetching starts its clock.
flushRouter.get("/sessions/current", requireAuth, async (req: Request, res: Response) => {
    const now = new Date();
    const active = await findActiveSession(req.user!.id);

    if (!active || active.gameSlug !== FLUSH) {
        res.status(404).json({ error: "No Flush game in progress" });
        return;
    }

    const relaxed = isRelaxed(req, active.id);
    const hints = flushHints(req);
    const round = await nextPlayableRound(active.id, now, relaxed);

    if (!round) {
        const finished = await finishSession(active.id, hints);
        res.status(200).json({
            complete: true,
            session: summarize(finished, await db.listRounds(finished.id), hints)
        });
        return;
    }

    res.status(200).json({
        complete: false,
        sessionId: active.id,
        scoreSoFar: await db.scoreSoFar(active.id, false, hints.hinted),
        round: await serveRound(round, relaxed, hints)
    });
});

// POST /api/flush/sessions/:id/placements -- place one output. The server decides
// whether it was right, and whether the round survives.
flushRouter.post("/sessions/:id/placements", requireAuth, async (req: Request, res: Response) => {
    const now = new Date();
    const parsed = placementSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ error: "Invalid request", details: toFieldErrors(parsed.error) });
        return;
    }

    const sessionId = String(req.params.id);
    const userId = req.user!.id;
    const session = await db.findFlushSessionForUser(sessionId, userId);

    // 404 rather than 403: do not confirm that someone else's session exists.
    if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
    }

    if (session.status !== "in_progress") {
        res.status(409).json({ error: `Session is ${session.status}` });
        return;
    }

    const round = await db.findRound(parsed.data.roundId, sessionId);

    if (!round) {
        res.status(404).json({ error: "Round not part of this session" });
        return;
    }

    if (round.status !== "pending") {
        res.status(409).json({ error: `Round already ${round.status}` });
        return;
    }

    if (!round.served_at) {
        res.status(409).json({ error: "Round has not been served yet" });
        return;
    }

    // The deadline is enforced against the server's own served_at. A late
    // placement is refused outright, not merely scored zero.
    const relaxed = isRelaxed(req, sessionId);
    const hints = flushHints(req);

    if (!relaxed && isExpired(round.served_at, now, round.total_outputs)) {
        await db.markRoundTimedOut(round.id);

        const remaining = await nextPlayableRound(sessionId, now, relaxed);
        const finished = remaining ? null : await finishSession(sessionId, hints);

        res.status(200).json({
            outcome: "timed_out",
            roundEnded: true,
            pointsBanked: hintedHalf(pointsForPlacements(round.correct_placements), hints.hinted(round.id)),
            scoreSoFar: await db.scoreSoFar(sessionId, false, hints.hinted),
            // Teaching moment: the order they were reaching for, AND why it
            // is that order. The sequence alone only helps someone who already
            // knows the answer.
            correctSequence: await db.correctSequence(round.snippet_id),
            ...(await roundTeaching(userId, round.snippet_id, false)),
            yourSequence: (await db.listPlacements(round.id)).map((p) => p.output_text),
            complete: !remaining,
            round: remaining ? await serveRound(remaining, relaxed, hints) : null,
            session: finished ? summarize(finished, await db.listRounds(sessionId), hints) : null
        });
        return;
    }

    const output = await db.findOutput(parsed.data.outputId, round.snippet_id);

    if (!output) {
        res.status(400).json({ error: "Output does not belong to this round" });
        return;
    }

    const placementIndex = round.correct_placements + 1;
    const correct = isPlacementCorrect(output.position, placementIndex);
    const completesRound = correct && placementIndex === round.total_outputs;

    await db.recordPlacement({
        roundId: round.id,
        snippetId: round.snippet_id,
        outputId: output.id,
        outputText: output.output_text,
        placementIndex,
        isCorrect: correct,
        endsRound: !correct,
        completesRound
    });

    const roundEnded = !correct || completesRound;
    const banked = hintedHalf(
        pointsForPlacements(correct ? placementIndex : round.correct_placements),
        hints.hinted(round.id)
    );

    const remaining = roundEnded ? await nextPlayableRound(sessionId, now, relaxed) : null;
    const finished = roundEnded && !remaining ? await finishSession(sessionId, hints) : null;

    res.status(200).json({
        outcome: completesRound ? "round_complete" : correct ? "correct" : "wrong",
        roundEnded,
        pointsBanked: banked,
        // The multiplier is what a wrong guess forfeits, so show what the round
        // is actually worth once it is over.
        roundScore: roundEnded
            ? roundScore(correct ? placementIndex : round.correct_placements, completesRound, hints.hinted(round.id))
            : null,
        scoreSoFar: await db.scoreSoFar(sessionId, false, hints.hinted),
        // Revealed only once the round is over -- never while it is still in play.
        correctSequence: roundEnded ? await db.correctSequence(round.snippet_id) : null,
        ...(roundEnded
            ? await roundTeaching(userId, round.snippet_id, completesRound)
            : { explanation: null, credited: false }),
        yourSequence: roundEnded
            ? (await db.listPlacements(round.id)).map((p) => p.output_text)
            : null,
        complete: roundEnded && !remaining,
        // The NEXT round is deliberately not served here.
        //
        // serveRound stamps served_at, which starts the deadline. Bundling the
        // next round into this response started its clock while the client was
        // still showing the reveal for this one -- measured at 3.29s of a 60s
        // round, and worst exactly when the reveal is teaching something. The
        // client fetches the next round from GET /sessions/current once it is
        // ready to display it.
        //
        // A round that has NOT ended is still re-served: it is the same round,
        // served_at is already set, and markServed leaves it alone.
        round: roundEnded ? null : await serveRound((await db.findRound(round.id, sessionId))!, relaxed, hints),
        session: finished ? summarize(finished, await db.listRounds(sessionId), hints) : null
    });
});

// GET /api/flush/sessions/:id -- results.
// POST /api/flush/sessions/:id/hints -- show the next output to place, at a cost.
//
// Body: { roundId }. One hint per round: it names the output that comes next
// (by position), and that round then banks half (sessions/runHints.ts). Asking
// again returns the same output rather than a second hint. XP is unchanged.
flushRouter.post("/sessions/:id/hints", requireAuth, async (req: Request, res: Response) => {
    const roundId = String((req.body as { roundId?: unknown } | undefined)?.roundId ?? "");

    if (!/^[0-9]+$/.test(roundId)) {
        res.status(400).json({ error: "Invalid request" });
        return;
    }

    const sessionId = String(req.params.id);
    const session = await db.findFlushSessionForUser(sessionId, req.user!.id);

    if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
    }

    if (session.status !== "in_progress") {
        res.status(409).json({ error: `Session is ${session.status}` });
        return;
    }

    const round = await db.findRound(roundId, sessionId);

    if (!round) {
        res.status(404).json({ error: "Round not part of this session" });
        return;
    }

    if (round.status !== "pending" || !round.served_at) {
        res.status(409).json({ error: "That round is not on screen" });
        return;
    }

    const now = new Date();
    const relaxed = isRelaxed(req, sessionId);

    if (!relaxed && isExpired(round.served_at, now, round.total_outputs)) {
        res.status(409).json({ error: "Time is up on this round" });
        return;
    }

    const hints = flushHints(req);
    const already = hints.outputFor(round.id);
    const outputId = already ?? (await db.nextCorrectOutputId(round.snippet_id, round.correct_placements + 1));

    if (!outputId) {
        res.status(409).json({ error: "Nothing left to place in this round" });
        return;
    }

    if (!already) recordFlushHint(req, round.id, outputId);

    res.status(200).json({
        outputId,
        hinted: true,
        pointsBanked: hintedHalf(pointsForPlacements(round.correct_placements), true)
    });
});

flushRouter.get("/sessions/:id", requireAuth, async (req: Request, res: Response) => {
    const sessionId = String(req.params.id);
    const session = await db.findFlushSessionForUser(sessionId, req.user!.id);

    if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
    }

    res.status(200).json({ session: summarize(session, await db.listRounds(sessionId), flushHints(req)) });
});
