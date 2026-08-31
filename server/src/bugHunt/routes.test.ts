import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUG_HUNT, GAME_SLUGS } from "../games/constants.js";
import { GAME_ADAPTERS } from "../sessions/adapters.js";
import { diagnosisSchema } from "./schemas.js";
import { ELIGIBLE_INCIDENT_PREDICATE } from "./queries.js";
import { PLAYABLE_CHALLENGE_TYPES } from "./scoring.js";

const ROUTES = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const QUERIES = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");
const APP = readFileSync(new URL("../app.ts", import.meta.url), "utf8");

describe("Bug Hunt is a first-class Jolt game", () => {
    it("is in the slug list and has a session adapter", () => {
        expect([...GAME_SLUGS]).toContain(BUG_HUNT);
        expect(GAME_ADAPTERS[BUG_HUNT]).toBeDefined();
    });

    it("is mounted before the catch-all /api router", () => {
        // gameRouter owns bare /api. Mounted after it, /api/bug-hunt/* would be
        // shadowed and every route here would 404.
        const bugHunt = APP.indexOf('app.use("/api/bug-hunt"');
        const catchAll = APP.indexOf('app.use("/api", gameRouter)');

        expect(bugHunt).toBeGreaterThan(-1);
        expect(bugHunt).toBeLessThan(catchAll);
    });

    it("resolves its game_id through the slug, never a hardcoded number", () => {
        expect(QUERIES).toMatch(/SELECT id FROM games WHERE slug = \$\d/);
        expect(QUERIES).not.toMatch(/game_id = \d+/);
    });

    it("shifts a real clock on resume, unlike Reaction and Memory", () => {
        // Bug Hunt holds a genuine per-incident deadline. A no-op adapter here
        // would time every resumed run out the instant the player came back --
        // silently, with nothing to error on.
        const shiftClock = QUERIES.slice(QUERIES.indexOf("export async function shiftClock"));

        expect(shiftClock).toMatch(/UPDATE bug_hunt_rounds/);
        expect(shiftClock).toMatch(/served_at \+ \(CURRENT_TIMESTAMP - gs\.paused_at\)/);
        expect(shiftClock).toMatch(/status = 'pending'/);
    });
});

describe("every endpoint is behind requireAuth", () => {
    it("attaches it to all four routes", () => {
        const routes = [...ROUTES.matchAll(/bugHuntRouter\.(get|post)\((.*?),/g)];

        expect(routes).toHaveLength(4);

        for (const [, verb, path] of routes) {
            const line = ROUTES.slice(ROUTES.indexOf(`bugHuntRouter.${verb}(${path},`));

            expect(line.slice(0, 200), `${verb} ${path}`).toContain("requireAuth");
        }
    });

    it("scopes every session lookup to the requesting user", () => {
        // findBugHuntSessionForUser filters on user_id AND slug, so a session id
        // from another player -- or from another game -- resolves to nothing.
        expect(QUERIES).toMatch(/WHERE gs\.id = \$1 AND gs\.user_id = \$2 AND g\.slug = \$3/);
        expect(ROUTES).not.toMatch(/findBugHuntSessionForUser\([^)]*\breq\.body\b/);
    });
});

describe("the client cannot fabricate hints", () => {
    it("has no hintsUsed field anywhere in the request schema", () => {
        const parsed = diagnosisSchema.safeParse({
            action: "reveal-hint",
            roundId: "1",
            hintsUsed: 0
        });

        // Rejected rather than ignored, so an attempt to send one fails loudly.
        expect(parsed.success).toBe(false);
    });

    it("rejects a diagnosis carrying a hint count", () => {
        expect(
            diagnosisSchema.safeParse({
                action: "diagnose",
                roundId: "1",
                optionId: "2",
                hintsUsed: 99
            }).success
        ).toBe(false);
    });

    it("accepts a hint request with nothing but the round", () => {
        expect(diagnosisSchema.safeParse({ action: "reveal-hint", roundId: "7" }).success).toBe(
            true
        );
    });

    it("requires an option on a diagnosis", () => {
        expect(diagnosisSchema.safeParse({ action: "diagnose", roundId: "7" }).success).toBe(false);
    });

    it("rejects an unknown action", () => {
        expect(diagnosisSchema.safeParse({ action: "solve", roundId: "7" }).success).toBe(false);
        expect(diagnosisSchema.safeParse({ roundId: "7" }).success).toBe(false);
    });

    it("increments hints_used only from the server's own read", () => {
        // The write is conditional on the count the server just read, so two
        // rapid clicks cannot both take the same rung or skip one.
        expect(QUERIES).toMatch(
            /SET hints_used = hints_used \+ 1[\s\S]*?WHERE id = \$1 AND status = 'pending' AND hints_used = \$2/
        );
    });

    it("never sends unrevealed hint text with an incident", () => {
        // listOptionsForPlay and the serve payload carry a COUNT of hints only.
        const serve = ROUTES.slice(
            ROUTES.indexOf("async function serveIncident"),
            ROUTES.indexOf("// --------------------------------------------------------------------- results")
        );

        expect(serve).toMatch(/hintsAvailable: incident\.hints\.length/);
        expect(serve).not.toMatch(/hints: incident\.hints/);
    });

    it("does not let a hint end or advance the incident", () => {
        const reveal = ROUTES.slice(
            ROUTES.indexOf("async function revealHint"),
            ROUTES.indexOf("async function submitDiagnosis")
        );

        expect(reveal).not.toMatch(/endRound/);
        expect(reveal).not.toMatch(/recordFailedAttempt/);
        expect(reveal).not.toMatch(/findNextPendingRound/);
    });
});

describe("the answer never leaves the server early", () => {
    it("serves options without is_correct or explanations", () => {
        const forPlay = QUERIES.slice(
            QUERIES.indexOf("export async function listOptionsForPlay"),
            QUERIES.indexOf("export async function listOptionsWithAnswers")
        );

        expect(forPlay).toMatch(/SELECT id, option_text, line_number FROM bug_hunt_options/);
        expect(forPlay).not.toMatch(/is_correct/);
        expect(forPlay).not.toMatch(/explanation/);
    });

    it("uses the play-safe option list when serving an incident", () => {
        const serve = ROUTES.slice(
            ROUTES.indexOf("async function serveIncident"),
            ROUTES.indexOf("// --------------------------------------------------------------------- results")
        );

        expect(serve).toMatch(/db\.listOptionsForPlay/);
        expect(serve).not.toMatch(/db\.listOptionsWithAnswers/);
    });

    it("withholds the correct option on a round still in play", () => {
        expect(ROUTES).toMatch(/correctOption: r\.status === "pending" \? null :/);
        expect(ROUTES).toMatch(/explanation: r\.status === "pending" \? null :/);
    });

    it("judges correctness against the stored option, never the request", () => {
        expect(ROUTES).toMatch(/outcomeFor\(option\.is_correct, attemptsAfter\)/);
        expect(ROUTES).not.toMatch(/parsed\.data\.correct/);
    });
});

describe("the clock starts when the incident is shown", () => {
    it("stamps served_at only on the serving path", () => {
        expect(ROUTES).toMatch(/const servedAt = await db\.markServed\(round\.id\)/);
        expect(ROUTES.match(/db\.markServed/g)).toHaveLength(1);
    });

    it("never stamps it twice", () => {
        // Re-serving on a refresh must not restart the countdown.
        expect(QUERIES).toMatch(
            /SET served_at = CURRENT_TIMESTAMP\s+WHERE id = \$1 AND served_at IS NULL/
        );
    });

    it("does not serve the next incident inside the diagnosis response", () => {
        // The bug that cost Code Blitz 1.8s and Flush 3.3s per unit: the next
        // unit's deadline started while the player was reading feedback.
        const submit = ROUTES.slice(ROUTES.indexOf("async function submitDiagnosis"));

        expect(submit).not.toMatch(/serveIncident/);
        expect(submit).toMatch(/complete: !remaining/);
    });

    it("reports the real remaining time so a refresh does not restart it", () => {
        expect(ROUTES).toMatch(/deadline === null \? null : Math\.max\(0, deadline - now\.getTime\(\)\)/);
    });

    it("serves no deadline at all on an untimed hunt", () => {
        // Null rather than a very large number: the client renders no countdown,
        // instead of one that still says "you are being timed".
        expect(ROUTES).toMatch(/round\.time_limit_ms === null \? null :/);
    });

    it("adjudicates timeouts from stored timestamps, not from the client", () => {
        expect(QUERIES).toMatch(
            /CURRENT_TIMESTAMP > served_at \+ \(time_limit_ms \* INTERVAL '1 millisecond'\)/
        );
        expect(ROUTES).toMatch(/await db\.expireOverdueRounds/);
        expect(ROUTES).not.toMatch(/req\.body\.(elapsed|remaining|timedOut)/);
    });

    it("expires overdue rounds before judging a submission", () => {
        // So a diagnosis arriving after the deadline meets an already-failed
        // round rather than scoring.
        const handler = ROUTES.slice(ROUTES.indexOf('bugHuntRouter.post("/sessions/:id/diagnoses"'));
        const expire = handler.indexOf("expireOverdueRounds");
        const findRound = handler.indexOf("db.findRound(");

        expect(expire).toBeGreaterThan(-1);
        expect(expire).toBeLessThan(findRound);
    });
});

describe("incident selection", () => {
    it("only deals challenge types the client can render", () => {
        for (const type of PLAYABLE_CHALLENGE_TYPES) {
            expect(ELIGIBLE_INCIDENT_PREDICATE).toContain(`'${type}'`);
        }

        expect(ELIGIBLE_INCIDENT_PREDICATE).not.toContain("'trace'");
        expect(ELIGIBLE_INCIDENT_PREDICATE).not.toContain("'diagnose'");
    });

    it("requires exactly one active correct option", () => {
        // Zero would be unwinnable and would waste one of the player's five
        // incidents; the unique index already forbids two.
        expect(ELIGIBLE_INCIDENT_PREDICATE).toMatch(/AND o\.is_correct\s*\n?\s*\) = 1/);
    });

    it("deprioritises recently-seen incidents rather than excluding them", () => {
        // A player who has worked through the bank still gets five incidents.
        expect(QUERIES).toMatch(/ORDER BY \(i\.id IN \(SELECT incident_id FROM recent\)\) ASC/);
    });

    it("refuses to deal a short session", () => {
        expect(ROUTES).toMatch(/eligible < BUG_HUNT_INCIDENTS_PER_SESSION/);
        expect(ROUTES).toMatch(/503/);
    });

    it("stores each round's own clock at deal time, from the pure rule", () => {
        // Computed by timeLimitMs rather than rebuilt in SQL, so the ramp has one
        // definition instead of a LEAST() that has to be kept in step with it.
        expect(QUERIES).toMatch(/timeLimitMs\(incident\.difficulty, countCodeLines\(incident\.code\)\)/);
    });

    it("never expires a hunt that has no deadline", () => {
        expect(QUERIES).toMatch(/AND time_limit_ms IS NOT NULL/);
    });
});

/**
 * Every choose_patch incident in the bank was authored with its correct patch
 * written first, and patch options were served in insertion order -- so the
 * first option was always the answer, in all thirteen of them. The tier was
 * beatable without reading any code.
 */
describe("patch options do not give the answer away by position", () => {
    it("shuffles patches, seeded on the round", () => {
        expect(ROUTES).toMatch(/seededShuffle\(options, roundId\)/);
        expect(ROUTES).toMatch(/orderOptionsFor\(incident\.challenge_type, round\.id,/);
    });

    it("leaves find_line alone, because there the order is the snippet's", () => {
        expect(ROUTES).toMatch(
            /challengeType === "choose_patch" \? seededShuffle\(options, roundId\) : options/
        );
    });

    it("seeds on the round and not on the incident", () => {
        // Seeding on the incident would give every player the same "random"
        // order for the same content forever, which is memorisable -- a quieter
        // version of the bug being fixed.
        expect(ROUTES).not.toMatch(/seededShuffle\([^)]*incident\.id\)/);
    });

    it("still serves options without their correctness", () => {
        // The shuffle must not have become a route for is_correct to escape.
        const served = ROUTES.slice(ROUTES.indexOf("options: orderOptionsFor"));

        expect(served.slice(0, 400)).not.toMatch(/is_correct/);
    });

    it("orders by line for the type that needs it", () => {
        expect(QUERIES).toMatch(/ORDER BY COALESCE\(line_number, 0\), id/);
    });
});
