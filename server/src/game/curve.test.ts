import { describe, expect, it } from "vitest";
import { UNTIERED_AS, dealSession, difficultyCurve, topTierFor, type Dealable } from "./curve.js";

/**
 * The candidate order the query produces: unseen first, RANDOM() within that.
 *
 * The dealer is deliberately deterministic for a given order -- that is what
 * preserves the recency preference -- so any test about variety has to supply
 * the randomness the database would.
 */
function asQueryWouldOrder<T>(items: readonly T[]): T[] {
    const copy = [...items];

    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }

    return copy;
}

/** A deterministic stand-in for Math.random, cycling through fixed draws. */
function fakeRandom(values: number[]): () => number {
    let i = 0;

    return () => values[i++ % values.length]!;
}

/** The nine curriculum units, so a generated bank has real topics to spread. */
const TOPICS = [
    "variables",
    "conditionals",
    "loops",
    "arrays",
    "objects",
    "functions",
    "array-methods",
    "scope",
    "async"
];

const bank = (spec: Record<number, number>): Dealable[] =>
    Object.entries(spec).flatMap(([tier, count]) =>
        Array.from({ length: count }, (_, i) => ({
            id: `t${tier}-${i}`,
            difficulty: Number(tier),
            topic: TOPICS[i % TOPICS.length]!
        }))
    );

/**
 * The real shape of the active bank, counted from the seeds: 210 questions,
 * 76/76/40/18 across the four tiers -- weighted toward fundamentals, with the
 * hardest tier the smallest.
 *
 * Modelled exactly rather than approximately, because the tier the curve leans
 * on hardest -- tier 4, wanted for the last slot of every run -- is the one
 * whose depth decides how soon the hardest questions start repeating.
 */
const REAL_BANK = bank({ 1: 76, 2: 76, 3: 40, 4: 18 });

describe("the curve climbs", () => {
    it("opens on tier 1 however the dice fall", () => {
        for (let seed = 0; seed < 500; seed += 1) {
            const curve = difficultyCurve(10, fakeRandom([seed / 500]));

            expect(curve[0], `seed ${seed}`).toBe(1);
        }
    });

    it("ends on the top tier however the dice fall", () => {
        for (let seed = 0; seed < 500; seed += 1) {
            const curve = difficultyCurve(10, fakeRandom([seed / 500]));

            expect(curve[curve.length - 1], `seed ${seed}`).toBe(4);
        }
    });

    it("raises the average difficulty from the first half to the second", () => {
        const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

        for (let run = 0; run < 200; run += 1) {
            const curve = difficultyCurve(10);
            const first = mean(curve.slice(0, 5));
            const second = mean(curve.slice(5));

            expect(second, `run ${run}: ${curve.join(",")}`).toBeGreaterThan(first);
        }
    });

    it("never steps more than one tier between neighbours", () => {
        // A wrong answer must not be followed by a cliff, and the curve is the
        // only thing deciding difficulty -- so this is the whole guarantee.
        for (let run = 0; run < 300; run += 1) {
            const curve = difficultyCurve(10);

            for (let i = 1; i < curve.length; i += 1) {
                expect(
                    Math.abs(curve[i]! - curve[i - 1]!),
                    `run ${run}: ${curve.join(",")}`
                ).toBeLessThanOrEqual(1);
            }
        }
    });

    it("stays inside 1 to 4 whatever the jitter does", () => {
        for (let run = 0; run < 300; run += 1) {
            for (const tier of difficultyCurve(10)) {
                expect(tier).toBeGreaterThanOrEqual(1);
                expect(tier).toBeLessThanOrEqual(4);
            }
        }
    });
});

describe("the curve is not a script", () => {
    it("does not always give the same tier to a middle slot", () => {
        const slotFive = new Set(
            Array.from({ length: 300 }, () => difficultyCurve(10)[4])
        );

        expect(slotFive.size, "question five is always the same tier").toBeGreaterThan(1);
    });

    it("produces more than a handful of distinct runs", () => {
        const shapes = new Set(
            Array.from({ length: 300 }, () => difficultyCurve(10).join(""))
        );

        expect(shapes.size).toBeGreaterThan(10);
    });
});

describe("short sessions compress rather than cliff", () => {
    it("reaches tier 4 only when there is room to build to it", () => {
        expect(topTierFor(10)).toBe(4);
        expect(topTierFor(6)).toBe(4);
        expect(topTierFor(5)).toBe(3);
        expect(topTierFor(3)).toBe(3);
        expect(topTierFor(2)).toBe(2);
    });

    it("keeps a two-question run inside the tiers it can build through", () => {
        for (let run = 0; run < 200; run += 1) {
            for (const tier of difficultyCurve(2)) {
                expect(tier).toBeLessThanOrEqual(2);
            }
        }
    });

    it("still climbs across a longer session", () => {
        const curve = difficultyCurve(20, fakeRandom([0.5]));

        expect(curve[0]).toBe(1);
        expect(curve[19]).toBe(4);
    });

    it("handles a one-question session without dividing by zero", () => {
        expect(difficultyCurve(1)).toEqual([1]);
    });

    it("handles an empty session", () => {
        expect(difficultyCurve(0)).toEqual([]);
    });
});

describe("dealing follows the curve", () => {
    it("deals the number of questions asked for", () => {
        expect(dealSession(REAL_BANK, 10)).toHaveLength(10);
    });

    it("never deals the same question twice in a session", () => {
        for (let run = 0; run < 200; run += 1) {
            const dealt = dealSession(REAL_BANK, 10);

            expect(new Set(dealt.map((q) => q.id)).size, `run ${run}`).toBe(dealt.length);
        }
    });

    it("gets harder on average as the session goes on", () => {
        const mean = (xs: Dealable[]) =>
            xs.reduce((a, q) => a + (q.difficulty ?? UNTIERED_AS), 0) / xs.length;
        let climbed = 0;

        for (let run = 0; run < 200; run += 1) {
            const dealt = dealSession(REAL_BANK, 10);

            if (mean(dealt.slice(5)) > mean(dealt.slice(0, 5))) climbed += 1;
        }

        expect(climbed).toBe(200);
    });

    it("opens easy and closes hard", () => {
        for (let run = 0; run < 200; run += 1) {
            const dealt = dealSession(REAL_BANK, 10);

            expect(dealt[0]!.difficulty, `run ${run}`).toBe(1);
            expect(dealt[9]!.difficulty, `run ${run}`).toBe(4);
        }
    });

    it("varies which questions it picks between runs", () => {
        // The dealer is deliberately deterministic for a given candidate order --
        // that is what preserves the query's unseen-first preference, and the
        // test below pins it. Variety comes from upstream: the query orders by
        // RANDOM() within the seen/unseen split. So this shuffles the bank the
        // way the database does, then asks whether runs actually differ.
        const runs = new Set(
            Array.from({ length: 100 }, () =>
                dealSession(asQueryWouldOrder(REAL_BANK), 10)
                    .map((q) => q.id)
                    .join(",")
            )
        );

        expect(runs.size, "every run deals the same ten questions").toBe(100);
    });

    it("respects the candidate order it was given, which is unseen-first", () => {
        // The query hands over unseen questions before recently-seen ones. The
        // dealer must take the first acceptable match rather than re-shuffling,
        // or recency avoidance is silently discarded.
        const seen = { id: "seen", difficulty: 1, topic: "loops" };
        const unseen = { id: "unseen", difficulty: 1, topic: "loops" };

        expect(dealSession([unseen, seen], 1)[0]!.id).toBe("unseen");
    });
});

describe("dealing survives a thin bank", () => {
    it("falls back to the nearest tier rather than dealing short", () => {
        // No tier 3 or 4 at all.
        const thin = bank({ 1: 5, 2: 5 });
        const dealt = dealSession(thin, 10);

        expect(dealt).toHaveLength(10);
        expect(new Set(dealt.map((q) => q.id)).size).toBe(10);
    });

    it("deals what it can when the bank is smaller than the session", () => {
        expect(dealSession(bank({ 1: 3 }), 10)).toHaveLength(3);
    });

    it("treats an untiered question as practical rather than dropping it", () => {
        const untiered: Dealable[] = [{ id: "u", difficulty: null, topic: "loops" }];

        expect(dealSession(untiered, 1)).toHaveLength(1);
        expect(UNTIERED_AS).toBe(2);
    });
});

describe("dealing spreads across curriculum units", () => {
    it("prefers a different topic to the one just asked", () => {
        const loops = (id: string) => ({ id, difficulty: 2, topic: "loops" });
        const arrays = { id: "arrays", difficulty: 2, topic: "arrays" };

        // Two loop questions first, so a dealer that ignored topic would take
        // both in a row.
        const dealt = dealSession([loops("a"), loops("b"), arrays], 2);

        expect(dealt[1]!.topic).toBe("arrays");
    });

    it("still deals a full session when the tier holds only one topic", () => {
        // A preference, not a filter. Abandoning the difficulty curve to avoid a
        // repeated topic would be the wrong trade.
        const identical = Array.from({ length: 6 }, (_, i) => ({
            id: `q${i}`,
            difficulty: 2,
            topic: "loops"
        }));

        expect(dealSession(identical, 5)).toHaveLength(5);
    });

    it("touches several units in a normal run", () => {
        for (let run = 0; run < 100; run += 1) {
            const topics = new Set(
                dealSession(asQueryWouldOrder(REAL_BANK), 10).map((q) => q.topic)
            );

            expect(topics.size, `run ${run} covered only ${topics.size} unit(s)`)
                .toBeGreaterThanOrEqual(4);
        }
    });

    it("does not deal a fixed rota of units", () => {
        // Structured randomness, not a curriculum quiz: the player must not be
        // able to learn that question three is always about loops.
        const thirdTopic = new Set(
            Array.from({ length: 200 }, () => dealSession(asQueryWouldOrder(REAL_BANK), 10)[2]!.topic)
        );

        expect(thirdTopic.size).toBeGreaterThan(1);
    });

    it("copes with a question that has no topic yet", () => {
        const mixed: Dealable[] = [
            { id: "a", difficulty: 1, topic: null },
            { id: "b", difficulty: 1, topic: "loops" }
        ];

        expect(dealSession(mixed, 2)).toHaveLength(2);
    });
});
