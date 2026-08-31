import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPLETION_BONUS_XP, PERFECT_GAME_XP } from "../games/xp.js";
import {
    BOSS_DISPLAY_ORDER,
    BUG_HUNT_INCIDENTS_PER_SESSION,
    BUG_HUNT_MAX_TIME_MS,
    BUG_HUNT_MIN_TIME_MS,
    DIFFICULTY_RAMP,
    CHALLENGE_TYPES,
    MAX_ATTEMPTS,
    MAX_HINTS,
    PLAYABLE_CHALLENGE_TYPES,
    averageResolutionMs,
    bestStreak,
    canAttempt,
    countCodeLines,
    firstTryCount,
    hintsSpent,
    isExpired,
    isUntimed,
    isPlayableChallengeType,
    nextHintIndex,
    outcomeFor,
    pointsForRound,
    resolvedCount,
    scoreForSession,
    speedBonus,
    streakBonus,
    systemIntegrity,
    timeLimitMs,
    xpForSession,
    type ScoredRound
} from "./scoring.js";
import { dealRun } from "./queries.js";

const MIGRATION = readFileSync(
    new URL("../../migrations/014_create_bug_hunt.sql", import.meta.url),
    "utf8"
);

/** Comment lines stripped, so prose describing a constraint is not mistaken for
 *  the constraint itself. Same treatment the Memory migration test uses. */
const MIGRATION_SQL = MIGRATION.split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

/** Every hunt of a full run, by position. */
const RUN = Array.from({ length: 10 }, (_, i) => i + 1);

/** A round with everything at its most neutral, so each test varies one thing. */
const round = (over: Partial<ScoredRound> = {}): ScoredRound => ({
    status: "resolved",
    displayOrder: 1,
    attempts: 1,
    hintsUsed: 0,
    elapsedMs: 0,
    timeLimitMs: 60_000,
    ...over
});

const failed = (over: Partial<ScoredRound> = {}) =>
    round({ status: "failed", attempts: 2, ...over });

describe("the incident clock", () => {
    it("gives the opening hunts no clock at all", () => {
        // Not "very generous" -- none. A countdown sitting at ninety seconds
        // still tells a player who is learning the game that they are being
        // measured, and the whole point of the opening is that they are not.
        expect(timeLimitMs(1, 4)).toBeNull();
        expect(isUntimed(timeLimitMs(1, 12))).toBe(true);
    });

    it("tightens as the run gets harder", () => {
        // The defect this replaces: the old formula took line count alone, so a
        // difficulty-1 off-by-one and a difficulty-5 race both got 66 seconds.
        const budgets = [2, 3, 4, 5].map((d) => timeLimitMs(d, 6)!);

        for (let i = 1; i < budgets.length; i++) {
            expect(budgets[i]!, `difficulty ${i + 2} vs ${i + 1}`).toBeLessThan(budgets[i - 1]!);
        }
    });

    it("still pays for reading, so a long snippet is not punished twice", () => {
        expect(timeLimitMs(3, 10)!).toBeGreaterThan(timeLimitMs(3, 3)!);
    });

    it("never asks anyone to read and answer in under the floor", () => {
        expect(timeLimitMs(5, 1)!).toBeGreaterThanOrEqual(BUG_HUNT_MIN_TIME_MS);
    });

    it("caps the longest incident so a run cannot stall", () => {
        expect(timeLimitMs(2, 500)).toBe(BUG_HUNT_MAX_TIME_MS);
    });

    it("never expires an untimed hunt", () => {
        const served = new Date("2026-01-01T00:00:00.000Z");
        const muchLater = new Date(served.getTime() + 10 * 60 * 1000);

        expect(isExpired(served, muchLater, null)).toBe(false);
    });

    it("counts only lines that carry code", () => {
        // Blank lines are formatting, not reading load.
        expect(countCodeLines("const a = 1;\n\n\nreturn a;")).toBe(2);
        expect(countCodeLines("   ")).toBe(1);
    });

    it("expires only after the limit, not on it", () => {
        const served = new Date("2026-01-01T00:00:00.000Z");
        const at = (ms: number) => new Date(served.getTime() + ms);

        expect(isExpired(served, at(59_999), 60_000)).toBe(false);
        expect(isExpired(served, at(60_000), 60_000)).toBe(false);
        expect(isExpired(served, at(60_001), 60_000)).toBe(true);
    });
});

describe("the difficulty ramp", () => {
    it("gives the player three easy hunts before asking anything", () => {
        // The on-ramp. A run that opens on a tier-three bug is the "I barely had
        // time to read that" complaint, whatever the clock says.
        expect(DIFFICULTY_RAMP.slice(0, 3)).toEqual([1, 1, 1]);
    });

    it("climbs without ever stepping back down", () => {
        for (let i = 1; i < DIFFICULTY_RAMP.length; i++) {
            expect(
                DIFFICULTY_RAMP[i]!,
                `hunt ${i + 1} must not be easier than hunt ${i}`
            ).toBeGreaterThanOrEqual(DIFFICULTY_RAMP[i - 1]!);
        }
    });

    it("finishes on the hardest tier", () => {
        expect(DIFFICULTY_RAMP.at(-1)).toBe(5);
        expect(DIFFICULTY_RAMP).toHaveLength(BUG_HUNT_INCIDENTS_PER_SESSION);
    });

    it("reaches every tier, so the bank is fully used", () => {
        expect(new Set(DIFFICULTY_RAMP)).toEqual(new Set([1, 2, 3, 4, 5]));
    });
});

describe("dealing a run", () => {
    const bank = (counts: Record<number, number>) =>
        Object.entries(counts).flatMap(([difficulty, n]) =>
            Array.from({ length: n }, (_, i) => ({
                id: `d${difficulty}-${i}`,
                difficulty: Number(difficulty)
            }))
        );

    it("follows the ramp when the bank can supply it", () => {
        const dealt = dealRun(bank({ 1: 5, 2: 5, 3: 5, 4: 5, 5: 5 }));

        expect(dealt.map((d) => d.difficulty)).toEqual([...DIFFICULTY_RAMP]);
    });

    it("never deals the same incident twice in one run", () => {
        const dealt = dealRun(bank({ 1: 5, 2: 5, 3: 5, 4: 5, 5: 5 }));

        expect(new Set(dealt.map((d) => d.id)).size).toBe(dealt.length);
    });

    it("respects the order candidates arrive in, so recency still counts", () => {
        // Candidates arrive "unseen first, then random". Taking the first match
        // of a tier is what preserves that preference.
        const candidates = [
            { id: "fresh", difficulty: 1 },
            { id: "seen", difficulty: 1 },
            ...bank({ 2: 2, 3: 2, 4: 2, 5: 1 })
        ];

        expect(dealRun(candidates)[0]!.id).toBe("fresh");
    });

    it("falls back to the nearest tier rather than dealing a short run", () => {
        // A run three hunts short because one tier ran dry is worse than a run
        // where one hunt is a shade off the intended difficulty.
        const dealt = dealRun(bank({ 1: 10, 5: 5 }));

        expect(dealt).toHaveLength(BUG_HUNT_INCIDENTS_PER_SESSION);
    });

    it("stops cleanly when the bank cannot fill a run at all", () => {
        expect(dealRun(bank({ 1: 3 }))).toHaveLength(3);
        expect(dealRun([])).toHaveLength(0);
    });
});

describe("the hint ladder", () => {
    it("hands out the next hint in order and never repeats one", () => {
        // The client cannot name a hint, so order and single-use are structural.
        expect(nextHintIndex(0, 3)).toBe(0);
        expect(nextHintIndex(1, 3)).toBe(1);
        expect(nextHintIndex(2, 3)).toBe(2);
    });

    it("refuses once the ladder is spent", () => {
        expect(nextHintIndex(3, 3)).toBeNull();
        expect(nextHintIndex(1, 1)).toBeNull();
    });

    it("never exceeds the ceiling the schema enforces", () => {
        expect(nextHintIndex(MAX_HINTS, 99)).toBeNull();
    });
});

describe("scoring rewards correctness first", () => {
    it("pays nothing for an unresolved incident", () => {
        expect(pointsForRound(failed(), 0)).toBe(0);
        expect(pointsForRound(round({ status: "pending" }), 0)).toBe(0);
    });

    it("cannot be out-earned by speed", () => {
        // The whole tuning principle in one assertion: the fastest possible
        // second attempt must never beat a slow, careful first-attempt fix.
        const slowAndRight = pointsForRound(round({ elapsedMs: 59_000 }), 1);
        const fastAndSloppy = pointsForRound(round({ attempts: 2, elapsedMs: 0 }), 1);

        expect(slowAndRight).toBeGreaterThan(fastAndSloppy);
    });

    it("charges nothing for reading carefully", () => {
        // Flat for the first 40% of the budget. A player who reads the snippet
        // twice before answering should lose exactly zero points for it.
        expect(speedBonus(0, 60_000)).toBe(speedBonus(24_000, 60_000));

        // And past the grace point it really does decay -- measured a few
        // seconds out, because one millisecond past rounds straight back to the
        // maximum and would assert nothing.
        expect(speedBonus(30_000, 60_000)).toBeLessThan(speedBonus(24_000, 60_000));
    });

    it("decays speed to nothing at the deadline", () => {
        expect(speedBonus(60_000, 60_000)).toBe(0);
        expect(speedBonus(null, 60_000)).toBe(0);
    });

    it("charges for hints without making a resolution worthless", () => {
        const clean = pointsForRound(round(), 1);
        const hinted = pointsForRound(round({ hintsUsed: 3 }), 1);

        expect(hinted).toBeLessThan(clean);
        expect(hinted).toBeGreaterThan(0);
    });

    it("never lets the worst resolution pay less than the floor", () => {
        // Three hints, second attempt, right on the deadline.
        const worst = round({ attempts: 2, hintsUsed: 3, elapsedMs: 60_000 });

        expect(pointsForRound(worst, 1)).toBeGreaterThanOrEqual(40);
    });

    it("builds a streak that caps rather than running away", () => {
        expect(streakBonus(1)).toBe(0);
        expect(streakBonus(2)).toBe(20);
        expect(streakBonus(5)).toBe(80);
        expect(streakBonus(50)).toBe(80);
    });

    it("pays more for the boss than for the same work earlier", () => {
        const ordinary = pointsForRound(round({ displayOrder: 1 }), 1);
        const boss = pointsForRound(round({ displayOrder: BOSS_DISPLAY_ORDER }), 1);

        expect(boss).toBeGreaterThan(ordinary);
    });
});

describe("a session's score is reproducible", () => {
    const run: ScoredRound[] = [
        round({ displayOrder: 1, elapsedMs: 10_000 }),
        round({ displayOrder: 2, attempts: 2, elapsedMs: 30_000 }),
        failed({ displayOrder: 3 }),
        round({ displayOrder: 4, hintsUsed: 1, elapsedMs: 20_000 }),
        round({ displayOrder: 5, elapsedMs: 15_000 })
    ];

    it("returns the same number every time for the same rows", () => {
        // The reason there is no stored score column: the rows ARE the score.
        expect(scoreForSession(run)).toBe(scoreForSession(run));
        expect(scoreForSession([...run].reverse())).toBe(scoreForSession(run));
    });

    it("breaks the streak on a failed incident", () => {
        const unbroken = [
            round({ displayOrder: 1 }),
            round({ displayOrder: 2 }),
            round({ displayOrder: 3 })
        ];
        const broken = [
            round({ displayOrder: 1 }),
            failed({ displayOrder: 2 }),
            round({ displayOrder: 3 })
        ];

        expect(scoreForSession(broken)).toBeLessThan(scoreForSession(unbroken));
    });

    it("counts resolutions, first-try fixes, hints and the best streak", () => {
        expect(resolvedCount(run)).toBe(4);
        expect(firstTryCount(run)).toBe(3);
        expect(hintsSpent(run)).toBe(1);
        expect(bestStreak(run)).toBe(2);
    });

    it("averages only incidents that were actually resolved", () => {
        // A failed incident has no resolution time; averaging its budget in as
        // "slow" would misreport how fast the player actually works.
        expect(averageResolutionMs(run)).toBe(Math.round((10_000 + 30_000 + 20_000 + 15_000) / 4));
        expect(averageResolutionMs([failed()])).toBeNull();
    });
});

describe("system integrity is derived, not stored", () => {
    it("leaves a flawless run at full integrity, boss included", () => {
        // A perfect player reaches the boss on 100% and finishes on 100%. The
        // escalation is the framing, not a drained meter.
        const flawless = RUN.map((displayOrder) => round({ displayOrder }));

        expect(systemIntegrity(flawless)).toBe(100);
    });

    it("drops for failures, retries and hints", () => {
        expect(systemIntegrity([failed()])).toBeLessThan(100);
        expect(systemIntegrity([round({ attempts: 2 })])).toBeLessThan(100);
        expect(systemIntegrity([round({ hintsUsed: 2 })])).toBeLessThan(100);
    });

    it("costs more to fail an incident than to need a second attempt", () => {
        expect(systemIntegrity([failed()])).toBeLessThan(
            systemIntegrity([round({ attempts: 2 })])
        );
    });

    it("never leaves the 0-100 range", () => {
        const catastrophe = RUN.map((displayOrder) => failed({ displayOrder, hintsUsed: 3 }));

        expect(systemIntegrity(catastrophe)).toBe(0);
        expect(systemIntegrity([])).toBe(100);
    });

    it("returns the same value for the same rows", () => {
        const run = [round({ hintsUsed: 1 }), failed({ displayOrder: 2 })];

        expect(systemIntegrity(run)).toBe(systemIntegrity([...run].reverse()));
    });
});

describe("XP keeps the platform invariant", () => {
    it("pays exactly 125 for a perfect run, like every other game", () => {
        const perfect = RUN.map((displayOrder) => round({ displayOrder }));

        expect(xpForSession(perfect)).toBe(PERFECT_GAME_XP);
    });

    it("does not penalise hints, only score", () => {
        // XP is the one number compared across games. A Bug-Hunt-only penalty
        // would make this game a worse way to earn the same skill.
        const clean = RUN.map((displayOrder) => round({ displayOrder }));
        const hinted = clean.map((r) => ({ ...r, hintsUsed: 3 }));

        expect(xpForSession(hinted)).toBe(xpForSession(clean));
        expect(scoreForSession(hinted)).toBeLessThan(scoreForSession(clean));
    });

    it("still pays the completion bonus for a run that resolved nothing", () => {
        const wipeout = RUN.map((displayOrder) => failed({ displayOrder }));

        expect(xpForSession(wipeout)).toBe(COMPLETION_BONUS_XP);
    });
});

describe("the round state machine", () => {
    it("resolves on a correct diagnosis, whichever attempt it was", () => {
        expect(outcomeFor(true, 1)).toBe("resolved");
        expect(outcomeFor(true, 2)).toBe("resolved");
    });

    it("offers a retry after the first wrong diagnosis", () => {
        expect(outcomeFor(false, 1)).toBe("retry");
    });

    it("fails the incident on the second wrong diagnosis", () => {
        expect(outcomeFor(false, MAX_ATTEMPTS)).toBe("failed");
    });

    it("refuses a third diagnosis", () => {
        expect(canAttempt("pending", 0)).toBe(true);
        expect(canAttempt("pending", 1)).toBe(true);
        expect(canAttempt("pending", MAX_ATTEMPTS)).toBe(false);
    });

    it("refuses any diagnosis on a round that has already ended", () => {
        expect(canAttempt("resolved", 1)).toBe(false);
        expect(canAttempt("failed", 2)).toBe(false);
    });
});

describe("challenge types", () => {
    it("accepts all four in the schema but plays only the two built", () => {
        expect(CHALLENGE_TYPES).toHaveLength(4);
        expect(PLAYABLE_CHALLENGE_TYPES).toEqual(["find_line", "choose_patch"]);
    });

    it("rejects a type the client has no interaction for", () => {
        // Failing loudly beats rendering a "pick the line" interface for a
        // "trace the failure" incident, which would be unanswerable.
        expect(isPlayableChallengeType("find_line")).toBe(true);
        expect(isPlayableChallengeType("trace")).toBe(false);
        expect(isPlayableChallengeType("nonsense")).toBe(false);
    });

    it("keeps the schema's list and the code's list in step", () => {
        for (const type of CHALLENGE_TYPES) {
            expect(MIGRATION_SQL, `${type} must be a legal challenge_type`).toContain(`'${type}'`);
        }
    });
});

describe("migration 014 encodes the invariants the code relies on", () => {
    it("creates the three tables and no per-game sessions table", () => {
        expect(MIGRATION_SQL).toMatch(/CREATE TABLE bug_hunt_incidents/);
        expect(MIGRATION_SQL).toMatch(/CREATE TABLE bug_hunt_options/);
        expect(MIGRATION_SQL).toMatch(/CREATE TABLE bug_hunt_rounds/);
        expect(MIGRATION_SQL).not.toMatch(/CREATE TABLE bug_hunt_sessions/);
    });

    it("registers the game by slug in the same transaction", () => {
        // A table referencing a games row that was never inserted is the exact
        // failure /api/ready exists to name.
        expect(MIGRATION_SQL).toMatch(/BEGIN;/);
        expect(MIGRATION_SQL).toMatch(/INSERT INTO games \(slug, name, tagline\)/);
        expect(MIGRATION_SQL).toMatch(/'bug-hunt'/);
        expect(MIGRATION_SQL).toMatch(/COMMIT;/);
    });

    it("stores no score on a round", () => {
        // The invariant the whole scoring module depends on.
        expect(MIGRATION_SQL).not.toMatch(/\bscore\b/);
        expect(MIGRATION_SQL).not.toMatch(/\bpoints\b/);
        expect(MIGRATION_SQL).not.toMatch(/integrity/);
    });

    it("keeps the round bound to the shared session table", () => {
        expect(MIGRATION_SQL).toMatch(/REFERENCES game_sessions\(id\) ON DELETE CASCADE/);
    });

    it("proves a chosen option belongs to the round's own incident", () => {
        // Without the composite FK a player could post an option id from a
        // different, easier incident and have it accepted.
        expect(MIGRATION_SQL).toMatch(/UNIQUE \(incident_id, id\)/);
        expect(MIGRATION_SQL).toMatch(/FOREIGN KEY \(incident_id, selected_option_id\)/);
        expect(MIGRATION_SQL).toMatch(/REFERENCES bug_hunt_options \(incident_id, id\)/);
    });

    it("allows exactly one active correct option per incident", () => {
        expect(MIGRATION_SQL).toMatch(
            /CREATE UNIQUE INDEX bug_hunt_options_one_correct_idx[\s\S]*?WHERE is_active AND is_correct/
        );
    });

    it("bounds attempts and hints to what the rules allow", () => {
        expect(MIGRATION_SQL).toMatch(/attempts BETWEEN 0 AND 2/);
        expect(MIGRATION_SQL).toMatch(/hints_used BETWEEN 0 AND 3/);
    });

    it("agrees with the constants the code enforces", () => {
        // Drift between the CHECK and MAX_ATTEMPTS would let the route write a
        // row the database then rejects, mid-transaction.
        expect(MIGRATION_SQL).toContain(`attempts BETWEEN 0 AND ${MAX_ATTEMPTS}`);
        expect(MIGRATION_SQL).toContain(`hints_used BETWEEN 0 AND ${MAX_HINTS}`);
    });

    it("gives every round its own persisted clock", () => {
        expect(MIGRATION_SQL).toMatch(/time_limit_ms INTEGER NOT NULL/);
        expect(MIGRATION_SQL).toMatch(/served_at TIMESTAMPTZ/);
    });

    it("has one state constraint per status", () => {
        for (const status of ["pending", "resolved", "failed"]) {
            expect(MIGRATION_SQL, status).toContain(`bug_hunt_rounds_${status}_state`);
        }
    });

    it("plans ten hunts per run", () => {
        expect(BUG_HUNT_INCIDENTS_PER_SESSION).toBe(10);
        expect(BOSS_DISPLAY_ORDER).toBe(BUG_HUNT_INCIDENTS_PER_SESSION);
    });
});
