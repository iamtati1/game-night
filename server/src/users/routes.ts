import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth/middleware.js";
import { getUserStats } from "./queries.js";

export const usersRouter = Router();

/**
 * GET /api/users/me/stats
 *
 * Scoped to "me" rather than /:id on purpose: the identity comes from the
 * session, so there is no id in the URL to tamper with and therefore no
 * ownership check to get wrong. A /:id variant can be added later, and that is
 * when we decide which stats are public.
 */
usersRouter.get("/me/stats", requireAuth, async (req: Request, res: Response) => {
    const user = req.user!;
    const stats = await getUserStats(user.id);

    res.status(200).json({
        user: { id: user.id, username: user.username, createdAt: user.createdAt },
        ...stats
    });
});
