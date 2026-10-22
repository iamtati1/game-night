import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

const FLUSH_NOT_READY = { ready: false, eligible: 1, needed: 3, full: 5, message: "Flush needs at least 3 puzzles…" };
const HUNT_READY = { ready: true, eligible: 4, needed: 3, full: 6, reason: null, reachable: null, practice: null, message: null };

function open(readiness: { flush?: unknown; bugHunt?: unknown } = { flush: FLUSH_NOT_READY, bugHunt: HUNT_READY }) {
    vi.mocked(api.get).mockImplementation(((url: string) => {
        if (url === "/api/flush/readiness") return readiness.flush ? Promise.resolve(readiness.flush) : Promise.reject(new Error("down"));
        if (url === "/api/bug-hunt/readiness") return readiness.bugHunt ? Promise.resolve(readiness.bugHunt) : Promise.reject(new Error("down"));
        if (url === "/api/me/sessions/resumable") return Promise.resolve({ sessions: [] });
        if (url === "/api/users/me/stats") return Promise.resolve({ totals: { gamesCompleted: 0, totalXp: 0, totalScore: 0 } });
        if (url === "/api/curriculum/path") return Promise.resolve(PATH);
        return Promise.reject(new Error(`unexpected ${url}`));
    }) as never);

    return render(
        <MemoryRouter initialEntries={["/play"]}>
            <LandingPage />
        </MemoryRouter>
    );
}

describe("/play", () => {
    it("has exactly one primary action: the selected island's", async () => {
        const { container } = open();
        await screen.findByRole("link", { name: "Start learning" });

        // Code Blitz is recommended, so it is selected and its Play is the one
        // primary; the course's mission sits below with a quieter button.
        const primaries = [...container.querySelectorAll(".button.primary")];
        expect(primaries.map((a) => [a.getAttribute("aria-label"), a.getAttribute("href")])).toEqual([
            ["Play Code Blitz", "/code-blitz"]
        ]);
        expect(screen.getByRole("link", { name: "Start learning" }).getAttribute("href")).toBe("/learn/console-output");
    });

    it("is headed Games, and the islands are named Games", async () => {
        open();

        expect(await screen.findByRole("heading", { level: 1, name: "Games" })).toBeTruthy();
        expect(screen.getByText(/none is required/i)).toBeTruthy();
        expect(screen.getByRole("list", { name: "Games" })).toBeTruthy();
    });

    it("puts the five islands before the mission panel", async () => {
        const { container } = open();
        await screen.findByRole("link", { name: "Start learning" });

        const sea = container.querySelector(".islands")!;
        const focus = container.querySelector(".mission-panel")!;
        expect(sea.compareDocumentPosition(focus) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("keeps all five games one choice away, each opening to its own page", async () => {
        open();
        const sea = await screen.findByRole("list", { name: "Games" });
        await screen.findByText(/In the mist/);

        const expected: [string, string, string][] = [
            ["Code Blitz", "Play Code Blitz", "/code-blitz"],
            ["Flush", "Flush: how to open", "/flush"],
            ["Bug Hunt", "Play Bug Hunt", "/bug-hunt"],
            ["Reaction", "Play Reaction", "/reaction"],
            ["Memory", "Play Memory", "/memory"]
        ];
        expect(within(sea).getAllByRole("button")).toHaveLength(5);

        for (const [name, label, href] of expected) {
            fireEvent.click(within(sea).getByRole("button", { name: new RegExp(name) }));
            expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(href);
        }
    });

    it("never presents Reaction or Memory as counting toward the course -- or as locked", async () => {
        const { container } = open();
        const sea = await screen.findByRole("list", { name: "Games" });
        await screen.findByText(/In the mist/);

        for (const name of ["Reaction", "Memory"]) {
            fireEvent.click(within(sea).getByRole("button", { name: new RegExp(name) }));
            const panel = container.querySelector(".island-panel")!;
            expect(panel.textContent).toMatch(/Ready to play\..*Just for fun: doesn’t count toward your course\./);
            expect(panel.textContent).not.toMatch(/how to open|opens at|Recommended/i);
        }
        expect(container.querySelector(".mission-panel")?.textContent).not.toMatch(/Reaction|Memory/);
    });

    it("says on each island whether it can be played now, from the server's readiness", async () => {
        const { container } = open();
        const sea = await screen.findByRole("list", { name: "Games" });
        await screen.findByText(/In the mist/);

        // Flush is not ready in this fixture: misted, labelled in words, still open to explain.
        const flush = within(sea).getByRole("button", { name: /Flush/ });
        expect(flush.textContent).toMatch(/In the mist: not open yet/);
        fireEvent.click(flush);
        const panel = () => container.querySelector(".island-panel")!.textContent;
        expect(panel()).toMatch(/Opens at 3 puzzles on ideas you’ve learned \(1 so far\)/);
        expect(panel()).toMatch(/Counts toward your journey\./);

        fireEvent.click(within(sea).getByRole("button", { name: /Bug Hunt/ }));
        expect(panel()).toMatch(/Ready: a short run of 4 bugs\./);

        fireEvent.click(within(sea).getByRole("button", { name: /Code Blitz/ }));
        expect(panel()).toMatch(/Ready to play\..*Counts toward your journey/);
    });

    it("recommends the game that practises the current lesson, and says why", async () => {
        open();
        const sea = await screen.findByRole("list", { name: "Games" });

        const blitz = within(sea).getByRole("button", { name: /Code Blitz/ });
        expect(blitz.textContent).toMatch(/Recommended/);
        expect(blitz.getAttribute("aria-pressed")).toBe("true");
        expect(screen.getByText(/Recommended: practises what you are learning now/)).toBeTruthy();
        expect(within(sea).getAllByText("Recommended")).toHaveLength(1);
    });

    it("says nothing about a gated game whose readiness could not load, rather than guess", async () => {
        const { container } = open({ flush: null, bugHunt: null });
        const sea = await screen.findByRole("list", { name: "Games" });
        await screen.findByRole("link", { name: "Start learning" });

        fireEvent.click(within(sea).getByRole("button", { name: /Flush/ }));
        expect(container.querySelector(".island-panel-status")).toBeNull();
        expect(within(sea).getByRole("button", { name: /Flush/ }).textContent).not.toMatch(/mist|Open/);

        fireEvent.click(within(sea).getByRole("button", { name: /Memory/ }));
        expect(container.querySelector(".island-panel-status")).not.toBeNull();
    });
});
