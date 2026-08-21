import { z } from "zod";

/** Ids are BIGINT and arrive as strings; accept digits (or a number) and keep
 *  them as strings to avoid precision loss. */
const bigintId = z
    .union([z.string().regex(/^\d+$/), z.number().int().positive()])
    .transform(String);

export const placementSchema = z.object({
    // Required so a client whose view has drifted cannot place a tile into a
    // round that has already ended.
    roundId: bigintId,
    outputId: bigintId
});
