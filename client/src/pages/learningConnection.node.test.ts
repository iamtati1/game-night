import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The three places a learner asks a question the app used to leave unanswered.
 *
 *   on the map        "when does the next world open?"
 *   at the entrance   "why am I playing this now?"
 *   at the results    "what do I do next?"
 *
 * SOURCE ASSERTIONS, for the reason preGame.node.test.ts gives: what matters is
 * that each screen reads its answer from the shared derivation rather than
 * inventing one locally, and that is a property of the code. The derivation
 * itself is tested properly in games/progression.test.ts, against real state.
 */
// Resolved from the working directory rather than import.meta.url: Vite
// rewrites that during transform, so it does not point at the file on disk.
const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

const JOURNEY = src("pages/JourneyPage.tsx");
const GAME = src("pages/GamePage.tsx");
const RESULTS = src("pages/ResultsPage.tsx");
const COMPLETE = src("components/ConceptComplete.tsx");
const BRIDGE = src("components/LearningBridge.tsx");

describe("the map says what opens the next world", () => {
    it("asks the shared derivation rather than writing its own rule", () => {
        expect(JOURNEY).toMatch(/unlockRequirement\(topics, topic\.slug\)/);
    });

    it("still falls back to a word rather than rendering nothing", () => {
        expect(JOURNEY).toMatch(/unlockRequirement\([^)]*\)\s*\?\?\s*"unexplored"/);
    });

    it("marks a newly open world in text, not only in colour", () => {
        // A colour change says nothing to a screen reader and an animation is
        // gone before a first-time player looks up.
        expect(JOURNEY).toMatch(/isNewlyOpen\(topic\)/);
        expect(JOURNEY).toMatch(/Newly open/);
    });
});

describe("the entrance says why this game, now", () => {
    it("shows the bridge inside the game's own introduction, under its title", () => {
        // Readability pass: one intro with the concept under the title, rather
        // than a boxed bridge stacked above a second heading.
        expect(GAME).toMatch(/<GameIntro[\s\S]*?counts="course"[\s\S]*?focus=\{<LearningBridge concept=\{currentConcept\} \/>\}/);
    });

    it("takes the concept from the curriculum, not from the game", () => {
        expect(GAME).toMatch(/concept=\{currentConcept\}/);
        expect(GAME).toMatch(/api\.get<JourneyPathResponse>\("\/api\/curriculum\/path"\)/);
    });

    it("no longer labels a relaxed run as fast", () => {
        // The bridge used to print the catalog instinct, "Technical recall,
        // fast", above a run whose default is untimed.
        expect(GAME).not.toMatch(/instinct=/);
    });

    it("renders nothing when there is no current concept", () => {
        // A bridge with one end missing is worse than no bridge.
        expect(BRIDGE).toMatch(/if \(!concept\) return null;/);
    });
});

describe("the results say what to do next", () => {
    it("derives the step from the same rung counts it displays", () => {
        expect(RESULTS).toMatch(/nextStepAfterRound\(/);
        expect(RESULTS).toMatch(/rungs: curriculum\.rungs/);
    });

    it("offers a destination and the reason for it", () => {
        expect(RESULTS).toMatch(/\{next\.label\}/);
        expect(RESULTS).toMatch(/\{next\.because\}/);
    });

    it("keeps the honest branch that says a round cleared nothing", () => {
        // The pre-existing claim, which the next-step block must not replace.
        expect(RESULTS).toMatch(/Nothing cleared this run/);
    });
});

describe("the unlock is announced where it actually happens", () => {
    it("is detected on the arrival screen, not on a game's results", () => {
        // A Code Blitz round clears rungs; it cannot complete a topic. The
        // arrival after a demonstration or a checkpoint is the only place a
        // world opens, and it is the only place that may say so.
        expect(COMPLETE).toMatch(/worldJustUnlocked\(path\.topics, concept\)/);
        expect(RESULTS).not.toMatch(/worldJustUnlocked/);
        expect(RESULTS).not.toMatch(/[Ll]evel unlocked/);
    });

    it("reads the server's state after the write rather than guessing", () => {
        expect(COMPLETE).toMatch(/api\.get<JourneyPathResponse>\("\/api\/curriculum\/path"\)/);
    });

    it("announces it to assistive technology, not only to the eye", () => {
        expect(COMPLETE).toMatch(/role="status"/);
        expect(COMPLETE).toMatch(/Level unlocked/);
    });

    it("offers the new world by name as the next action", () => {
        expect(COMPLETE).toMatch(/Continue to \$\{unlocked\.name\}/);
    });

    it("says what is left when nothing opened, instead of going quiet", () => {
        expect(COMPLETE).toMatch(/!unlocked && remainingHere\.length > 0/);
        expect(COMPLETE).toMatch(/concepts done in/);
    });
});
