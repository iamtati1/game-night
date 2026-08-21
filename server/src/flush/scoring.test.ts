import { describe, expect, it } from "vitest";
import {
    FLUSH_ROUNDS_PER_SESSION,
    FLUSH_ROUND_TIME_LIMIT_MS,
    isExpired,
    isPlacementCorrect,
    pointsForPlacements,
    roundScore,
    scoreForSession,
    xpForSession,
    type ScoredRound
} from "./scoring.js";

const round = (correctPlacements: number, status: string): ScoredRound => ({
    correctPlacements,
    status
});

describe("pointsForPlacements", () => {
    it("escalates rather than paying a flat rate", () => {
        // 10, then +20, then +30 -- the fifth placement is worth five times the
        // first, which is what makes a late mistake expensive.
        expect(pointsForPlacements(1)).toBe(10);
        expect(pointsForPlacements(2)).toBe(30);
        expect(pointsForPlacements(3)).toBe(60);
        expect(pointsForPlacements(4)).toBe(100);
        expect(pointsForPlacements(5)).toBe(150);
    });

    it("pays nothing for a round that banked nothing", () => {
        expect(pointsForPlacements(0)).toBe(0);
    });

    it("clamps nonsense input rather than returning a negative score", () => {
        // game_sessions.score has a non-negative CHECK; the formula must not be
        // able to violate it even if called with garbage.
        expect(pointsForPlacements(-3)).toBe(0);
        expect(pointsForPlacements(2.7)).toBe(30);
    });
});

describe("roundScore", () => {
    it("doubles a completed round", () => {
        expect(roundScore(4, true)).toBe(200);
        expect(roundScore(4, false)).toBe(100);
    });

    it("keeps everything banked when a round fails partway", () => {
        // A wrong placement forfeits the multiplier, never the banked points.
        expect(roundScore(3, false)).toBe(60);
    });

    it("pays nothing for a round that failed on the first placement", () => {
        expect(roundScore(0, false)).toBe(0);
    });

    it("makes finishing worth more than the marginal placement alone", () => {
        // The decision the mechanic hinges on: placing a fourth tile correctly is
        // worth 40 banked, but completing turns 100 into 200. Guessing when you
        // are unsure risks 100, not 40.
        const stopAtThree = roundScore(3, false);
        const completeAtFour = roundScore(4, true);

        expect(completeAtFour - stopAtThree).toBeGreaterThan(pointsForPlacements(4) - pointsForPlacements(3));
    });
});

describe("scoreForSession", () => {
    it("sums every round", () => {
        expect(scoreForSession([round(4, "completed"), round(2, "failed"), round(0, "timed_out")])).toBe(
            200 + 30 + 0
        );
    });

    it("treats a timed-out round as banked-but-unmultiplied", () => {
        // Running out of time is not the same as guessing wrong: whatever was
        // placed correctly still counts, it just never earns the multiplier.
        expect(scoreForSession([round(3, "timed_out")])).toBe(60);
    });

    it("returns zero for a session with no rounds", () => {
        expect(scoreForSession([])).toBe(0);
    });
});

describe("xpForSession", () => {
    it("awards 20 per completed round plus a 25 completion bonus", () => {
        expect(xpForSession([round(4, "completed"), round(4, "completed")])).toBe(65);
    });

    it("awards only the completion bonus when no round was finished", () => {
        expect(xpForSession([round(3, "failed"), round(1, "timed_out")])).toBe(25);
    });

    it("caps a perfect session at 125, matching every other game", () => {
        const perfect = Array.from({ length: FLUSH_ROUNDS_PER_SESSION }, () => round(4, "completed"));

        expect(xpForSession(perfect)).toBe(125);
    });

    it("ignores how many placements a failed round banked", () => {
        // XP measures finishing, score measures performance. A round that banked
        // three placements but failed earns the same XP as one that banked none.
        expect(xpForSession([round(3, "failed")])).toBe(xpForSession([round(0, "failed")]));
    });
});

describe("isExpired", () => {
    it("treats a placement exactly on the limit as still in time", () => {
        const served = new Date(0);

        expect(isExpired(served, new Date(FLUSH_ROUND_TIME_LIMIT_MS))).toBe(false);
        expect(isExpired(served, new Date(FLUSH_ROUND_TIME_LIMIT_MS + 1))).toBe(true);
    });

    it("allows twice as long per round as Code Blitz", () => {
        expect(FLUSH_ROUND_TIME_LIMIT_MS).toBe(60_000);
    });
});

describe("isPlacementCorrect", () => {
    it("accepts an output placed at its own position", () => {
        expect(isPlacementCorrect(1, 1)).toBe(true);
        expect(isPlacementCorrect(3, 3)).toBe(true);
    });

    it("rejects an output placed out of order", () => {
        expect(isPlacementCorrect(2, 1)).toBe(false);
        expect(isPlacementCorrect(1, 2)).toBe(false);
    });

    it("always rejects a distractor", () => {
        // A distractor has no position, so it can never be right at any index --
        // recognising that a callback never fires is part of the puzzle.
        expect(isPlacementCorrect(null, 1)).toBe(false);
        expect(isPlacementCorrect(null, 4)).toBe(false);
    });
});
