/**
 * How an answer's explanation is laid out: the rule first, then the reasoning.
 *
 * PRESENTATION ONLY. The words are the seeds' (questions.explanation,
 * flush_snippets.explanation, bug_hunt_options.explanation) and none is
 * rewritten, dropped or reordered. Read on a clone (2026-10-27): most run to
 * two sentences (median 174 characters in Code Blitz, 128 in Flush, 119 in
 * Bug Hunt), and the first sentence nearly always states the rule. 52 of the
 * 294 active questions run to three or four.
 *
 *     lead   the first sentence: the correction, emphasised
 *     rest   the second sentence, always shown -- it is usually the reason
 *     more   anything after that, behind an optional "More on why"; it is
 *            usually about the other answers, and it is still one click away
 */
export interface ExplanationParts {
    lead: string;
    rest: string | null;
    more: string | null;
}

/** Abbreviations whose full stop does not end a sentence. */
const NOT_AN_END = /\b(?:e\.g|i\.e|etc|vs)\.$/i;

/**
 * Splits prose into sentences without cutting code: a full stop inside
 * `backticks`, in a decimal (0.5) or in a property (a.length) is not an end.
 * A sentence ends at . ! or ? followed by whitespace and more text.
 */
export function sentences(text: string): string[] {
    const out: string[] = [];
    let start = 0;
    let inCode = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === "`") inCode = !inCode;
        if (inCode || (ch !== "." && ch !== "!" && ch !== "?")) continue;
        // An ellipsis is code shorthand here ("users.map(...)"), not an end.
        if (ch === "." && (text[i - 1] === "." || text[i + 1] === ".")) continue;

        // A closing quote or bracket belongs to the sentence it ends.
        let end = i + 1;
        while (end < text.length && /["'”’)]/.test(text[end]!)) end++;

        const next = text[end];
        if (next === undefined || !/\s/.test(next)) continue;

        const sentence = text.slice(start, end).trim();
        if (NOT_AN_END.test(sentence)) continue;

        out.push(sentence);
        start = end;
        i = end - 1;
    }

    const tail = text.slice(start).trim();
    if (tail) out.push(tail);

    return out;
}

/**
 * Below this a first sentence is a verdict ("Nothing here.", "One word.")
 * and the rule is the sentence after it, so the two lead together.
 */
const VERDICT_ONLY = 25;

export function explanationParts(text: string): ExplanationParts {
    const all = sentences(text);
    if (all.length > 1 && all[0]!.length < VERDICT_ONLY) all.splice(0, 2, `${all[0]} ${all[1]}`);

    const [lead = "", second, ...others] = all;

    return {
        lead,
        rest: second ?? null,
        more: others.length > 0 ? others.join(" ") : null
    };
}
