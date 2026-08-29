import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth/middleware.js";
import { toFieldErrors } from "../auth/schemas.js";
import { REACTION } from "../games/constants.js";
import { findActiveSession, findResumableSession, resumePausedSession } from "../sessions/queries.js";
import { wantsFreshSession } from "../sessions/schemas.js";
import * as db from "./queries.js";
import { reactionRoundSchema } from "./schemas.js";
import {
    REACTION_ROUNDS_PER_SESSION,
    averageReactionMs,
    bestReactionMs,
    isPlausibleReaction,
    isReacted,
    pointsForReaction,
    scoreForSession,
    tierFor,
    xpForSession
} from "./scoring.js";

export const reactionRouter = Router();

/**
 * TIMING INTEGRITY -- read this before changing anything here.
 *
 * The reaction itself is measured on the client with performance.now(), between
 * the frame that paints the signal and the player's interaction. The server
 * cannot reproduce that: it does not know when the browser painted, and a round
 * trip is an order of magnitude longer than the value being measured. Pretending
 * otherwise would make the number worse, not more trustworthy.
 *
 * So the server validates rather than recomputes. It remains authoritative over
 * everything it genuinely owns:
 *
 *   - session ownership        (findReactionSessionForUser scopes by user and game)
 *   - which round may be sent  (must belong to the session and still be pending)
 *   - duplicate submissions    (the UPDATE only matches a pending row)
 *   - plausibility            (80ms..5000ms, integer, also a CHECK on the table)
 *   - the score               (computed here from stored rounds, never sent up)
 *   - XP and completion       (same)
 *
 * What a determined player could still do is submit a plausible time they did not
 * earn. That is inherent to measuring human latency in a browser, and it is the
 * reason Reaction's numbers should not be pooled into a shared leaderboard
 * without a different integrity model.
 */

function summarize(session: db.ReactionSessionRow, rounds: db.ReactionRoundRow[]) {
    const scored = rounds.map((r) => ({ status: r.status, reactionMs: r.reaction_ms }));
    const best = bestReactionMs(scored);
    const average = averageReactionMs(scored);

    return {
        id: session.id,
        status: session.status,
        score: session.score,
        xpEarned: session.xp_earned,
        startedAt: session.started_at.toISOString(),
        completedAt: session.completed_at?.toISOString() ?? null,
        totalRounds: rounds.length,
        reactedRounds: scored.filter(isReacted).length,
        falseStarts: scored.filter((r) => r.status === "false_start").length,
        timeouts: scored.filter((r) => r.status === "timed_out").length,
        bestReactionMs: best,
        averageReactionMs: average,
        // The tier reads the average, not the best: one lucky round should not
        // relabel the whole run.
        tier: average === null ? null : tierFor(average),
        rounds: rounds.map((r) => ({
            roundNumber: r.display_order,
            status: r.status,
            reactionMs: r.reaction_ms,
            tier: r.reaction_ms === null ? null : tierFor(r.reaction_ms),
            pointsAwarded:
                r.status === "reacted" && r.reaction_ms !== null
                    ? pointsForReaction(r.reaction_ms)
                    : 0
        }))
    };
}

async function finishSession(sessionId: string): Promise<db.ReactionSessionRow> {
    const rounds = await db.listRounds(sessionId);
    const scored = rounds.map((r) => ({ status: r.status, reactionMs: r.reaction_ms }));

    return db.completeSession(sessionId, scoreForSession(scored), xpForSession(scored));
}

/** The round as the player sees it. There is nothing to hide: the challenge is
 *  the wait, and the wait is generated in the browser. */
async function serveRound(round: db.ReactionRoundRow) {
    await db.markServed(round.id);

    return {
        roundId: round.id,
        roundNumber: round.display_order,
        totalRounds: REACTION_ROUNDS_PER_SESSION
    };
}

function conflictBody(active: { gameSlug: string; gameName: string }) {
    return {
        error: "Another game is in progress",
        details: [
            {
                field: "game",
                message: `You have a ${active.gameName} game in progress. Resume it, pause it, or quit it before starting Reaction.`
            }
        ],
        activeGame: { slug: active.gameSlug, name: active.gameName }
    };
}

async function respondResumed(res: Response, sessionId: string): Promise<void> {
    const round = await db.findNextPendingRound(sessionId);

    if (!round) {
        const finished = await finishSession(sessionId);
        res.status(200).json({
            resumed: true,
            session: summarize(finished, await db.listRounds(sessionId))
        });
        return;
    }

    res.status(200).json({
        resumed: true,
        sessionId,
        scoreSoFar: await db.scoreSoFar(sessionId),
        round: await serveRound(round)
    });
}

// POST /api/reaction/sessions -- resume this player's run, or deal a new one.
reactionRouter.post("/sessions", requireAuth, async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const fresh = wantsFreshSession(req.body);
    const active = await findActiveSession(userId);

    if (active && active.gameSlug !== REACTION) {
        res.status(409).json(conflictBody(active));
        return;
    }

    const existing = fresh ? null : await findResumableSession(userId, REACTION);

    if (existing) {
        if (existing.status === "paused") {
            const resumed = await resumePausedSession(userId, REACTION);

            if (resumed.outcome === "blocked") {
                const holder = await findActiveSession(userId);

                res.status(409).json(
                    holder ? conflictBody(holder) : { error: "Another game is in progress" }
                );
                return;
            }
        }

        const full = await db.findReactionSessionForUser(existing.id, userId);

        if (full && full.status === "in_progress") {
            await respondResumed(res, existing.id);
            return;
        }
    }

    const session = await db.createSessionWithRounds(userId);
    const round = await db.findNextPendingRound(session.id);

    res.status(201).json({
        resumed: false,
        sessionId: session.id,
        scoreSoFar: 0,
        round: round ? await serveRound(round) : null
    });
});

// GET /api/reaction/sessions/current -- the round waiting to be played.
reactionRouter.get("/sessions/current", requireAuth, async (req: Request, res: Response) => {
    const active = await findActiveSession(req.user!.id);

    if (!active || active.gameSlug !== REACTION) {
        res.status(404).json({ error: "No Reaction game in progress" });
        return;
    }

    const round = await db.findNextPendingRound(active.id);

    if (!round) {
        const finished = await finishSession(active.id);
        res.status(200).json({
            complete: true,
            session: summarize(finished, await db.listRounds(active.id))
        });
        return;
    }

    res.status(200).json({
        complete: false,
        sessionId: active.id,
        scoreSoFar: await db.scoreSoFar(active.id),
        round: await serveRound(round)
    });
});

// POST /api/reaction/sessions/:id/rounds -- submit one resolved round.
reactionRouter.post("/sessions/:id/rounds", requireAuth, async (req: Request, res: Response) => {
    const parsed = reactionRoundSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ error: "Invalid request", details: toFieldErrors(parsed.error) });
        return;
    }

    const sessionId = String(req.params.id);
    const session = await db.findReactionSessionForUser(sessionId, req.user!.id);

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

    let resolved: db.ReactionRoundRow | null;

    if (parsed.data.outcome === "false_start") {
        resolved = await db.recordFalseStart(round.id);
    } else if (parsed.data.outcome === "timed_out") {
        // A real outcome, not a rejected request. Before this existed the client
        // had nothing to send once the deadline passed, so the round stayed
        // pending and the run could not be finished.
        resolved = await db.recordTimeout(round.id);
    } else {
        if (!isPlausibleReaction(parsed.data.reactionMs)) {
            res.status(400).json({
                error: "Implausible reaction time",
                details: [
                    {
                        field: "reactionMs",
                        message:
                            "A reaction must be between 80ms and 5000ms. " +
                            "Past 5000ms, send outcome \"timed_out\" instead."
                    }
                ]
            });
            return;
        }

        resolved = await db.recordReaction(round.id, parsed.data.reactionMs);
    }

    // Null means the row stopped being pending between the check above and the
    // write -- a double submit racing itself. The first one stands.
    if (!resolved) {
        res.status(409).json({ error: "Round already resolved" });
        return;
    }

    const remaining = await db.findNextPendingRound(sessionId);
    const finished = remaining ? null : await finishSession(sessionId);

    res.status(200).json({
        outcome: resolved.status,
        reactionMs: resolved.reaction_ms,
        tier: resolved.reaction_ms === null ? null : tierFor(resolved.reaction_ms),
        pointsAwarded:
            resolved.status === "reacted" && resolved.reaction_ms !== null
                ? pointsForReaction(resolved.reaction_ms)
                : 0,
        scoreSoFar: await db.scoreSoFar(sessionId),
        complete: !remaining,
        round: remaining ? await serveRound(remaining) : null,
        session: finished ? summarize(finished, await db.listRounds(sessionId)) : null
    });
});

// GET /api/reaction/sessions/:id -- results.
reactionRouter.get("/sessions/:id", requireAuth, async (req: Request, res: Response) => {
    const sessionId = String(req.params.id);
    const session = await db.findReactionSessionForUser(sessionId, req.user!.id);

    if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
    }

    res.status(200).json({ session: summarize(session, await db.listRounds(sessionId)) });
});
