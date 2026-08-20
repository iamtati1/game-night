import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./history.js";

/**
 * Query parameters always arrive as strings, so these coerce. Note the sharp
 * edges of z.coerce.number(): "abc" becomes NaN and "" becomes 0. .int() rejects
 * NaN and .min(1) rejects 0, so both surface as a 400 rather than reaching the
 * database as a broken value. An absent parameter short-circuits to the default
 * before coercion runs.
 */
export const historyQuerySchema = z.object({
    limit: z.coerce
        .number()
        .int("limit must be a whole number")
        .min(1, "limit must be at least 1")
        .max(MAX_PAGE_SIZE, `limit must be at most ${MAX_PAGE_SIZE}`)
        .default(DEFAULT_PAGE_SIZE),
    offset: z.coerce
        .number()
        .int("offset must be a whole number")
        .min(0, "offset cannot be negative")
        .default(0)
});
