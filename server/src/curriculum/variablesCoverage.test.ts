import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";

/**
 * WHAT VARIABLES ACTUALLY COVERS, pinned.
 *
 * Variables is the reference implementation for a beginner topic, so what it
 * does and does not cover should be a fact anyone can read rather than
 * something you have to run an audit to discover.
 *
 * TWO RUNGS ARE DELIBERATELY EMPTY and the reasons are different:
 *
 *   recognise  Already taught, in the lesson. Fourteen recognition steps live
 *              across the lessons -- "In this line, what is the name?" -- and
 *              a learner meeting a concept is asked to recognise it right
 *              there. The curriculum cannot SEE that, because a lesson records
 *              one rungless demonstration, but the teaching is not missing.
 *              Authoring recognition questions would duplicate the lesson.
 *
 *   explain    WAS the one gap: let-vs-const declared it and nothing in Jolt
 *              did explanation. Seed 067 closed it, written for where the
 *              concept sits -- Variables #7, where there are no objects or
 *              arrays to show that const does not freeze a value, so the
 *              mechanism is stated as what const actually fixes: the name.
 *
 * Variables is now fully covered. This test fails if that stops being true,
 * which is the point of writing it down.
 */
describe("Variables coverage", () => {
    let fx: CurriculumFixture;

    /** Playable (concept, demand) pairs in the database, by any game. */
    let playable: Set<string>;
    /** Every pair the curriculum declares for Variables. */
    let declared: Array<{ concept: string; demand: string }>;

    beforeAll(async () => {
        fx = await buildCurriculumFixture();

        declared = await fx.rows<{ concept: string; demand: string }>(
            `SELECT c.slug AS concept, d.slug AS demand
             FROM topics t
             JOIN concepts c ON c.topic_id = t.id
             JOIN concept_demands cd ON cd.concept_id = c.id
             JOIN demands d ON d.id = cd.demand_id
             WHERE t.slug = 'variables'
             ORDER BY c.display_order, d.display_order`
        );

        const rows = await fx.rows<{ concept: string; demand: string }>(
            `SELECT DISTINCT c.slug AS concept, d.slug AS demand
             FROM challenges ch
             JOIN concepts c ON c.id = ch.concept_id
             JOIN topics   t ON t.id = c.topic_id
             JOIN demands  d ON d.id = ch.demand_id
             WHERE t.slug = 'variables'
               AND ch.is_active
               AND ch.role = 'practise'
               AND (EXISTS (SELECT 1 FROM questions q
                            WHERE q.challenge_id = ch.id AND q.is_active)
                 OR EXISTS (SELECT 1 FROM bug_hunt_incidents i
                            WHERE i.challenge_id = ch.id AND i.is_active)
                 -- A movement realises the rung without a content row of its
                 -- own; migration 030 is what makes it visible from here.
                 OR ch.activity IS NOT NULL)`
        );

        playable = new Set(rows.map((r) => `${r.concept}/${r.demand}`));
    }, 120000);

    it("has a playable predict for every concept that declares one", () => {
        // The gap the second audit found: four concepts could be learned,
        // practised and in two cases debugged, but never predicted.
        const missing = declared
            .filter((d) => d.demand === "predict")
            .filter((d) => !playable.has(`${d.concept}/${d.demand}`))
            .map((d) => d.concept);

        expect(missing).toEqual([]);
    });

    it("has a playable diagnose for every concept that declares one", () => {
        const missing = declared
            .filter((d) => d.demand === "diagnose")
            .filter((d) => !playable.has(`${d.concept}/${d.demand}`))
            .map((d) => d.concept);

        expect(missing).toEqual([]);
    });

    it("leaves only the one rung nothing is written for", () => {
        const uncovered = declared
            .filter((d) => !playable.has(`${d.concept}/${d.demand}`))
            .map((d) => `${d.concept}/${d.demand}`);

        // WHAT CHANGED. `produce` and `apply` were invisible here because the
        // exercises are client-authored movements and this query only saw
        // questions and incidents. Migration 030 and seeds 024/026 let a
        // challenge say a movement realises it, so they are visible now.
        // `recognise` was genuinely empty and seed 027 filled it.
        //
        // `let-vs-const/explain` was the last one and is now written, so
        // nothing in Variables is uncovered.
        expect(uncovered).toEqual([]);
    });

    it("keeps every beginner item at a difficulty the curriculum derived", () => {
        // Nothing is "easy" by decree. Shallow rungs land at 1, deep at 2, and
        // a Variables item may never exceed the beginner tier's deep value.
        return fx
            .rows<{ slug: string; difficulty: number; rung: number }>(
                `SELECT c.slug, ch.difficulty, d.display_order AS rung
                 FROM challenges ch
                 JOIN concepts c ON c.id = ch.concept_id
                 JOIN topics   t ON t.id = c.topic_id
                 JOIN demands  d ON d.id = ch.demand_id
                 WHERE t.slug = 'variables' AND ch.is_active`
            )
            .then((rows) => {
                for (const row of rows) {
                    const deep = row.rung >= 5;

                    expect(row.difficulty, `${row.slug} at rung ${row.rung}`).toBe(deep ? 2 : 1);
                }
            });
    });
});
