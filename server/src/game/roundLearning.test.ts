import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * WHAT A ROUND DID TO THE LEARNING, answered from the server's own evidence.
 *
 * The results screen now names the rungs a run produced evidence for. The risk
 * that creates is a SECOND progress model -- a screen that counts its own
 * correct answers and drifts from the map. These tests pin the derivation to
 * the same join CLEARED_RUNGS_CTE makes, narrowed to one session.
 */

const db = new PGlite();

const pool = {
    query: async <T>(text: string, params?: unknown[]) => {
        const result = await db.query<T>(text, params as never[]);
        return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    }
};

vi.mock("../db.js", () => ({ pool }));

const { rungsEarnedInSession, conceptForQuestion } = await import("./queries.js");

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await db.query<T>(sql, params as never[])).rows;
}

let userId: string;
let sessionId: string;
let tagged: { questionId: string; conceptSlug: string; demandSlug: string };
let untagged: string;

beforeAll(async () => {
    for (const dir of ["migrations", "seeds"]) {
        const base = new URL(`../../${dir}/`, import.meta.url);

        for (const f of readdirSync(base).filter((f) => f.endsWith(".sql")).sort()) {
            await db.exec(readFileSync(new URL(f, base), "utf8"));
        }
    }

    [{ id: userId }] = await rows<{ id: string }>(
        `INSERT INTO users (email, username, password_hash)
         VALUES ('round@jolt.test', 'round', 'x') RETURNING id`
    );

    [{ id: sessionId }] = await rows<{ id: string }>(
        `INSERT INTO game_sessions (user_id, game_id)
         VALUES ($1, (SELECT id FROM games WHERE slug = 'code-blitz')) RETURNING id`,
        [userId]
    );

    const [t] = await rows<{ question_id: string; concept_slug: string; demand_slug: string }>(
        `SELECT q.id AS question_id, c.slug AS concept_slug, d.slug AS demand_slug
         FROM questions q
         JOIN challenges ch ON ch.id = q.challenge_id
         JOIN concepts c    ON c.id  = ch.concept_id
         JOIN demands d     ON d.id  = ch.demand_id
         WHERE q.is_active AND ch.is_active AND ch.role = 'practise'
         ORDER BY q.id LIMIT 1`
    );

    tagged = { questionId: t!.question_id, conceptSlug: t!.concept_slug, demandSlug: t!.demand_slug };

    [{ id: untagged }] = await rows<{ id: string }>(
        `SELECT id FROM questions WHERE is_active AND challenge_id IS NULL ORDER BY id LIMIT 1`
    );
});

/** An answered question, filled the way the game fills one. */
async function answer(questionId: string, correct: boolean, order: number): Promise<void> {
    const [option] = await rows<{ id: string; text: string }>(
        `SELECT id, option_text AS text FROM question_options
         WHERE question_id = $1 AND is_active AND is_correct = $2 ORDER BY id LIMIT 1`,
        [questionId, correct]
    );
    const [right] = await rows<{ text: string }>(
        `SELECT option_text AS text FROM question_options
         WHERE question_id = $1 AND is_active AND is_correct ORDER BY id LIMIT 1`,
        [questionId]
    );

    await rows(
        `INSERT INTO session_questions
             (game_session_id, question_id, display_order, prompt_text, status,
              served_at, selected_option_id, selected_option_text,
              correct_option_text, is_correct, answered_at)
         VALUES ($1, $2, $3, 'x', 'answered', CURRENT_TIMESTAMP, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [sessionId, questionId, order, option!.id, option!.text, right!.text, correct]
    );
}

describe("a question knows what it is practice for", () => {
    it("names the concept and rung of a tagged practice question", async () => {
        const tag = await conceptForQuestion(tagged.questionId);

        expect(tag?.conceptSlug).toBe(tagged.conceptSlug);
        expect(tag?.demandSlug).toBe(tagged.demandSlug);
        expect(tag?.conceptName).toBeTruthy();
    });

    it("says nothing for an untagged question", async () => {
        // 234 active questions carry no challenge. Marking one as practice for
        // the current concept would be the invented relationship the whole
        // targeting effort exists to avoid.
        expect(await conceptForQuestion(untagged)).toBeNull();
    });
});

describe("the rungs a round earned", () => {
    it("is empty before anything is answered", async () => {
        expect(await rungsEarnedInSession(sessionId)).toEqual([]);
    });

    it("ignores a wrong answer", async () => {
        await answer(tagged.questionId, false, 1);

        expect(await rungsEarnedInSession(sessionId)).toEqual([]);
    });

    it("reports a rung a correct answer earned", async () => {
        /* One in_progress session per user, so the previous run ends before a
           new one opens -- exactly what the route does. */
        await rows(
            `UPDATE game_sessions SET status='completed', completed_at=CURRENT_TIMESTAMP
             WHERE id = $1`,
            [sessionId]
        );

        const second = await rows<{ id: string }>(
            `INSERT INTO game_sessions (user_id, game_id)
             VALUES ($1, (SELECT id FROM games WHERE slug = 'code-blitz')) RETURNING id`,
            [userId]
        );

        sessionId = second[0]!.id;
        await answer(tagged.questionId, true, 1);

        const earned = await rungsEarnedInSession(sessionId);

        expect(earned).toHaveLength(1);
        expect(earned[0]!.conceptSlug).toBe(tagged.conceptSlug);
        expect(earned[0]!.demandSlug).toBe(tagged.demandSlug);
    });

    it("does not credit an untagged question, however it was answered", async () => {
        const before = await rungsEarnedInSession(sessionId);

        await answer(untagged, true, 2);

        expect(await rungsEarnedInSession(sessionId)).toHaveLength(before.length);
    });

    it("reports only THIS round", async () => {
        // The screen says what this run did. Reading every session the learner
        // has ever played would make a round that changed nothing look like it
        // had changed everything.
        const [other] = await rows<{ id: string }>(
            `INSERT INTO users (email, username, password_hash)
             VALUES ('other-round@jolt.test', 'otherround', 'x') RETURNING id`
        );

        const [theirs] = await rows<{ id: string }>(
            `INSERT INTO game_sessions (user_id, game_id)
             VALUES ($1, (SELECT id FROM games WHERE slug = 'code-blitz')) RETURNING id`,
            [other!.id]
        );

        expect(await rungsEarnedInSession(theirs!.id)).toEqual([]);
    });
});
