import { describe, expect, it } from "vitest";
import { MAX_FOCUS_BEATS, dealSession, type Dealable } from "./curve.js";

/**
 * CODE BLITZ, AIMED AT WHAT THE LEARNER IS LEARNING.
 *
 * The reserved beats used to be chosen by topic. A topic is the wrong unit for
 * this: rungs and evidence are keyed on a CONCEPT, so only a question tagged to
 * the learner's current concept can have its correct answer clear that
 * concept's rung. These tests are about which question lands in those two beats
 * and, just as much, about what the dealer refuses to invent when it has
 * nothing suitable.
 *
 * Everything here is the pure dealer. What a learner may be dealt AT ALL is
 * decided in SQL before the array arrives -- see curriculum/selection.ts -- and
 * is covered by eligibility.test.ts. The dealer can only choose among the rows
 * it is handed, which is itself one of the properties asserted below.
 */

/** Zero-indexed beats FOCUS_SLOTS reserves: first and sixth of ten. */
const SLOTS = [0, 5];

function q(
    id: string,
    topic: string | null,
    concept_id: string | null = null,
    difficulty: number | null = 2
): Dealable & { id: string } {
    return { id, topic, concept_id, difficulty };
}

/** A plain bank with nothing tagged, so a run has somewhere to go. */
function filler(n: number, topic = "loops"): (Dealable & { id: string })[] {
    return Array.from({ length: n }, (_, i) => q(`filler-${i}`, topic, null, (i % 4) + 1));
}

const dealt = (
    bank: (Dealable & { id: string })[],
    focusTopic: string | null,
    focusConcept: string | null
) => dealSession(bank, 10, Math.random, focusTopic, focusConcept).map((d) => d.id);

describe("the reserved beats go to the current concept", () => {
    it("puts current-concept questions in both reserved slots", () => {
        const bank = [
            ...filler(20),
            q("concept-a", "values", "7", 1),
            q("concept-b", "values", "7", 3)
        ];

        const order = dealt(bank, null, "7");

        for (const slot of SLOTS) {
            expect(["concept-a", "concept-b"], `beat ${slot + 1}`).toContain(order[slot]);
        }
    });

    it("never deals the same reserved question twice", () => {
        // The two pools overlap -- a concept question is also a topic question --
        // so reserving by index rather than by identity would put one question in
        // both beats and silently shorten the run's variety.
        const bank = [...filler(20), q("only-one", "values", "7", 1)];

        const order = dealt(bank, "values", "7");

        expect(order.filter((id) => id === "only-one")).toHaveLength(1);
        expect(new Set(order).size).toBe(order.length);
    });

    it("prefers the concept over its topic when both could fill a beat", () => {
        // `values` has plenty of questions; only one is tagged to the concept.
        // The tagged one is what can clear a rung, so it wins the first beat.
        const bank = [
            ...filler(20),
            ...Array.from({ length: 5 }, (_, i) => q(`topic-${i}`, "values", null, 1)),
            q("tagged", "values", "7", 4)
        ];

        const order = dealt(bank, "values", "7");

        expect(order[0]).toBe("tagged");
    });

    it("takes the easiest tagged question first, so first contact is winnable", () => {
        const bank = [
            ...filler(20),
            q("hard", "values", "7", 4),
            q("easy", "values", "7", 1)
        ];

        const order = dealt(bank, null, "7");

        expect(order[SLOTS[0]!]).toBe("easy");
    });
});

describe("how many beats a concept earns", () => {
    /*
     * WIDENING, AND ITS CEILING. Two beats of ten left a learner wondering why
     * the other eight were being asked. The count now comes from the content
     * that actually exists, so a well-covered concept is unmistakably the
     * subject of the round -- and stops short of a round where every beat is
     * the same thing, which is a worksheet with a clock on it.
     */
    it("reserves one beat for a concept with one tagged question", () => {
        const run = dealSession([...filler(20), q("only", "values", "7", 1)], 10, Math.random, null, "7");

        expect(run.filter((d) => d.concept_id === "7")).toHaveLength(1);
        expect(run[0]!.id).toBe("only");
    });

    it("reserves more beats as the concept has more content", () => {
        const four = Array.from({ length: 4 }, (_, i) => q(`c-${i}`, "values", "7", i + 1));
        const run = dealSession([...filler(20), ...four], 10, Math.random, null, "7");

        const reserved = run.filter((d) => d.concept_id === "7");

        expect(reserved.length).toBeGreaterThanOrEqual(3);
    });

    it("never gives one concept more than the ceiling", () => {
        // Ten tagged questions available; the round must still be a round.
        const many = Array.from({ length: 10 }, (_, i) => q(`c-${i}`, "values", "7", (i % 4) + 1));
        const run = dealSession([...filler(20), ...many], 10, Math.random, null, "7");

        expect(run.filter((d) => d.concept_id === "7").length).toBeLessThanOrEqual(
            MAX_FOCUS_BEATS + 1
        );
        expect(run.some((d) => d.concept_id !== "7"), "the round still varies").toBe(true);
    });

    it("spreads the reserved beats instead of bunching them", () => {
        // The reason for more than one was never volume -- it is that the
        // concept is introduced and then comes BACK. Four in a row would be the
        // same failure as one and never again.
        const four = Array.from({ length: 4 }, (_, i) => q(`c-${i}`, "values", "7", i + 1));
        const run = dealSession([...filler(20), ...four], 10, Math.random, null, "7");

        const at = run.map((d, i) => (d.concept_id === "7" ? i : -1)).filter((i) => i >= 0);

        for (let i = 1; i < at.length; i += 1) {
            expect(at[i]! - at[i - 1]!, "reserved beats are never adjacent").toBeGreaterThan(1);
        }
    });

    it("never reserves the final beat", () => {
        // The curve climbs to its top tier at the finish and concept questions
        // are spent easiest-first, so the last slot must stay with the curve.
        const four = Array.from({ length: 4 }, (_, i) => q(`c-${i}`, "values", "7", i + 1));

        for (let run = 0; run < 20; run += 1) {
            const dealt = dealSession([...filler(20), ...four], 10, Math.random, null, "7");

            expect(dealt[9]!.concept_id).not.toBe("7");
        }
    });

    it("leaves topic focus at the two beats it always had", () => {
        // Widening added beats for a CONCEPT. It must not take any away from
        // the older `?focus=<topic>` path.
        const onTopic = Array.from({ length: 6 }, (_, i) => q(`t-${i}`, "values", null, i % 4 + 1));
        const run = dealSession([...filler(20), ...onTopic], 10, Math.random, "values", null);

        expect(run[0]!.topic).toBe("values");
        expect(run[5]!.topic).toBe("values");
    });
});

describe("what the dealer refuses to invent", () => {
    it("reserves nothing when the concept has no tagged question", () => {
        // 52 of 281 declared rungs have no question content, so this is the
        // ordinary case for part of the curriculum, not an edge case. Aiming a
        // beat at an unrelated question in order to look targeted would tell the
        // learner this run was about their concept when it was not.
        const bank = filler(20, "loops");

        const order = dealSession(bank, 10, Math.random, null, "7");
        const plain = dealSession(bank, 10, Math.random, null, null);

        expect(order.map((d) => d.topic)).toEqual(plain.map((d) => d.topic));
        expect(order).toHaveLength(10);
    });

    it("falls back to the topic when the concept is untagged but the unit is not", () => {
        const bank = [...filler(20, "loops"), q("on-topic", "values", null, 1)];

        const order = dealt(bank, "values", "7");

        expect(order[SLOTS[0]!]).toBe("on-topic");
    });

    it("cannot deal a concept match that is not in the candidate list", () => {
        // THE FRONTIER GUARD, structurally. Curriculum eligibility, the role
        // gate, the practice frontier and the journey ceiling all run in SQL
        // before this array exists. A question the learner may not be dealt is
        // simply absent -- and the dealer has no way to reach past what it was
        // handed, however well the concept matches.
        const bank = filler(20, "loops");
        const outOfReach = q("locked", "async", "7", 1);

        const order = dealSession(bank, 10, Math.random, null, "7");

        expect(order.map((d) => d.id)).not.toContain(outOfReach.id);
        expect(bank).not.toContain(outOfReach);
    });

    it("ignores a concept id nothing in the bank carries", () => {
        const bank = [...filler(20), q("other-concept", "values", "99", 1)];

        const order = dealt(bank, null, "7");

        expect(order[SLOTS[0]!]).not.toBe("other-concept");
        expect(order).toHaveLength(10);
    });
});

describe("the game is still the game", () => {
    it("still deals a full run with the reserved beats in place", () => {
        const bank = [...filler(30), q("c1", "values", "7", 1), q("c2", "values", "7", 2)];

        expect(dealt(bank, null, "7")).toHaveLength(10);
    });

    it("guarantees the concept two beats without taking over the round", () => {
        // The round must not become a single-concept quiz. What concept focus
        // buys is a GUARANTEE of two beats, not a filter on the other eight --
        // those keep drawing from the ordinary eligible pool under the existing
        // curve, so other units still appear. A current-concept question CAN
        // land elsewhere too, by ordinary pacing rather than by reservation,
        // and that is the existing curriculum preference doing its job.
        const bank = [
            ...filler(30),
            ...Array.from({ length: 10 }, (_, i) => q(`c-${i}`, "values", "7", (i % 4) + 1))
        ];

        const order = dealSession(bank, 10, Math.random, null, "7");

        for (const slot of SLOTS) {
            expect(order[slot]!.concept_id, `beat ${slot + 1} is guaranteed`).toBe("7");
        }

        expect(
            order.some((d) => d.concept_id !== "7"),
            "the run still contains other work"
        ).toBe(true);
    });

    it("deals exactly as before when no concept is resolved", () => {
        // A learner who has demonstrated everything reachable, or whose current
        // step is a topic checkpoint, gets the run they have always got.
        const bank = filler(30);
        const before = dealSession(bank, 10, () => 0.5, null).map((d) => d.id);
        const after = dealSession(bank, 10, () => 0.5, null, null).map((d) => d.id);

        expect(after).toEqual(before);
    });

    it("keeps the difficulty curve climbing across the unreserved beats", () => {
        const bank = Array.from({ length: 60 }, (_, i) =>
            q(`f-${i}`, ["loops", "arrays", "objects"][i % 3]!, null, (i % 4) + 1)
        );

        const order = dealSession(bank, 10, () => 0.5, null, null);
        const tiers = order.map((d) => d.difficulty ?? 2);

        expect(tiers[tiers.length - 1]!).toBeGreaterThanOrEqual(tiers[0]!);
    });
});
