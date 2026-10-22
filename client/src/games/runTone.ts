/**
 * How a finished run went, in the plainest terms, so the results screen can
 * answer it: celebrate a strong run briefly, and after a tough one lead with a
 * look back at the lesson rather than another go at the same thing.
 *
 * DISPLAY ONLY. It reads numbers the results already show (correct of total,
 * rounds completed, incidents resolved). It records nothing, awards nothing,
 * and never changes what the course says is next -- after a tough run the
 * primary still goes to the learner's current concept, whose page opens with
 * the teaching; only the words around it change.
 *
 *     tough    under half right    supportive line, primary becomes "Look back at X"
 *     strong   80% or more         one short line saying so
 *     steady   anything between    nothing extra
 */

export type RunTone = "tough" | "steady" | "strong";

export const TOUGH_BELOW = 0.5;
export const STRONG_FROM = 0.8;

export function runTone(hit: number, total: number): RunTone | null {
    if (total <= 0) return null;
    const share = hit / total;
    if (share < TOUGH_BELOW) return "tough";
    if (share >= STRONG_FROM) return "strong";
    return "steady";
}

/** The line under the score, or null when nothing needs saying. */
export function toneLine(tone: RunTone | null, hit: number, total: number, unit: string): string | null {
    if (tone === "tough") {
        return `A tough run: ${hit} of ${total} ${unit}. Looking back at the lesson first usually helps.`;
    }
    if (tone === "strong") return `Strong run: ${hit} of ${total} ${unit}.`;
    return null;
}

/** "Look back at X": the recap wording for a step into a concept. */
export function recapLabel(conceptName: string): string {
    return `Look back at ${conceptName}`;
}
