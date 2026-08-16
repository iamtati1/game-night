import express, {
    type NextFunction,
    type Request,
    type Response
} from "express";

const app = express();

app.use(express.json());

app.get("/api/health", (_req, res) => {
    res.json({
        status: "ok"
    });
});

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
