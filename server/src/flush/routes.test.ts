import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { placementSchema } from "./schemas.js";

const ROUTES = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const QUERIES = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");
const APP = readFileSync(new URL("../app.ts", import.meta.url), "utf8");

/** The served round object, sliced out of the source. */
const SERVE_ROUND_BODY = ROUTES.slice(
    ROUTES.indexOf("async function serveRound"),
    ROUTES.indexOf("// POST /api/flush/sessions --")
);

describe("placementSchema", () => {
    it("accepts bigint ids as strings", () => {
        expect(placementSchema.parse({ roundId: "12", outputId: "340" })).toEqual({
            roundId: "12",
            outputId: "340"
        });
    });

    it("keeps ids as strings rather than parsing them to numbers", () => {
        // BIGINT can exceed Number.MAX_SAFE_INTEGER; coercing would silently
        // corrupt large ids.
        const parsed = placementSchema.parse({ roundId: 12, outputId: 340 });

        expect(typeof parsed.roundId).toBe("string");
        expect(typeof parsed.outputId).toBe("string");
    });

    it("rejects a missing field", () => {
        expect(placementSchema.safeParse({ roundId: "12" }).success).toBe(false);
        expect(placementSchema.safeParse({ outputId: "12" }).success).toBe(false);
    });

    it("rejects non-numeric ids instead of passing them to the database", () => {
        expect(placementSchema.safeParse({ roundId: "abc", outputId: "1" }).success).toBe(false);
        expect(placementSchema.safeParse({ roundId: "1", outputId: "" }).success).toBe(false);
    });
});

describe("the answer never leaks mid-round", () => {
    // `position` IS the answer in Flush. If it reaches the client before the
    // round ends, the game is trivially solvable from the network tab -- the
    // same class of leak that correct_option_text avoids in Code Blitz.
    it("the tile query does not select position", () => {
        const listTiles = QUERIES.slice(
            QUERIES.indexOf("export async function listTiles"),
            QUERIES.indexOf("export async function findOutput")
        );

        expect(listTiles).toMatch(/SELECT id, output_text FROM flush_outputs/);
        expect(listTiles).not.toMatch(/position/);
    });

    it("the served round object contains no position field", () => {
        expect(SERVE_ROUND_BODY).not.toMatch(/\bposition\b/);
    });

    it("the served round exposes tiles as id and text only", () => {
        const listTiles = QUERIES.slice(
            QUERIES.indexOf("export async function listTiles"),
            QUERIES.indexOf("export async function findOutput")
        );

        expect(listTiles).toMatch(/id: row\.id, text: row\.output_text/);
    });

    it("correctSequence is only ever returned once the round has ended", () => {
        // Every read of correctSequence in the placement handler must be gated.
        const placementHandler = ROUTES.slice(
            ROUTES.indexOf('flushRouter.post("/sessions/:id/placements"'),
            ROUTES.indexOf('// GET /api/flush/sessions/:id -- results.')
        );

        for (const line of placementHandler.split("\n")) {
            if (!line.includes("correctSequence")) continue;
            // Either inside the timed-out branch (round is over), or explicitly
            // gated on roundEnded.
            expect(
                /roundEnded \?/.test(line) || /correctSequence: await db\.correctSequence/.test(line),
                `ungated reveal: ${line.trim()}`
            ).toBe(true);
        }
    });

    it("the correct-sequence query is documented as post-round only", () => {
        expect(QUERIES).toMatch(/Only ever read once a round has ended/);
    });
});

describe("architecture boundaries", () => {
    it("resolves its game by slug constant rather than a literal", () => {
        expect(QUERIES).toMatch(/import \{ FLUSH \} from "\.\.\/games\/constants\.js"/);
        // The slug string itself belongs in exactly one place: games/constants.ts.
        expect(QUERIES).not.toMatch(/"flush"/);
    });

    it("mounts the flush router before the broad /api mount", () => {
        // app.use("/api", gameRouter) captures everything beneath /api, so a
        // narrower mount registered after it would never be reached.
        expect(APP.indexOf('app.use("/api/flush", flushRouter)')).toBeGreaterThan(-1);
        expect(APP.indexOf('app.use("/api/flush", flushRouter)')).toBeLessThan(
            APP.indexOf('app.use("/api", gameRouter)')
        );
    });

    it("guards every flush route with requireAuth individually", () => {
        // Not router.use(requireAuth): a router-wide guard on a mounted path
        // intercepts unmatched paths and answers 401 instead of 404. That was a
        // real regression in the game router.
        const handlers = ROUTES.match(/flushRouter\.(get|post)\(/g) ?? [];
        const guarded = ROUTES.match(/flushRouter\.(get|post)\([^,]+, requireAuth,/g) ?? [];

        expect(handlers.length).toBe(4);
        expect(guarded.length).toBe(handlers.length);
        expect(ROUTES).not.toMatch(/flushRouter\.use\(requireAuth\)/);
    });

    it("does not reach into Code Blitz's tables", () => {
        for (const table of ["session_questions", "question_options", "questions"]) {
            expect(QUERIES, `flush must not query ${table}`).not.toMatch(new RegExp(`\\b${table}\\b`));
        }
    });

    it("writes both the placement and the round update in one transaction", () => {
        const recordPlacement = QUERIES.slice(QUERIES.indexOf("export async function recordPlacement"));

        expect(recordPlacement).toMatch(/BEGIN/);
        expect(recordPlacement).toMatch(/COMMIT/);
        expect(recordPlacement).toMatch(/ROLLBACK/);
        expect(recordPlacement).toMatch(/client\.release\(\)/);
    });
});
