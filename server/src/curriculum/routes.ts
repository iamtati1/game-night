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
    completeIntroduction,
    findJourney,
    findNextIntroduction,
    findTopicStanding
} from "./queries.js";

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

        const neededRetry =
            typeof req.body === "object" &&
            req.body !== null &&
            (req.body as { neededRetry?: unknown }).neededRetry === true;

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
