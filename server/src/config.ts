import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Deployment-shaped configuration, read once at startup.
 *
 * These are the values that differ between a laptop and Render, and getting one
 * wrong fails in ways that are hard to read from the outside -- a login that
 * returns 200 and still leaves the browser logged out, for instance. Reading
 * them in one place means the deployment contract is one file rather than
 * scattered `process.env` lookups.
 */

export const isProduction = process.env.NODE_ENV === "production";

/**
 * Origins allowed to make credentialed cross-origin requests.
 *
 * Comma-separated, exact matches only. There is deliberately no wildcard: the
 * CORS spec forbids `Access-Control-Allow-Origin: *` together with credentials,
 * and a reflected-any-origin policy on a cookie API is a CSRF hole.
 *
 * Empty in development, where Vite proxies /api to this server and every request
 * is same-origin.
 */
export const allowedOrigins = (process.env.CLIENT_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);

/**
 * SameSite for the session cookie. Defaults to `lax`, which is correct whenever
 * the browser considers the site and the API same-site.
 *
 * It has to be settable because "same-site" is not the same question as "same
 * origin". Two Render subdomains -- jolt.onrender.com and jolt-api.onrender.com
 * -- are NOT same-site, because onrender.com is on the Public Suffix List, so
 * each subdomain is its own registrable site. A `lax` cookie is simply not sent
 * on those requests and the user never appears to log in.
 *
 * `none` fixes that, at the cost of the cookie becoming third-party: Safari
 * blocks those by default and Chrome is restricting them. The durable answer is
 * a custom domain (app.example.com + api.example.com), which is genuinely
 * same-site and lets this stay `lax`.
 */
const sameSiteRaw = (process.env.COOKIE_SAMESITE ?? "lax").toLowerCase();

if (!["lax", "none", "strict"].includes(sameSiteRaw)) {
    throw new Error(`COOKIE_SAMESITE must be lax, none or strict -- got "${sameSiteRaw}"`);
}

export const cookieSameSite = sameSiteRaw as "lax" | "none" | "strict";

// SameSite=None without Secure is rejected outright by every current browser,
// so this combination can only ever produce a cookie that is silently dropped.
if (cookieSameSite === "none" && !isProduction) {
    throw new Error(
        "COOKIE_SAMESITE=none requires Secure cookies, which require NODE_ENV=production"
    );
}


/**
 * The built client, served by this process in production so the site and the API
 * share one origin.
 *
 * Resolved from this module's own URL rather than process.cwd(), which depends on
 * where npm was invoked. `../../client/dist` lands on the same absolute path from
 * both src/ (tsx, development) and dist/ (built, production), because each is one
 * level under server/ -- verified, not assumed.
 */
export const clientDist = fileURLToPath(new URL("../../client/dist/", import.meta.url));

const clientIndex = join(clientDist, "index.html");

/**
 * Only in production. In development Vite owns the client on its own port and
 * proxies /api here, so serving a build from Express would shadow the dev server
 * with whatever `npm run build` last produced -- stale code that looks live.
 */
export const serveClient = isProduction && existsSync(clientIndex);

console.log({
    isProduction,
    clientDist,
    clientIndex,
    clientIndexExists: existsSync(clientIndex),
    serveClient
});

if (isProduction && !serveClient) {
    console.warn(
        `No client build at ${clientDist}. The API will run, but the site will 404. ` +
        "Build the client before the server -- see the build command in render.yaml."
    );
}

// Only meaningful in a split deployment. When this process serves the client
// there is no cross-origin request to allow, so an unset CLIENT_ORIGIN is the
// correct configuration rather than a missing one.
if (isProduction && !serveClient && allowedOrigins.length === 0) {
    console.warn(
        "CLIENT_ORIGIN is not set and no client build is being served. " +
        "Cross-origin browser requests will be refused."
    );
}
