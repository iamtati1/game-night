import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Encounter, Exercise } from "../api/encounter.js";

/**
 * A concept page that recovers instead of stalling or pretending.
 *
 * UX audit: a question that failed to load showed "Loading…" for good; an
 * answer that failed to send did nothing at all; a finished program whose
 * record failed was treated as cleared; and a failed refresh after a cleared
 * stop went on to complete the concept, which the server then refused. These
 * pin what the learner sees in each case -- what happened, whether anything
 * was recorded, and the one thing to do next -- against the real page.
 */
vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {
        status: number;
        details: unknown[];
        body: unknown;

        constructor(status: number, message: string, details: unknown[] = [], body: unknown = null) {
            super(message);
            this.status = status;
            this.details = details;
            this.body = body;
        }
    },
    api: { get: vi.fn(), post: vi.fn() }
}));

/* The mission rung's scene runs a real program; a finished one is all that
   matters here, so it is a button that says it finished. */
vi.mock("../components/MissionScene.js", () => ({
    MissionScene: ({ onFinish }: { onFinish: (retried: boolean) => void }) => (
        <button onClick={() => onFinish(false)}>Finish the program</button>
    )
}));
vi.mock("../games/movements.js", () => ({ movementMissionFor: () => ({ id: "m" }) }));

const { ApiError, api } = await import("../api/client.js");
const { EncounterPage } = await import("./EncounterPage.js");

afterEach(() => {
    cleanup();
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
});

const EXERCISE: Exercise = {
    challengeId: "41",
    kind: "question",
    ask: "What does this log?",
    code: "let score = 10;\nscore = 20;\nconsole.log(score);",
    brief: null,
    options: [
        { id: "1", text: "20" },
        { id: "2", text: "10" }
    ]
};

const RIGHT = { correct: true, explanation: "The second line replaces what it holds.", correctOptionId: "1" };

function encounter(over: Partial<Encounter> = {}): Encounter {
    return {
        conceptSlug: "reassignment",
        name: "Changing what a name holds",
        objective: "change a value after naming it",
        meaning: "a variable can be given a new value",
        topicSlug: "variables",
        prerequisites: [],
        demonstrated: false,
        reachable: true,
        unmetPrerequisites: [],
        blockedBy: null,
        allowedConcepts: ["reassignment"],
        currentRung: "predict",
        next: null,
        playable: true,
        rungs: [
            {
                demandSlug: "predict",
                demandOrder: 3,
                cleared: false,
                options: [{ challengeId: "41", difficulty: 1, content: { kind: "question", id: "9" } }]
            }
        ],
        ...over
    } as Encounter;
}

/** The same ladder with its one stop cleared: nothing left, so the concept is owed. */
const FINISHED = encounter({
    currentRung: null,
    rungs: [{ demandSlug: "predict", demandOrder: 3, cleared: true, options: [{ challengeId: "41", difficulty: 1, content: { kind: "question", id: "9" } }] }]
});

/** Enough of a path for the arrival screen to render the concept's objective. */
const PATH = {
    topics: [
        {
            slug: "variables",
            name: "Variables",
            principle: "",
            order: 2,
            state: "current",
            concepts: [
                {
                    slug: "reassignment",
                    name: "Changing what a name holds",
                    objective: "change a value after naming it",
                    state: "demonstrated",
                    neededRetry: false,
                    rungs: { cleared: 1, playable: 1 }
                }
            ],
            challenge: null
        }
    ],
    current: null,
    points: { total: 25, concepts: 25, challenges: 0 }
};

async function click(el: Element) {
    await act(async () => {
        fireEvent.click(el);
    });
}

/**
 * Renders the page with `get` routing by path, and walks past the teaching.
 * `encounters` are served in order, the last one repeating.
 */
async function open({
    exercise,
    encounters = [encounter()]
}: {
    exercise: () => Promise<unknown>;
    encounters?: (Encounter | Error)[];
}) {
    let served = 0;

    vi.mocked(api.get).mockImplementation(((path: string) => {
        if (path.includes("/exercise")) return exercise();
        if (path.includes("/curriculum/path")) return Promise.resolve(PATH);
        const next = encounters[Math.min(served++, encounters.length - 1)]!;
        return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    }) as never);

    render(
        <MemoryRouter initialEntries={["/concept/reassignment"]}>
            <Routes>
                <Route path="/concept/:concept" element={<EncounterPage />} />
            </Routes>
        </MemoryRouter>
    );

    await screen.findByText("Changing what a name holds");

    const ready = screen.queryByRole("button", { name: /got it/i });
    if (ready) await click(ready);
}

const exerciseCalls = () => vi.mocked(api.get).mock.calls.filter(([p]) => String(p).includes("/exercise")).length;
const posts = (suffix: string) => vi.mocked(api.post).mock.calls.filter(([p]) => String(p).endsWith(suffix));

describe("loading a question", () => {
    it("shows the question once it loads", async () => {
        await open({ exercise: () => Promise.resolve(EXERCISE) });

        expect(await screen.findByText("What does this log?")).toBeTruthy();
        expect(screen.queryByText("Loading…")).toBeNull();
    });

    it("stops saying Loading when the question cannot be loaded, and says what happened", async () => {
        await open({ exercise: () => Promise.reject(new TypeError("Failed to fetch")) });

        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toMatch(/this question could not be loaded just now/i);
        expect(alert.textContent).toMatch(/what you have done on this concept is saved/i);
        expect(screen.queryByText("Loading…")).toBeNull();
        // Nothing was recorded for a question that never arrived.
        expect(vi.mocked(api.post)).not.toHaveBeenCalled();
    });

    it("loads it on a retry, without leaving the page", async () => {
        let calls = 0;
        await open({
            exercise: () => (++calls === 1 ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve(EXERCISE))
        });

        await click(await screen.findByRole("button", { name: "Try again" }));

        expect(await screen.findByText("What does this log?")).toBeTruthy();
        expect(screen.queryByRole("alert")).toBeNull();
        expect(exerciseCalls()).toBe(2);
    });
});

describe("sending an answer", () => {
    it("marks a correct answer from the server's verdict", async () => {
        await open({ exercise: () => Promise.resolve(EXERCISE) });
        vi.mocked(api.post).mockResolvedValue(RIGHT);

        await click(await screen.findByRole("button", { name: "20" }));

        expect(await screen.findByText("Yes")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Keep going" })).toBeTruthy();
    });

    it("gives a wrong answer its own feedback, not an error", async () => {
        await open({ exercise: () => Promise.resolve(EXERCISE) });
        vi.mocked(api.post).mockResolvedValue({ correct: false, explanation: "It holds 20 now.", correctOptionId: "1" });

        await click(await screen.findByRole("button", { name: "10" }));

        expect(await screen.findByText("Not quite")).toBeTruthy();
        expect(screen.getByText("It holds 20 now.")).toBeTruthy();
        expect(screen.queryByText(/could not be sent/i)).toBeNull();
    });

    it("says so when the answer could not be sent, keeps the choice, and marks nothing", async () => {
        await open({ exercise: () => Promise.resolve(EXERCISE) });
        vi.mocked(api.post).mockRejectedValue(new TypeError("Failed to fetch"));

        await click(await screen.findByRole("button", { name: "10" }));

        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toMatch(/your answer could not be sent, so it has not been marked yet/i);
        expect(alert.textContent).toMatch(/your choice: 10/i);
        // Not a verdict either way.
        expect(screen.queryByText("Not quite")).toBeNull();
        expect(screen.queryByText("Yes")).toBeNull();
        expect(screen.queryByRole("button", { name: "Keep going" })).toBeNull();
    });

    it("sends the same choice again, and marks it once the server answers", async () => {
        await open({ exercise: () => Promise.resolve(EXERCISE) });
        vi.mocked(api.post).mockRejectedValueOnce(new ApiError(502, "Jolt's server is not responding right now."));
        vi.mocked(api.post).mockResolvedValueOnce({ correct: false, explanation: "It holds 20 now.", correctOptionId: "1" });

        await click(await screen.findByRole("button", { name: "10" }));
        await click(await screen.findByRole("button", { name: "Send it again" }));

        expect(await screen.findByText("Not quite")).toBeTruthy();
        const answers = posts("/answer");
        expect(answers).toHaveLength(2);
        expect(answers.map(([, body]) => (body as { optionId: string }).optionId)).toEqual(["2", "2"]);
    });

    it("does not offer to resend an answer the server refused", async () => {
        await open({ exercise: () => Promise.resolve(EXERCISE) });
        vi.mocked(api.post).mockRejectedValue(new ApiError(403, "That concept is not open yet"));

        await click(await screen.findByRole("button", { name: "10" }));

        expect((await screen.findByRole("alert")).textContent).toMatch(/not accepted: that concept is not open yet/i);
        expect(screen.queryByRole("button", { name: "Send it again" })).toBeNull();
    });

    it("sends one answer however fast the choices are pressed", async () => {
        await open({ exercise: () => Promise.resolve(EXERCISE) });
        vi.mocked(api.post).mockReturnValue(new Promise(() => undefined));

        const choice = await screen.findByRole("button", { name: "10" });
        await act(async () => {
            fireEvent.click(choice);
            fireEvent.click(choice);
            fireEvent.click(screen.getByRole("button", { name: "20" }));
        });

        expect(posts("/answer")).toHaveLength(1);
    });
});

describe("recording a finished program", () => {
    const MISSION = encounter({
        currentRung: "produce",
        rungs: [{ demandSlug: "produce", demandOrder: 5, cleared: false, options: [{ challengeId: "77", difficulty: 1, content: { kind: "mission" } }] }]
    });

    it("does not move on when the program could not be saved, and saves it on a resend", async () => {
        await open({ exercise: () => Promise.resolve(EXERCISE), encounters: [MISSION, FINISHED] });
        vi.mocked(api.post).mockImplementation(((path: string) => {
            if (path.endsWith("/completion")) {
                return posts("/completion").length === 1
                    ? Promise.reject(new TypeError("Failed to fetch"))
                    : Promise.resolve({ recorded: true });
            }
            return Promise.resolve({ demonstrated: true });
        }) as never);

        await click(await screen.findByRole("button", { name: "Finish the program" }));

        expect((await screen.findByRole("alert")).textContent).toMatch(/your program works, but it could not be saved/i);
        expect(posts("/demonstrate")).toHaveLength(0);

        await click(screen.getByRole("button", { name: "Send it again" }));

        // Saved, and the ladder is finished, so the concept is completed.
        await screen.findByText("change a value after naming it");
        expect(posts("/completion")).toHaveLength(2);
    });
});

describe("finishing the concept", () => {
    it("does not try to complete the concept when the next step could not be loaded", async () => {
        // Cleared the stop; the refresh after it fails.
        await open({
            exercise: () => Promise.resolve(EXERCISE),
            encounters: [encounter(), new TypeError("Failed to fetch"), FINISHED]
        });
        vi.mocked(api.post).mockImplementation(((path: string) =>
            Promise.resolve(path.endsWith("/answer") ? RIGHT : { demonstrated: true })) as never);

        await click(await screen.findByRole("button", { name: "20" }));
        await click(await screen.findByRole("button", { name: "Keep going" }));

        expect((await screen.findByRole("alert")).textContent).toMatch(/your answer is saved, but the next step could not be loaded/i);
        expect(posts("/demonstrate")).toHaveLength(0);

        await click(screen.getByRole("button", { name: "Try again" }));

        await screen.findByText("change a value after naming it");
        expect(posts("/demonstrate")).toHaveLength(1);
    });

    it("offers to try again when recording the concept fails, and only then shows the arrival", async () => {
        // Set before opening: a finished ladder is recorded as soon as the
        // teaching is past.
        vi.mocked(api.post).mockRejectedValueOnce(new TypeError("Failed to fetch"));
        vi.mocked(api.post).mockResolvedValueOnce({ demonstrated: true });
        await open({ exercise: () => Promise.resolve(EXERCISE), encounters: [FINISHED] });

        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toMatch(/every stop here is saved, but finishing this concept could not be recorded/i);
        // A failure is not a success: no arrival, no points.
        expect(screen.queryByText("change a value after naming it")).toBeNull();
        expect(screen.queryByText("+25")).toBeNull();

        await click(screen.getByRole("button", { name: "Try again" }));

        expect(await screen.findByText("change a value after naming it")).toBeTruthy();
    });

    it("never shows a refusal as a success, and offers no pointless retry for it", async () => {
        vi.mocked(api.post).mockRejectedValue(
            new ApiError(409, "Not everything here has been done yet", [], { outstanding: ["predict"], unplayable: false })
        );
        await open({ exercise: () => Promise.resolve(EXERCISE), encounters: [FINISHED] });

        expect((await screen.findByRole("alert")).textContent).toMatch(/not everything here has been done yet/i);
        expect(screen.getByText(/still to do: work out what happens/i)).toBeTruthy();
        expect(screen.queryByText("change a value after naming it")).toBeNull();
        expect(screen.queryByText("+25")).toBeNull();
        expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    });

    it("goes straight to the authoritative blocker when the concept turns out to be locked", async () => {
        // Refused because the concept is not open; the reload says what is in
        // the way, and the page sends the learner there, not round again.
        vi.mocked(api.post).mockRejectedValue(new ApiError(403, "That concept is not open yet"));
        await open({
            exercise: () => Promise.resolve(EXERCISE),
            encounters: [
                FINISHED,
                encounter({
                    reachable: false,
                    blockedBy: { kind: "checkpoint", slug: "values", name: "Values and Types" }
                })
            ]
        });

        const go = await screen.findByRole("link", { name: "Take the Values and Types checkpoint" });
        expect(go.getAttribute("href")).toBe("/challenge/values");
        expect(screen.queryByText("change a value after naming it")).toBeNull();
        await waitFor(() => expect(posts("/demonstrate")).toHaveLength(1));
    });
});
