import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth/middleware.js";
import { toFieldErrors } from "../auth/schemas.js";
import { MEMORY } from "../games/constants.js";
import { findActiveSession, findResumableSession, resumePausedSession } from "../sessions/queries.js";
import { wantsFreshSession } from "../sessions/schemas.js";
import * as db from "./queries.js";
import { memorySubmissionSchema } from "./schemas.js";
import {
    MEMORY_ROUNDS_PER_SESSION,
    bestSequenceLength,
    bestStreak,
    correctPositions,
    isPerfect,
    pointsForRound,
    recallAccuracy,
    scoreForSession,
    xpForSession
} from "./scoring.js";

export const memoryRouter = Router();

/**
 * WHAT THE SERVER GUARANTEES HERE -- read before changing anything.
 *
 * The sequence has to reach the client: showing it IS the game. So unlike Code
 * Blitz, this endpoint cannot withhold the answer, and a player with devtools
 * open can read the round they are about to be asked to remember.
 *
 * That is inherent to the medium, and it is the same shape as Reaction's timing:
 * the honest position is to be authoritative over everything else and to say
 * plainly what is not enforceable.
 *
 * The server remains authoritative over:
 *
 *   - the sequence itself       (generated and stored server-side at creation)
 *   - session ownership         (findMemorySessionForUser scopes by user and game)
 *   - which round may be sent   (must belong to the session and still be pending)
 *   - duplicate submissions     (the UPDATE only matches a pending row)
 *   - correctness               (compared here, never accepted from the client)
 *   - score, XP and completion  (computed from stored rounds)
 *
 * What it cannot prevent is a player choosing not to forget. That costs them the
 * only thing the game offers -- finding out whether they could have remembered --
 * so the incentive to cheat is the incentive to stop playing.
 */

function summarize(session: db.MemorySessionRow, rounds: db.MemoryRoundRow[]) {
    const scored = db.toScored(rounds);
    const answered = rounds.filter((r) => r.status === "answered");

    return {
        id: session.id,
        status: session.status,
        score: session.score,
        xpEarned: session.xp_earned,
        startedAt: session.started_at.toISOString(),
        completedAt: session.completed_at?.toISOString() ?? null,
        totalRounds: rounds.length,
        perfectRounds: scored.filter((r) => r.status === "answered" && r.perfect).length,
        bestStreak: bestStreak(scored),
        recallAccuracy: recallAccuracy(scored),
        bestSequenceLength: bestSequenceLength(scored),
        symbolsRemembered: answered.reduce((n, r) => n + (r.correct_positions ?? 0), 0),
        symbolsShown: answered.reduce((n, r) => n + r.sequence.length, 0),
        rounds: rounds.map((r) => ({
            roundNumber: r.display_order,
            status: r.status,
            length: r.sequence.length,
            // Revealed only once the round is answered. A results screen showing
            // an unplayed round's sequence would hand away a resumed session.
            sequence: r.status === "answered" ? r.sequence : null,
            submitted: r.submitted,
            correct: r.correct_positions,
            perfect: r.correct_positions === r.sequence.length,
            pointsAwarded:
                r.status === "answered"
                    ? pointsForRound(
                          r.sequence.length,
                          r.correct_positions ?? 0,
                          r.correct_positions === r.sequence.length
                      )
                    : 0
        }))
    };
}

async function finishSession(sessionId: string): Promise<db.MemorySessionRow> {
    const rounds = await db.listRounds(sessionId);
    const scored = db.toScored(rounds);

    return db.completeSession(sessionId, scoreForSession(scored), xpForSession(scored));
}

/** The round as the player sees it: the sequence to hold, and how long they get. */
async function serveRound(round: db.MemoryRoundRow) {
    await db.markServed(round.id);

    return {
        roundId: round.id,
        roundNumber: round.display_order,
        totalRounds: MEMORY_ROUNDS_PER_SESSION,
        sequence: round.sequence,
        displayMs: round.display_ms
    };
}

function conflictBody(active: { gameSlug: string; gameName: string }) {
    return {
        error: "Another game is in progress",
        details: [
            {
                field: "game",
                message: `You have a ${active.gameName} game in progress. Resume it, pause it, or quit it before starting Memory.`
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

// POST /api/memory/sessions -- resume this player's run, or deal a new one.
memoryRouter.post("/sessions", requireAuth, async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const fresh = wantsFreshSession(req.body);
    const active = await findActiveSession(userId);

    if (active && active.gameSlug !== MEMORY) {
        res.status(409).json(conflictBody(active));
        return;
    }

    const existing = fresh ? null : await findResumableSession(userId, MEMORY);

    if (existing) {
        if (existing.status === "paused") {
            const resumed = await resumePausedSession(userId, MEMORY);

            if (resumed.outcome === "blocked") {
                const holder = await findActiveSession(userId);

                res.status(409).json(
                    holder ? conflictBody(holder) : { error: "Another game is in progress" }
                );
                return;
            }
        }

        const full = await db.findMemorySessionForUser(existing.id, userId);

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

// GET /api/memory/sessions/current -- the round waiting to be played.
memoryRouter.get("/sessions/current", requireAuth, async (req: Request, res: Response) => {
    const active = await findActiveSession(req.user!.id);

    if (!active || active.gameSlug !== MEMORY) {
        res.status(404).json({ error: "No Memory game in progress" });
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

// POST /api/memory/sessions/:id/rounds -- play back one sequence.
memoryRouter.post("/sessions/:id/rounds", requireAuth, async (req: Request, res: Response) => {
    const parsed = memorySubmissionSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ error: "Invalid request", details: toFieldErrors(parsed.error) });
        return;
    }

    const sessionId = String(req.params.id);
    const session = await db.findMemorySessionForUser(sessionId, req.user!.id);

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

    // Correctness is decided here, against the stored sequence. The client sends
    // what the player pressed and nothing else.
    const correct = correctPositions(round.sequence, parsed.data.submitted);
    const perfect = isPerfect(round.sequence, parsed.data.submitted);

    const resolved = await db.recordSubmission(round.id, parsed.data.submitted, correct);

    // Null means the row stopped being pending between the check and the write --
    // a double submit racing itself. The first answer stands.
    if (!resolved) {
        res.status(409).json({ error: "Round already answered" });
        return;
    }

    const remaining = await db.findNextPendingRound(sessionId);
    const finished = remaining ? null : await finishSession(sessionId);

    res.status(200).json({
        correct,
        perfect,
        length: round.sequence.length,
        // Revealed now, and only now: the round is over, and seeing the two
        // sequences side by side is the whole feedback moment.
        sequence: round.sequence,
        submitted: parsed.data.submitted,
        pointsAwarded: pointsForRound(round.sequence.length, correct, perfect),
        scoreSoFar: await db.scoreSoFar(sessionId),
        complete: !remaining,
        round: remaining ? await serveRound(remaining) : null,
        session: finished ? summarize(finished, await db.listRounds(sessionId)) : null
    });
});

// GET /api/memory/sessions/:id -- results.
memoryRouter.get("/sessions/:id", requireAuth, async (req: Request, res: Response) => {
    const sessionId = String(req.params.id);
    const session = await db.findMemorySessionForUser(sessionId, req.user!.id);

    if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
    }

    res.status(200).json({ session: summarize(session, await db.listRounds(sessionId)) });
});
