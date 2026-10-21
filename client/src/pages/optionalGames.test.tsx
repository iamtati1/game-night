import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Reaction and Memory say, where they start, that they are not course work.
 *
 * Final learner audit: /play labels the games as optional practice, but each of
 * these two opened with no word about the course -- and they record XP and no
 * learning evidence at all, so a learner could reasonably think they were
 * required steps.
 */
vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {},
    api: { get: vi.fn(async () => ({ sessions: [] })), post: vi.fn() }
}));

const { ReactionPage } = await import("./ReactionPage.js");
const { MemoryPage } = await import("./MemoryPage.js");

afterEach(cleanup);

// Worded once, in GameIntro, for every game that does not count.
const LINE = "Just for fun · doesn’t count toward your course";

describe.each([
    ["Reaction", ReactionPage, "/reaction"],
    ["Memory", MemoryPage, "/memory"]
] as const)("%s's start screen", (name, Page, route) => {
    it("says it is optional and outside the course", async () => {
        render(
            <MemoryRouter initialEntries={[route]}>
                <Page />
            </MemoryRouter>
        );

        // The existing description is still there; the line is part of it.
        const lede = (await screen.findByRole("button", { name: `Start ${name}` })).closest("section")!;
        expect(lede.textContent).toContain(LINE);
    });
});

describe.each([
    ["Reaction", ReactionPage, "/reaction"],
    ["Memory", MemoryPage, "/memory"]
] as const)("%s's start screen, on the shared intro", (name, Page, route) => {
    it("uses the same intro as the other games, keeping its own picture of the mechanic", async () => {
        const { container } = render(
            <MemoryRouter initialEntries={[route]}>
                <Page />
            </MemoryRouter>
        );

        const start = await screen.findByRole("button", { name: `Start ${name}` });
        const intro = start.closest(".game-intro")!;
        expect(intro).not.toBeNull();
        expect(intro.querySelector("h1")).not.toBeNull();
        // The decoration stays, hidden from assistive technology as before.
        expect(intro.querySelector(".game-intro-preview")?.getAttribute("aria-hidden")).toBe("true");
        // The accent wrapper is kept.
        expect(container.querySelector(`.game.${name.toLowerCase()} .game-intro`)).not.toBeNull();
    });
});

