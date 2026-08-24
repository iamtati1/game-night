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
export const startSessionSchema = z.object({
    fresh: z.boolean().optional()
});

/** Absent, empty and malformed bodies all mean "resume if you can". */
export function wantsFreshSession(body: unknown): boolean {
    return startSessionSchema.safeParse(body ?? {}).data?.fresh === true;
}
