import { describe, expect, it } from "vitest";
import type { JourneyConcept, JourneyTopic } from "../api/types.js";
import { sectionProgress } from "./progression.js";

/**
 * A section's progress, as the journey map states it.
 *
 * Counted from demonstrations only. A concept the learner has opened, or
 * cleared a rung of in a game, is progress on its own ladder -- not on the
 * section -- and these pin that the number cannot be moved by anything less.
 */
const concept = (
    slug: string,
    state: JourneyConcept["state"],
    rungs: JourneyConcept["rungs"] = { cleared: 0, playable: 3 }
): JourneyConcept => ({ slug, name: slug, objective: "", state, neededRetry: false, rungs });

const topic = (concepts: JourneyConcept[], challenge: JourneyTopic["challenge"] = null): JourneyTopic => ({
    slug: "values",
    name: "Values and Types",
    principle: "",
    order: 1,
    state: "current",
    concepts,
    challenge
});

describe("sectionProgress", () => {
    it("starts at nothing done, and says the checkpoint is part of the section", () => {
        const p = sectionProgress(
            topic([concept("a", "current"), concept("b", "locked"), concept("c", "locked")], { state: "locked" })
        );
        expect(p).toEqual({ stepsDone: 0, steps: 4, label: "0 of 3 concepts done, then the checkpoint" });
    });

    it("counts a concept only once it is demonstrated", () => {
        const p = sectionProgress(
            topic([
                concept("a", "demonstrated"),
                // Every rung cleared in games, but not demonstrated: not done.
                concept("b", "current", { cleared: 3, playable: 3 }),
                concept("c", "locked")
            ])
        );
        expect(p.stepsDone).toBe(1);
        expect(p.label).toBe("1 of 3 concepts done");
    });

    it("names the checkpoint as the next step once every concept is done", () => {
        const p = sectionProgress(
            topic([concept("a", "demonstrated"), concept("b", "demonstrated")], { state: "current" })
        );
        expect(p).toEqual({ stepsDone: 2, steps: 3, label: "All 2 concepts done. The checkpoint is next" });
    });

    it("is finished only when the checkpoint is too", () => {
        const p = sectionProgress(
            topic([concept("a", "demonstrated"), concept("b", "demonstrated")], { state: "demonstrated" })
        );
        expect(p).toEqual({ stepsDone: 3, steps: 3, label: "Every step here is done" });
    });

    it("does not invent a checkpoint for a section without one", () => {
        const p = sectionProgress(topic([concept("a", "demonstrated"), concept("b", "demonstrated")]));
        expect(p).toEqual({ stepsDone: 2, steps: 2, label: "Every step here is done" });
    });
});
