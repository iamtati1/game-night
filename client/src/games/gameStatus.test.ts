import { describe, expect, it } from "vitest";
import { bugHuntStatus, flushStatus, gameStatuses, type BugHuntReadiness } from "./gameStatus.js";

const hunt = (over: Partial<BugHuntReadiness>): BugHuntReadiness => ({
    ready: false,
    eligible: 0,
    needed: 3,
    full: 6,
    reason: "not-met",
    reachable: 0,
    practice: null,
    message: "…",
    ...over
});

describe("card statuses, worded from the server's readiness", () => {
    it("Flush: a full game, a short game, and what opens it", () => {
        expect(flushStatus({ ready: true, eligible: 5, needed: 3, full: 5, message: null }).text).toBe("Ready to play.");
        expect(flushStatus({ ready: true, eligible: 3, needed: 3, full: 5, message: null }).text).toBe(
            "Ready: a short game of 3 puzzles."
        );

        const shut = flushStatus({ ready: false, eligible: 0, needed: 3, full: 5, message: "…" });
        expect(shut).toEqual({
            kind: "needs",
            text: "Opens at 3 puzzles on ideas you’ve learned (0 so far). Lessons on your Journey open more.",
            counts: true
        });
    });

    it("Bug Hunt: names the lesson where a bug can be fixed now, when the server gives one", () => {
        expect(bugHuntStatus(hunt({ practice: { slug: "console-output", name: "Running Code" } })).text).toBe(
            "Opens at 3 bugs on ideas you’ve learned (0 so far). You can fix a bug now in Running Code."
        );
        expect(bugHuntStatus(hunt({ reason: "too-few", eligible: 2, reachable: 2 })).text).toMatch(
            /\(2 so far\)\. Lessons on your Journey open more\.$/
        );
    });

    it("Bug Hunt: says the bugs need practice, not that the ideas are unmet, when the frontier holds them", () => {
        const s = bugHuntStatus(hunt({ reason: "difficulty", eligible: 0, reachable: 3 }));
        expect(s.text).toBe("Opens at 3 bugs (0 so far). 3 bugs need more practice on their ideas first, in Code Blitz.");
        expect(s.kind).toBe("needs");
    });

    it("Bug Hunt: ready, full or short", () => {
        expect(bugHuntStatus(hunt({ ready: true, eligible: 6, reason: null })).text).toBe("Ready to play.");
        expect(bugHuntStatus(hunt({ ready: true, eligible: 4, reason: null })).text).toBe("Ready: a short run of 4 bugs.");
    });

    it("Reaction and Memory are ready and just for fun; Code Blitz is ready and counts", () => {
        const all = gameStatuses({ flush: null, bugHunt: null });

        expect(all["reaction"]).toEqual({ kind: "ready", text: "Ready to play.", counts: false });
        expect(all["memory"]).toEqual({ kind: "ready", text: "Ready to play.", counts: false });
        expect(all["code-blitz"]).toEqual({ kind: "ready", text: "Ready to play.", counts: true });
        // Not loaded: no claim either way.
        expect(all["flush"]).toBeNull();
        expect(all["bug-hunt"]).toBeNull();
    });
});
