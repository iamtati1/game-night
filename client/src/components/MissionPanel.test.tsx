import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { JourneyConcept, JourneyPathResponse, JourneyTopic } from "../api/types.js";
import { MissionPanel } from "./MissionPanel.js";

/**
 * The mission panel says four things, in order -- name, goal, one action,
 * progress -- and every one of them comes from the server's path. It replaced
 * PlayFocus on Games and the stacked brief on Home; the guarantees those had
 * (one primary action, Start before Continue, the checkpoint as the action when
 * due, honesty about concepts with nothing to play) are kept here.
 */

const concept = (
    slug: string,
    state: JourneyConcept["state"],
    rungs = { cleared: 0, playable: 3 }
): JourneyConcept => ({
    slug,
    name: slug === "console-output" ? "Running Code and Reading Output" : "Using Arithmetic Operators",
    objective: slug === "console-output" ? "run a snippet and say what it prints" : "combine numbers with + - * /",
    state,
    neededRetry: false,
    rungs
});

const topic = (concepts: JourneyConcept[], challenge: JourneyTopic["challenge"] = { state: "locked" }): JourneyTopic => ({
    slug: "values",
    name: "Values and Types",
    principle: "",
    order: 1,
    state: "current",
    concepts,
    challenge
});

function path(opts: { done?: boolean; rungs?: { cleared: number; playable: number } } = {}): JourneyPathResponse {
    const first = concept("console-output", opts.done ? "demonstrated" : "current", opts.rungs);
    const second = concept("arithmetic-operators", opts.done ? "current" : "locked", opts.rungs);
    const current = opts.done ? second : first;

    return {
        topics: [topic([first, second])],
        current: { ...current, topic: "values" },
        points: { total: opts.done ? 25 : 0, concepts: opts.done ? 1 : 0, challenges: 0 }
    };
}

function renderPanel(p: JourneyPathResponse, headingLevel: 1 | 2 = 2) {
    return render(
        <MemoryRouter>
            <MissionPanel path={p} headingLevel={headingLevel} />
        </MemoryRouter>
    );
}

afterEach(cleanup);

describe("the mission panel", () => {
    it("names the mission, its goal, and one action into the concept", () => {
        const { container } = renderPanel(path());

        expect(screen.getByRole("heading", { level: 2, name: "Running Code and Reading Output" })).toBeTruthy();
        expect(screen.getByText("Goal: Run a snippet and say what it prints.")).toBeTruthy();
        const action = screen.getByRole("link", { name: "Start learning" });
        // Brand-new: the playable tutorial first; it hands back to this concept.
        expect(action.getAttribute("href")).toBe("/learn/console-output");
        // One primary action, and nothing else to click.
        expect(container.querySelectorAll("a, button")).toHaveLength(1);
    });

    it("says Start before anything is done and Continue after", () => {
        renderPanel(path());
        expect(screen.getByText(/Your first mission/)).toBeTruthy();
        cleanup();

        renderPanel(path({ done: true }));
        expect(screen.getByRole("link", { name: "Continue learning" }).getAttribute("href")).toBe(
            "/concept/arithmetic-operators"
        );
        expect(screen.queryByText(/first mission/)).toBeNull();
    });

    it("shows how far through the concept and the topic the learner is, from the server's counts", () => {
        const { container } = renderPanel(path({ done: true, rungs: { cleared: 1, playable: 3 } }));

        expect(screen.getByText("1 of 3 stops done")).toBeTruthy();
        expect(screen.getByText("1 of 2 concepts done, then the checkpoint")).toBeTruthy();
        expect(container.querySelectorAll(".mission-panel-pip")).toHaveLength(3);
        expect(container.querySelectorAll(".mission-panel-pip.is-done")).toHaveLength(1);
        // The pips are decoration for the sentence, not the only signal.
        expect(container.querySelector(".mission-panel-pips")?.getAttribute("aria-hidden")).toBe("true");
    });

    it("says when every stop is done, without claiming the concept is demonstrated", () => {
        renderPanel(path({ done: true, rungs: { cleared: 3, playable: 3 } }));

        expect(screen.getByText("Every stop done: show what you know")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Continue learning" })).toBeTruthy();
    });

    it("never counts more stops done than there are", () => {
        renderPanel(path({ done: true, rungs: { cleared: 5, playable: 2 } }));
        expect(screen.getByText("Every stop done: show what you know")).toBeTruthy();
    });

    it("is honest about a concept with nothing to practise yet", () => {
        const { container } = renderPanel(path({ rungs: { cleared: 0, playable: 0 } }));

        expect(screen.getByText(/nothing to practise here yet/)).toBeTruthy();
        expect(container.querySelector(".mission-panel-pip")).toBeNull();
        // The lesson itself is still the way in.
        // Still a way in: for a brand-new learner, through the tutorial.
        expect(screen.getByRole("link", { name: "Start learning" }).getAttribute("href")).toBe("/learn/console-output");
    });

    it("makes a due checkpoint the mission and its one action", () => {
        const done = concept("console-output", "demonstrated");
        const p: JourneyPathResponse = {
            topics: [topic([done], { state: "current" })],
            current: null,
            points: { total: 25, concepts: 1, challenges: 0 }
        };
        const { container } = renderPanel(p);

        expect(screen.getByRole("heading", { name: "Values and Types checkpoint" })).toBeTruthy();
        expect(screen.getByRole("link", { name: "Take the checkpoint" }).getAttribute("href")).toBe("/challenge/values");
        expect(container.querySelectorAll("a, button")).toHaveLength(1);
    });

    it("draws nothing once everything reachable is done", () => {
        const p: JourneyPathResponse = {
            topics: [{ ...topic([concept("console-output", "demonstrated")], null), state: "complete" }],
            current: null,
            points: { total: 25, concepts: 1, challenges: 0 }
        };
        const { container } = renderPanel(p);
        expect(container.innerHTML).toBe("");
    });

    it("can be a page's main heading", () => {
        renderPanel(path(), 1);
        expect(screen.getByRole("heading", { level: 1, name: "Running Code and Reading Output" })).toBeTruthy();
    });
});

describe("the mission panel after the tutorial", () => {
    afterEach(() => window.localStorage.clear());

    it("goes straight to the practice once the tutorial has been seen", () => {
        window.localStorage.setItem("jolt.tutorial.console-output", "seen");
        renderPanel(path());
        expect(screen.getByRole("link", { name: "Start learning" }).getAttribute("href")).toBe("/concept/console-output");
    });
});
