import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { conceptById, difficultyFor, tierOf } from "../../client/src/games/curriculum.ts";

/**
 * The first curriculum vertical slice, checked at the level of its seed.
 *
 * operators > equality, three of its four declared demands:
 *
 *     equality / predict  / practise  -> Code Blitz question
 *     equality / diagnose / practise  -> Bug Hunt incident
 *     equality / repair   / practise  -> Bug Hunt incident
 *     equality / explain              -> deliberately nothing
 *
 * Source-level, following sessionInsert.test.ts and challenges.test.ts: the
 * suite reaches no database, and the properties worth protecting here are
 * structural. What a real PostgreSQL proves -- that the seed applies, that it is
 * idempotent, that the question executes to its declared answer -- was verified
 * against PGlite during the slice and is recorded in the commit message rather
 * than re-run here.
 *
 * The one thing these tests cannot see is whether the content is any GOOD. That
 * is a human review, and the seed's own comments carry the reasoning.
 */

const SEED = readFileSync(new URL("../seeds/015_equality_slice.sql", import.meta.url), "utf8");

/** Statements only, so a comment mentioning a demand cannot satisfy a check. */
const STATEMENTS = SEED.split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

/** Every attach call in the seed, as (kind, ref, concept, demand, role). */
const ATTACHMENTS = [
    ...STATEMENTS.matchAll(
        /SELECT attach_(question|incident)_challenge\(\s*(?:E?'(?:[^']|'')*'|[\s\S]*?),\s*'([a-z-]+)',\s*'([a-z-]+)',\s*'([a-z]+)'\)/g
    )
].map((m) => ({ kind: m[1]!, concept: m[2]!, demand: m[3]!, role: m[4]! }));

describe("the slice creates exactly the three intended challenges", () => {
    it("attaches three challenges and no more", () => {
        expect(ATTACHMENTS).toHaveLength(3);
    });

    it("covers predict, diagnose and repair", () => {
        expect(ATTACHMENTS.map((a) => a.demand).sort()).toEqual([
            "diagnose",
            "predict",
            "repair"
        ]);
    });

    it("tags every one to the equality concept", () => {
        for (const a of ATTACHMENTS) {
            expect(a.concept, `${a.demand} is tagged to ${a.concept}`).toBe("equality");
        }
    });

    it("gives every one the practise role", () => {
        // Nothing existing is introduce or reinforce: a Learn Beat is not a
        // dealt unit, and no game reinforces yet.
        for (const a of ATTACHMENTS) {
            expect(a.role, `${a.demand} has role ${a.role}`).toBe("practise");
        }
    });

    it("routes each demand to the game that can honestly carry it", () => {
        const by = Object.fromEntries(ATTACHMENTS.map((a) => [a.demand, a.kind]));

        expect(by.predict, "predict belongs to Code Blitz").toBe("question");
        expect(by.diagnose, "diagnose belongs to Bug Hunt").toBe("incident");
        expect(by.repair, "repair belongs to Bug Hunt").toBe("incident");
    });
});

describe("explain is deliberately unimplemented", () => {
    it("creates no explain challenge", () => {
        expect(ATTACHMENTS.map((a) => a.demand)).not.toContain("explain");
    });

    it("is still declared by the curriculum, so the gap is visible", () => {
        // The point is that equality AFFORDS explain and simply has no content.
        // If this ever stops being declared, the omission below stops being a
        // deliberate gap and becomes an accident.
        expect(conceptById("equality")!.demands).toContain("explain");
    });

    it("says why in the seed, so the omission is not mistaken for an oversight", () => {
        expect(SEED).toMatch(/explain` deliberately gets\n-- none/);
    });
});

describe("difficulty is derived, never authored", () => {
    it("computes it in SQL from the projected curriculum", () => {
        // The seed must not pass a difficulty in. If it did, a challenge could
        // carry a number the curriculum would never derive.
        expect(STATEMENTS).toContain("curriculum_difficulty(p_concept, p_demand)");
        expect(STATEMENTS).toMatch(/FROM concepts c\s*\n\s*JOIN topics t ON t\.id = c\.topic_id/);
    });

    it("uses the same rule as difficultyFor in curriculum.ts", () => {
        // produce (display_order 4) is where the ladder's deep half starts.
        expect(STATEMENTS).toContain(// The threshold is RELATIVE to produce rather than the literal 4, so that
        // inserting a rung into the middle of the ladder -- `apply`, between
        // predict and produce -- cannot silently reclassify every produce
        // challenge as shallow. The client's difficultyFor has always been
        // relative; this is the SQL copy catching up.
        "WHEN d.display_order >= (SELECT display_order FROM demands WHERE slug = 'produce') THEN");

        const equality = conceptById("equality")!;
        const tier = tierOf(equality);

        expect(tier).toBe("beginner");
        expect(difficultyFor(tier, "predict")).toBe(1);
        expect(difficultyFor(tier, "diagnose")).toBe(2);
        expect(difficultyFor(tier, "repair")).toBe(2);
    });

    it("never conflates the three difficulty columns", () => {
        // questions.difficulty is Code Blitz pacing; bug_hunt_incidents.difficulty
        // is that game's own ramp; challenges.difficulty is curriculum-derived.
        // The seed must never copy one into another.
        expect(STATEMENTS).not.toMatch(/challenges[\s\S]{0,200}q\.difficulty/);
        expect(STATEMENTS).not.toMatch(/challenges[\s\S]{0,200}i\.difficulty/);
    });
});

describe("the seed converges rather than duplicating", () => {
    it("guards on the content row's existing challenge_id", () => {
        // challenges has no natural key -- many exercises share one
        // (concept, demand, role) -- so the content is the only anchor.
        const guards = [...STATEMENTS.matchAll(/IF v_existing IS NOT NULL THEN\s*\n\s*RETURN;/g)];

        expect(guards, "both attach helpers must skip when already linked").toHaveLength(2);
    });

    it("raises rather than silently skipping when the content is missing", () => {
        expect(STATEMENTS).toMatch(/RAISE EXCEPTION 'no question with that prompt/);
        expect(STATEMENTS).toMatch(/RAISE EXCEPTION 'no incident %/);
    });

    it("converges the Code Blitz question on its prompt", () => {
        expect(STATEMENTS).toMatch(/IF EXISTS \(SELECT 1 FROM questions WHERE prompt = p_prompt\)/);
    });

    it("uses incident slugs nothing else has taken", () => {
        // seed_bug_hunt_incident SKIPS on an existing slug rather than
        // converging. That is pre-existing behaviour and is not changed here, so
        // a reused slug would silently drop the content.
        const slugs = [...SEED.matchAll(/attach_incident_challenge\('([a-z0-9-]+)'/g)].map((m) => m[1]!);

        expect(slugs).toHaveLength(2);

        for (const slug of slugs) {
            for (const other of ["005", "006", "007", "011"]) {
                const seed = readFileSync(
                    new URL(`../seeds/${other}_${SEED_NAMES[other]}.sql`, import.meta.url),
                    "utf8"
                );

                expect(seed.includes(`'${slug}'`), `${slug} is already used by seed ${other}`).toBe(
                    false
                );
            }
        }
    });

    it("defines its own Bug Hunt helper rather than borrowing one", () => {
        // Seeds 005, 006 and 011 each define and DROP this function, so a later
        // seed that assumed it survived would fail with 42883.
        expect(STATEMENTS).toContain("CREATE OR REPLACE FUNCTION seed_bug_hunt_incident(");
        expect(STATEMENTS).toContain("DROP FUNCTION seed_bug_hunt_incident(");
    });

    it("drops every helper it defines", () => {
        const created = [...STATEMENTS.matchAll(/CREATE OR REPLACE FUNCTION (\w+)\(/g)].map((m) => m[1]!);
        const dropped = [...STATEMENTS.matchAll(/DROP FUNCTION (\w+)\(/g)].map((m) => m[1]!);

        expect(created.sort()).toEqual(dropped.sort());
    });
});

describe("content ownership runs the right way", () => {
    it("never adds a game column to challenges", () => {
        for (const column of ["question_id", "incident_id", "snippet_id"]) {
            expect(STATEMENTS, `challenges must not own content via ${column}`).not.toContain(
                `challenges (${column}`
            );
        }
    });

    it("sets challenge_id on the content, not content ids on the challenge", () => {
        expect(STATEMENTS).toContain("UPDATE questions SET challenge_id = v_challenge");
        expect(STATEMENTS).toContain("UPDATE bug_hunt_incidents SET challenge_id = v_challenge");
    });

    it("creates one challenge per content item", () => {
        const inserts = STATEMENTS.split("INSERT INTO challenges").length - 1;

        expect(inserts, "one insert per attach helper, no batching").toBe(2);
        expect(ATTACHMENTS).toHaveLength(3);
    });
});

describe("the Code Blitz question is dealable", () => {
    it("uses a topic the schema now permits", () => {
        // migration 022 added 'operators'; before it, this question could not
        // have been inserted at all.
        expect(STATEMENTS).toMatch(/2, 'operators',/);
    });

    it("offers four options with exactly one correct", () => {
        // ELIGIBLE_QUESTION_PREDICATE requires exactly one is_correct option, and
        // the complete-code questions are the standing proof that a question can
        // exist and never be dealt.
        const block = SEED.slice(SEED.indexOf("$j$["), SEED.indexOf("]$j$"));
        const options = [...block.matchAll(/"correct":\s*(true|false)/g)].map((m) => m[1]);

        expect(options).toHaveLength(4);
        expect(options.filter((o) => o === "true")).toHaveLength(1);
    });

    it("asks the learner to predict, in the form the content tests execute", () => {
        // content.test.ts runs every "What does this log?" question and compares
        // the declared answer with real output. Keeping the phrasing means this
        // question is executed too, rather than only inspected.
        expect(SEED).toContain("What does this log?");
    });
});

/** Filenames of the other Bug Hunt seeds, for the slug-collision check above. */
const SEED_NAMES: Record<string, string> = {
    "005": "bug_hunt_incidents",
    "006": "bug_hunt_easy_tier",
    "007": "bug_hunt_tier1_fixes",
    "011": "bug_hunt_debugging_curriculum"
};
