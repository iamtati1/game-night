import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Encounter, Exercise, Judgement } from "../api/encounter.js";

vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {},
    api: { get: vi.fn(), post: vi.fn() }
}));

const { api } = await import("../api/client.js");
const { EncounterPage } = await import("./EncounterPage.js");

afterEach(() => {
    cleanup();
    vi.resetAllMocks();
});

/**
 * The learner-facing half of the Variables slice.
 *
 * These assert what a beginner can SEE and DO -- that the screen says what is
 * being learned, that a wrong answer explains itself and can be retried, and
 * that the curriculum's private vocabulary never reaches the page. The server
 * decides what belongs on the screen; these check it is rendered honestly.
 */
function encounter(over: Partial<Encounter> = {}): Encounter {
    return {
        conceptSlug: "reassignment",
        name: "Changing what a name holds",
        objective: "change a value after naming it",
        meaning: "a variable can be given a new value",
        topicSlug: "variables",
        prerequisites: ["assignment"],
        demonstrated: false,
        reachable: true,
        unmetPrerequisites: [],
        allowedConcepts: ["assignment", "reassignment"],
        currentRung: "predict",
        next: { slug: "let-vs-const", name: "let vs const" },
        playable: true,
        rungs: [
            {
                demandSlug: "predict",
                demandOrder: 3,
                cleared: false,
                options: [
                    {
                        challengeId: "41",
                        difficulty: 1,
                        content: { kind: "question", id: "9" }
                    }
                ]
            }
        ],
        ...over
    };
}

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

const WHY =
    "The second line replaces what `score` holds. A variable keeps one value at a time.";

/** fireEvent plus a flushed microtask turn, so awaited fetches settle. */
async function click(el: Element) {
    await act(async () => {
        fireEvent.click(el);
    });
}

/**
 * Renders the encounter and walks past the teaching, which is where it opens
 * whenever `lessons.ts` has authored some for the concept -- `reassignment`
 * has. The teaching itself is LessonPage's test; these are about what happens
 * after it.
 */
async function open(view: Encounter) {
    vi.mocked(api.get).mockImplementation(((path: string) =>
        path.includes("/exercise")
            ? Promise.resolve(EXERCISE)
            : Promise.resolve(view)) as never);

    const rendered = render(
        <MemoryRouter initialEntries={["/concept/reassignment"]}>
            <Routes>
                <Route path="/concept/:concept" element={<EncounterPage />} />
            </Routes>
        </MemoryRouter>
    );

    await screen.findByText(view.name);

    const ready = screen.queryByRole("button", { name: /got it/i });

    if (ready) await click(ready);

    return rendered;
}

describe("arriving at a concept", () => {
    it("says where the learner is and what they are learning", async () => {
        // No lesson is authored for this slug in the test, so it opens on the
        // work phase -- the header is on every screen of the encounter, which
        // is the point being asserted.
        const { container } = await open(encounter());

        await screen.findByText("Changing what a name holds");
        expect(container.textContent).toMatch(/variables · you are here/i);
    });

    it("explains why a locked concept is locked, and links the way in", async () => {
        const { container } = await open(
            encounter({ reachable: false, unmetPrerequisites: ["assignment"] })
        );

        await screen.findByText("Changing what a name holds");

        expect(container.textContent).toMatch(/builds on something else/i);

        const link = [...container.querySelectorAll("a")].find((a) =>
            a.getAttribute("href") === "/concept/assignment"
        );

        expect(link, "the prerequisite is reachable from the lock").toBeTruthy();
    });

    it("never shows the curriculum's own vocabulary", async () => {
        const { container } = await open(encounter());

        await screen.findByText("Changing what a name holds");

        // `predict` is how the curriculum talks to itself. A learner should
        // never have to know what it means.
        expect(container.textContent).not.toMatch(/\bpredict\b/i);
        expect(container.textContent).toMatch(/work out what happens/i);
    });
});

describe("answering a question", () => {
    it("teaches after a wrong answer and offers another go", async () => {
        vi.mocked(api.post).mockResolvedValue({
            correct: false,
            explanation: WHY,
            correctOptionId: "1"
        } as Judgement as never);

        const { container } = await open(encounter());
        const wrong = await screen.findByRole("button", { name: "10" });

        await click(wrong);

        await waitFor(() => expect(container.textContent).toMatch(/Not quite/));

        // The REASONING, not a restatement of the answer.
        expect(container.textContent).toContain("A variable keeps one value at a time");

        // The way on is a SIMPLER problem, not the same question again. The
        // plain retry is still there once the repair has been used -- see
        // "falls back to a plain retry" below.
        expect(await screen.findByRole("button", { name: /try a simpler one/i })).toBeTruthy();
    });

    it("lets the learner answer again after a miss", async () => {
        vi.mocked(api.post).mockResolvedValue({
            correct: false,
            explanation: WHY,
            correctOptionId: "1"
        } as Judgement as never);

        await open(encounter());

        await click(await screen.findByRole("button", { name: "10" }));

        // Through the repair and back -- the route a learner actually takes now.
        await click(await screen.findByRole("button", { name: /try a simpler one/i }));

        for (const choice of [...document.querySelectorAll(".remediation .lesson-choice")]) {
            await click(choice);

            const back = screen.queryByRole("button", { name: /back to the question/i });

            if (back) {
                await click(back);
                break;
            }
        }

        // Back to a live question rather than a locked screen.
        const retry = await screen.findByRole("button", { name: "20" });

        expect(retry.hasAttribute("disabled")).toBe(false);
    });

    it("sends a learner who misses twice back to the explanation", async () => {
        /*
         * THE THIRD RUNG OF THE LADDER. The first two were already here: the
         * wrong option's feedback names the misconception, and the repair
         * offers a neighbouring question. After the repair had been used, the
         * only remaining offer was "Try again" -- the same loop a third time.
         *
         * Missing an idea twice is not a signal to try harder, so the primary
         * offer becomes the explanation. Trying again stays available for a
         * learner who knows they simply misread.
         */
        vi.mocked(api.post).mockResolvedValue({
            correct: false,
            explanation: WHY,
            correctOptionId: "1"
        } as Judgement as never);

        await open(encounter());

        await click(await screen.findByRole("button", { name: "10" }));
        await click(await screen.findByRole("button", { name: /try a simpler one/i }));

        for (const choice of [...document.querySelectorAll(".remediation .lesson-choice")]) {
            await click(choice);

            const back = screen.queryByRole("button", { name: /back to the question/i });

            if (back) {
                await click(back);
                break;
            }
        }

        // Miss it again, now that the repair has been spent.
        await click(await screen.findByRole("button", { name: "10" }));

        expect(
            await screen.findByRole("button", { name: /back to the explanation/i }),
            "the explanation is the primary offer"
        ).toBeTruthy();

        expect(
            screen.getByRole("button", { name: /try again anyway/i }),
            "and pushing on is still allowed"
        ).toBeTruthy();
    });

    it("returns to the teaching, not a dead end, when the learner asks to relearn", async () => {
        vi.mocked(api.post).mockResolvedValue({
            correct: false,
            explanation: WHY,
            correctOptionId: "1"
        } as Judgement as never);

        const { container } = await open(encounter());

        await click(await screen.findByRole("button", { name: "10" }));
        await click(await screen.findByRole("button", { name: /try a simpler one/i }));

        for (const choice of [...document.querySelectorAll(".remediation .lesson-choice")]) {
            await click(choice);

            const back = screen.queryByRole("button", { name: /back to the question/i });

            if (back) {
                await click(back);
                break;
            }
        }

        await click(await screen.findByRole("button", { name: "10" }));
        await click(await screen.findByRole("button", { name: /back to the explanation/i }));

        // The teaching screen is what a learner needs here -- not a reset
        // question and not an apology.
        await waitFor(() =>
            expect(container.textContent).toMatch(/Got it|try one|Everything else you learn/i)
        );
    });

    it("gives the reasoning after a correct answer too", async () => {
        vi.mocked(api.post).mockResolvedValue({
            correct: true,
            explanation: WHY,
            correctOptionId: "1"
        } as Judgement as never);

        const { container } = await open(encounter());

        await click(await screen.findByRole("button", { name: "20" }));

        await waitFor(() => expect(container.textContent).toMatch(/Yes/));

        // A learner who guessed right needs the reason as much as one who missed.
        expect(container.textContent).toContain("A variable keeps one value at a time");
    });

    it("does not put the correct answer in the page before it is answered", async () => {
        const { container } = await open(encounter());

        await screen.findByRole("button", { name: "20" });

        expect(container.innerHTML).not.toMatch(/is_correct|isCorrect|correctOptionId/);
    });
});

describe("a rung with nothing built", () => {
    it("says so rather than pretending the ladder is shorter", async () => {
        const { container } = await open(
            encounter({
                currentRung: null,
                rungs: [
                    { demandSlug: "predict", demandOrder: 3, cleared: true, options: [] },
                    { demandSlug: "produce", demandOrder: 4, cleared: false, options: [] }
                ]
            })
        );

        await screen.findByText("Changing what a name holds");

        expect(container.textContent).toMatch(/not built yet/i);
        expect(container.textContent).toMatch(/write it/i);
    });
});

describe("a diagnose rung", () => {
    it("is answered in place rather than handed off to another game", async () => {
        const incident: Exercise = {
            challengeId: "77",
            kind: "incident",
            ask: "Which line is causing this?",
            brief: "After the burn the fuel should read 80. It still reads 100.",
            code: "let fuel = 100;\nlet spare = 100;\nspare = 80;\nconsole.log(fuel);",
            options: [
                { id: "5", text: "spare = 80;" },
                { id: "6", text: "console.log(fuel);" }
            ]
        };

        vi.mocked(api.get).mockImplementation(((path: string) =>
            path.includes("/exercise")
                ? Promise.resolve(incident)
                : Promise.resolve(
                      encounter({
                          currentRung: "diagnose",
                          rungs: [
                              {
                                  demandSlug: "diagnose",
                                  demandOrder: 6,
                                  cleared: false,
                                  options: [
                                      {
                                          challengeId: "77",
                                          difficulty: 2,
                                          content: { kind: "incident", id: "3" }
                                      }
                                  ]
                              }
                          ]
                      })
                  )) as never);

        const { container } = render(
            <MemoryRouter initialEntries={["/concept/reassignment"]}>
                <Routes>
                    <Route path="/concept/:concept" element={<EncounterPage />} />
                </Routes>
            </MemoryRouter>
        );

        await screen.findByText("Changing what a name holds");

        const ready = screen.queryByRole("button", { name: /got it/i });

        if (ready) await click(ready);

        // The bug report, the code, and the choice -- all on the concept page.
        expect(container.textContent).toMatch(/It still reads 100/);
        expect(await screen.findByRole("button", { name: "spare = 80;" })).toBeTruthy();
        expect(
            container.textContent,
            "the dead end this replaced"
        ).not.toMatch(/not available here yet/i);
    });
});

/**
 * The remediation loop.
 *
 *   wrong -> explanation -> a SIMPLER problem -> back to the original
 *
 * The rung is cleared by the original question and nothing else. Getting the
 * repair right is not evidence; it only returns the learner to what they missed.
 */
describe("repairing a wrong answer", () => {
    const wrong = { correct: false, explanation: WHY, correctOptionId: "1" } as Judgement;
    const right = { correct: true, explanation: WHY, correctOptionId: "1" } as Judgement;

    it("offers a simpler problem instead of the same question again", async () => {
        vi.mocked(api.post).mockResolvedValue(wrong as never);

        const { container } = await open(encounter());

        await click(await screen.findByRole("button", { name: "10" }));
        await waitFor(() => expect(container.textContent).toMatch(/Not quite/));

        const repair = await screen.findByRole("button", { name: /try a simpler one/i });

        await click(repair);

        // A DIFFERENT question, from the concept's own authored content.
        expect(container.textContent).toMatch(/a simpler one first/i);
        expect(
            container.textContent,
            "not the original question repeated"
        ).not.toContain(EXERCISE.code!);
    });

    it("records nothing while the learner is repairing", async () => {
        vi.mocked(api.post).mockResolvedValue(wrong as never);

        await open(encounter());

        await click(await screen.findByRole("button", { name: "10" }));
        await click(await screen.findByRole("button", { name: /try a simpler one/i }));

        const postsBefore = vi.mocked(api.post).mock.calls.length;
        const choices = [...document.querySelectorAll(".remediation .lesson-choice")];

        expect(choices.length, "the repair has choices").toBeGreaterThan(1);

        for (const choice of choices) {
            await click(choice);
        }

        // Judged in the browser. No answer, no completion, no demonstration.
        expect(vi.mocked(api.post).mock.calls.length, "no evidence created").toBe(postsBefore);
    });

    it("returns to the original question once the repair is solved", async () => {
        vi.mocked(api.post).mockResolvedValue(wrong as never);

        const { container } = await open(encounter());

        await click(await screen.findByRole("button", { name: "10" }));
        await click(await screen.findByRole("button", { name: /try a simpler one/i }));

        // Solve the repair: its correct choice, then the way back.
        const solve = [...document.querySelectorAll(".remediation .lesson-choice")];

        for (const choice of solve) {
            await click(choice);

            const back = screen.queryByRole("button", { name: /back to the question/i });

            if (back) {
                await click(back);
                break;
            }
        }

        // The original question is live again, unanswered.
        const original = await screen.findByRole("button", { name: "20" });

        expect(original.hasAttribute("disabled")).toBe(false);
        expect(container.textContent).toContain(EXERCISE.code!);
        expect(container.textContent).not.toMatch(/a simpler one first/i);
    });

    it("clears the rung only when the original question is answered", async () => {
        vi.mocked(api.post).mockResolvedValue(wrong as never);

        await open(encounter());

        await click(await screen.findByRole("button", { name: "10" }));
        await click(await screen.findByRole("button", { name: /try a simpler one/i }));

        for (const choice of [...document.querySelectorAll(".remediation .lesson-choice")]) {
            await click(choice);

            const back = screen.queryByRole("button", { name: /back to the question/i });

            if (back) {
                await click(back);
                break;
            }
        }

        vi.mocked(api.post).mockResolvedValue(right as never);
        await click(await screen.findByRole("button", { name: "20" }));

        // The answer went to the server, which is what records the clearance.
        const answered = vi
            .mocked(api.post)
            .mock.calls.filter((c) => String(c[0]).includes("/answer"));

        expect(answered.length).toBeGreaterThan(0);
        expect(await screen.findByRole("button", { name: /keep going/i })).toBeTruthy();
    });

    it("falls back to a plain retry once the repair has been used", async () => {
        vi.mocked(api.post).mockResolvedValue(wrong as never);

        await open(encounter());

        await click(await screen.findByRole("button", { name: "10" }));
        await click(await screen.findByRole("button", { name: /try a simpler one/i }));

        for (const choice of [...document.querySelectorAll(".remediation .lesson-choice")]) {
            await click(choice);

            const back = screen.queryByRole("button", { name: /back to the question/i });

            if (back) {
                await click(back);
                break;
            }
        }

        await click(await screen.findByRole("button", { name: "10" }));

        // Round the same loop twice does not help. The honest offer is a retry.
        expect(screen.queryByRole("button", { name: /try a simpler one/i })).toBeNull();
        expect(await screen.findByRole("button", { name: /try again/i })).toBeTruthy();
    });
});
