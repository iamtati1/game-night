import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JourneyPathResponse, JourneyTopic } from "../api/types.js";
import { JourneyPage } from "./JourneyPage.js";
import { routeSegment, stationAt } from "../world/atlas.js";

/**
 * The map is now the primary way a learner reads their own progress, so the
 * things asserted here are the things that would silently lie if they broke:
 * which world the craft is parked at, which road is lit, and that only the
 * current world is expanded.
 *
 * Nothing here asserts on colour or on the planet artwork. Those are allowed to
 * change freely -- a test that pins the hue of a planet makes the art harder to
 * revise for no safety in return.
 */
vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {},
    api: { get: vi.fn() }
}));

const { api } = await import("../api/client.js");

function topic(
    slug: string,
    state: JourneyTopic["state"],
    concepts: JourneyTopic["concepts"] = []
): JourneyTopic {
    return {
        slug,
        name: slug.replace(/-/g, " "),
        principle: "",
        order: 1,
        state,
        concepts,
        challenge: null
    };
}

const PATH: JourneyPathResponse = {
    topics: [
        topic("values", "complete"),
        topic("variables", "complete"),
        topic("operators", "current", [
            { slug: "assignment", name: "Assignment", objective: "", state: "demonstrated", neededRetry: false },
            { slug: "comparison", name: "Comparison", objective: "", state: "current", neededRetry: false },
            { slug: "logic", name: "Logic", objective: "", state: "locked", neededRetry: false }
        ]),
        topic("conditionals", "locked", [
            { slug: "if-else", name: "If else", objective: "", state: "locked", neededRetry: false }
        ])
    ],
    current: { slug: "comparison", name: "Comparison", objective: "", state: "current", neededRetry: false, topic: "operators" },
    points: { total: 150, concepts: 4, challenges: 1 }
};

function renderMap() {
    vi.mocked(api.get).mockResolvedValue(PATH);

    return render(
        <MemoryRouter>
            <JourneyPage />
        </MemoryRouter>
    );
}

afterEach(cleanup);

describe("the journey map", () => {
    it("parks the craft at the current world and nowhere else", async () => {
        const { container } = renderMap();

        expect(await screen.findByLabelText("Your craft, here")).toBeTruthy();
        expect(container.querySelectorAll(".ship")).toHaveLength(1);

        const here = container.querySelector(".journey-station.is-here");

        expect(within(here as HTMLElement).getByText("operators")).toBeTruthy();
    });

    it("draws every world once, in curriculum order", async () => {
        const { container } = renderMap();

        await screen.findByText("operators");

        const names = [...container.querySelectorAll(".journey-name")].map((n) => n.textContent);

        expect(names).toEqual(["values", "variables", "operators", "conditionals"]);
    });

    /**
     * The lit road is the progress indicator -- there is no bar on this page --
     * so "the road behind you ends at the world you are on" is the assertion
     * that keeps it honest. Comparing against routeSegment rather than against
     * a hardcoded path means the geometry can be retuned without a test edit.
     */
    it("lights the road up to the current world and leaves the rest dashed", async () => {
        const { container } = renderMap();

        await screen.findByText("operators");

        const done = container.querySelector(".journey-road-done");
        const todo = container.querySelector(".journey-road-todo");

        expect(done?.getAttribute("d")).toBe(routeSegment(0, 2));
        expect(todo?.getAttribute("d")).toBe(routeSegment(2, 3));
    });

    it("positions each world on the road it is drawn beside", async () => {
        const { container } = renderMap();

        await screen.findByText("operators");

        const third = container.querySelectorAll<HTMLElement>(".journey-station")[2]!;
        const at = stationAt(2);

        expect(third.style.left).toBe(`${at.x}%`);
        expect(third.style.top).toBe(`${at.y}px`);
    });

    /* Sixteen expanded stations is the wall of rows the map exists to replace. */
    it("expands only the current world's stops", async () => {
        const { container } = renderMap();

        await screen.findByText("Comparison");

        expect(container.querySelectorAll(".journey-stops")).toHaveLength(1);
        expect(screen.queryByText("If else")).toBeNull();
    });

    it("links the current stop and leaves locked ones inert", async () => {
        renderMap();

        expect((await screen.findByText("Comparison")).closest("a")).toBeTruthy();
        expect(screen.getByText("Logic").closest("a")).toBeNull();
        expect(screen.getByText("Assignment").closest("a")).toBeNull();
    });

    it("reports what the learner can do rather than a percentage", async () => {
        const { container } = renderMap();

        await screen.findByText("operators");

        expect(screen.getByText("150")).toBeTruthy();
        expect(screen.getByText("things you can do")).toBeTruthy();
        expect(container.querySelector("progress")).toBeNull();
        expect(container.textContent).not.toMatch(/\d+%/);
    });
});
