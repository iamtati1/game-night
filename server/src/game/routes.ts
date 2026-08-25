import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth/middleware.js";
import { countEligibleQuestions } from "../questions/queries.js";
import { CODE_BLITZ } from "../games/constants.js";
import {
    averageDurationMs,
    longestStreak,
    successRate,
    type PlayedUnit
} from "../games/progress.js";
import {
    findActiveSession,
    findResumableSession,
    resumePausedSession
} from "../sessions/queries.js";
import { wantsFreshSession } from "../sessions/schemas.js";
import { isActiveSessionConflict } from "./conflicts.js";
import { ensureQuestionPool } from "../questions/topUp.js";
import * as db from "./queries.js";
import { submitAnswerSchema } from "./schemas.js";
import {
    QUESTIONS_PER_SESSION,
    QUESTION_TIME_LIMIT_MS,
    isExpired,
    pointsForAnswer,
    scoreForSession,
    xpForSession
} from "./scoring.js";

export const gameRouter = Router();

// requireAuth is attached per route rather than with gameRouter.use(). Because
// this router is mounted at /api, a router-wide guard would intercept every
// unmatched /api/* path and answer 401 instead of letting it fall through to
// the JSON 404 handler.

interface ServedQuestion {
    sessionQuestionId: string;
    displayOrder: number;
    questionNumber: number;
    totalQuestions: number;
    prompt: string;
    options: { id: string; text: string }[];
    servedAt: string;
    deadlineAt: string;
    msRemaining: number;
}

/** Fisher-Yates. Option order is randomized per serve and never persisted; the
 *  client answers with an option id, so position carries no meaning. */
function shuffle<T>(items: T[]): T[] {
    const copy = [...items];

    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }

    return copy;
}

function summarize(session: db.GameSessionRow, questions: db.SessionQuestionRow[]) {
    // This run's own shape, computed with the same rules the cross-run figures
    // use, so a result screen and a trend can never disagree about what a streak
    // is or which answers count as timed.
    const units: PlayedUnit[] = questions.map((q) => ({
        success: q.is_correct === true,
        durationMs:
            q.served_at && q.answered_at
                ? q.answered_at.getTime() - q.served_at.getTime()
                : null
    }));

    return {
        bestStreak: longestStreak(units),
        averageResponseMs: averageDurationMs(units),
        successRate: successRate(units),
        id: session.id,
        status: session.status,
        score: session.score,
        xpEarned: session.xp_earned,
        startedAt: session.started_at.toISOString(),
        completedAt: session.completed_at?.toISOString() ?? null,
        totalQuestions: questions.length,
        correctCount: questions.filter((q) => q.is_correct === true).length,
        incorrectCount: questions.filter((q) => q.is_correct === false).length,
        timedOutCount: questions.filter((q) => q.status === "timed_out").length,
        // Everything below reads from snapshots, so a later edit to the source
        // question cannot rewrite what this player saw.
        questions: questions.map((q) => ({
            displayOrder: q.display_order,
            prompt: q.prompt_text,
            status: q.status,
            selectedOption: q.selected_option_text,
            correctOption: q.correct_option_text,
            isCorrect: q.is_correct,
            responseTimeMs:
                q.served_at && q.answered_at
                    ? q.answered_at.getTime() - q.served_at.getTime()
                    : null,
            pointsAwarded:
                q.is_correct === true && q.served_at && q.answered_at
                    ? pointsForAnswer(true, q.answered_at.getTime() - q.served_at.getTime())
                    : 0
        }))
    };
}

/**
 * The "another game is running" body. Shared by the start route's up-front check
 * and its post-resume recheck, so the two cannot drift apart.
 */
function conflictBody(active: { gameSlug: string; gameName: string }) {
    return {
        error: "Another game is in progress",
        details: [
            {
                field: "game",
                message: `You have a ${active.gameName} game in progress. Resume it, pause it, or quit it before starting Code Blitz.`
            }
        ],
        activeGame: { slug: active.gameSlug, name: active.gameName }
    };
}

/**
 * The "you already have a game" response. Extracted so the concurrent-request
 * handler below can reuse it rather than duplicating the completion branch.
 */
async function respondResumed(
    res: Response,
    session: db.GameSessionRow,
    now: Date
): Promise<void> {
    const question = await nextPlayableQuestion(session.id, now);

    if (!question) {
        const finished = await finishSession(session.id);
        res.status(200).json({
            resumed: true,
            session: summarize(finished, await db.listSessionQuestions(finished.id))
        });
        return;
    }

    res.status(200).json({
        resumed: true,
        sessionId: session.id,
        scoreSoFar: await db.scoreSoFar(session.id),
        question: await serveQuestion(question)
    });
}

async function finishSession(sessionId: string): Promise<db.GameSessionRow> {
    const questions = await db.listSessionQuestions(sessionId);
    const scored = questions.map((q) => ({
        isCorrect: q.is_correct,
        servedAt: q.served_at,
        answeredAt: q.answered_at
    }));

    return db.completeSession(sessionId, scoreForSession(scored), xpForSession(scored));
}

/**
 * Adjudicates any pending question whose 30s window has passed, then returns the
 * next genuinely playable question. Timeouts are resolved lazily on the next
 * request rather than by a background job.
 */
async function nextPlayableQuestion(
    sessionId: string,
    now: Date
): Promise<db.SessionQuestionRow | null> {
    for (;;) {
        const question = await db.findNextPendingQuestion(sessionId);

        if (!question) {
            return null;
        }

        if (question.served_at && isExpired(question.served_at, now)) {
            const correct = await db.findCorrectOptionText(question.question_id);
            await db.recordTimeout(question.id, correct ?? "(unavailable)");
            continue;
        }

        return question;
    }
}

async function serveQuestion(question: db.SessionQuestionRow): Promise<ServedQuestion> {
    const servedAt = question.served_at ?? (await db.markServed(question.id));
    const options = await db.listActiveOptions(question.question_id);
    const deadline = servedAt.getTime() + QUESTION_TIME_LIMIT_MS;

    return {
        sessionQuestionId: question.id,
        displayOrder: question.display_order,
        questionNumber: question.display_order,
        totalQuestions: QUESTIONS_PER_SESSION,
        prompt: question.prompt_text,
        // Note what is absent: is_correct and correct_option_text never appear here.
        options: shuffle(options).map((o) => ({ id: o.id, text: o.option_text })),
        servedAt: servedAt.toISOString(),
        deadlineAt: new Date(deadline).toISOString(),
        msRemaining: Math.max(0, deadline - Date.now())
    };
}

// POST /api/sessions -- resume this player's Code Blitz game, or deal a new one.
//
// Body: { fresh?: boolean }. Default false, i.e. resume. "Start New Game" sends
// fresh: true, which discards the unfinished session inside the same transaction
// that creates its replacement.
gameRouter.post("/sessions", requireAuth, async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const now = new Date();
    const fresh = wantsFreshSession(req.body);
    const active = await findActiveSession(userId);

    // The one-active-session index is scoped to the user, not to (user, game).
    // Without this check Code Blitz's resume path would adopt another game's
    // session, find none of its own questions, and "complete" it with a score of
    // zero.
    //
    // Checked before `fresh` is honoured: fresh means "discard MY unfinished Code
    // Blitz game", never "discard whatever else is running". A Flush game must be
    // dealt with on its own page, deliberately.
    if (active && active.gameSlug !== CODE_BLITZ) {
        res.status(409).json(conflictBody(active));
        return;
    }

    const existing = fresh ? null : await findResumableSession(userId, CODE_BLITZ);

    if (existing) {
        if (existing.status === "paused") {
            const resumed = await resumePausedSession(userId, CODE_BLITZ);

            if (resumed.outcome === "blocked") {
                // Another game went live between the check above and the status
                // flip. The one-active index caught it; report the same choice
                // rather than a 500.
                const holder = await findActiveSession(userId);

                res.status(409).json(
                    holder
                        ? conflictBody(holder)
                        : { error: "Another game is in progress" }
                );
                return;
            }

            // "none" means it stopped being paused underneath us. Fall through --
            // the status check below decides whether it is still playable.
        }

        const full = await db.findSessionForUser(existing.id, userId);

        if (full && full.status === "in_progress") {
            await respondResumed(res, full, now);
            return;
        }
    }

    // Optional top-up. Never throws, never contacts the provider when the local
    // pool is already healthy, and never turns a provider failure into a 500.
    await ensureQuestionPool();

    const available = await countEligibleQuestions();

    if (available < QUESTIONS_PER_SESSION) {
        res.status(503).json({
            error: "Not enough questions available",
            details: [
                {
                    field: "questions",
                    message: `Need ${QUESTIONS_PER_SESSION} active questions, found ${available}`
                }
            ]
        });
        return;
    }

    let session: db.GameSessionRow;

    try {
        session = await db.createSessionWithQuestions(userId);
    } catch (err) {
        // The check above (findInProgressSession) and this insert are not atomic,
        // so two concurrent requests can both pass the check -- React StrictMode
        // double-invoking an effect is enough to trigger it. Rather than repeat
        // the check-then-insert race, let the database arbitrate: whichever
        // request loses the unique index resumes the winner's session, which is
        // the correct outcome anyway.
        if (!isActiveSessionConflict(err)) {
            throw err;
        }

        // Re-read with the game included. The winner of a Code Blitz race is a
        // Code Blitz session, but checking keeps this path from ever adopting
        // another game's session the way the block above used to.
        const winner = await findActiveSession(userId);

        if (!winner || winner.gameSlug !== CODE_BLITZ) {
            // The winner vanished, or belongs to another game. Nothing sensible
            // to resume, so surface the original failure.
            throw err;
        }

        const full = await db.findSessionForUser(winner.id, userId);

        if (!full) {
            throw err;
        }

        await respondResumed(res, full, now);
        return;
    }

    const question = await nextPlayableQuestion(session.id, now);

    res.status(201).json({
        resumed: false,
        sessionId: session.id,
        scoreSoFar: 0,
        question: question ? await serveQuestion(question) : null
    });
});

// GET /api/sessions/current -- the question on screen. Fetching starts its timer.
gameRouter.get("/sessions/current", requireAuth, async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const now = new Date();
    const active = await findActiveSession(userId);

    // Same exposure as the start route: without the game check this endpoint
    // would complete another game's session on its way to reporting "no
    // questions left".
    if (!active || active.gameSlug !== CODE_BLITZ) {
        res.status(404).json({ error: "No Code Blitz game in progress" });
        return;
    }

    const session = await db.findSessionForUser(active.id, userId);

    if (!session) {
        res.status(404).json({ error: "No Code Blitz game in progress" });
        return;
    }

    const question = await nextPlayableQuestion(session.id, now);

    if (!question) {
        const finished = await finishSession(session.id);
        res.status(200).json({
            complete: true,
            session: summarize(finished, await db.listSessionQuestions(finished.id))
        });
        return;
    }

    res.status(200).json({
        complete: false,
        sessionId: session.id,
        scoreSoFar: await db.scoreSoFar(session.id),
        question: await serveQuestion(question)
    });
});

// POST /api/sessions/:id/answers -- the server decides correctness and timing.
gameRouter.post("/sessions/:id/answers", requireAuth, async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const now = new Date();
    const parsed = submitAnswerSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ error: "Invalid request" });
        return;
    }

    // Express 5 types a route param as string | string[]; coerce to the scalar.
    const sessionId = String(req.params.id);
    const session = await db.findSessionForUser(sessionId, userId);

    // 404 rather than 403: do not confirm that someone else's session id exists.
    if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
    }

    if (session.status !== "in_progress") {
        res.status(409).json({ error: `Session is ${session.status}` });
        return;
    }

    const question = await db.findSessionQuestion(parsed.data.sessionQuestionId, session.id);

    if (!question) {
        res.status(404).json({ error: "Question not part of this session" });
        return;
    }

    if (question.status !== "pending") {
        res.status(409).json({ error: `Question already ${question.status}` });
        return;
    }

    if (!question.served_at) {
        res.status(409).json({ error: "Question has not been served yet" });
        return;
    }

    const correctOptionText = (await db.findCorrectOptionText(question.question_id)) ?? "(unavailable)";

    // The deadline is enforced here, against the server's own served_at. A late
    // answer is refused outright, not merely scored zero.
    if (isExpired(question.served_at, now)) {
        await db.recordTimeout(question.id, correctOptionText);

        const remaining = await nextPlayableQuestion(session.id, now);
        const finished = remaining ? null : await finishSession(session.id);

        res.status(200).json({
            outcome: "timed_out",
            pointsAwarded: 0,
            scoreSoFar: await db.scoreSoFar(session.id),
            correctOption: correctOptionText,
            complete: !remaining,
            // The next question is deliberately not served here. serveQuestion
            // stamps served_at, which starts the deadline -- bundling it into this
            // response started the clock while the client was still showing
            // feedback, costing a measured 1.77s of a 35s window. The client
            // fetches it from GET /sessions/current when it is ready to show it.
            question: null,
            session: finished
                ? summarize(finished, await db.listSessionQuestions(finished.id))
                : null
        });
        return;
    }

    const option = await db.findOption(parsed.data.selectedOptionId, question.question_id);

    if (!option) {
        res.status(400).json({ error: "Option does not belong to this question" });
        return;
    }

    const answeredAt = await db.recordAnswer(
        question.id,
        option.id,
        option.optionText,
        correctOptionText,
        option.isCorrect
    );

    const elapsedMs = answeredAt.getTime() - question.served_at.getTime();
    const pointsAwarded = pointsForAnswer(option.isCorrect, elapsedMs);

    const remaining = await nextPlayableQuestion(session.id, now);
    const finished = remaining ? null : await finishSession(session.id);

    res.status(200).json({
        outcome: option.isCorrect ? "correct" : "incorrect",
        pointsAwarded,
        scoreSoFar: await db.scoreSoFar(session.id),
        responseTimeMs: elapsedMs,
        correctOption: correctOptionText,
        complete: !remaining,
        // Not served here -- see the note in the timeout branch above.
        question: null,
        session: finished ? summarize(finished, await db.listSessionQuestions(finished.id)) : null
    });
});

// GET /api/sessions/:id -- results, rendered entirely from snapshots.
gameRouter.get("/sessions/:id", requireAuth, async (req: Request, res: Response) => {
    const sessionId = String(req.params.id);
    const session = await db.findSessionForUser(sessionId, req.user!.id);

    if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
    }

    res.status(200).json({ session: summarize(session, await db.listSessionQuestions(session.id)) });
});
