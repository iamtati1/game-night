import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Encounter, Exercise, Judgement } from "../api/encounter.js";

vi.mock("../api/client.js", () => ({
    // Carries `body` like the real one: the screens that read a refusal read
    // the server's payload out of it, so a stub without it would let a test
    // pass over code that cannot work.
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

const { ApiError, api } = await import("../api/client.js");
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
        blockedBy: null,
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
        expect(container.textContent).toMatch(/variables · You’re here/i);
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

    it("names the concept that has to be finished first, and links straight to it", async () => {
        // UX audit: concepts open one at a time, in order, so a concept can be
        // locked with every one of its own prerequisites done. The server
        // names the real blocker; the screen used to show "builds on
        // something else" over an empty list instead.
        const { container } = await open(
            encounter({
                reachable: false,
                unmetPrerequisites: [],
                blockedBy: { kind: "concept", slug: "reading-variables", name: "Reading Variables" }
            })
        );

        expect(container.textContent).toMatch(/not open yet: reading variables comes first/i);
        expect(container.textContent).not.toMatch(/builds on something else/i);

        const go = screen.getByRole("link", { name: "Go to Reading Variables" });
        expect(go.getAttribute("href")).toBe("/concept/reading-variables");
        expect(go.className).toMatch(/primary/);
        expect(container.querySelectorAll("a.button.primary")).toHaveLength(1);
    });

    it("names the checkpoint when that is what comes first", async () => {
        const { container } = await open(
            encounter({
                reachable: false,
                unmetPrerequisites: [],
                blockedBy: { kind: "checkpoint", slug: "values", name: "Values and Types" }
            })
        );

        expect(container.textContent).toMatch(/the values and types checkpoint comes first/i);
        expect(
            screen.getByRole("link", { name: "Take the Values and Types checkpoint" }).getAttribute("href")
        ).toBe("/challenge/values");
    });

    it("invents no prerequisite when the server names no blocker, and goes back to the journey", async () => {
        const { container } = await open(
            encounter({ reachable: false, unmetPrerequisites: [], blockedBy: null })
        );

        expect(container.textContent).toMatch(/the steps before it on your journey come first/i);
        expect(container.querySelectorAll("a[href^='/concept/']")).toHaveLength(0);
        expect(screen.getByRole("link", { name: "See your journey" }).getAttribute("href")).toBe("/journey");
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
        // The server refuses a concept with nothing playable on it -- see
        // `evidenceFor`, which returns `unplayable` rather than `allowed`. The
        // page asks and is turned down; it does not decide for itself.
        vi.mocked(api.post).mockRejectedValue(
            new ApiError(409, "Nothing is built for this concept yet", [], {
                outstanding: [],
                unplayable: true
            }) as never
        );

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

        // And it is not reported as finished, which is what a hole in the
        // ladder used to be indistinguishable from.
        await screen.findByText(/nothing to practise here yet/i);
        expect(screen.queryByText("change a value after naming it")).toBeNull();
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

describe("a diagnose rung offers its hints", () => {
    it("reveals the authored hints one at a time, and stops offering them once answered", async () => {
        const incident: Exercise = {
            challengeId: "78",
            kind: "incident",
            ask: "Which line is causing this?",
            brief: "After the burn the fuel should read 80. It still reads 100.",
            code: "let fuel = 100;\nlet spare = 100;\nspare = 80;\nconsole.log(fuel);",
            options: [
                { id: "5", text: "spare = 80;" },
                { id: "6", text: "console.log(fuel);" }
            ],
            hints: ["Which name is given 80?", "The board logs `fuel`, but it was `spare` that changed."]
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
                                  options: [{ challengeId: "78", difficulty: 1, content: { kind: "incident", id: "4" } }]
                              }
                          ]
                      })
                  )) as never);
        vi.mocked(api.post).mockResolvedValue({ correct: true, explanation: WHY, correctOptionId: "5" } as never);

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

        // None shown until asked for: the first look is the learner's own.
        const first = await screen.findByRole("button", { name: /show a hint \(2 left\)/i });
        expect(screen.queryByText("Which name is given 80?")).toBeNull();

        await click(first);
        expect(screen.getByText("Which name is given 80?")).toBeTruthy();
        expect(screen.queryByText(/it was/)).toBeNull();

        await click(screen.getByRole("button", { name: /show another hint \(1 left\)/i }));
        expect(screen.getByText(/it was/)).toBeTruthy();
        expect(screen.queryByRole("button", { name: /show (a|another) hint/i })).toBeNull();

        await click(screen.getByRole("button", { name: "spare = 80;" }));
        await screen.findByText("Yes");
        expect(screen.queryByRole("button", { name: /show (a|another) hint/i })).toBeNull();
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

/**
 * THE MODULE THAT WOULD NOT UNLOCK.
 *
 * A concept's rungs are cleared by EVIDENCE, and evidence is produced by Code
 * Blitz and Bug Hunt as well as by this screen. So a learner can arrive at a
 * concept whose ladder is already behind them -- and the screen used to print
 * "You have done everything here." and a link back to the world, without ever
 * recording the concept. It stayed `current` for good, its topic never
 * completed, and the module after it never opened. The learner was told they
 * had finished and watched nothing unlock, which is exactly what it looks like
 * from the outside.
 *
 * Both halves are asserted: the record is made when the server accepts it, and
 * the arrival is NOT shown when the server refuses.
 */
describe("a concept whose stops are all behind the learner", () => {
    const FINISHED = encounter({
        currentRung: null,
        demonstrated: false,
        rungs: [
            { demandSlug: "predict", demandOrder: 3, cleared: true, options: [] },
            { demandSlug: "diagnose", demandOrder: 6, cleared: true, options: [] }
        ]
    });

    /** Enough of a path for the arrival to render against. */
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
                        rungs: { cleared: 2, playable: 2 }
                    }
                ],
                challenge: null
            }
        ],
        current: null,
        points: { total: 25, concepts: 25, challenges: 0 }
    };

    async function arrive(post: () => Promise<unknown>) {
        vi.mocked(api.get).mockImplementation(((path: string) =>
            path.includes("/curriculum/path")
                ? Promise.resolve(PATH)
                : Promise.resolve(FINISHED)) as never);
        vi.mocked(api.post).mockImplementation(post as never);

        render(
            <MemoryRouter initialEntries={["/concept/reassignment"]}>
                <Routes>
                    <Route path="/concept/:concept" element={<EncounterPage />} />
                </Routes>
            </MemoryRouter>
        );

        await screen.findByText(FINISHED.name);

        const ready = screen.queryByRole("button", { name: /got it/i });

        if (ready) await click(ready);
    }

    it("records the concept rather than dead-ending on it", async () => {
        await arrive(() => Promise.resolve({ demonstrated: true }));

        await waitFor(() =>
            expect(
                vi.mocked(api.post).mock.calls.some(([path]) =>
                    String(path).endsWith("/concepts/reassignment/demonstrate")
                ),
                "the finished ladder is reported to the server"
            ).toBe(true)
        );

        // The arrival, not the cul-de-sac.
        await screen.findByText("change a value after naming it");
        expect(screen.queryByText(/you have done everything here/i)).toBeNull();
    });

    it("says so on the button before the learner commits to it", async () => {
        vi.mocked(api.get).mockImplementation(((path: string) =>
            path.includes("/curriculum/path")
                ? Promise.resolve(PATH)
                : Promise.resolve(FINISHED)) as never);

        render(
            <MemoryRouter initialEntries={["/concept/reassignment"]}>
                <Routes>
                    <Route path="/concept/:concept" element={<EncounterPage />} />
                </Routes>
            </MemoryRouter>
        );

        await screen.findByText(FINISHED.name);

        const ready = screen.queryByRole("button", { name: /got it/i });

        // Only asserted where the concept has authored teaching to sit behind.
        if (ready) expect(ready.textContent).toMatch(/finish this concept/i);
    });

    it("shows no completion at all when the server refuses the record", async () => {
        await arrive(() =>
            Promise.reject(new ApiError(409, "Not everything here has been done yet"))
        );

        await screen.findByText(/not everything here has been done yet/i);

        // The capability line is the arrival. It must not appear over a refusal.
        expect(screen.queryByText("change a value after naming it")).toBeNull();
    });
});
