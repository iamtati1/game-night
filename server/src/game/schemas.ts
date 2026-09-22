import { z } from "zod";

// Ids are BIGINT, which arrives as a string. Accept digit strings (or numbers,
// coerced) rather than parsing to a JS number and risking precision loss.
const bigintId = z.union([z.string().regex(/^\d+$/), z.number().int().positive()]).transform(String);

/**
 * An answer arrives in one of two shapes, decided by the question's type.
 *
 *   predict-output   selectedOptionId   -- one option, as it has always been
 *   complete-code    selectedOptionIds  -- the assembled tokens, in order
 *
 * Both are optional here and exactly one is required by the route, which is the
 * only place that knows which type the question is. Validating the shape without
 * that knowledge would either reject a valid answer or accept a meaningless one.
 */
export const submitAnswerSchema = z.object({
    // Required so a client that has drifted out of sync cannot accidentally
    // answer a different question than the one on screen.
    sessionQuestionId: bigintId,
    selectedOptionId: bigintId.optional(),
    selectedOptionIds: z.array(bigintId).min(2).max(4).optional()
});
