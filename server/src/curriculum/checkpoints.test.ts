import { describe, expect, it } from "vitest";
import { CHECKPOINT_KEYS, hasCheckpoint, judgeCheckpoint } from "./checkpoints.js";
import { CHALLENGED } from "./lessons.js";

/**
 * The checkpoint rule, without a database: every step right, first time or on
 * its retry. And the drift check: the server's key must match the checkpoints
 * the client actually shows (client/src/games/lessons.ts, TOPIC_CHALLENGES).
 */

const right = [{ choice: "string" }, { choice: "number" }, { choice: "false" }];

describe("judging a Values checkpoint", () => {
    it("passes every step right first time, with no retry recorded", () => {
        expect(judgeCheckpoint("values", right)).toEqual({ outcome: "passed", neededRetry: false });
    });

    it("passes a wrong first answer put right on the retry, and records the retry", () => {
        const answers = [right[0], right[1], { choice: "true", retry: "false" }];
        expect(judgeCheckpoint("values", answers)).toEqual({ outcome: "passed", neededRetry: true });
    });

    it("fails a wrong answer on a step with no retry", () => {
        expect(judgeCheckpoint("values", [{ choice: "number" }, right[1], right[2]])).toEqual({ outcome: "failed" });
    });

    it("fails a wrong retry", () => {
        const answers = [right[0], right[1], { choice: "true", retry: "true" }];
        expect(judgeCheckpoint("values", answers)).toEqual({ outcome: "failed" });
    });

    it.each([
        ["no answers at all", undefined],
        ["an object instead of a list", { passed: true }],
        ["too few answers", [right[0], right[1]]],
        ["too many answers", [...right, right[0]]],
        ["an answer that is not text", [{ choice: 1 }, right[1], right[2]]],
        ["a bare string", ["string", right[1], right[2]]],
        ["a choice the step never offered", [{ choice: "boolean" }, right[1], right[2]]],
        ["a retry on a step answered right", [{ choice: "string", retry: "string" }, right[1], right[2]]],
        ["a retry on a step that has none", [{ choice: "number", retry: "string" }, right[1], right[2]]],
        ["a wrong answer with its retry missing", [right[0], right[1], { choice: "true" }]],
        ["a retry choice the retry never offered", [right[0], right[1], { choice: "true", retry: "maybe" }]]
    ])("calls %s malformed", (_label, answers) => {
        expect(judgeCheckpoint("values", answers).outcome).toBe("malformed");
    });

    it("knows no checkpoint for a topic without one", () => {
        expect(hasCheckpoint("loops")).toBe(false);
        expect(hasCheckpoint("toString")).toBe(false);
        expect(judgeCheckpoint("loops", right).outcome).toBe("malformed");
    });
});

describe("the server's key matches the checkpoints the learner sees", () => {
    it("covers exactly the topics the path gates on", () => {
        expect(Object.keys(CHECKPOINT_KEYS).sort()).toEqual([...CHALLENGED].sort());
    });

    it("has the same steps, choices and right answers as TOPIC_CHALLENGES", async () => {
        const { TOPIC_CHALLENGES } = await import("../../../client/src/games/lessons.ts");

        const authored = Object.fromEntries(
            TOPIC_CHALLENGES.map((lesson) => [
                lesson.challengeFor!,
                lesson.steps.map((step) => ({
                    choices: step.choices.map((c) => c.text),
                    correct: step.choices.find((c) => c.correct)?.text,
                    retry: step.retry
                        ? {
                              choices: step.retry.choices.map((c) => c.text),
                              correct: step.retry.choices.find((c) => c.correct)?.text
                          }
                        : null
                }))
            ])
        );

        expect(CHECKPOINT_KEYS).toEqual(authored);

        // Judging by text needs every choice in a step to read differently, and
        // exactly one to be right.
        for (const lesson of TOPIC_CHALLENGES) {
            for (const step of [...lesson.steps, ...lesson.steps.flatMap((s) => (s.retry ? [s.retry] : []))]) {
                const texts = step.choices.map((c) => c.text);
                expect(new Set(texts).size, `${lesson.challengeFor}: ${step.ask}`).toBe(texts.length);
                expect(step.choices.filter((c) => c.correct)).toHaveLength(1);
            }
        }
    });
});
