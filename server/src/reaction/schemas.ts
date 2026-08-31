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
    }),
    /**
     * The signal came and went unanswered. Carries no time for the same reason a
     * false start does not: there is no reaction to measure.
     *
     * The client reports this rather than the server inferring it, because only
     * the browser knows when the signal was painted -- the same reason reactionMs
     * is measured there. A client that never sends it simply leaves the round
     * pending, which is the state it was already in.
     */
    z.object({
        outcome: z.literal("timed_out"),
        roundId: bigintId
    })
]);
