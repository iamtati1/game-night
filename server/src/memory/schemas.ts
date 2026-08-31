import { z } from "zod";
import { SYMBOLS } from "./symbols.js";

const bigintId = z
    .union([z.string().regex(/^\d+$/), z.number().int().positive()])
    .transform(String);

/**
 * One played-back sequence.
 *
 * The symbol list is closed at the schema boundary, so an unknown symbol is a
 * 400 rather than something that reaches the comparison and silently scores
 * zero. Length is bounded by the vocabulary for the same reason a submission
 * cannot be longer than any sequence could be.
 */
export const memorySubmissionSchema = z.object({
    roundId: bigintId,
    submitted: z
        .array(z.enum(SYMBOLS))
        .min(1)
        .max(SYMBOLS.length)
});
