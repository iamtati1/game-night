import { z } from "zod";

/**
 * Body for either game's POST /sessions.
 *
 * `fresh` is the explicit "Start New Game" signal: discard whatever unfinished
 * session I have for this game and deal a new one. It has to be opt-in rather
 * than the default, because the default -- resume -- is the one that cannot lose
 * a player's progress by accident.
 *
 * Shared between Code Blitz and Flush so the flag cannot come to mean two
 * different things in two routes.
 */
/** The nine curriculum units, matching questions_topic_valid in migration 018. */
export const TOPICS = [
    "variables",
    "conditionals",
    "loops",
    "arrays",
    "objects",
    "functions",
    "array-methods",
    "scope",
    "async"
] as const;

export const startSessionSchema = z.object({
    fresh: z.boolean().optional(),
    /**
     * Asks the dealer to guarantee this topic an introduction slot and a
     * reinforcement slot. A hint for one deal, never persisted -- the questions
     * it produces are stored, the request that shaped them is not.
     */
    focusTopic: z.enum(TOPICS).optional()
});

/** Absent, empty and malformed bodies all mean "resume if you can". */
export function wantsFreshSession(body: unknown): boolean {
    return startSessionSchema.safeParse(body ?? {}).data?.fresh === true;
}

/** The requested focus topic, or null when absent or not a known unit. */
export function requestedFocusTopic(body: unknown): string | null {
    return startSessionSchema.safeParse(body ?? {}).data?.focusTopic ?? null;
}
