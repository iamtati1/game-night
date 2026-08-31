import { describe, expect, it } from "vitest";
import {
    FULL_SPEED_BONUS_MS,
    QUESTION_TIME_LIMIT_MS,
    isExpired,
    pointsForAnswer,
    scoreForSession,
    xpForSession,
    type ScoredAnswer
} from "./scoring.js";

const t = (ms: number) => new Date(ms);

function answer(isCorrect: boolean | null, elapsedMs?: number): ScoredAnswer {
    if (elapsedMs === undefined) {
        return { isCorrect, servedAt: null, answeredAt: null };
    }
    return { isCorrect, servedAt: t(0), answeredAt: t(elapsedMs) };
}

describe("pointsForAnswer", () => {
    it("keeps the full bonus through the grace period", () => {
        // Reading a five-line snippet should not cost points. The previous curve
        // decayed from the first millisecond, so the scoring pressed for speed at
        // exactly the moment the game wants thinking.
        expect(pointsForAnswer(true, 0)).toBe(150);
        expect(pointsForAnswer(true, 4_000)).toBe(150);
        expect(pointsForAnswer(true, FULL_SPEED_BONUS_MS)).toBe(150);
    });

    it("starts sliding after the grace period", () => {
        // Not +1ms: the decay is 50 points across 27 seconds, so a single
        // millisecond rounds back to the maximum. The assertion has to be past
        // the rounding boundary to mean anything.
        expect(pointsForAnswer(true, FULL_SPEED_BONUS_MS + 300)).toBeLessThan(150);
    });

    it("decays monotonically from the grace period to the buzzer", () => {
        const points = [8_000, 12_000, 18_000, 24_000, 30_000, 35_000].map((ms) =>
            pointsForAnswer(true, ms)
        );

        for (let i = 1; i < points.length; i++) {
            expect(points[i]!).toBeLessThan(points[i - 1]!);
        }
    });

    it("awards nothing for an incorrect answer, however fast", () => {
        expect(pointsForAnswer(false, 0)).toBe(0);
        expect(pointsForAnswer(false, 29_000)).toBe(0);
    });

    it("awards the full speed bonus for an instant answer", () => {
        expect(pointsForAnswer(true, 0)).toBe(150);
    });

    it("decays the bonus linearly across the window", () => {
        // Past the grace period the bonus slides across the remaining window.
        expect(pointsForAnswer(true, 15_000)).toBe(137);
        expect(pointsForAnswer(true, 25_000)).toBe(119);
        expect(pointsForAnswer(true, 34_000)).toBe(102);
    });

    it("awards base points only at the buzzer", () => {
        expect(pointsForAnswer(true, QUESTION_TIME_LIMIT_MS)).toBe(100);
    });

    it("never drops below base points, even past the deadline", () => {
        // Defensive: the route refuses late answers, but the formula must not
        // be able to produce a negative score if it is ever called with one.
        expect(pointsForAnswer(true, 90_000)).toBe(100);
    });

    it("clamps negative elapsed time from clock skew", () => {
        expect(pointsForAnswer(true, -5_000)).toBe(150);
    });
});

describe("scoreForSession", () => {
    it("sums only correct answers", () => {
        const score = scoreForSession([
            answer(true, 0),      // 150 -- inside the grace period
            answer(false, 0),     //   0
            answer(true, 15_000)  // 137 -- 7s into the 27s decay
        ]);

        expect(score).toBe(287);
    });

    it("scores a timed-out question as zero", () => {
        // status = timed_out stores is_correct = NULL, distinct from `false`.
        expect(scoreForSession([answer(null, undefined)])).toBe(0);
    });

    it("skips a correct answer with missing timestamps rather than guessing", () => {
        expect(scoreForSession([answer(true)])).toBe(0);
    });

    it("returns zero for an empty session", () => {
        expect(scoreForSession([])).toBe(0);
    });

    it("caps a perfect instant game at 1500", () => {
        const perfect = Array.from({ length: 10 }, () => answer(true, 0));
        expect(scoreForSession(perfect)).toBe(1500);
    });
});

describe("xpForSession", () => {
    it("awards 10 per correct answer plus a 25 completion bonus", () => {
        expect(xpForSession([answer(true, 0), answer(true, 0), answer(false, 0)])).toBe(45);
    });

    it("still awards the completion bonus for a game with no correct answers", () => {
        expect(xpForSession([answer(false, 0), answer(null)])).toBe(25);
    });

    it("caps a perfect game at 125", () => {
        expect(xpForSession(Array.from({ length: 10 }, () => answer(true, 0)))).toBe(125);
    });

    it("ignores speed entirely, unlike score", () => {
        const fast = Array.from({ length: 10 }, () => answer(true, 0));
        const slow = Array.from({ length: 10 }, () => answer(true, 29_000));

        expect(xpForSession(fast)).toBe(xpForSession(slow));
        expect(scoreForSession(fast)).not.toBe(scoreForSession(slow));
    });
});

describe("deadline boundaries", () => {
    it("treats an answer exactly on the limit as still in time", () => {
        expect(isExpired(t(0), t(QUESTION_TIME_LIMIT_MS))).toBe(false);
        expect(isExpired(t(0), t(QUESTION_TIME_LIMIT_MS + 1))).toBe(true);
    });
});
