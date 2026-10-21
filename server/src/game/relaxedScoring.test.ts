import { describe, expect, it } from "vitest";
import {
    isExpired,
    pointsForAnswer,
    QUESTION_TIME_LIMIT_MS,
    scoreForSession,
    timeLimitFor,
    xpForSession
} from "./scoring.js";
import { isRelaxed, markRelaxed } from "../sessions/relaxedRuns.js";
import { wantsFreshSession, wantsRelaxedRun } from "../sessions/schemas.js";

/**
 * The relaxed pace as pure rules. It removes the clock and the speed bonus that
 * belongs to the clock -- and touches nothing else: not correctness, not XP,
 * not the timed default.
 */
const at = (ms: number) => ({ isCorrect: true, servedAt: new Date(0), answeredAt: new Date(ms) });

describe("relaxed scoring rules", () => {
    it("has no clock on any beat", () => {
        expect(timeLimitFor("predict-output", 9, "confident", true)).toBeNull();
        expect(timeLimitFor("complete-code", 9, "developing", true)).toBeNull();
    });

    it("never expires, however late", () => {
        expect(isExpired(new Date(0), new Date(3_600_000), "predict-output", 9, "developing", true)).toBe(false);
    });

    it("pays base points for a correct answer, with no speed bonus even when instant", () => {
        expect(pointsForAnswer(true, 500, "predict-output", 9, "developing", true)).toBe(100);
        expect(pointsForAnswer(true, 600_000, "predict-output", 9, "developing", true)).toBe(100);
        expect(pointsForAnswer(false, 500, "predict-output", 9, "developing", true)).toBe(0);
    });

    it("totals a relaxed session from base points only", () => {
        const answers = [at(1_000), at(2_000), { isCorrect: false, servedAt: new Date(0), answeredAt: new Date(1) }];
        expect(scoreForSession(answers, true)).toBe(200);
    });

    it("leaves XP exactly as a timed run earns it", () => {
        const answers = [at(1_000), at(60_000)];
        // xpForSession takes no pace at all: XP counts correct answers.
        expect(xpForSession(answers)).toBe(xpForSession([at(1), at(1)]));
    });
});

describe("the timed default is untouched", () => {
    it("keeps its clock, expiry and speed bonus", () => {
        expect(timeLimitFor("predict-output", 9)).toBe(QUESTION_TIME_LIMIT_MS);
        expect(isExpired(new Date(0), new Date(QUESTION_TIME_LIMIT_MS + 1), "predict-output", 9)).toBe(true);
        expect(pointsForAnswer(true, 500, "predict-output", 9)).toBe(150);
        expect(scoreForSession([at(500)])).toBe(150);
    });
});

describe("remembering which runs are relaxed", () => {
    const req = () => ({ session: {} }) as unknown as Parameters<typeof markRelaxed>[0];

    it("marks and reads back a run by id", () => {
        const r = req();
        markRelaxed(r, "12");
        expect(isRelaxed(r, "12")).toBe(true);
        expect(isRelaxed(r, "13")).toBe(false);
    });

    it("keeps only the newest twenty", () => {
        const r = req();
        for (let i = 1; i <= 25; i++) markRelaxed(r, String(i));
        expect(isRelaxed(r, "5")).toBe(false);
        expect(isRelaxed(r, "6")).toBe(true);
        expect(isRelaxed(r, "25")).toBe(true);
    });

    it("treats a request with no login session as timed", () => {
        const r = {} as Parameters<typeof markRelaxed>[0];
        expect(() => markRelaxed(r, "1")).not.toThrow();
        expect(isRelaxed(r, "1")).toBe(false);
    });

    it("parses the start body's relaxed flag without disturbing fresh", () => {
        expect(wantsRelaxedRun({ relaxed: true })).toBe(true);
        expect(wantsRelaxedRun({})).toBe(false);
        expect(wantsRelaxedRun(undefined)).toBe(false);
        expect(wantsFreshSession({ fresh: true, relaxed: true })).toBe(true);
    });
});
