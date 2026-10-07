import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth/middleware.js";
import { countDealableQuestions } from "../questions/queries.js";
import { CODE_BLITZ } from "../games/constants.js";
import { seededShuffle } from "../games/optionOrder.js";
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
import { requestedFocusTopic, wantsFreshSession } from "../sessions/schemas.js";
import { findCurrentConcept, findJourneyPath } from "../curriculum/lessons.js";
import { isActiveSessionConflict, resolveSessionRace } from "./conflicts.js";
import { ensureQuestionPool } from "../questions/topUp.js";
import * as db from "./queries.js";
import { submitAnswerSchema } from "./schemas.js";
import {
    QUESTIONS_PER_SESSION,
    isExpired,
    stanceFor,
    timeLimitFor,
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
    /**
     * Set when this beat is practice for the concept the learner is on.
     *
     * The visible half of concept targeting: FOCUS_SLOTS reserves beats 1 and 6
     * for the current concept, and until now nothing told the player that had
     * happened, so the connection between what they were studying and what the
     * game asked was invisible.
     */
    practisingNow: { conceptSlug: string; conceptName: string; demandSlug: string } | null;
    /** The curriculum unit this question belongs to, so the client can name
     *  what is being practised and decide whether to teach it first. */
    topic: string | null;
    /** Which mechanic answers it: pick one option, or assemble tokens. */
    challengeType: string;
    questionNumber: number;
    totalQuestions: number;
    prompt: string;
    options: { id: string; text: string }[];
    servedAt: string;
    /** Null when this beat has no clock. */
    deadlineAt: string | null;
    /** Null when this beat has no clock. */
    msRemaining: number | null;
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
            topic: q.topic,
            explanation: q.explanation,
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
    now: Date,
    /** Needed only to mark whether the served beat is the learner's concept. */
    userId: string
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
        question: await serveQuestion(question, userId, session.id)
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
/**
 * How this round is going, in the vocabulary scoring.ts speaks.
 *
 * The mapping lives here rather than in scoring.ts because that module is
 * deliberately free of the database -- every rule in it is a pure function of
 * values passed in, which is what makes them testable without Postgres. One
 * helper at the boundary keeps it that way.
 */
async function roundStance(sessionId: string) {
    const answers = await db.listSessionQuestions(sessionId);

    return stanceFor(
        answers.map((a) => ({ status: a.status, isCorrect: a.is_correct }))
    );
}

async function nextPlayableQuestion(
    sessionId: string,
    now: Date
): Promise<db.SessionQuestionRow | null> {
    for (;;) {
        const question = await db.findNextPendingQuestion(sessionId);

        if (!question) {
            return null;
        }

        /* The sweep has to read the stance too. Without it a beat served with
           no clock -- because the learner had just missed twice -- would be
           timed out here by a deadline they were never shown. */
        const stance = await roundStance(sessionId);

        if (
            question.served_at &&
            isExpired(
                question.served_at,
                now,
                question.challenge_type,
                question.display_order,
                stance
            )
        ) {
            const correct = await db.findCorrectOptionText(question.question_id);
            await db.recordTimeout(question.id, correct ?? "(unavailable)");
            continue;
        }

        return question;
    }
}

/**
 * Marks a served question as practice for what the learner is studying now.
 *
 * SERVER-DECIDED, like the targeting itself. The browser is told "this one is
 * your current concept" and never works it out -- it has no authority over what
 * the learner is learning, and a client that could claim it could make any
 * question look like progress.
 *
 * Null for an untagged question, for a tagged question belonging to some other
 * concept, and for a learner with no current concept at all. The reserved beats
 * are the ones this is non-null for, which is what makes the reservation
 * something the player can SEE rather than only something that happened.
 */
async function currentConceptMark(
    userId: string,
    question: db.SessionQuestionRow
): Promise<{ conceptSlug: string; conceptName: string; demandSlug: string } | null> {
    const [tag, current] = await Promise.all([
        db.conceptForQuestion(question.question_id),
        findCurrentConcept(userId).catch(() => null)
    ]);

    return tag && current && tag.conceptSlug === current.slug ? tag : null;
}

async function serveQuestion(
    question: db.SessionQuestionRow,
    userId: string,
    sessionId: string
): Promise<ServedQuestion> {
    const servedAt = question.served_at ?? (await db.markServed(question.id));
    const options = await db.listActiveOptions(question.question_id);

    /*
     * HOW THE ROUND IS GOING, read from the answers already given in it.
     *
     * A learner who has just missed twice in a row gets no clock on this beat,
     * wherever they are in the round -- the support someone needs after two
     * misses is time to think, not a faster version of what they are already
     * failing. It lifts again as soon as they get one right.
     */
    const stance = await roundStance(sessionId);

    /* Null on an untimed beat -- the client shows no clock at all rather than
       a clock the learner is told to ignore. */
    const limit = timeLimitFor(question.challenge_type, question.display_order, stance);
    const deadline = limit === null ? null : servedAt.getTime() + limit;

    return {
        sessionQuestionId: question.id,
        displayOrder: question.display_order,
        topic: question.topic,
        practisingNow: await currentConceptMark(userId, question),
        challengeType: question.challenge_type,
        questionNumber: question.display_order,
        totalQuestions: QUESTIONS_PER_SESSION,
        prompt: question.prompt_text,
        // Note what is absent: is_correct and correct_option_text never appear here.
        // Seeded on the session question rather than Math.random(): a question is
        // re-served on refresh and on resume, and the options used to move each
        // time under a player who had already half-decided on one.
        options: seededShuffle(options, question.id).map((o) => ({
            id: o.id,
            text: o.option_text
        })),
        servedAt: servedAt.toISOString(),
        deadlineAt: deadline === null ? null : new Date(deadline).toISOString(),
        msRemaining: deadline === null ? null : Math.max(0, deadline - Date.now())
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
    const focusTopic = requestedFocusTopic(req.body);
    /**
     * THE CURRICULUM'S ANSWER, NOT THE CLIENT'S.
     *
     * Resolved here from findCurrentConcept -- which reads findJourneyPath, the
     * same authority the map and the Home page use -- and never read from the
     * request. There is deliberately no `concept` field in the body schema: a
     * client that could name the concept could aim a run at whichever rung it
     * wanted to clear, and rung clearing is evidence.
     *
     * `focusTopic` stays client-supplied because it is a pacing hint that
     * changes nothing about what may be earned; this is not, so it is not.
     *
     * A failure is not fatal. The learner gets an ordinary run rather than a
     * 500, which is the right trade for a hint: the curriculum gates that decide
     * what may be DEALT are in the candidate query and are unaffected.
     */
    const current = await findCurrentConcept(userId).catch(() => null);
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
            await respondResumed(res, full, now, userId);
            return;
        }
    }

    // Optional top-up. Never throws, never contacts the provider when the local
    // pool is already healthy, and never turns a provider failure into a 500.
    await ensureQuestionPool();

    // Counted with the same curriculum eligibility the dealer applies, not the
    // raw bank size. Checking the wider pool here would let a session start that
    // the candidate query cannot actually fill.
    const available = await countDealableQuestions(userId, QUESTIONS_PER_SESSION);

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
        session = await db.createSessionWithQuestions(userId, focusTopic, current?.id ?? null);
    } catch (err) {
        // The check at the top of this route and this INSERT are not atomic, so
        // the single active-session slot can change hands between them: a second
        // tab, a double-submit, or another game started on another device.
        // Rather than repeat the check-then-insert race, let the database
        // arbitrate and then answer whatever the new state actually calls for.
        if (!isActiveSessionConflict(err)) {
            throw err;
        }

        // Re-read with the game included, and let the resolver name the outcome.
        // Every branch below used to rethrow the rejected INSERT, which the app's
        // error handler turned into "Internal Server Error" -- for a situation
        // this same route answers with a conflict dialog eighty lines earlier.
        // Losing a race is not a server fault.
        const winner = await findActiveSession(userId);

        switch (resolveSessionRace(winner, CODE_BLITZ)) {
            case "conflict":
                // Another game took the slot between the check at the top of this
                // route and the INSERT. Identical to the pre-check's answer, and
                // the client already knows how to render it: activeGame in the
                // body is what raises the "one game at a time" dialog.
                res.status(409).json(conflictBody(winner!));
                return;

            case "retry":
                // The slot was held when the INSERT was rejected and is free now.
                // There is nothing to resume and no holder to name, so say what
                // actually happened rather than reporting a fault the player
                // cannot act on.
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
                const full = await db.findSessionForUser(winner!.id, userId);

                // The winner is this player's own Code Blitz session, so a miss
                // here means it stopped existing mid-request. Same situation as
                // "retry", same answer -- and still not a 500.
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

                await respondResumed(res, full, now, userId);
                return;
            }
        }
    }

    const question = await nextPlayableQuestion(session.id, now);

    res.status(201).json({
        resumed: false,
        sessionId: session.id,
        scoreSoFar: 0,
        question: question ? await serveQuestion(question, userId, session.id) : null
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
        question: await serveQuestion(question, userId, session.id)
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

    // For an assembly the "correct option" is the whole correct sequence, joined.
    // findCorrectOptionText reads the single is_correct row, which a complete-code
    // question does not have -- it has several, and their order matters.
    const correctOptionText =
        question.challenge_type === "complete-code"
            ? (await db.findAssemblyAnswer(question.question_id)).text
            : ((await db.findCorrectOptionText(question.question_id)) ?? "(unavailable)");
    // Null for questions written before explanations existed; the client simply
    // shows nothing extra for those rather than an empty panel.
    const explanation = await db.findExplanation(question.question_id);

    // The deadline is enforced here, against the server's own served_at. A late
    // answer is refused outright, not merely scored zero.
    /* The same stance the beat was SERVED under, so a learner cannot be timed
       out against a clock they were never shown. */
    const stance = await roundStance(session.id);

    if (
        isExpired(
            question.served_at,
            now,
            question.challenge_type,
            question.display_order,
            stance
        )
    ) {
        await db.recordTimeout(question.id, correctOptionText);

        const remaining = await nextPlayableQuestion(session.id, now);
        const finished = remaining ? null : await finishSession(session.id);

        res.status(200).json({
            outcome: "timed_out",
            pointsAwarded: 0,
            scoreSoFar: await db.scoreSoFar(session.id),
            correctOption: correctOptionText,
            explanation,
            complete: !remaining,
            // The next question is deliberately not served here. serveQuestion
            // stamps served_at, which starts the deadline -- bundling it into this
            // response started the clock while the client was still showing
            // feedback, costing a measured 1.77s of the window. The client
            // fetches it from GET /sessions/current when it is ready to show it.
            question: null,
            session: finished
                ? summarize(finished, await db.listSessionQuestions(finished.id))
                : null
        });
        return;
    }

    // Two answer shapes, one per challenge type. The question decides which is
    // acceptable -- a client cannot choose to answer an assembly question with a
    // single option id, or a four-option question with a sequence.
    const isAssembly = question.challenge_type === "complete-code";

    /** What the player answered, and whether it was right. Decided here, never by the client. */
    let selectedOptionId: string | null;
    let selectedText: string;
    let isCorrect: boolean;

    if (isAssembly) {
        if (!parsed.data.selectedOptionIds) {
            res.status(400).json({ error: "This question is answered by assembling tokens" });
            return;
        }

        const placed = await db.findOptionsInOrder(
            parsed.data.selectedOptionIds,
            question.question_id
        );

        if (!placed) {
            res.status(400).json({ error: "Option does not belong to this question" });
            return;
        }

        const answer = await db.findAssemblyAnswer(question.question_id);

        // Element by element, including length. Same tokens in another order is
        // a different answer, and for several of these questions it is the whole
        // point -- ++n and n++ are built from the same two tokens.
        isCorrect =
            placed.length === answer.ids.length &&
            placed.every((option, i) => option.id === answer.ids[i]);

        // No single option stands for an assembled answer, so the column that
        // would hold one stays null and the text carries what was built.
        selectedOptionId = null;
        selectedText = placed.map((option) => option.optionText).join(" ");
    } else {
        if (!parsed.data.selectedOptionId) {
            res.status(400).json({ error: "This question is answered by choosing one option" });
            return;
        }

        const option = await db.findOption(parsed.data.selectedOptionId, question.question_id);

        if (!option) {
            res.status(400).json({ error: "Option does not belong to this question" });
            return;
        }

        selectedOptionId = option.id;
        selectedText = option.optionText;
        isCorrect = option.isCorrect;
    }

    const answeredAt = await db.recordAnswer(
        question.id,
        selectedOptionId,
        selectedText,
        correctOptionText,
        isCorrect
    );

    const elapsedMs = answeredAt.getTime() - question.served_at.getTime();
    const pointsAwarded = pointsForAnswer(isCorrect, elapsedMs, question.challenge_type);

    const remaining = await nextPlayableQuestion(session.id, now);
    const finished = remaining ? null : await finishSession(session.id);

    res.status(200).json({
        outcome: isCorrect ? "correct" : "incorrect",
        pointsAwarded,
        scoreSoFar: await db.scoreSoFar(session.id),
        responseTimeMs: elapsedMs,
        correctOption: correctOptionText,
        explanation,
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

    /*
     * WHAT THIS ROUND CHANGED, from the server's own evidence.
     *
     * `earned` is derived from the session's correct answers on practise
     * challenges -- the same join CLEARED_RUNGS_CTE makes, narrowed to this
     * one run. `concept` and `rungs` are the learner's position now, read from
     * the curriculum path rather than counted in the browser.
     *
     * Nothing here demonstrates anything. Clearing a rung and demonstrating a
     * concept stay separate actions, and /demonstrate is still the only thing
     * that writes concept_demonstrations.
     */
    const [earned, current] = await Promise.all([
        db.rungsEarnedInSession(session.id),
        findCurrentConcept(req.user!.id).catch(() => null)
    ]);

    const path = current ? await findJourneyPath(req.user!.id).catch(() => null) : null;
    const standing = path
        ?.flatMap((t) => t.concepts)
        .find((concept) => concept.slug === current!.slug);

    res.status(200).json({
        session: summarize(session, await db.listSessionQuestions(session.id)),
        curriculum: {
            concept: current && standing ? { slug: current.slug, name: standing.name } : null,
            rungs: standing ? standing.rungs : null,
            earned
        }
    });
});
