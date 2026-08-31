import { act, cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BugHuntIncident, BugHuntSessionSummary } from "../api/types.js";
import { ALERT_MS, BugHuntPage, CHECK_STEP_MS, RECOVERY_MS } from "./BugHuntPage.js";
import { alertLine, severityLabel } from "../games/bugHuntVoice.js";
import { BugHuntResultsPage } from "./BugHuntResultsPage.js";

configure({ asyncUtilTimeout: 5000 });

const FIND_LINE: BugHuntIncident = {
    roundId: "1",
    incidentNumber: 1,
    totalIncidents: 5,
    isBoss: false,
    title: "Profile service returning incomplete data",
    theme: "profiles",
    bugReport: "Opening certain profiles crashes the page.",
    errorLog: "TypeError: Cannot read properties of undefined (reading 'name')",
    challengeType: "find_line",
    code: "function getDisplayName(users, id) {\n  const user = users.find(u => u.id === id);\n  return user.name;\n}",
    codeLanguage: "javascript",
    difficulty: 1,
    options: [
        { id: "11", text: "const user = users.find(u => u.id === id);", lineNumber: 2 },
        { id: "12", text: "return user.name;", lineNumber: 3 }
    ],
    timeLimitMs: 57000,
    remainingMs: 57000,
    attemptsRemaining: 2,
    hintsUsed: 0,
    hintsAvailable: 3
};

const CHOOSE_PATCH: BugHuntIncident = {
    ...FIND_LINE,
    roundId: "2",
    incidentNumber: 2,
    title: "Checkout totals wrong",
    theme: "payments",
    errorLog: null,
    challengeType: "choose_patch",
    options: [
        { id: "21", text: "quantity: Number(current) + 1", lineNumber: null },
        { id: "22", text: 'quantity: current + "1"', lineNumber: null }
    ]
};

const RESOLVED_TO_BOSS = {
    action: "diagnose",
    outcome: "resolved",
    correct: true,
    explanation: "That was it.",
    attemptsRemaining: 1,
    pointsAwarded: 190,
    streak: 4,
    scoreSoFar: 600,
    systemIntegrity: 100,
    complete: false,
    session: null
};

const BOSS: BugHuntIncident = { ...FIND_LINE, roundId: "5", incidentNumber: 5, isBoss: true };

const SUMMARY: BugHuntSessionSummary = {
    id: "900",
    status: "completed",
    score: 842,
    xpEarned: 105,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    totalIncidents: 5,
    incidentsResolved: 4,
    firstTryFixes: 3,
    hintsUsed: 2,
    bestStreak: 3,
    averageResolutionMs: 23400,
    systemIntegrity: 74,
    incidents: [
        {
            incidentNumber: 1,
            isBoss: false,
            title: "Profile service returning incomplete data",
            theme: "profiles",
            bugCategory: "array-access",
            difficulty: 1,
            status: "resolved",
            attempts: 1,
            hintsUsed: 0,
            resolutionMs: 18200,
            code: "",
            codeLanguage: "javascript",
            bugReport: "",
            correctOption: "return user.name;",
            explanation: "find() returns undefined when no element matches.",
            selectedOption: "return user.name;",
            pointsAwarded: 190
        },
        {
            incidentNumber: 3,
            isBoss: false,
            title: "Payments marked complete before they settle",
            theme: "payments",
            bugCategory: "async",
            difficulty: 3,
            status: "failed",
            attempts: 2,
            hintsUsed: 1,
            resolutionMs: null,
            code: "",
            codeLanguage: "javascript",
            bugReport: "",
            correctOption: "const charge = chargeCard(order.total);",
            explanation: "Without await, charge is a pending Promise.",
            selectedOption: "await recordAttempt(order.id);",
            pointsAwarded: 0
        }
    ],
    byCategory: [
        { category: "array-access", seen: 1, resolved: 1 },
        { category: "async", seen: 1, resolved: 0 }
    ]
};

/** Records every call so the tests can assert what the client actually sent. */
interface RecordedCall {
    path: string;
    /** Parsed request body, or null for a GET. Typed loosely on purpose: the
     *  tests assert on exactly which keys the client sent. */
    body: { action?: string; fresh?: boolean; [key: string]: unknown } | null;
}

interface Api {
    calls: RecordedCall[];
    incident: BugHuntIncident;
    diagnosis: unknown;
    hint: unknown;
    streak?: number;
    currentFails?: boolean;
}

function stubApi(over: Partial<Api> = {}) {
    const state: Api = {
        calls: [],
        incident: FIND_LINE,
        diagnosis: null,
        hint: null,
        ...over
    };

    const json = (status: number, body: unknown) =>
        Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response);

    vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
        const path = String(input);
        const body = init?.body ? JSON.parse(String(init.body)) : null;

        state.calls.push({ path, body });

        if (path === "/api/me/sessions/resumable") return json(200, { sessions: [] });

        if (path.startsWith("/api/users/me")) return json(200, { sessions: [], total: 0, totals: {} });

        if (path === "/api/bug-hunt/sessions" && init?.method === "POST") {
            return json(201, {
                resumed: false,
                complete: false,
                sessionId: "900",
                scoreSoFar: 0,
                systemIntegrity: 100,
                streak: state.streak ?? 0,
                incident: state.incident
            });
        }

        if (path === "/api/bug-hunt/sessions/current") {
            if (state.currentFails) return json(500, { error: "Server error" });
            return json(200, {
                complete: false,
                sessionId: "900",
                scoreSoFar: 190,
                systemIntegrity: 100,
                incident: CHOOSE_PATCH
            });
        }

        if (path.endsWith("/diagnoses")) {
            if (body?.action === "reveal-hint") {
                return json(200, {
                    action: "reveal-hint",
                    hint: { order: state.calls.filter((c) => c.body?.action === "reveal-hint").length, text: "Check what find() returns." },
                    hintsUsed: state.calls.filter((c) => c.body?.action === "reveal-hint").length,
                    hintsRemaining: 2,
                    systemIntegrity: 98
                });
            }
            return json(200, state.diagnosis);
        }

        if (path.startsWith("/api/bug-hunt/sessions/")) return json(200, { session: SUMMARY });

        return json(404, { error: "Not Found" });
    });

    return state;
}

const renderGame = () =>
    render(
        <MemoryRouter initialEntries={["/bug-hunt"]}>
            <BugHuntPage />
        </MemoryRouter>
    );

const renderResults = () =>
    render(
        <MemoryRouter initialEntries={["/bug-hunt/results/900"]}>
            <Routes>
                <Route path="/bug-hunt/results/:id" element={<BugHuntResultsPage />} />
            </Routes>
        </MemoryRouter>
    );

const startHunt = async () => {
    await waitFor(() => expect(screen.queryByRole("button", { name: /start hunt/i })).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /start hunt/i }));

    // The alert lands before anything is fetched -- that ordering is what keeps
    // the incident's clock from running while the player reads the alert.
    await waitFor(() => expect(screen.queryByText(/incoming/i)).not.toBeNull());
    await skipBeat(ALERT_MS);
};

beforeEach(() => {
    // The alert and recovery beats are real timeouts. Waiting them out made this
    // suite take 44 seconds; shouldAdvanceTime keeps promises resolving normally
    // while letting the tests step over the beats deliberately.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.unstubAllGlobals();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

/** Steps past a beat that is deliberately blocking the flow. */
const skipBeat = async (ms: number) => {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms + 50);
    });
};

/** Three checks plus the hand-off, played after the server has already judged. */
const skipDiagnostic = () => skipBeat(CHECK_STEP_MS * 4);

describe("the briefing", () => {
    it("sets up the fantasy before anything is asked of the player", async () => {
        stubApi();
        renderGame();

        await waitFor(() => expect(screen.queryByText(/system alert/i)).not.toBeNull());

        // The briefing said "five" long after the run became ten hunts. Pinned to
        // ten so the copy and the deal cannot drift apart again unnoticed.
        expect(screen.queryByText(/ten incidents detected/i)).not.toBeNull();
        expect(screen.queryByRole("button", { name: /start hunt/i })).not.toBeNull();
    });

    it("shows a loading state before it knows anything", () => {
        stubApi();
        renderGame();

        expect(screen.queryByText(/scanning for incidents/i)).not.toBeNull();
    });
});

describe("the alert beat", () => {
    it("announces the incident before anything is fetched", async () => {
        // The ordering IS the feature. GET /sessions/current stamps served_at,
        // so an alert shown after it would run the clock down while the player
        // reads -- the bug that cost Code Blitz and Flush seconds per unit.
        const api = stubApi();
        renderGame();

        await waitFor(() =>
            expect(screen.queryByRole("button", { name: /start hunt/i })).not.toBeNull()
        );
        fireEvent.click(screen.getByRole("button", { name: /start hunt/i }));

        await waitFor(() => expect(screen.queryByText(/incident 1 incoming/i)).not.toBeNull());

        // Nothing has been served yet.
        expect(api.calls.filter((c) => c.path === "/api/bug-hunt/sessions")).toHaveLength(0);
        expect(screen.queryByRole("timer")).toBeNull();
    });

    it("hands over to the incident once the beat is done", async () => {
        const api = stubApi();
        renderGame();
        await startHunt();

        await waitFor(() => expect(screen.queryByText(FIND_LINE.title)).not.toBeNull());
        expect(api.calls.filter((c) => c.path === "/api/bug-hunt/sessions")).toHaveLength(1);
    });

    it("speaks in the system's voice", async () => {
        stubApi();
        renderGame();

        await waitFor(() =>
            expect(screen.queryByRole("button", { name: /start hunt/i })).not.toBeNull()
        );
        fireEvent.click(screen.getByRole("button", { name: /start hunt/i }));

        await waitFor(() => expect(screen.queryByText(/^System$/)).not.toBeNull());
        expect(screen.queryByText(alertLine(1, false))).not.toBeNull();
    });

    it("marks the last incident as a critical failure, not just number five", async () => {
        stubApi({ diagnosis: RESOLVED_TO_BOSS, incident: { ...FIND_LINE, incidentNumber: 4 } });
        renderGame();
        await startHunt();

        await waitFor(() => expect(screen.queryAllByRole("radio").length).toBeGreaterThan(0));
        fireEvent.click(screen.getAllByRole("radio")[1]!);
        fireEvent.click(screen.getByRole("button", { name: /test patch/i }));
        await skipDiagnostic();

        await waitFor(() => expect(screen.queryByText(/patch successful/i)).not.toBeNull());
        await skipBeat(RECOVERY_MS);

        await waitFor(() =>
            expect(screen.queryByText(/critical system failure/i)).not.toBeNull()
        );
    });
});

describe("the incident screen", () => {
    it("shows what is broken, the evidence, and the clock", async () => {
        stubApi();
        renderGame();
        await startHunt();

        await waitFor(() => expect(screen.queryByText(FIND_LINE.title)).not.toBeNull());

        expect(screen.queryByText(/opening certain profiles/i)).not.toBeNull();
        expect(screen.queryByText(/TypeError/)).not.toBeNull();
        expect(screen.queryByRole("timer")).not.toBeNull();
        // Scoped: the integrity legend also says "Incident lost", so an
        // unscoped match finds two elements and asserts nothing useful.
        expect(document.querySelector(".round-label")?.textContent).toMatch(/hunt/i);

        // Severity was being dropped by the client entirely before this pass.
        expect(screen.queryByText(severityLabel(FIND_LINE.difficulty))).not.toBeNull();
        // The clock talks, rather than only counting.
        expect(screen.queryByText(/system holding/i)).not.toBeNull();
    });

    it("frames incident five as a critical failure", async () => {
        stubApi({ incident: BOSS });
        renderGame();
        await startHunt();

        await waitFor(() => expect(screen.queryByText(/critical system failure/i)).not.toBeNull());
    });

    it("does not frame ordinary incidents that way", async () => {
        stubApi();
        renderGame();
        await startHunt();

        await waitFor(() => expect(screen.queryByText(FIND_LINE.title)).not.toBeNull());
        expect(screen.queryByText(/critical system failure/i)).toBeNull();
    });
});

describe("the opening hunts are untimed", () => {
    const UNTIMED = { ...FIND_LINE, difficulty: 1, timeLimitMs: null, remainingMs: null };

    it("shows no countdown at all on a tier-one hunt", async () => {
        // Not a hidden clock or a very long one -- none. A bar on screen is the
        // game saying "you are being timed", and here that would be a lie.
        stubApi({ incident: UNTIMED as typeof FIND_LINE });
        renderGame();
        await startHunt();

        await waitFor(() => expect(screen.queryByText(UNTIMED.title)).not.toBeNull());
        expect(screen.queryByRole("timer")).toBeNull();
    });

    it("still shows the code and the choices", async () => {
        // Untimed must not mean stripped-down: it is a real hunt, just unhurried.
        stubApi({ incident: UNTIMED as typeof FIND_LINE });
        renderGame();
        await startHunt();

        await waitFor(() => expect(screen.queryAllByRole("radio").length).toBe(2));
        expect(screen.queryByText(/locate the fault/i)).not.toBeNull();
    });

    it("brings the clock back once the run gets harder", async () => {
        stubApi({ incident: { ...FIND_LINE, difficulty: 3 } });
        renderGame();
        await startHunt();

        await waitFor(() => expect(screen.queryByRole("timer")).not.toBeNull());
    });
});

describe("the run has a shape", () => {
    it("names where the player is, not just the number", async () => {
        stubApi();
        renderGame();
        await startHunt();

        await waitFor(() => expect(document.querySelector(".bh-phase")).not.toBeNull());
        expect(document.querySelector(".bh-phase")!.textContent).toMatch(/warming up/i);
    });

    it("counts hunts, not incidents", async () => {
        stubApi();
        renderGame();
        await startHunt();

        await waitFor(() =>
            expect(document.querySelector(".round-label")?.textContent).toMatch(/hunt/i)
        );
    });
});

describe("the streak", () => {
    it("survives a refresh, because the server remembers it", async () => {
        // It used to render 0 on a fresh serve while the server still held a run
        // of six. The streak is the thing the player is protecting; losing sight
        // of it loses the stake.
        stubApi({ streak: 6 });
        renderGame();
        await startHunt();

        await waitFor(() => expect(document.querySelector(".bh-streak-badge")).not.toBeNull());
        expect(document.querySelector(".bh-streak-n")!.textContent).toBe("6");
    });


    it("holds its own space from the first one", async () => {
        // It used to render only above one -- exactly when the player has nothing
        // invested in it yet, and so had nothing to lose.
        stubApi({
            diagnosis: {
                action: "diagnose",
                outcome: "resolved",
                correct: true,
                explanation: "Right.",
                attemptsRemaining: 1,
                pointsAwarded: 150,
                streak: 1,
                scoreSoFar: 150,
                systemIntegrity: 100,
                complete: false,
                session: null
            }
        });
        renderGame();
        await startHunt();

        await waitFor(() => expect(screen.queryAllByRole("radio").length).toBeGreaterThan(0));
        fireEvent.click(screen.getAllByRole("radio")[1]!);
        fireEvent.click(screen.getByRole("button", { name: /test patch/i }));
        await skipDiagnostic();

        await waitFor(() => expect(document.querySelector(".bh-streak-badge")).not.toBeNull());
        expect(document.querySelector(".bh-streak-n")!.textContent).toBe("1");
    });
});

describe("the trace price is shown where it is decided", () => {
    it("puts the cost on the button rather than in a permanent legend", async () => {
        stubApi();
        renderGame();
        await startHunt();

        await waitFor(() =>
            expect(screen.queryByRole("button", { name: /^trace/i })).not.toBeNull()
        );

        expect(screen.getByRole("button", { name: /^trace/i }).textContent).toMatch(/−\d+%/);
        // And the legend is gone from the gameplay screen entirely.
        expect(document.querySelector(".bh-integrity-costs")).toBeNull();
    });

    it("keeps the gameplay screen free of permanent status panels", async () => {
        stubApi();
        renderGame();
        await startHunt();

        await waitFor(() => expect(screen.queryByText(FIND_LINE.title)).not.toBeNull());
        expect(document.querySelector(".bh-services")).toBeNull();
        expect(document.querySelector(".bh-systembar")).toBeNull();
    });
});

describe("find_line", () => {
    it("makes the offered lines selectable and marks the choice", async () => {
        stubApi();
        renderGame();
        await startHunt();

        await waitFor(() => expect(screen.queryByText(FIND_LINE.title)).not.toBeNull());

        // Two options, so two of the four lines are choosable -- not all of them.
        const radios = screen.getAllByRole("radio");
        expect(radios).toHaveLength(2);

        // Nothing to test until a target is picked, and the label says so.
        expect(screen.getByRole("button", { name: /select a target/i })).toHaveProperty(
            "disabled",
            true
        );

        fireEvent.click(radios[1]!);

        expect((radios[1] as HTMLInputElement).checked).toBe(true);
        // Selecting is acknowledged as an act before anything is submitted.
        expect(screen.queryByText(/fault targeted/i)).not.toBeNull();
        expect(screen.getByRole("button", { name: /test patch/i })).toHaveProperty(
            "disabled",
            false
        );
    });

    it("tells the player what to do with them", async () => {
        stubApi();
        renderGame();
        await startHunt();

        await waitFor(() =>
            expect(screen.queryByText(/locate the fault/i)).not.toBeNull()
        );
    });
});

describe("choose_patch", () => {
    it("offers the patches as choices and marks the selection", async () => {
        stubApi({ incident: CHOOSE_PATCH });
        renderGame();
        await startHunt();

        await waitFor(() => expect(screen.queryByText(/deploy a patch/i)).not.toBeNull());

        const radios = screen.getAllByRole("radio");
        expect(radios).toHaveLength(2);

        fireEvent.click(radios[0]!);
        expect((radios[0] as HTMLInputElement).checked).toBe(true);
    });
});

describe("hints", () => {
    it("asks the server for the next one and never names it", async () => {
        const api = stubApi();
        renderGame();
        await startHunt();

        await waitFor(() => expect(screen.queryByRole("button", { name: /^trace/i })).not.toBeNull());
        fireEvent.click(screen.getByRole("button", { name: /^trace/i }));

        await waitFor(() => expect(screen.queryByText(/check what find\(\) returns/i)).not.toBeNull());

        const hintCall = api.calls.find((c) => c.body?.action === "reveal-hint");

        expect(hintCall).toBeDefined();
        expect(hintCall!.path).toMatch(/\/diagnoses$/);
        // The client must not tell the server which hint, or how many it has used.
        expect(Object.keys(hintCall!.body as object).sort()).toEqual(["action", "roundId"]);
    });

    it("reveals them one at a time, in order", async () => {
        stubApi();
        renderGame();
        await startHunt();

        await waitFor(() => expect(screen.queryByRole("button", { name: /^trace/i })).not.toBeNull());

        expect(document.querySelectorAll(".bh-hints li")).toHaveLength(0);

        fireEvent.click(screen.getByRole("button", { name: /^trace/i }));
        await waitFor(() => expect(document.querySelectorAll(".bh-hints li")).toHaveLength(1));

        fireEvent.click(screen.getByRole("button", { name: /^trace/i }));
        await waitFor(() => expect(document.querySelectorAll(".bh-hints li")).toHaveLength(2));
    });
});

describe("diagnosis feedback", () => {
    const submit = async () => {
        await waitFor(() => expect(screen.queryAllByRole("radio").length).toBeGreaterThan(0));
        fireEvent.click(screen.getAllByRole("radio")[1]!);
        fireEvent.click(screen.getByRole("button", { name: /test patch/i }));

        // The verdict is already decided; this just plays it back.
        await waitFor(() => expect(screen.queryByText(/running diagnostic/i)).not.toBeNull());
        await skipDiagnostic();
    };

    it("celebrates a fix with points and a streak", async () => {
        stubApi({
            diagnosis: {
                action: "diagnose",
                outcome: "resolved",
                correct: true,
                explanation: "find() returns undefined when nothing matches.",
                attemptsRemaining: 1,
                pointsAwarded: 190,
                streak: 3,
                scoreSoFar: 190,
                systemIntegrity: 100,
                complete: false,
                session: null
            }
        });
        renderGame();
        await startHunt();
        await submit();

        await waitFor(() => expect(screen.queryByText(/patch successful/i)).not.toBeNull());

        expect(screen.queryByText("+190")).not.toBeNull();
        expect(screen.queryByText(/streak ×3/i)).not.toBeNull();
        expect(screen.queryByText(/find\(\) returns undefined/i)).not.toBeNull();
    });

    it("keeps the incident open after one wrong patch", async () => {
        stubApi({
            diagnosis: {
                action: "diagnose",
                outcome: "retry",
                correct: false,
                explanation: "This line is fine.",
                attemptsRemaining: 1,
                pointsAwarded: 0,
                streak: 0,
                scoreSoFar: 0,
                systemIntegrity: 95,
                complete: false,
                session: null
            }
        });
        renderGame();
        await startHunt();
        await submit();

        await waitFor(() => expect(screen.queryByText(/patch rejected/i)).not.toBeNull());

        expect(screen.queryByText(/1 attempt left/i)).not.toBeNull();
        expect(screen.queryByText(/this line is fine/i)).not.toBeNull();
        // Still playable: the clock never stopped and the lines are still there.
        // The selection is cleared, so the action reverts to asking for a new
        // target rather than offering to re-test the one that just failed.
        expect(screen.queryByRole("button", { name: /select a target/i })).not.toBeNull();
        expect(screen.getAllByRole("radio").every((r) => !(r as HTMLInputElement).checked)).toBe(true);
        expect(screen.queryByText(/fault targeted/i)).toBeNull();
    });

    it("ends the incident after the second wrong patch", async () => {
        stubApi({
            diagnosis: {
                action: "diagnose",
                outcome: "failed",
                correct: false,
                explanation: "The real cause was line 3.",
                attemptsRemaining: 0,
                pointsAwarded: 0,
                streak: 0,
                scoreSoFar: 0,
                systemIntegrity: 80,
                complete: false,
                session: null
            }
        });
        renderGame();
        await startHunt();
        await submit();

        await waitFor(() => expect(screen.queryByText(/incident unresolved/i)).not.toBeNull());

        expect(screen.queryByText(/the real cause was line 3/i)).not.toBeNull();
        // No way to keep guessing.
        expect(screen.queryByRole("button", { name: /test patch/i })).toBeNull();
    });

    it("does not pull the next incident in the same breath", async () => {
        // The clock-start convention: the next incident is fetched separately,
        // after the recovery beat, so its timer starts when it is visible.
        const api = stubApi({
            diagnosis: {
                action: "diagnose",
                outcome: "resolved",
                correct: true,
                explanation: "Right.",
                attemptsRemaining: 1,
                pointsAwarded: 190,
                streak: 1,
                scoreSoFar: 190,
                systemIntegrity: 100,
                complete: false,
                session: null
            }
        });
        renderGame();
        await startHunt();
        await submit();

        await waitFor(() => expect(screen.queryByText(/patch successful/i)).not.toBeNull());

        expect(api.calls.filter((c) => c.path === "/api/bug-hunt/sessions/current")).toHaveLength(0);
    });
});

describe("the diagnostic run", () => {
    const RESOLVED = {
        action: "diagnose",
        outcome: "resolved",
        correct: true,
        explanation: "That was it.",
        attemptsRemaining: 1,
        pointsAwarded: 190,
        streak: 1,
        scoreSoFar: 190,
        systemIntegrity: 100,
        complete: false,
        session: null
    };

    it("submits the patch BEFORE it starts animating", async () => {
        // The ordering that matters. If the run played first and posted after,
        // the incident clock would keep ticking through the player's own success
        // sequence and could expire during it.
        const api = stubApi({ diagnosis: RESOLVED });
        renderGame();
        await startHunt();

        await waitFor(() => expect(screen.queryAllByRole("radio").length).toBeGreaterThan(0));
        fireEvent.click(screen.getAllByRole("radio")[1]!);
        fireEvent.click(screen.getByRole("button", { name: /test patch/i }));

        // The run is on screen and the POST has already happened.
        await waitFor(() => expect(screen.queryByText(/running diagnostic/i)).not.toBeNull());

        expect(
            api.calls.filter((c) => c.body?.action === "diagnose"),
            "the diagnosis must already be submitted"
        ).toHaveLength(1);
    });

    it("keeps the clock visible while the run plays", async () => {
        // A rejected patch leaves the incident open with the clock still going.
        // Hiding the countdown for the ~1.5s of the run would spend the player's
        // time somewhere they could not see it.
        stubApi({ diagnosis: { ...RESOLVED, outcome: "retry", correct: false } });
        renderGame();
        await startHunt();

        await waitFor(() => expect(screen.queryAllByRole("radio").length).toBeGreaterThan(0));
        fireEvent.click(screen.getAllByRole("radio")[1]!);
        fireEvent.click(screen.getByRole("button", { name: /test patch/i }));

        await waitFor(() => expect(screen.queryByText(/running diagnostic/i)).not.toBeNull());
        expect(screen.queryByRole("timer")).not.toBeNull();
    });

    it("holds the verdict back until the run finishes", async () => {
        stubApi({ diagnosis: RESOLVED });
        renderGame();
        await startHunt();

        await waitFor(() => expect(screen.queryAllByRole("radio").length).toBeGreaterThan(0));
        fireEvent.click(screen.getAllByRole("radio")[1]!);
        fireEvent.click(screen.getByRole("button", { name: /test patch/i }));

        await waitFor(() => expect(screen.queryByText(/running diagnostic/i)).not.toBeNull());
        expect(screen.queryByText(/patch successful/i)).toBeNull();

        await skipDiagnostic();
        await waitFor(() => expect(screen.queryByText(/patch successful/i)).not.toBeNull());
    });

    it("never names the bug category in its checks", async () => {
        // Naming it would tell the player what kind of bug they are looking at --
        // a free hint dressed up as scenery. The stages describe the pipeline.
        stubApi({ diagnosis: RESOLVED });
        renderGame();
        await startHunt();

        await waitFor(() => expect(screen.queryAllByRole("radio").length).toBeGreaterThan(0));
        fireEvent.click(screen.getAllByRole("radio")[1]!);
        fireEvent.click(screen.getByRole("button", { name: /test patch/i }));

        await waitFor(() => expect(screen.queryByText(/running diagnostic/i)).not.toBeNull());

        const checks = document.querySelector(".bh-checks")!.textContent ?? "";

        for (const leak of ["async", "off-by-one", "mutation", "scope", "coercion", "array"]) {
            expect(checks.toLowerCase(), `leaks "${leak}"`).not.toContain(leak);
        }
    });

    it("fails on the last check rather than refusing to start", async () => {
        stubApi({
            diagnosis: { ...RESOLVED, outcome: "retry", correct: false, explanation: "Not it." }
        });
        renderGame();
        await startHunt();

        await waitFor(() => expect(screen.queryAllByRole("radio").length).toBeGreaterThan(0));
        fireEvent.click(screen.getAllByRole("radio")[1]!);
        fireEvent.click(screen.getByRole("button", { name: /test patch/i }));

        await skipDiagnostic();

        // Reached the regression checks and did not hold -- not "pipeline refused".
        await waitFor(() => expect(document.querySelector(".bh-check.failed")).not.toBeNull());
        expect(document.querySelector(".bh-check.failed")!.textContent).toMatch(/regression/i);
    });
});

describe("failure states", () => {
    it("reports a lost connection instead of hanging", async () => {
        stubApi({ currentFails: true });
        vi.stubGlobal("fetch", () =>
            Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: "Boom" }) } as Response)
        );
        renderGame();

        await waitFor(() => expect(screen.queryByRole("button", { name: /start hunt/i })).not.toBeNull());
        fireEvent.click(screen.getByRole("button", { name: /start hunt/i }));

        await waitFor(() => expect(screen.queryByText(/connection lost/i)).not.toBeNull());
        expect(screen.queryByRole("alert")).not.toBeNull();
    });
});

describe("the mission report", () => {
    it("leads with the outcome and the score", async () => {
        stubApi();
        renderResults();

        await waitFor(() => expect(screen.queryByText("842")).not.toBeNull());

        // The debrief header, not the in-incident feedback -- different screen,
        // different wording.
        expect(screen.queryByText(/system stabilized/i)).not.toBeNull();
        expect(screen.queryByText(/4 of 5 incidents resolved/i)).not.toBeNull();
    });

    it("shows the run's real numbers", async () => {
        stubApi();
        renderResults();

        await waitFor(() => expect(screen.queryByText("842")).not.toBeNull());

        expect(screen.queryByText(/first-try fixes/i)).not.toBeNull();
        expect(screen.queryByText(/traces pulled/i)).not.toBeNull();
        expect(screen.queryByText(/final integrity/i)).not.toBeNull();
        expect(screen.queryByText("74%")).not.toBeNull();
        expect(screen.queryByText("+105")).not.toBeNull();
    });

    it("derives the readout only from categories the player actually met", async () => {
        stubApi();
        renderResults();

        await waitFor(() => expect(screen.queryByText(/strong today/i)).not.toBeNull());

        // Scoped to the readout: the category names also appear in the incident
        // log below, and an unscoped match would pass on the wrong element.
        const readout = document.querySelector(".bh-readout")!.textContent ?? "";

        // array-access: 1 seen, 1 resolved -> strong. async: 1 seen, 0 resolved -> practice.
        expect(readout).toMatch(/strong today/i);
        expect(readout).toMatch(/array access/i);
        expect(readout).toMatch(/keep practicing/i);
        expect(readout).toMatch(/async and await/i);
        // Never a category that was not in this run.
        expect(readout).not.toMatch(/scope and closures/i);
    });

    it("shows what the bug actually was, on failed incidents too", async () => {
        stubApi();
        renderResults();

        await waitFor(() => expect(screen.queryByText(/payments marked complete/i)).not.toBeNull());

        expect(screen.queryByText(/const charge = chargeCard\(order\.total\);/)).not.toBeNull();
        expect(screen.queryByText(/without await, charge is a pending promise/i)).not.toBeNull();
    });

    it("reports the fastest stabilisation of the run", async () => {
        // Derived from the rows below it rather than sent separately, so the two
        // cannot disagree. Fixture resolutions are 18.2s and 24.6s.
        stubApi();
        renderResults();

        await waitFor(() => expect(screen.queryByText(/fastest fix/i)).not.toBeNull());
        expect(screen.queryByText("18.2s")).not.toBeNull();
    });

    it("signs off honestly rather than flatteringly", async () => {
        // 4 of 5 resolved -- not a clean sweep, so it must not claim one.
        stubApi();
        renderResults();

        await waitFor(() => expect(document.querySelector(".bh-signoff")).not.toBeNull());

        const signoff = document.querySelector(".bh-signoff")!.textContent ?? "";

        expect(signoff).toMatch(/survived|better shift/i);
        expect(signoff).not.toMatch(/every service back online/i);
    });

    it("offers a replay and a way back", async () => {
        stubApi();
        renderResults();

        await waitFor(() => expect(screen.queryByRole("button", { name: /hunt again/i })).not.toBeNull());

        expect(screen.queryByRole("link", { name: /back to jolt/i })).not.toBeNull();
        expect(screen.queryByText(/different incidents/i)).not.toBeNull();
    });

    it("asks the server for a fresh run rather than shuffling anything itself", async () => {
        const api = stubApi();
        renderResults();

        await waitFor(() => expect(screen.queryByRole("button", { name: /hunt again/i })).not.toBeNull());
        fireEvent.click(screen.getByRole("button", { name: /hunt again/i }));

        await waitFor(() =>
            expect(
                api.calls.some(
                    (c) => c.path === "/api/bug-hunt/sessions" && c.body?.fresh === true
                )
            ).toBe(true)
        );
    });

    it("says so when the report cannot be loaded", async () => {
        vi.stubGlobal("fetch", () =>
            Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Gone" }) } as Response)
        );
        renderResults();

        await waitFor(() => expect(screen.queryByText(/report unavailable/i)).not.toBeNull());
        expect(screen.queryByRole("alert")).not.toBeNull();
    });
});
