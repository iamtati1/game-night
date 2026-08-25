import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPLETION_BONUS_XP } from "../games/xp.js";
import { SYMBOLS, generateSequence, isSymbol } from "./symbols.js";
import {
    MAX_SEQUENCE_LENGTH,
    MEMORY_ROUNDS_PER_SESSION,
    ROUND_CONFIG,
    bestSequenceLength,
    bestStreak,
    configForRound,
    correctPositions,
    isKnownSubmission,
    isPerfect,
    pointsForRound,
    recallAccuracy,
    scoreForSession,
    xpForSession,
    type ScoredRound
} from "./scoring.js";

const MEMORY_PAGE = readFileSync(
    new URL("../../../client/src/pages/MemoryPage.tsx", import.meta.url),
    "utf8"
);

/** Reads a numeric presentation constant out of the client page. The split
 *  between budget (server) and cadence (client) means a curve change can be
 *  correct here and still land wrong on screen; these tests close that gap
 *  without moving presentation into the server. */
const clientConstant = (name: string): number => {
    const match = MEMORY_PAGE.match(new RegExp(`const ${name} = (\\d+);`));

    if (!match) {
        throw new Error(`MemoryPage.tsx no longer declares ${name}`);
    }

    return Number(match[1]);
};

const answered = (length: number, correct: number): ScoredRound => ({
    status: "answered",
    length,
    correct,
    perfect: correct === length
});
const pending = (length: number): ScoredRound => ({
    status: "pending",
    length,
    correct: 0,
    perfect: false
});

describe("the difficulty curve", () => {
    it("has one entry per round", () => {
        expect(ROUND_CONFIG).toHaveLength(MEMORY_ROUNDS_PER_SESSION);
        expect(ROUND_CONFIG.map((c) => c.round)).toEqual([1, 2, 3, 4, 5]);
    });

    it("moves both dials in the harder direction", () => {
        // Longer AND briefer each round. If only one moved, later rounds would be
        // more of the same rather than harder.
        for (let i = 1; i < ROUND_CONFIG.length; i++) {
            expect(ROUND_CONFIG[i]!.length).toBeGreaterThan(ROUND_CONFIG[i - 1]!.length);
            expect(ROUND_CONFIG[i]!.displayMs).toBeLessThan(ROUND_CONFIG[i - 1]!.displayMs);
        }
    });

    it("matches the specified targets", () => {
        expect(ROUND_CONFIG).toEqual([
            { round: 1, length: 4, displayMs: 4000 },
            { round: 2, length: 5, displayMs: 3500 },
            { round: 3, length: 6, displayMs: 3250 },
            { round: 4, length: 7, displayMs: 3000 },
            { round: 5, length: 8, displayMs: 2750 }
        ]);
    });

    it("gives every round enough time to be playable", () => {
        // The playtested floor, raised once. The first curve bottomed out at
        // 1700ms for eight symbols and the second at 2250ms; both still read as
        // rushed rather than demanding. Going below this again should be a
        // deliberate decision, not a drift.
        for (const config of ROUND_CONFIG) {
            expect(config.displayMs, `round ${config.round}`).toBeGreaterThanOrEqual(2750);
        }
    });

    it("still shrinks the window faster than it grows the sequence", () => {
        // Tuning must not flatten the curve into "more symbols, same effort".
        // Milliseconds per symbol has to fall every round.
        const perSymbol = ROUND_CONFIG.map((c) => c.displayMs / c.length);

        for (let i = 1; i < perSymbol.length; i++) {
            expect(perSymbol[i]!).toBeLessThan(perSymbol[i - 1]!);
        }
    });

    it("still accelerates the reveal on screen, not just on paper", () => {
        // The regression this catches: displayMs is only a budget. The client
        // splits it into a per-symbol cadence and a hold, and the cadence is
        // clamped. Raise the budgets far enough and the early rounds all pin to
        // MAX_STEP_MS -- the curve looks like it accelerates here while the
        // player sees three identical rounds. The 3500ms curve did exactly that
        // against a 420ms ceiling.
        const minStep = clientConstant("MIN_STEP_MS");
        const maxStep = clientConstant("MAX_STEP_MS");

        // Mirrors presentationTiming in MemoryPage.tsx.
        const cadence = ({ displayMs, length }: (typeof ROUND_CONFIG)[number]) =>
            Math.min(maxStep, Math.max(minStep, Math.round(displayMs / (length + 1.5))));

        const steps = ROUND_CONFIG.map(cadence);

        for (let i = 1; i < steps.length; i++) {
            expect(steps[i]!, `round ${i + 1} vs ${i}`).toBeLessThan(steps[i - 1]!);
        }
    });

    it("keeps the whole sequence on screen for a shorter total each round", () => {
        // The hold floor can hand a round back more time than its budget, so a
        // shrinking displayMs does not by itself mean a shorter look. What the
        // player is actually given -- build-up plus hold -- has to fall too.
        const minStep = clientConstant("MIN_STEP_MS");
        const maxStep = clientConstant("MAX_STEP_MS");
        const minHold = clientConstant("MIN_HOLD_MS");

        const onScreen = ({ displayMs, length }: (typeof ROUND_CONFIG)[number]) => {
            const step = Math.min(
                maxStep,
                Math.max(minStep, Math.round(displayMs / (length + 1.5)))
            );

            return step * length + Math.max(minHold, displayMs - step * length);
        };

        const totals = ROUND_CONFIG.map(onScreen);

        for (let i = 1; i < totals.length; i++) {
            expect(totals[i]!, `round ${i + 1} vs ${i}`).toBeLessThan(totals[i - 1]!);
        }
    });

    it("never asks for more symbols than the vocabulary holds", () => {
        // Checked at import time too; asserted here so the reason is documented.
        expect(MAX_SEQUENCE_LENGTH).toBeLessThanOrEqual(SYMBOLS.length);
    });

    it("refuses a round it has no configuration for", () => {
        expect(() => configForRound(0)).toThrow();
        expect(() => configForRound(6)).toThrow();
    });
});

describe("generateSequence", () => {
    it("returns the requested length", () => {
        for (const { length } of ROUND_CONFIG) {
            expect(generateSequence(length)).toHaveLength(length);
        }
    });

    it("never repeats a symbol", () => {
        // A repeat would make the recall bank ambiguous: two identical tiles give
        // the player no way to say which one they meant.
        for (let i = 0; i < 200; i++) {
            const seq = generateSequence(MAX_SEQUENCE_LENGTH);

            expect(new Set(seq).size).toBe(seq.length);
        }
    });

    it("only ever emits known symbols", () => {
        for (let i = 0; i < 50; i++) {
            expect(generateSequence(6).every(isSymbol)).toBe(true);
        }
    });

    it("is shuffled, not the vocabulary order", () => {
        // A generator that always returned the first n symbols would pass every
        // other test here and make the game trivially learnable.
        const first = new Set<string>();

        for (let i = 0; i < 60; i++) {
            first.add(generateSequence(4)[0]!);
        }

        expect(first.size).toBeGreaterThan(1);
    });

    it("is deterministic given a deterministic source", () => {
        const fixed = () => 0;

        expect(generateSequence(4, fixed)).toEqual(generateSequence(4, fixed));
    });

    it("rejects a length the vocabulary cannot satisfy", () => {
        expect(() => generateSequence(0)).toThrow();
        expect(() => generateSequence(SYMBOLS.length + 1)).toThrow();
        expect(() => generateSequence(2.5)).toThrow();
    });
});

describe("correctPositions", () => {
    it("counts position by position, not set membership", () => {
        // Remembering which symbols appeared but not their order is a different
        // achievement; scoring it as a near-miss would flatter the player.
        expect(correctPositions(["a", "b", "c"], ["a", "c", "b"])).toBe(1);
    });

    it("counts a flawless answer in full", () => {
        expect(correctPositions(["a", "b"], ["a", "b"])).toBe(2);
    });

    it("counts nothing for a completely wrong order", () => {
        expect(correctPositions(["a", "b"], ["b", "a"])).toBe(0);
    });

    it("does not pad a short answer or reward a long one", () => {
        expect(correctPositions(["a", "b", "c"], ["a"])).toBe(1);
        expect(correctPositions(["a"], ["a", "b", "c"])).toBe(1);
    });

    it("handles an empty submission", () => {
        expect(correctPositions(["a", "b"], [])).toBe(0);
    });
});

describe("isPerfect", () => {
    it("requires the same length and every position", () => {
        expect(isPerfect(["a", "b"], ["a", "b"])).toBe(true);
        expect(isPerfect(["a", "b"], ["a"])).toBe(false);
        expect(isPerfect(["a", "b"], ["a", "b", "c"])).toBe(false);
        expect(isPerfect(["a", "b"], ["b", "a"])).toBe(false);
    });
});

describe("pointsForRound", () => {
    it("pays nothing for nothing remembered", () => {
        expect(pointsForRound(4, 0, false)).toBe(0);
    });

    it("pays partial recall proportionally", () => {
        // A fumbled round stays worth finishing.
        const half = pointsForRound(8, 4, false);
        const all = pointsForRound(8, 8, false);

        expect(half).toBeGreaterThan(0);
        expect(half * 2).toBe(all);
    });

    it("pays more per position on a longer sequence", () => {
        expect(pointsForRound(8, 1, false)).toBeGreaterThan(pointsForRound(4, 1, false));
    });

    it("makes flawless feel different from nearly", () => {
        const nearly = pointsForRound(8, 7, false);
        const flawless = pointsForRound(8, 8, true);

        expect(flawless).toBeGreaterThan(nearly + pointsForRound(8, 1, false));
    });

    it("ignores time entirely", () => {
        // Memory must not become a second reaction game: there is no clock input
        // to this function at all, which is the strongest form of that guarantee.
        expect(pointsForRound.length).toBe(3);
    });

    it("totals a round number for a flawless run", () => {
        const perfect = ROUND_CONFIG.reduce(
            (total, c) => total + pointsForRound(c.length, c.length, true),
            0
        );

        expect(perfect).toBe(2000);
    });
});

describe("scoreForSession", () => {
    it("sums answered rounds and ignores unplayed ones", () => {
        expect(scoreForSession([answered(4, 4), pending(5)])).toBe(pointsForRound(4, 4, true));
    });

    it("is zero when nothing was remembered", () => {
        expect(scoreForSession([answered(4, 0), answered(5, 0)])).toBe(0);
    });
});

describe("xpForSession", () => {
    it("pays for rounds resolved, not rounds aced", () => {
        const aced = ROUND_CONFIG.map((c) => answered(c.length, c.length));
        const fumbled = ROUND_CONFIG.map((c) => answered(c.length, 0));

        expect(xpForSession(fumbled)).toBe(xpForSession(aced));
    });

    it("matches the platform value for a completed run", () => {
        expect(xpForSession(ROUND_CONFIG.map((c) => answered(c.length, 1)))).toBe(125);
    });

    it("still pays the completion bonus with nothing resolved", () => {
        expect(xpForSession([pending(4)])).toBe(COMPLETION_BONUS_XP);
    });
});

describe("bestStreak", () => {
    it("counts consecutive perfect rounds", () => {
        expect(bestStreak([answered(4, 4), answered(5, 5), answered(6, 1)])).toBe(2);
    });

    it("takes the longest run, not the last", () => {
        const rounds = [answered(4, 4), answered(5, 5), answered(6, 0), answered(7, 7)];

        expect(bestStreak(rounds)).toBe(2);
    });

    it("is zero when no round was perfect", () => {
        expect(bestStreak([answered(4, 3), answered(5, 4)])).toBe(0);
    });

    it("is broken by a mistake but does not end the session", () => {
        // All five rounds are always played: ending early would punish exactly the
        // player who most needs the next round.
        const rounds = [answered(4, 4), answered(5, 0), answered(6, 6), answered(7, 7)];

        expect(bestStreak(rounds)).toBe(2);
        expect(rounds.filter((r) => r.status === "answered")).toHaveLength(4);
    });
});

describe("recallAccuracy and bestSequenceLength", () => {
    it("measures symbols remembered against symbols presented", () => {
        expect(recallAccuracy([answered(4, 2), answered(6, 3)])).toBe(0.5);
    });

    it("reports the longest flawless sequence only", () => {
        expect(bestSequenceLength([answered(8, 7), answered(5, 5)])).toBe(5);
    });

    it("returns null with nothing to report", () => {
        expect(recallAccuracy([pending(4)])).toBeNull();
        expect(bestSequenceLength([answered(4, 3)])).toBeNull();
    });
});

describe("isKnownSubmission", () => {
    it("accepts a list of known symbols", () => {
        expect(isKnownSubmission(["circle", "star"])).toBe(true);
    });

    it("rejects unknown symbols, empty lists and non-arrays", () => {
        expect(isKnownSubmission(["circle", "banana"])).toBe(false);
        expect(isKnownSubmission([])).toBe(false);
        expect(isKnownSubmission("circle")).toBe(false);
        expect(isKnownSubmission(null)).toBe(false);
        expect(isKnownSubmission([1, 2])).toBe(false);
    });

    it("rejects a submission longer than the vocabulary", () => {
        expect(isKnownSubmission(Array(SYMBOLS.length + 1).fill("circle"))).toBe(false);
    });
});
