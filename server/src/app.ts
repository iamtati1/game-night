import cors from "cors";
import express, {
    type NextFunction,
    type Request,
    type Response
} from "express";
import { authRouter, meHandler } from "./auth/routes.js";
import { bugHuntRouter } from "./bugHunt/routes.js";
import { pool } from "./db.js";
import { flushRouter } from "./flush/routes.js";
import { join, sep } from "node:path";
import { allowedOrigins, clientDist, isProduction, serveClient } from "./config.js";
import { checkGameRegistry, registryMessage } from "./games/registry.js";
import { gameRouter } from "./game/routes.js";
import { memoryRouter } from "./memory/routes.js";
import { reactionRouter } from "./reaction/routes.js";
import { sessionMiddleware } from "./session.js";
import { sessionsRouter } from "./sessions/routes.js";
import { usersRouter } from "./users/routes.js";


const app = express();

// Render terminates TLS at its edge and forwards over plain HTTP, so without
// this Express sees req.secure === false and express-session refuses to set a
// `secure` cookie -- login returns 200 and the browser stays logged out. It also
// gives express-rate-limit the real client IP; behind a proxy every request
// otherwise appears to come from one address and the login limiter becomes a
// global one. `1` because Render puts exactly one proxy in front of the service.
if (isProduction) {
    app.set("trust proxy", 1);
}

// The client is served from its own origin in production (a Render Static Site),
// so the API has to opt in to credentialed cross-origin requests by name. In
// development allowedOrigins is empty and this is inert: Vite proxies /api, so
// nothing is cross-origin and no CORS headers are needed.
if (allowedOrigins.length > 0) {
    app.use(
        cors({
            origin: allowedOrigins,
            // Without this the browser discards the session cookie on the way out
            // and refuses to expose the response on the way back.
            credentials: true
        })
    );
}

app.use(express.json());

// Mounted BEFORE the session middleware on purpose. express-session reads the
// session store whenever a request carries a session cookie, and liveness must
// never depend on PostgreSQL.
app.get("/api/health", (_req, res) => {
    res.json({
        status: "ok"
    });
});

app.use(sessionMiddleware);

app.get("/api/ready", async (_req, res) => {
    try {
        await pool.query("SELECT 1");

        // A reachable database is not the same as a usable one. If a game is
        // registered in code but has no row in `games`, every session for it will
        // fail on the game_id not-null constraint -- so readiness says so here,
        // naming the games, rather than leaving it to be diagnosed from a
        // constraint violation later.
        const registry = await checkGameRegistry();

        if (!registry.ok) {
            const message = registryMessage(registry.missing);

            console.error(`Game registry incomplete: ${message}`);

            res.status(503).json({
                status: "unavailable",
                reason: "game_registry_incomplete",
                missingGames: registry.missing,
                message
            });
            return;
        }

        res.status(200).json({
            status: "ready"
        });
    } catch (err) {
        console.error("Database readiness check failed:", err);

        res.status(503).json({
            status: "unavailable"
        });
    }
});

app.use("/api/auth", authRouter);

app.get("/api/users/me", ...meHandler);

app.use("/api/users", usersRouter);

// Before the broad /api mount below, so gameRouter never sees these paths. The
// prefix is distinct from /api/sessions (Code Blitz's own resource), so the two
// cannot shadow each other.
app.use("/api/me/sessions", sessionsRouter);

app.use("/api/flush", flushRouter);

app.use("/api/reaction", reactionRouter);

app.use("/api/memory", memoryRouter);

app.use("/api/bug-hunt", bugHuntRouter);

app.use("/api", gameRouter);


// ---------------------------------------------------------------- the client
//
// In production this process also serves the built Vite client, so the site and
// the API are one origin. That is what lets the session cookie stay SameSite=Lax
// instead of SameSite=None: two *.onrender.com subdomains are different sites
// (onrender.com is on the Public Suffix List), which would make the cookie
// third-party -- and Safari blocks those by default, silently.
//
// Placed after every API router and before the JSON 404 below, so the fallback
// can only ever see paths the API did not claim.

const ONE_YEAR_S = 60 * 60 * 24 * 365;
const ONE_DAY_S = 60 * 60 * 24;

/**
 * Vite fingerprints everything in assets/ (index-CIzOjzoH.js), so those files are
 * immutable by construction and can be cached forever -- a change produces a new
 * name, never new content at the same name.
 *
 * index.html is the opposite and must never be cached: it is the one file that
 * names the current hashes. A stale copy points at asset names that no longer
 * exist, which is a white screen after a deploy.
 *
 * The screenshots are NOT fingerprinted, so they get a day: long enough to stop
 * re-downloading 2.3MB on every visit, short enough that replacing one takes
 * effect without a rename.
 */
function setStaticCacheHeaders(res: Response, filePath: string): void {
    if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
    } else if (filePath.includes(`${sep}assets${sep}`)) {
        res.setHeader("Cache-Control", `public, max-age=${ONE_YEAR_S}, immutable`);
    } else {
        res.setHeader("Cache-Control", `public, max-age=${ONE_DAY_S}`);
    }
}

if (serveClient) {
    app.use(express.static(clientDist, { setHeaders: setStaticCacheHeaders }));

    // A plain middleware rather than a wildcard route. Express 5 uses
    // path-to-regexp 8, where a bare "*" throws outright and "/*splat" matches
    // /history but NOT "/" -- which would 404 the homepage while every deep link
    // worked. A use() handler sidesteps that syntax entirely.
    app.use((req: Request, res: Response, next: NextFunction) => {
        // Only navigations. Anything else falls through to the JSON 404, so a
        // POST to a mistyped endpoint still gets an API-shaped error.
        if (req.method !== "GET") {
            next();
            return;
        }

        // The API must never be answered with HTML. `/api` exactly is included:
        // it belongs to the API namespace even though it has no trailing slash.
        if (req.path === "/api" || req.path.startsWith("/api/")) {
            next();
            return;
        }

        res.setHeader("Cache-Control", "no-cache");
        res.sendFile(join(clientDist, "index.html"), (err) => {
            if (err) next(err);
        });
    });
}

// Unmatched routes fall through to here. Responding with JSON keeps the API
// consistent, so clients calling response.json() never hit Express's HTML page.
app.use((_req: Request, res: Response) => {
    res.status(404).json({
        error: "Not Found"
    });
});

// Express only treats middleware as an error handler when it declares all four
// parameters, so _next must stay even though it is unused.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({
        error: "Internal Server Error"
    });
});

export { app };
