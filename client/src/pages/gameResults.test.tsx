import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JourneyPathResponse } from "../api/types.js";

/**
 * Every game's results hand the learner back to their next step.
 *
 * UX audit: Flush, Bug Hunt, Reaction and Memory ended in "Play again" and
 * "Pick another Jolt" and nothing else -- no route back to what the learner
 * was learning. Each now ends with the path's next step as the one primary
 * action and the game's own replay beside it. The step comes from
 * /api/curriculum/path through nextAction, so these vary the PATH and check
 * the destination, on all four real pages.
 */
vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {
        detailText = "";
    },
    api: { get: vi.fn(), post: vi.fn() }
}));

vi.mock("../games/useRunContext.js", () => ({
    useRunContext: () => ({ previousBest: null, improvement: null })
}));

const { api } = await import("../api/client.js");
const { FlushResultsPage } = await import("./FlushResultsPage.js");
const { BugHuntResultsPage } = await import("./BugHuntResultsPage.js");
const { ReactionResultsPage } = await import("./ReactionResultsPage.js");
const { MemoryResultsPage } = await import("./MemoryResultsPage.js");

afterEach(() => {
    cleanup();
    vi.mocked(api.get).mockReset();
});

/* Enough of each summary for the page to render; the values are not under test. */
const GAMES: {
    name: string;
    Page: ComponentType;
    route: string;
    sessionPath: string;
    session: unknown;
    replay: { role: "link" | "button"; name: string; href?: string };
    rendered: string;
}[] = [
    {
        name: "Flush",
        Page: FlushResultsPage,
        route: "/flush/results/:id",
        sessionPath: "/api/flush/sessions/7",
        // A steady run (3 of 5): neither tough nor strong, so the generic next-step
        // guarantees below are tested without the run-tone wording (games/runTone.ts).
        session: { score: 300, xpEarned: 30, bestStreak: 1, completedRounds: 3, totalRounds: 5, rounds: [] },
        replay: { role: "link", name: "Play again", href: "/flush" },
        rendered: "300"
    },
    {
        name: "Bug Hunt",
        Page: BugHuntResultsPage,
        route: "/bug-hunt/results/:id",
        sessionPath: "/api/bug-hunt/sessions/7",
        session: {
            score: 410,
            xpEarned: 41,
            bestStreak: 2,
            incidentsResolved: 4,
            totalIncidents: 6,
            firstTryFixes: 3,
            hintsUsed: 1,
            systemIntegrity: 80,
            averageResolutionMs: 20000,
            byCategory: [],
            incidents: []
        },
        replay: { role: "button", name: "Hunt again" },
        rendered: "410"
    },
    {
        name: "Reaction",
        Page: ReactionResultsPage,
        route: "/reaction/results/:id",
        sessionPath: "/api/reaction/sessions/7",
        session: {
            score: 520,
            xpEarned: 52,
            averageReactionMs: 300,
            bestReactionMs: 250,
            reactedRounds: 5,
            totalRounds: 5,
            tier: { key: "quick", label: "Quick" },
            rounds: []
        },
        replay: { role: "link", name: "Play again", href: "/reaction" },
        rendered: "520"
    },
    {
        name: "Memory",
        Page: MemoryResultsPage,
        route: "/memory/results/:id",
        sessionPath: "/api/memory/sessions/7",
        session: {
            score: 630,
            xpEarned: 63,
            bestStreak: 2,
            bestSequenceLength: 5,
            perfectRounds: 3,
            recallAccuracy: 0.9,
            symbolsRemembered: 20,
            totalRounds: 5,
            rounds: []
        },
        replay: { role: "link", name: "Play again", href: "/memory" },
        rendered: "630"
    }
];

const topic = (state: "current" | "locked", challenge: "current" | "locked" | null) => ({
    slug: "values",
    name: "Values and Types",
    principle: "",
    order: 1,
    state,
    concepts: [],
    challenge: challenge ? { state: challenge } : null
});

const CONCEPT_NEXT: JourneyPathResponse = {
    topics: [topic("current", "locked")],
    current: {
        slug: "reading-variables",
        name: "Reading Variables",
        objective: "",
        state: "current",
        neededRetry: false,
        rungs: { cleared: 0, playable: 3 },
        topic: "values"
    },
    points: { total: 0, concepts: 0, challenges: 0 }
} as JourneyPathResponse;

const CHECKPOINT_NEXT = {
    topics: [topic("current", "current")],
    current: null,
    points: { total: 0, concepts: 0, challenges: 0 }
} as unknown as JourneyPathResponse;

const NOTHING_LEFT = {
    topics: [{ ...topic("current", null), state: "complete" }],
    current: null,
    points: { total: 0, concepts: 0, challenges: 0 }
} as unknown as JourneyPathResponse;

/** Answers the game's own results request, and the path however the case needs. */
function open(game: (typeof GAMES)[number], path: JourneyPathResponse | "fails" | "pending") {
    vi.mocked(api.get).mockImplementation(((url: string) => {
        if (url === game.sessionPath) return Promise.resolve({ session: game.session });
        if (url === "/api/curriculum/path") {
            if (path === "fails") return Promise.reject(new Error("offline"));
            if (path === "pending") return new Promise(() => undefined);
            return Promise.resolve(path);
        }
        return Promise.reject(new Error(`unexpected ${url}`));
    }) as never);

    const { Page } = game;

    return render(
        <MemoryRouter initialEntries={[game.sessionPath.replace(/^\/api\/([a-z-]+)\/sessions\//, "/$1/results/")]}>
            <Routes>
                <Route path={game.route} element={<Page />} />
            </Routes>
        </MemoryRouter>
    );
}

const primaries = (container: HTMLElement) =>
    [...container.querySelectorAll(".button.primary")].map((el) => ({
        text: el.textContent,
        href: el.getAttribute("href")
    }));

const replayOf = (game: (typeof GAMES)[number]) => screen.getByRole(game.replay.role, { name: game.replay.name });

describe.each(GAMES)("$name results", (game) => {
    it("leads back to the concept the learner is on", async () => {
        const { container } = open(game, CONCEPT_NEXT);

        await screen.findByRole("link", { name: "Continue: Reading Variables" });

        expect(primaries(container)).toEqual([{ text: "Continue: Reading Variables", href: "/concept/reading-variables" }]);
    });

    it("puts the next step right under the outcome, ahead of the stats and logs", async () => {
        const { container } = open(game, CONCEPT_NEXT);
        const next = await screen.findByRole("link", { name: "Continue: Reading Variables" });

        // Every stats block and log on the page comes after the decision.
        const details = [...container.querySelectorAll("dl, ol")];
        expect(details.length).toBeGreaterThan(0);
        for (const el of details) {
            expect(next.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        }
    });

    it("leads to the checkpoint when that is what is due", async () => {
        const { container } = open(game, CHECKPOINT_NEXT);

        await screen.findByRole("link", { name: "Take the Values and Types checkpoint" });

        expect(primaries(container)).toEqual([
            { text: "Take the Values and Types checkpoint", href: "/challenge/values" }
        ]);
    });

    it("goes back to the journey when nothing is left on the path", async () => {
        const { container } = open(game, NOTHING_LEFT);

        await screen.findByRole("link", { name: "See your journey" });

        expect(primaries(container)).toEqual([{ text: "See your journey", href: "/journey" }]);
    });

    it("keeps the replay, as a secondary action, distinct from the next step", async () => {
        open(game, CONCEPT_NEXT);

        await screen.findByRole("link", { name: "Continue: Reading Variables" });

        const replay = replayOf(game);
        expect(replay.className).toMatch(/ghost/);
        expect(replay.className).not.toMatch(/primary/);
        if (game.replay.href) expect(replay.getAttribute("href")).toBe(game.replay.href);
        // The old second way out, to the same place as the nav's "Play".
        expect(screen.queryByRole("link", { name: /pick another jolt|back to jolt/i })).toBeNull();
    });

    it("guesses nothing when the path cannot be loaded, and keeps playing again usable", async () => {
        const { container } = open(game, "fails");

        expect(await screen.findByText(/your next step in the course could not be loaded/i)).toBeTruthy();

        // No invented destination: the only primary is the game's own replay.
        await waitFor(() => expect(primaries(container).map((p) => p.text)).toEqual([game.replay.name]));
        expect(replayOf(game)).toBeTruthy();
        expect(container.querySelector("a[href^='/concept/'], a[href^='/challenge/']")).toBeNull();
    });

    it("shows only the replay while the path is still loading, so the primary never swaps", async () => {
        const { container } = open(game, "pending");

        await screen.findByText(game.rendered);
        await act(async () => undefined);

        expect(primaries(container)).toEqual([]);
        expect(replayOf(game)).toBeTruthy();
    });

    it("claims no course credit for the game", async () => {
        const { container } = open(game, CONCEPT_NEXT);

        await screen.findByRole("link", { name: "Continue: Reading Variables" });

        expect(container.textContent).not.toMatch(/stops? (cleared|done)|demonstrat|completed? (the|this) concept|counts? toward/i);
    });
});

describe("a short Flush game's results", () => {
    it("states the target for the puzzles actually dealt, not a five-round game", async () => {
        const flush = GAMES.find((g) => g.name === "Flush")!;
        open(
            {
                ...flush,
                session: {
                    score: 60, xpEarned: 20, bestStreak: 1, completedRounds: 1, totalRounds: 3,
                    rounds: [
                        { roundNumber: 1, prompt: "a", status: "completed", correctPlacements: 2, totalOutputs: 2, pointsAwarded: 60 },
                        { roundNumber: 2, prompt: "b", status: "failed", correctPlacements: 0, totalOutputs: 3, pointsAwarded: 0 },
                        { roundNumber: 3, prompt: "c", status: "failed", correctPlacements: 0, totalOutputs: 2, pointsAwarded: 0 }
                    ]
                }
            },
            CONCEPT_NEXT
        );

        // 10*2*3 + 10*3*4 + 10*2*3 = 60 + 120 + 60
        expect(await screen.findByText("A perfect run of these puzzles is worth 240.")).toBeTruthy();
    });

    it("says 'all 3' when every round of a three-round game is flushed", async () => {
        const flush = GAMES.find((g) => g.name === "Flush")!;
        const round = (n: number) => ({ roundNumber: n, prompt: "p", status: "completed", correctPlacements: 2, totalOutputs: 2, pointsAwarded: 60 });
        open(
            { ...flush, session: { score: 180, xpEarned: 30, bestStreak: 3, completedRounds: 3, totalRounds: 3, rounds: [round(1), round(2), round(3)] } },
            CONCEPT_NEXT
        );

        expect(await screen.findByText("Every round flushed: the maximum multiplier on all 3.")).toBeTruthy();
    });
});

