import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "./requestErrors.js";

/**
 * The real middleware, on a bare app rather than the whole server -- the same
 * shape the auth tests use, and for the same reason: importing app.ts boots a
 * session store and a database pool that have nothing to do with what is being
 * checked here.
 */
const app = express();

app.use(express.json());
app.post("/api/auth/login", (_req, res) => {
    res.json({ reached: true });
});
app.use((_req, res) => {
    res.status(404).json({ error: "Not Found" });
});
app.use(errorHandler);

/**
 * WHO THE 500 BLAMES.
 *
 * The error handler answered everything that reached it with 500, including the
 * error body-parser throws when a request body will not parse. A client sending
 * malformed JSON was therefore told the SERVER had failed -- which sends whoever
 * is debugging into the server logs over a mistake that is in the request, and
 * counts an ordinary bad request as an outage in anything watching 5xx rates.
 *
 * Found by hand against the running dev server while verifying the auth
 * lifecycle: every other step answered correctly and this one returned 500.
 */
describe("a request the server could not parse", () => {
    it("is answered as a client error, not a server failure", async () => {
        const res = await request(app)
            .post("/api/auth/login")
            .set("Content-Type", "application/json")
            .send("not json");

        expect(res.status).toBe(400);
    });

    it("says nothing about the parser that rejected it", async () => {
        // `expose: true` means the STATUS is safe to hand back. The parser's own
        // text -- offsets, token names, a slice of the body -- is not.
        const res = await request(app)
            .post("/api/auth/login")
            .set("Content-Type", "application/json")
            .send('{"email": ');

        expect(res.body).toEqual({ error: "Bad Request" });
    });

    it("still answers a genuine 404 as a 404", async () => {
        // The unmatched-route handler sits in front of this one; a change to the
        // error handler must not start swallowing it.
        const res = await request(app).get("/api/nothing-here");

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: "Not Found" });
    });
});
