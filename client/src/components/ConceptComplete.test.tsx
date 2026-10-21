import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JourneyConcept, JourneyPathResponse } from "../api/types.js";

/**
 * Finishing a lesson: what you can now do, one next step, and -- quietly --
 * the way back to the journey and the way into practice.
 */
vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {},
    api: { get: vi.fn() }
}));

const { api } = await import("../api/client.js");
const { ConceptComplete } = await import("./ConceptComplete.js");

afterEach(cleanup);

const concept = (slug: string, state: JourneyConcept["state"]): JourneyConcept => ({
    slug,
    name: slug,
    objective: `do ${slug}`,
    state,
    neededRetry: false,
    rungs: { cleared: 0, playable: 1 }
});

function show(path: JourneyPathResponse) {
    vi.mocked(api.get).mockResolvedValue(path);
    return render(
        <MemoryRouter>
            <ConceptComplete concept="console-output" />
        </MemoryRouter>
    );
}

describe("finishing a lesson", () => {
    it("names the next lesson as the one primary action, with the journey and games beside it", async () => {
        const next = concept("arithmetic", "current");
        const { container } = show({
            topics: [{ slug: "values", name: "Values", principle: "", order: 1, state: "current", concepts: [concept("console-output", "demonstrated"), next], challenge: null }],
            current: { ...next, topic: "values" },
            points: { total: 25, concepts: 1, challenges: 0 }
        });

        const go = await screen.findByRole("link", { name: "Continue learning" });
        expect(go.getAttribute("href")).toBe("/concept/arithmetic");
        expect([...container.querySelectorAll(".button.primary")]).toHaveLength(1);
        expect(screen.getByRole("link", { name: "See your journey" }).getAttribute("href")).toBe("/journey");
        expect(screen.getByRole("link", { name: "Play a game" }).getAttribute("href")).toBe("/play");
    });

    it("does not offer the journey twice when that is where the primary action goes", async () => {
        show({
            topics: [{ slug: "values", name: "Values", principle: "", order: 1, state: "complete", concepts: [concept("console-output", "demonstrated")], challenge: null }],
            current: null,
            points: { total: 25, concepts: 1, challenges: 0 }
        });

        expect(await screen.findAllByRole("link", { name: "See your journey" })).toHaveLength(1);
        expect(screen.getByRole("link", { name: "Play a game" })).toBeTruthy();
    });
});
