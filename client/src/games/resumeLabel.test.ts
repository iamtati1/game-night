import { describe, expect, it } from "vitest";
import { resumePosition } from "./resumeLabel.js";

describe("where a paused run stands", () => {
    it("names the next round of the run", () => {
        expect(resumePosition("round", 1, 3)).toBe("round 2 of 3");
        expect(resumePosition("Hunt", 0, 6)).toBe("Hunt 1 of 6");
    });

    it("never counts past the last round", () => {
        expect(resumePosition("round", 5, 5)).toBe("round 5 of 5");
    });

    it("says nothing for a run with no rounds yet, rather than \"0 of 0\"", () => {
        expect(resumePosition("round", 0, 0)).toBeNull();
    });
});
