import { cleanup, configure, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App.js";
import { AuthProvider } from "./AuthContext.js";

/**
 * Four places -- Home, Games, Skills, Profile -- in the header on a wide screen
 * and in a bottom bar on a phone. Which one is displayed is CSS (world.css,
 * 40rem); jsdom applies none, so both are in the DOM here and each is checked
 * on its own terms.
 */

configure({ asyncUtilTimeout: 5000 });

const USER = { id: "1", email: "player@jolt.test", username: "player" };

function stubApi(signedIn: boolean) {
    const json = (status: number, body: unknown) =>
        Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response);

    vi.stubGlobal("fetch", (input: string) => {
        const path = String(input);
        if (!signedIn) return json(401, { error: "Unauthorized" });
        if (path === "/api/users/me") return json(200, { user: USER });
        if (path === "/api/me/sessions/resumable") return json(200, { sessions: [] });
        if (path.startsWith("/api/users/me/stats")) {
            return json(200, { totals: { gamesCompleted: 0, totalXp: 0, totalScore: 0 } });
        }
        return json(404, { error: "Not Found" });
    });
}

function renderAt(path: string, signedIn = true) {
    stubApi(signedIn);
    return render(
        <MemoryRouter initialEntries={[path]}>
            <AuthProvider>
                <App />
            </AuthProvider>
        </MemoryRouter>
    );
}

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const PLACES = ["Home", "Games", "Skills", "Profile"];
const HREFS = ["/", "/play", "/skills", "/profile"];

describe("navigation", () => {
    it("puts the four places in the header, in order", async () => {
        const { container } = renderAt("/play");
        await screen.findByRole("button", { name: /log out/i });

        const primary = container.querySelector(".site-header .nav-primary")!;
        const links = within(primary as HTMLElement).getAllByRole("link");
        expect(links.map((a) => a.getAttribute("aria-label"))).toEqual(PLACES);
        expect(links.map((a) => a.getAttribute("href"))).toEqual(HREFS);
    });

    it("keeps Experiment one click away, beside the account", async () => {
        const { container } = renderAt("/play");
        await screen.findByRole("button", { name: /log out/i });

        const pilot = container.querySelector(".nav-pilot") as HTMLElement;
        expect(within(pilot).getByRole("link", { name: "Experiment" }).getAttribute("href")).toBe("/experiment");
    });

    it("moves theme, sound and the Log off a signed-in header and onto Profile", async () => {
        const { container } = renderAt("/play");
        await screen.findByRole("button", { name: /log out/i });

        const header = container.querySelector(".site-header") as HTMLElement;
        expect(within(header).queryByRole("button", { name: "Dark theme" })).toBeNull();
        expect(within(header).queryByRole("button", { name: "Sound effects" })).toBeNull();
        expect(within(header).queryByRole("link", { name: "Log" })).toBeNull();
    });

    it("keeps theme and sound in the header for a signed-out visitor, who has no Profile", async () => {
        renderAt("/play", false);
        await screen.findByRole("link", { name: "Log in" });

        expect(screen.getByRole("button", { name: "Dark theme" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Sound effects" })).toBeTruthy();
    });

    it("offers the same four places in the phone's bottom bar", async () => {
        renderAt("/play");
        const bar = await screen.findByRole("navigation", { name: "Main" });

        const links = within(bar).getAllByRole("link");
        expect(links.map((a) => a.textContent)).toEqual(PLACES);
        expect(links.map((a) => a.getAttribute("href"))).toEqual(HREFS);
    });

    it.each([
        ["/play", "Games"],
        ["/skills", "Skills"],
        ["/", "Home"],
        ["/journey", "Home"],
        ["/concept/console-output", "Home"],
        ["/profile", "Profile"],
        ["/history", "Profile"]
    ])("marks the place you are in on %s, in both bars", async (path, place) => {
        const { container } = renderAt(path);
        const bar = await screen.findByRole("navigation", { name: "Main" });

        const header = container.querySelector(".nav-primary") as HTMLElement;
        const marked = (root: HTMLElement) =>
            within(root)
                .getAllByRole("link")
                .filter((a) => a.getAttribute("aria-current") === "page")
                .map((a) => a.getAttribute("aria-label") ?? a.textContent);

        expect(marked(header)).toEqual([place]);
        expect(marked(bar)).toEqual([place]);
    });

    it("shows no bottom bar to a signed-out visitor", async () => {
        renderAt("/play", false);
        await screen.findByRole("link", { name: "Log in" });

        expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    });
});
