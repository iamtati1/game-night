import { afterEach, describe, expect, it } from "vitest";
import type { JourneyConcept, JourneyPathResponse } from "../api/types.js";
import { hasSeenTutorial, markTutorialSeen, tutorialHref } from "./tutorial.js";

/** Who is sent through the playable tutorial first -- read from the path. */

const concept = (slug: string, cleared = 0): JourneyConcept => ({
    slug,
    name: slug,
    objective: "",
    state: "current",
    neededRetry: false,
    rungs: { cleared, playable: 3 }
});

function path(slug = "console-output", opts: { cleared?: number; concepts?: number } = {}): JourneyPathResponse {
    const c = concept(slug, opts.cleared ?? 0);
    return {
        topics: [{ slug: "values", name: "Values", principle: "", order: 1, state: "current", concepts: [c], challenge: null }],
        current: { ...c, topic: "values" },
        points: { total: 0, concepts: opts.concepts ?? 0, challenges: 0 }
    };
}

afterEach(() => window.localStorage.clear());

describe("the first-time tutorial", () => {
    it("is where a brand-new learner's first step goes", () => {
        expect(tutorialHref(path())).toBe("/learn/console-output");
    });

    it("is skipped once seen on this device", () => {
        markTutorialSeen("console-output");
        expect(hasSeenTutorial("console-output")).toBe(true);
        expect(tutorialHref(path())).toBeNull();
    });

    it("is skipped once any practice stop is cleared", () => {
        expect(tutorialHref(path("console-output", { cleared: 1 }))).toBeNull();
    });

    it("is skipped for a learner who has demonstrated anything", () => {
        expect(tutorialHref(path("console-output", { concepts: 1 }))).toBeNull();
    });

    it("exists only for concepts with a playable lesson", () => {
        expect(tutorialHref(path("arithmetic-operators"))).toBeNull();
    });
});
