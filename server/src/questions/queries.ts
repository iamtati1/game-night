import type { PoolClient } from "pg";
import { pool } from "../db.js";
import type { NormalizedQuestion } from "./types.js";

/**
 * A question is only playable if it actually has answers. The "at least two
 * options, exactly one correct" invariants are cross-row and cannot be CHECK
 * constraints, so they are enforced here at read time. This matters more now
 * that questions arrive from outside: a partially-imported question must never
 * be dealt into a game.
 */
export const ELIGIBLE_QUESTION_PREDICATE = `
    q.is_active
    AND (SELECT COUNT(*) FROM question_options o
         WHERE o.question_id = q.id AND o.is_active) >= 2
    AND (SELECT COUNT(*) FROM question_options o
         WHERE o.question_id = q.id AND o.is_active AND o.is_correct) = 1
`;

export async function countEligibleQuestions(): Promise<number> {
    const result = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM questions q WHERE ${ELIGIBLE_QUESTION_PREDICATE}`
    );

    return Number(result.rows[0]!.count);
}

export type InsertOutcome = "inserted" | "duplicate";

/**
 * Inserts one question and its options atomically. Duplicate detection relies on
 * questions_external_ref_idx rather than a prior SELECT, so two concurrent
 * imports cannot both slip the same question through.
 */
export async function insertImportedQuestion(
    question: NormalizedQuestion
): Promise<InsertOutcome> {
    const client: PoolClient = await pool.connect();

    try {
        await client.query("BEGIN");

        const inserted = await client.query<{ id: string }>(
            `INSERT INTO questions (prompt, source, external_ref)
             VALUES ($1, $2, $3)
             ON CONFLICT (source, external_ref) WHERE external_ref IS NOT NULL DO NOTHING
             RETURNING id`,
            [question.prompt, question.source, question.externalRef]
        );

        if (inserted.rowCount === 0) {
            await client.query("ROLLBACK");
            return "duplicate";
        }

        const questionId = inserted.rows[0]!.id;

        for (const [index, option] of question.options.entries()) {
            await client.query(
                `INSERT INTO question_options (question_id, option_text, display_order, is_correct)
                 VALUES ($1, $2, $3, $4)`,
                [questionId, option.text, index + 1, option.isCorrect]
            );
        }

        await client.query("COMMIT");

        return "inserted";
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}
