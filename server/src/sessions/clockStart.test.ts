import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { QUESTION_TIME_LIMIT_MS } from "../game/scoring.js";
import { ROUND_CONFIG } from "../memory/scoring.js";

const BLITZ_ROUTES = readFileSync(new URL("../game/routes.ts", import.meta.url), "utf8");
const FLUSH_ROUTES = readFileSync(new URL("../flush/routes.ts", import.meta.url), "utf8");
const BLITZ_PAGE = readFileSync(
    new URL("../../../client/src/pages/GamePage.tsx", import.meta.url),
    "utf8"
);
const FLUSH_PAGE = readFileSync(
    new URL("../../../client/src/pages/FlushPage.tsx", import.meta.url),
    "utf8"
);
const REACTION_PAGE = readFileSync(
    new URL("../../../client/src/pages/ReactionPage.tsx", import.meta.url),
    "utf8"
);
const MEMORY_PAGE = readFileSync(
    new URL("../../../client/src/pages/MemoryPage.tsx", import.meta.url),
    "utf8"
);

/**
 * The rule these guard:
 *
 * A unit's clock starts when the unit is presented, not while the client is
 * still showing feedback for the previous one. Measured before the fix, feedback
 * was consuming 1.77s of a Code Blitz question and 3.29s of a Flush round.
 */
describe("feedback never consumes the next unit's deadline", () => {
    it("Code Blitz does not serve the next question in an answer response", () => {
        // serveQuestion stamps served_at, which starts the deadline. Calling it
        // while building this response starts a clock the player cannot see yet.
        const answerRoute = BLITZ_ROUTES.slice(BLITZ_ROUTES.indexOf('post("/sessions/:id/answers"'));

        expect(answerRoute).not.toMatch(/question: remaining \? await serveQuestion/);
        expect(answerRoute).toMatch(/question: null/);
    });

    it("Flush does not serve the next round in a placement response", () => {
        const placeRoute = FLUSH_ROUTES.slice(
            FLUSH_ROUTES.indexOf('post("/sessions/:id/placements"')
        );

        expect(placeRoute).not.toMatch(/roundEnded\s*\?\s*remaining\s*\?\s*await serveRound/);
        expect(placeRoute).toMatch(/round: roundEnded \? null :/);
    });

    it("Flush still re-serves a round that has NOT ended", () => {
        // A correct placement returns the same round with its tiles updated.
        // served_at is already set, so markServed leaves it alone -- but the
        // re-serve itself must survive, or the board stops updating mid-round.
        expect(FLUSH_ROUTES).toMatch(/: await serveRound\(\(await db\.findRound\(round\.id, sessionId\)\)!\)/);
    });

    it("both clients fetch the next unit when they are ready to show it", () => {
        // GET /sessions/current is the endpoint that serves, and therefore starts
        // the clock. Calling it after the dwell is what makes the deadline honest.
        expect(BLITZ_PAGE).toMatch(/const advanceToNext = useCallback/);
        expect(BLITZ_PAGE).toMatch(/api\.get<CurrentQuestionResponse>\("\/api\/sessions\/current"\)/);

        expect(FLUSH_PAGE).toMatch(/const advanceToNext = useCallback/);
        expect(FLUSH_PAGE).toMatch(/api\.get<FlushCurrentResponse>\("\/api\/flush\/sessions\/current"\)/);
    });

    it("neither client reads the NEXT unit off the answer response", () => {
        // The field is gone server-side; this catches a client that still tries.
        expect(BLITZ_PAGE).not.toMatch(/advance\(result\.question/);

        // Flush is subtler: it must still read res.round for a round that did NOT
        // end (the same round, tiles updated), and must NOT read it for the next
        // one. showReveal takes the bundled round as `_next` precisely to mark it
        // unused, and advances through the fetch instead.
        const reveal = FLUSH_PAGE.slice(
            FLUSH_PAGE.indexOf("const showReveal = useCallback"),
            FLUSH_PAGE.indexOf("async function place(")
        );

        expect(reveal).toMatch(/_next: FlushRound \| null/);
        expect(reveal).toMatch(/void advanceToNext\(\)/);
        expect(reveal).not.toMatch(/setRound\(next\)/);
    });

    it("Flush still updates the board on a placement that continues the round", () => {
        // The guard above must not be read as "never use res.round". Banking a
        // placement mid-round depends on it.
        const place = FLUSH_PAGE.slice(FLUSH_PAGE.indexOf("async function place("));

        expect(place).toMatch(/if \(!res\.roundEnded\) \{[\s\S]*?setRound\(res\.round\)/);
    });
});

describe("Code Blitz timing", () => {
    it("gives 35 seconds per question", () => {
        expect(QUESTION_TIME_LIMIT_MS).toBe(35_000);
    });

    it("keeps the client countdown in step with the server limit", () => {
        // The client duplicates the constant purely to size the bar. If it drifts,
        // the bar animates against a different number than the deadline it draws.
        expect(BLITZ_PAGE).toMatch(/const QUESTION_TIME_LIMIT_MS = 35_000;/);
    });
});

describe("Flush timing", () => {
    it("sends the round's own limit so the bar matches the deadline", () => {
        // The window varies per round now, so a fixed client constant would size
        // the countdown wrongly on every round that is not four outputs long.
        expect(FLUSH_ROUTES).toMatch(/const limitMs = roundTimeLimitMs\(round\.total_outputs\)/);
        expect(FLUSH_ROUTES).toMatch(/^\s+limitMs,$/m);
        expect(FLUSH_PAGE).toMatch(/totalMs=\{round\.limitMs \?\? FALLBACK_ROUND_LIMIT_MS\}/);
    });

    it("checks expiry against the round's own output count", () => {
        const calls = [...FLUSH_ROUTES.matchAll(/isExpired\([^)]*\)/g)].map((m) => m[0]);

        expect(calls.length).toBeGreaterThan(0);

        for (const call of calls) {
            expect(call, `${call} must pass the output count`).toMatch(/total_outputs/);
        }
    });
});

describe("Reaction pacing", () => {
    it("settles before the wait begins", () => {
        // Without this the signal could arrive 1200ms after a result appeared,
        // ambushing a player still reading their own time.
        expect(REACTION_PAGE).toMatch(/const READY_MS = 700;/);
        expect(REACTION_PAGE).toMatch(/later\(\(\) => setPhase\("waiting"\), READY_MS\);/);
    });

    it("waits longer and holds the result longer", () => {
        expect(REACTION_PAGE).toMatch(/const MIN_WAIT_MS = 1500;/);
        expect(REACTION_PAGE).toMatch(/const RESULT_MS = 1500;/);
    });

    it("cannot false-start during the settling beat", () => {
        // `act` only reacts in signal and only false-starts in waiting, so a press
        // during "ready" does nothing.
        const act = REACTION_PAGE.slice(
            REACTION_PAGE.indexOf("const act = useCallback"),
            REACTION_PAGE.indexOf("// Space and Enter play the game")
        );

        expect(act).toMatch(/phase === "signal"/);
        expect(act).toMatch(/phase === "waiting"/);
        expect(act).not.toMatch(/phase === "ready"/);
    });
});

describe("Memory keeps its own timing model", () => {
    // Memory's clock never started late -- the sequence is presented and recalled
    // in one client-owned beat, with no served_at deadline to lose milliseconds
    // to. It was retuned in the same pass for a different reason (the sequence
    // read as too fast), so the curve is pinned here as well to keep the two
    // reasons from being confused for one another later.
    it("keeps the curve it was tuned to", () => {
        expect(ROUND_CONFIG).toEqual([
            { round: 1, length: 4, displayMs: 4000 },
            { round: 2, length: 5, displayMs: 3500 },
            { round: 3, length: 6, displayMs: 3250 },
            { round: 4, length: 7, displayMs: 3000 },
            { round: 5, length: 8, displayMs: 2750 }
        ]);
    });

    it("keeps its presentation split", () => {
        expect(MEMORY_PAGE).toMatch(/const MIN_STEP_MS = 240;/);
        expect(MEMORY_PAGE).toMatch(/const MAX_STEP_MS = 640;/);
        expect(MEMORY_PAGE).toMatch(/const MIN_HOLD_MS = 800;/);
        expect(MEMORY_PAGE).toMatch(/export function presentationTiming/);
    });
});
