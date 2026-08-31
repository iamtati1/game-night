import { describe, expect, it } from "vitest";
import { wantsFreshSession } from "./schemas.js";

describe("wantsFreshSession", () => {
    // The default has to be "resume", because that is the branch that cannot
    // destroy a player's progress by accident. Anything unparseable falls back to
    // it rather than being treated as consent to discard a game.
    it("defaults to resuming", () => {
        expect(wantsFreshSession(undefined)).toBe(false);
        expect(wantsFreshSession(null)).toBe(false);
        expect(wantsFreshSession({})).toBe(false);
    });

    it("requires an explicit boolean true", () => {
        expect(wantsFreshSession({ fresh: true })).toBe(true);
        expect(wantsFreshSession({ fresh: false })).toBe(false);
    });

    it("does not accept a truthy string as consent to discard a game", () => {
        expect(wantsFreshSession({ fresh: "true" })).toBe(false);
        expect(wantsFreshSession({ fresh: 1 })).toBe(false);
    });

    it("ignores unrelated body fields", () => {
        expect(wantsFreshSession({ fresh: true, sessionId: "9" })).toBe(true);
        expect(wantsFreshSession("nonsense")).toBe(false);
    });
});
