import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
    CONCEPTS,
    DEMANDS,
    TOPICS,
    conceptsInTopic
} from "../../client/src/games/curriculum.ts";
import { SEED_PATH, generate } from "./generate-curriculum.ts";

/**
 * The curriculum projection, checked against the curriculum it projects.
 *
 * The seed is generated rather than written, which removes one class of bug --
 * a typo in 87 hand-copied concepts -- and introduces another: the committed
 * file silently falling behind the source. Someone edits curriculum.ts, forgets
 * `npm run curriculum:generate`, and the database seeds a version of the
 * syllabus nobody is looking at any more.
 *
 * So the first test here regenerates and compares byte for byte. Everything
 * after it checks that the SQL actually says what the curriculum says -- counts,
 * every slug present, the graph intact -- because a generator that is
 * deterministically wrong would pass the equality check on its own.
 *
 * Deliberately no database. These run in the ordinary suite, on every commit,
 * with no Postgres to reach; the projection is a pure function of the source and
 * can be checked as one.
 */

const COMMITTED = readFileSync(SEED_PATH, "utf8");
const FRESH = generate();

/** Every string literal in the file, unescaped back to its value. */
function literals(sql: string): Set<string> {
    const found = new Set<string>();

    for (const m of sql.matchAll(/'((?:[^']|'')*)'/g)) {
        found.add(m[1]!.replace(/''/g, "'"));
    }

    return found;
}

const LITERALS = literals(COMMITTED);

describe("the committed seed matches the authored curriculum", () => {
    it("is exactly what the generator produces today", () => {
        // The drift check. Fails the moment curriculum.ts is edited without
        // regenerating, which is the whole reason the file is committed rather
        // than built on deploy.
        expect(
            COMMITTED === FRESH,
            "server/seeds/014_curriculum.sql is stale -- run `npm run curriculum:generate`"
        ).toBe(true);
    });

    it("says it is generated, so nobody edits it by hand", () => {
        expect(COMMITTED).toContain("GENERATED FILE -- DO NOT EDIT BY HAND");
        expect(COMMITTED).toContain("npm run curriculum:generate");
    });

    it("is deterministic across runs", () => {
        expect(generate()).toBe(FRESH);
    });
});

describe("the projection carries every row the curriculum declares", () => {
    it("projects all sixteen topics", () => {
        expect(TOPICS).toHaveLength(16);

        for (const t of TOPICS) {
            expect(LITERALS, `topic ${t.id} missing`).toContain(t.id);
            expect(LITERALS, `topic label for ${t.id} missing`).toContain(t.label);
        }
    });

    it("projects every concept the curriculum declares", () => {
        // Counted against the source rather than a number typed in here. The
        // hardcoded total used to be a canary and was really a maintenance tax:
        // it failed on every curriculum change, including correct ones, and said
        // nothing the loop below does not say better.
        const inserts = COMMITTED.split("INSERT INTO concepts").length - 1;

        expect(inserts, "one insert per declared concept").toBe(CONCEPTS.length);
        expect(CONCEPTS.length, "a truncated curriculum is still a bug").toBeGreaterThan(50);

        for (const c of CONCEPTS) {
            expect(LITERALS, `concept ${c.id} missing`).toContain(c.id);
        }
    });

    it("projects all eight demands", () => {
        expect(DEMANDS).toHaveLength(8);

        for (const d of DEMANDS) {
            expect(LITERALS, `demand ${d} missing`).toContain(d);
        }
    });

    it("projects every field the curriculum authors, not just the slugs", () => {
        // A generator that emitted ids and dropped the prose would pass the
        // checks above. Objective, meaning and why are the content a Learn Beat
        // and a Skill Map read, so their absence would be silent until then.
        for (const c of CONCEPTS) {
            expect(LITERALS, `${c.id}: objective not projected`).toContain(c.objective);
            expect(LITERALS, `${c.id}: meaning not projected`).toContain(c.meaning);
            expect(LITERALS, `${c.id}: why not projected`).toContain(c.why);
        }

        for (const t of TOPICS) {
            expect(LITERALS, `${t.id}: rationale not projected`).toContain(t.rationale);
        }
    });

    it("emits one insert per prerequisite and per declared demand", () => {
        const prerequisites = CONCEPTS.reduce((n, c) => n + c.prerequisites.length, 0);
        const demands = CONCEPTS.reduce((n, c) => n + c.demands.length, 0);

        expect(
            COMMITTED.split("INSERT INTO prerequisites").length - 1,
            `expected ${prerequisites} prerequisite rows`
        ).toBe(prerequisites);

        expect(
            COMMITTED.split("INSERT INTO concept_demands").length - 1,
            `expected ${demands} concept_demands rows`
        ).toBe(demands);
    });

    it("emits one insert per topic, concept and demand", () => {
        expect(COMMITTED.split("INSERT INTO topics").length - 1).toBe(TOPICS.length);
        expect(COMMITTED.split("INSERT INTO concepts").length - 1).toBe(CONCEPTS.length);
        expect(COMMITTED.split("INSERT INTO demands").length - 1).toBe(DEMANDS.length);
    });
});

describe("the projection is convergent, not merely additive", () => {
    it("upserts rather than inserting blindly", () => {
        // Seeds have no ledger and run every time. An INSERT without a conflict
        // clause would fail the second run.
        for (const table of ["demands", "topics", "concepts"]) {
            const block = COMMITTED.slice(COMMITTED.indexOf(`INSERT INTO ${table}`));

            expect(block, `${table} does not upsert`).toContain("ON CONFLICT (slug) DO UPDATE");
        }
    });

    it("rebuilds prerequisites, which nothing references", () => {
        // The failure this prevents: deleting a prerequisite from curriculum.ts
        // and having it survive in the database forever, because an upsert has
        // nothing to update. Safe to clear wholesale precisely because no
        // foreign key points at this table.
        expect(COMMITTED).toContain("DELETE FROM prerequisites;");

        expect(
            COMMITTED.indexOf("DELETE FROM prerequisites;"),
            "prerequisites must be cleared before rows are inserted"
        ).toBeLessThan(COMMITTED.indexOf("INSERT INTO prerequisites"));
    });

    it("converges concept_demands pair by pair rather than clearing it", () => {
        // challenges holds a composite foreign key to (concept_id, demand_id)
        // with ON DELETE RESTRICT. A wholesale DELETE would be refused the
        // moment any challenge exists -- on every run, including ones where the
        // curriculum has not changed at all.
        expect(
            COMMITTED,
            "concept_demands must not be cleared wholesale -- challenges references it"
        ).not.toContain("DELETE FROM concept_demands;");

        expect(COMMITTED).toContain("ON CONFLICT (concept_id, demand_id) DO NOTHING;");
    });

    it("never removes a pair a challenge still points at", () => {
        /*
         * The deadlock this prevents. challenges -> concept_demands is ON
         * DELETE RESTRICT, so an unguarded delete of a pair that still has a
         * challenge does not warn -- it aborts 014 and every seed after it,
         * including the content migration that would re-home the challenge and
         * make the delete legal. The curriculum change then cannot be applied
         * at all, on any database that has already been seeded once.
         *
         * With the guard the projection converges over two runs: the first
         * leaves the pair alone and lets the migration run, the second removes
         * it. A rung is still never dropped out from under playable content.
         */
        const block = COMMITTED.slice(COMMITTED.indexOf("DELETE FROM concept_demands cd"));
        const guard = block.slice(0, block.indexOf("AND (c.slug, d.slug) NOT IN ("));

        expect(guard, "the prune is unguarded -- it will abort seeding").toContain(
            "NOT EXISTS ("
        );
        expect(guard).toContain("FROM challenges ch");
        expect(guard).toContain("ch.concept_id = cd.concept_id");
        expect(guard).toContain("ch.demand_id  = cd.demand_id");
    });

    it("removes only pairs the curriculum no longer declares", () => {
        // Targeted, matched on slugs, and run after the inserts so a pair that
        // moved is added before anything is judged stale.
        expect(COMMITTED).toContain("DELETE FROM concept_demands cd");
        expect(COMMITTED).toContain("AND (c.slug, d.slug) NOT IN (");

        expect(
            COMMITTED.lastIndexOf("INSERT INTO concept_demands"),
            "stale pairs must be removed after the inserts, not before"
        ).toBeLessThan(COMMITTED.indexOf("DELETE FROM concept_demands cd"));
    });

    it("lists every declared pair in the keep-set, in projection order", () => {
        // The keep-set IS the projection: a pair missing from it would be
        // deleted on the next seed even though the curriculum still declares it.
        const block = COMMITTED.slice(COMMITTED.indexOf("AND (c.slug, d.slug) NOT IN ("));
        const listed = [...block.matchAll(/^ {6}\('([a-z0-9-]+)', '([a-z0-9-]+)'\),?$/gm)].map(
            (m) => `${m[1]}:${m[2]}`
        );

        const declared = CONCEPTS.flatMap((c) => c.demands.map((d) => `${c.id}:${d}`));

        expect(listed).toEqual(declared);
    });

    it("deletes topics, concepts and demands the curriculum no longer authors", () => {
        for (const table of ["demands", "topics", "concepts"]) {
            expect(COMMITTED, `${table} keeps orphans`).toContain(
                `DELETE FROM ${table} WHERE slug <> ALL (ARRAY[`
            );
        }
    });

    it("runs as one transaction", () => {
        expect(COMMITTED.startsWith("-- GENERATED FILE")).toBe(true);
        expect(COMMITTED).toContain("\nBEGIN;\n");
        expect(COMMITTED.trimEnd().endsWith("COMMIT;")).toBe(true);
    });
});

describe("the projected graph is sound", () => {
    it("names only concepts that exist as prerequisites", () => {
        const slugs = new Set(CONCEPTS.map((c) => c.id));

        for (const c of CONCEPTS) {
            for (const p of c.prerequisites) {
                expect(slugs.has(p), `${c.id} requires unknown concept ${p}`).toBe(true);
            }
        }
    });

    it("has no cycles, so a teaching order is always computable", () => {
        // Asserted here as well as in the client's own curriculum test, because
        // this is the last gate before the graph becomes rows. The database
        // cannot see a cycle -- it is a property of the whole graph, not of any
        // row -- so nothing downstream would catch it.
        const done = new Set<string>();
        let remaining = [...CONCEPTS];

        while (remaining.length > 0) {
            const ready = remaining.filter((c) => c.prerequisites.every((p) => done.has(p)));

            expect(
                ready.length,
                `cycle among: ${remaining.map((c) => c.id).join(", ")}`
            ).toBeGreaterThan(0);

            for (const c of ready) done.add(c.id);
            remaining = remaining.filter((c) => !done.has(c.id));
        }

        expect(done.size).toBe(CONCEPTS.length);
    });

    it("resolves every declared demand", () => {
        for (const c of CONCEPTS) {
            expect(c.demands.length, `${c.id} declares no demands`).toBeGreaterThan(0);

            for (const d of c.demands) {
                expect(DEMANDS, `${c.id} declares unknown demand ${d}`).toContain(d);
            }
        }
    });

    it("files every concept under a topic that exists", () => {
        const topics = new Set(TOPICS.map((t) => t.id));

        for (const c of CONCEPTS) {
            expect(topics.has(c.topic), `${c.id} has unknown topic ${c.topic}`).toBe(true);
        }
    });

    it("keeps slugs unique across the curriculum", () => {
        expect(new Set(CONCEPTS.map((c) => c.id)).size).toBe(CONCEPTS.length);
        expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length);
        expect(new Set(DEMANDS).size).toBe(DEMANDS.length);
    });
});

describe("ordering is deterministic", () => {
    it("numbers topics 1..16 in authored order", () => {
        for (const [i, t] of TOPICS.entries()) {
            const insert = COMMITTED.slice(COMMITTED.indexOf(`VALUES ('${t.id}', `));

            expect(insert.startsWith(`VALUES ('${t.id}', `), `${t.id} not emitted`).toBe(true);
            expect(insert, `${t.id} should be display_order ${i + 1}`).toContain(
                `, ${i + 1},`
            );
        }
    });

    it("restarts concept ordering within each topic", () => {
        // concepts_topic_order_idx is unique on (topic_id, display_order), so a
        // continuous 1..87 numbering would be wrong as well as meaningless.
        for (const t of TOPICS) {
            const inTopic = conceptsInTopic(t.id);

            expect(inTopic.length, `${t.id} has no concepts`).toBeGreaterThan(0);

            for (const [i, c] of inTopic.entries()) {
                const block = COMMITTED.slice(COMMITTED.indexOf(`    '${c.id}',`));
                const order = block.slice(0, block.indexOf(")\nON CONFLICT")).trimEnd();

                expect(order.endsWith(`    ${i + 1}`), `${c.id} should be ${i + 1} in ${t.id}`).toBe(
                    true
                );
            }
        }
    });

    it("numbers demands by their ladder position", () => {
        for (const [i, d] of DEMANDS.entries()) {
            expect(COMMITTED, `${d} should be display_order ${i + 1}`).toContain(
                `VALUES ('${d}', ${i + 1}, `
            );
        }
    });
});

describe("the migration and the projection agree", () => {
    const MIGRATION = readFileSync(
        new URL("../migrations/020_create_curriculum.sql", import.meta.url),
        "utf8"
    );

    it("creates every table the seed writes to", () => {
        for (const table of [
            "demands",
            "topics",
            "concepts",
            "prerequisites",
            "concept_demands"
        ]) {
            expect(MIGRATION, `${table} is never created`).toContain(`CREATE TABLE ${table} (`);
        }
    });

    it("gives the seed the unique indexes its upserts depend on", () => {
        // ON CONFLICT (slug) needs a unique index on slug or it throws at runtime.
        for (const table of ["demands", "topics", "concepts"]) {
            expect(MIGRATION, `${table}.slug is not unique`).toMatch(
                new RegExp(`CREATE UNIQUE INDEX ${table}_slug_idx ON ${table} \\(slug\\)`)
            );
        }
    });

    it("permits every tier and weight the curriculum uses", () => {
        for (const tier of new Set(TOPICS.map((t) => t.tier))) {
            expect(MIGRATION, `tier ${tier} would be rejected`).toContain(`'${tier}'`);
        }

        for (const weight of new Set(CONCEPTS.map((c) => c.weight))) {
            expect(MIGRATION, `weight ${weight} would be rejected`).toContain(`'${weight}'`);
        }
    });

    it("touches no existing table", () => {
        // The reversibility claim: this migration is additive, so nothing in it
        // may alter or drop anything that was already there.
        //
        // Comments are stripped first. The migration explains at length WHY
        // questions.concept is deliberately absent, and a naive search for the
        // word would fail on the prose that exists to prevent the mistake.
        const statements = MIGRATION.split("\n")
            .filter((line) => !line.trimStart().startsWith("--"))
            .join("\n");

        expect(statements).not.toMatch(/ALTER TABLE/i);
        expect(statements).not.toMatch(/DROP TABLE/i);
        expect(statements, "migration references an existing table").not.toMatch(
            /\b(questions|question_options|game_sessions|session_questions)\b/
        );
    });
});
