import express, {
    type NextFunction,
    type Request,
    type Response
} from "express";
import { pool } from "./db.js";

const app = express();

app.use(express.json());

app.get("/api/health", (_req, res) => {
    res.json({
        status: "ok"
    });
});

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

app.use((_req: Request, res: Response) => {
    res.status(404).json({
        error: "Not Found"
    });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({
        error: "Internal Server Error"
    });
});

export { app };
