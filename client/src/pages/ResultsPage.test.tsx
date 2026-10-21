import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The Code Blitz results screen says what the run was actually about.
 *
 * UX audit: every learner was shown "Your variables journey", because the
 * topic panel was hardcoded to `variables`; and the screen ended with two
 * primary buttons to the same concept, or -- with no concept -- "Play again"
 * twice. These pin the learner's own topic (or no panel at all), and exactly
 * one primary action.
 */
vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {},
    api: { get: vi.fn() }
}));

vi.mock("../games/useRunContext.js", () => ({
    useRunContext: () => ({ previousBest: null, improvement: null })
}));

const { api } = await import("../api/client.js");
const { ResultsPage } = await import("./ResultsPage.js");

afterEach(() => {
    cleanup();
    vi.mocked(api.get).mockReset();
});

const SESSION = {
    id: "41",
    status: "completed",
    score: 640,
    xpEarned: 64,
    startedAt: "2026-10-18T10:00:00.000Z",
    completedAt: "2026-10-18T10:03:00.000Z",
    totalQuestions: 2,
    correctCount: 2,
    incorrectCount: 0,
    timedOutCount: 0,
    bestStreak: 2,
    averageResponseMs: 4000,
    successRate: 1,
    questions: []
};

type Curriculum = {
    concept: { slug: string; name: string; topic?: { slug: string; name: string } | null } | null;
    rungs: { cleared: number; playable: number } | null;
    earned: { conceptSlug: string; conceptName: string; demandSlug: string }[];
};

/** Answers the results request and the topic-standing request, and records both. */
function open(curriculum: Curriculum) {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
        if (path === "/api/sessions/41") return { session: SESSION, curriculum };

        const standing = path.match(/^\/api\/curriculum\/topics\/([a-z-]+)\/standing$/);
        if (standing) {
            return {
                topic: standing[1],
                concepts: [
                    { slug: "console-output", name: "Running Code", objective: "say what it prints", status: "current" }
                ],
                current: { slug: "console-output", name: "Running Code", objective: "say what it prints", status: "current" }
            };
        }

        throw new Error(`unexpected request ${path}`);
    });

    return render(
        <MemoryRouter initialEntries={["/results/41"]}>
            <Routes>
                <Route path="/results/:id" element={<ResultsPage />} />
            </Routes>
        </MemoryRouter>
    );
}

const requested = () => vi.mocked(api.get).mock.calls.map(([path]) => path);

const primaries = (container: HTMLElement) =>
    [...container.querySelectorAll("a.button.primary")].map((a) => ({
        text: a.textContent,
        href: a.getAttribute("href")
    }));

describe("results with a concept", () => {
    const WITH_CONCEPT: Curriculum = {
        concept: { slug: "console-output", name: "Running Code", topic: { slug: "values", name: "Values and Types" } },
        rungs: { cleared: 1, playable: 3 },
        earned: [{ conceptSlug: "console-output", conceptName: "Running Code", demandSlug: "predict" }]
    };

    it("shows the journey of the learner's own topic, never a fixed one", async () => {
        open(WITH_CONCEPT);

        expect(await screen.findByText("Your values journey")).toBeTruthy();
        expect(screen.queryByText(/variables journey/i)).toBeNull();
        expect(requested()).toContain("/api/curriculum/topics/values/standing");
        expect(requested()).not.toContain("/api/curriculum/topics/variables/standing");
    });

    it("ends in exactly one primary action: the next step on that concept", async () => {
        const { container } = open(WITH_CONCEPT);

        await screen.findByText("Your values journey");

        expect(primaries(container)).toEqual([{ text: "Continue: Running Code", href: "/concept/console-output" }]);
        // Play again stays, as a secondary choice, once.
        expect(screen.getAllByRole("link", { name: "Play again" })).toHaveLength(1);
        // "Pick another Jolt" went to /play, which the nav already does; the
        // other four games' results dropped it in Slice A, and now this one
        // matches them.
        expect(screen.queryByRole("link", { name: "Pick another Jolt" })).toBeNull();
    });

    it("puts that next step above the figures and the question breakdown", async () => {
        const { container } = open(WITH_CONCEPT);
        const next = await screen.findByRole("link", { name: "Continue: Running Code" });

        for (const el of [container.querySelector(".run-figures"), container.querySelector(".breakdown")]) {
            expect(el).not.toBeNull();
            expect(next.compareDocumentPosition(el!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        }
    });

    it("shows no topic panel when the path cannot say which topic the concept is in", async () => {
        open({ ...WITH_CONCEPT, concept: { slug: "console-output", name: "Running Code", topic: null } });

        await screen.findByText("Running Code");
        // The tally and the concept block render; the panel does not guess.
        await waitFor(() => expect(requested()).toContain("/api/sessions/41"));
        expect(requested().some((p) => p.includes("/standing"))).toBe(false);
        expect(screen.queryByText(/journey$/i)).toBeNull();
    });
});

describe("results with no concept", () => {
    const NO_CONCEPT: Curriculum = { concept: null, rungs: null, earned: [] };

    it("invents no topic and asks for none", async () => {
        open(NO_CONCEPT);

        await screen.findByText("640");
        expect(requested().some((p) => p.includes("/standing"))).toBe(false);
        expect(screen.queryByText(/journey$/i)).toBeNull();
        expect(screen.queryByText(/you are learning/i)).toBeNull();
    });

    it("offers 'Play again' once, as the one primary action", async () => {
        const { container } = open(NO_CONCEPT);

        await screen.findByText("640");

        expect(primaries(container)).toEqual([{ text: "Play again", href: "/code-blitz" }]);
        expect(screen.getAllByRole("link", { name: "Play again" })).toHaveLength(1);
    });
});

describe("the review of missed questions", () => {
    it("renders an explanation's inline code as code, not backticks", async () => {
        // Browser QA: explanations showed "`6 / 2`" with the backticks.
        const missed = {
            displayOrder: 1,
            prompt: "Which of these produces a value?",
            topic: "values",
            explanation: "`6 / 2` turns into 3; `console.log` is an action.",
            status: "answered",
            selectedOption: "the brackets",
            correctOption: "6 / 2",
            isCorrect: false,
            responseTimeMs: 4000,
            pointsAwarded: 0
        };
        vi.mocked(api.get).mockImplementation(async (path: string) => {
            if (path === "/api/sessions/41") {
                return { session: { ...SESSION, questions: [missed] }, curriculum: { concept: null, rungs: null, earned: [] } };
            }
            throw new Error(`unexpected request ${path}`);
        });

        const { container } = render(
            <MemoryRouter initialEntries={["/results/41"]}>
                <Routes>
                    <Route path="/results/:id" element={<ResultsPage />} />
                </Routes>
            </MemoryRouter>
        );

        await screen.findByText("640");
        const why = container.querySelector(".review-why")!;

        expect(why.textContent).toBe("6 / 2 turns into 3; console.log is an action.");
        expect([...why.querySelectorAll("code")].map((c) => c.textContent)).toEqual(["6 / 2", "console.log"]);
    });
});
