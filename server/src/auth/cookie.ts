import type { CookieOptions } from "express";
import { cookieSameSite, isProduction } from "../config.js";

/**
 * The session cookie's identity and attributes, in one place.
 *
 * Both halves of the cookie's life have to agree: express-session sets it on
 * login, and res.clearCookie deletes it on logout. A browser matches a deletion
 * to an existing cookie by name, domain and path -- so if those two call sites
 * ever disagree, the delete silently does nothing. Nothing errors, the response
 * still says 204, and the stale cookie stays in the jar.
 *
 * That failure is invisible today only because express-session's default path
 * and res.clearCookie's default path happen to both be "/". Adding a path or a
 * domain to the session config would break logout without touching logout.
 * Sharing one definition removes the chance to get them out of step.
 */
export const SESSION_COOKIE_NAME = "gn.sid";

const ONE_WEEK_MS = 1000 * 60 * 60 * 24 * 7;

export const SESSION_COOKIE_OPTIONS: CookieOptions = {
    // Unreadable from JavaScript, so an XSS bug cannot exfiltrate it.
    httpOnly: true,
    // HTTPS only in production; local dev is plain HTTP.
    secure: isProduction,
    // Primary CSRF mitigation, which is the exposure cookies bring. `lax` unless
    // the deployment puts the site and the API on different sites, which two
    // *.onrender.com subdomains do -- see COOKIE_SAMESITE in config.ts.
    sameSite: cookieSameSite,
    // Explicit rather than relying on both defaults being "/", which is the
    // whole point of this module.
    path: "/",
    maxAge: ONE_WEEK_MS
};
