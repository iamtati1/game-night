import { describe, expect, it } from "vitest";
import { dealRun } from "./queries.js";

/**
 * BUG HUNT, AIMED AT WHAT THE LEARNER IS LEARNING.
 *
 * The same bargain dealSession makes for Code Blitz, and for the same reason:
 * only an incident tagged to the current concept can have its resolution clear
 * that concept's rung, so the reserved hunts are what targeting is worth
 * spending on -- and the rest of the run stays an ordinary run.
 *
 * `dealRun` is pure and takes the candidate array the SQL already filtered.
 * Which incidents a learner may be dealt at all is decided by
 * ELIGIBLE_INCIDENT_PREDICATE, curriculumSelects and incidentWithinJourney
 * before this function is reached, and is covered by eligibility.test.ts.
 */

const HUNTS = [0, 5];

function incident(id: string, difficulty: number, concept_id: string | null = null) {
    return { id, difficulty, concept_id };
}

/** Enough untagged incidents at a spread of tiers to fill a run. */
function bank(n = 20) {
    return Array.from({ length: n }, (_, i) => incident(`i-${i}`, (i % 5) + 1));
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("the reserved hunts go to the current concept", () => {
    it("puts current-concept incidents in both reserved hunts", () => {
        const run = dealRun(
            [...bank(), incident("c-easy", 1, "42"), incident("c-hard", 4, "42")],
            "42"
        );

        for (const hunt of HUNTS) {
            expect(["c-easy", "c-hard"], `hunt ${hunt + 1}`).toContain(run[hunt]!.id);
        }
    });

    it("takes the easier tagged incident first", () => {
        const run = dealRun(
            [...bank(), incident("c-hard", 5, "42"), incident("c-easy", 1, "42")],
            "42"
        );

        expect(run[HUNTS[0]!]!.id).toBe("c-easy");
    });

    it("reserves one hunt when the concept has only one incident", () => {
        const run = dealRun([...bank(), incident("only", 2, "42")], "42");

        expect(run[0]!.id).toBe("only");
        expect(ids(run).filter((id) => id === "only")).toHaveLength(1);
    });

    it("never deals the same incident twice", () => {
        const run = dealRun([...bank(), incident("only", 2, "42")], "42");

        expect(new Set(ids(run)).size).toBe(run.length);
    });
});

describe("what the dealer refuses to invent", () => {
    it("reserves nothing when the concept has no tagged incident", () => {
        // 39 of 64 active incidents are untagged and most concepts have none, so
        // this is the ordinary case rather than an edge one.
        const candidates = bank();

        expect(ids(dealRun(candidates, "42"))).toEqual(ids(dealRun(candidates, null)));
    });

    it("ignores a concept id nothing in the bank carries", () => {
        const run = dealRun([...bank(), incident("other", 1, "99")], "42");

        expect(run[0]!.id).not.toBe("other");
    });

    it("cannot deal an incident that is not in the candidate list", () => {
        // THE FRONTIER GUARD, structurally. Eligibility, the role gate and the
        // journey ceiling all run in SQL before this array exists; an incident
        // the learner may not be dealt is simply absent, and no concept match
        // can reach past what the dealer was handed.
        const candidates = bank();
        const outOfReach = incident("locked", 1, "42");

        expect(ids(dealRun(candidates, "42"))).not.toContain(outOfReach.id);
    });
});

describe("the hunt is still a hunt", () => {
    it("deals a full run with the reserved hunts in place", () => {
        const plain = dealRun(bank(), null);
        const aimed = dealRun([...bank(), incident("c", 1, "42")], "42");

        expect(aimed).toHaveLength(plain.length);
    });

    it("leaves the other hunts to the ordinary pool", () => {
        const run = dealRun(
            [...bank(), incident("c1", 1, "42"), incident("c2", 2, "42")],
            "42"
        );

        expect(
            run.some((r) => r.concept_id !== "42"),
            "a run must not become a single-concept quiz"
        ).toBe(true);
    });

    it("deals exactly as before when no concept is resolved", () => {
        const candidates = bank();

        expect(ids(dealRun(candidates, null))).toEqual(ids(dealRun(candidates)));
    });

    it("keeps the difficulty ramp across the unreserved hunts", () => {
        const run = dealRun(bank(30), null);
        const tiers = run.map((r) => r.difficulty);

        expect(tiers[tiers.length - 1]!).toBeGreaterThanOrEqual(tiers[0]!);
    });
});
