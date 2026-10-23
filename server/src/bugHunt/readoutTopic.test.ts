import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

/**
 * The mission report names what the learner practised, not the bug taxonomy.
 *
 * Playtest finding: a beginner who fixed `consol.log` was told they were
 * "Strong today" at "Scope and closures", because the readout grouped by
 * bug_category. An incident tagged to a lesson concept is now grouped and
 * labelled by that concept; an untagged one keeps its category.
 */

vi.mock("../auth/middleware.js", () => ({
    requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
        (req as express.Request & { user: { id: string } }).user = { id: "7" };
        next();
    }
}));

const round = (n: number, concept: string | null, category: string, status: string) => ({
    id: String(n), incident_id: String(n), display_order: n, time_limit_ms: null, status,
    served_at: new Date(0), ended_at: new Date(5000), attempts: 1, hints_used: 0,
    selected_option_id: null, title: `Bug ${n}`, theme: "console", bug_category: category,
    challenge_type: "diagnose", difficulty: 1, code: "consol.log(1);", code_language: "javascript",
    bug_report: "It fails.", correct_option_text: "consol", correct_explanation: "Misspelt.",
    selected_option_text: null, selected_explanation: null, concept_name: concept
});

vi.mock("./queries.js", async (original) => ({
    ...(await original<typeof import("./queries.js")>()),
    findBugHuntSessionForUser: vi.fn(async () => ({
        id: "s1", status: "completed", started_at: new Date(0), completed_at: new Date(9000),
        abandoned_at: null, score: 100, xp_earned: 10
    })),
    listRoundsForResults: vi.fn(async () => [
        round(1, "Running Code and Reading Output", "scope-closures", "resolved"),
        round(2, "Running Code and Reading Output", "scope-closures", "resolved"),
        round(3, null, "async", "failed")
    ]),
    practiceClearedInSession: vi.fn(async () => [
        { conceptSlug: "console-output", conceptName: "Running Code and Reading Output", demandSlug: "diagnose" }
    ])
}));

const { bugHuntRouter } = await import("./routes.js");

function app() {
    const a = express();
    a.use(express.json());
    a.use("/api/bug-hunt", bugHuntRouter);
    return a;
}

describe("GET /api/bug-hunt/sessions/:id readout", () => {
    it("groups tagged incidents by their lesson concept", async () => {
        const res = await request(app()).get("/api/bug-hunt/sessions/s1");

        expect(res.status).toBe(200);
        expect(res.body.session.byCategory).toEqual([
            { category: "Running Code and Reading Output", seen: 2, resolved: 2 },
            { category: "async", seen: 1, resolved: 0 }
        ]);
        expect(res.body.session.byCategory.map((c: { category: string }) => c.category)).not.toContain(
            "scope-closures"
        );
    });

    it("tells each incident in the log what it practised", async () => {
        const res = await request(app()).get("/api/bug-hunt/sessions/s1");

        expect(res.body.session.incidents[0].concept).toBe("Running Code and Reading Output");
        expect(res.body.session.incidents[2].concept).toBeNull();
        // The category is still sent, unchanged, for anything that reads it.
        expect(res.body.session.incidents[0].bugCategory).toBe("scope-closures");
    });

    it("names the practice stops the run cleared, beside the XP", async () => {
        const res = await request(app()).get("/api/bug-hunt/sessions/s1");

        expect(res.body.earned).toEqual([
            { conceptSlug: "console-output", conceptName: "Running Code and Reading Output", demandSlug: "diagnose" }
        ]);
        expect(res.body.session.xpEarned).toBe(10);
    });
});
