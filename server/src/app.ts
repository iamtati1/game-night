import express, {
    type NextFunction,
    type Request,
    type Response
} from "express";
import { authRouter, meHandler } from "./auth/routes.js";
import { bugHuntRouter } from "./bugHunt/routes.js";
import { pool } from "./db.js";
import { flushRouter } from "./flush/routes.js";
import { checkGameRegistry, registryMessage } from "./games/registry.js";
import { gameRouter } from "./game/routes.js";
import { memoryRouter } from "./memory/routes.js";
import { reactionRouter } from "./reaction/routes.js";
import { sessionMiddleware } from "./session.js";
import { sessionsRouter } from "./sessions/routes.js";
import { usersRouter } from "./users/routes.js";


const app = express();

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
