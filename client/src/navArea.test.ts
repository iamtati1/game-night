import { describe, expect, it } from "vitest";
import { navAreaFor } from "./navArea.js";

/**
 * The nav marks the area a page belongs to (aria-current), so a learner deep
 * in a lesson or a game can still see where they are.
 */
describe("navAreaFor", () => {
    it.each([
        ["/", "home"],
        ["/journey", "learn"],
        ["/concept/console-output", "learn"],
        ["/world/values", "learn"],
        ["/challenge/values", "learn"],
        ["/play", "games"],
        ["/code-blitz", "games"],
        ["/flush/results/12", "games"],
        ["/bug-hunt", "games"],
        ["/reaction", "games"],
        ["/memory/results/3", "games"],
        ["/results/40", "games"],
        ["/skills", "skills"],
        ["/experiment", "experiment"],
        ["/history", "log"]
    ])("%s is in %s", (path, area) => {
        expect(navAreaFor(path)).toBe(area);
    });

    it("lights Home on Home alone, not inside a lesson", () => {
        expect(navAreaFor("/")).toBe("home");
        expect(navAreaFor("/concept/console-output")).not.toBe("home");
        expect(navAreaFor("/journey")).not.toBe("home");
    });

    it("marks nothing for pages outside the three areas", () => {
        expect(navAreaFor("/login")).toBeNull();
        // A prefix match on the word alone would put this under Games.
        expect(navAreaFor("/playground")).toBeNull();
    });
});
