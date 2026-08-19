import express, {
    type NextFunction,
    type Request,
    type Response
} from "express";
import { authRouter, meHandler } from "./auth/routes.js";
import { pool } from "./db.js";
import { gameRouter } from "./game/routes.js";
import { sessionMiddleware } from "./session.js";

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
