import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.js";
import { AuthProvider } from "../auth/AuthContext.js";
import { setSoundEnabled } from "../games/sound.js";
import { setTheme } from "../games/theme.js";
import { markTutorialSeen } from "../games/tutorial.js";

/**
 * Profile: the account, the existing numbers, and the per-device settings in
 * one place. The real App and router run; only fetch is stubbed, and every
 * request is recorded so the tests can say what Profile never sends.
 */

configure({ asyncUtilTimeout: 5000 });

const USER = { id: "1", email: "player@jolt.test", username: "player", createdAt: "2026-09-01T12:00:00Z" };

const STATS = {
    totals: { gamesCompleted: 3, totalXp: 275, totalScore: 900 },
    perGame: [
        { game: { slug: "code-blitz", name: "Code Blitz" }, gamesCompleted: 2, bestScore: 640, accuracy: 0.8, improvement: null },
        { game: { slug: "memory", name: "Memory" }, gamesCompleted: 0, bestScore: null, accuracy: null, improvement: null }
    ]
};

type Call = { path: string; method: string };

function stubApi({ statsFail = false } = {}) {
    const calls: Call[] = [];
    const state = { signedIn: true };
    const json = (status: number, body: unknown) =>
        Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response);

    vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
        const path = String(input);
        const method = init?.method ?? "GET";
        calls.push({ path, method });

        if (path === "/api/auth/logout" && method === "POST") {
            state.signedIn = false;
            return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve(null) } as Response);
        }
        if (!state.signedIn) return json(401, { error: "Unauthorized" });
        if (path === "/api/users/me") return json(200, { user: USER });
        if (path.startsWith("/api/users/me/stats")) {
            return statsFail ? json(500, { error: "Internal Server Error" }) : json(200, STATS);
        }
        if (path === "/api/me/sessions/resumable") return json(200, { sessions: [] });
        return json(404, { error: "Not Found" });
    });

    return { calls, writes: () => calls.filter((c) => c.method !== "GET") };
}

function renderAt(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <AuthProvider>
                <App />
            </AuthProvider>
        </MemoryRouter>
    );
}

const page = () => document.querySelector(".profile") as HTMLElement;

beforeEach(() => {
    window.localStorage.clear();
    setTheme("cream");
    setSoundEnabled(true);
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("the Profile page", () => {
    it("shows the account and the existing numbers, with XP framed as play", async () => {
        stubApi();
        renderAt("/profile");

        await screen.findByRole("heading", { level: 1, name: "Profile" });
        const profile = page();
        expect(within(profile).getByText(USER.email)).toBeTruthy();
        expect(within(profile).getByText(USER.username)).toBeTruthy();

        await within(profile).findByText("275");
        expect(within(profile).getByText("3")).toBeTruthy();
        // Only games actually played are listed.
        const byGame = within(profile).getByRole("list", { name: "By game" });
        expect(within(byGame).getByText("Code Blitz")).toBeTruthy();
        expect(within(byGame).queryByText("Memory")).toBeNull();
        expect(within(byGame).getByText(/2 finished, best 640/)).toBeTruthy();

        expect(within(profile).getByRole("link", { name: "your Skills" }).getAttribute("href")).toBe("/skills");
    });

    it("links to the game log and the tutorial replay", async () => {
        stubApi();
        renderAt("/profile");

        const profile = await screen.findByRole("heading", { level: 1, name: "Profile" }).then(page);
        expect(within(profile).getByRole("link", { name: /your game log/i }).getAttribute("href")).toBe("/history");
        expect(within(profile).getByRole("link", { name: /replay the tutorial/i }).getAttribute("href")).toBe(
            "/learn/console-output?replay=1"
        );
    });

    it("says so, and offers a retry, when the numbers fail to load", async () => {
        stubApi({ statsFail: true });
        renderAt("/profile");

        expect(await screen.findByText(/your numbers did not load/i)).toBeTruthy();
        expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    });
});

describe("Profile's settings are the existing per-device preferences", () => {
    it("switches the theme, on the page and in storage, without a request", async () => {
        const api = stubApi();
        renderAt("/profile");

        const dark = await screen.findByRole("radio", { name: "Dark (dusk)" });
        expect((screen.getByRole("radio", { name: "Light (cream)" }) as HTMLInputElement).checked).toBe(true);

        fireEvent.click(dark);

        expect(document.documentElement.dataset.theme).toBe("dusk");
        expect(window.localStorage.getItem("jolt.theme")).toBe("dusk");
        expect((dark as HTMLInputElement).checked).toBe(true);
        expect(api.writes()).toEqual([]);
    });

    it("turns sound effects off and on", async () => {
        const api = stubApi();
        renderAt("/profile");

        const sound = (await screen.findByRole("checkbox", { name: "Sound effects" })) as HTMLInputElement;
        expect(sound.checked).toBe(true);

        fireEvent.click(sound);
        expect(sound.checked).toBe(false);
        expect(window.localStorage.getItem("jolt.sound")).toBe("off");

        fireEvent.click(sound);
        expect(window.localStorage.getItem("jolt.sound")).toBe("on");
        expect(api.writes()).toEqual([]);
    });

    it("sets the default pace the game intros read", async () => {
        const api = stubApi();
        renderAt("/profile");

        const clock = (await screen.findByRole("checkbox", { name: /start code blitz, flush and bug hunt with the clock/i })) as HTMLInputElement;
        // Relaxed is the default, as on every game intro.
        expect(clock.checked).toBe(false);
        expect(screen.getByText(/games start relaxed/i)).toBeTruthy();

        fireEvent.click(clock);
        expect(clock.checked).toBe(true);
        expect(window.localStorage.getItem("jolt.pace")).toBe("timed");
        expect(screen.getByText(/games start timed/i)).toBeTruthy();
        expect(api.writes()).toEqual([]);
    });

    it("shows a stored timed pace as on", async () => {
        window.localStorage.setItem("jolt.pace", "timed");
        stubApi();
        renderAt("/profile");

        const clock = (await screen.findByRole("checkbox", { name: /with the clock/i })) as HTMLInputElement;
        expect(clock.checked).toBe(true);
    });
});

describe("replaying the tutorial", () => {
    it("opens the tutorial without recording, resetting or clearing anything", async () => {
        markTutorialSeen("console-output");
        window.localStorage.setItem("jolt.pace", "timed");
        const before = { ...window.localStorage };
        const api = stubApi();
        renderAt("/profile");

        fireEvent.click(await screen.findByRole("link", { name: /replay the tutorial/i }));

        expect(await screen.findByText("You don't need to know JavaScript yet.")).toBeTruthy();
        expect(api.writes(), "a replay sends nothing to the server").toEqual([]);
        expect({ ...window.localStorage }, "and changes nothing stored on the device").toEqual(before);
    });
});

describe("logging out from Profile", () => {
    it("sends the logout and leaves the signed-in pages", async () => {
        const api = stubApi();
        renderAt("/profile");

        const profile = await screen.findByRole("heading", { level: 1, name: "Profile" }).then(page);
        fireEvent.click(within(profile).getByRole("button", { name: "Log out" }));

        await waitFor(() => expect(screen.queryByRole("heading", { level: 1, name: "Profile" })).toBeNull());
        expect(api.writes()).toEqual([{ path: "/api/auth/logout", method: "POST" }]);
        expect(await screen.findByRole("link", { name: "Log in" })).toBeTruthy();
    });
});
