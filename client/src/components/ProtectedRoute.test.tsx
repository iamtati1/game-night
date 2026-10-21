import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, isUnreachable } from "../api/client.js";
import App from "../App.js";
import { AuthProvider } from "../auth/AuthContext.js";
import { ProtectedRoute } from "./ProtectedRoute.js";

/**
 * Signed out is not the same as unreachable.
 *
 * Browser QA: with the API down, opening a page sent a signed-in learner to the
 * login screen, because every failed session check left `user` null. Only a 401
 * means signed out; an outage now keeps the learner where they are, says so in
 * plain words, and offers to try again.
 */
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const respond = (status: number, body: unknown) =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response);

function open() {
    return render(
        <MemoryRouter initialEntries={["/journey"]}>
            <AuthProvider>
                <Routes>
                    <Route
                        path="/journey"
                        element={
                            <ProtectedRoute>
                                <p>the journey</p>
                            </ProtectedRoute>
                        }
                    />
                    <Route path="/login" element={<p>the login page</p>} />
                </Routes>
            </AuthProvider>
        </MemoryRouter>
    );
}

describe("the session gate", () => {
    it("sends a signed-out learner to the login page: a 401 is the server answering", async () => {
        vi.stubGlobal("fetch", () => respond(401, { error: "Unauthorized" }));
        open();
        expect(await screen.findByText("the login page")).toBeTruthy();
    });

    it("keeps the learner on the page when the server cannot be reached at all", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
        open();

        expect(await screen.findByText("Jolt is not responding")).toBeTruthy();
        expect(screen.queryByText("the login page")).toBeNull();
        expect(screen.getByRole("alert").textContent).not.toMatch(/status|50\d|fetch/i);
    });

    it("treats a gateway with nothing behind it (502, no body) as an outage, not a sign-out", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.stubGlobal("fetch", () => Promise.resolve({ ok: false, status: 502, json: () => Promise.reject(new Error("not json")) } as Response));
        open();

        expect(await screen.findByText("Jolt is not responding")).toBeTruthy();
        expect(screen.queryByText("the login page")).toBeNull();
    });

    it("lets them try again, and carries on once the server is back", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        let up = false;
        vi.stubGlobal("fetch", () =>
            up
                ? respond(200, { user: { id: "9", username: "qa", email: "qa@jolt.test" } })
                : Promise.reject(new TypeError("Failed to fetch"))
        );
        open();

        await screen.findByText("Jolt is not responding");
        up = true;
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));

        await waitFor(() => expect(screen.queryByText("the journey")).not.toBeNull());
    });
});

describe("the header during an outage", () => {
    it("does not offer 'Log in' to a learner whose session it simply could not check", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
        render(
            <MemoryRouter initialEntries={["/journey"]}>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </MemoryRouter>
        );

        expect(await screen.findByText("Jolt is not responding")).toBeTruthy();
        expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
        expect(screen.queryByRole("link", { name: "Create account" })).toBeNull();
    });
});

describe("telling an outage from an answer", () => {
    it("knows a missing response and an empty gateway are unreachable", () => {
        expect(isUnreachable(new ApiError(0, "Could not reach the server."))).toBe(true);
        expect(isUnreachable(new ApiError(502, "x"))).toBe(true);
        expect(isUnreachable(new ApiError(504, "x"))).toBe(true);
    });

    it("knows a readiness refusal and an ordinary error are the server answering", () => {
        expect(isUnreachable(new ApiError(503, "Not enough to hunt yet", [], { error: "Not enough to hunt yet" }))).toBe(false);
        expect(isUnreachable(new ApiError(500, "Boom", [], { error: "Boom" }))).toBe(false);
        expect(isUnreachable(new ApiError(401, "Unauthorized"))).toBe(false);
    });

    it("never shows a learner 'Request failed with status 502'", async () => {
        vi.stubGlobal("fetch", () => Promise.resolve({ ok: false, status: 502, json: () => Promise.reject(new Error("not json")) } as Response));
        const { api } = await import("../api/client.js");

        const err = (await api.get("/api/anything").catch((e: unknown) => e)) as ApiError;
        expect(err.message).toBe("Jolt's server is not responding right now. Try again in a moment.");
        expect(err.message).not.toMatch(/status 502/);
    });
});
