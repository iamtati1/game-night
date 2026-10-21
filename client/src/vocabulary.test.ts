import { describe, expect, it } from "vitest";
import { ACTION, STATE, continueTo, startGame } from "./vocabulary.js";
import { pageTitle } from "./usePageTitle.js";

/**
 * One set of words for where a learner is and what to do next. Pinned so a
 * screen cannot quietly drift back to its own phrasing.
 */
describe("shared vocabulary", () => {
    it("names states once", () => {
        expect(STATE).toMatchObject({
            complete: "Complete",
            here: "You’re here",
            inProgress: "In progress",
            currentTopic: "Current topic",
            upNext: "Up next",
            locked: "Locked",
            readyToPlay: "Ready to play"
        });
    });

    it("keeps the step and its topic on different words, so one screen never says 'You're here' twice", () => {
        expect(STATE.here).not.toBe(STATE.inProgress);
        expect(STATE.here).not.toBe(STATE.currentTopic);
    });

    it("names actions once", () => {
        expect(ACTION.continueLearning).toBe("Continue learning");
        expect(ACTION.takeCheckpoint).toBe("Take the checkpoint");
        expect(ACTION.seeJourney).toBe("See your journey");
        expect(continueTo("Reading Variables")).toBe("Continue: Reading Variables");
        // One start label for five games, where there were five.
        expect(startGame("Bug Hunt")).toBe("Start Bug Hunt");
    });

    it("titles a page after itself", () => {
        expect(pageTitle("Games")).toBe("Games · Jolt");
    });
});
