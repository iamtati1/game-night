import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
    preferred,
    rankByFrontier,
    selectInOrder,
    withinCeilings,
    type Candidate,
    type Ceilings
} from "./policy.js";

/**
 * The selection policy, tested as the pure function it is.
 *
 * No database: everything upstream has already run by the time a candidate
 * reaches this layer, so there is nothing here that needs one. Same shape as
 * curve.test.ts, and for the same reason -- what is under test is a design
 * decision, and a design decision should be readable as one.
 *
 * The demand orders below are the curriculum's real ones (predict 3, produce 4,
 * diagnose 5, repair 6), named rather than spelled so the assertions read as
 * pedagogy rather than arithmetic.
 */

const PREDICT = 3;
const PRODUCE = 4;
const DIAGNOSE = 5;
const REPAIR = 6;

let next = 0;

/** A candidate at one (difficulty, demand) coordinate. */
function at(
    difficulty: number,
    demandOrder: number,
    concept = "equality",
    challengeId = `ch${(next += 1)}`
): Candidate {
    return { challengeId, conceptId: concept, demandOrder, difficulty, role: "practise" };
}

const ceilings = (difficulty: number, demandOrder: number): Ceilings => ({
    difficulty,
    demandOrder
});

/** A readable coordinate, for failure messages. */
const coord = (c: Candidate) => `${c.difficulty}/${c.demandOrder}`;
const coords = (cs: Candidate[]) => cs.map(coord);

// ── priority 1 · the ceilings are a hard boundary ────────────────────────

describe("priority 1 · nothing above either ceiling is a candidate", () => {
    it("drops a candidate above the difficulty ceiling", () => {
        const allowed = at(2, PREDICT);
        const tooHard = at(3, PREDICT);

        expect(withinCeilings([allowed, tooHard], ceilings(2, DIAGNOSE))).toEqual([allowed]);
    });

    it("drops a candidate above the demand ceiling", () => {
        const allowed = at(2, PREDICT);
        const tooDeep = at(2, REPAIR);

        expect(withinCeilings([allowed, tooDeep], ceilings(2, DIAGNOSE))).toEqual([allowed]);
    });

    it("keeps a candidate sitting exactly on both ceilings", () => {
        const edge = at(2, DIAGNOSE);

        expect(withinCeilings([edge], ceilings(2, DIAGNOSE))).toEqual([edge]);
    });

    it("is defensive, not load-bearing -- upstream should never send these", () => {
        // An empty result for a non-empty input means an upstream bug, not a
        // learner with nothing to do. Worth pinning so the distinction survives.
        expect(rankByFrontier([at(4, REPAIR)], ceilings(1, PREDICT))).toEqual([]);
        expect(selectInOrder([at(4, REPAIR)], ceilings(1, PREDICT))).toEqual([]);
    });
});

// ── priority 2 · the frontier, one axis at a time ────────────────────────

describe("case A · same difficulty, different demand", () => {
    it("prefers the candidate at the demand frontier", () => {
        const shallow = at(2, PREDICT);
        const atFrontier = at(2, DIAGNOSE);

        expect(preferred([shallow, atFrontier], ceilings(2, DIAGNOSE))).toEqual([atFrontier]);
    });

    it("decides on frontier alignment, not on demand being 'harder'", () => {
        // The same two candidates, judged against a learner whose demand ceiling
        // is predict. Now predict is the aligned one. Nothing about diagnose is
        // globally deeper as far as this policy is concerned -- and the deeper
        // candidate is not merely deprioritised here, it is out of bounds.
        const predict = at(2, PREDICT);
        const diagnose = at(2, DIAGNOSE);

        expect(preferred([predict, diagnose], ceilings(2, PREDICT))).toEqual([predict]);
    });
});

describe("case B · same demand, different difficulty", () => {
    it("prefers the candidate at the difficulty frontier", () => {
        const easy = at(1, DIAGNOSE);
        const atFrontier = at(3, DIAGNOSE);

        expect(preferred([easy, atFrontier], ceilings(3, DIAGNOSE))).toEqual([atFrontier]);
    });

    it("is independent of demand -- the same holds at a shallow rung", () => {
        const easy = at(1, PREDICT);
        const atFrontier = at(3, PREDICT);

        expect(preferred([easy, atFrontier], ceilings(3, PREDICT))).toEqual([atFrontier]);
    });
});

describe("case C · both dimensions available", () => {
    it("prefers the candidate aligned on both axes", () => {
        const pool = [at(1, PREDICT), at(2, PREDICT), at(1, DIAGNOSE), at(2, DIAGNOSE)];
        const best = pool[3]!;

        expect(preferred(pool, ceilings(2, DIAGNOSE))).toEqual([best]);
    });

    it("ranks the rest outward without combining the axes", () => {
        // 2/diagnose first. Then 1/diagnose and 2/predict TOGETHER -- each is
        // one step from the frontier, but on different axes, and nothing in this
        // policy claims one step of difficulty is worth one step of demand.
        // 1/predict, which is behind on both, comes last.
        const both = at(2, DIAGNOSE);
        const easier = at(1, DIAGNOSE);
        const shallower = at(2, PREDICT);
        const neither = at(1, PREDICT);

        const tiers = rankByFrontier(
            [neither, easier, shallower, both],
            ceilings(2, DIAGNOSE)
        );

        expect(tiers.map(coords)).toEqual([
            ["2/5"],
            ["1/5", "2/3"],
            ["1/3"]
        ]);
    });

    it("uses no arithmetic that could put the two axes on one line", () => {
        // The constraint this file exists to protect, checked against the source
        // rather than inferred from behaviour. Statements only, so the prose
        // explaining that there is no formula cannot satisfy the check.
        const source = readFileSync(new URL("./policy.ts", import.meta.url), "utf8")
            .split("\n")
            .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
            .join("\n");

        expect(source).not.toMatch(/difficulty\s*[+*]\s*\w*[Dd]emand/);
        expect(source).not.toMatch(/demandOrder\s*[+*]\s*\w*[Dd]ifficulty/);
        expect(source, "no combined score anywhere").not.toMatch(/\bscore\b/i);
    });
});

// ── case D · the frontier coordinate has no content ──────────────────────

describe("case D · no candidate sits on the frontier", () => {
    it("returns candidates rather than nothing", () => {
        // frontier (3, diagnose); available 2/diagnose and 3/predict. The exact
        // corner does not exist -- the curriculum can declare coordinates no
        // content fills yet -- and the policy must still answer.
        const easier = at(2, DIAGNOSE);
        const shallower = at(3, PREDICT);

        expect(preferred([easier, shallower], ceilings(3, DIAGNOSE))).toHaveLength(2);
    });

    it("ranks them EQUAL, because the axes disagree", () => {
        // DOCUMENTED BEHAVIOUR, and the most important assertion in this file.
        //
        //   2/diagnose is one step down on difficulty, exactly on demand
        //   3/predict  is exactly on difficulty, two steps down on demand
        //
        // Neither is closer on both axes, so neither dominates. The policy
        // declines to choose. Any answer that named one of them the winner would
        // be asserting an exchange rate between a step of difficulty and a step
        // of demand -- which is precisely the collapse this layer forbids, and
        // which nobody has specified.
        //
        // The caller gets both and may break the tie however the product wants.
        // selectInOrder does it by variety and then challengeId, which is
        // deterministic but carries no pedagogical claim.
        const easier = at(2, DIAGNOSE, "equality", "a");
        const shallower = at(3, PREDICT, "equality", "b");

        const tiers = rankByFrontier([easier, shallower], ceilings(3, DIAGNOSE));

        expect(tiers).toHaveLength(1);
        expect(coords(tiers[0]!).sort()).toEqual(["2/5", "3/3"]);
    });

    it("still prefers anything that IS on the frontier once it exists", () => {
        // Same pool plus the missing corner. Authoring one piece of content at
        // 3/diagnose collapses the tie without any code change.
        const easier = at(2, DIAGNOSE);
        const shallower = at(3, PREDICT);
        const exact = at(3, DIAGNOSE);

        expect(preferred([easier, shallower, exact], ceilings(3, DIAGNOSE))).toEqual([exact]);
    });
});

// ── priority 3 · variety ─────────────────────────────────────────────────

describe("priority 3 · equally appropriate candidates are spread out", () => {
    it("does not take the same coordinate twice while another is available", () => {
        const first = at(2, DIAGNOSE, "equality", "a");
        const same = at(2, DIAGNOSE, "equality", "b");
        const other = at(2, DIAGNOSE, "scope", "c");

        const [one, two] = selectInOrder([first, same, other], ceilings(2, DIAGNOSE), 2);

        expect([one!.conceptId, two!.conceptId].sort()).toEqual(["equality", "scope"]);
    });

    it("spreads across concepts before repeating one", () => {
        const pool = [
            at(2, DIAGNOSE, "equality", "a"),
            at(2, DIAGNOSE, "equality", "b"),
            at(2, DIAGNOSE, "scope", "c"),
            at(2, DIAGNOSE, "loops", "d")
        ];

        const picked = selectInOrder(pool, ceilings(2, DIAGNOSE), 3);

        expect(new Set(picked.map((c) => c.conceptId)).size).toBe(3);
    });

    it("distinguishes demand and difficulty too, not only concept", () => {
        // All three share a tier: against a frontier of (2, diagnose),
        // 1/diagnose is one step off on difficulty and 2/predict is two steps
        // off on demand, so neither dominates the other. Within that tier the
        // duplicate coordinate is the least fresh pick, even though it is the
        // same concept as the alternative.
        const pool = [
            at(1, DIAGNOSE, "equality", "a"),
            at(1, DIAGNOSE, "equality", "b"),
            at(2, PREDICT, "equality", "c")
        ];

        const picked = selectInOrder(pool, ceilings(2, DIAGNOSE), 2);

        expect(new Set(picked.map((c) => c.demandOrder)).size).toBe(2);
        expect(new Set(picked.map((c) => c.difficulty)).size).toBe(2);
    });

    it("never reorders tiers to get variety", () => {
        // Variety operates WITHIN a tier. A fresher coordinate further from the
        // frontier must not jump ahead of a repeat that is closer to it --
        // progression outranks spread.
        const atFrontier = at(2, DIAGNOSE, "equality", "a");
        const alsoFrontier = at(2, DIAGNOSE, "equality", "b");
        const freshButEasier = at(1, DIAGNOSE, "scope", "c");

        const picked = selectInOrder(
            [atFrontier, alsoFrontier, freshButEasier],
            ceilings(2, DIAGNOSE),
            3
        );

        expect(coords(picked)).toEqual(["2/5", "2/5", "1/5"]);
    });
});

// ── priority 4 · determinism ─────────────────────────────────────────────

describe("priority 4 · the same input gives the same answer", () => {
    it("is stable across repeated calls", () => {
        const pool = [
            at(1, PREDICT, "equality", "d"),
            at(2, DIAGNOSE, "scope", "a"),
            at(2, PREDICT, "loops", "c"),
            at(1, DIAGNOSE, "arrays", "b")
        ];

        const once = selectInOrder(pool, ceilings(2, DIAGNOSE));
        const twice = selectInOrder(pool, ceilings(2, DIAGNOSE));

        expect(once.map((c) => c.challengeId)).toEqual(twice.map((c) => c.challengeId));
    });

    it("does not depend on the order the candidates arrive in", () => {
        const pool = [
            at(2, DIAGNOSE, "scope", "a"),
            at(1, DIAGNOSE, "arrays", "b"),
            at(2, PREDICT, "loops", "c"),
            at(1, PREDICT, "equality", "d")
        ];

        const forwards = selectInOrder(pool, ceilings(2, DIAGNOSE));
        const backwards = selectInOrder([...pool].reverse(), ceilings(2, DIAGNOSE));

        expect(forwards.map((c) => c.challengeId)).toEqual(
            backwards.map((c) => c.challengeId)
        );
    });

    it("carries no clock and no randomness", () => {
        const source = readFileSync(new URL("./policy.ts", import.meta.url), "utf8");

        expect(source, "variation is pacing's job -- see curve.ts").not.toContain("Math.random");
        expect(source).not.toContain("Date.now");
    });
});

// ── the boundary ─────────────────────────────────────────────────────────

describe("the policy decides nothing the layers above it already decided", () => {
    const source = readFileSync(new URL("./policy.ts", import.meta.url), "utf8");

    it("touches no database", () => {
        expect(source).not.toMatch(/^import .*\bdb\b/m);
        expect(source).not.toMatch(/SELECT |pool\.query/);
    });

    it("re-derives no prerequisite, role or encounter state", () => {
        for (const word of ["prerequisite", "met_concepts", "met_difficulties", "met_demands"]) {
            expect(source, `policy.ts must not mention ${word}`).not.toContain(word);
        }
    });

    it("carries role without acting on it", () => {
        // Role eligibility is roles.ts's decision and is settled before a
        // candidate gets here. Carried so a caller can group by it.
        const introduce: Candidate = { ...at(1, PREDICT), role: "introduce" };

        expect(preferred([introduce], ceilings(2, DIAGNOSE))).toEqual([introduce]);
    });

    it("is consumed by Code Blitz and by nothing else yet", () => {
        // Code Blitz orders its candidates with the policy; Bug Hunt still deals
        // the way it always has, and selection.ts remains SQL composition only.
        const blitz = readFileSync(new URL("../game/queries.ts", import.meta.url), "utf8");

        expect(blitz).toContain("policy.js");

        for (const file of ["selection.ts", "../bugHunt/queries.ts"]) {
            const other = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");

            expect(other, `${file} must not consume the policy yet`).not.toContain("policy.js");
        }
    });

    it("leaves the pacing curve alone", () => {
        const curve = readFileSync(new URL("../game/curve.ts", import.meta.url), "utf8");

        expect(curve).not.toMatch(/^import /m);
        expect(curve).not.toContain("demandOrder");
    });
});

// ── degenerate inputs ────────────────────────────────────────────────────

describe("degenerate inputs are answered, not thrown at", () => {
    it("returns nothing for no candidates", () => {
        expect(rankByFrontier([], ceilings(2, DIAGNOSE))).toEqual([]);
        expect(preferred([], ceilings(2, DIAGNOSE))).toEqual([]);
        expect(selectInOrder([], ceilings(2, DIAGNOSE))).toEqual([]);
    });

    it("caps at the requested count", () => {
        const pool = [at(2, DIAGNOSE), at(1, DIAGNOSE), at(2, PREDICT), at(1, PREDICT)];

        expect(selectInOrder(pool, ceilings(2, DIAGNOSE), 2)).toHaveLength(2);
    });

    it("returns everything it has when asked for more than exists", () => {
        const pool = [at(2, DIAGNOSE), at(1, PREDICT)];

        expect(selectInOrder(pool, ceilings(2, DIAGNOSE), 10)).toHaveLength(2);
    });

    it("handles a single candidate and a single tier", () => {
        const only = at(1, PREDICT);

        expect(rankByFrontier([only], ceilings(2, DIAGNOSE))).toEqual([[only]]);
    });

    it("mutates neither the candidates nor the array it was given", () => {
        const pool = [at(1, PREDICT, "equality", "b"), at(2, DIAGNOSE, "scope", "a")];
        const before = pool.map((c) => c.challengeId);

        selectInOrder(pool, ceilings(2, DIAGNOSE));

        expect(pool.map((c) => c.challengeId)).toEqual(before);
    });
});
