import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONCEPTS } from "../../client/src/games/curriculum.ts";
import { SEED_PATH } from "./generate-curriculum.ts";

/**
 * How the curriculum seed converges concept_demands, and why it cannot simply
 * clear it.
 *
 * `challenges` holds a composite foreign key to (concept_id, demand_id) with ON
 * DELETE RESTRICT. That is what makes "a challenge at a demand its concept does
 * not declare" structurally impossible -- and it is also what breaks the
 * previous projection, which rebuilt the table on every run:
 *
 *     DELETE FROM concept_demands;   -- refused as soon as one challenge exists
 *
 * The refusal would have fired on every seed, including seeds where the
 * curriculum had not changed at all. This file pins the four behaviours the fix
 * has to produce, each of which was verified against real PostgreSQL during the
 * slice:
 *
 *   1. unchanged curriculum + a referencing challenge  -> seed succeeds
 *   2. repeated seed, no changes                       -> idempotent
 *   3. removed pair, nothing references it             -> removed
 *   4. removed pair, a challenge references it         -> fails loudly (23001)
 *
 * The statements are asserted here rather than the outcomes, because the suite
 * runs with no database to reach. Behaviour 4 in particular is a property of the
 * schema -- migration 021's RESTRICT -- and is asserted in challenges.test.ts;
 * what this file guards is that the seed stops making a delete that would
 * trigger it needlessly.
 */

const SEED = readFileSync(SEED_PATH, "utf8");

/** Statements only, so a comment mentioning a delete cannot satisfy a check. */
const STATEMENTS = SEED.split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

describe("1 · an unchanged curriculum does not disturb referenced pairs", () => {
    it("never clears concept_demands wholesale", () => {
        // The single statement that would break every seed once a challenge
        // exists. Its absence is the whole fix.
        expect(
            STATEMENTS,
            "DELETE FROM concept_demands; is refused by challenges_concept_demand_fk"
        ).not.toContain("DELETE FROM concept_demands;");
    });

    it("leaves an existing pair untouched rather than recreating it", () => {
        // DO NOTHING, not DO UPDATE: an unchanged pair must not be written at
        // all. There is nothing to update -- the row is its own key.
        expect(STATEMENTS).toContain("ON CONFLICT (concept_id, demand_id) DO NOTHING;");
        expect(STATEMENTS).not.toMatch(
            /ON CONFLICT \(concept_id, demand_id\) DO UPDATE/
        );
    });
});

describe("2 · repeating the seed changes nothing", () => {
    it("inserts every pair idempotently", () => {
        const inserts = STATEMENTS.split("INSERT INTO concept_demands").length - 1;
        const guards = STATEMENTS.split("ON CONFLICT (concept_id, demand_id) DO NOTHING;").length - 1;

        expect(inserts, "every concept_demands insert needs a conflict guard").toBe(guards);
    });

    it("emits exactly the pairs the curriculum declares", () => {
        const declared = CONCEPTS.reduce((n, c) => n + c.demands.length, 0);

        expect(STATEMENTS.split("INSERT INTO concept_demands").length - 1).toBe(declared);
    });
});

describe("3 · a pair the curriculum dropped is removed", () => {
    it("deletes by slug, targeted rather than wholesale", () => {
        expect(STATEMENTS).toContain("DELETE FROM concept_demands cd");
        expect(STATEMENTS).toContain("USING concepts c, demands d");
        expect(STATEMENTS).toContain("AND (c.slug, d.slug) NOT IN (");
    });

    it("runs the removal after the inserts", () => {
        // A pair that moved must be inserted before anything is judged stale,
        // or the seed would delete it and immediately need it back.
        expect(
            STATEMENTS.lastIndexOf("INSERT INTO concept_demands")
        ).toBeLessThan(STATEMENTS.indexOf("DELETE FROM concept_demands cd"));
    });

    it("keeps exactly the declared pairs, in projection order", () => {
        // The keep-set IS the projection. A declared pair missing from this list
        // would be deleted on the next seed -- silently, and only for content
        // nobody had linked yet.
        const block = STATEMENTS.slice(STATEMENTS.indexOf("AND (c.slug, d.slug) NOT IN ("));
        const listed = [...block.matchAll(/^ {6}\('([a-z0-9-]+)', '([a-z0-9-]+)'\),?$/gm)].map(
            (m) => `${m[1]}:${m[2]}`
        );

        const declared = CONCEPTS.flatMap((c) => c.demands.map((d) => `${c.id}:${d}`));

        expect(listed).toEqual(declared);
    });
});

describe("4 · a removed pair with content attached is left alone and announced", () => {
    /*
     * THIS BEHAVIOUR WAS REVERSED, AND THE REASON IS EVIDENCE.
     *
     * It previously read "fails loudly", and asserted that the seed never
     * mentioned `challenges` at all -- the idea being that RESTRICT should stop
     * the seed, so dropping a rung with playable content became a decision
     * rather than a silent change. The intent was right. The mechanism could
     * not deliver it.
     *
     * A refused delete does not pause for a decision. It aborts 014 and every
     * seed after it -- and the content migration that re-homes the challenge,
     * which is what MAKES the delete legal, is one of those later seeds. It has
     * to be: it moves content onto a concept that 014 itself creates, so it
     * cannot be numbered before 014. The result was a deadlock with no exit
     * from inside the seed run, hit for real while splitting operator-precedence
     * out of arithmetic-operators on a database that had been seeded once:
     *
     *     seeding 014_curriculum.sql ... FAILED
     *     update or delete on table "concept_demands" violates RESTRICT setting
     *     of foreign key constraint "challenges_concept_demand_fk"
     *     Key (concept_id, demand_id)=(2, 8) is referenced from table "challenges".
     *
     * Every database with content was stuck there permanently. A fresh one was
     * fine, which is why no test saw it.
     *
     * So the seed now declines to ask for a delete it knows will be refused,
     * and says which pair it left standing. What the FK protects is unchanged:
     * a rung is still never removed while content stands on it, and that is
     * still enforced by the schema rather than by this file. What is given up
     * is the abort -- and the abort was never actionable.
     */
    it("skips a pair a challenge still references, rather than aborting the run", () => {
        const prune = STATEMENTS.slice(STATEMENTS.indexOf("DELETE FROM concept_demands cd"));
        const guard = prune.slice(0, prune.indexOf("AND (c.slug, d.slug) NOT IN ("));

        expect(guard, "an unguarded prune deadlocks every seeded database").toMatch(
            /NOT EXISTS[\s\S]{0,120}challenges/i
        );
    });

    it("never deletes a referenced pair by widening the delete instead", () => {
        // The guard must narrow what is deleted, never arrange for the delete
        // to succeed anyway. A cascade would remove the challenge with the rung
        // and take its learner evidence with it.
        expect(STATEMENTS).not.toMatch(/ON CONFLICT[\s\S]{0,80}challenges/i);
        expect(STATEMENTS, "a cascade would delete content, not protect it").not.toMatch(
            /ON DELETE CASCADE/i
        );
        expect(STATEMENTS).not.toMatch(/DELETE FROM challenges/i);
        expect(STATEMENTS).not.toMatch(/UPDATE challenges/i);
    });

    it("still makes it a decision, by naming what it left behind", () => {
        // The half of the original intent that was reachable. Silence here
        // would mean a rung the curriculum has dropped lingering indefinitely
        // with nobody told why.
        expect(STATEMENTS).toContain("RAISE NOTICE");
        expect(STATEMENTS).toMatch(/no longer declares[\s\S]{0,120}left in place/);
        expect(STATEMENTS, "the notice must name the pairs, not just warn").toContain(
            "c.slug || '/' || d.slug"
        );
    });
});

describe("prerequisites are still rebuilt, and that is still correct", () => {
    it("clears the table outright", () => {
        // Nothing holds a foreign key to prerequisites, so the reason
        // concept_demands had to change does not apply. Left alone deliberately
        // rather than converged for symmetry.
        expect(STATEMENTS).toContain("DELETE FROM prerequisites;");
    });

    it("clears before inserting", () => {
        expect(STATEMENTS.indexOf("DELETE FROM prerequisites;")).toBeLessThan(
            STATEMENTS.indexOf("INSERT INTO prerequisites")
        );
    });
});

describe("the projected curriculum data is unchanged by this fix", () => {
    it("still carries every concept and its demands", () => {
        // The requirement this slice must not violate: convergence behaviour
        // changed, projected content did not.
        for (const c of CONCEPTS) {
            for (const d of c.demands) {
                expect(
                    SEED.includes(`(SELECT id FROM concepts WHERE slug = '${c.id}')`),
                    `${c.id} no longer projected`
                ).toBe(true);

                expect(
                    SEED.includes(`('${c.id}', '${d}')`),
                    `${c.id}:${d} missing from the keep-set`
                ).toBe(true);
            }
        }
    });

    it("projects one row per declared pair, whatever the curriculum's size", () => {
        // The pair count is asserted against the source above -- "emits exactly
        // the pairs the curriculum declares". Repeating it as a literal here
        // only meant editing two files whenever a concept was added.
        const declared = CONCEPTS.reduce((n, c) => n + c.demands.length, 0);

        expect(STATEMENTS.split("INSERT INTO concept_demands").length - 1).toBe(declared);
        expect(declared, "every concept declares at least one demand").toBeGreaterThanOrEqual(
            CONCEPTS.length
        );
    });
});
