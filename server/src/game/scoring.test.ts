import { describe, expect, it } from "vitest";
import {
    ASSEMBLY_TIME_LIMIT_MS,
    FULL_SPEED_BONUS_MS,
    QUESTIONS_PER_SESSION,
    QUESTION_TIME_LIMIT_MS,
    RUN_BEFORE_CONFIDENT,
    UNTIMED_OPENING_BEATS,
    stanceFor,
    isExpired,
    pointsForAnswer,
    scoreForSession,
    timeLimitFor,
    xpForSession,
    type ScoredAnswer
} from "./scoring.js";
import { PERFECT_GAME_XP } from "../games/xp.js";

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
        // Not +1ms: the decay spreads 50 points across the window past the
        // grace period, so a single
        // millisecond rounds back to the maximum. The assertion has to be
        // past the rounding boundary to mean anything.
        expect(pointsForAnswer(true, FULL_SPEED_BONUS_MS + 300)).toBeLessThan(150);
    });

    it("decays monotonically from the grace period to the buzzer", () => {
        // Sampled inside the window, which is now 18s rather than 35s. Past
        // the buzzer every answer is the 100 floor, so samples from out there
        // would compare equal and the monotonic claim would pass while
        // testing nothing.
        const points = [8_000, 10_000, 12_000, 14_000, 16_000, 18_000].map((ms) =>
            pointsForAnswer(true, ms)
        );

        for (let i = 1; i < points.length; i++) {
            expect(points[i]!).toBeLessThan(points[i - 1]!);
        }
    });

    it("awards nothing for an incorrect answer, however fast", () => {
        expect(pointsForAnswer(false, 0)).toBe(0);
        expect(pointsForAnswer(false, 17_000)).toBe(0);
    });

    it("awards the full speed bonus for an instant answer", () => {
        expect(pointsForAnswer(true, 0)).toBe(150);
    });

    it("decays the bonus linearly across the window", () => {
        // Past the grace period the bonus slides across the remaining window.
        // 50 points spread from the 8s grace mark to the 18s buzzer.
        expect(pointsForAnswer(true, 10_000)).toBe(140);
        expect(pointsForAnswer(true, 13_000)).toBe(125);
        expect(pointsForAnswer(true, 17_000)).toBe(105);
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
            answer(true, 13_000)  // 125 -- halfway down the decay
        ]);

        expect(score).toBe(275);
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

describe("the opening beats carry no clock", () => {
    /*
     * THE BEGINNER'S FIRST MINUTE. Code Blitz used to time a learner's very
     * first question. Bug Hunt had already settled that its opening hunts have
     * no deadline, on the grounds that a visible countdown tells a learner who
     * is still learning the game that they are being measured -- and the two
     * games disagreed. These pin the agreement.
     */
    it("gives the opening beats no time limit", () => {
        expect(timeLimitFor("predict-output", 1)).toBeNull();
        expect(timeLimitFor("predict-output", 2)).toBeNull();
    });

    it("starts the clock once the opening is over", () => {
        expect(timeLimitFor("predict-output", UNTIMED_OPENING_BEATS + 1)).toBe(
            QUESTION_TIME_LIMIT_MS
        );
        expect(timeLimitFor("complete-code", UNTIMED_OPENING_BEATS + 1)).toBe(
            ASSEMBLY_TIME_LIMIT_MS
        );
    });

    it("cannot expire a beat that has no deadline", () => {
        // An hour later, on an untimed beat, is still not late. Enforcing a
        // deadline the learner was told they did not have is the same mistake
        // as awarding a speed bonus for beating it.
        const served = new Date("2026-01-01T00:00:00Z");
        const muchLater = new Date("2026-01-01T01:00:00Z");

        expect(isExpired(served, muchLater, "predict-output", 1)).toBe(false);
        expect(isExpired(served, muchLater, "predict-output", UNTIMED_OPENING_BEATS + 1)).toBe(
            true
        );
    });

    it("pays base points and no speed bonus on an untimed beat", () => {
        // Bug Hunt's rule, for Bug Hunt's reason: a speed bonus would quietly
        // reintroduce the clock and inflate the easiest scores in the run.
        expect(pointsForAnswer(true, 0, "predict-output", 1)).toBe(100);
        expect(pointsForAnswer(true, 600_000, "predict-output", 1)).toBe(100);

        // And the timed beats are untouched.
        expect(pointsForAnswer(true, 0, "predict-output", UNTIMED_OPENING_BEATS + 1)).toBe(150);
    });

    it("still pays exactly 125 XP for a perfect run", () => {
        // THE INVARIANT THAT MATTERS. XP is derived from how many answers were
        // correct, never from points, so softening the opening cannot change
        // what a perfect game is worth against every other game.
        const perfect = Array.from({ length: QUESTIONS_PER_SESSION }, () => ({
            isCorrect: true,
            servedAt: new Date(),
            answeredAt: new Date(),
            challengeType: "predict-output"
        }));

        expect(xpForSession(perfect as never)).toBe(PERFECT_GAME_XP);
    });
});

describe("the round notices when a learner is stuck", () => {
    /*
     * WITHIN THE ROUND, NOT ACROSS A HISTORY. Nothing is stored and nothing
     * carries to tomorrow -- this reads the answers already given in this run.
     * The signal is the product's own: "learner misses twice -> detect
     * difficulty -> remove timer".
     */
    const answered = (isCorrect: boolean | null) => ({ status: "answered", isCorrect });
    const timedOut = { status: "timed_out", isCorrect: null };
    const pending = { status: "pending", isCorrect: null };

    it("starts neutral", () => {
        expect(stanceFor([])).toBe("developing");
        expect(stanceFor([answered(true)])).toBe("developing");
    });

    it("ignores beats the learner has not had a go at yet", () => {
        expect(stanceFor([pending, pending])).toBe("developing");
    });

    it("notices two misses in a row", () => {
        expect(stanceFor([answered(true), answered(false), answered(false)])).toBe("struggling");
    });

    it("counts a timeout as a miss", () => {
        // Running out of time is the same experience as getting it wrong, and
        // arguably more of a signal that the clock is the problem.
        expect(stanceFor([answered(false), timedOut])).toBe("struggling");
    });

    it("needs them CONSECUTIVE, not merely two in the round", () => {
        // Missing beats two and nine is a different experience from missing two
        // in a row. The question being answered is "are they stuck right now".
        expect(stanceFor([answered(false), answered(true), answered(false)])).toBe("developing");
    });

    it("lifts as soon as they get one right", () => {
        expect(
            stanceFor([answered(false), answered(false), answered(true)])
        ).toBe("developing");
    });

    it("recognises a confident run", () => {
        const four = Array.from({ length: RUN_BEFORE_CONFIDENT }, () => answered(true));

        expect(stanceFor(four)).toBe("confident");
    });
});

describe("a struggling learner gets the clock taken away", () => {
    it("removes the deadline wherever they are in the round", () => {
        // Not only in the opening. The support someone needs after two misses
        // is time to think, not a faster version of what they are failing.
        expect(timeLimitFor("predict-output", 7, "struggling")).toBeNull();
        expect(timeLimitFor("predict-output", 7, "developing")).toBe(QUESTION_TIME_LIMIT_MS);
    });

    it("cannot time them out against a clock they were never shown", () => {
        const served = new Date("2026-01-01T00:00:00Z");
        const later = new Date("2026-01-01T00:30:00Z");

        expect(isExpired(served, later, "predict-output", 7, "struggling")).toBe(false);
        expect(isExpired(served, later, "predict-output", 7, "developing")).toBe(true);
    });

    it("pays base points, so relief is never worth more than skill", () => {
        // An untimed beat earns no speed bonus whatever caused it to be
        // untimed. Otherwise missing twice on purpose would be a scoring
        // strategy.
        expect(pointsForAnswer(true, 0, "predict-output", 7, "struggling")).toBe(100);
        expect(pointsForAnswer(true, 0, "predict-output", 7, "developing")).toBe(150);
    });

    it("makes nothing harder for a confident learner", () => {
        // Understanding before speed. A stretch mode that shortens the clock is
        // a separate decision with its own scoring consequences; the stance is
        // reported so it can be made later, not pre-empted here.
        expect(timeLimitFor("predict-output", 7, "confident")).toBe(
            timeLimitFor("predict-output", 7, "developing")
        );
    });
});
