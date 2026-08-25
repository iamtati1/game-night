/**
 * Memory's symbol vocabulary.
 *
 * Chosen to be unmistakable at a glance and at speed. A memory game fails
 * dishonestly if the player loses because two symbols looked alike -- that tests
 * eyesight, not recall -- so every pair here differs in silhouette, not only in
 * colour. The client renders each as its own shape; colour is a second channel,
 * never the only one.
 *
 * Named keys rather than unicode glyphs: a glyph's appearance depends on the
 * font the player happens to have, and "the triangle" must look the same for
 * everyone.
 */
export const SYMBOLS = [
    "circle",
    "square",
    "triangle",
    "diamond",
    "star",
    "hexagon",
    "cross",
    "moon",
    "bolt",
    "ring"
] as const;

export type Symbol = (typeof SYMBOLS)[number];

export function isSymbol(value: unknown): value is Symbol {
    return typeof value === "string" && (SYMBOLS as readonly string[]).includes(value);
}

/**
 * A sequence of `length` distinct symbols.
 *
 * Distinct on purpose. A repeated symbol turns "which order were they in" into
 * "how many times did that one appear", which is a different and much fiddlier
 * task -- and it makes the recall bank ambiguous, since two identical tiles give
 * the player no way to express which one they meant.
 *
 * Partial Fisher-Yates over a copy of the vocabulary: unbiased, and it cannot
 * loop forever the way reject-and-retry sampling can.
 */
export function generateSequence(
    length: number,
    random: () => number = Math.random
): Symbol[] {
    if (!Number.isInteger(length) || length < 1 || length > SYMBOLS.length) {
        throw new Error(
            `Sequence length must be between 1 and ${SYMBOLS.length}, received ${length}`
        );
    }

    const pool = [...SYMBOLS];

    for (let i = 0; i < length; i++) {
        const j = i + Math.floor(random() * (pool.length - i));
        [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }

    return pool.slice(0, length);
}
