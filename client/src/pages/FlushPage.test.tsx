import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlushPage } from "./FlushPage.js";

/**
 * What a beginner is told before their first Flush round.
 *
 * Playtest finding: a learner did not understand Flush. Every snippet is from
 * the Async topic, the first round turns on setTimeout(..., 0), and the intro
 * said only "Place each line of output in the order it prints". These pin the
 * five things the intro now answers -- what is practised, what to do, how to
 * interact, how it relates to JavaScript, and that a mistake explains itself.
 */
beforeEach(() => {
    vi.stubGlobal("fetch", (input: string) =>
        Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve(String(input) === "/api/me/sessions/resumable" ? { sessions: [] } : {})
        } as Response)
    );
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const open = async () => {
    render(
        <MemoryRouter initialEntries={["/flush"]}>
            <FlushPage />
        </MemoryRouter>
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: /start flush/i })).not.toBeNull());
};

describe("the Flush intro", () => {
    it("says what is being practiced, and that it follows the learner's path", async () => {
        await open();
        expect(screen.getByText(/what you are practicing/i)).toBeTruthy();
        expect(screen.getByText(/the way javascript runs it: line by line/i)).toBeTruthy();
        expect(screen.getByText(/uses ideas you have already met/i)).toBeTruthy();
    });

    it("says how to interact before the clock starts", async () => {
        await open();
        expect(screen.getByText(/tap the outputs in the order they appear/i)).toBeTruthy();
        expect(screen.getByText(/shows you the real order, and why/i)).toBeTruthy();
    });

    it("works one example through, stating the rule the game turns on", async () => {
        await open();
        const example = document.querySelector(".game-howto pre")!;
        expect(example.textContent).toBe('console.log("Ready");\nconsole.log(2 + 3);\nconsole.log("Go");');
        expect(screen.getByText(/a sum is worked out before it is displayed/i)).toBeTruthy();
        // The example uses nothing a first lesson has not shown.
        expect(example.textContent).not.toMatch(/setTimeout|Promise|=>/);
    });

    it("keeps the guidance readable by assistive technology", async () => {
        await open();
        expect(document.querySelector(".game-intro-howto")!.closest('[aria-hidden="true"]')).toBeNull();
    });
});

describe("before a learner can fill a Flush game", () => {
    it("points at the learning path, which is what opens puzzles", async () => {
        const message =
            "Flush needs at least 3 puzzles about ideas you have learned. So far 2 are open. Puzzles open as you work through lessons on your Journey, or meet ideas in Code Blitz.";
        vi.stubGlobal("fetch", (input: string, init?: RequestInit) =>
            Promise.resolve(
                String(input) === "/api/flush/sessions" && init?.method === "POST"
                    ? ({
                          ok: false,
                          status: 503,
                          json: () =>
                              Promise.resolve({
                                  error: "Not enough to play yet",
                                  details: [{ field: "snippets", message }],
                                  practice: null
                              })
                      } as Response)
                    : ({ ok: true, status: 200, json: () => Promise.resolve({ sessions: [] }) } as Response)
            )
        );
        await open();
        fireEvent.click(screen.getByRole("button", { name: /start flush/i }));

        await waitFor(() => expect(screen.queryByText(/not enough for a flush game yet/i)).not.toBeNull(), { timeout: 4000 });
        expect(screen.getByText(message)).toBeTruthy();
        expect(screen.queryByText(/flush interrupted/i)).toBeNull();
        // Lessons on the Journey open puzzles, so that is where it sends them.
        expect(screen.getByRole("link", { name: /see your journey/i }).getAttribute("href")).toBe("/journey");
        // No practice concept was named, so no second concept link.
        expect(screen.queryByRole("link", { name: /continue with/i })).toBeNull();
    });
});

describe("the reveal after a lost round", () => {
    const ROUND = {
        roundId: "r1",
        roundNumber: 1,
        totalRounds: 5,
        prompt: 'console.log("A");\nconsole.log("B");',
        tiles: [
            { id: "a", text: "A" },
            { id: "b", text: "B" },
            { id: "x", text: "undefined" }
        ],
        placed: [],
        totalOutputs: 2,
        pointsBanked: 0,
        limitMs: 60000,
        servedAt: new Date().toISOString(),
        deadlineAt: new Date(Date.now() + 60000).toISOString(),
        msRemaining: 60000
    };

    /** Plays round one, placing `tile` first, which the server calls wrong. */
    async function loseWith(tile: string, yourSequence: string[]) {
        vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
            const path = String(input);
            const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

            if (path === "/api/flush/sessions" && init?.method === "POST") {
                return json({ resumed: false, sessionId: "5", scoreSoFar: 0, round: ROUND });
            }
            if (path.endsWith("/placements")) {
                return json({
                    outcome: "wrong",
                    roundEnded: true,
                    pointsBanked: 0,
                    roundScore: 0,
                    scoreSoFar: 0,
                    correctSequence: ["A", "B"],
                    yourSequence,
                    explanation: null,
                    credited: false,
                    complete: false,
                    round: null,
                    session: null
                });
            }
            return json({ sessions: [] });
        });

        await open();
        fireEvent.click(screen.getByRole("button", { name: /start flush/i }));
        const button = await screen.findByRole("button", { name: tile }, { timeout: 5000 });
        expect(screen.getByText(/finish the order to/i)).toBeTruthy();
        fireEvent.click(button);
        await screen.findByRole("status", {}, { timeout: 3000 });
    }

    it("says a line that never prints never prints, rather than 'Wrong order'", async () => {
        await loseWith("undefined", ["undefined"]);

        expect(screen.getByText(/that line never prints · kept 0/i)).toBeTruthy();
        expect(screen.queryByText(/wrong order/i)).toBeNull();
    });

    it("still says 'Wrong order' when a real line was placed too early", async () => {
        await loseWith("B", ["B"]);

        expect(screen.getByText(/wrong order · kept 0/i)).toBeTruthy();
        expect(screen.queryByText(/never prints/i)).toBeNull();
    });

    it("drops the stake line once the round is over: there is nothing left to win", async () => {
        await loseWith("B", ["B"]);

        expect(screen.queryByText(/finish the order to/i)).toBeNull();
        expect(screen.queryByText(/points so far/i)).toBeNull();
    });
});


describe("the reveal waits for the learner", { timeout: 20000 }, () => {
    // UX audit: the reveal -- the two orders side by side, and why -- vanished
    // after 2.6 seconds, and a round that ran out of time vanished with no
    // reveal at all. Both now stay until the learner presses on, and nothing is
    // fetched before then, so the next round's clock does not start early.
    const round = (over: Record<string, unknown> = {}) => ({
        roundId: "r1",
        roundNumber: 1,
        totalRounds: 5,
        prompt: 'console.log("A");\nconsole.log("B");',
        tiles: [
            { id: "a", text: "A" },
            { id: "b", text: "B" }
        ],
        placed: [],
        totalOutputs: 2,
        pointsBanked: 0,
        limitMs: 60000,
        servedAt: new Date().toISOString(),
        deadlineAt: new Date(Date.now() + 60000).toISOString(),
        msRemaining: 60000,
        ...over
    });

    /** Starts a game on `first`, recording every request; returns the GET log. */
    async function startWith(first: ReturnType<typeof round>) {
        const gets: string[] = [];
        // No game in progress until this one starts, as on a first visit.
        let started = false;
        vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
            const path = String(input);
            const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

            if (!init?.method || init.method === "GET") gets.push(path);
            if (path === "/api/flush/sessions" && init?.method === "POST") {
                started = true;
                gets.push("START");
                return json({ resumed: false, sessionId: "5", scoreSoFar: 0, round: first });
            }
            if (path.endsWith("/placements")) {
                return json({
                    outcome: "wrong",
                    roundEnded: true,
                    pointsBanked: 0,
                    roundScore: 0,
                    scoreSoFar: 0,
                    correctSequence: ["A", "B"],
                    yourSequence: ["B"],
                    explanation: "Lines run top to bottom.",
                    credited: false,
                    complete: false,
                    round: null,
                    session: null
                });
            }
            if (path === "/api/flush/sessions/current") {
                return started
                    ? json({ complete: false, sessionId: "5", scoreSoFar: 0, round: round({ roundId: "r2", roundNumber: 2 }) })
                    : Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "No Flush game in progress" }) } as Response);
            }
            return json({ sessions: [] });
        });

        await open();
        fireEvent.click(screen.getByRole("button", { name: /start flush/i }));
        // "B" is a tile in every round here; "A" is already placed in one.
        await screen.findByRole("button", { name: "B" }, { timeout: 5000 });

        return gets;
    }

    /** Fetches of the next round, after the game started (the mount check is not one). */
    const currentFetches = (gets: string[]) =>
        gets.slice(gets.indexOf("START") + 1).filter((p) => p === "/api/flush/sessions/current").length;

    it("keeps a lost round's reveal on screen until Next round is pressed", async () => {
        const gets = await startWith(round());

        fireEvent.click(screen.getByRole("button", { name: "B" }));
        await screen.findByText("Lines run top to bottom.", {}, { timeout: 3000 });

        // The round is over, so its clock stops with it.
        const held = screen.getByRole("timer").getAttribute("aria-label");

        // Past the old 2.6 seconds, still there, and nothing fetched.
        await act(() => new Promise((r) => setTimeout(r, 3000)));
        expect(screen.getByText("Lines run top to bottom.")).toBeTruthy();
        expect(currentFetches(gets)).toBe(0);
        expect(screen.getByRole("timer").getAttribute("aria-label")).toBe(held);

        fireEvent.click(screen.getByRole("button", { name: "Next round" }));
        await waitFor(() => expect(currentFetches(gets)).toBe(1));
    });

    it("says a round ran out of time, shows what was placed, and invents no order", async () => {
        const gets = await startWith(
            round({
                placed: [{ outputId: "a", text: "A" }],
                tiles: [{ id: "b", text: "B" }],
                limitMs: 400,
                deadlineAt: new Date(Date.now() + 2800).toISOString()
            })
        );

        expect(await screen.findByText("Out of time", {}, { timeout: 4000 })).toBeTruthy();
        expect(screen.getByText(/the round ended before the order was finished\. you placed 1 of 2 lines\./i)).toBeTruthy();
        expect(screen.getByText("You placed")).toBeTruthy();
        // The real order is not known to the client, so none is shown or marked.
        expect(screen.queryByText("Actually ran")).toBeNull();
        expect(screen.queryByText(/kept/)).toBeNull();

        // Not moved on until the learner says so -- the round is recorded as
        // timed out by the same request as before, just not until then.
        expect(currentFetches(gets)).toBe(0);
        fireEvent.click(screen.getByRole("button", { name: "Next round" }));
        await waitFor(() => expect(currentFetches(gets)).toBe(1));
    });

    it("offers the results after the last round instead of a next one", async () => {
        await startWith(round({ roundNumber: 5, limitMs: 400, deadlineAt: new Date(Date.now() + 2800).toISOString() }));

        await screen.findByText("Out of time", {}, { timeout: 4000 });
        expect(screen.getByRole("button", { name: "See results" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Next round" })).toBeNull();
    });
});

describe("Flush, resumed after a reload", { timeout: 20000 }, () => {
    // Final learner audit: arriving mid-run restored the round but not the
    // run's id, and place() returns early without one -- so after a reload no
    // tile did anything, and each round could only run out of time. The same
    // bug Code Blitz had, fixed there in browser QA.
    it("places a tile against the run it belongs to", async () => {
        const posts: string[] = [];
        vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
            const path = String(input);
            const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

            if (init?.method === "POST") posts.push(path);
            if (path === "/api/flush/sessions/current") {
                return json({
                    complete: false,
                    sessionId: "43",
                    scoreSoFar: 0,
                    round: {
                        roundId: "r3",
                        roundNumber: 3,
                        totalRounds: 5,
                        prompt: 'console.log("A");\nconsole.log("B");',
                        tiles: [
                            { id: "a", text: "A" },
                            { id: "b", text: "B" }
                        ],
                        placed: [],
                        totalOutputs: 2,
                        pointsBanked: 0,
                        limitMs: 60000,
                        servedAt: new Date().toISOString(),
                        deadlineAt: new Date(Date.now() + 60000).toISOString(),
                        msRemaining: 60000
                    }
                });
            }
            if (path.endsWith("/placements")) {
                return json({ outcome: "correct", roundEnded: false, pointsBanked: 10, roundScore: null, scoreSoFar: 10, correctSequence: null, yourSequence: null, explanation: null, credited: false, complete: false, round: null, session: null });
            }
            return json({ sessions: [] });
        });

        render(
            <MemoryRouter initialEntries={["/flush"]}>
                <FlushPage />
            </MemoryRouter>
        );

        // Straight back into the round: no entrance, no Start.
        fireEvent.click(await screen.findByRole("button", { name: "A" }, { timeout: 5000 }));

        await waitFor(() => expect(posts).toEqual(["/api/flush/sessions/43/placements"]));
    });
});

describe("arriving when Flush cannot be dealt yet", () => {
    const stub = (readiness: unknown, current: unknown = {}) =>
        vi.stubGlobal("fetch", (input: string) => {
            const url = String(input);
            const body =
                url === "/api/me/sessions/resumable"
                    ? { sessions: [] }
                    : url === "/api/flush/readiness"
                      ? readiness
                      : url === "/api/flush/sessions/current"
                        ? current
                        : {};
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
        });

    const render_ = () =>
        render(
            <MemoryRouter initialEntries={["/flush"]}>
                <FlushPage />
            </MemoryRouter>
        );

    it("says why on arrival, before anything is pressed, and offers the way in", async () => {
        stub({ ready: false, message: "Flush needs at least 3 puzzles about ideas you have learned. None are open yet." });
        render_();

        expect(await screen.findByText(/not enough for a flush game yet/i)).toBeTruthy();
        expect(screen.getByText(/None are open yet/)).toBeTruthy();
        expect(screen.queryByRole("button", { name: /start flush/i })).toBeNull();
        expect(screen.getByRole("link", { name: /see your journey/i }).getAttribute("href")).toBe("/journey");
    });

    it("shows the normal intro when a game can be dealt", async () => {
        stub({ ready: true, message: null });
        render_();

        expect(await screen.findByRole("button", { name: /start flush/i })).toBeTruthy();
        expect(screen.queryByText(/not enough for a flush game yet/i)).toBeNull();
    });

    it("never blocks a run already in progress, whatever readiness says", async () => {
        stub(
            { ready: false, message: "Flush needs at least 3 puzzles." },
            {
                sessionId: "7",
                scoreSoFar: 0,
                round: {
                    roundId: "1", roundNumber: 1, totalRounds: 3, prompt: 'console.log("a");\nconsole.log("b");',
                    tiles: [{ id: "a", text: "a" }, { id: "b", text: "b" }], placed: [], totalOutputs: 2,
                    pointsBanked: 0, servedAt: new Date().toISOString(), deadlineAt: new Date(Date.now() + 40000).toISOString(),
                    limitMs: 40000, msRemaining: 40000
                }
            }
        );
        render_();

        await waitFor(() => expect(document.querySelector(".game.flush")).not.toBeNull());
        expect(screen.queryByText(/not enough for a flush game yet/i)).toBeNull();
    });
});

describe("resuming a paused Flush game after a reload", () => {
    it("shows the round, not the intro, and a tile press reaches the server with the run's id", async () => {
        const ROUND = {
            roundId: "1", roundNumber: 1, totalRounds: 3, prompt: 'console.log("a");\nconsole.log("b");',
            tiles: [{ id: "a", text: "a" }, { id: "b", text: "b" }], placed: [], totalOutputs: 2,
            pointsBanked: 0, servedAt: new Date().toISOString(), deadlineAt: new Date(Date.now() + 40000).toISOString(),
            limitMs: 40000, msRemaining: 40000
        };
        const calls: string[] = [];
        vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
            const url = String(input);
            calls.push(`${init?.method ?? "GET"} ${url}`);
            const body =
                url === "/api/me/sessions/resumable"
                    ? { sessions: [{ game: { slug: "flush", name: "Flush" }, status: "paused", unitsDone: 0, unitsTotal: 3, score: 0 }] }
                    : url === "/api/flush/sessions" && init?.method === "POST"
                      ? { resumed: true, sessionId: "77", scoreSoFar: 0, round: ROUND }
                      : url.endsWith("/placements")
                        ? { correct: true, roundEnded: false, round: ROUND, scoreSoFar: 10 }
                        : {};
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
        });

        render(
            <MemoryRouter initialEntries={["/flush"]}>
                <FlushPage />
            </MemoryRouter>
        );

        fireEvent.click(await screen.findByRole("button", { name: /resume/i }));

        // After the count-in, the round -- not the intro with its Start button.
        await waitFor(() => expect(document.querySelector(".game.flush")).not.toBeNull(), { timeout: 8000 });
        expect(screen.queryByRole("button", { name: /start flush/i })).toBeNull();

        fireEvent.click(screen.getAllByRole("button", { name: "a" })[0]!);
        await waitFor(() => expect(calls).toContain("POST /api/flush/sessions/77/placements"));
    }, 15000);
});
