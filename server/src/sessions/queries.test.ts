import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SESSIONS = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");
const ROUTES = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const GAME_ROUTES = readFileSync(new URL("../game/routes.ts", import.meta.url), "utf8");
const GAME_QUERIES = readFileSync(new URL("../game/queries.ts", import.meta.url), "utf8");
const FLUSH_ROUTES = readFileSync(new URL("../flush/routes.ts", import.meta.url), "utf8");
const FLUSH_QUERIES = readFileSync(new URL("../flush/queries.ts", import.meta.url), "utf8");

describe("abandonActiveSession is safe by construction", () => {
    it("only ever touches an in-progress session", () => {
        // A completed session must be untouchable: without this predicate an
        // abandon could overwrite a finished game's status and its score would
        // then contradict game_sessions_status_timestamps_consistent.
        expect(SESSIONS).toMatch(/WHERE user_id = \$1 AND status = 'in_progress'/);
    });

    it("scopes by user_id rather than an id from the URL", () => {
        // No id in the request means no IDOR surface at all.
        expect(ROUTES).not.toMatch(/req\.params/);
        expect(SESSIONS).toMatch(/abandonActiveSession\(userId: string\)/);
    });

    it("uses RETURNING so 'nothing to abandon' is reported, not guessed", () => {
        const fn = SESSIONS.slice(SESSIONS.indexOf("export async function abandonActiveSession"));

        expect(fn).toMatch(/RETURNING id, game_id/);
    });

    it("sets abandoned_at and never completed_at", () => {
        // abandoned requires abandoned_at NOT NULL and completed_at NULL. Writing
        // completed_at here would violate the state matrix.
        const fn = SESSIONS.slice(SESSIONS.indexOf("export async function abandonActiveSession"));

        expect(fn).toMatch(/SET status = 'abandoned', abandoned_at = CURRENT_TIMESTAMP/);
        expect(fn).not.toMatch(/completed_at/);
    });

    it("never writes a score or xp", () => {
        // An abandoned session keeps its real zero. Giving it a completed score
        // would corrupt stats and the leaderboard.
        expect(SESSIONS).not.toMatch(/\bscore\b/);
        expect(SESSIONS).not.toMatch(/xp_earned/);
    });

    it("always answers 200, so a repeat click is a no-op", () => {
        expect(ROUTES).toMatch(/status\(200\)\.json\(\{ abandoned: false \}\)/);
        expect(ROUTES).toMatch(/status\(200\)\.json\(\{\s*abandoned: true/);
        expect(ROUTES).not.toMatch(/status\(404\)/);
    });
});

describe("no game can adopt another game's session", () => {
    // The bug this replaced: Code Blitz's start path looked up the active session
    // without its game, so a Flush session in progress was resumed as Code Blitz,
    // found none of its own questions, and got "completed" with a score of zero.
    it("the game-blind lookup is gone", () => {
        expect(GAME_QUERIES).not.toMatch(/findInProgressSession/);
        expect(FLUSH_QUERIES).not.toMatch(/findActiveSessionWithGame/);
    });

    it("both start routes compare the active session's game to their own", () => {
        expect(GAME_ROUTES).toMatch(/active\.gameSlug !== CODE_BLITZ/);
        expect(FLUSH_ROUTES).toMatch(/active\.gameSlug !== FLUSH/);
    });

    it("both current-round routes compare it too", () => {
        // Same exposure: this endpoint finishes a session when it runs out of
        // rounds, so an unguarded lookup completes the wrong game.
        expect(GAME_ROUTES).toMatch(/!active \|\| active\.gameSlug !== CODE_BLITZ/);
        expect(FLUSH_ROUTES).toMatch(/!active \|\| active\.gameSlug !== FLUSH/);
    });

    it("the 23505 race handler re-checks the game before resuming", () => {
        // If this regressed to an unguarded lookup, the race would either 500 or
        // resume the wrong game -- both worse than the original bug.
        const handler = GAME_ROUTES.slice(
            GAME_ROUTES.indexOf("if (!isActiveSessionConflict(err))"),
            GAME_ROUTES.indexOf("await respondResumed(res, full, now);")
        );

        expect(handler).toMatch(/await findActiveSession\(userId\)/);
        expect(handler).toMatch(/winner\.gameSlug !== CODE_BLITZ/);
        expect(handler).toMatch(/throw err/);
    });

    it("both 409s report the game by name, not just a slug", () => {
        for (const [label, src] of [["code blitz", GAME_ROUTES], ["flush", FLUSH_ROUTES]] as const) {
            expect(src, label).toMatch(/activeGame: \{ slug: active\.gameSlug, name: active\.gameName \}/);
        }
    });

    it("neither game keeps its own duplicate abandon query", () => {
        for (const [label, src] of [["game", GAME_QUERIES], ["flush", FLUSH_QUERIES]] as const) {
            expect(src, label).not.toMatch(/export async function abandonSession/);
        }
        expect(GAME_ROUTES).toMatch(/from "\.\.\/sessions\/queries\.js"/);
        expect(FLUSH_ROUTES).toMatch(/from "\.\.\/sessions\/queries\.js"/);
    });
});
