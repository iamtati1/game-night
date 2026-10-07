import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { JourneyPage } from "./JourneyPage.js";
import { MemoryRouter } from "react-router-dom";
import type { JourneyConcept, JourneyPathResponse } from "../api/types.js";

/**
 * THE MAP REACTS TO WHAT THE GAME DID.
 *
 * `state` is concept-level, so a learner who cleared one rung of three in Code
 * Blitz had a map node that looked exactly as it had before. The work was real,
 * the server knew about it, and the world said nothing -- which is the thing
 * that made gameplay feel bolted on.
 *
 * What is asserted is the RENDERING RULE only. Where the numbers come from is
 * the server's business: they are derived from CLEARED_RUNGS_CTE, the same
 * evidence that clears a rung anywhere else, and nothing here can change them.
 */

function concept(
    slug: string,
    state: JourneyConcept["state"],
    cleared: number,
    playable: number
): JourneyConcept {
    return {
        slug,
        name: slug,
        objective: "",
        state,
        neededRetry: false,
        rungs: { cleared, playable }
    };
}

function pathWith(concepts: JourneyConcept[]): JourneyPathResponse {
    return {
        topics: [
            {
                slug: "values",
                name: "Values and Types",
                principle: "p",
                order: 1,
                state: "current",
                concepts,
                challenge: null
            }
        ],
        current: { ...concepts[0]!, topic: "values" },
        points: { total: 0, concepts: 0, challenges: 0 }
    } as JourneyPathResponse;
}

function show(path: JourneyPathResponse) {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () =>
        new Response(JSON.stringify(path), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        })) as typeof fetch;

    render(
        <MemoryRouter>
            <JourneyPage />
        </MemoryRouter>
    );

    return () => {
        globalThis.fetch = originalFetch;
    };
}

afterEach(cleanup);

describe("a part-done concept on the map", () => {
    it("shows how many stops are behind the learner", async () => {
        const restore = show(pathWith([concept("console-output", "current", 1, 3)]));

        expect(await screen.findByText("1/3")).toBeTruthy();

        restore();
    });

    it("says nothing on a concept the learner has not started", async () => {
        // At zero this would be noise on every locked stop on the map.
        const restore = show(pathWith([concept("console-output", "current", 0, 3)]));

        await screen.findByText("console-output");
        expect(screen.queryByText("0/3")).toBeNull();

        restore();
    });

    it("says nothing on a finished concept, where the tick says more", async () => {
        const restore = show(pathWith([concept("console-output", "demonstrated", 3, 3)]));

        await screen.findByText("console-output");
        expect(screen.queryByText("3/3")).toBeNull();

        restore();
    });

    it("never claims more stops than exist", async () => {
        // Content retired after a learner cleared it would otherwise read 4/3.
        const restore = show(pathWith([concept("console-output", "current", 2, 3)]));

        expect(await screen.findByText("2/3")).toBeTruthy();

        restore();
    });
});
