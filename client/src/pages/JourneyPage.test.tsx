import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JourneyPathResponse, JourneyTopic } from "../api/types.js";
import { JourneyPage } from "./JourneyPage.js";
import { LEG, NARROW_LEG, routeSegment, stationAt } from "../world/atlas.js";

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
            { slug: "assignment", name: "Assignment", objective: "", state: "demonstrated", neededRetry: false, rungs: { cleared: 0, playable: 3 } },
            { slug: "comparison", name: "Comparison", objective: "", state: "current", neededRetry: false, rungs: { cleared: 0, playable: 3 } },
            { slug: "logic", name: "Logic", objective: "", state: "locked", neededRetry: false, rungs: { cleared: 0, playable: 3 } }
        ]),
        topic("conditionals", "locked", [
            { slug: "if-else", name: "If else", objective: "", state: "locked", neededRetry: false, rungs: { cleared: 0, playable: 3 } }
        ])
    ],
    current: { slug: "comparison", name: "Comparison", objective: "", state: "current", neededRetry: false, rungs: { cleared: 0, playable: 3 }, topic: "operators" },
    points: { total: 150, concepts: 4, challenges: 1 }
};

function renderMap() {
    vi.mocked(api.get).mockResolvedValue(PATH);

    return render(
        <MemoryRouter initialEntries={["/journey?view=map"]}>
            <JourneyPage />
        </MemoryRouter>
    );
}

afterEach(cleanup);

describe("the journey map", () => {
    it("parks the craft at the current world and nowhere else", async () => {
        const { container } = renderMap();

        // The craft's accessible name carries its STATE, because the state is
        // the learner's progress through the topic rather than decoration.
        expect(await screen.findByLabelText(/Your craft: exploring here/)).toBeTruthy();
        expect(container.querySelectorAll(".ship")).toHaveLength(1);

        const here = container.querySelector(".journey-station.is-here");

        expect(within(here as HTMLElement).getByText("operators")).toBeTruthy();
    });

    /**
     * The one state that tells the learner something they could not otherwise
     * see: the demonstration is unlocked and waiting. It is derived entirely
     * from challenge state the API already returns -- nothing is stored.
     */
    it("lights the craft's engine when the demonstration is waiting", async () => {
        const ready = {
            ...PATH,
            topics: PATH.topics.map((t) =>
                t.slug === "operators" ? { ...t, challenge: { state: "current" as const } } : t
            )
        };

        vi.mocked(api.get).mockResolvedValue(ready);

        const { container } = render(
            <MemoryRouter initialEntries={["/journey?view=map"]}>
                <JourneyPage />
            </MemoryRouter>
        );

        await screen.findByText("operators");

        expect(container.querySelector(".ship.is-challenge")).toBeTruthy();
        expect(screen.getByLabelText(/ready for the checkpoint/)).toBeTruthy();
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

describe("the section you are in says how far through it you are", () => {
    it("shows the current section's progress from demonstrations, with a bar that says the same", async () => {
        renderMap();

        const bar = await screen.findByRole("progressbar", { name: "operators progress" });
        // One of three concepts demonstrated, no checkpoint authored.
        expect(bar.getAttribute("aria-valuenow")).toBe("1");
        expect(bar.getAttribute("aria-valuemax")).toBe("3");
        expect(bar.getAttribute("aria-valuetext")).toBe("1 of 3 concepts done");
        expect(screen.getByText("1 of 3 concepts done")).toBeTruthy();
    });

    it("gives no progress bar to a section that is not open, and says what opens it", async () => {
        renderMap();
        await screen.findByRole("progressbar", { name: "operators progress" });

        expect(screen.getAllByRole("progressbar")).toHaveLength(1);
        // The locked section names exactly what it is waiting for.
        expect(screen.getByText(/opens when you finish 2 concepts in operators/i)).toBeTruthy();
    });

    it("names each step's state in words, not only with an icon", async () => {
        renderMap();
        await screen.findByRole("progressbar", { name: "operators progress" });

        expect(screen.getByText("Assignment").textContent).toMatch(/\(complete\)/);
        const current = document.querySelector(".journey-stop.is-current a")!;
        expect(current.getAttribute("href")).toBe("/concept/comparison");
        expect(current.textContent).toBe("Comparison (your current step)");
        expect(screen.getByText("Logic").textContent).toMatch(/\(locked: finish the steps above first\)/);
    });
});

describe("switching between the map and the progress path", () => {
    const at = (entry: string) => {
        vi.mocked(api.get).mockResolvedValue(PATH);
        return render(
            <MemoryRouter initialEntries={[entry]}>
                <JourneyPage />
            </MemoryRouter>
        );
    };

    it("opens on the list of steps, with the switch saying which is shown", async () => {
        const { container } = at("/journey");
        await screen.findByLabelText("Learning progress");

        expect(container.querySelector(".progress-path")).not.toBeNull();
        expect(container.querySelector(".journey-map")).toBeNull();
        expect(screen.getByRole("button", { name: "Steps" }).getAttribute("aria-pressed")).toBe("true");
        expect(screen.getByRole("button", { name: "Map" }).getAttribute("aria-pressed")).toBe("false");
        // One next step on the screen, not one in the header and one in the list.
        expect(screen.getAllByRole("link", { name: "Continue learning" })).toHaveLength(1);
        expect(screen.getByText("1 of 3 concepts done")).toBeTruthy();
    });

    it("puts the next step above the Steps/Map switch, so it is the first thing under the heading", async () => {
        const { container } = at("/journey");
        await screen.findByLabelText("Learning progress");

        const next = container.querySelector(".progress-next")!;
        const views = container.querySelector(".journey-views")!;
        expect(next.compareDocumentPosition(views) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("shows no points row before anything is done, rather than a row of zeros", async () => {
        vi.mocked(api.get).mockResolvedValue({ ...PATH, points: { total: 0, concepts: 0, challenges: 0 } });
        const { container } = render(
            <MemoryRouter initialEntries={["/journey"]}>
                <JourneyPage />
            </MemoryRouter>
        );
        await screen.findByLabelText("Learning progress");

        expect(container.querySelector(".journey-legend")).toBeNull();
    });

    it("shows the map instead when asked", async () => {
        const { container } = at("/journey");
        const map = await screen.findByRole("button", { name: "Map" });
        map.click();

        await screen.findByRole("progressbar", { name: "operators progress" });
        expect(container.querySelector(".progress-path")).toBeNull();
        // The switch moves into the header on the map, so it is a new element.
        expect(screen.getByRole("button", { name: "Map" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("opens straight onto the map from ?view=map", async () => {
        const { container } = at("/journey?view=map");
        await screen.findByRole("progressbar", { name: "operators progress" });
        expect(container.querySelector(".journey-map")).not.toBeNull();
    });

    it("still opens the list from the older ?view=progress link", async () => {
        const { container } = at("/journey?view=progress");
        await screen.findByLabelText("Learning progress");
        expect(container.querySelector(".journey-map")).toBeNull();
    });
});

describe("the open world's callout and checkpoint", () => {
    it("holds the steps to one leg of the route, so they cannot reach the next world", async () => {
        const { container } = renderMap();
        await screen.findByRole("progressbar", { name: "operators progress" });

        const stops = container.querySelector<HTMLElement>(".journey-stops")!;
        expect(stops.style.maxHeight).toBe(`calc(${LEG}px - 1.5rem)`);
    });

    it("says the checkpoint's state in words, like every concept row", async () => {
        vi.mocked(api.get).mockResolvedValue({
            ...PATH,
            topics: PATH.topics.map((t) => (t.slug === "operators" ? { ...t, challenge: { state: "locked" } } : t))
        });
        const { container } = render(
            <MemoryRouter initialEntries={["/journey?view=map"]}>
                <JourneyPage />
            </MemoryRouter>
        );
        await screen.findByRole("progressbar", { name: "operators progress" });

        expect(container.querySelector(".journey-challenge")!.textContent).toBe(
            "operators checkpoint (locked: finish the concepts above first)"
        );
    });
});

describe("the route's geometry", () => {
    it("is unchanged at the default leg, and stretches every station alike on a narrow one", () => {
        expect(stationAt(3)).toEqual(stationAt(3, LEG));
        expect(stationAt(3, NARROW_LEG).y - stationAt(2, NARROW_LEG).y).toBe(NARROW_LEG);
        expect(stationAt(3, NARROW_LEG).x).toBe(stationAt(3).x);
        // The road is drawn through the same points it places the stations at.
        expect(routeSegment(0, 2, NARROW_LEG)).toContain(`${stationAt(2, NARROW_LEG).x} ${stationAt(2, NARROW_LEG).y}`);
    });
});
