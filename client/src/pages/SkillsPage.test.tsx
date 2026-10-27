import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JourneyConcept, JourneyPathResponse, JourneyTopic } from "../api/types.js";

/**
 * The Skills hub: a tree of every skill with an honest state, a summary, and
 * one recommendation -- all read from GET /api/curriculum/path, nothing sent.
 */

vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {},
    api: { get: vi.fn(), post: vi.fn() }
}));

const { api } = await import("../api/client.js");
const { SkillsPage } = await import("./SkillsPage.js");

const c = (slug: string, name: string, state: JourneyConcept["state"], cleared = 0, playable = 2, neededRetry = false): JourneyConcept => ({
    slug,
    name,
    objective: `use ${name.toLowerCase()}`,
    state,
    neededRetry,
    rungs: { cleared, playable }
});

const t = (slug: string, name: string, state: JourneyTopic["state"], concepts: JourneyConcept[], challenge: JourneyTopic["challenge"] = null): JourneyTopic => ({
    slug,
    name,
    principle: "",
    order: 1,
    state,
    concepts,
    challenge
});

const PATH: JourneyPathResponse = {
    topics: [
        t("values", "Values", "complete", [c("console-output", "Console output", "demonstrated", 2, 2), c("arithmetic", "Arithmetic", "demonstrated", 2, 2, true)], { state: "demonstrated" }),
        t("variables", "Variables", "current", [c("declaration", "Declaration", "current", 1, 3), c("assignment", "Assignment", "locked")], { state: "locked" }),
        t("loops", "Loops", "locked", [c("for-loop", "For loops", "locked")])
    ],
    current: { ...c("declaration", "Declaration", "current", 1, 3), topic: "variables" },
    points: { total: 50, concepts: 2, challenges: 1 }
};

function renderSkills() {
    return render(
        <MemoryRouter>
            <SkillsPage />
        </MemoryRouter>
    );
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockResolvedValue(PATH);
});
afterEach(cleanup);

describe("the Skills hub", () => {
    it("reads the path and sends nothing", async () => {
        renderSkills();
        await screen.findByRole("heading", { level: 1, name: "Your skills" });

        expect(api.get).toHaveBeenCalledWith("/api/curriculum/path");
        expect(api.post).not.toHaveBeenCalled();
        expect(document.title).toBe("Skills · Jolt");
    });

    it("names every open skill's state in words, not by colour alone", async () => {
        renderSkills();
        const tree = await screen.findByRole("list", { name: "Skill tree" });

        expect(within(tree).getByRole("button", { name: "Console output, Demonstrated" })).toBeTruthy();
        expect(within(tree).getByRole("button", { name: "Declaration, Practised" })).toBeTruthy();
        expect(within(tree).getByRole("button", { name: "Assignment, Locked" })).toBeTruthy();
    });

    it("folds locked topics until asked, with an accessible toggle", async () => {
        renderSkills();
        await screen.findByRole("list", { name: "Skill tree" });

        expect(screen.queryByRole("button", { name: /For loops/ })).toBeNull();
        const toggle = screen.getByRole("button", { name: "Show skills" });
        expect(toggle.getAttribute("aria-expanded")).toBe("false");

        fireEvent.click(toggle);
        expect(screen.getByRole("button", { name: "For loops, Locked" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Hide skills" }).getAttribute("aria-expanded")).toBe("true");
    });

    it("opens a skill's details on selection, with where to work on it", async () => {
        renderSkills();
        const node = await screen.findByRole("button", { name: "Declaration, Practised" });

        fireEvent.click(node);
        expect(node.getAttribute("aria-expanded")).toBe("true");
        expect(screen.getByText("1 of 3 stops cleared")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Keep practising" }).getAttribute("href")).toBe("/concept/declaration");

        // Selecting it again closes it.
        fireEvent.click(node);
        expect(screen.queryByText("1 of 3 stops cleared")).toBeNull();
    });

    it("says what opens a locked skill instead of offering a way in", async () => {
        renderSkills();
        fireEvent.click(await screen.findByRole("button", { name: "Assignment, Locked" }));

        expect(screen.getByText("Opens when you finish Declaration")).toBeTruthy();
        expect(screen.queryByRole("link", { name: /Start this skill|Open the lesson/ })).toBeNull();
    });

    it("offers a shown skill back as a revisit, and says when it took a second try", async () => {
        renderSkills();
        fireEvent.click(await screen.findByRole("button", { name: "Arithmetic, Demonstrated" }));

        expect(document.querySelector(".skill-detail-state")?.textContent).toMatch(/after a second try/);
        expect(screen.getByRole("link", { name: "Revisit the lesson" }).getAttribute("href")).toBe("/concept/arithmetic");
    });

    it("summarises strengths and what to practise next from the evidence", async () => {
        renderSkills();
        const summary = await screen.findByRole("complementary", { name: "Summary" });

        const strengths = within(summary).getByRole("heading", { name: "Strengths" }).parentElement!;
        expect(strengths.textContent).toContain("Console output");
        expect(strengths.textContent).not.toContain("Arithmetic");

        const next = within(summary).getByRole("heading", { name: "Practise next" }).parentElement!;
        expect(within(next).getAllByRole("link").map((a) => a.textContent)).toEqual(["Declaration", "Arithmetic"]);
        expect(next.textContent).toContain("2 of 3 stops left");
    });

    it("recommends exactly one activity: the path's next step", async () => {
        renderSkills();
        const summary = await screen.findByRole("complementary", { name: "Summary" });

        expect(within(summary).getAllByRole("link", { name: /Continue learning|Start learning|Take the checkpoint/ })).toHaveLength(1);
        expect(within(summary).getByRole("link", { name: "Continue learning" }).getAttribute("href")).toBe("/concept/declaration");
    });

    it("shows no invented numbers: no percentages anywhere", async () => {
        const { container } = renderSkills();
        await screen.findByRole("list", { name: "Skill tree" });
        expect(container.textContent).not.toMatch(/%/);
    });

    it("has nothing to praise for a brand-new learner, and says so", async () => {
        vi.mocked(api.get).mockResolvedValue({
            topics: [t("values", "Values", "current", [c("console-output", "Console output", "current")])],
            current: { ...c("console-output", "Console output", "current"), topic: "values" },
            points: { total: 0, concepts: 0, challenges: 0 }
        } satisfies JourneyPathResponse);
        renderSkills();

        expect(await screen.findByText(/Nothing shown yet/)).toBeTruthy();
        expect(screen.getByRole("button", { name: "Console output, Learning now" })).toBeTruthy();
    });

    it("says when the path could not load, and can try again", async () => {
        vi.mocked(api.get).mockRejectedValueOnce(new Error("down"));
        renderSkills();

        expect((await screen.findByRole("alert")).textContent).toMatch(/did not load/);
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByRole("list", { name: "Skill tree" })).toBeTruthy();
    });
});

describe("practice on the Skills hub", () => {
    const RECORD = {
        window: 5,
        concepts: [
            // Declaration: 7 answered, the last five mostly wrong.
            { slug: "declaration", attempts: 7, correct: 3, recent: { attempts: 5, correct: 1 }, earlier: { attempts: 2, correct: 2 }, lastAt: "2026-10-27T00:00:00.000Z" },
            // Console output: 3 answered, too few for a percentage.
            { slug: "console-output", attempts: 3, correct: 3, recent: { attempts: 3, correct: 3 }, earlier: { attempts: 0, correct: 0 }, lastAt: "2026-10-27T00:00:00.000Z" }
        ]
    };

    function withRecord(record: unknown) {
        vi.mocked(api.get).mockImplementation(((p: string) =>
            p === "/api/curriculum/practice-record"
                ? record === "fails"
                    ? Promise.reject(new Error("offline"))
                    : Promise.resolve(record)
                : Promise.resolve(PATH)) as never);
    }

    it("totals real answers across skills", async () => {
        withRecord(RECORD);
        renderSkills();

        const line = await screen.findByText(/You have answered/);
        expect(line.textContent).toBe("You have answered 10 practice questions across 2 skills, 6 of them right.");
    });

    it("suggests the skill whose recent answers need work first, with the real count", async () => {
        withRecord(RECORD);
        renderSkills();

        const card = (await screen.findByRole("heading", { name: "Practise next" })).closest("section")!;
        const [first] = within(card).getAllByRole("listitem");
        expect(first!.textContent).toContain("Declaration");
        expect(first!.textContent).toContain("Needs more practice: 1 of your last 5 right");
    });

    it("marks that skill in the tree in words, not by colour", async () => {
        withRecord(RECORD);
        renderSkills();

        const node = await screen.findByRole("button", { name: /^Declaration, Practised, needs more practice$/ });
        expect(node.className).toMatch(/needs-practice/);
    });

    it("gives counts and only gives a percentage from five answers", async () => {
        withRecord(RECORD);
        renderSkills();

        fireEvent.click(await screen.findByRole("button", { name: /^Declaration/ }));
        expect(screen.getByText("Answered 7, 3 right (43%)")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: /^Console output/ }));
        expect(screen.getByText("Answered 3, 3 right")).toBeTruthy();
    });

    it("says a skill with no answers is not started", async () => {
        withRecord({ window: 5, concepts: [] });
        renderSkills();

        fireEvent.click(await screen.findByRole("button", { name: /^Declaration/ }));
        expect(screen.getByText("Not started: nothing answered yet.")).toBeTruthy();
    });

    it("says nothing about answers when the record cannot be loaded, and still shows the skills", async () => {
        withRecord("fails");
        renderSkills();

        fireEvent.click(await screen.findByRole("button", { name: /^Declaration/ }));
        expect(screen.queryByText(/You have answered/)).toBeNull();
        expect(screen.queryByText(/Answered \d/)).toBeNull();
        expect(screen.queryByText(/Not started/)).toBeNull();
        expect(screen.getByText("1 of 3 stops cleared")).toBeTruthy();
    });

    it("explains how every number is worked out, and that demonstrated is not mastery", async () => {
        withRecord(RECORD);
        renderSkills();

        const how = (await screen.findByText("How these are worked out")).closest("details")!;
        expect(how.open).toBe(false);
        expect(how.textContent).toMatch(/not long-term mastery/);
        expect(how.textContent).toMatch(/A percentage appears from 5 answers/);
    });
});

describe("a skill's recent form", () => {
    const form = (recent: number, earlier: number) => ({
        window: 5,
        concepts: [{ slug: "declaration", attempts: 10, correct: recent + earlier, recent: { attempts: 5, correct: recent }, earlier: { attempts: 5, correct: earlier }, lastAt: "2026-10-27T00:00:00.000Z" }]
    });
    const open = async (record: unknown) => {
        vi.mocked(api.get).mockImplementation(((p: string) => Promise.resolve(p === "/api/curriculum/practice-record" ? record : PATH)) as never);
        renderSkills();
        fireEvent.click(await screen.findByRole("button", { name: /^Declaration/ }));
    };

    it("says when it is improving, with both counts", async () => {
        await open(form(4, 1));
        expect(screen.getByText("Improving: 4 of your last 5 right, up from 1 of the 5 before")).toBeTruthy();
    });

    it("says a fall once: as needs-practice, not again as a trend", async () => {
        await open(form(1, 4));
        expect(screen.getAllByText(/Needs more practice: 1 of your last 5 right/).length).toBeGreaterThan(0);
        expect(screen.queryByText(/Lower lately/)).toBeNull();
    });

    it("names a fall that is not yet a need for practice gently", async () => {
        await open(form(3, 5));
        expect(screen.getByText("Lower lately: 3 of your last 5 right, down from 5 of the 5 before")).toBeTruthy();
    });
});

describe("a locked skill with answers", () => {
    it("shows its counts and no needs-practice flag, anywhere", async () => {
        // Assignment is locked in PATH. Code Blitz can deal its questions early.
        const record = {
            window: 5,
            concepts: [{ slug: "assignment", attempts: 6, correct: 1, recent: { attempts: 5, correct: 0 }, earlier: { attempts: 1, correct: 1 }, lastAt: "2026-10-27T00:00:00.000Z" }]
        };
        vi.mocked(api.get).mockImplementation(((p: string) => Promise.resolve(p === "/api/curriculum/practice-record" ? record : PATH)) as never);
        renderSkills();

        const node = await screen.findByRole("button", { name: /^Assignment/ });
        expect(node.className).not.toMatch(/needs-practice/);
        expect(node.textContent).not.toContain("!");

        fireEvent.click(node);
        expect(screen.getByText("Answered 6, 1 right (17%)")).toBeTruthy();
        // No flag in its detail, and not suggested under "Practise next".
        expect(document.querySelector(".skill-detail-flag, .skill-node-flag")).toBeNull();
        const card = screen.getByRole("heading", { name: "Practise next" }).closest("section")!;
        expect(card.textContent).not.toContain("Assignment");
    });
});
