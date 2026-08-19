import { z } from "zod";

// Ids are BIGINT, which arrives as a string. Accept digit strings (or numbers,
// coerced) rather than parsing to a JS number and risking precision loss.
const bigintId = z.union([z.string().regex(/^\d+$/), z.number().int().positive()]).transform(String);

export const submitAnswerSchema = z.object({
    // Required so a client that has drifted out of sync cannot accidentally
    // answer a different question than the one on screen.
    sessionQuestionId: bigintId,
    selectedOptionId: bigintId
});
