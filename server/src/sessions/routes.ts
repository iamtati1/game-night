import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth/middleware.js";
import { isKnownGameSlug } from "../games/constants.js";
import {
    abandonResumableSession,
    listResumableSessions,
    pauseActiveSession
} from "./queries.js";

export const sessionsRouter = Router();

/**
 * Mounted at /api/me/sessions. Every route resolves the session from the auth
 * cookie plus a game slug -- never from a session id in the URL -- so nothing a
 * caller sends can name a row belonging to another player.
 *
 * requireAuth is attached per route rather than with sessionsRouter.use(), for
 * the same reason gameRouter does: a router-wide guard answers 401 for every
 * unmatched path under the mount instead of letting it fall through to the JSON
 * 404 handler.
 *
 * Resume is deliberately absent. Resuming has to serve the next unit, which is
 * irreducibly game-specific, and each game's POST /sessions already means "start
 * or resume" -- so resume is a branch there rather than a fourth endpoint here
 * that would need to know how to deal a Code Blitz question and a Flush round.
 */

/** Rejects a slug the platform does not know, so a typo 404s instead of quietly
 *  matching no rows and reporting "nothing to pause". */
function gameSlugOf(req: Request, res: Response): string | null {
    const slug = String(req.params.game);

    if (!isKnownGameSlug(slug)) {
        res.status(404).json({ error: "Unknown game" });
        return null;
    }

    return slug;
}

/**
 * GET /api/me/sessions/resumable
 *
 * Everything the player has open: the live game if there is one, plus any paused
 * games, newest activity first. This is what a "Continue playing" surface renders,
 * and what the client reads to decide whether starting a game should offer Resume
 * or Start New Game.
 *
 * Declared before the /:game routes so the literal path is never captured as a
 * game slug.
 */
sessionsRouter.get("/resumable", requireAuth, async (req: Request, res: Response) => {
    const sessions = await listResumableSessions(req.user!.id);

    res.status(200).json({
        sessions: sessions.map((s) => ({
            id: s.id,
            game: { slug: s.gameSlug, name: s.gameName },
            status: s.status,
            score: s.score,
            unitsDone: s.unitsDone,
            unitsTotal: s.unitsTotal,
            pauseCount: s.pauseCount,
            startedAt: s.startedAt.toISOString(),
            pausedAt: s.pausedAt?.toISOString() ?? null
        }))
    });
});

/**
 * POST /api/me/sessions/:game/pause
 *
 * Saves progress and steps out. Always 200: pausing nothing is not an error, it
 * reports paused: false, which makes a double-click and a stale button harmless.
 *
 * The session keeps its real score and is neither completed nor abandoned, so it
 * cannot inflate either statistic.
 */
sessionsRouter.post("/:game/pause", requireAuth, async (req: Request, res: Response) => {
    const slug = gameSlugOf(req, res);

    if (!slug) {
        return;
    }

    const paused = await pauseActiveSession(req.user!.id, slug);

    if (!paused) {
        res.status(200).json({ paused: false });
        return;
    }

    res.status(200).json({
        paused: true,
        sessionId: paused.id,
        game: { slug: paused.gameSlug, name: paused.gameName },
        pauseCount: paused.pauseCount
    });
});

/**
 * POST /api/me/sessions/:game/abandon
 *
 * Quits permanently. Works on a live session or a paused one -- "Start New Game"
 * and "Quit" both land here -- and is the only path in the codebase that writes
 * abandoned_at.
 *
 * The row stays in history with its real score, never a fabricated completed one,
 * and counts toward gamesAbandoned. Always 200, for the same reason as pause.
 */
sessionsRouter.post("/:game/abandon", requireAuth, async (req: Request, res: Response) => {
    const slug = gameSlugOf(req, res);

    if (!slug) {
        return;
    }

    const abandoned = await abandonResumableSession(req.user!.id, slug);

    if (!abandoned) {
        res.status(200).json({ abandoned: false });
        return;
    }

    res.status(200).json({
        abandoned: true,
        sessionId: abandoned.id,
        game: { slug: abandoned.gameSlug, name: abandoned.gameName },
        previousStatus: abandoned.previousStatus
    });
});
