import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.js";
import { AuthProvider } from "./AuthContext.js";

/**
 * These render the real main page -- App, Header, LandingPage and the game cards
 * together -- rather than the Header alone.
 *
 * The bug this file exists to catch was invisible to a Header-only test and to
 * every server test: POST /api/auth/logout returned 204, the session really was
 * destroyed, and auth state really did become null. What went wrong was the
 * render. The whole <nav> was gated on `user`, so signing out deleted the
 * navigation instead of swapping it, and the page kept its masthead and its four
 * game cards. Nothing about that is observable below the UI layer.
 */

// waitFor defaults to one second. Every wait here is for a state update that
// resolves in milliseconds, so a timeout means a real failure -- but on a loaded
// machine the default is close enough to the render cost to flake. Raised so a
// slow run reports the truth instead of a false negative.
configure({ asyncUtilTimeout: 5000 });

const USER = { id: "1", email: "player@jolt.test", username: "player" };

/** A stand-in API whose auth state can be flipped, so a logout is observable. */
function fakeApi({ signedIn = true, logoutStatus = 204 } = {}) {
    const state = { signedIn, logoutCalls: 0 };

    const json = (status: number, body: unknown) =>
        Promise.resolve({
            ok: status < 400,
            status,
            json: () => Promise.resolve(body)
        } as Response);

    const unauthorized = () => json(401, { error: "Unauthorized" });

    vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
        const path = String(input);

        if (path === "/api/auth/logout" && init?.method === "POST") {
            state.logoutCalls += 1;

            if (logoutStatus >= 400) {
                return json(logoutStatus, { error: "Internal Server Error" });
            }

            // The server destroyed the session, so every later call is anonymous.
            state.signedIn = false;
            return json(204, null);
        }

        if (!state.signedIn) return unauthorized();

        if (path === "/api/users/me") return json(200, { user: USER });
        if (path === "/api/me/sessions/resumable") return json(200, { sessions: [] });
        if (path.startsWith("/api/users/me/stats")) {
            return json(200, { totals: { gamesCompleted: 4, totalXp: 200, totalScore: 900 } });
        }
        if (path.startsWith("/api/users/me/sessions")) return json(200, { sessions: [], total: 0 });

        return json(404, { error: "Not Found" });
    });

    return state;
}

const renderHub = () =>
    render(
        <MemoryRouter initialEntries={["/"]}>
            <AuthProvider>
                <App />
            </AuthProvider>
        </MemoryRouter>
    );

/** The header's logged-in marker. Deliberately the username and the button, not
 *  the absence of something -- an empty header would pass a negative assertion. */
const signedInChrome = () => ({
    username: screen.queryByText(USER.username),
    logout: screen.queryByRole("button", { name: /log out/i })
});

const signedOutChrome = () => ({
    login: screen.queryByRole("link", { name: /^log in$/i }),
    register: screen.queryByRole("link", { name: /create account/i })
});

const gameCards = () =>
    ["Code Blitz", "Flush", "Reaction", "Memory"].map((name) => screen.queryByText(name));

beforeEach(() => {
    vi.unstubAllGlobals();
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("the main game-card page reflects auth state", () => {
    it("shows the signed-in header and the game hub", async () => {
        fakeApi({ signedIn: true });
        renderHub();

        await waitFor(() => expect(signedInChrome().logout).not.toBeNull());

        expect(signedInChrome().username).not.toBeNull();
        expect(signedOutChrome().login).toBeNull();
        expect(gameCards().every((card) => card !== null)).toBe(true);
    });

    it("shows the signed-out header and STILL shows the game hub", async () => {
        // Jolt is a game platform, not an auth demo: signing out must not take the
        // game discovery experience away with it.
        fakeApi({ signedIn: false });
        renderHub();

        await waitFor(() => expect(signedOutChrome().login).not.toBeNull());

        expect(signedOutChrome().register).not.toBeNull();
        expect(signedInChrome().logout).toBeNull();
        expect(gameCards().every((card) => card !== null)).toBe(true);
    });
});

describe("logging out from the game-card page", () => {
    it("swaps the header to Log in / Create account and keeps the games", async () => {
        // THE regression. Before the fix this failed on the two link assertions:
        // the nav was removed outright, so the page kept its masthead and cards
        // and the only visible change was the header going blank -- which is why
        // it read as "nothing happened".
        const api = fakeApi({ signedIn: true });
        renderHub();

        await waitFor(() => expect(signedInChrome().logout).not.toBeNull());

        fireEvent.click(screen.getByRole("button", { name: /log out/i }));

        await waitFor(() => expect(signedOutChrome().login).not.toBeNull());

        expect(api.logoutCalls, "the request must actually be sent").toBe(1);
        expect(signedOutChrome().register).not.toBeNull();
        expect(signedInChrome().logout).toBeNull();
        expect(signedInChrome().username).toBeNull();

        // The hub survives the logout.
        expect(gameCards().every((card) => card !== null)).toBe(true);
    });

    it("drops the signed-in stats line", async () => {
        // Stats are the player's own numbers. Leaving them on screen would be the
        // page still behaving as though it knew who was looking at it.
        const api = fakeApi({ signedIn: true });
        renderHub();

        await waitFor(() => expect(screen.queryByText(/200/)).not.toBeNull());

        fireEvent.click(screen.getByRole("button", { name: /log out/i }));

        await waitFor(() => expect(signedOutChrome().login).not.toBeNull());
        expect(api.logoutCalls).toBe(1);

        // Waited for, not asserted immediately. The header swaps as soon as
        // `user` becomes null, but LandingPage clears its own stats in an effect
        // that runs after that render commits -- so there is a real tick where
        // the signed-out nav and the old stats coexist. Asserting on the same
        // tick was passing by timing, not by behaviour.
        await waitFor(() => expect(screen.queryByText(/200/)).toBeNull());
    });

    it("stays signed out when the page is reloaded", async () => {
        // A refresh is a fresh mount asking /me again. Nothing may re-authenticate.
        const api = fakeApi({ signedIn: true });
        renderHub();

        await waitFor(() => expect(signedInChrome().logout).not.toBeNull());
        fireEvent.click(screen.getByRole("button", { name: /log out/i }));
        await waitFor(() => expect(signedOutChrome().login).not.toBeNull());

        cleanup();
        renderHub();

        await waitFor(() => expect(signedOutChrome().login).not.toBeNull());
        expect(signedInChrome().logout).toBeNull();
        expect(api.signedIn).toBe(false);
    });

    it("does not let a later 401 restore the previous player", async () => {
        // The stale-state failure: a /me that comes back 401 must leave the user
        // null, never fall back to whoever was signed in before.
        fakeApi({ signedIn: true });
        renderHub();

        await waitFor(() => expect(signedInChrome().logout).not.toBeNull());
        fireEvent.click(screen.getByRole("button", { name: /log out/i }));
        await waitFor(() => expect(signedOutChrome().login).not.toBeNull());

        // Several more anonymous round trips, as navigating the app would make.
        await fetch("/api/users/me");
        await fetch("/api/users/me/stats");
        await fetch("/api/me/sessions/resumable");

        expect(signedInChrome().username).toBeNull();
        expect(signedInChrome().logout).toBeNull();
        expect(signedOutChrome().login).not.toBeNull();
    });

    it("keeps the player signed in and says so when logout fails", async () => {
        // The server still holds the session, so the header must keep saying the
        // player is signed in rather than showing a logout that did not happen.
        fakeApi({ signedIn: true, logoutStatus: 500 });
        renderHub();

        await waitFor(() => expect(signedInChrome().logout).not.toBeNull());
        fireEvent.click(screen.getByRole("button", { name: /log out/i }));

        await waitFor(() => expect(screen.queryByRole("alert")).not.toBeNull());

        expect(screen.getByRole("alert").textContent).toMatch(/still signed in/i);
        expect(signedInChrome().logout).not.toBeNull();
        expect(signedOutChrome().login).toBeNull();
    });

    it("signs a player back in normally afterwards", async () => {
        // The opposite regression: logging out must not poison the next session.
        const api = fakeApi({ signedIn: true });
        renderHub();

        await waitFor(() => expect(signedInChrome().logout).not.toBeNull());
        fireEvent.click(screen.getByRole("button", { name: /log out/i }));
        await waitFor(() => expect(signedOutChrome().login).not.toBeNull());

        // A fresh login, then the app re-mounts as it would after navigating.
        api.signedIn = true;
        cleanup();
        renderHub();

        await waitFor(() => expect(signedInChrome().logout).not.toBeNull());
        expect(signedInChrome().username).not.toBeNull();
        expect(signedOutChrome().login).toBeNull();
    });
});
