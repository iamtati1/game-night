import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { JourneyConcept, JourneyPathResponse, JourneyTopic } from "../api/types.js";
import { LearningProgress, type NextStep } from "./LearningProgress.js";

/**
 * The course as a path. Every assertion is about what a learner is TOLD --
 * the state of each topic and step in words, the counts, what opens what --
 * and every one is derived from the journey path, never from games played.
 */
afterEach(cleanup);

const concept = (
    slug: string,
    state: JourneyConcept["state"],
    rungs: JourneyConcept["rungs"] = { cleared: 0, playable: 3 }
): JourneyConcept => ({ slug, name: slug.replace(/-/g, " "), objective: `do ${slug}`, state, neededRetry: false, rungs });

const topic = (
    slug: string,
    state: JourneyTopic["state"],
    concepts: JourneyConcept[],
    challenge: JourneyTopic["challenge"] = { state: "locked" }
): JourneyTopic => ({ slug, name: slug.replace(/-/g, " "), principle: "", order: 1, state, concepts, challenge });

function path(topics: JourneyTopic[]): JourneyPathResponse {
    const current = topics.flatMap((t) => t.concepts.map((c) => ({ ...c, topic: t.slug }))).find((c) => c.state === "current") ?? null;
    return { topics, current, points: { total: 0, concepts: 0, challenges: 0 } } as JourneyPathResponse;
}

const VALUES = topic("values", "current", [
    concept("console-output", "demonstrated"),
    // Every rung cleared in games, but not demonstrated: still the current step.
    concept("arithmetic", "current", { cleared: 2, playable: 4 }),
    concept("expressions", "locked")
]);
const PARTIAL = path([
    VALUES,
    topic("variables", "locked", [concept("declaration", "locked")]),
    topic("operators", "locked", [concept("equality", "locked")])
]);
const NEXT: NextStep = { name: "arithmetic", href: "/concept/arithmetic", label: "Continue" };

function show(p: JourneyPathResponse, next: NextStep | null = NEXT) {
    return render(
        <MemoryRouter>
            <LearningProgress path={p} next={next} />
        </MemoryRouter>
    );
}

const topicRow = (name: string) => screen.getByRole("heading", { name }).closest("li")!;

describe("the learning progress path", () => {
    it("says each topic's state in words, with the real counts and what opens what", () => {
        show(PARTIAL);

        expect(within(topicRow("values")).getByText("In progress")).toBeTruthy();
        expect(within(topicRow("values")).getByText("1 of 3 concepts done, then the checkpoint")).toBeTruthy();

        expect(within(topicRow("variables")).getByText("Up next")).toBeTruthy();
        expect(within(topicRow("variables")).getByText("Opens when you finish 2 concepts and the checkpoint in values")).toBeTruthy();

        expect(within(topicRow("operators")).getByText("Locked")).toBeTruthy();
        expect(within(topicRow("operators")).getByText("Opens after variables")).toBeTruthy();
    });

    it("expands only the current topic, with its steps' states in words", () => {
        show(PARTIAL);

        const steps = within(topicRow("values")).getAllByRole("listitem");
        const text = steps.map((s) => s.textContent);
        expect(text[0]).toMatch(/Complete.*console output.*You can do console-output/);
        expect(text[1]).toMatch(/You’re here.*arithmetic/);
        // A locked step names the step it waits on, not "the step above".
        expect(text[2]).toMatch(/Locked.*expressions.*Opens when you finish arithmetic/);
        // The checkpoint is a step, and says why it is shut.
        expect(text[3]).toMatch(/values checkpoint.*2 concepts still to finish/);

        expect(within(topicRow("variables")).queryAllByRole("listitem")).toHaveLength(0);
    });

    it("names the step each locked step waits on, one step at a time", () => {
        const longer = path([
            topic("values", "current", [
                concept("console-output", "demonstrated"),
                concept("arithmetic", "current"),
                concept("expressions", "locked"),
                concept("primitive-types", "locked")
            ], { state: "locked" }),
            topic("variables", "locked", [concept("declaration", "locked")])
        ]);
        show(longer);

        const text = within(topicRow("values")).getAllByRole("listitem").map((s) => s.textContent);
        expect(text[2]).toMatch(/expressions.*Opens when you finish arithmetic/);
        expect(text[3]).toMatch(/primitive types.*Opens after expressions/);
    });

    it("says a step in an unopened topic waits on the topic, not on the step before it", async () => {
        const { stepsFor } = await import("./ConceptSteps.js");
        const shut = topic("variables", "locked", [concept("declaration", "locked"), concept("assignment", "locked")], null);

        expect(stepsFor(shut).map((s) => s.reason)).toEqual(["Opens when this topic opens", "Opens when this topic opens"]);
    });

    it("makes the current step unmistakable: one row says so, and the panel uses the same words", () => {
        show(PARTIAL);

        const current = [...document.querySelectorAll(".step.is-current")];
        expect(current).toHaveLength(1);
        expect(current[0]!.textContent).toMatch(/You’re here.*arithmetic/);
        expect(screen.getByText("You’re here · values")).toBeTruthy();
    });

    it("does not count a concept as done because its game rungs are cleared", () => {
        show(PARTIAL);
        // arithmetic has 2 of 4 stops cleared and is still the current step.
        expect(screen.getByText("2 of 4 stops done")).toBeTruthy();
        expect(within(topicRow("values")).getByText("1 of 3 concepts done, then the checkpoint")).toBeTruthy();
    });

    it("names the next step, what it moves forward, and links to it", () => {
        show(PARTIAL);

        // Named as the list names it, with the topic it belongs to.
        const panel = screen.getByText("You’re here · values").closest(".progress-next")!;
        expect(within(panel as HTMLElement).getByText("arithmetic")).toBeTruthy();
        expect(within(panel as HTMLElement).getByText("Then 1 more concept and the checkpoint before variables opens.")).toBeTruthy();
        expect(within(panel as HTMLElement).getByRole("link", { name: "Continue" }).getAttribute("href")).toBe("/concept/arithmetic");
    });

    it("links the current step and completed steps, and nothing that is locked", () => {
        show(PARTIAL);

        const row = topicRow("values");
        const hrefs = within(row).getAllByRole("link").map((a) => a.getAttribute("href"));
        expect(hrefs).toEqual(["/concept/console-output", "/concept/arithmetic"]);
    });

    it("has one primary action: the Next step panel, with the current row's link kept quiet", () => {
        // UX audit: the panel's button and the expanded topic's "Start" were
        // both primary, to the same step.
        const { container } = show(PARTIAL);

        const primaries = [...container.querySelectorAll("a.button.primary")];
        expect(primaries.map((a) => a.getAttribute("href"))).toEqual(["/concept/arithmetic"]);
        expect(primaries[0]!.closest(".progress-next")).not.toBeNull();

        // The row still lets the learner open the step from where it sits.
        const start = within(topicRow("values")).getByRole("link", { name: "Start" });
        expect(start.getAttribute("href")).toBe("/concept/arithmetic");
        expect(start.className).not.toMatch(/primary/);
    });

    it("keeps the row's button primary when there is no panel to carry it", () => {
        const { container } = show(PARTIAL, null);

        expect([...container.querySelectorAll("a.button.primary")].map((a) => a.textContent)).toEqual(["Start"]);
    });

    it("points at the checkpoint, and what passing it opens, once the concepts are done", () => {
        const ready = path([
            topic("values", "current", [concept("console-output", "demonstrated"), concept("arithmetic", "demonstrated")], { state: "current" }),
            topic("variables", "locked", [concept("declaration", "locked")])
        ]);
        show(ready, { name: "values checkpoint", href: "/challenge/values", label: "Take the checkpoint" });

        expect(screen.getByText("Passing it opens variables.")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Take the checkpoint" }).getAttribute("href")).toBe("/challenge/values");
        expect(within(topicRow("values")).getByText("All 2 concepts done. The checkpoint is next")).toBeTruthy();
    });

    it("shows a finished course without a next step, every topic complete", () => {
        const done = path([
            topic("values", "complete", [concept("console-output", "demonstrated")], { state: "demonstrated" }),
            topic("variables", "complete", [concept("declaration", "demonstrated")], null)
        ]);
        show(done, null);

        expect(document.querySelector(".progress-next")).toBeNull();
        expect(within(topicRow("values")).getByText("Complete")).toBeTruthy();
        expect(within(topicRow("values")).getByText("Every step here is done")).toBeTruthy();
        expect(within(topicRow("variables")).getByText("Every step here is done")).toBeTruthy();
    });

    it("says so when the course has nothing in it yet", () => {
        show(path([]), null);
        expect(screen.getByText("There is nothing on the course yet.")).toBeTruthy();
    });

    it("never relies on colour: every state has a word", () => {
        const { container } = show(PARTIAL);
        for (const row of container.querySelectorAll(".progress-topic")) {
            expect(row.querySelector(".progress-topic-state")!.textContent!.trim()).not.toBe("");
        }
        expect(container.querySelector(".progress-path")!.getAttribute("aria-label")).toBe("Learning progress");
    });
});
