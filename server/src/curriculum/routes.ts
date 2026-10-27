import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth/middleware.js";
import { QUESTIONS_PER_SESSION } from "../game/scoring.js";
import {
    findJourneyPath,
    findLearnerPoints,
    recordChallenge,
    recordDemonstration
} from "./lessons.js";
import {
    evidenceFor,
    findConceptState,
    findEncounterView,
    findExercise,
    isMissionChallenge,
    isPlayable,
    judgeAnswer,
    mayPlayChallenge,
    recordActivityCompletion,
    topicReadyForCheckpoint
} from "./encounter.js";
import {
    completeIntroduction,
    findJourney,
    findNextIntroduction,
    findTopicStanding
} from "./queries.js";
import { hasCheckpoint, judgeCheckpoint } from "./checkpoints.js";
import { RECENT_WINDOW, findPracticeRecord } from "./practiceRecord.js";

export const curriculumRouter = Router();

/**
 * Mounted at /api/curriculum. Two endpoints, both about one thing: the Learn
 * beat of Learn -> Play.
 *
 * Everything curricular stays on this side of the wire. The client is told WHICH
 * concept to introduce and reports that the learner acknowledged it; it never
 * decides whether a concept is reachable, whether an introduction is due, or
 * what counts as having met one. That is the same boundary the games keep --
 * the server decides correctness and timing, the client renders.
 *
 * requireAuth is attached per route rather than with router.use(), matching
 * gameRouter and sessionsRouter: a router-wide guard answers 401 for every
 * unmatched path under the mount instead of letting it fall through to the JSON
 * 404 handler.
 */

/**
 * GET /api/curriculum/introduction
 *
 * The next concept this learner should meet, or null. Always 200: having nothing
 * to introduce is the normal state for a learner who is up to date, not an
 * error, and a 404 here would have the client treating "you know this already"
 * as a failure.
 */
curriculumRouter.get("/introduction", requireAuth, async (req: Request, res: Response) => {
    const introduction = await findNextIntroduction(req.user!.id);

    res.status(200).json({ introduction });
});

/**
 * GET /api/curriculum/journey
 *
 * Where the learner is in JavaScript: what they have worked through, what they
 * are on now, and what is ahead.
 *
 * Reads the SAME ceiling that gates Code Blitz's candidate pool, so "this is
 * what you are learning now" and "these are the questions you are being dealt"
 * cannot disagree. Nothing is stored -- the position is derived from the runs
 * the learner has already played.
 */
curriculumRouter.get("/journey", requireAuth, async (req: Request, res: Response) => {
    const steps = await findJourney(req.user!.id, QUESTIONS_PER_SESSION);

    res.status(200).json({
        journey: steps,
        current: steps.find((s) => s.status === "current") ?? null,
        next: steps.find((s) => s.status === "upcoming" && s.stocked) ?? null
    });
});

/**
 * GET /api/curriculum/topics/:topic/standing
 *
 * Where the learner stands on one topic, concept by concept -- what they have
 * met, what they are on now, and what is still ahead.
 *
 * Derived, never stored, and deliberately not a score: this says what the
 * learner understands, where XP says how much they have played. Both can be
 * true at once and neither explains the other.
 */
curriculumRouter.get("/topics/:topic/standing", requireAuth, async (req: Request, res: Response) => {
    const topic = String(req.params.topic);

    // Rejected here rather than returning an empty list, so a typo reads as a
    // mistake instead of as a topic the learner has somehow finished.
    if (!/^[a-z][a-z0-9-]*$/.test(topic)) {
        res.status(404).json({ error: "No such topic" });
        return;
    }

    const concepts = await findTopicStanding(req.user!.id, topic);

    if (concepts.length === 0) {
        res.status(404).json({ error: "No such topic" });
        return;
    }

    res.status(200).json({
        topic,
        concepts,
        current: concepts.find((c) => c.status === "current") ?? null
    });
});

/**
 * GET /api/curriculum/concepts/:concept/encounter
 *
 * Everything the learner-facing encounter needs, decided here rather than in
 * React: which rungs the concept declares, what can be played at each, which
 * ones this learner has cleared, which rung is next, what the exercises may
 * assume they know, and which concept follows.
 *
 * ALWAYS 200 FOR A REAL CONCEPT, including one the learner cannot reach yet.
 * `reachable` and `unmetPrerequisites` say so, and a 403 would leave the world
 * unable to explain WHY something is locked -- which is the one thing a locked
 * door has to communicate.
 *
 * `playable` is reported separately from `reachable`: a concept can be open to a
 * learner and still have a declared rung with nothing built for it. Those are
 * different failures and the client should not have to infer one from the other.
 */
curriculumRouter.get(
    "/concepts/:concept/encounter",
    requireAuth,
    async (req: Request, res: Response) => {
        const concept = String(req.params.concept);

        // Same guard as the standing route: a typo should read as a mistake,
        // not as a concept with an empty ladder.
        if (!/^[a-z][a-z0-9-]*$/.test(concept)) {
            res.status(404).json({ error: "No such concept" });
            return;
        }

        const encounter = await findEncounterView(req.user!.id, concept);

        if (!encounter) {
            res.status(404).json({ error: "No such concept" });
            return;
        }

        res.status(200).json({ ...encounter, playable: isPlayable(encounter) });
    }
);

/**
 * GET /api/curriculum/path
 *
 * The JavaScript Journey: every topic, every concept, and where the learner
 * stands on each. This is what the Journey screen renders, and what the lesson
 * screen reads to know which concept is next.
 *
 * Exactly one concept in the whole journey is `current` -- the first one not yet
 * demonstrated. Everything after it is locked, which is the difference between a
 * path and a menu.
 */
curriculumRouter.get("/path", requireAuth, async (req: Request, res: Response) => {
    const [topics, points] = await Promise.all([
        findJourneyPath(req.user!.id),
        findLearnerPoints(req.user!.id)
    ]);
    const current = topics
        .flatMap((t) => t.concepts.map((c) => ({ ...c, topic: t.slug })))
        .find((c) => c.state === "current");

    // Points ride along with the path rather than living on their own endpoint:
    // the one screen that shows them is the one screen that shows progress, and
    // a second request would only be a second chance for the two to disagree.
    res.status(200).json({ topics, current: current ?? null, points });
});

/**
 * GET /api/curriculum/practice-record
 *
 * Every graded attempt this learner has made on content tagged to a concept,
 * counted per concept (practiceRecord.ts). Read only and never evidence: the
 * path above is what says what is cleared or demonstrated. The Skills page
 * reads it to show attempts, accuracy and recent form.
 */
curriculumRouter.get("/practice-record", requireAuth, async (req: Request, res: Response) => {
    res.status(200).json({ window: RECENT_WINDOW, concepts: await findPracticeRecord(req.user!.id) });
});

/**
 * POST /api/curriculum/concepts/:concept/demonstrate
 *
 * The learner finished a concept's lesson. Records it, and nothing else --
 * no XP, no score, no session. What it changes is what comes next.
 *
 * Body: { neededRetry?: boolean }.
 */
curriculumRouter.post(
    "/concepts/:concept/demonstrate",
    requireAuth,
    async (req: Request, res: Response) => {
        const concept = String(req.params.concept);

        if (!/^[a-z][a-z0-9-]*$/.test(concept)) {
            res.status(404).json({ error: "No such concept" });
            return;
        }

        const body = typeof req.body === "object" && req.body !== null ? req.body : {};
        const neededRetry = (body as { neededRetry?: unknown }).neededRetry === true;

        // The rung this demonstration is evidence of, where the activity knows
        // it. Validated as a slug shape only -- an unknown one resolves to NULL
        // in the insert rather than rejecting the request, because losing the
        // rung is a smaller loss than losing the demonstration.
        const rawDemand = (body as { demand?: unknown }).demand;
        const demand =
            typeof rawDemand === "string" && /^[a-z][a-z-]*$/.test(rawDemand) ? rawDemand : null;

        // EVIDENCE, NOT A CLAIM. The client asking to be marked complete is not
        // what completes a concept -- clearing every playable rung is. This
        // endpoint used to accept whatever it was told, which meant reading a
        // lesson unlocked the next concept.
        const state = await findConceptState(req.user!.id, concept);

        if (state === null) {
            res.status(404).json({ error: "No such concept" });
            return;
        }

        if (state === "locked") {
            res.status(403).json({ error: "That concept is not open yet" });
            return;
        }

        const evidence = await evidenceFor(req.user!.id, concept);

        if (!evidence.allowed) {
            res.status(409).json({
                error: evidence.unplayable
                    ? "Nothing is built for this concept yet"
                    : "Not everything here has been done yet",
                outstanding: evidence.outstanding,
                unplayable: evidence.unplayable
            });
            return;
        }

        const recorded = await recordDemonstration(req.user!.id, concept, neededRetry, demand);

        if (!recorded) {
            res.status(404).json({ error: "No such concept" });
            return;
        }

        res.status(200).json({ demonstrated: true, concept });
    }
);

/**
 * POST /api/curriculum/topics/:topic/challenge
 *
 * The learner passed a topic's cumulative challenge. This is what completes the
 * topic and opens the next one -- walking every lesson alone does not.
 *
 * Body: `{ answers: [{ choice, retry? }, ...] }`, one per checkpoint question,
 * judged here against the server's key (checkpoints.ts). It used to read only
 * `neededRetry`, so an empty request passed.
 *
 *     404  no such topic, or the topic has no checkpoint
 *     409  not every concept in the topic is demonstrated yet
 *     400  the answers do not describe a walk through this checkpoint
 *     422  an answer was wrong: nothing recorded, the learner can try again
 */
curriculumRouter.post(
    "/topics/:topic/challenge",
    requireAuth,
    async (req: Request, res: Response) => {
        const topic = String(req.params.topic);

        if (!/^[a-z][a-z0-9-]*$/.test(topic)) {
            res.status(404).json({ error: "No such topic" });
            return;
        }

        // A topic with no authored checkpoint has nothing to pass. Recording one
        // anyway paid POINTS_PER_CHALLENGE for a checkpoint that does not exist.
        if (!hasCheckpoint(topic)) {
            res.status(404).json({ error: "No checkpoint for this topic" });
            return;
        }

        const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as {
            answers?: unknown;
            neededRetry?: unknown;
        };

        // EVIDENCE, NOT A CLAIM -- the same rule /demonstrate follows. Without
        // this, posting here completed the topic and opened the next one
        // regardless of what the learner had actually done.
        const standing = await topicReadyForCheckpoint(req.user!.id, topic);

        if (standing === null) {
            res.status(404).json({ error: "No such topic" });
            return;
        }

        if (!standing.ready) {
            res.status(409).json({
                error: "Not every concept in this topic has been demonstrated yet",
                outstanding: standing.outstanding
            });
            return;
        }

        const verdict = judgeCheckpoint(topic, body.answers);

        if (verdict.outcome === "malformed") {
            res.status(400).json({ error: verdict.reason });
            return;
        }

        if (verdict.outcome === "failed") {
            res.status(422).json({ error: "Not every checkpoint answer was right. Try the checkpoint again." });
            return;
        }

        // Derived from the answers. The browser's flag can still ADD a retry --
        // the mission half is browser-reported, and admitting a struggle
        // inflates nothing -- but it can no longer hide one.
        const neededRetry = verdict.neededRetry || body.neededRetry === true;

        const recorded = await recordChallenge(req.user!.id, topic, neededRetry);

        if (!recorded) {
            res.status(404).json({ error: "No such topic" });
            return;
        }

        res.status(200).json({ completed: true, topic });
    }
);

/**
 * POST /api/curriculum/introductions/:challengeId/complete
 *
 * The learner has read the beat and pressed the button. This is the moment a
 * concept becomes encountered, and the only write in the curriculum layer.
 *
 * It records that the introduction HAPPENED -- not that it was understood, and
 * not that anything was answered. No score, no XP, no session.
 *
 * 404 rather than 403 for a challenge that is not an introduction this learner
 * may complete: the id came from the client, and confirming that some other
 * challenge exists is not this endpoint's business.
 */
curriculumRouter.post(
    "/introductions/:challengeId/complete",
    requireAuth,
    async (req: Request, res: Response) => {
        // Express 5 types a route param as string | string[]; coerce to the scalar.
        const challengeId = String(req.params.challengeId);

        // Rejected here rather than by the database, so a typo in the URL is a
        // 404 and not a 22P02 turned into a 500.
        if (!/^\d+$/.test(challengeId)) {
            res.status(404).json({ error: "No such introduction" });
            return;
        }

        const introduction = await completeIntroduction(req.user!.id, challengeId);

        if (!introduction) {
            res.status(404).json({ error: "No such introduction" });
            return;
        }

        res.status(200).json({ completed: true, introduction });
    }
);

/**
 * POST /api/curriculum/challenges/:challenge/completion
 *
 * A mission movement was finished. This is the evidence arm for activities
 * judged in the browser -- Code Blitz and Bug Hunt write their own attempt rows,
 * and a movement has none. The cleared-rung derivation reads all three alike.
 *
 * Body: { neededRetry?: boolean }.
 *
 * Deliberately NOT a demonstration. Finishing one movement clears one rung; it
 * says nothing about whether the concept as a whole is done, which stays the
 * /demonstrate endpoint's decision and the world's meaning of completion.
 */
curriculumRouter.post(
    "/challenges/:challenge/completion",
    requireAuth,
    async (req: Request, res: Response) => {
        const challenge = String(req.params.challenge);

        if (!/^[0-9]+$/.test(challenge)) {
            res.status(404).json({ error: "No such challenge" });
            return;
        }

        const body = typeof req.body === "object" && req.body !== null ? req.body : {};
        if (!(await mayPlayChallenge(req.user!.id, challenge))) {
            res.status(403).json({ error: "That concept is not open yet" });
            return;
        }

        // Only a mission movement may be reported done by the browser. A rung
        // with a question or an incident behind it is cleared by answering it,
        // which the server judges; without this check a hand-made request
        // could clear such a rung without an answer (see isMissionChallenge).
        if (!(await isMissionChallenge(challenge))) {
            res.status(403).json({
                error: "This step is cleared by answering it, not by reporting it done"
            });
            return;
        }

        const neededRetry = (body as { neededRetry?: unknown }).neededRetry === true;
        const recorded = await recordActivityCompletion(req.user!.id, challenge, neededRetry);

        if (!recorded) {
            res.status(404).json({ error: "No such challenge" });
            return;
        }

        res.status(200).json({ recorded: true });
    }
);

/**
 * GET /api/curriculum/challenges/:challenge/exercise
 *
 * The question realising one challenge. Options carry text and id only --
 * correctness is decided by the endpoint below, never in the browser.
 */
curriculumRouter.get(
    "/challenges/:challenge/exercise",
    requireAuth,
    async (req: Request, res: Response) => {
        const challenge = String(req.params.challenge);

        if (!/^[0-9]+$/.test(challenge)) {
            res.status(404).json({ error: "No such challenge" });
            return;
        }

        if (!(await mayPlayChallenge(req.user!.id, challenge))) {
            res.status(403).json({ error: "That concept is not open yet" });
            return;
        }

        const exercise = await findExercise(challenge, req.user!.id);

        if (!exercise) {
            res.status(404).json({ error: "No such challenge" });
            return;
        }

        res.status(200).json(exercise);
    }
);

/**
 * POST /api/curriculum/challenges/:challenge/answer
 *
 * Body: { optionId, neededRetry?: boolean }.
 *
 * Judges the answer and, when it is right, records the rung as cleared in the
 * same call. A wrong answer is a 200 with `correct: false` and the explanation
 * -- being wrong is part of the lesson, not an error, and the reasoning is the
 * whole reason the learner is here.
 */
curriculumRouter.post(
    "/challenges/:challenge/answer",
    requireAuth,
    async (req: Request, res: Response) => {
        const challenge = String(req.params.challenge);
        const body = typeof req.body === "object" && req.body !== null ? req.body : {};
        const optionId = String((body as { optionId?: unknown }).optionId ?? "");

        if (!/^[0-9]+$/.test(challenge) || !/^[0-9]+$/.test(optionId)) {
            res.status(404).json({ error: "No such challenge" });
            return;
        }

        if (!(await mayPlayChallenge(req.user!.id, challenge))) {
            res.status(403).json({ error: "That concept is not open yet" });
            return;
        }

        const neededRetry = (body as { neededRetry?: unknown }).neededRetry === true;
        const judgement = await judgeAnswer(req.user!.id, challenge, optionId, neededRetry);

        if (!judgement) {
            res.status(404).json({ error: "No such challenge" });
            return;
        }

        res.status(200).json(judgement);
    }
);
