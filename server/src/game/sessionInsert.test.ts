import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const QUERIES = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");
const MIGRATION_007 = readFileSync(
    new URL("../../migrations/007_create_games.sql", import.meta.url),
    "utf8"
);

/**
 * game_sessions.game_id is NOT NULL with no default, so any INSERT that omits it
 * fails with 23502 at runtime rather than at compile time. These are source-level
 * guards for that gap.
 */
describe("session creation always attributes a game", () => {
    it("writes game_id on insert", () => {
        const insert = QUERIES.slice(
            QUERIES.indexOf("INSERT INTO game_sessions"),
            QUERIES.indexOf("RETURNING id, status, started_at")
        );

        expect(insert).toMatch(/game_id/);
    });

    it("resolves the game by slug rather than a hardcoded numeric id", () => {
        // Numeric ids shift if the games table is ever reseeded; slugs do not.
        expect(QUERIES).toMatch(/SELECT id FROM games WHERE slug = \$2/);
        expect(QUERIES).toMatch(/\[userId, CODE_BLITZ\]/);
    });

    it("imports the slug from the shared constants rather than inlining a string", () => {
        expect(QUERIES).toMatch(/import \{ CODE_BLITZ \} from "\.\.\/games\/constants\.js"/);
        // The literal must appear in exactly one place: constants.ts.
        expect(QUERIES).not.toMatch(/"code-blitz"/);
    });
});

describe("migration 007 keeps game attribution loud", () => {
    it("adds game_id with no DEFAULT", () => {
        // Deliberate. A DEFAULT would make code/schema deploy skew silent, and
        // once a second game exists it would silently mis-attribute a forgotten
        // game_id to Code Blitz -- corrupting stats and leaderboards invisibly.
        // A NOT NULL violation is a loud, immediate, obvious failure instead.
        const addColumn = MIGRATION_007.slice(
            MIGRATION_007.indexOf("ADD COLUMN game_id"),
            MIGRATION_007.indexOf("UPDATE game_sessions")
        );

        expect(addColumn).not.toMatch(/DEFAULT/i);
        expect(addColumn).toMatch(/REFERENCES games\(id\) ON DELETE RESTRICT/);
    });

    it("adds the column nullable, backfills, then tightens -- in that order", () => {
        // Adding a NOT NULL column with no default to a populated table fails
        // outright, so the three steps must appear in this sequence.
        const add = MIGRATION_007.indexOf("ADD COLUMN game_id");
        const backfill = MIGRATION_007.indexOf("SET game_id = (SELECT id FROM games");
        const tighten = MIGRATION_007.indexOf("SET NOT NULL");

        expect(add).toBeGreaterThan(-1);
        expect(backfill).toBeGreaterThan(add);
        expect(tighten).toBeGreaterThan(backfill);
    });

    it("seeds the game row before the column that references it", () => {
        expect(MIGRATION_007.indexOf("INSERT INTO games")).toBeLessThan(
            MIGRATION_007.indexOf("ADD COLUMN game_id")
        );
    });
});
