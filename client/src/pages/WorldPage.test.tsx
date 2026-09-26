import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JourneyConcept, JourneyPathResponse } from "../api/types.js";

vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {},
    api: { get: vi.fn() }
}));

const { api } = await import("../api/client.js");
const { WorldPage } = await import("./WorldPage.js");

afterEach(cleanup);

const NAMES = ["Console Output", "Expressions", "Primitive Types", "Booleans", "typeof"];

/** A world with the first `done` concepts behind the learner. */
function world(done: number, allDone = false): JourneyPathResponse {
    const concepts: JourneyConcept[] = NAMES.map((name, i) => ({
        slug: `c${i}`,
        name,
        objective: "do the thing",
        state: allDone
            ? "demonstrated"
            : i < done
              ? "demonstrated"
              : i === done
                ? "current"
                : "locked",
        neededRetry: false
    }));

    return {
        topics: [
            {
                slug: "values",
                name: "Values and Types",
                principle: "Every piece of code turns into a value.",
                order: 1,
                state: "current",
                concepts,
                challenge: { state: allDone ? "current" : "locked" }
            }
        ],
        current: null,
        points: { total: 0, concepts: done, challenges: 0 }
    };
}

function open(data: JourneyPathResponse = world(2)) {
    vi.mocked(api.get).mockResolvedValue(data);

    return render(
        <MemoryRouter initialEntries={["/world/values"]}>
            <Routes>
                <Route path="/world/:topic" element={<WorldPage />} />
            </Routes>
        </MemoryRouter>
    );
}

describe("a world is the curriculum, close up", () => {
    it("draws one object for every concept in the topic", async () => {
        const { container } = open();

        await screen.findByText("Values and Types");

        expect(container.querySelectorAll(".world-object")).toHaveLength(NAMES.length);
    });

    it("keeps them in curriculum order in the DOM, wherever they sit on screen", async () => {
        // Tab through the world and you walk the topic in the order it is
        // taught. Position is decoration; the document order is the curriculum.
        const { container } = open();

        await screen.findByText("Values and Types");

        const names = [...container.querySelectorAll(".world-object-name")].map((n) => n.textContent);

        expect(names).toEqual(NAMES);
    });

    it("says the topic's own sentence and never a progress count", async () => {
        const { container } = open();

        expect(await screen.findByText(/Every piece of code turns into a value/)).toBeTruthy();
        // "2 of 5" is a progress bar wearing a costume. The objects say it.
        expect(container.textContent).not.toMatch(/\d+\s*(of|\/)\s*\d+/);
        expect(container.textContent).not.toMatch(/\d+%/);
    });
});

describe("what the learner can reach", () => {
    it("links only the concept they can go to", async () => {
        const { container } = open(world(2));

        await screen.findByText("Values and Types");

        const links = [...container.querySelectorAll(".world-object a")];

        expect(links).toHaveLength(1);
        expect(links[0]!.getAttribute("href")).toBe("/learn/c2");
    });

    it("does not render an unreached concept as a disabled control", async () => {
        // A place you have not reached is FAR AWAY, not forbidden. Nothing here
        // refuses the learner -- there is simply no link yet.
        const { container } = open(world(2));

        await screen.findByText("Values and Types");

        expect(container.querySelectorAll("button:disabled")).toHaveLength(0);
        expect(container.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);
    });

    it("gives every object an accessible name, reachable or not", async () => {
        // The easiest thing to break in a spatial interface. Asserted directly.
        const { container } = open(world(2));

        await screen.findByText("Values and Types");

        for (const object of container.querySelectorAll(".world-object > *")) {
            expect(object.getAttribute("aria-label"), object.textContent ?? "").toBeTruthy();
        }
    });

    it("names what a finished concept let the learner do", async () => {
        open(world(2));

        expect(await screen.findByLabelText(/Console Output — you can do the thing/)).toBeTruthy();
        expect(screen.getByLabelText(/Primitive Types — go here next/)).toBeTruthy();
        expect(screen.getByLabelText(/Booleans — not reached yet/)).toBeTruthy();
    });
});

describe("finishing the topic changes the place", () => {
    it("warms the world as concepts are demonstrated", async () => {
        // Not a number on screen -- it lights the atmosphere.
        const { container: early } = open(world(1));

        await screen.findByText("Values and Types");
        const cold = (early.querySelector(".world") as HTMLElement).style.getPropertyValue("--warmth");

        cleanup();

        const { container: late } = open(world(4));

        await screen.findByText("Values and Types");
        const warm = (late.querySelector(".world") as HTMLElement).style.getPropertyValue("--warmth");

        expect(Number(warm)).toBeGreaterThan(Number(cold));
    });

    it("offers the checkpoint only when nothing is left out there", async () => {
        open(world(2));

        await screen.findByText("Values and Types");
        expect(screen.queryByText(/launch check/i)).toBeNull();

        cleanup();
        open(world(NAMES.length, true));

        expect(await screen.findByText(/launch check/i)).toBeTruthy();
        expect(screen.getByText(/Every outpost on Values and Types is lit/)).toBeTruthy();
    });

    it("always offers the way back to the map", async () => {
        open();

        const back = await screen.findByText(/Back to the map/);

        expect(back.closest("a")?.getAttribute("href")).toBe("/journey");
    });
});

describe("a world that is not there", () => {
    it("says so rather than rendering an empty place", async () => {
        open({ topics: [], current: null, points: { total: 0, concepts: 0, challenges: 0 } });

        expect(await screen.findByText(/no world there yet/i)).toBeTruthy();
    });
});
