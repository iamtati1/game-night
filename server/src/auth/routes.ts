import argon2 from "argon2";
import { Router, type Request, type Response } from "express";
import { requireAuth } from "./middleware.js";
import { loginRateLimiter } from "./rateLimit.js";
import { findActiveUserByEmail, findActiveUserById, insertUser } from "./queries.js";
import { loginSchema, registerSchema, toFieldErrors } from "./schemas.js";

const ARGON2_OPTIONS = { type: argon2.argon2id } as const;

// A password verification against a throwaway hash, used when no account
// matched. Without it, "email not found" returns far faster than "wrong
// password", and that timing difference leaks account existence -- undoing
// the generic 401 below.
let dummyHash: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
    dummyHash ??= argon2.hash("not-a-real-password", ARGON2_OPTIONS);
    return dummyHash;
}

// Rotating the session id on login defeats session fixation: an attacker who
// planted a known session id before login cannot ride it afterwards.
function regenerateSession(req: Request): Promise<void> {
    return new Promise((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });
}

// Write the session to Postgres before responding, so the client's next
// request cannot beat the store write.
function saveSession(req: Request): Promise<void> {
    return new Promise((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
    });
}

function isUniqueViolation(err: unknown): err is { code: string; constraint?: string } {
    return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export const authRouter = Router();

authRouter.post("/register", async (req: Request, res: Response) => {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ error: "Invalid request", details: toFieldErrors(parsed.error) });
        return;
    }

    const { email, username, password } = parsed.data;
    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);

    try {
        const user = await insertUser(email, username, passwordHash);

        await regenerateSession(req);
        req.session.userId = user.id;
        await saveSession(req);

        res.status(201).location(`/api/users/${user.id}`).json({ user });
    } catch (err) {
        if (isUniqueViolation(err)) {
            // Username uniqueness is an expression index on LOWER(username),
            // so it reports an index name rather than a column name.
            const field = err.constraint === "users_username_unique_idx" ? "username" : "email";

            res.status(409).json({
                error: "Already registered",
                details: [{ field, message: `That ${field} is already taken` }]
            });
            return;
        }

        throw err;
    }
});

authRouter.post("/login", loginRateLimiter, async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
    }

    const { email, password } = parsed.data;
    const account = await findActiveUserByEmail(email);

    if (!account) {
        await argon2.verify(await getDummyHash(), password).catch(() => false);
        res.status(401).json({ error: "Invalid email or password" });
        return;
    }

    const valid = await argon2.verify(account.passwordHash, password).catch(() => false);

    if (!valid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
    }

    await regenerateSession(req);
    req.session.userId = account.id;
    await saveSession(req);

    const user = await findActiveUserById(account.id);

    res.status(200).json({ user });
});

authRouter.post("/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
        if (err) {
            res.status(500).json({ error: "Internal Server Error" });
            return;
        }

        res.clearCookie("gn.sid");
        res.status(204).end();
    });
});

export const meHandler = [
    requireAuth,
    (req: Request, res: Response) => {
        res.status(200).json({ user: req.user });
    }
];
