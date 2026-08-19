import rateLimit from "express-rate-limit";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

/**
 * Applied to POST /api/auth/login only. Registration stays unrestricted.
 *
 * Argon2 makes each guess expensive for an attacker, but that cuts both ways:
 * unlimited login attempts are also a cheap way to saturate our CPU. This caps
 * both problems without touching the authentication logic itself.
 *
 * Note on deployment: express-rate-limit keys on req.ip. Behind a reverse proxy
 * every request appears to come from the proxy, so a production deployment must
 * configure Express's trust proxy setting or this becomes a global limit.
 */
export const loginRateLimiter = rateLimit({
    windowMs: WINDOW_MS,
    limit: MAX_ATTEMPTS,
    // Draft-8 RateLimit-* headers; the deprecated X-RateLimit-* set is off.
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // Count only failed attempts, so a legitimate user who logs in successfully
    // is not penalised for a few earlier typos.
    skipSuccessfulRequests: true,
    handler: (_req, res) => {
        res.status(429).json({
            error: "Too many login attempts",
            details: [
                {
                    field: "email",
                    message: `Too many failed attempts. Try again in ${WINDOW_MS / 60000} minutes.`
                }
            ]
        });
    }
});
