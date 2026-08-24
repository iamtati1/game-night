/**
 * Splits a prompt into its question and its code snippet.
 *
 * The data model does not distinguish them: `questions.prompt` is a single TEXT
 * column, snapshotted into `session_questions.prompt_text`, and adding a second
 * column would be a schema change to solve a rendering problem. So this is the
 * smallest presentation-layer rule that works -- split once, at the first blank
 * line, which is the convention every seeded question already follows.
 *
 * The failure mode is deliberately benign. A prompt with no blank line is treated
 * as all prose, so a question like "What is the average time complexity of binary
 * search on a sorted array?" -- which has no code at all, and until now was
 * rendered inside a monospace code block -- comes out as readable text. An
 * imported question that ignores the convention renders as prose too: plain, but
 * never unreadable.
 */
export function splitPrompt(prompt: string): { question: string; code: string | null } {
    const at = prompt.indexOf("\n\n");

    if (at === -1) {
        return { question: prompt.trim(), code: null };
    }

    return {
        question: prompt.slice(0, at).trim(),
        code: prompt.slice(at + 2).trim() || null
    };
}
