import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JourneyConcept, JourneyPathResponse, JourneyTopic } from "../api/types.js";

/**
 * Home answers "where am I and what is next" with one button -- and only once
 * it knows. It used to show "Ready when you are" and an "Open the map" button
 * while the path loaded, and keep showing them if it failed, so a returning
 * learner was briefly (or permanently) told they had no progress. A brand-new
 * learner was greeted "Welcome back" with a row of zeros.
 */

vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {},
    api: { get: vi.fn() }
}));

// One user object for every render, as the real context provides. A fresh
// object per render would re-run Home's fetch on every render.
const USER = { id: "9", username: "qa", email: "qa@jolt.test" };
vi.mock("../auth/AuthContext.js", () => ({
    useAuth: () => ({ user: USER, loading: false })
}));

const { api } = await import("../api/client.js");
const { HomePage } = await import("./HomePage.js");

const concept = (slug: string, state: JourneyConcept["state"]): JourneyConcept => ({
    slug,
    name: slug.replace(/-/g, " "),
    objective: "",
    state,
    neededRetry: false,
    rungs: { cleared: 0, playable: 3 }
});

const topic = (slug: string, state: JourneyTopic["state"], concepts: JourneyConcept[]): JourneyTopic => ({
    slug,
    name: slug === "values" ? "Values and Types" : "Variables",
    principle: "",
    order: 1,
    state,
    concepts,
    challenge: { state: "locked" }
});

function pathWith(done: boolean): JourneyPathResponse {
    const first = concept("console-output", done ? "demonstrated" : "current");
    const second = concept("arithmetic-operators", done ? "current" : "locked");
    const current = done ? second : first;

    return {
        topics: [topic("values", "current", [first, second]), topic("variables", "locked", [])],
        current: { ...current, topic: "values" },
        points: { total: done ? 25 : 0, concepts: done ? 1 : 0, challenges: 0 }
    };
}

function renderHome() {
    return render(
        <MemoryRouter>
            <HomePage />
        </MemoryRouter>
    );
}

beforeEach(() => vi.mocked(api.get).mockReset());
afterEach(cleanup);

describe("Home", () => {
    it("shows no action while progress is loading", async () => {
        let resolve: (p: JourneyPathResponse) => void = () => undefined;
        vi.mocked(api.get).mockReturnValue(new Promise((r) => (resolve = r)));
        renderHome();

        expect(screen.getByRole("status").textContent).toMatch(/loading your progress/i);
        expect(screen.queryByRole("link", { name: /open the map|continue|start/i })).toBeNull();

        // Then the real next step, once it is known.
        resolve(pathWith(true));
        expect(await screen.findByRole("link", { name: "Continue learning" })).toBeTruthy();
    });

    it("says when progress could not load, and offers a retry and the journey", async () => {
        // The path fails once, then loads; the resumable check is incidental.
        let pathCalls = 0;
        vi.mocked(api.get).mockImplementation(((url: string) => {
            if (url === "/api/me/sessions/resumable") return Promise.resolve({ sessions: [] });
            pathCalls += 1;
            return pathCalls === 1 ? Promise.reject(new Error("offline")) : Promise.resolve(pathWith(true));
        }) as never);
        renderHome();

        expect(await screen.findByRole("heading", { name: /did not load/i })).toBeTruthy();
        expect(screen.getByRole("link", { name: /open your journey/i }).getAttribute("href")).toBe("/journey");
        expect(screen.queryByText(/ready when you are/i)).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: /try again/i }));
        expect(await screen.findByRole("link", { name: "Continue learning" })).toBeTruthy();
    });

    it("greets a brand-new learner with where to start, not a row of zeros", async () => {
        vi.mocked(api.get).mockResolvedValue(pathWith(false));
        const { container } = renderHome();

        const start = await screen.findByRole("link", { name: "Start learning" });
        // A brand-new learner starts with the playable tutorial (games/tutorial.ts).
        expect(start.getAttribute("href")).toBe("/learn/console-output");
        expect(screen.getByText("Welcome, qa.")).toBeTruthy();
        expect(screen.getByText(/your first mission/i)).toBeTruthy();
        expect(container.querySelector(".home-log")).toBeNull();
    });

    it("sends a returning learner to their next step, with how far through the topic they are", async () => {
        vi.mocked(api.get).mockResolvedValue(pathWith(true));
        renderHome();

        const next = await screen.findByRole("link", { name: "Continue learning" });
        expect(next.getAttribute("href")).toBe("/concept/arithmetic-operators");
        expect(screen.getByText("Welcome back, qa.")).toBeTruthy();
        // The mission is the page heading; its topic is named above it.
        expect(screen.getByRole("heading", { level: 1, name: "arithmetic operators" })).toBeTruthy();
        expect(screen.getByText(/Your mission · Values and Types/)).toBeTruthy();
        expect(screen.getByText("0 of 3 stops done")).toBeTruthy();
        expect(screen.getByText("1 of 2 concepts done, then the checkpoint")).toBeTruthy();
        expect(document.title).toBe("Home · Jolt");
    });

    it("keeps the journey and the games one click away", async () => {
        vi.mocked(api.get).mockResolvedValue(pathWith(true));
        renderHome();

        expect((await screen.findByRole("link", { name: /see your journey/i })).getAttribute("href")).toBe("/journey");
        expect(screen.getByRole("link", { name: /play a game/i }).getAttribute("href")).toBe("/play");
    });

    it("offers back a game the learner left, quietly, under the next step", async () => {
        vi.mocked(api.get).mockImplementation(((url: string) =>
            Promise.resolve(
                url === "/api/me/sessions/resumable"
                    ? { sessions: [{ id: "9", game: { slug: "flush", name: "Flush" }, status: "paused", score: 60, unitsDone: 1, unitsTotal: 3, pauseCount: 1, startedAt: "", pausedAt: "" }] }
                    : pathWith(true)
            )) as never);
        const { container } = renderHome();

        const resume = await screen.findByRole("link", { name: "Resume" });
        expect(resume.getAttribute("href")).toBe("/flush");
        expect(resume.closest(".home-held")?.textContent).toMatch(/Paused: Flush, round 2 of 3\./);
        // Still one primary action: the course.
        expect([...container.querySelectorAll(".button.primary")].map((a) => a.textContent)).toEqual(["Continue learning"]);
    });

    it("says no count for a run left before its first round, not \"round 0 of 0\"", async () => {
        // Reaction and Memory create each round as it is served, so a run
        // paused before round one has no rounds to count.
        vi.mocked(api.get).mockImplementation(((url: string) =>
            Promise.resolve(
                url === "/api/me/sessions/resumable"
                    ? { sessions: [{ id: "11", game: { slug: "memory", name: "Memory" }, status: "paused", score: 0, unitsDone: 0, unitsTotal: 0, pauseCount: 1, startedAt: "", pausedAt: "" }] }
                    : pathWith(true)
            )) as never);
        renderHome();

        const resume = await screen.findByRole("link", { name: "Resume" });
        const line = resume.closest(".home-held")?.textContent ?? "";
        expect(line).toMatch(/^Paused: Memory\. Resume$/);
        expect(line).not.toMatch(/0 of 0/);
    });

    it("says nothing about games when none is unfinished", async () => {
        vi.mocked(api.get).mockImplementation(((url: string) =>
            Promise.resolve(url === "/api/me/sessions/resumable" ? { sessions: [] } : pathWith(true))) as never);
        const { container } = renderHome();

        await screen.findByRole("link", { name: "Continue learning" });
        expect(container.querySelector(".home-held")).toBeNull();
    });
});

