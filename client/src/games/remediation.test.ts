import { describe, expect, it } from "vitest";
import { CONCEPTS, TOPICS } from "./curriculum.js";
import { lessonFor } from "./lessons.js";
import { remediationFor } from "./remediation.js";

/**
 * The repair offered after a wrong answer.
 *
 * The behavioural half lives in EncounterPage.test.tsx. These assert the two
 * properties the content has to have: that a repair exists where it is needed,
 * and that it obeys the same semantic dependency rule as every curriculum
 * question -- a repair that reaches forward teaches the learner a concept they
 * have not met, at the exact moment they are already confused.
 */
describe("finding a repair", () => {
    it("returns the authored neighbouring question, not the original", () => {
        const step = remediationFor("reassignment", "predict");

        expect(step, "reassignment has an authored retry").not.toBeNull();
        expect(step!.choices.some((c) => c.correct)).toBe(true);

        const original = lessonFor("reassignment")!.steps.find((s) => s.demand === "predict");

        expect(step!.code, "a different problem, not the same one").not.toBe(original!.code);
    });

    it("prefers a repair at the rung the learner is on", () => {
        const lesson = lessonFor("let-vs-const")!;
        const authored = lesson.steps.find((s) => s.demand === "predict" && s.retry);

        expect(remediationFor("let-vs-const", "predict")).toBe(authored!.retry);
    });

    it("falls back within the concept rather than leaving it", () => {
        // A rung with no authored repair of its own still gets one from the same
        // concept -- a simpler related problem, which is what the loop asks for.
        const step = remediationFor("reassignment", "diagnose");

        expect(step).not.toBeNull();

        const own = lessonFor("reassignment")!.steps.flatMap((s) => (s.retry ? [s.retry] : []));

        expect(own, "it came from this concept's own lesson").toContain(step);
    });

    it("returns null for a concept with no lesson", () => {
        // THE PLACEHOLDER CHAIN ENDS HERE. `closures` stood in this line until
        // Scope landed, then `async-await` until Async did, then `this-binding`
        // until this-and-classes did -- each topic retiring the last example as
        // it was built. Every concept in the curriculum now has a lesson, so
        // there is no real slug left to stand for "taught nothing yet", and the
        // only case remaining is a name that is not a concept at all.
        //
        // If a future concept is added WITHOUT a lesson, the "covers every
        // taught concept" test above is what will say so.
        expect(remediationFor("not-a-concept", "predict")).toBeNull();
        expect(remediationFor("", "predict")).toBeNull();
    });
});

/**
 * THE SAME RULE AS CURRICULUM QUESTIONS. A repair may use the concept it
 * belongs to and anything taught before it; it may not require something the
 * learner has not reached.
 */
describe("a repair never reaches forward", () => {
    /** Curriculum position, as (topic order, concept order). */
    const position = new Map<string, number>();

    for (const [t, topic] of TOPICS.entries()) {
        const inTopic = CONCEPTS.filter((c) => c.topic === topic.id);

        for (const [c, concept] of inTopic.entries()) {
            position.set(concept.id, (t + 1) * 100 + (c + 1));
        }
    }

    /** Syntax, and the concept that owns it. */
    const OWNS: [RegExp, string][] = [
        [/\btypeof\b/, "typeof"],
        [/\bconst\b/, "let-vs-const"],
        [/[<>]=?/, "comparison-operators"],
        [/"[^"]*"\s*\+|\+\s*"/, "string-concatenation"],
        /*
         * An array LITERAL, not any bracket. `word[1]` is string-indexing,
         * which Strings #4 teaches -- flagging every square bracket as an
         * array made that concept unable to demonstrate itself.
         */
        [/\[\s*\]|\[[^\]]*,/, "array-indexing"],
        [/\bfunction\b|=>/, "function-declaration"],
        [/\bfor\b|\bwhile\b/, "for-loop-anatomy"],
        /*
         * Split now that Async is built. This was one blanket rule saying
         * "nothing before Async may mention a Promise", written when the
         * topic did not exist. `Promise` is introduced at promise-states,
         * two concepts before `await` -- so the rule still holds, it just
         * knows which concept owns which word.
         */
        [/\bsetTimeout\s*\(/, "callbacks"],
        [/\bPromise\b/, "promise-states"],
        [/\basync\b|\bawait\b/, "async-await"],
        [/Promise\.all/, "promise-all"],
        [/\.map\(|\.filter\(|\.reduce\(/, "map"]
    ];

    it("uses no syntax owned by a later concept", () => {
        const offences: string[] = [];

        for (const concept of CONCEPTS) {
            const here = position.get(concept.id);

            if (here === undefined || !lessonFor(concept.id)) continue;

            for (const demand of concept.demands) {
                const step = remediationFor(concept.id, demand);

                if (!step) continue;

                /*
                 * CODE, NOT PROSE. The first version of this scanned `ask` as
                 * well and flagged "which keyword would you use FOR a value
                 * that has to change" as requiring for-loops. A question is
                 * written in English; only its snippet -- and any backticked
                 * fragment, which is code quoted inline -- is JavaScript.
                 */
                const quoted = [...step.ask.matchAll(/`([^`]+)`/g)].map((q) => q[1]).join("\n");
                const text = `${quoted}\n${step.code ?? ""}`;

                for (const [pattern, owner] of OWNS) {
                    const ownerAt = position.get(owner);

                    if (ownerAt !== undefined && ownerAt > here && pattern.test(text)) {
                        offences.push(`${concept.id}/${demand} needs ${owner}`);
                    }
                }
            }
        }

        expect([...new Set(offences)].join("\n")).toBe("");
    });

    it("covers every taught concept", () => {
        const taught = CONCEPTS.filter((c) => lessonFor(c.id));
        const without = taught.filter((c) => !remediationFor(c.id, c.demands[0]!));

        // Every lesson carries at least one authored retry. A concept that stops
        // doing so loses its repair silently, which is the failure this catches.
        expect(without.map((c) => c.id)).toEqual([]);
    });
});
