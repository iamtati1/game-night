import { describe, expect, it } from "vitest";
import { COMPLETION_BONUS_XP } from "../games/xp.js";
import {
    MAX_PLAUSIBLE_MS,
    MIN_PLAUSIBLE_MS,
    REACTION_ROUNDS_PER_SESSION,
    averageReactionMs,
    bestReactionMs,
    isPlausibleReaction,
    pointsForReaction,
    scoreForSession,
    tierFor,
    xpForSession,
    type ScoredRound
} from "./scoring.js";

const reacted = (reactionMs: number): ScoredRound => ({ status: "reacted", reactionMs });
const falseStart = (): ScoredRound => ({ status: "false_start", reactionMs: null });
const pending = (): ScoredRound => ({ status: "pending", reactionMs: null });

describe("isPlausibleReaction", () => {
    it("accepts a human reaction", () => {
        expect(isPlausibleReaction(287)).toBe(true);
        expect(isPlausibleReaction(MIN_PLAUSIBLE_MS)).toBe(true);
        expect(isPlausibleReaction(MAX_PLAUSIBLE_MS)).toBe(true);
    });

    it("rejects faster than human simple-reaction latency", () => {
        // A submission under the floor was not a reaction, whether it came from a
        // lucky guess, a held key, or a tampered client.
        expect(isPlausibleReaction(MIN_PLAUSIBLE_MS - 1)).toBe(false);
        expect(isPlausibleReaction(1)).toBe(false);
        expect(isPlausibleReaction(0)).toBe(false);
    });

    it("rejects negatives and absurd values", () => {
        expect(isPlausibleReaction(-1)).toBe(false);
        expect(isPlausibleReaction(-9999)).toBe(false);
        expect(isPlausibleReaction(MAX_PLAUSIBLE_MS + 1)).toBe(false);
        expect(isPlausibleReaction(Number.MAX_SAFE_INTEGER)).toBe(false);
    });

    it("rejects anything that is not an integer millisecond", () => {
        expect(isPlausibleReaction(287.5)).toBe(false);
        expect(isPlausibleReaction(NaN)).toBe(false);
        expect(isPlausibleReaction(Infinity)).toBe(false);
        expect(isPlausibleReaction("287")).toBe(false);
        expect(isPlausibleReaction(null)).toBe(false);
        expect(isPlausibleReaction(undefined)).toBe(false);
    });
});

describe("pointsForReaction", () => {
    it("pays the maximum at or below the floor", () => {
        expect(pointsForReaction(150)).toBe(pointsForReaction(100));
        expect(pointsForReaction(150)).toBe(1700);
    });

    it("pays only the base at or above the ceiling", () => {
        // Never zero for a real reaction: a slow round should still feel like it
        // counted, or the game reads as punishment.
        expect(pointsForReaction(600)).toBe(200);
        expect(pointsForReaction(5000)).toBe(200);
    });

    it("falls monotonically as the reaction slows", () => {
        const times = [160, 200, 250, 300, 400, 500, 590];
        const points = times.map(pointsForReaction);

        for (let i = 1; i < points.length; i++) {
            expect(points[i]!).toBeLessThan(points[i - 1]!);
        }
    });

    it("scores a false start zero", () => {
        expect(pointsForReaction(null)).toBe(0);
    });

    it("is deterministic", () => {
        expect(pointsForReaction(287)).toBe(pointsForReaction(287));
        expect(pointsForReaction(287)).toBe(1243);
    });
});

describe("scoreForSession", () => {
    it("is the sum of the rounds that landed", () => {
        const rounds = [reacted(200), reacted(300)];

        expect(scoreForSession(rounds)).toBe(pointsForReaction(200) + pointsForReaction(300));
    });

    it("ignores false starts and unplayed rounds", () => {
        expect(scoreForSession([reacted(250), falseStart(), pending()])).toBe(
            pointsForReaction(250)
        );
    });

    it("is zero for a run of nothing but false starts", () => {
        expect(scoreForSession([falseStart(), falseStart()])).toBe(0);
    });
});

describe("xpForSession", () => {
    it("pays for rounds resolved, not rounds won", () => {
        // XP is progression. Someone who played all five rounds played the game,
        // however slow they were, and docking it would make Jolt punitive.
        const allFast = Array.from({ length: REACTION_ROUNDS_PER_SESSION }, () => reacted(180));
        const allEarly = Array.from({ length: REACTION_ROUNDS_PER_SESSION }, () => falseStart());

        expect(xpForSession(allEarly)).toBe(xpForSession(allFast));
    });

    it("matches the platform value for a completed run", () => {
        // A completed Reaction run is worth exactly what a completed Code Blitz or
        // Flush run is worth -- otherwise the shortest game becomes the way to farm.
        const full = Array.from({ length: REACTION_ROUNDS_PER_SESSION }, () => reacted(250));

        expect(xpForSession(full)).toBe(125);
    });

    it("pays the completion bonus even with nothing resolved", () => {
        expect(xpForSession([pending(), pending()])).toBe(COMPLETION_BONUS_XP);
    });

    it("scales with rounds resolved", () => {
        expect(xpForSession([reacted(200)])).toBeLessThan(
            xpForSession([reacted(200), reacted(200)])
        );
    });
});

describe("tierFor", () => {
    it("labels each band", () => {
        expect(tierFor(150).key).toBe("lightning");
        expect(tierFor(199).key).toBe("lightning");
        expect(tierFor(200).key).toBe("incredible");
        expect(tierFor(249).key).toBe("incredible");
        expect(tierFor(250).key).toBe("fast");
        expect(tierFor(299).key).toBe("fast");
        expect(tierFor(300).key).toBe("solid");
        expect(tierFor(399).key).toBe("solid");
        expect(tierFor(400).key).toBe("sharp");
        expect(tierFor(4000).key).toBe("sharp");
    });

    it("never leaves a reaction untiered", () => {
        for (const ms of [80, 137, 200, 250, 300, 400, 999, 5000]) {
            expect(tierFor(ms).label.length).toBeGreaterThan(0);
        }
    });

    it("words the slowest tier as encouragement, not a verdict", () => {
        // The worst outcome in a game played for fun should not read as a judgement.
        expect(tierFor(900).label).toBe("Keep sharp");
    });
});

describe("bestReactionMs and averageReactionMs", () => {
    it("report the fastest and the mean of what landed", () => {
        const rounds = [reacted(300), reacted(220), reacted(260)];

        expect(bestReactionMs(rounds)).toBe(220);
        expect(averageReactionMs(rounds)).toBe(260);
    });

    it("exclude false starts rather than counting them as slow", () => {
        const rounds = [reacted(200), falseStart(), reacted(300)];

        expect(bestReactionMs(rounds)).toBe(200);
        expect(averageReactionMs(rounds)).toBe(250);
    });

    it("return null when nothing landed", () => {
        expect(bestReactionMs([falseStart()])).toBeNull();
        expect(averageReactionMs([falseStart()])).toBeNull();
        expect(bestReactionMs([])).toBeNull();
        expect(averageReactionMs([])).toBeNull();
    });
});
