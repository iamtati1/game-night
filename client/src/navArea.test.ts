import { describe, expect, it } from "vitest";
import { navAreaFor } from "./navArea.js";

/**
 * The nav marks the area a page belongs to (aria-current), so a learner deep
 * in a lesson or a game can still see where they are.
 */
describe("navAreaFor", () => {
    it.each([
        ["/", "home"],
        ["/journey", "home"],
        ["/concept/console-output", "home"],
        ["/learn/console-output", "home"],
        ["/world/values", "home"],
        ["/challenge/values", "home"],
        ["/play", "games"],
        ["/code-blitz", "games"],
        ["/flush/results/12", "games"],
        ["/bug-hunt", "games"],
        ["/reaction", "games"],
        ["/memory/results/3", "games"],
        ["/results/40", "games"],
        ["/skills", "skills"],
        ["/experiment", "experiment"],
        ["/profile", "profile"],
        ["/history", "profile"]
    ])("%s is in %s", (path, area) => {
        expect(navAreaFor(path)).toBe(area);
    });

    it("lights Home for the journey and its lessons: Home is Home/Learn", () => {
        // There is no Learn tab. The journey is reached from Home, so being in
        // the course is being under Home.
        expect(navAreaFor("/journey")).toBe("home");
        expect(navAreaFor("/concept/console-output")).toBe("home");
    });

    it("puts the Log under Profile, with the account", () => {
        expect(navAreaFor("/history")).toBe("profile");
    });

    it("marks nothing for pages outside the places", () => {
        expect(navAreaFor("/login")).toBeNull();
        // A prefix match on the word alone would put this under Games.
        expect(navAreaFor("/playground")).toBeNull();
    });
});
