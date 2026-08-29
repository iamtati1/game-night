import { describe, expect, it } from "vitest";
import { seededShuffle } from "./optionOrder.js";

const OPTIONS = ["a", "b", "c", "d"];

describe("seededShuffle keeps the set intact", () => {
    it("returns a permutation, never a subset", () => {
        for (let seed = 0; seed < 200; seed += 1) {
            expect([...seededShuffle(OPTIONS, String(seed))].sort()).toEqual([...OPTIONS].sort());
        }
    });

    it("does not mutate its input", () => {
        const original = [...OPTIONS];

        seededShuffle(OPTIONS, "42");

        expect(OPTIONS).toEqual(original);
    });

    it("handles the degenerate sizes without throwing", () => {
        expect(seededShuffle([], "x")).toEqual([]);
        expect(seededShuffle(["only"], "x")).toEqual(["only"]);
    });
});

describe("seededShuffle is stable for a round", () => {
    it("gives the same order every time the same round is served", () => {
        // A question is re-served on refresh and on resume. With Math.random()
        // the options moved underneath a player who had already half-decided.
        const first = seededShuffle(OPTIONS, "round-991");

        for (let i = 0; i < 50; i += 1) {
            expect(seededShuffle(OPTIONS, "round-991")).toEqual(first);
        }
    });

    it("gives different rounds different orders", () => {
        const orders = new Set(
            Array.from({ length: 40 }, (_, i) => seededShuffle(OPTIONS, `round-${i}`).join(""))
        );

        // Four options have 24 permutations, so 40 rounds cannot all differ --
        // but they must not collapse onto one or two either.
        expect(orders.size).toBeGreaterThan(8);
    });
});

/**
 * The regression this whole module exists for.
 *
 * Bug Hunt's patch options were served in insertion order, and all thirteen
 * choose_patch incidents were authored with the correct patch written first.
 * These assert that authoring order no longer predicts serve order.
 */
describe("seededShuffle removes positional bias", () => {
    const ROUNDS = 4000;
    const positionsOf = (item: string) =>
        Array.from({ length: ROUNDS }, (_, i) => seededShuffle(OPTIONS, `round-${i}`).indexOf(item));

    it("does not leave the authored-first option in first place", () => {
        const first = positionsOf("a").filter((p) => p === 0).length;

        // Was 100%. Uniform is 25%.
        expect(first / ROUNDS).toBeLessThan(0.3);
        expect(first / ROUNDS).toBeGreaterThan(0.2);
    });

    it("spreads every option across every position roughly evenly", () => {
        for (const item of OPTIONS) {
            const counts = [0, 0, 0, 0];

            for (const position of positionsOf(item)) counts[position]! += 1;

            for (const [position, count] of counts.entries()) {
                const share = count / ROUNDS;

                expect(
                    share,
                    `"${item}" lands in position ${position} ${(share * 100).toFixed(1)}% of the time`
                ).toBeGreaterThan(0.2);
                expect(share).toBeLessThan(0.3);
            }
        }
    });

    it("produces every permutation, not a rotation of one", () => {
        // A shuffle that only ever rotates would pass the position test above
        // while still being trivially predictable once you saw two rounds.
        const seen = new Set(
            Array.from({ length: ROUNDS }, (_, i) => seededShuffle(OPTIONS, `r${i}`).join(""))
        );

        expect(seen.size).toBe(24);
    });

    it("stays unbiased for a three-option incident", () => {
        // Bug Hunt's tier-one incidents offer three, not four.
        const three = ["x", "y", "z"];
        const firsts = Array.from(
            { length: ROUNDS },
            (_, i) => seededShuffle(three, `round-${i}`)[0]!
        );

        for (const item of three) {
            const share = firsts.filter((f) => f === item).length / ROUNDS;

            expect(share, `"${item}" leads ${(share * 100).toFixed(1)}% of rounds`).toBeGreaterThan(
                0.28
            );
            expect(share).toBeLessThan(0.39);
        }
    });
});
