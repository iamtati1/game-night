import { describe, expect, it } from "vitest";
import { MAX_PLAUSIBLE_MS, MIN_PLAUSIBLE_MS } from "../../../server/src/reaction/scoring.js";
import { DEADLINE_MS } from "./reactionTiming.js";

/**
 * The client decides when a round has gone unanswered; the server decides which
 * reaction times it will accept. If those two disagree there is a window where
 * the player can still press but the server will refuse the number -- which is
 * the bug this whole path exists to fix.
 *
 * Imported from the server module rather than copied, so a retune there fails
 * here instead of quietly reopening the window.
 */
describe("the client deadline matches the server's bound", () => {
    it("ends the round exactly where the server stops accepting reactions", () => {
        expect(DEADLINE_MS).toBe(MAX_PLAUSIBLE_MS);
    });

    it("leaves no window where a press is possible but unacceptable", () => {
        // A press at the deadline is still submittable; one after it is reported
        // as a timeout. There is no millisecond that is neither.
        expect(DEADLINE_MS).not.toBeGreaterThan(MAX_PLAUSIBLE_MS);
    });

    it("gives a real reaction room to land well inside it", () => {
        expect(DEADLINE_MS).toBeGreaterThan(MIN_PLAUSIBLE_MS * 10);
    });
});
