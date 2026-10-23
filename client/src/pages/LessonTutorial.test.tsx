import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JourneyPathResponse } from "../api/types.js";
import { CONSOLE_OUTPUT } from "../games/scenes.js";

/**
 * The first-time tutorial, walked end to end at /learn/console-output.
 *
 * It records NOTHING: it used to post /demonstrate on its last scene, which the
 * server refuses until the concept's practice stops are cleared, so a new
 * learner finished and met an error. It now hands over to the first mission.
 */

vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {},
    api: { get: vi.fn(), post: vi.fn() }
}));

const { api } = await import("../api/client.js");
const { LessonPage } = await import("./LessonPage.js");

const PATH: JourneyPathResponse = {
    topics: [
        {
            slug: "values",
            name: "Values and Types",
            principle: "",
            order: 1,
            state: "current",
            concepts: [
                {
                    slug: "console-output",
                    name: "Running Code and Reading Output",
                    objective: "run a snippet and say what it prints",
                    state: "current",
                    neededRetry: false,
                    rungs: { cleared: 0, playable: 3 }
                }
            ],
            challenge: null
        }
    ],
    current: {
        slug: "console-output",
        name: "Running Code and Reading Output",
        objective: "run a snippet and say what it prints",
        state: "current",
        neededRetry: false,
        rungs: { cleared: 0, playable: 3 },
        topic: "values"
    },
    points: { total: 0, concepts: 0, challenges: 0 }
};

beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(api.get).mockReset().mockResolvedValue(PATH);
    vi.mocked(api.post).mockReset();
    window.localStorage.clear();
});
afterEach(() => {
    vi.useRealTimers();
    cleanup();
});

function renderTutorial(url = "/learn/console-output") {
    return render(
        <MemoryRouter initialEntries={[url]}>
            <Routes>
                <Route path="/learn/:concept" element={<LessonPage />} />
            </Routes>
        </MemoryRouter>
    );
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const wait = () =>
    act(() => {
        vi.advanceTimersByTime(1000);
    });

/** Plays every scene the way a learner who gets each question right would. */
function walk() {
    for (const scene of CONSOLE_OUTPUT.scenes) {
        if (scene.kind === "moment") click(scene.action);
        if (scene.kind === "run") {
            click(/Run it/);
            wait();
            click("Next");
        }
        if (scene.kind === "edit") {
            click(/Run your version/);
            wait();
            click("Next");
        }
        if (scene.kind === "ask") {
            const right = scene.choices.find((c) => c.correct)!.text;
            fireEvent.click(screen.getAllByRole("button").find((b) => b.textContent === right)!);
            click("Next");
        }
        if (scene.kind === "reveal") click("Got it");
    }
}

describe("the first-time tutorial", () => {
    it("can be played from start to finish and records nothing", async () => {
        renderTutorial();
        walk();

        expect(api.post).not.toHaveBeenCalled();
        expect(document.title).toBe("Your first program · Jolt");
        await act(async () => {
            await Promise.resolve();
        });
        expect(screen.getByRole("heading", { level: 1, name: "You wrote your first program." })).toBeTruthy();
    });

    it("hands over to the first mission, whose practice is the evidence", async () => {
        renderTutorial();
        walk();
        await act(async () => {
            await Promise.resolve();
        });

        expect(screen.getByRole("heading", { name: "Running Code and Reading Output" })).toBeTruthy();
        // Seen now, so the mission goes to the practice, not back to the tutorial.
        expect(screen.getByRole("link", { name: "Start learning" }).getAttribute("href")).toBe("/concept/console-output");
        expect(window.localStorage.getItem("jolt.tutorial.console-output")).toBe("seen");
    });

    it("can be skipped straight to the practice", () => {
        renderTutorial();
        const skip = screen.getByRole("link", { name: "Skip to the practice" });

        expect(skip.getAttribute("href")).toBe("/concept/console-output");
        fireEvent.click(skip);
        expect(window.localStorage.getItem("jolt.tutorial.console-output")).toBe("seen");
        expect(api.post).not.toHaveBeenCalled();
    });

    it("replayed from Profile, records nothing and says progress is unchanged", async () => {
        // A returning learner: already seen, with progress on the path.
        window.localStorage.setItem("jolt.tutorial.console-output", "seen");
        const progressed = { ...PATH, points: { total: 50, concepts: 2, challenges: 0 } };
        vi.mocked(api.get).mockResolvedValue(progressed);

        renderTutorial("/learn/console-output?replay=1");
        walk();
        await act(async () => {
            await Promise.resolve();
        });

        expect(api.post).not.toHaveBeenCalled();
        expect(screen.getByRole("heading", { level: 1, name: "Tutorial replayed." })).toBeTruthy();
        expect(screen.getByText(/nothing was recorded and your progress is as you left it/i)).toBeTruthy();
        expect(screen.queryByText("You wrote your first program.")).toBeNull();
        expect(window.localStorage.getItem("jolt.tutorial.console-output")).toBe("seen");
    });
});
