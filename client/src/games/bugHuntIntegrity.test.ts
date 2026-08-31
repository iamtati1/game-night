import { describe, expect, it } from "vitest";
import {
    INTEGRITY_EXTRA_ATTEMPT_COST,
    INTEGRITY_FAILED_COST,
    INTEGRITY_HINT_COST
} from "../../../server/src/bugHunt/scoring.js";
import { INTEGRITY_COSTS } from "./bugHuntIntegrity.js";

/**
 * The client tells the player what their decisions cost. The server decides what
 * they actually cost. This is the only thing keeping those two honest.
 *
 * Imported straight from the server module rather than copied, so a retune there
 * fails here rather than turning the legend into a lie the player has no way to
 * detect.
 */
describe("the integrity legend matches the server", () => {
    const shown = Object.fromEntries(INTEGRITY_COSTS.map((c) => [c.label, c.cost]));

    it("quotes the real cost of losing an incident", () => {
        expect(shown["Incident lost"]).toBe(INTEGRITY_FAILED_COST);
    });

    it("quotes the real cost of a second attempt", () => {
        expect(shown["Extra attempt"]).toBe(INTEGRITY_EXTRA_ATTEMPT_COST);
    });

    it("quotes the real cost of a trace", () => {
        expect(shown["Trace pulled"]).toBe(INTEGRITY_HINT_COST);
    });

    it("accounts for every cost the server applies", () => {
        // A fourth cost added server-side and not surfaced here would drain the
        // meter for a reason the player is never shown.
        expect(INTEGRITY_COSTS).toHaveLength(3);
    });
});
