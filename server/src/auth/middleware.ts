import type { NextFunction, Request, Response } from "express";
import { findActiveUserById } from "./queries.js";

// 401 = we do not know who you are. 403 would mean we know, but you may not.
export async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const userId = req.session.userId;

    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    // Re-read the user every request rather than trusting the cookie's claim.
    // This is also what makes an anonymized account lose access immediately,
    // even if a valid session cookie is still in the wild.
    const user = await findActiveUserById(userId);

    if (!user) {
        req.session.destroy(() => undefined);
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    req.user = user;
    next();
}
