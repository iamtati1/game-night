import { runInNewContext } from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "../curriculum/database.fixture.js";
import { curriculumCtes } from "../curriculum/selection.js";
import { dealableSnippet } from "./queries.js";
import { FLUSH_ROUNDS_PER_SESSION } from "./scoring.js";

/**
 * Flush meets a learner where they are.
 *
 * Playtest: a beginner did not understand Flush. Every snippet was Async, and
 * the dealer ignored the curriculum, so the first round was setTimeout(..., 0)
 * for someone on their first concept. 083 adds puzzles for the start of the
 * path, and the dealer now applies the gate Code Blitz and Bug Hunt use.
 *
 * Asserted against the real migrations and seeds, through the same predicate
 * the dealer runs, so what is tested is what is dealt.
 */

let fx: CurriculumFixture;

interface Dealable {
    id: number;
    concept: string;
    topic: string;
}

async function dealable(userId: string): Promise<Dealable[]> {
    return fx.rows<Dealable>(
        `WITH ${curriculumCtes("$1")}
         SELECT s.id::int AS id, c.slug AS concept, t.slug AS topic
         FROM flush_snippets s
         JOIN challenges ch ON ch.id = s.challenge_id
         JOIN concepts c    ON c.id  = ch.concept_id
         JOIN topics t      ON t.id  = c.topic_id
         WHERE ${dealableSnippet("s")}
         ORDER BY s.id`,
        [userId]
    );
}

/** Records that the learner sat through a concept's Learn Beat: an encounter. */
async function meet(userId: string, ...concepts: string[]): Promise<void> {
    for (const slug of concepts) {
        const intro = await fx.rows<{ id: string }>(
            `SELECT ch.id FROM challenges ch JOIN concepts c ON c.id = ch.concept_id
             WHERE c.slug = $1 AND ch.role = 'introduce' AND ch.is_active
             ORDER BY ch.id LIMIT 1`,
            [slug]
        );
        if (!intro[0]) throw new Error(`no introduction for ${slug}`);
        await fx.db.query(
            `INSERT INTO introduction_completions (user_id, challenge_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [userId, intro[0].id]
        );
    }
}

const ASYNC_TOPIC = "async";

beforeAll(async () => {
    fx = await buildCurriculumFixture();
}, 300000);

describe("which Flush puzzles a learner can be dealt", () => {
    it("deals nothing to someone who has met nothing -- not even beginner puzzles", async () => {
        const user = await fx.insertUser("flush-fresh@jolt.test");
        expect(await dealable(user)).toEqual([]);
    });

    it("opens a concept's puzzles once its lesson has been met, and only those", async () => {
        const user = await fx.insertUser("flush-first@jolt.test");
        await meet(user, "console-output");

        const got = await dealable(user);
        expect(got.length).toBeGreaterThan(0);
        expect(new Set(got.map((g) => g.concept))).toEqual(new Set(["console-output"]));
    });

    it("can build a whole game from the start of the Values topic, with no Async in it", async () => {
        const user = await fx.insertUser("flush-values@jolt.test");
        await meet(user, "console-output", "arithmetic-operators", "expressions-produce-values");

        const got = await dealable(user);
        expect(got.length).toBeGreaterThanOrEqual(FLUSH_ROUNDS_PER_SESSION);
        expect(got.every((g) => g.topic === "values")).toBe(true);
    });

    it("keeps every Async puzzle out of reach of a beginner", async () => {
        const user = await fx.insertUser("flush-beginner@jolt.test");
        await meet(
            user,
            "console-output", "arithmetic-operators", "expressions-produce-values",
            "variables-name-values", "declaration", "initialization", "assignment",
            "reading-variables", "reassignment", "variable-state"
        );

        const got = await dealable(user);
        expect(got.filter((g) => g.topic === ASYNC_TOPIC)).toEqual([]);
        expect(got.some((g) => g.concept === "reassignment")).toBe(true);
    });

    it("still deals the Async puzzles once a learner has met Async", async () => {
        const user = await fx.insertUser("flush-async@jolt.test");
        const every = await fx.rows<{ slug: string }>(
            `SELECT DISTINCT c.slug FROM concepts c
             JOIN challenges ch ON ch.concept_id = c.id AND ch.role = 'introduce' AND ch.is_active`
        );
        await meet(user, ...every.map((c) => c.slug));

        const got = await dealable(user);
        expect(got.filter((g) => g.topic === ASYNC_TOPIC).length).toBeGreaterThan(20);
    });
});

describe("the beginner puzzles are correct", () => {
    interface Snippet {
        prompt: string;
        explanation: string | null;
        outputs: string[];
        distractors: string[];
        topic: string;
    }

    async function beginnerSnippets(): Promise<Snippet[]> {
        return fx.rows<Snippet>(
            `SELECT s.prompt, s.explanation, t.slug AS topic,
                    ARRAY(SELECT o.output_text FROM flush_outputs o
                          WHERE o.snippet_id = s.id AND o.is_active AND NOT o.is_distractor
                          ORDER BY o.position) AS outputs,
                    ARRAY(SELECT o.output_text FROM flush_outputs o
                          WHERE o.snippet_id = s.id AND o.is_active AND o.is_distractor
                          ORDER BY o.output_text) AS distractors
             FROM flush_snippets s
             JOIN challenges ch ON ch.id = s.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN topics t      ON t.id  = c.topic_id
             WHERE s.is_active AND t.slug <> $1`,
            [ASYNC_TOPIC]
        );
    }

    /** What console.log would print, line by line, for synchronous code. */
    function run(code: string): string[] {
        const lines: string[] = [];
        runInNewContext(code, { console: { log: (...v: unknown[]) => lines.push(v.map(String).join(" ")) } });
        return lines;
    }

    it("exists, and every one explains itself", async () => {
        const snippets = await beginnerSnippets();
        expect(snippets.length).toBeGreaterThanOrEqual(8);
        for (const s of snippets) expect(s.explanation, s.prompt).toBeTruthy();
    });

    it("prints exactly what it says it prints, in that order", async () => {
        for (const s of await beginnerSnippets()) {
            expect(run(s.prompt), s.prompt).toEqual(s.outputs);
        }
    });

    it("never offers a distractor that the code actually prints", async () => {
        for (const s of await beginnerSnippets()) {
            const printed = new Set(run(s.prompt));
            for (const d of s.distractors) expect(printed.has(d), `${s.prompt} -> ${d}`).toBe(false);
        }
    });

    it("uses nothing asynchronous", async () => {
        for (const s of await beginnerSnippets()) {
            expect(s.prompt).not.toMatch(/setTimeout|Promise|async|await|\.then\(/);
        }
    });
});
