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
        rungs: { cleared: 0, playable: 3 },
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
    it("lists one step for every concept in the topic", async () => {
        // Was one scattered object per concept. The sequence replaced the orbit
        // because the orbit encoded its states as treatments and named them
        // only in aria-labels; the claim -- every concept is on the screen,
        // exactly once -- is unchanged.
        const { container } = open();

        await screen.findByText("Values and Types");

        // Concepts PLUS the checkpoint. A topic with a cumulative challenge is
        // not finished when its concepts are -- the unlock is on the other side
        // of it -- and leaving it off the list is what made the end of a topic
        // feel like it had no end.
        expect(container.querySelectorAll(".step")).toHaveLength(NAMES.length + 1);
    });

    it("keeps them in curriculum order in the DOM, wherever they sit on screen", async () => {
        // Tab through the world and you walk the topic in the order it is
        // taught. Position is decoration; the document order is the curriculum.
        const { container } = open();

        await screen.findByText("Values and Types");

        const names = [...container.querySelectorAll(".step-name")].map((n) => n.textContent);

        expect(names).toEqual([...NAMES, "Values and Types checkpoint"]);
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

        // ONE ACTION, which is the point of the sequence. Exactly one row
        // carries the button; finished rows offer a quiet "Revisit" link and
        // locked rows are not interactive at all.
        const links = [...container.querySelectorAll(".step-go")];

        expect(links).toHaveLength(1);

        // The encounter, not the bare lesson. Reaching a concept from the world
        // now opens the one screen that teaches it, practises it at the rung the
        // curriculum says the learner is on, and lets them write code for it --
        // rather than a lesson that hands off to whatever the topic deals.
        expect(links[0]!.getAttribute("href")).toBe("/concept/c2");
    });

    it("does not render an unreached concept as a disabled control", async () => {
        // A place you have not reached is FAR AWAY, not forbidden. Nothing here
        // refuses the learner -- there is simply no link yet.
        const { container } = open(world(2));

        await screen.findByText("Values and Types");

        expect(container.querySelectorAll("button:disabled")).toHaveLength(0);
        expect(container.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);
    });

    it("names every step and its state, reachable or not", async () => {
        // Was an aria-label check on a spatial interface. The sequence carries
        // the same obligation: no row may be a bare name with no state beside
        // it, or the list stops answering "why can I not do that".
        const { container } = open(world(2));

        await screen.findByText("Values and Types");

        const rows = [...container.querySelectorAll(".step")];

        expect(rows.length).toBeGreaterThan(0);

        for (const row of rows) {
            expect(row.querySelector(".step-name")?.textContent, row.textContent ?? "").toBeTruthy();
            expect(row.querySelector(".step-state")?.textContent, row.textContent ?? "").toBeTruthy();
        }
    });

    it("says each step's state in words, and what a finished one bought", async () => {
        // These three facts used to live in aria-labels on scattered objects:
        // readable to a screen reader and invisible to everyone else. They are
        // visible text now. The claim is the same one, asserted on what the
        // learner can actually see.
        open(world(2));

        // Two concepts are demonstrated in world(2), so both carry the line.
        expect((await screen.findAllByText("You can do the thing")).length).toBeGreaterThan(0);
        expect(screen.getAllByText("Complete").length).toBeGreaterThan(0);
        expect(screen.getByText("You’re here")).toBeTruthy();
        expect(screen.getAllByText("Locked").length).toBeGreaterThan(0);
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
        expect(screen.queryByText(/take the checkpoint/i)).toBeNull();

        cleanup();
        open(world(NAMES.length, true));

        expect(await screen.findByText(/take the checkpoint/i)).toBeTruthy();
        expect(screen.getByText(/Every concept in Values and Types is done/)).toBeTruthy();
    });

    it("always offers the way back to the journey", async () => {
        open();

        const back = await screen.findByText(/See your journey/);

        expect(back.closest("a")?.getAttribute("href")).toBe("/journey");
    });
});

describe("a world that is not there", () => {
    it("says so rather than rendering an empty place", async () => {
        open({ topics: [], current: null, points: { total: 0, concepts: 0, challenges: 0 } });

        expect(await screen.findByText(/no world there yet/i)).toBeTruthy();
    });
});

describe("what a world says about itself", () => {
    // Browser QA: a FINISHED world, and a world whose checkpoint was due, both
    // said "This world is not open yet", because the page asked "is a concept
    // here current?" instead of reading the topic's state from the path.
    const concept = (slug: string, state: JourneyConcept["state"]): JourneyConcept => ({
        slug,
        name: slug.toUpperCase(),
        objective: "do the thing",
        rungs: { cleared: 0, playable: 3 },
        state,
        neededRetry: false
    });

    /** Values then Variables, at one of the four positions a learner can be in. */
    function path(at: "values-concept" | "values-checkpoint" | "variables-concept"): JourneyPathResponse {
        const valuesDone = at === "variables-concept";
        const valuesConcepts = valuesDone || at === "values-checkpoint"
            ? [concept("a", "demonstrated"), concept("b", "demonstrated")]
            : [concept("a", "demonstrated"), concept("b", "current")];

        return {
            topics: [
                {
                    slug: "values",
                    name: "Values and Types",
                    principle: "",
                    order: 1,
                    state: valuesDone ? "complete" : "current",
                    concepts: valuesConcepts,
                    challenge: { state: valuesDone ? "demonstrated" : at === "values-checkpoint" ? "current" : "locked" }
                },
                {
                    slug: "variables",
                    name: "Variables",
                    principle: "",
                    order: 2,
                    state: valuesDone ? "current" : "locked",
                    concepts: [concept("c", valuesDone ? "current" : "locked"), concept("d", "locked")],
                    challenge: { state: "locked" }
                }
            ],
            current:
                at === "values-concept"
                    ? { ...concept("b", "current"), topic: "values" }
                    : at === "variables-concept"
                      ? { ...concept("c", "current"), topic: "variables" }
                      : null,
            points: { total: 0, concepts: 0, challenges: 0 }
        };
    }

    function visit(slug: string, data: JourneyPathResponse) {
        vi.mocked(api.get).mockResolvedValue(data);

        return render(
            <MemoryRouter initialEntries={[`/world/${slug}`]}>
                <Routes>
                    <Route path="/world/:topic" element={<WorldPage />} />
                </Routes>
            </MemoryRouter>
        );
    }

    it("says nothing about being closed in the world the learner is working in", async () => {
        visit("values", path("values-concept"));

        await screen.findByText("Values and Types");
        expect(screen.queryByText(/not open yet/i)).toBeNull();
        expect(screen.queryByText(/you have finished/i)).toBeNull();
    });

    it("does not call a world closed when its checkpoint is due, and offers the checkpoint", async () => {
        visit("values", path("values-checkpoint"));

        expect(await screen.findByText(/take the checkpoint/i)).toBeTruthy();
        expect(screen.queryByText(/not open yet/i)).toBeNull();
    });

    it("with the checkpoint due, offers it as the one primary action", async () => {
        // UX audit: the checkpoint's row "Start" and "Take the launch check"
        // were both primary buttons to /challenge/values.
        const { container } = visit("values", path("values-checkpoint"));

        await screen.findByText(/take the checkpoint/i);

        const primaries = [...container.querySelectorAll("a.button.primary")];
        expect(primaries.map((a) => a.getAttribute("href"))).toEqual(["/challenge/values"]);
        expect(primaries[0]!.textContent).toMatch(/take the checkpoint/i);

        // The row keeps a quiet link to the same step, not a second button.
        const rowLink = container.querySelector(".step.is-current a")!;
        expect(rowLink.getAttribute("href")).toBe("/challenge/values");
        expect(rowLink.className).not.toMatch(/primary/);
    });

    it("with a concept current, the step's row is the one primary action", async () => {
        const { container } = visit("values", path("values-concept"));

        await screen.findByText("Values and Types");

        expect([...container.querySelectorAll("a.button.primary")].map((a) => a.getAttribute("href"))).toEqual(["/concept/b"]);
    });

    it("says a finished world is finished, and points at where the learner is now", async () => {
        visit("values", path("variables-concept"));

        const status = await screen.findByText(/you have finished values and types/i);

        expect(screen.queryByText(/not open yet/i)).toBeNull();
        expect(status.querySelector("a")?.getAttribute("href")).toBe("/concept/c");
    });

    it("says a locked world is locked, what opens it, and where the learner is working", async () => {
        visit("variables", path("values-concept"));

        const status = await screen.findByText(/not open yet/i);

        // The map's own requirement sentence: the next world names what is left.
        expect(status.textContent).toMatch(/opens when you finish 1 concept and the checkpoint in values and types/i);
        expect(status.querySelector("a")?.getAttribute("href")).toBe("/concept/b");
    });

    it("names the checkpoint as the place to go when that is the learner's next step", async () => {
        visit("variables", path("values-checkpoint"));

        const status = await screen.findByText(/not open yet/i);

        expect(status.textContent).toMatch(/opens when you finish the checkpoint in values and types/i);
        expect(status.querySelector("a")?.getAttribute("href")).toBe("/challenge/values");
    });
});
