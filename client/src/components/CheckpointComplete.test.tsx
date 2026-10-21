import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JourneyConcept, JourneyTopic } from "../api/types.js";

vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {},
    api: { get: vi.fn(), post: vi.fn() }
}));

const { api } = await import("../api/client.js");
const { CheckpointComplete } = await import("./CheckpointComplete.js");

afterEach(() => {
    cleanup();
    vi.resetAllMocks();
});

const concept = (slug: string, state: JourneyConcept["state"]): JourneyConcept => ({
    slug,
    name: slug,
    objective: `do ${slug}`,
    state,
    neededRetry: false,
    rungs: { cleared: state === "demonstrated" ? 3 : 0, playable: 3 }
});

const topic = (
    slug: string,
    name: string,
    state: JourneyTopic["state"],
    concepts: JourneyConcept[],
    order: number,
    challenge: JourneyTopic["challenge"] = null
): JourneyTopic => ({ slug, name, principle: "", order, state, concepts, challenge });

function show(topics: JourneyTopic[], current: JourneyConcept | null = null) {
    vi.mocked(api.get).mockResolvedValue({
        topics,
        current: current ? { ...current, topic: "variables" } : null,
        points: { total: 275, concepts: 200, challenges: 75 }
    } as never);

    return render(
        <MemoryRouter>
            <CheckpointComplete topic="values" title="Values challenge" />
        </MemoryRouter>
    );
}

/**
 * THE SCREEN THAT OWNS THE UNLOCK.
 *
 * Passing a topic's checkpoint is the only write in Jolt that opens a new
 * module. The screen after it used to say "Topic complete", print the
 * challenge's own title, and offer "See what is next" -- never naming the
 * module that had just opened, and sending the learner back to the map to
 * work it out. That is what "I finished it and nothing unlocked" looks like
 * from the player's side: the unlock happened and the game was silent.
 */
describe("the moment a checkpoint closes a module", () => {
    const PASSED = [
        topic("values", "Values and Types", "complete", [concept("a", "demonstrated")], 1, {
            state: "demonstrated"
        }),
        topic("variables", "Variables", "current", [concept("names", "current")], 2)
    ];

    it("names the module that just opened and offers the way in", async () => {
        const { container } = show(PASSED);

        const banner = await screen.findByRole("status");

        expect(banner.textContent).toMatch(/module unlocked/i);
        expect(banner.textContent).toMatch(/Variables/);

        const enter = await screen.findByRole("link", { name: /enter variables/i });

        // Into the new module, not back to the map to go looking.
        expect(enter.getAttribute("href")).toBe("/concept/names");
        expect(container.textContent).toMatch(/module complete/i);
    });

    it("claims no unlock when the server shows none", async () => {
        // The last topic in the course, or one with nothing authored after it:
        // the checkpoint is real, the unlock is not, and the screen says only
        // what is true.
        show([
            topic("values", "Values and Types", "complete", [concept("a", "demonstrated")], 1, {
                state: "demonstrated"
            })
        ]);

        await screen.findByText(/Values and Types/);

        expect(screen.queryByRole("status")).toBeNull();
        expect(screen.queryByText(/module unlocked/i)).toBeNull();
    });

    it("does not announce a module the learner is already working in", async () => {
        show([
            topic("values", "Values and Types", "complete", [concept("a", "demonstrated")], 1, {
                state: "demonstrated"
            }),
            topic("variables", "Variables", "current", [concept("names", "demonstrated")], 2)
        ]);

        await screen.findByText(/Values and Types/);

        expect(screen.queryByText(/module unlocked/i)).toBeNull();
    });

    it("says the module is not complete when the server still has concepts open", async () => {
        // A recorded checkpoint over an unfinished topic. Rare, and the one
        // case where "module complete" would be the original lie again.
        show([
            topic(
                "values",
                "Values and Types",
                "current",
                [concept("a", "demonstrated"), concept("b", "current")],
                1,
                { state: "demonstrated" }
            ),
            topic("variables", "Variables", "locked", [concept("names", "locked")], 2)
        ]);

        await screen.findByText(/checkpoint passed/i);

        expect(screen.queryByText(/module complete/i)).toBeNull();
        expect(screen.queryByText(/module unlocked/i)).toBeNull();
        expect(document.body.textContent).toMatch(/next module stays shut/i);
    });
});
