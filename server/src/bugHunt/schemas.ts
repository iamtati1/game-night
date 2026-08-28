import { z } from "zod";

const bigintId = z
    .union([z.string().regex(/^\d+$/), z.number().int().positive()])
    .transform(String);

/**
 * One submission to POST /sessions/:id/diagnoses.
 *
 * A discriminated union rather than two endpoints, and the discriminant carries
 * real weight: `reveal-hint` has no payload at all beyond the round it applies
 * to. There is deliberately no hintsUsed field anywhere in this file.
 *
 * That absence is the security model. If the client could state how many hints
 * it had used, it would state zero -- under-reporting is the profitable
 * direction and no amount of clamping detects it. So the client asks for "the
 * next hint" and never names one; the server decides which hint that is, records
 * the reveal, and owns the count. z.strictObject makes a stray hintsUsed a 400
 * rather than something silently ignored, so an attempt to send one fails
 * loudly.
 */
export const diagnosisSchema = z.discriminatedUnion("action", [
    z.strictObject({
        action: z.literal("reveal-hint"),
        roundId: bigintId
    }),
    z.strictObject({
        action: z.literal("diagnose"),
        roundId: bigintId,
        optionId: bigintId
    })
]);

export type DiagnosisRequest = z.infer<typeof diagnosisSchema>;
