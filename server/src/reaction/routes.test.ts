import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GAME_ADAPTERS } from "../sessions/adapters.js";
import { GAME_SLUGS, REACTION } from "../games/constants.js";
import { reactionRoundSchema } from "./schemas.js";
import { MAX_PLAUSIBLE_MS, isPlausibleReaction } from "./scoring.js";

const ROUTES = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const QUERIES = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");
const MIGRATION = readFileSync(
    new URL("../../migrations/012_create_reaction.sql", import.meta.url),
    "utf8"
);

/** The migration with its comment lines removed. Structural assertions run
 *  against this, so a leading comment block does not look like a missing BEGIN
 *  and prose describing a DROP is never mistaken for one. */
const MIGRATION_SQL = MIGRATION.split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .trim();

describe("Reaction is a first-class Jolt game", () => {
    it("is in the slug list and has a session adapter", () => {
        // The registry test in adapters.test.ts asserts completeness; this asserts
        // Reaction specifically, so removing it would fail loudly rather than just
        // shrinking a list.
        expect([...GAME_SLUGS]).toContain(REACTION);
        expect(GAME_ADAPTERS[REACTION]).toBeDefined();
    });

    it("registers the game row and its round table together", () => {
        expect(MIGRATION_SQL).toMatch(/^BEGIN;/);
        expect(MIGRATION_SQL).toMatch(/INSERT INTO games \(slug, name, tagline\)/);
        expect(MIGRATION_SQL).toMatch(/CREATE TABLE reaction_rounds/);
        expect(MIGRATION_SQL).toMatch(/COMMIT;$/);
    });

    it("does not touch an already-applied migration", () => {
        expect(MIGRATION_SQL).not.toMatch(/DROP TABLE/i);
        expect(MIGRATION_SQL).not.toMatch(/ALTER TABLE game_sessions/i);
    });
});

describe("the round table refuses impossible states", () => {
    it("cascades from its session", () => {
        expect(MIGRATION).toMatch(/REFERENCES game_sessions\(id\) ON DELETE CASCADE/);
    });

    it("cannot hold two rounds in one slot", () => {
        expect(MIGRATION).toMatch(/UNIQUE \(game_session_id, display_order\)/);
    });

    it("bounds the reaction at the database, not only in the route", () => {
        // The value originates on an untrusted client, so the floor and ceiling
        // exist in three places: schema validation, isPlausibleReaction, and here.
        expect(MIGRATION).toMatch(/reaction_ms >= 80 AND reaction_ms <= 5000/);
    });

    it("forbids a false start that carries a reaction time", () => {
        // Moving before the signal means there was nothing to react to; a time
        // stored alongside it would be a contradiction.
        const clause = MIGRATION.slice(MIGRATION.indexOf("reaction_rounds_false_start_state"));

        expect(clause).toMatch(/reaction_ms IS NULL/);
    });

    it("forbids a reacted round with no time", () => {
        const clause = MIGRATION.slice(MIGRATION.indexOf("reaction_rounds_reacted_state"));

        expect(clause).toMatch(/reaction_ms IS NOT NULL/);
    });
});

describe("submitting a round", () => {
    it("accepts a reaction and a false start as distinct shapes", () => {
        expect(reactionRoundSchema.safeParse({ outcome: "reacted", roundId: "7", reactionMs: 287 }).success).toBe(true);
        expect(reactionRoundSchema.safeParse({ outcome: "false_start", roundId: "7" }).success).toBe(true);
    });

    it("refuses a payload claiming both at once", () => {
        // A discriminated union rather than two optional fields, so "reacted in
        // 287ms" and "jumped the signal" cannot arrive together.
        expect(reactionRoundSchema.safeParse({ roundId: "7", reactionMs: 287 }).success).toBe(false);
        expect(reactionRoundSchema.safeParse({ outcome: "reacted", roundId: "7" }).success).toBe(false);
    });

    it("refuses malformed ids and times", () => {
        expect(reactionRoundSchema.safeParse({ outcome: "reacted", roundId: "abc", reactionMs: 200 }).success).toBe(false);
        expect(reactionRoundSchema.safeParse({ outcome: "reacted", roundId: "7", reactionMs: 1.5 }).success).toBe(false);
        expect(reactionRoundSchema.safeParse({ outcome: "reacted", roundId: "7", reactionMs: -5 }).success).toBe(false);
        expect(reactionRoundSchema.safeParse({}).success).toBe(false);
    });

    it("requires auth on every route", () => {
        const routes = ROUTES.match(/reactionRouter\.(get|post)\(/g) ?? [];

        expect(routes.length).toBeGreaterThan(0);
        expect((ROUTES.match(/requireAuth/g) ?? []).length).toBeGreaterThanOrEqual(routes.length);
    });

    it("scopes the session to its owner and to Reaction", () => {
        // 404 rather than 403, so another player's session id is not confirmed.
        expect(QUERIES).toMatch(/WHERE gs\.id = \$1 AND gs\.user_id = \$2 AND g\.slug = \$3/);
        expect(ROUTES).toMatch(/res\.status\(404\)\.json\(\{ error: "Session not found" \}\)/);
    });

    it("rejects a round that is not pending, and a duplicate that races", () => {
        // Two guards: the read-then-check, and the UPDATE's own predicate for the
        // case where the row stops being pending in between.
        expect(ROUTES).toMatch(/round\.status !== "pending"/);
        expect(QUERIES).toMatch(/WHERE id = \$1 AND status = 'pending'/);
        expect(ROUTES).toMatch(/Round already resolved/);
    });

    it("validates plausibility before storing", () => {
        expect(ROUTES).toMatch(/isPlausibleReaction\(parsed\.data\.reactionMs\)/);
        expect(ROUTES).toMatch(/Implausible reaction time/);
    });

    it("never takes a score from the client", () => {
        // The client sends a reaction time and nothing else; points, score and XP
        // are all computed here from stored rounds.
        expect(ROUTES).not.toMatch(/parsed\.data\.(score|points|xp)/);
        expect(ROUTES).toMatch(/scoreForSession/);
        expect(ROUTES).toMatch(/xpForSession/);
    });

    it("documents the timing tradeoff where it is made", () => {
        // This is the one place in Jolt where the server cannot reproduce the
        // measurement it is storing. That has to be written down next to the code.
        expect(ROUTES).toMatch(/TIMING INTEGRITY/);
        expect(ROUTES).toMatch(/performance\.now\(\)/);
    });
});

/**
 * A reaction past 5000ms used to be an HTTP 400. That is the wrong shape for
 * what it describes: the player looked away, which the game should answer with a
 * result rather than an API error and a round that can never be submitted.
 */
describe("a signal nobody answered", () => {
    const TIMEOUT_MIGRATION = readFileSync(
        new URL("../../migrations/016_reaction_timeout.sql", import.meta.url),
        "utf8"
    )
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim();

    it("is a status the table accepts", () => {
        expect(TIMEOUT_MIGRATION).toMatch(
            /CHECK \(status IN \('pending', 'reacted', 'false_start', 'timed_out'\)\)/
        );
    });

    it("carries no reaction time, like a false start", () => {
        expect(TIMEOUT_MIGRATION).toMatch(/reaction_rounds_timed_out_state/);
        expect(TIMEOUT_MIGRATION).toMatch(/status <> 'timed_out'[\s\S]*?reaction_ms IS NULL/);
    });

    it("leaves the plausibility bound on reaction_ms exactly as it was", () => {
        // The ceiling still means "no real reaction is this slow". What changed is
        // what crossing it produces, not the number.
        expect(TIMEOUT_MIGRATION).not.toMatch(/reaction_rounds_reaction_plausible/);
        expect(MAX_PLAUSIBLE_MS).toBe(5000);
    });

    it("is accepted by the round schema with no time attached", () => {
        const parsed = reactionRoundSchema.safeParse({ outcome: "timed_out", roundId: "42" });

        expect(parsed.success).toBe(true);
        expect(parsed.success && parsed.data).toEqual({ outcome: "timed_out", roundId: "42" });
    });

    it("is written by the route through its own query, not as a reaction", () => {
        expect(ROUTES).toMatch(/outcome === "timed_out"/);
        expect(ROUTES).toMatch(/db\.recordTimeout\(round\.id\)/);
        expect(QUERIES).toMatch(/SET status = 'timed_out', ended_at = CURRENT_TIMESTAMP/);
    });

    it("only resolves a round that is still pending, so a late press cannot overwrite it", () => {
        expect(QUERIES).toMatch(
            /SET status = 'timed_out'[\s\S]*?WHERE id = \$1 AND status = 'pending'/
        );
    });

    it("is counted on the results screen alongside false starts", () => {
        expect(ROUTES).toMatch(/timeouts: scored\.filter\(\(r\) => r\.status === "timed_out"\)\.length/);
    });

    it("still refuses an out-of-range reaction time, and says what to send instead", () => {
        expect(isPlausibleReaction(MAX_PLAUSIBLE_MS + 1)).toBe(false);
        expect(ROUTES).toMatch(/timed_out\\" instead/);
    });
});
