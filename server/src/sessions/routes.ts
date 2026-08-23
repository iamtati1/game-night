import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth/middleware.js";
import { abandonActiveSession } from "./queries.js";

export const sessionsRouter = Router();

/**
 * POST /api/active-session/abandon
 *
 * Ends whatever game the caller has running, freeing the one-active-session slot
 * so they can start a different game. No body and no id in the URL: the session
 * is resolved from the cookie, which means no IDOR surface and no ownership check
 * to get wrong.
 *
 * Always 200. Abandoning nothing is not an error -- it reports abandoned: false,
 * which makes a double-click and a stale button harmless.
 *
 * The abandoned session stays in history with its real (zero) score. It is never
 * given a fake completed score, and it counts toward gamesAbandoned in stats.
 */
sessionsRouter.post("/abandon", requireAuth, async (req: Request, res: Response) => {
    const abandoned = await abandonActiveSession(req.user!.id);

    if (!abandoned) {
        res.status(200).json({ abandoned: false });
        return;
    }

    res.status(200).json({
        abandoned: true,
        sessionId: abandoned.id,
        game: { slug: abandoned.gameSlug, name: abandoned.gameName }
    });
});
