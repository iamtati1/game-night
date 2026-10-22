import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JourneyPathResponse } from "../api/types.js";

/**
 * After a tough run the next step is worded as a look back at the lesson --
 * the same destination, the same single primary -- and a strong run gets one
 * line saying so. Nothing is recorded either way.
 */

vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {},
    api: { get: vi.fn(), post: vi.fn() }
}));

const { api } = await import("../api/client.js");
const { NextStepActions } = await import("./NextStepActions.js");

const concept = {
    slug: "arithmetic-operators",
    name: "Using Arithmetic Operators",
    objective: "",
    state: "current" as const,
    neededRetry: false,
    rungs: { cleared: 1, playable: 3 }
};

const PATH: JourneyPathResponse = {
    topics: [{ slug: "values", name: "Values", principle: "", order: 1, state: "current", concepts: [concept], challenge: null }],
    current: { ...concept, topic: "values" },
    points: { total: 25, concepts: 1, challenges: 0 }
};

function renderWith(outcome?: { hit: number; total: number; unit: string }, path = PATH) {
    vi.mocked(api.get).mockResolvedValue(path);
    return render(
        <MemoryRouter>
            <NextStepActions outcome={outcome} replay={(cls) => <a className={cls} href="/flush">Play again</a>} />
        </MemoryRouter>
    );
}

beforeEach(() => vi.mocked(api.get).mockReset());
afterEach(cleanup);

describe("the next step after a run", () => {
    it("leads with a look back at the lesson after a tough run", async () => {
        const { container } = renderWith({ hit: 1, total: 4, unit: "rounds flushed" });

        const primary = await screen.findByRole("link", { name: "Look back at Using Arithmetic Operators" });
        expect(primary.getAttribute("href")).toBe("/concept/arithmetic-operators");
        expect(screen.getByText(/A tough run: 1 of 4 rounds flushed/)).toBeTruthy();
        expect(container.querySelectorAll(".button.primary")).toHaveLength(1);
        expect(api.post).not.toHaveBeenCalled();
    });

    it("says so after a strong run and continues as usual", async () => {
        renderWith({ hit: 5, total: 5, unit: "rounds flushed" });

        expect(await screen.findByRole("link", { name: "Continue: Using Arithmetic Operators" })).toBeTruthy();
        expect(screen.getByText("Strong run: 5 of 5 rounds flushed.")).toBeTruthy();
    });

    it("adds nothing for a steady run, or for a game with no outcome", async () => {
        const { container } = renderWith({ hit: 3, total: 5, unit: "rounds flushed" });
        await screen.findByRole("link", { name: "Continue: Using Arithmetic Operators" });
        expect(container.querySelector(".run-tone")).toBeNull();
        cleanup();

        const second = renderWith(undefined);
        await screen.findByRole("link", { name: "Continue: Using Arithmetic Operators" });
        expect(second.container.querySelector(".run-tone")).toBeNull();
    });

    it("keeps a due checkpoint as the next step even after a tough run", async () => {
        const done = { ...concept, state: "demonstrated" as const };
        renderWith(
            { hit: 0, total: 4, unit: "incidents resolved" },
            {
                topics: [{ ...PATH.topics[0]!, concepts: [done], challenge: { state: "current" } }],
                current: null,
                points: PATH.points
            }
        );

        expect(await screen.findByRole("link", { name: "Take the Values checkpoint" })).toBeTruthy();
        expect(screen.queryByRole("link", { name: /Look back/ })).toBeNull();
    });
});
