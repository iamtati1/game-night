import { z } from "zod";

/**
 * QuizAPI's wire format. Deliberately permissive about unknown keys -- Zod
 * strips them by default -- so the provider adding fields cannot break us.
 * We are strict only about the fields we actually read.
 *
 * Quirk worth noting: QuizAPI returns booleans as the STRINGS "true"/"false",
 * so correctness is compared against a string, not coerced with Boolean().
 */
export const quizApiQuestionSchema = z.object({
    id: z.number(),
    question: z.string(),
    answers: z.record(z.string(), z.string().nullable()),
    correct_answers: z.record(z.string(), z.string().nullable()).optional(),
    correct_answer: z.string().nullable().optional(),
    multiple_correct_answers: z.string().nullable().optional(),
    difficulty: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    tags: z.array(z.object({ name: z.string() })).optional()
});

export const quizApiResponseSchema = z.array(quizApiQuestionSchema);

export type QuizApiQuestion = z.infer<typeof quizApiQuestionSchema>;
