import { z } from "zod";

const bigintId = z
    .union([z.string().regex(/^\d+$/), z.number().int().positive()])
    .transform(String);

/**
 * One resolved round.
 *
 * A discriminated union rather than two optional fields, so "reacted in 287ms"
 * and "jumped the signal" cannot arrive in the same payload. reactionMs is
 * bounded here as well as by isPlausibleReaction and a CHECK on the table: three
 * layers, because the value originates on the client and the client is untrusted.
 */
export const reactionRoundSchema = z.discriminatedUnion("outcome", [
    z.object({
        outcome: z.literal("reacted"),
        roundId: bigintId,
        reactionMs: z.number().int().min(0).max(60_000)
    }),
    z.object({
        outcome: z.literal("false_start"),
        roundId: bigintId
    })
]);
