import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * /play is the Games page: its name as the heading, the five games first, and
 * on each card whether it can be played now and whether it counts.
 *
 * Earlier UX audit, still held: one primary action (the course), all five games
 * there, and no course-credit claim for Reaction or Memory, which record XP and
 * nothing else. Slice 3 moved the games above the course block, so a phone
 * reaches the first game without scrolling past a lesson, and gave each card a
 * status read from the gated games' own readiness answers.
 */
vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {},
    api: { get: vi.fn() }
}));

vi.mock("../auth/AuthContext.js", () => ({
    useAuth: () => ({ user: { id: "9", username: "qa", email: "qa@jolt.test" }, loading: false })
}));

const { api } = await import("../api/client.js");
const { LandingPage } = await import("./LandingPage.js");

afterEach(() => {
    cleanup();
    vi.mocked(api.get).mockReset();
});

const PATH = {
    topics: [
        { slug: "values", name: "Values and Types", principle: "", order: 1, state: "current", concepts: [], challenge: null }
    ],
    current: {
        slug: "console-output",
        name: "Running Code and Reading Output",
        objective: "",
        state: "current",
        neededRetry: false,
        rungs: { cleared: 0, playable: 2 },
        topic: "values"
    },
    points: { total: 0, concepts: 0, challenges: 0 }
};

const ENCOUNTER = {
    conceptSlug: "console-output",
    name: "Running Code and Reading Output",
    rungs: [{ demandSlug: "recognise", demandOrder: 1, cleared: false, options: [{ challengeId: "1", difficulty: 1, content: { kind: "question", id: "1" } }] }]
};

const FLUSH_NOT_READY = { ready: false, eligible: 1, needed: 3, full: 5, message: "Flush needs at least 3 puzzles…" };
const HUNT_READY = { ready: true, eligible: 4, needed: 3, full: 6, reason: null, reachable: null, practice: null, message: null };

function open(readiness: { flush?: unknown; bugHunt?: unknown } = { flush: FLUSH_NOT_READY, bugHunt: HUNT_READY }) {
    vi.mocked(api.get).mockImplementation(((url: string) => {
        if (url === "/api/flush/readiness") return readiness.flush ? Promise.resolve(readiness.flush) : Promise.reject(new Error("down"));
        if (url === "/api/bug-hunt/readiness") return readiness.bugHunt ? Promise.resolve(readiness.bugHunt) : Promise.reject(new Error("down"));
        if (url === "/api/me/sessions/resumable") return Promise.resolve({ sessions: [] });
        if (url === "/api/users/me/stats") return Promise.resolve({ totals: { gamesCompleted: 0, totalXp: 0, totalScore: 0 } });
        if (url === "/api/curriculum/path") return Promise.resolve(PATH);
        if (url === "/api/curriculum/concepts/console-output/encounter") return Promise.resolve(ENCOUNTER);
        return Promise.reject(new Error(`unexpected ${url}`));
    }) as never);

    return render(
        <MemoryRouter initialEntries={["/play"]}>
            <LandingPage />
        </MemoryRouter>
    );
}

describe("/play", () => {
    it("has exactly one primary action, and it continues the course", async () => {
        const { container } = open();

        await screen.findByRole("link", { name: "Start learning" });

        const primaries = [...container.querySelectorAll(".button.primary")];
        expect(primaries.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
            ["Start learning", "/concept/console-output"]
        ]);
    });

    it("is headed Games, and the grid is named by that heading", async () => {
        open();

        expect(await screen.findByRole("heading", { level: 1, name: "Games" })).toBeTruthy();
        expect(screen.getByText(/none of these is required/i)).toBeTruthy();
        expect(screen.getByRole("list", { name: "Games" })).toBeTruthy();
    });

    it("puts the five games before the course block", async () => {
        const { container } = open();
        await screen.findByRole("link", { name: "Start learning" });

        const grid = container.querySelector(".game-grid")!;
        const focus = container.querySelector(".play-focus")!;
        expect(grid.compareDocumentPosition(focus) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("keeps all five games directly available", async () => {
        open();

        const grid = await screen.findByRole("list", { name: "Games" });
        // Flush is not ready in this fixture, so its card says how to open it
        // -- still a link, to the page that explains.
        await within(grid).findByRole("link", { name: "Flush: how to open" });
        const games = within(grid)
            .getAllByRole("link")
            .map((a) => [a.getAttribute("aria-label"), a.getAttribute("href")]);

        expect(games).toEqual(expect.arrayContaining([
            ["Play Code Blitz", "/code-blitz"],
            ["Flush: how to open", "/flush"],
            ["Play Bug Hunt", "/bug-hunt"],
            ["Play Reaction", "/reaction"],
            ["Play Memory", "/memory"]
        ]));
        expect(games).toHaveLength(5);
    });

    it("never presents Reaction or Memory as counting toward the course -- or as locked", async () => {
        const { container } = open();
        await screen.findByRole("link", { name: "Flush: how to open" });

        for (const name of ["Reaction", "Memory"]) {
            const card = screen.getByRole("link", { name: `Play ${name}` });
            expect(card.textContent).toMatch(/Ready to play\..*Just for fun: doesn’t count toward your course\./);
            expect(card.textContent).not.toMatch(/how to open|opens at/i);
        }
        expect(container.querySelector(".play-focus")?.textContent).not.toMatch(/Reaction|Memory/);
    });

    it("says on each card whether it can be played now, from the server's readiness", async () => {
        open();

        const flush = await screen.findByRole("link", { name: "Flush: how to open" });
        expect(flush.textContent).toMatch(/Opens at 3 puzzles on ideas you’ve learned \(1 so far\)/);
        expect(flush.textContent).toMatch(/Counts toward your journey\./);

        const hunt = screen.getByRole("link", { name: "Play Bug Hunt" });
        expect(hunt.textContent).toMatch(/Ready: a short run of 4 bugs\./);

        expect(screen.getByRole("link", { name: "Play Code Blitz" }).textContent).toMatch(/Ready to play\..*Counts toward your journey/);
    });

    it("says nothing about a gated game whose readiness could not load, rather than guess", async () => {
        open({ flush: null, bugHunt: null });
        await screen.findByRole("link", { name: "Start learning" });

        expect(screen.getByRole("link", { name: "Play Flush" }).querySelector(".card-status")).toBeNull();
        expect(screen.getByRole("link", { name: "Play Bug Hunt" }).querySelector(".card-status")).toBeNull();
        expect(screen.getByRole("link", { name: "Play Memory" }).querySelector(".card-status")).not.toBeNull();
    });
});
