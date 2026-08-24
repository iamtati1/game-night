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

describe("question selection resists memorisation", () => {
    const insert = QUERIES.slice(
        QUERIES.indexOf("export async function createSessionWithQuestions"),
        QUERIES.indexOf("export async function listSessionQuestions")
    );

    it("prefers questions the player has not just seen", () => {
        expect(insert).toMatch(/WITH recent AS/);
        expect(insert).toMatch(/ORDER BY \(q\.id IN \(SELECT question_id FROM recent\)\) ASC, RANDOM\(\)/);
    });

    it("prefers rather than filters, so the pool can never starve", () => {
        // A NOT IN would make a player who has exhausted the bank unable to start
        // a game at all. Ordering degrades instead: unseen first, seen after.
        expect(insert).not.toMatch(/NOT IN \(SELECT question_id FROM recent\)/);
        expect(insert).toMatch(/LIMIT \$2/);
    });

    it("scopes the lookback to this player and this game", () => {
        expect(insert).toMatch(/gs\.user_id = \$3/);
        expect(insert).toMatch(/gs\.game_id = \(SELECT id FROM games WHERE slug = \$4\)/);
    });

    it("excludes the session being created from its own lookback", () => {
        // It is inserted before its questions are, so without this it would take
        // one of the three lookback slots and shorten the window.
        expect(insert).toMatch(/gs\.id <> \$1/);
    });
});
