import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth/middleware.js";
import { toFieldErrors } from "../auth/schemas.js";
import * as db from "./queries.js";
import { placementSchema } from "./schemas.js";
import {
    FLUSH_ROUNDS_PER_SESSION,
    FLUSH_ROUND_TIME_LIMIT_MS,
    isExpired,
    isPlacementCorrect,
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

async function sessionScore(sessionId: string): Promise<number> {
    const rounds = await db.listRounds(sessionId);

    return scoreForSession(
        rounds.map((r) => ({ correctPlacements: r.correct_placements, status: r.status }))
    );
}

function summarize(session: db.FlushSessionRow, rounds: db.FlushRoundRow[]) {
    return {
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
            pointsAwarded: roundScore(r.correct_placements, r.status === "completed")
        }))
    };
}

async function finishSession(sessionId: string): Promise<db.FlushSessionRow> {
    const rounds = await db.listRounds(sessionId);
    const scored = rounds.map((r) => ({
        correctPlacements: r.correct_placements,
        status: r.status
    }));

    return db.completeSession(sessionId, scoreForSession(scored), xpForSession(scored));
}

/**
 * Adjudicates any pending round whose 60s window has passed, then returns the
 * next genuinely playable one. Timeouts resolve lazily on the next request
 * rather than by a background job, matching Code Blitz.
 */
async function nextPlayableRound(
    sessionId: string,
    now: Date
): Promise<db.FlushRoundRow | null> {
    for (;;) {
        const round = await db.findNextPendingRound(sessionId);

        if (!round) {
            return null;
        }

        if (round.served_at && isExpired(round.served_at, now)) {
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
async function serveRound(round: db.FlushRoundRow) {
    const servedAt = round.served_at ?? (await db.markServed(round.id));
    const [tiles, placed] = await Promise.all([
        db.listTiles(round.snippet_id),
        db.listPlacements(round.id)
    ]);
    const deadline = servedAt.getTime() + FLUSH_ROUND_TIME_LIMIT_MS;
    const placedIds = new Set(placed.map((p) => p.output_id));

    return {
        roundId: round.id,
        roundNumber: round.display_order,
        totalRounds: FLUSH_ROUNDS_PER_SESSION,
        prompt: round.prompt_text,
        // Tiles already placed are returned separately so the client can render
        // them in their slots rather than back in the pool.
        tiles: shuffle(tiles.filter((t) => !placedIds.has(t.id))),
        placed: placed.map((p) => ({ outputId: p.output_id, text: p.output_text })),
        totalOutputs: round.total_outputs,
        pointsBanked: pointsForPlacements(round.correct_placements),
        servedAt: servedAt.toISOString(),
        deadlineAt: new Date(deadline).toISOString(),
        msRemaining: Math.max(0, deadline - Date.now())
    };
}

// POST /api/flush/sessions -- start a new game, or resume one in progress.
flushRouter.post("/sessions", requireAuth, async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const now = new Date();
    const active = await db.findActiveSessionWithGame(userId);

    if (active) {
        // One in-progress session per user, across all games. Rather than
        // silently destroying a Code Blitz game the player may be nine questions
        // into, say which game is running and let them decide.
        if (active.game_slug !== "flush") {
            res.status(409).json({
                error: "Another game is in progress",
                details: [
                    {
                        field: "game",
                        message: `You have a ${active.game_slug} game in progress. Finish it before starting Flush.`
                    }
                ],
                activeGame: active.game_slug
            });
            return;
        }

        const round = await nextPlayableRound(active.id, now);

        if (!round) {
            const finished = await finishSession(active.id);
            res.status(200).json({
                resumed: true,
                session: summarize(finished, await db.listRounds(finished.id))
            });
            return;
        }

        res.status(200).json({
            resumed: true,
            sessionId: active.id,
            scoreSoFar: await sessionScore(active.id),
            round: await serveRound(round)
        });
        return;
    }

    const available = await db.countEligibleSnippets();

    if (available < FLUSH_ROUNDS_PER_SESSION) {
        res.status(503).json({
            error: "Not enough snippets available",
            details: [
                {
                    field: "snippets",
                    message: `Need ${FLUSH_ROUNDS_PER_SESSION} playable snippets, found ${available}`
                }
            ]
        });
        return;
    }

    const session = await db.createSessionWithRounds(userId);
    const round = await nextPlayableRound(session.id, now);

    res.status(201).json({
        resumed: false,
        sessionId: session.id,
        scoreSoFar: 0,
        round: round ? await serveRound(round) : null
    });
});

// GET /api/flush/sessions/current -- the round on screen. Fetching starts its clock.
flushRouter.get("/sessions/current", requireAuth, async (req: Request, res: Response) => {
    const now = new Date();
    const active = await db.findActiveSessionWithGame(req.user!.id);

    if (!active || active.game_slug !== "flush") {
        res.status(404).json({ error: "No Flush game in progress" });
        return;
    }

    const round = await nextPlayableRound(active.id, now);

    if (!round) {
        const finished = await finishSession(active.id);
        res.status(200).json({
            complete: true,
            session: summarize(finished, await db.listRounds(finished.id))
        });
        return;
    }

    res.status(200).json({
        complete: false,
        sessionId: active.id,
        scoreSoFar: await sessionScore(active.id),
        round: await serveRound(round)
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
    const session = await db.findFlushSessionForUser(sessionId, req.user!.id);

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
    if (isExpired(round.served_at, now)) {
        await db.markRoundTimedOut(round.id);

        const remaining = await nextPlayableRound(sessionId, now);
        const finished = remaining ? null : await finishSession(sessionId);

        res.status(200).json({
            outcome: "timed_out",
            roundEnded: true,
            pointsBanked: pointsForPlacements(round.correct_placements),
            scoreSoFar: await sessionScore(sessionId),
            // Teaching moment: show the order they were reaching for.
            correctSequence: await db.correctSequence(round.snippet_id),
            yourSequence: (await db.listPlacements(round.id)).map((p) => p.output_text),
            complete: !remaining,
            round: remaining ? await serveRound(remaining) : null,
            session: finished ? summarize(finished, await db.listRounds(sessionId)) : null
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
    const banked = pointsForPlacements(correct ? placementIndex : round.correct_placements);

    const remaining = roundEnded ? await nextPlayableRound(sessionId, now) : null;
    const finished = roundEnded && !remaining ? await finishSession(sessionId) : null;

    res.status(200).json({
        outcome: completesRound ? "round_complete" : correct ? "correct" : "wrong",
        roundEnded,
        pointsBanked: banked,
        // The multiplier is what a wrong guess forfeits, so show what the round
        // is actually worth once it is over.
        roundScore: roundEnded
            ? roundScore(correct ? placementIndex : round.correct_placements, completesRound)
            : null,
        scoreSoFar: await sessionScore(sessionId),
        // Revealed only once the round is over -- never while it is still in play.
        correctSequence: roundEnded ? await db.correctSequence(round.snippet_id) : null,
        yourSequence: roundEnded
            ? (await db.listPlacements(round.id)).map((p) => p.output_text)
            : null,
        complete: roundEnded && !remaining,
        round: roundEnded
            ? remaining
                ? await serveRound(remaining)
                : null
            : await serveRound((await db.findRound(round.id, sessionId))!),
        session: finished ? summarize(finished, await db.listRounds(sessionId)) : null
    });
});

// GET /api/flush/sessions/:id -- results.
flushRouter.get("/sessions/:id", requireAuth, async (req: Request, res: Response) => {
    const sessionId = String(req.params.id);
    const session = await db.findFlushSessionForUser(sessionId, req.user!.id);

    if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
    }

    res.status(200).json({ session: summarize(session, await db.listRounds(sessionId)) });
});
