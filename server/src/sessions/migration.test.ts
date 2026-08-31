import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DIR = new URL("../../migrations/", import.meta.url);
const M011 = readFileSync(new URL("011_add_session_pause.sql", DIR), "utf8");
const M004 = readFileSync(new URL("004_create_game_sessions.sql", DIR), "utf8");

/** The file with its comment lines removed. Structural assertions run against
 *  this so prose describing a DROP is never mistaken for one. */
function sqlOnly(text: string): string {
    return text
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim();
}

const SQL011 = sqlOnly(M011);

describe("migration 011 is safe to run against live data", () => {
    it("destroys nothing", () => {
        // This runs against a database holding real games. The only DROPs it may
        // contain are of the two CHECK constraints it immediately re-adds.
        expect(SQL011).not.toMatch(/DROP\s+TABLE/i);
        expect(SQL011).not.toMatch(/DROP\s+COLUMN/i);
        expect(SQL011).not.toMatch(/DROP\s+INDEX/i);
        expect(SQL011).not.toMatch(/\bDELETE\s+FROM\b/i);
        expect(SQL011).not.toMatch(/\bTRUNCATE\b/i);
        expect(SQL011).not.toMatch(/\bUPDATE\s+game_sessions\b/i);

        const drops = SQL011.match(/DROP CONSTRAINT (\w+)/g) ?? [];

        expect(drops.sort()).toEqual([
            "DROP CONSTRAINT game_sessions_status_timestamps_consistent",
            "DROP CONSTRAINT game_sessions_status_valid"
        ]);
    });

    it("wraps the constraint swap in a transaction", () => {
        // Each DROP is followed by an ADD of the same name. Without BEGIN/COMMIT a
        // failure in between would leave the table with no constraint at all --
        // worse than either the old schema or the new one.
        // BEGIN must precede every statement, and COMMIT must follow all of them.
        expect(SQL011).toMatch(/^BEGIN;/);
        expect(SQL011).toMatch(/COMMIT;$/);

        for (const name of [
            "game_sessions_status_valid",
            "game_sessions_status_timestamps_consistent"
        ]) {
            expect(M011, name).toMatch(new RegExp(`DROP CONSTRAINT ${name}`));
            expect(M011, name).toMatch(new RegExp(`ADD CONSTRAINT ${name}`));
        }
    });

    it("adds every column the lifecycle code reads", () => {
        expect(M011).toMatch(/ADD COLUMN paused_at TIMESTAMPTZ/);
        expect(M011).toMatch(/ADD COLUMN pause_count INTEGER NOT NULL DEFAULT 0/);
        expect(M011).toMatch(/ADD COLUMN total_paused_ms BIGINT NOT NULL DEFAULT 0/);
    });

    it("gives the new columns defaults, so existing rows need no backfill", () => {
        // paused_at is nullable and the counters default to 0, which is exactly
        // what the rewritten timestamp matrix expects of every pre-existing row.
        expect(M011).toMatch(/pause_count INTEGER NOT NULL DEFAULT 0/);
        expect(M011).toMatch(/total_paused_ms BIGINT NOT NULL DEFAULT 0/);
        expect(M011).not.toMatch(/paused_at TIMESTAMPTZ NOT NULL/);
    });
});

describe("migration 011 keeps the status domain and the timestamp matrix in step", () => {
    it("widens the status domain to include paused", () => {
        expect(M011).toMatch(
            /CHECK \(status IN \('in_progress', 'paused', 'completed', 'abandoned'\)\)/
        );
    });

    it("rewrites the timestamp matrix rather than leaving it behind", () => {
        // The single most dangerous thing about this migration. Migration 004's
        // CASE ends in ELSE FALSE, so adding 'paused' to the status domain WITHOUT
        // touching the matrix makes every paused row fail: no branch matches and
        // the fallback rejects.
        expect(M004).toMatch(/ELSE FALSE/);

        const matrix = M011.slice(M011.indexOf("ADD CONSTRAINT game_sessions_status_timestamps_consistent"));

        expect(matrix).toMatch(/WHEN 'paused'\s+THEN/);
        expect(matrix).toMatch(/ELSE FALSE/);
    });

    it("names paused_at in all four branches, not just its own", () => {
        // A branch that ignores paused_at would let a resumed or finished session
        // keep a stale value -- and a stale paused_at is exactly what the resume
        // shift multiplies by.
        const matrix = M011.slice(
            M011.indexOf("ADD CONSTRAINT game_sessions_status_timestamps_consistent")
        );

        for (const status of ["in_progress", "paused", "completed", "abandoned"]) {
            const branch = matrix.slice(matrix.indexOf(`WHEN '${status}'`));
            const line = branch.slice(0, branch.indexOf("\n"));

            expect(line, status).toMatch(/paused_at IS (NOT )?NULL/);
        }
    });

    it("requires paused_at only on paused rows", () => {
        const matrix = M011.slice(
            M011.indexOf("ADD CONSTRAINT game_sessions_status_timestamps_consistent")
        );
        const branchFor = (status: string) => {
            const rest = matrix.slice(matrix.indexOf(`WHEN '${status}'`));
            return rest.slice(0, rest.indexOf("\n"));
        };

        expect(branchFor("paused")).toMatch(/paused_at IS NOT NULL/);

        for (const status of ["in_progress", "completed", "abandoned"]) {
            expect(branchFor(status), status).toMatch(/paused_at IS NULL/);
            expect(branchFor(status), status).not.toMatch(/paused_at IS NOT NULL/);
        }
    });

    it("keeps the counters non-negative", () => {
        expect(M011).toMatch(/CHECK \(pause_count >= 0\)/);
        expect(M011).toMatch(/CHECK \(total_paused_ms >= 0\)/);
    });
});

describe("migration 011 caps resumable sessions in the database", () => {
    it("adds one resumable session per user per game", () => {
        expect(M011).toMatch(
            /CREATE UNIQUE INDEX game_sessions_one_resumable_per_game_idx\s+ON game_sessions \(user_id, game_id\)\s+WHERE status IN \('in_progress', 'paused'\)/
        );
    });

    it("scopes it per game, not per user", () => {
        // Per user would forbid one paused Code Blitz alongside one paused Flush,
        // which is the whole point of allowing a pause at all.
        const idx = M011.slice(M011.indexOf("game_sessions_one_resumable_per_game_idx"));

        expect(idx).toMatch(/\(user_id, game_id\)/);
    });

    it("covers in_progress as well as paused", () => {
        // Otherwise a paused game beside a live one is legal, and the collision
        // surfaces later as a 23505 at PAUSE time -- when the player is trying to
        // leave, which is the worst possible moment to discover it.
        const idx = M011.slice(M011.indexOf("game_sessions_one_resumable_per_game_idx"));

        expect(idx).toMatch(/'in_progress'/);
        expect(idx).toMatch(/'paused'/);
    });

    it("leaves the one-active-session index completely alone", () => {
        // Its predicate is already WHERE status = 'in_progress', so a row leaving
        // that status drops out by itself. "A paused game must not block another
        // game" costs zero index changes.
        expect(M011).not.toMatch(/DROP INDEX .*one_active_per_user/);
        expect(M011).not.toMatch(/CREATE UNIQUE INDEX game_sessions_one_active_per_user_idx/);
        expect(M004).toMatch(
            /CREATE UNIQUE INDEX game_sessions_one_active_per_user_idx\s+ON game_sessions \(user_id\)\s+WHERE status = 'in_progress'/
        );
    });
});

describe("the migration set stays forward-only", () => {
    it("has exactly one migration numbered 011", () => {
        const files = readdirSync(DIR).filter((f) => f.startsWith("011"));

        expect(files).toEqual(["011_add_session_pause.sql"]);
    });

    it("does not edit an already-applied migration", () => {
        // 004 is the file 011 amends. It must stay exactly as it was applied --
        // the change lives in the new file, never by rewriting history.
        expect(M004).toMatch(/CHECK \(status IN \('in_progress', 'completed', 'abandoned'\)\)/);
        expect(M004).not.toMatch(/paused/);
    });
});
