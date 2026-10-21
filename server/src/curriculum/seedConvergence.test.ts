import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * SEEDING TWICE MUST CHANGE NOTHING.
 *
 * THE DEFECT THIS EXISTS FOR. 34 seeds identified their questions by prompt
 * text -- `SELECT id FROM questions WHERE prompt = p_prompt` -- and five later
 * seeds rewrite prompts: 059 and 060 reorder the blocks, 061 finishes that job,
 * 029 rewrites wording outright, 009 backfills. Once a stored prompt no longer
 * matched the authored one the guard could never match again, so every
 * `npm run seed` inserted another copy. On the development database 41
 * questions had reached three copies each -- 82 excess questions, and 82 excess
 * challenges with them, sitting on real rungs where learners would meet them.
 *
 * WHY NOTHING CAUGHT IT. database.fixture.ts applies migrations and seeds
 * exactly once, and curriculumReorder.test.ts re-applies only 014 against a
 * fixture with no questions in it. No test had ever applied the seed set twice,
 * so a non-convergent seed was invisible by construction -- whatever its
 * mechanism. That is the hole this closes, and it closes it for any future seed
 * too, because it measures the outcome rather than the technique.
 *
 * The README promises `npm run seed` is safe to re-run. This is the test that
 * makes that a claim rather than a hope.
 */
const SEEDS = new URL("../../seeds/", import.meta.url);
const MIGRATIONS = new URL("../../migrations/", import.meta.url);

const files = (base: URL) =>
    readdirSync(base)
        .filter((f) => f.endsWith(".sql"))
        .sort();

interface Census {
    questions: number;
    activeQuestions: number;
    options: number;
    challenges: number;
    concepts: number;
    conceptDemands: number;
    incidents: number;
    evidence: number;
    duplicatePrompts: number;
    unnamed: number;
}

let db: PGlite;
let first: Census;
let second: Census;

async function census(): Promise<Census> {
    const one = async (sql: string): Promise<number> =>
        Number((await db.query<{ n: number }>(sql)).rows[0]!.n);

    return {
        questions: await one("SELECT COUNT(*)::int n FROM questions"),
        activeQuestions: await one("SELECT COUNT(*)::int n FROM questions WHERE is_active"),
        options: await one("SELECT COUNT(*)::int n FROM question_options"),
        challenges: await one("SELECT COUNT(*)::int n FROM challenges"),
        concepts: await one("SELECT COUNT(*)::int n FROM concepts"),
        conceptDemands: await one("SELECT COUNT(*)::int n FROM concept_demands"),
        incidents: await one("SELECT COUNT(*)::int n FROM bug_hunt_incidents"),
        evidence: await one("SELECT COUNT(*)::int n FROM session_questions"),
        duplicatePrompts: await one(
            `SELECT COALESCE(SUM(n - 1), 0)::int n
             FROM (SELECT COUNT(*)::int n FROM questions GROUP BY prompt HAVING COUNT(*) > 1) t`
        ),
        unnamed: await one(
            `SELECT COUNT(*)::int n FROM questions
             WHERE source <> 'internal' AND external_ref IS NULL`
        )
    };
}

beforeAll(async () => {
    db = new PGlite();

    for (const file of files(MIGRATIONS)) {
        await db.exec(readFileSync(new URL(file, MIGRATIONS), "utf8"));
    }

    for (const file of files(SEEDS)) {
        await db.exec(readFileSync(new URL(file, SEEDS), "utf8"));
    }

    // A learner with history, so the second pass has evidence to preserve and
    // RESTRICT has something to refuse. An empty database cannot show either.
    await db.exec(`
        INSERT INTO users (email, username, password_hash)
        VALUES ('convergence@jolt.test', 'convergence', 'x');

        INSERT INTO game_sessions (user_id, game_id, status, completed_at)
        SELECT u.id, (SELECT id FROM games WHERE slug = 'code-blitz'),
               'completed', CURRENT_TIMESTAMP
        FROM users u WHERE u.username = 'convergence';

        INSERT INTO session_questions
            (game_session_id, question_id, display_order, prompt_text, status,
             served_at, selected_option_id, selected_option_text, correct_option_text,
             is_correct, answered_at)
        SELECT s.id, q.id, ROW_NUMBER() OVER (ORDER BY q.id), q.prompt, 'answered',
               CURRENT_TIMESTAMP, q.option_id, q.option_text, q.option_text,
               TRUE, CURRENT_TIMESTAMP
        FROM game_sessions s,
             (SELECT qq.id, qq.prompt, o.id AS option_id, o.option_text
              FROM questions qq
              JOIN question_options o ON o.question_id = qq.id AND o.is_correct
              WHERE qq.is_active AND qq.challenge_id IS NOT NULL
              ORDER BY qq.id LIMIT 5) q
        WHERE s.user_id = (SELECT id FROM users WHERE username = 'convergence');
    `);

    first = await census();

    for (const file of files(SEEDS)) {
        await db.exec(readFileSync(new URL(file, SEEDS), "utf8"));
    }

    second = await census();
}, 300000);

describe("applying every seed a second time", () => {
    it("builds something worth measuring in the first place", () => {
        // Guards the test. If the seeds stopped producing content, every
        // equality below would hold vacuously.
        expect(first.questions).toBeGreaterThan(200);
        expect(first.challenges).toBeGreaterThan(100);
        expect(first.evidence).toBe(5);
    });

    it("adds no questions", () => {
        expect(second.questions).toBe(first.questions);
    });

    it("adds no challenges", () => {
        // Each duplicated question dragged a challenge in with it, onto a real
        // rung, where a learner would have met the same question twice.
        expect(second.challenges).toBe(first.challenges);
    });

    it("adds no options, incidents or curriculum rows", () => {
        expect(second.options).toBe(first.options);
        expect(second.incidents).toBe(first.incidents);
        expect(second.concepts).toBe(first.concepts);
        expect(second.conceptDemands).toBe(first.conceptDemands);
    });

    it("leaves learner evidence exactly as it was", () => {
        // The reason seeding twice is not merely untidy. A seed that deletes
        // and re-inserts options is refused by RESTRICT once anyone has
        // answered -- which is how 029 used to abort the whole run.
        expect(second.evidence).toBe(first.evidence);
    });

    it("leaves no question with a duplicate prompt", () => {
        expect(first.duplicatePrompts, "the first pass already duplicates").toBe(0);
        expect(second.duplicatePrompts, "the second pass duplicates").toBe(0);
    });

    it("retires exactly what it retired the first time", () => {
        // Seed 079 deactivates the untagged legacy bank. A second pass must not
        // revive it, and must not retire anything further.
        expect(second.activeQuestions).toBe(first.activeQuestions);
    });
});

describe("every seeded question has a name", () => {
    it("gives one to every curriculum question", () => {
        // `internal` is the pre-curriculum Code Blitz bank, retired by seed 079
        // and excluded here -- see the sibling assertion below.
        expect(first.unnamed, "curriculum questions without a stable name").toBe(0);
        expect(second.unnamed).toBe(0);
    });

    it("keeps names unique within their source", async () => {
        // What questions_external_ref_idx enforces. Asserted as well, because a
        // clash would otherwise surface as a seed failure rather than as the
        // naming mistake it is.
        const clashes = await db.query<{ n: number }>(
            `SELECT COUNT(*)::int n FROM (
                 SELECT source, external_ref FROM questions
                 WHERE external_ref IS NOT NULL
                 GROUP BY source, external_ref HAVING COUNT(*) > 1
             ) t`
        );

        expect(Number(clashes.rows[0]!.n)).toBe(0);
    });

    it("names the same row on both passes, rather than renaming rows", async () => {
        // Adoption must be a one-time event. A seed that re-pointed names at
        // different rows would keep the counts flat while quietly reshuffling
        // which question a learner's history belongs to.
        const drift = await db.query<{ n: number }>(
            `SELECT COUNT(*)::int n FROM questions
             WHERE external_ref IS NOT NULL AND updated_at > created_at + INTERVAL '1 second'`
        );

        expect(Number(drift.rows[0]!.n)).toBe(0);
    });
});

/**
 * The prompt rewriters, and whether they still have anything to rewrite.
 *
 * 059, 060 and 061 exist because questions were authored with their blocks in
 * the wrong order: `splitPrompt` expects prose, blank line, then the snippet,
 * and these were written the other way round, so the renderer put the question
 * in the code box. The seeds fixed the rows in the database and left the
 * authored text alone -- which is what started the drift, because the guards
 * that stop re-insertion compared authored text against stored text.
 *
 * The authored text is now the shape the renderer wants, so on a fresh database
 * these three have nothing to do. Keeping them costs nothing and they are still
 * needed by databases seeded before the correction; what matters is that they
 * stop being the reason the two texts disagree.
 */
describe("the prompt rewriters have nothing left to rewrite", () => {
    it("leaves every repair and diagnose prompt in the shape it found it", async () => {
        // Asserted as a property of the stored rows rather than by re-running
        // the seeds: every practise prompt that has a snippet asks its question
        // in the FIRST block, which is precisely what 059/060/061 enforce.
        const wrong = await db.query<{ n: number }>(
            `SELECT COUNT(*)::int n
             FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN demands d     ON d.id  = ch.demand_id
             WHERE q.is_active
               AND d.slug IN ('repair', 'diagnose')
               AND q.prompt LIKE '%' || chr(10) || chr(10) || '%'
               AND split_part(q.prompt, chr(10) || chr(10), 1) NOT LIKE '%?'`
        );

        expect(Number(wrong.rows[0]!.n), "prompts still asking in the code box").toBe(0);
    });

    it("left nothing matching 060's own condition", async () => {
        /*
         * 060's subject exactly: three blocks, where the LAST one is a prose
         * question. Those rendered with the question inside the code box.
         *
         * Not "no three-block prompt at all" -- 19 of those survive on purpose,
         * where the trailing block is more code or more prose rather than the
         * question, and 060 deliberately skips them. Asserting the broader
         * claim fails on content that is correct, which is the kind of test
         * that gets weakened later rather than fixed.
         */
        const pending = await db.query<{ n: number }>(
            `SELECT COUNT(*)::int n
             FROM (
                 SELECT substr(q.prompt, length(split_part(q.prompt, chr(10) || chr(10), 1)) + 3) AS rest
                 FROM questions q
                 JOIN challenges ch ON ch.id = q.challenge_id
                 WHERE q.is_active AND ch.role = 'practise'
                   AND q.prompt LIKE '%' || chr(10) || chr(10) || '%'
             ) t
             WHERE position(chr(10) || chr(10) IN rest) > 0
               AND substr(rest, position(chr(10) || chr(10) IN rest) + 2) LIKE '%?'
               AND position(chr(10) || chr(10) IN substr(rest, position(chr(10) || chr(10) IN rest) + 2)) = 0`
        );

        expect(Number(pending.rows[0]!.n), "060 would still reshape these").toBe(0);
    });
});
