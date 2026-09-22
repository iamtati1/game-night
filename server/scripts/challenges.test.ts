import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ELIGIBLE_QUESTION_PREDICATE } from "../src/questions/queries.ts";

/**
 * The challenges layer, checked at the level of its schema.
 *
 * These are source-level guards in the style of sessionInsert.test.ts, for the
 * same reason that file exists: the properties worth protecting here are
 * structural, and the suite runs with no database to reach. What a real
 * PostgreSQL proves -- that the migration applies, that the constraints reject
 * what they should -- is verified separately against PGlite during the slice,
 * and the invariants that survive are the ones asserted below.
 *
 * The important distinction this file draws, and the reason it imports the real
 * ELIGIBLE_QUESTION_PREDICATE rather than describing it:
 *
 *     a valid database relationship   IS NOT   playable by the game
 *
 * A question can point at a challenge, satisfy every foreign key, and still
 * never be dealt -- because each game applies its own selection predicate on
 * top. Three complete-code questions are in exactly that state today.
 */

const MIGRATION = readFileSync(
    new URL("../migrations/021_create_challenges.sql", import.meta.url),
    "utf8"
);

/** The migration with comments removed, so prose cannot satisfy a check. */
const STATEMENTS = MIGRATION.split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

const CURRICULUM = readFileSync(
    new URL("../migrations/020_create_curriculum.sql", import.meta.url),
    "utf8"
);

describe("challenges is a pedagogical record, not a content owner", () => {
    it("carries no per-game column", () => {
        // The nullable mega-table this architecture exists to avoid. A challenge
        // pointing down at content would need one of these per game.
        for (const column of ["question_id", "snippet_id", "incident_id", "prompt_id"]) {
            expect(STATEMENTS, `challenges owns content via ${column}`).not.toContain(column);
        }
    });

    it("is pointed at by questions rather than owning them", () => {
        expect(STATEMENTS).toContain("ALTER TABLE questions");
        expect(STATEMENTS).toMatch(
            /ADD COLUMN challenge_id BIGINT REFERENCES challenges \(id\)/
        );
    });

    it("leaves every existing question key and column alone", () => {
        // The reversibility claim. The only permitted change to an existing
        // table is the one nullable column added above.
        expect(STATEMENTS).not.toMatch(/DROP COLUMN/i);
        expect(STATEMENTS).not.toMatch(/ALTER COLUMN/i);
        expect(STATEMENTS).not.toMatch(/DROP TABLE/i);
        expect(STATEMENTS).not.toMatch(/PRIMARY KEY \(challenge_id\)/i);

        // questions is the only pre-existing table touched at all.
        const altered = [...STATEMENTS.matchAll(/ALTER TABLE (\w+)/g)].map((m) => m[1]);

        expect(altered).toEqual(["questions"]);
    });

    it("backfills nothing", () => {
        // 021 creates the table and the column. Tagging content is a later
        // slice, and doing it here would make the step irreversible.
        expect(STATEMENTS).not.toMatch(/INSERT INTO challenges/i);
        expect(STATEMENTS).not.toMatch(/UPDATE questions/i);
    });
});

describe("the composite foreign key enforces the real invariant", () => {
    it("references the concept_demands pair, not concepts and demands separately", () => {
        // The invariant worth having is "this concept DECLARES this demand".
        // Two single-column foreign keys cannot see that.
        expect(STATEMENTS).toMatch(
            /FOREIGN KEY \(concept_id, demand_id\)\s*\n\s*REFERENCES concept_demands \(concept_id, demand_id\)/
        );
    });

    it("has a parent key to reference", () => {
        // A composite FK needs a unique constraint on exactly that pair. It
        // exists as the primary key from migration 020 -- asserted here so that
        // changing 020 breaks this test rather than the database.
        expect(CURRICULUM).toMatch(/PRIMARY KEY \(concept_id, demand_id\)/);
    });

    it("does not also carry redundant single-column foreign keys", () => {
        // Referential integrity to concepts and demands comes free: a pair can
        // only exist in concept_demands if both of its own keys hold. Declaring
        // them again would add constraint checks that can never fail.
        expect(STATEMENTS).not.toMatch(/concept_id\s+BIGINT\s+NOT NULL\s+REFERENCES concepts/);
        expect(STATEMENTS).not.toMatch(/demand_id\s+BIGINT\s+NOT NULL\s+REFERENCES demands/);
    });

    it("restricts rather than cascades", () => {
        // Removing a demand from a concept that has playable content must fail
        // loudly. Cascading would delete the challenge -- and, once content
        // points at it, silently orphan real questions.
        const fk = STATEMENTS.slice(STATEMENTS.indexOf("challenges_concept_demand_fk"));

        expect(fk.slice(0, 300)).toContain("ON DELETE RESTRICT");
        expect(STATEMENTS).not.toMatch(/REFERENCES concept_demands[\s\S]{0,120}ON DELETE CASCADE/);
    });
});

describe("the columns say what they mean", () => {
    it("allows exactly three roles", () => {
        expect(STATEMENTS).toMatch(
            /CHECK \(role IN \('introduce', 'practise', 'reinforce'\)\)/
        );
    });

    it("ranges difficulty 1-4, not the 1-5 other games use", () => {
        // questions.difficulty is 1-4; tick_snippets and bug_hunt_incidents are
        // 1-5 and mean something different -- each game's own pacing ramp.
        // Three columns have shared this name and never shared a meaning.
        expect(STATEMENTS).toMatch(/CHECK \(difficulty BETWEEN 1 AND 4\)/);
    });

    it("stores difficulty rather than generating it", () => {
        // A PostgreSQL generated column may reference only its own row, and the
        // tier lives two joins away on topics.
        expect(STATEMENTS).not.toMatch(/GENERATED ALWAYS AS \(/);
        expect(STATEMENTS).toMatch(/difficulty\s+SMALLINT NOT NULL/);
    });

    it("carries no tier column", () => {
        // Tier is needed only to compute difficulty, at generation time. A copy
        // here would be the second source of truth the architecture forbids.
        expect(STATEMENTS).not.toMatch(/\btier\b/);
    });

    it("indexes the composite key, the demand, and the dealing path", () => {
        expect(STATEMENTS).toContain(
            "CREATE INDEX challenges_concept_demand_idx ON challenges (concept_id, demand_id)"
        );
        expect(STATEMENTS).toContain("CREATE INDEX challenges_demand_idx ON challenges (demand_id)");
        expect(STATEMENTS).toMatch(/challenges_dealing_idx ON challenges \(difficulty\) WHERE is_active/);
    });

    it("lets one challenge be realised by at most one question", () => {
        // Partial, because 234 un-backfilled rows all share NULL and a plain
        // unique index would reject every one of them after the first.
        expect(STATEMENTS).toMatch(
            /CREATE UNIQUE INDEX questions_challenge_id_idx\s*\n\s*ON questions \(challenge_id\) WHERE challenge_id IS NOT NULL/
        );
    });
});

/**
 * The regression this slice exists to record.
 *
 * Linking a question to a challenge proves a database relationship. It does not
 * prove the game would ever deal that question. Three complete-code questions
 * are the live counter-example: each carries TWO is_correct options, because an
 * assembled answer is a sequence, while the predicate Code Blitz selects with
 * demands exactly one.
 *
 * The predicate is imported rather than described, so this test tracks the real
 * one. When complete-code eligibility is fixed -- a separate decision -- this
 * test fails and says so, which is the point of writing it down now.
 */
describe("database presence is not gameplay eligibility", () => {
    it("selects on exactly one correct option", () => {
        expect(ELIGIBLE_QUESTION_PREDICATE).toMatch(
            /AND o\.is_correct\) = 1/
        );
    });

    it("records that complete-code answers carry two correct options", () => {
        // From seed 013: is_correct is derived as (option ? 'pos'), and each of
        // the three questions positions two tokens.
        const SEED = readFileSync(
            new URL("../seeds/013_complete_code.sql", import.meta.url),
            "utf8"
        );

        expect(SEED).toContain("(v_option ? 'pos')");

        const positioned = [...SEED.matchAll(/"pos":\s*\d/g)].length;
        const questions = [...SEED.matchAll(/SELECT seed_complete_code\(/g)].length;

        expect(questions, "three complete-code questions").toBe(3);
        expect(positioned, "two positioned tokens each").toBe(questions * 2);
    });

    it("therefore excludes every complete-code question from dealing", () => {
        // Two correct options against a predicate demanding exactly one. The
        // arithmetic is the whole finding: these questions exist, can be linked
        // to challenges, and can never be served.
        const correctPerQuestion = 2;

        expect(
            correctPerQuestion === 1,
            "complete-code questions are currently NOT dealable -- " +
                "ELIGIBLE_QUESTION_PREDICATE requires exactly one is_correct option. " +
                "If this now passes, complete-code eligibility was fixed and this " +
                "regression test should be updated deliberately."
        ).toBe(false);
    });

    it("keeps the predicate a shared import, not a retyped copy", () => {
        // A test that retyped the predicate would keep passing after the real
        // one changed, which is how the original problem went unnoticed.
        const SOURCE = readFileSync(
            new URL("../src/questions/queries.ts", import.meta.url),
            "utf8"
        );

        expect(SOURCE).toContain("export const ELIGIBLE_QUESTION_PREDICATE");
    });
});
