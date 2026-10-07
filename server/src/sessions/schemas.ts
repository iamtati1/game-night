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
/**
 * The units a client may ask the dealer to favour.
 *
 * THIS LIST WAS STALE AND SILENTLY WRONG. It was the nine units of migration
 * 018, but migration 022 expanded questions_topic_valid to the sixteen
 * curriculum topics, and the question bank has used them since: `values`,
 * `operators`, `control-flow`, `strings`, `errors`, `dom` and `algorithms` are
 * all real topics with real questions. Asking to focus any of them parsed as
 * invalid and was dropped to null -- a request that looked honoured and was
 * not, which is the worst failure shape a validator has.
 *
 * It mirrors questions_topic_valid in migration 022, which is the authority.
 * Not a second taxonomy: a Zod enum cannot read a CHECK constraint, so this is
 * a copy that has to be kept in step, and topicVocabulary.test.ts fails if it
 * drifts again.
 *
 * `conditionals` IS DELIBERATELY KEPT. It is not a curriculum topic -- it was
 * split into `operators` and `control-flow` -- but 24 active questions still
 * carry it and the constraint still permits it. Removing it here would make
 * those questions unaskable-for while leaving them perfectly dealable, which is
 * a worse inconsistency than a legacy slug. It goes when the data does.
 */
export const TOPICS = [
    "values",
    "variables",
    "operators",
    "control-flow",
    "strings",
    "loops",
    "functions",
    "scope",
    "arrays",
    "array-methods",
    "objects",
    "errors",
    "dom",
    "async",
    "this-and-classes",
    "algorithms",
    "conditionals"
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
