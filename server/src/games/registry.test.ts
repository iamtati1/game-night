import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GAME_SLUGS } from "./constants.js";
import { registryMessage } from "./registry.js";

const APP = readFileSync(new URL("../app.ts", import.meta.url), "utf8");
const MIGRATIONS_DIR = new URL("../../migrations/", import.meta.url);

/**
 * Slugs any migration inserts into `games`.
 *
 * Reads the whole migrations directory rather than a hardcoded list. The list
 * was itself a thing to forget: adding a game meant remembering to name its
 * migration here, and this assertion exists precisely because remembering is
 * what failed last time.
 */
function seededSlugs(): string[] {
    const sql = readdirSync(MIGRATIONS_DIR)
        .filter((name) => name.endsWith(".sql"))
        .sort()
        .map((name) => readFileSync(new URL(name, MIGRATIONS_DIR), "utf8"))
        .join("\n");
    const seeded = new Set<string>();

    // INSERT ... VALUES ('slug', ...)
    for (const [, slug] of sql.matchAll(/INSERT INTO games[\s\S]*?VALUES \('([a-z-]+)'/g)) {
        seeded.add(slug);
    }

    // The tick -> flush rename in 009 renames the row rather than inserting one.
    for (const [, slug] of sql.matchAll(/UPDATE games\s+SET slug = '([a-z-]+)'/g)) {
        seeded.add(slug);
    }

    return [...seeded];
}

describe("every registered game has a migration that seeds it", () => {
    it("covers every slug the code registers", () => {
        // This is the check that would have caught the Memory outage before it
        // reached the database: the code knew about `memory`, and the assertion
        // is that some migration puts that row there.
        const seeded = seededSlugs();

        for (const slug of GAME_SLUGS) {
            expect(seeded, `no migration seeds "${slug}"`).toContain(slug);
        }
    });

    it("seeds each game exactly once across the migration set", () => {
        // Two migrations inserting the same slug would violate games_slug_unique
        // on the second apply.
        const sql = ["007_create_games.sql", "008_create_tick.sql", "012_create_reaction.sql", "013_create_memory.sql"]
            .map((n) => readFileSync(new URL(n, MIGRATIONS_DIR), "utf8"))
            .join("\n");

        for (const slug of ["code-blitz", "reaction", "memory"]) {
            const inserts = [...sql.matchAll(new RegExp(`VALUES \\('${slug}'`, "g"))];

            expect(inserts, `"${slug}" is inserted ${inserts.length} times`).toHaveLength(1);
        }
    });
});

describe("readiness reports an incomplete registry", () => {
    it("fails readiness rather than passing it", () => {
        // A reachable database is not a usable one. Reporting ready while every
        // session for a game is guaranteed to fail is the wrong answer.
        expect(APP).toMatch(/checkGameRegistry\(\)/);
        expect(APP).toMatch(/game_registry_incomplete/);
        expect(APP).toMatch(/missingGames: registry\.missing/);
    });

    it("names the games rather than only the column that broke", () => {
        const message = registryMessage(["memory"]);

        expect(message).toContain("memory");
        expect(message).toContain("migration");
        expect(message).toContain("game_id");
    });

    it("handles more than one missing game", () => {
        expect(registryMessage(["reaction", "memory"])).toContain("reaction, memory");
    });
});

describe("a round table exists for every game", () => {
    it("each game's migration creates its own round table", () => {
        // memory_rounds went missing for the same reason the games row did: one
        // unapplied migration. Both live in 013, so both assertions guard it.
        const tables: Record<string, string> = {
            "005_create_session_questions.sql": "session_questions",
            "008_create_tick.sql": "tick_rounds",
            "012_create_reaction.sql": "reaction_rounds",
            "013_create_memory.sql": "memory_rounds"
        };

        for (const [file, table] of Object.entries(tables)) {
            const sql = readFileSync(new URL(file, MIGRATIONS_DIR), "utf8");

            expect(sql, `${file} should create ${table}`).toMatch(
                new RegExp(`CREATE TABLE ${table}`)
            );
        }
    });

    it("queries only reference round tables some migration creates", () => {
        const queries = readFileSync(new URL("../users/queries.ts", import.meta.url), "utf8");
        const referenced = [...queries.matchAll(/FROM ([a-z_]+_rounds|session_questions)/g)].map(
            (m) => m[1]!
        );
        const created = ["012_create_reaction.sql", "013_create_memory.sql", "008_create_tick.sql", "009_rename_tick_to_flush.sql", "005_create_session_questions.sql"]
            .map((n) => readFileSync(new URL(n, MIGRATIONS_DIR), "utf8"))
            .join("\n");

        for (const table of new Set(referenced)) {
            expect(
                created.includes(table),
                `users/queries.ts reads ${table}, but no migration creates it`
            ).toBe(true);
        }
    });
});
