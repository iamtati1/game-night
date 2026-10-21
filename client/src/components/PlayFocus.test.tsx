import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { PlayFocus } from "./PlayFocus.js";
import type { Encounter, EncounterOption } from "../api/encounter.js";
import type { JourneyPathResponse } from "../api/types.js";

/**
 * The Play page's curriculum seam.
 *
 * What is being protected is a claim, not a layout: `/play` may only say things
 * about the learner's concept that the curriculum actually supports. The failure
 * worth guarding against is a confident invented relationship -- a link that
 * looks aimed at the current concept and quietly is not -- because that teaches
 * the learner that Jolt's suggestions are decoration.
 */

function pathWith(current: JourneyPathResponse["current"]): JourneyPathResponse {
    return {
        topics: [
            {
                slug: "values",
                name: "Values and Types",
                principle: "A program is made of values.",
                order: 1,
                state: "current",
                concepts: [],
                challenge: null
            }
        ],
        current,
        points: { total: 0, concepts: 0, challenges: 0 }
    } as JourneyPathResponse;
}

const CURRENT = {
    slug: "console-output",
    name: "Running Code and Reading Output",
    objective: "read a line of code and say what it displays",
    state: "current",
    neededRetry: false,
    topic: "values"
} as JourneyPathResponse["current"];

function encounterWith(kinds: EncounterOption["content"]["kind"][]): Encounter {
    return {
        conceptSlug: "console-output",
        name: "Running Code and Reading Output",
        rungs: kinds.map((kind, i) => ({
            demandSlug: `demand-${i}`,
            demandOrder: i,
            cleared: false,
            options: [
                {
                    challengeId: String(100 + i),
                    difficulty: 1,
                    content: kind === "mission" ? { kind } : { kind, id: "1" }
                }
            ]
        }))
    } as Encounter;
}

function show(path: JourneyPathResponse | null, encounter: Encounter | null) {
    render(
        <MemoryRouter>
            <PlayFocus path={path} encounter={encounter} />
        </MemoryRouter>
    );
}

const hrefOf = (name: RegExp) =>
    (screen.getByRole("link", { name }) as HTMLAnchorElement).getAttribute("href");

afterEach(cleanup);

describe("what to play for what you are learning", () => {
    it("names the concept the server says the learner is on", () => {
        show(pathWith(CURRENT), encounterWith(["question"]));

        expect(screen.getByText("You’re here")).toBeTruthy();
        expect(
            screen.getByRole("heading", { name: /Running Code and Reading Output/ })
        ).toBeTruthy();
        expect(screen.getByText("Values and Types")).toBeTruthy();
    });

    it("leads with the concept itself, counting what is actually left on it", () => {
        // The only concept-TARGETED route there is.
        show(pathWith(CURRENT), encounterWith(["question", "mission"]));

        expect(hrefOf(/Start learning/)).toBe("/concept/console-output");
        expect(screen.getByText("the 2 stops left on this concept")).toBeTruthy();
    });

    it("counts only rungs that something actually fills", () => {
        // A rung the curriculum declares with nothing behind it is not somewhere
        // the learner can go, and counting it would send them to an empty stop.
        const encounter = encounterWith(["question", "mission"]);
        encounter.rungs[1]!.options = [];

        show(pathWith(CURRENT), encounter);

        expect(screen.getByText("the last stop left on this concept")).toBeTruthy();
    });

    it("offers no game in the course band, so the course is the one thing it points at", () => {
        // UX audit: the band offered Keep going, Code Blitz and Bug Hunt at
        // equal weight, and recommended Bug Hunt to beginners it usually cannot
        // deal a full run to. The games are below the band, as optional
        // practice. (The old guard against a fake "aimed" game link -- see
        // `?focus=` in PlayFocus.tsx -- holds trivially: there is none.)
        const { container } = render(
            <MemoryRouter>
                <PlayFocus path={pathWith(CURRENT)} encounter={encounterWith(["question"])} />
            </MemoryRouter>
        );

        expect(screen.queryByRole("link", { name: /Code Blitz/ })).toBeNull();
        expect(screen.queryByRole("link", { name: /Bug Hunt/ })).toBeNull();
        expect([...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([
            "/concept/console-output"
        ]);
    });

    it("says Continue learning once the learner has finished something", () => {
        const returning = { ...pathWith(CURRENT), points: { total: 25, concepts: 1, challenges: 0 } };
        render(
            <MemoryRouter>
                <PlayFocus path={returning} encounter={encounterWith(["question", "mission"])} />
            </MemoryRouter>
        );

        expect(screen.getByRole("link", { name: "Continue learning" }).getAttribute("href")).toBe("/concept/console-output");
        expect(screen.queryByRole("link", { name: "Start learning" })).toBeNull();
    });

    it("makes the next step the single primary action -- Start learning before anything is done", () => {
        const { container } = render(
            <MemoryRouter>
                <PlayFocus path={pathWith(CURRENT)} encounter={encounterWith(["question", "mission"])} />
            </MemoryRouter>
        );

        const primaries = [...container.querySelectorAll("a.button.primary")];
        expect(primaries.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
            ["Start learning", "/concept/console-output"]
        ]);
    });

    it("offers the checkpoint as the one action when that is the next step", () => {
        // The band used to vanish here: the server sends no current concept
        // while a checkpoint is due.
        const path = pathWith(null);
        path.topics[0]!.challenge = { state: "current" };

        const { container } = render(
            <MemoryRouter>
                <PlayFocus path={path} encounter={null} />
            </MemoryRouter>
        );

        const primaries = [...container.querySelectorAll("a.button.primary")];
        expect(primaries.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
            ["Take the checkpoint", "/challenge/values"]
        ]);
        expect(screen.getByText("Values and Types checkpoint")).toBeTruthy();
    });

    it("says so plainly when there is nothing to play on this concept yet", () => {
        show(pathWith(CURRENT), encounterWith([]));

        expect(screen.getByText(/nothing to play on this one yet/)).toBeTruthy();
        expect(screen.queryByRole("link", { name: /Start learning|Continue learning/ })).toBeNull();
    });

    it("shows nothing at all before the curriculum has answered", () => {
        // A band with no concept in it would be furniture flashing on every
        // visit to /play.
        const { container } = render(
            <MemoryRouter>
                <PlayFocus path={null} encounter={null} />
            </MemoryRouter>
        );

        expect(container.textContent).toBe("");
    });

    it("shows nothing for a learner who has finished everything reachable", () => {
        const { container } = render(
            <MemoryRouter>
                <PlayFocus path={pathWith(null)} encounter={null} />
            </MemoryRouter>
        );

        expect(container.textContent).toBe("");
    });

    it("names the concept before its content has loaded, without guessing what is left", () => {
        // The encounter arrives after the path. Until it does, no claim is made
        // about the concept's rungs -- "Keep going" would otherwise appear with
        // a made-up count, and the empty-concept note would flash falsely.
        show(pathWith(CURRENT), null);

        expect(
            screen.getByRole("heading", { name: /Running Code and Reading Output/ })
        ).toBeTruthy();
        expect(screen.queryByRole("link", { name: /Start learning|Continue learning/ })).toBeNull();
        expect(screen.queryByText(/nothing to play on this one yet/)).toBeNull();
    });
});
