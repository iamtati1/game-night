import { describe, expect, it } from "vitest";
import { recapLabel, runTone, toneLine } from "./runTone.js";

describe("run tone", () => {
    it.each([
        [0, 10, "tough"],
        [4, 10, "tough"],
        [5, 10, "steady"],
        [7, 10, "steady"],
        [8, 10, "strong"],
        [10, 10, "strong"],
        [1, 3, "tough"],
        [2, 3, "steady"],
        [3, 3, "strong"]
    ] as const)("%i of %i is %s", (hit, total, tone) => {
        expect(runTone(hit, total)).toBe(tone);
    });

    it("says nothing about a run with no rounds", () => {
        expect(runTone(0, 0)).toBeNull();
        expect(toneLine(null, 0, 0, "right")).toBeNull();
    });

    it("words the lines plainly, with the real numbers, and adds nothing for a steady run", () => {
        expect(toneLine("tough", 3, 10, "right")).toBe(
            "A tough run: 3 of 10 right. Looking back at the lesson first usually helps."
        );
        expect(toneLine("strong", 9, 10, "right")).toBe("Strong run: 9 of 10 right.");
        expect(toneLine("steady", 6, 10, "right")).toBeNull();
        expect(recapLabel("Using Arithmetic Operators")).toBe("Look back at Using Arithmetic Operators");
    });
});
