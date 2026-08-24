import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SESSIONS = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");
const ROUTES = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const GAME_ROUTES = readFileSync(new URL("../game/routes.ts", import.meta.url), "utf8");
const GAME_QUERIES = readFileSync(new URL("../game/queries.ts", import.meta.url), "utf8");
const GAME_SCORING = readFileSync(new URL("../game/scoring.ts", import.meta.url), "utf8");
const FLUSH_ROUTES = readFileSync(new URL("../flush/routes.ts", import.meta.url), "utf8");
const FLUSH_QUERIES = readFileSync(new URL("../flush/queries.ts", import.meta.url), "utf8");

/** The body of one exported function, for assertions that must not leak into a
 *  neighbour's SQL. */
function fn(src: string, name: string): string {
    const start = src.indexOf(`export async function ${name}`);
    expect(start, `${name} not found`).toBeGreaterThan(-1);

    const rest = src.slice(start + 1);
    const next = rest.indexOf("\nexport ");

    return next === -1 ? rest : rest.slice(0, next);
}

describe("the lifecycle is addressed by user and game, never by session id", () => {
    it("no lifecycle route reads a session id from the request", () => {
        // The only path parameter is :game, a slug. Nothing a caller sends names a
        // row that could belong to somebody else, so there is no ownership check
        // to get wrong and no IDOR surface to audit.
        expect(ROUTES).toMatch(/req\.params\.game/);
        expect(ROUTES).not.toMatch(/req\.params\.id/);
        expect(ROUTES).not.toMatch(/sessionId = String\(/);
    });

    it("every mutating query takes (userId, gameSlug)", () => {
        for (const name of [
            "pauseActiveSession",
            "resumePausedSession",
            "abandonResumableSession"
        ]) {
            expect(SESSIONS, name).toMatch(
                new RegExp(`function ${name}\\(\\s*userId: string,\\s*gameSlug: string`)
            );
        }
    });

    it("rejects an unknown game slug instead of quietly matching no rows", () => {
        // Without this, POST /api/me/sessions/typo/pause would answer
        // "paused: false" and look like the player had nothing running.
        expect(ROUTES).toMatch(/isKnownGameSlug/);
        expect(ROUTES).toMatch(/status\(404\)\.json\(\{ error: "Unknown game" \}\)/);
    });

    it("declares /resumable before the /:game routes", () => {
        // Otherwise the literal path is captured as a game slug.
        expect(ROUTES.indexOf('"/resumable"')).toBeLessThan(ROUTES.indexOf('"/:game'));
    });
});

describe("pause preserves the session and nothing else", () => {
    const pause = () => fn(SESSIONS, "pauseActiveSession");

    it("only ever touches a session that is actually in progress", () => {
        // A completed or abandoned session must be untouchable: pausing one would
        // leave paused_at set alongside completed_at and violate
        // game_sessions_status_timestamps_consistent.
        expect(pause()).toMatch(/gs\.status = 'in_progress'/);
    });

    it("sets paused_at, which the timestamp matrix requires", () => {
        expect(pause()).toMatch(/paused_at = CURRENT_TIMESTAMP/);
    });

    it("increments pause_count so a ranking layer can tell runs apart", () => {
        expect(pause()).toMatch(/pause_count = gs\.pause_count \+ 1/);
    });

    it("never writes a terminal timestamp", () => {
        // paused is not an ending. Writing either of these would make the session
        // show up in gamesCompleted or gamesAbandoned.
        expect(pause()).not.toMatch(/completed_at/);
        expect(pause()).not.toMatch(/abandoned_at/);
    });

    it("never writes a score or xp", () => {
        expect(pause()).not.toMatch(/\bscore\b/);
        expect(pause()).not.toMatch(/xp_earned/);
    });

    it("uses RETURNING so 'nothing to pause' is reported, not guessed", () => {
        expect(pause()).toMatch(/RETURNING gs\.id/);
        expect(ROUTES).toMatch(/status\(200\)\.json\(\{ paused: false \}\)/);
    });
});

describe("resume restores the clock the player actually had", () => {
    const resume = () => fn(SESSIONS, "resumePausedSession");

    it("runs the shift and the status flip in one transaction", () => {
        // Shifting without flipping gives away free time on a session that is
        // still paused; flipping without shifting hands back a session whose live
        // unit expired while the player was away.
        const body = resume();

        expect(body).toMatch(/await client\.query\("BEGIN"\)/);
        expect(body).toMatch(/await client\.query\("COMMIT"\)/);
        expect(body).toMatch(/await client\.query\("ROLLBACK"\)/);
        expect(body).toMatch(/client\.release\(\)/);
    });

    it("shifts the clock before clearing paused_at", () => {
        // shiftClock reads gs.paused_at. Clearing it first would multiply the
        // shift by null and silently leave the clock where it was.
        const body = resume();

        expect(body.indexOf("adapter.shiftClock(client, row.id)")).toBeLessThan(
            body.indexOf("paused_at = NULL")
        );
    });

    it("locks the session row so two concurrent resumes serialise", () => {
        expect(resume()).toMatch(/FOR UPDATE OF gs/);
    });

    it("accumulates total_paused_ms as an audit trail for the shift", () => {
        expect(resume()).toMatch(/total_paused_ms = total_paused_ms/);
        expect(resume()).toMatch(/EXTRACT\(EPOCH FROM \(CURRENT_TIMESTAMP - paused_at\)\)/);
    });

    it("refuses to resume a game with no registered adapter", () => {
        // Resuming without shifting would look successful and then time the
        // player out instantly -- the one failure mode worth being loud about.
        expect(resume()).toMatch(/No session adapter registered/);
        expect(resume()).toMatch(/throw new Error/);
    });

    it("reports a lost one-active-session race as a choice, not a 500", () => {
        expect(resume()).toMatch(/isActiveSessionConflict\(err\)/);
        expect(resume()).toMatch(/outcome: "blocked"/);
    });

    it("distinguishes 'nothing paused' from 'blocked by another game'", () => {
        // Collapsing these would leave the client unable to tell "start a new
        // game" from "deal with your other game first".
        expect(SESSIONS).toMatch(/outcome: "none"/);
        expect(SESSIONS).toMatch(/outcome: "resumed"/);
    });
});

describe("the clock shift is faithful and server-side", () => {
    it("both games move served_at by the paused interval", () => {
        for (const [label, src, table] of [
            ["code blitz", GAME_QUERIES, "session_questions"],
            ["flush", FLUSH_QUERIES, "flush_rounds"]
        ] as const) {
            expect(src, label).toMatch(
                new RegExp(`UPDATE ${table}[\\s\\S]*served_at = \\w+\\.served_at \\+ \\(CURRENT_TIMESTAMP - gs\\.paused_at\\)`)
            );
        }
    });

    it("does the arithmetic in SQL, so no Node or browser clock is trusted", () => {
        for (const [label, src, name] of [
            ["code blitz", GAME_QUERIES, "shiftQuestionClock"],
            ["flush", FLUSH_QUERIES, "shiftRoundClock"]
        ] as const) {
            const body = fn(src, name);

            expect(body, label).not.toMatch(/Date\.now\(\)/);
            expect(body, label).not.toMatch(/new Date\(/);
        }
    });

    it("only moves the unit still in play", () => {
        // Shifting an already-answered unit would rewrite its recorded response
        // time, and with it the speed bonus already awarded for it.
        for (const [label, src, name] of [
            ["code blitz", GAME_QUERIES, "shiftQuestionClock"],
            ["flush", FLUSH_QUERIES, "shiftRoundClock"]
        ] as const) {
            expect(fn(src, name), label).toMatch(/status = 'pending'/);
            expect(fn(src, name), label).toMatch(/served_at IS NOT NULL/);
        }
    });

    it("guards on paused_at being set", () => {
        for (const [label, src, name] of [
            ["code blitz", GAME_QUERIES, "shiftQuestionClock"],
            ["flush", FLUSH_QUERIES, "shiftRoundClock"]
        ] as const) {
            expect(fn(src, name), label).toMatch(/gs\.paused_at IS NOT NULL/);
        }
    });
});

describe("abandon is the only path to abandoned, and it is explicit", () => {
    const abandon = () => fn(SESSIONS, "abandonResumableSession");

    it("works on a live session or a paused one", () => {
        // Quit and Start New Game both land here, and a paused game has to be
        // quittable or it would be stuck forever.
        expect(abandon()).toMatch(/gs\.status IN \('in_progress', 'paused'\)/);
    });

    it("sets abandoned_at and clears paused_at", () => {
        expect(abandon()).toMatch(/status = 'abandoned'/);
        expect(abandon()).toMatch(/abandoned_at = CURRENT_TIMESTAMP/);
        expect(abandon()).toMatch(/paused_at = NULL/);
    });

    it("never writes completed_at, a score, or xp", () => {
        // An abandoned session keeps its real zero. A fabricated completed score
        // would corrupt stats and any future leaderboard.
        expect(abandon()).not.toMatch(/completed_at/);
        expect(abandon()).not.toMatch(/\bscore\b/);
        expect(abandon()).not.toMatch(/xp_earned/);
    });

    it("reads the previous status before overwriting it", () => {
        // RETURNING exposes the NEW row, so a second CTE is what makes
        // previousStatus honest rather than always 'abandoned'.
        expect(abandon()).toMatch(/WITH target AS/);
        expect(abandon()).toMatch(/gs\.status AS previous_status/);
    });

    it("always answers 200, so a repeat click is a no-op", () => {
        expect(ROUTES).toMatch(/status\(200\)\.json\(\{ abandoned: false \}\)/);
        expect(ROUTES).not.toMatch(/status\(410\)/);
    });
});

describe("nothing abandons a session automatically any more", () => {
    it("the 15-minute resume window is gone", () => {
        // It contradicted "closing the tab must not destroy the game", was
        // measured from started_at (meaningless once a session can span a pause),
        // and Flush never had an equivalent -- so the two games disagreed about
        // whether a session survived.
        expect(GAME_SCORING).not.toMatch(/SESSION_RESUME_WINDOW_MS\s*=/);
        expect(GAME_SCORING).not.toMatch(/export function isResumable/);
        expect(GAME_ROUTES).not.toMatch(/isResumable/);
    });

    it("no route answers 410 Session expired", () => {
        expect(GAME_ROUTES).not.toMatch(/Session expired/);
        expect(FLUSH_ROUTES).not.toMatch(/Session expired/);
    });

    it("the lazy-sweep abandon helper is gone", () => {
        expect(SESSIONS).not.toMatch(/export async function abandonSession\(/);
        expect(GAME_ROUTES).not.toMatch(/abandonSession\(/);
        expect(FLUSH_ROUTES).not.toMatch(/abandonSession\(/);
    });

    it("abandoned_at is written in exactly three places", () => {
        // The explicit quit, plus each game's fresh-start transaction. Any fourth
        // occurrence is a new automatic-abandonment path and should be argued for.
        const writes = [
            ["sessions/queries.ts", SESSIONS],
            ["game/queries.ts", GAME_QUERIES],
            ["flush/queries.ts", FLUSH_QUERIES],
            ["game/routes.ts", GAME_ROUTES],
            ["flush/routes.ts", FLUSH_ROUTES],
            ["sessions/routes.ts", ROUTES]
        ].filter(([, src]) => /abandoned_at = CURRENT_TIMESTAMP/.test(src as string));

        expect(writes.map(([name]) => name)).toEqual([
            "sessions/queries.ts",
            "game/queries.ts",
            "flush/queries.ts"
        ]);
    });
});

describe("starting a game resumes by default", () => {
    it("both start routes only deal fresh when explicitly asked", () => {
        for (const [label, src] of [["code blitz", GAME_ROUTES], ["flush", FLUSH_ROUTES]] as const) {
            expect(src, label).toMatch(/const fresh = wantsFreshSession\(req\.body\)/);
            expect(src, label).toMatch(/fresh \? null : await findResumableSession/);
        }
    });

    it("checks for another game's session before honouring fresh", () => {
        // fresh means "discard MY unfinished game", never "discard whatever else
        // is running". Reordering these would let one page destroy the other's.
        for (const [label, src, slug] of [
            ["code blitz", GAME_ROUTES, "CODE_BLITZ"],
            ["flush", FLUSH_ROUTES, "FLUSH"]
        ] as const) {
            const conflictAt = src.indexOf(`active.gameSlug !== ${slug}`);
            const freshAt = src.indexOf("fresh ? null : await findResumableSession");

            expect(conflictAt, label).toBeGreaterThan(-1);
            expect(conflictAt, label).toBeLessThan(freshAt);
        }
    });

    it("discards the old session inside the transaction that creates the new one", () => {
        // Two statements from the route would leave a window with the old game
        // gone and the new one not yet created, and a crash inside it would lose
        // the game silently. It also has to happen before the INSERT, or
        // game_sessions_one_resumable_per_game_idx rejects it.
        for (const [label, src, create] of [
            ["code blitz", GAME_QUERIES, "createSessionWithQuestions"],
            ["flush", FLUSH_QUERIES, "createSessionWithRounds"]
        ] as const) {
            const body = fn(src, create);

            expect(body, label).toMatch(/status IN \('in_progress', 'paused'\)/);
            expect(body.indexOf("abandoned_at = CURRENT_TIMESTAMP"), label).toBeLessThan(
                body.indexOf("INSERT INTO game_sessions")
            );
        }
    });

    it("resumes a paused session through the locking path, not a bare update", () => {
        for (const [label, src] of [["code blitz", GAME_ROUTES], ["flush", FLUSH_ROUTES]] as const) {
            expect(src, label).toMatch(/existing\.status === "paused"/);
            expect(src, label).toMatch(/await resumePausedSession\(userId, (CODE_BLITZ|FLUSH)\)/);
        }
    });

    it("re-checks the holder when a resume loses the race", () => {
        for (const [label, src] of [["code blitz", GAME_ROUTES], ["flush", FLUSH_ROUTES]] as const) {
            expect(src, label).toMatch(/resumed\.outcome === "blocked"/);
            expect(src, label).toMatch(/const holder = await findActiveSession\(userId\)/);
        }
    });

    it("only serves a session that is actually in progress", () => {
        // A resume that reported "none" must not fall through into respondResumed
        // with a paused or abandoned row.
        for (const [label, src] of [["code blitz", GAME_ROUTES], ["flush", FLUSH_ROUTES]] as const) {
            expect(src, label).toMatch(/full\.status === "in_progress"/);
        }
    });
});

describe("regressions already fixed stay fixed", () => {
    // The bug this guards: Code Blitz's start path looked up the active session
    // without its game, so a Flush session in progress was resumed as Code Blitz,
    // found none of its own questions, and got "completed" with a score of zero.
    it("the game-blind lookup is still gone", () => {
        expect(GAME_QUERIES).not.toMatch(/findInProgressSession/);
    });

    it("both current-unit routes compare the active session's game", () => {
        expect(GAME_ROUTES).toMatch(/!active \|\| active\.gameSlug !== CODE_BLITZ/);
        expect(FLUSH_ROUTES).toMatch(/!active \|\| active\.gameSlug !== FLUSH/);
    });

    it("the 23505 race handler still re-checks the game before resuming", () => {
        const handler = GAME_ROUTES.slice(
            GAME_ROUTES.indexOf("if (!isActiveSessionConflict(err))"),
            GAME_ROUTES.lastIndexOf("await respondResumed(res, full, now);")
        );

        expect(handler).toMatch(/await findActiveSession\(userId\)/);
        expect(handler).toMatch(/winner\.gameSlug !== CODE_BLITZ/);
        expect(handler).toMatch(/throw err/);
    });

    it("both 409s still report the game by name, not just a slug", () => {
        for (const [label, src] of [["code blitz", GAME_ROUTES], ["flush", FLUSH_ROUTES]] as const) {
            expect(src, label).toMatch(
                /activeGame: \{ slug: active\.gameSlug, name: active\.gameName \}/
            );
        }
    });

    it("neither game keeps a duplicate of a shared query", () => {
        for (const [label, src] of [["game", GAME_QUERIES], ["flush", FLUSH_QUERIES]] as const) {
            expect(src, label).not.toMatch(/export async function abandonSession/);
        }
        expect(GAME_ROUTES).toMatch(/from "\.\.\/sessions\/queries\.js"/);
        expect(FLUSH_ROUTES).toMatch(/from "\.\.\/sessions\/queries\.js"/);
    });

    it("neither game recomputes a partial score of its own", () => {
        // Both routes now share their game's scoreSoFar, so the resume response
        // and the in-play response cannot disagree about the running total.
        expect(GAME_ROUTES).not.toMatch(/async function scoreSoFar/);
        expect(FLUSH_ROUTES).not.toMatch(/async function sessionScore/);
        expect(GAME_QUERIES).toMatch(/export async function scoreSoFar/);
        expect(FLUSH_QUERIES).toMatch(/export async function scoreSoFar/);
    });
});
