import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth/middleware.js";
import { toFieldErrors } from "../auth/schemas.js";
import { getUserStats, listUserSessions } from "./queries.js";
import { historyQuerySchema } from "./schemas.js";

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

/**
 * GET /api/users/me/sessions?limit=&offset=
 *
 * Scoped to "me" for the same reason as /me/stats: the user id comes from the
 * session, so there is no id in the URL to tamper with. WHERE user_id = $1 is
 * the only filter and no code path can widen it.
 */
usersRouter.get("/me/sessions", requireAuth, async (req: Request, res: Response) => {
    const parsed = historyQuerySchema.safeParse(req.query);

    if (!parsed.success) {
        res.status(400).json({ error: "Invalid request", details: toFieldErrors(parsed.error) });
        return;
    }

    const { limit, offset } = parsed.data;

    res.status(200).json(await listUserSessions(req.user!.id, limit, offset));
});
