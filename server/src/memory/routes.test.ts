import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GAME_ADAPTERS } from "../sessions/adapters.js";
import { GAME_SLUGS, MEMORY } from "../games/constants.js";
import { memorySubmissionSchema } from "./schemas.js";
import { ROUND_CONFIG } from "./scoring.js";

const ROUTES = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const QUERIES = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");
const MIGRATION = readFileSync(
    new URL("../../migrations/013_create_memory.sql", import.meta.url),
    "utf8"
);

/** Comment lines stripped, so a leading comment block is not mistaken for a
 *  missing BEGIN and prose describing a DROP is not mistaken for one. */
const MIGRATION_SQL = MIGRATION.split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .trim();

describe("Memory is a first-class Jolt game", () => {
    it("is in the slug list and has a session adapter", () => {
        expect([...GAME_SLUGS]).toContain(MEMORY);
        expect(GAME_ADAPTERS[MEMORY]).toBeDefined();
    });

    it("registers the game row and its round table together", () => {
        expect(MIGRATION_SQL).toMatch(/^BEGIN;/);
        expect(MIGRATION_SQL).toMatch(/INSERT INTO games \(slug, name, tagline\)/);
        expect(MIGRATION_SQL).toMatch(/CREATE TABLE memory_rounds/);
        expect(MIGRATION_SQL).toMatch(/COMMIT;$/);
    });

    it("touches no already-applied migration", () => {
        expect(MIGRATION_SQL).not.toMatch(/DROP TABLE/i);
        expect(MIGRATION_SQL).not.toMatch(/ALTER TABLE game_sessions/i);
    });
});

describe("the round table refuses impossible states", () => {
    it("cascades from its session and cannot double-fill a slot", () => {
        expect(MIGRATION_SQL).toMatch(/REFERENCES game_sessions\(id\) ON DELETE CASCADE/);
        expect(MIGRATION_SQL).toMatch(/UNIQUE \(game_session_id, display_order\)/);
    });

    it("stores the answer, not a score to be trusted", () => {
        // correct_positions is computed server-side; there is no score column on
        // the round at all, so nothing can drift from the sequence it came from.
        expect(MIGRATION_SQL).toMatch(/sequence TEXT\[\] NOT NULL/);
        expect(MIGRATION_SQL).not.toMatch(/\bscore\b/);
    });

    it("cannot claim more matches than the sequence has symbols", () => {
        expect(MIGRATION_SQL).toMatch(/correct_positions <= array_length\(sequence, 1\)/);
    });

    it("cannot hold an answered round with nothing submitted", () => {
        const clause = MIGRATION_SQL.slice(MIGRATION_SQL.indexOf("memory_rounds_answered_state"));

        expect(clause).toMatch(/submitted IS NOT NULL/);
        expect(clause).toMatch(/correct_positions IS NOT NULL/);
    });

    it("cannot hold a pending round that already has an answer", () => {
        const clause = MIGRATION_SQL.slice(MIGRATION_SQL.indexOf("memory_rounds_pending_state"));

        expect(clause).toMatch(/submitted IS NULL/);
    });
});

describe("submitting a playback", () => {
    it("accepts a list of known symbols", () => {
        expect(
            memorySubmissionSchema.safeParse({ roundId: "3", submitted: ["circle", "star"] }).success
        ).toBe(true);
    });

    it("rejects an unknown symbol at the boundary", () => {
        // Closed at the schema, so a bad symbol is a 400 rather than something
        // that reaches the comparison and silently scores zero.
        expect(
            memorySubmissionSchema.safeParse({ roundId: "3", submitted: ["circle", "banana"] })
                .success
        ).toBe(false);
    });

    it("rejects empty, malformed and oversized submissions", () => {
        expect(memorySubmissionSchema.safeParse({ roundId: "3", submitted: [] }).success).toBe(false);
        expect(memorySubmissionSchema.safeParse({ roundId: "abc", submitted: ["circle"] }).success).toBe(false);
        expect(memorySubmissionSchema.safeParse({ submitted: ["circle"] }).success).toBe(false);
        expect(memorySubmissionSchema.safeParse({ roundId: "3" }).success).toBe(false);
        expect(
            memorySubmissionSchema.safeParse({ roundId: "3", submitted: Array(11).fill("circle") })
                .success
        ).toBe(false);
    });

    it("requires auth on every route", () => {
        const routes = ROUTES.match(/memoryRouter\.(get|post)\(/g) ?? [];

        expect(routes.length).toBeGreaterThan(0);
        expect((ROUTES.match(/requireAuth/g) ?? []).length).toBeGreaterThanOrEqual(routes.length);
    });

    it("scopes the session to its owner and to Memory", () => {
        expect(QUERIES).toMatch(/WHERE gs\.id = \$1 AND gs\.user_id = \$2 AND g\.slug = \$3/);
        expect(ROUTES).toMatch(/res\.status\(404\)\.json\(\{ error: "Session not found" \}\)/);
    });

    it("rejects a round that is not pending, and a duplicate that races", () => {
        expect(ROUTES).toMatch(/round\.status !== "pending"/);
        expect(QUERIES).toMatch(/WHERE id = \$1 AND status = 'pending'/);
        expect(ROUTES).toMatch(/Round already answered/);
    });

    it("decides correctness itself and never takes it from the client", () => {
        expect(ROUTES).toMatch(/correctPositions\(round\.sequence, parsed\.data\.submitted\)/);
        expect(ROUTES).not.toMatch(/parsed\.data\.(score|correct|perfect|points|xp)/);
        expect(ROUTES).toMatch(/scoreForSession/);
        expect(ROUTES).toMatch(/xpForSession/);
    });

    it("withholds an unplayed round's sequence from the results view", () => {
        // Otherwise the results endpoint would hand a resumed player the answers
        // to rounds they have not reached.
        expect(ROUTES).toMatch(/r\.status === "answered" \? r\.sequence : null/);
    });

    it("documents what the server cannot enforce", () => {
        // The sequence must reach the client -- showing it is the game -- so the
        // limit has to be written down beside the code rather than implied.
        expect(ROUTES).toMatch(/WHAT THE SERVER GUARANTEES HERE/);
    });
});

describe("session creation", () => {
    it("generates every sequence up front, inside one transaction", () => {
        const create = QUERIES.slice(
            QUERIES.indexOf("export async function createSessionWithRounds"),
            QUERIES.indexOf("export async function listRounds")
        );

        expect(create).toMatch(/await client\.query\("BEGIN"\)/);
        expect(create).toMatch(/await client\.query\("COMMIT"\)/);
        expect(create).toMatch(/await client\.query\("ROLLBACK"\)/);
        expect(create).toMatch(/generateSequence\(config\.length\)/);
        expect(create).toMatch(/for \(const config of ROUND_CONFIG\)/);
    });

    it("clears an unfinished run first, like the other games", () => {
        expect(QUERIES).toMatch(/status IN \('in_progress', 'paused'\)/);
    });

    it("stores the display time per round rather than recomputing it", () => {
        // One definition of how long round three lasts, shared by server and
        // client, instead of a constant duplicated on both sides.
        expect(QUERIES).toMatch(/config\.displayMs/);
        expect(ROUTES).toMatch(/displayMs: round\.display_ms/);
        expect(ROUND_CONFIG).toHaveLength(5);
    });
});
