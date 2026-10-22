import { createHash } from "node:crypto";
import { MAX_BLITZ_HINTS } from "../sessions/runHints.js";

/**
 * What a Code Blitz hint does: it rules out one wrong answer. A second hint
 * rules out another. Pure, so the rule is testable without a database.
 *
 * WHICH ONES is decided by the server and is the same every time for a given
 * question: a stable hash of (session question, option) orders the wrong
 * options, and hints take them from the front. A reload or a resume rules out
 * the same options rather than a new pair.
 *
 * ALWAYS A REAL CHOICE LEFT. At least one wrong answer stays, so a question is
 * never reduced to its answer alone; a three-option question allows one hint.
 *
 * Assembly (complete-code) questions take no hint: their answer is a sequence
 * of tokens, and ruling one out would not mean the same thing.
 */

export interface HintableOption {
    id: string;
    isCorrect: boolean;
}

/** Hints this question can give at all. */
export function hintCapacity(challengeType: string, options: readonly HintableOption[]): number {
    if (challengeType === "complete-code") return 0;
    const wrong = options.filter((o) => !o.isCorrect).length;
    return Math.max(0, Math.min(MAX_BLITZ_HINTS, wrong - 1));
}

function rank(sessionQuestionId: string, optionId: string): string {
    return createHash("sha256").update(`${sessionQuestionId}:${optionId}`).digest("hex");
}

/** The options ruled out after `taken` hints, in a stable order. */
export function struckOptionIds(
    sessionQuestionId: string,
    challengeType: string,
    options: readonly HintableOption[],
    taken: number
): string[] {
    const n = Math.min(Math.max(0, taken), hintCapacity(challengeType, options));

    return options
        .filter((o) => !o.isCorrect)
        .map((o) => ({ id: o.id, key: rank(sessionQuestionId, o.id) }))
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
        .slice(0, n)
        .map((o) => o.id);
}
