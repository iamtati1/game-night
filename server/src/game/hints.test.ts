import { describe, expect, it } from "vitest";
import { hintCapacity, struckOptionIds } from "./hints.js";
import { HINTED_POINTS, pointsForAnswer, scoreForSession, xpForSession } from "./scoring.js";
import { hintedHalf, roundScore, scoreForSession as flushScore, xpForSession as flushXp } from "../flush/scoring.js";

/** What a hint rules out, and what it costs: half points, never XP. */

const FOUR = [
    { id: "1", isCorrect: false },
    { id: "2", isCorrect: true },
    { id: "3", isCorrect: false },
    { id: "4", isCorrect: false }
];

describe("Code Blitz hints", () => {
    it("allow two on a four-option question, one on three, none on an assembly", () => {
        expect(hintCapacity("predict-output", FOUR)).toBe(2);
        expect(hintCapacity("predict-output", FOUR.slice(0, 3))).toBe(1);
        expect(hintCapacity("complete-code", FOUR)).toBe(0);
    });

    it("rule out wrong answers only, and always leave a real choice", () => {
        for (const taken of [1, 2, 5]) {
            const struck = struckOptionIds("900", "predict-output", FOUR, taken);
            expect(struck).not.toContain("2");
            expect(struck.length).toBeLessThanOrEqual(2);
            expect(FOUR.filter((o) => !o.isCorrect && !struck.includes(o.id)).length).toBeGreaterThanOrEqual(1);
        }
    });

    it("rule out the same options every time, adding one per hint", () => {
        const one = struckOptionIds("900", "predict-output", FOUR, 1);
        const two = struckOptionIds("900", "predict-output", FOUR, 2);
        expect(struckOptionIds("900", "predict-output", FOUR, 1)).toEqual(one);
        expect(two.slice(0, 1)).toEqual(one);
        expect(two).toHaveLength(2);
    });
});

describe("what a hint costs", () => {
    it("Code Blitz: a hinted correct answer scores 50, with no speed bonus, timed or relaxed", () => {
        expect(HINTED_POINTS).toBe(50);
        expect(pointsForAnswer(true, 500, "predict-output", 9, "developing", false, true)).toBe(50);
        expect(pointsForAnswer(true, 500, "predict-output", 9, "developing", true, true)).toBe(50);
        expect(pointsForAnswer(false, 500, "predict-output", 9, "developing", false, true)).toBe(0);
        // Unhinted is unchanged.
        expect(pointsForAnswer(true, 500, "predict-output", 9)).toBe(150);
    });

    it("Code Blitz: the session total charges each hinted answer, and XP does not change", () => {
        const at = (ms: number, hinted = false) => ({ isCorrect: true, servedAt: new Date(0), answeredAt: new Date(ms), hinted });
        expect(scoreForSession([at(500), at(500, true)])).toBe(150 + 50);
        expect(xpForSession([at(500), at(500, true)])).toBe(xpForSession([at(500), at(500)]));
    });

    it("Flush: a hinted round banks half, and XP does not change", () => {
        expect(roundScore(3, true)).toBe(120);
        expect(roundScore(3, true, true)).toBe(60);
        expect(hintedHalf(30, true)).toBe(15);
        const rounds = [
            { correctPlacements: 3, status: "completed" },
            { correctPlacements: 3, status: "completed", hinted: true }
        ];
        expect(flushScore(rounds)).toBe(120 + 60);
        expect(flushXp(rounds)).toBe(flushXp(rounds.map(({ correctPlacements, status }) => ({ correctPlacements, status }))));
    });
});
