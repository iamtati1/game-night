import type { NextFunction, Request, Response } from "express";

/**
 * Whether an error already knows it is the CLIENT's fault.
 *
 * body-parser throws exactly this shape when a request body will not parse:
 * `status`/`statusCode` in the 4xx range and `expose: true`, meaning the status
 * is safe to hand back. Everything the server throws itself arrives without it.
 */
export function clientError(err: unknown): number | null {
    if (typeof err !== "object" || err === null) return null;

    const e = err as { status?: unknown; statusCode?: unknown; expose?: unknown };

    if (e.expose !== true) return null;

    const status = typeof e.status === "number" ? e.status : e.statusCode;

    return typeof status === "number" && status >= 400 && status < 500 ? status : null;
}

/**
 * The last handler in the stack.
 *
 * A BAD REQUEST IS NOT A SERVER FAULT. Everything reaching here used to be
 * answered with 500, so a client that sent a malformed body was told the server
 * had broken -- which sends whoever is debugging to the server logs for a
 * mistake that is in the request, and files an ordinary bad request as an
 * outage in anything watching 5xx rates.
 *
 * The message stays generic either way. `expose` says the STATUS is safe to
 * return, not that the parser's text -- offsets, token names, a slice of the
 * body -- is worth putting on the wire.
 *
 * Express only treats middleware as an error handler when it declares all four
 * parameters, so `_next` must stay even though it is unused.
 */
export function errorHandler(
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
): void {
    const status = clientError(err);

    if (status !== null) {
        res.status(status).json({ error: "Bad Request" });
        return;
    }

    console.error(err);
    res.status(500).json({
        error: "Internal Server Error"
    });
}
