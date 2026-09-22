/**
 * Projects the authored curriculum into SQL: npm run curriculum:generate
 *
 * Reads client/src/games/curriculum.ts -- the human-editable source of truth --
 * and writes server/seeds/014_curriculum.sql, which the ordinary `npm run seed`
 * then applies. The output is committed so that production seeds without ever
 * running this script, and so that a reviewer sees the projection change in the
 * same pull request as the curriculum change that caused it.
 *
 * WHY A SEED RATHER THAN A MIGRATION. The migration runner keeps a ledger with
 * sha256 checksums, so editing an applied migration is an error by design. The
 * curriculum is expected to change. Seeds have no ledger and are required to
 * converge on re-run, which is exactly the semantics regenerated output needs.
 *
 * WHY THIS SCRIPT CAN IMPORT THE CLIENT. server/tsconfig.json sets
 * rootDir: "src" and include: ["src"], so scripts/ sits outside the typecheck
 * program and can reach across the package boundary without pulling client code
 * into tsc. curriculum.ts imports nothing of its own, so nothing follows it
 * across. The SERVER does not import it -- only this build-time script does; the
 * runtime reads the curriculum from PostgreSQL.
 *
 * DETERMINISM IS THE POINT. Same input, byte-identical output, every time. That
 * is what lets generateCurriculum.test.ts regenerate and compare, so a
 * curriculum edit that was never projected fails the suite rather than silently
 * leaving the database a version behind.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    CONCEPTS,
    DEMANDS,
    DEMAND_SPECS,
    TOPICS,
    conceptsInTopic
} from "../../client/src/games/curriculum.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

export const SEED_PATH = join(HERE, "..", "seeds", "014_curriculum.sql");

/** A PostgreSQL string literal. Doubling is the only escape a standard literal needs. */
function lit(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/** `ARRAY['a', 'b']`, for the delete-what-is-no-longer-authored guards. */
function slugArray(slugs: readonly string[]): string {
    return `ARRAY[${slugs.map(lit).join(", ")}]`;
}

export function generate(): string {
    const out: string[] = [];
    const p = (line = "") => out.push(line);

    p("-- GENERATED FILE -- DO NOT EDIT BY HAND.");
    p("--");
    p("-- Source:    client/src/games/curriculum.ts");
    p("-- Generator: server/scripts/generate-curriculum.ts");
    p("-- Regenerate: npm run curriculum:generate");
    p("--");
    p("-- Edits here are lost the next time the curriculum is projected, and");
    p("-- generateCurriculum.test.ts fails if this file and the source disagree.");
    p("--");
    p("-- CONVERGENT, NOT ADDITIVE. Seeds carry no ledger and are re-run every");
    p("-- time, so this file has to leave the curriculum tables holding exactly");
    p("-- what the source says -- no more. A concept removed from the source");
    p("-- disappears from the database rather than lingering as a tag nothing");
    p("-- points at.");
    p("--");
    p("-- Three convergence strategies, for three different reasons:");
    p("--   topics, concepts, demands  upsert by slug, then delete what is gone");
    p("--   prerequisites              rebuilt outright; nothing references it");
    p("--   concept_demands            converged pair by pair, because challenges");
    p("--                              holds a composite FK to it ON DELETE");
    p("--                              RESTRICT -- see that section");
    p("--");
    p(`-- ${TOPICS.length} topics · ${CONCEPTS.length} concepts · ${DEMANDS.length} demands`);
    p();
    p("BEGIN;");
    p();

    // ── prerequisites: still rebuilt ─────────────────────────────────────
    //
    // Rebuilt rather than upserted. A prerequisite REMOVED from the source has
    // no row to update, so an upsert-only projection would keep it forever. The
    // table is small, entirely derived, and -- unlike concept_demands -- nothing
    // holds a foreign key to it, so clearing it inside the transaction is still
    // both the simplest and the exact answer.
    //
    // concept_demands is NOT cleared here any more. See its own section below:
    // challenges references (concept_id, demand_id) with ON DELETE RESTRICT, so
    // a wholesale DELETE would be refused the moment any challenge exists, even
    // when the curriculum has not changed at all.
    p("-- Rebuilt outright: an upsert cannot remove a prerequisite the source no");
    p("-- longer declares, and nothing holds a foreign key to this table.");
    p("DELETE FROM prerequisites;");
    p();

    // ── demands ──────────────────────────────────────────────────────────
    p("-- ─────────────────────────────────────────────────────────── demands ──");
    p();
    for (const [i, demand] of DEMANDS.entries()) {
        p("INSERT INTO demands (slug, display_order, asks)");
        p(`VALUES (${lit(demand)}, ${i + 1}, ${lit(DEMAND_SPECS[demand].asks)})`);
        p("ON CONFLICT (slug) DO UPDATE");
        p("    SET display_order = EXCLUDED.display_order,");
        p("        asks          = EXCLUDED.asks,");
        p("        updated_at    = CURRENT_TIMESTAMP;");
        p();
    }
    p(`DELETE FROM demands WHERE slug <> ALL (${slugArray(DEMANDS)});`);
    p();

    // ── topics ───────────────────────────────────────────────────────────
    p("-- ──────────────────────────────────────────────────────────── topics ──");
    p();
    for (const [i, topic] of TOPICS.entries()) {
        // principle is the JavaScript idea the topic teaches; rationale is why
        // it sits here. Empty for the topics whose principle is not written yet,
        // which the NOT NULL DEFAULT '' in migration 025 accepts.
        p("INSERT INTO topics (slug, name, tier, display_order, rationale, principle)");
        p(
            `VALUES (${lit(topic.id)}, ${lit(topic.label)}, ${lit(topic.tier)}, ${i + 1},`
        );
        p(`        ${lit(topic.rationale)},`);
        p(`        ${lit(topic.principle ?? "")})`);
        p("ON CONFLICT (slug) DO UPDATE");
        p("    SET name          = EXCLUDED.name,");
        p("        tier          = EXCLUDED.tier,");
        p("        display_order = EXCLUDED.display_order,");
        p("        rationale     = EXCLUDED.rationale,");
        p("        principle     = EXCLUDED.principle,");
        p("        updated_at    = CURRENT_TIMESTAMP;");
        p();
    }
    p(`DELETE FROM topics WHERE slug <> ALL (${slugArray(TOPICS.map((t) => t.id))});`);
    p();

    // ── concepts ─────────────────────────────────────────────────────────
    //
    // Emitted topic by topic so display_order restarts at 1 within each topic,
    // matching concepts_topic_order_idx.
    p("-- ────────────────────────────────────────────────────────── concepts ──");
    p("--");
    p("-- POSITIONS ARE PARKED BEFORE ANY CONCEPT IS WRITTEN.");
    p("--");
    p("-- concepts carries two unique indexes: (slug), which the upserts below");
    p("-- target, and (topic_id, display_order), which they cannot. ON CONFLICT");
    p("-- handles \"this concept exists, move it\" and has nothing to say about \"a");
    p("-- NEW concept wants a position an existing concept still holds\" -- a");
    p("-- violation of the other index, which it does not cover.");
    p("--");
    p("-- That is not hypothetical. Adding `console-output` ahead of");
    p("-- `primitive-types` shifted every concept in `values` down by one, and the");
    p("-- very first INSERT then tried to claim position 1 while primitive-types");
    p("-- still sat on it: 23505 on concepts_topic_order_idx. Rows cannot be");
    p("-- renumbered one at a time under a unique (parent, position) index, in any");
    p("-- order -- so every existing row moves out of the way first, and each");
    p("-- upsert below claims its real position against a clear field.");
    p("--");
    p("-- 1000 is a BOUND, not a guess: a curriculum test caps a topic at nine");
    p("-- concepts, so no final display_order can reach it. A shift derived from");
    p("-- MAX(display_order) would be wrong -- it has to exceed the largest FINAL");
    p("-- position, not the largest current one, and on a database holding a");
    p("-- single concept it parks at 2 and collides with the second new concept.");
    p("--");
    p("-- Anything still parked afterwards is a concept the curriculum no longer");
    p("-- declares, and the DELETE at the end of this section removes it.");
    p("UPDATE concepts SET display_order = display_order + 1000;");
    p();
    for (const topic of TOPICS) {
        p(`-- ${topic.label}`);
        p();
        for (const [i, concept] of conceptsInTopic(topic.id).entries()) {
            p("INSERT INTO concepts");
            p("    (topic_id, slug, name, objective, meaning, why, weight, display_order)");
            p("VALUES (");
            p(`    (SELECT id FROM topics WHERE slug = ${lit(topic.id)}),`);
            p(`    ${lit(concept.id)},`);
            p(`    ${lit(concept.label)},`);
            p(`    ${lit(concept.objective)},`);
            p(`    ${lit(concept.meaning)},`);
            p(`    ${lit(concept.why)},`);
            p(`    ${lit(concept.weight)},`);
            p(`    ${i + 1}`);
            p(")");
            p("ON CONFLICT (slug) DO UPDATE");
            p("    SET topic_id      = EXCLUDED.topic_id,");
            p("        name          = EXCLUDED.name,");
            p("        objective     = EXCLUDED.objective,");
            p("        meaning       = EXCLUDED.meaning,");
            p("        why           = EXCLUDED.why,");
            p("        weight        = EXCLUDED.weight,");
            p("        display_order = EXCLUDED.display_order,");
            p("        updated_at    = CURRENT_TIMESTAMP;");
            p();
        }
    }
    p(`DELETE FROM concepts WHERE slug <> ALL (${slugArray(CONCEPTS.map((c) => c.id))});`);
    p();

    // ── prerequisites ────────────────────────────────────────────────────
    p("-- ───────────────────────────────────────────────────── prerequisites ──");
    p();
    for (const concept of CONCEPTS) {
        for (const requires of concept.prerequisites) {
            p("INSERT INTO prerequisites (concept_id, requires_id)");
            p(`VALUES ((SELECT id FROM concepts WHERE slug = ${lit(concept.id)}),`);
            p(`        (SELECT id FROM concepts WHERE slug = ${lit(requires)}));`);
        }
    }
    p();

    // ── concept_demands ──────────────────────────────────────────────────
    //
    // CONVERGED, NOT REBUILT -- the one place this projection cannot simply
    // clear and re-insert.
    //
    // challenges carries a composite foreign key to (concept_id, demand_id) with
    // ON DELETE RESTRICT, which is what makes "a challenge at a demand its
    // concept does not declare" structurally impossible. The cost is that
    // DELETE FROM concept_demands is refused as soon as one challenge exists --
    // and it would be refused on every run, including runs where the curriculum
    // is byte-identical to the last one.
    //
    // So unchanged pairs are left strictly alone: inserted if missing, ignored
    // if present, and never deleted and recreated. Only a pair the curriculum no
    // longer declares is removed, and if a challenge still points at that pair
    // the delete is refused -- which is the loud failure the RESTRICT exists for.
    // Removing a demand that has playable content should be a deliberate
    // decision, not a silent one.
    //
    // The emitted rows and their order are unchanged from the previous
    // projection: CONCEPTS in declaration order, each concept's demands in
    // declared order. Only the statements around them differ.
    p("-- ─────────────────────────────────────────────────── concept_demands ──");
    p("--");
    p("-- Converged rather than rebuilt: challenges holds a composite foreign key");
    p("-- to (concept_id, demand_id) ON DELETE RESTRICT, so clearing this table");
    p("-- would be refused whenever a challenge exists -- even with no curriculum");
    p("-- change. Unchanged pairs are therefore left untouched.");
    p();

    const pairs: [string, string][] = [];

    for (const concept of CONCEPTS) {
        for (const demand of concept.demands) {
            pairs.push([concept.id, demand]);

            p("INSERT INTO concept_demands (concept_id, demand_id)");
            p(`VALUES ((SELECT id FROM concepts WHERE slug = ${lit(concept.id)}),`);
            p(`        (SELECT id FROM demands WHERE slug = ${lit(demand)}))`);
            p("ON CONFLICT (concept_id, demand_id) DO NOTHING;");
        }
    }
    p();

    // The targeted removal. Matched on slugs rather than ids so the statement
    // does not depend on identity values, and run after the inserts so a pair
    // that moved is added before anything is considered stale.
    p("-- Only pairs the curriculum no longer declares. A pair still referenced by");
    p("-- a challenge is refused here by challenges_concept_demand_fk, which is");
    p("-- the intended failure rather than a bug.");

    if (pairs.length === 0) {
        // Defensive: NOT IN () is not valid SQL. Unreachable while any concept
        // declares a demand, which a curriculum test already requires.
        p("DELETE FROM concept_demands;");
    } else {
        p("DELETE FROM concept_demands cd");
        p("USING concepts c, demands d");
        p("WHERE cd.concept_id = c.id");
        p("  AND cd.demand_id = d.id");
        p("  AND (c.slug, d.slug) NOT IN (");

        for (const [i, [concept, demand]] of pairs.entries()) {
            const comma = i === pairs.length - 1 ? "" : ",";

            p(`      (${lit(concept)}, ${lit(demand)})${comma}`);
        }

        p("  );");
    }
    p();

    p("COMMIT;");
    p();

    return out.join("\n");
}

/** Only when run directly, so the test can import generate() without writing. */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const sql = generate();

    writeFileSync(SEED_PATH, sql, "utf8");
    console.log(
        `  wrote ${SEED_PATH}\n` +
            `  ${TOPICS.length} topics · ${CONCEPTS.length} concepts · ` +
            `${DEMANDS.length} demands · ` +
            `${CONCEPTS.reduce((n, c) => n + c.prerequisites.length, 0)} prerequisites · ` +
            `${CONCEPTS.reduce((n, c) => n + c.demands.length, 0)} concept_demands`
    );
}
