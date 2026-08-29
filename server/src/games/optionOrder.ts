/**
 * Deterministic option ordering.
 *
 * Two separate problems, one primitive.
 *
 * The first is positional bias. Bug Hunt's patch options were served in
 * insertion order, and every one of the thirteen choose_patch incidents was
 * authored with its correct patch written first -- so the first option was
 * always the answer. A player who noticed could beat the tier without reading
 * any code, which is the opposite of what a debugging game is for. Authoring
 * discipline cannot fix that: writing the answer first is the natural way to
 * write an incident, and a bank that depends on nobody ever doing it will drift
 * back the moment someone adds content.
 *
 * The second is stability. Code Blitz already shuffled, with Math.random() on
 * every serve -- and a question is re-served on refresh and on resume, so the
 * options moved under a player who had already half-decided on one. Correctness
 * was never at risk, because the server matches on option id rather than
 * position, but "the answers jump when I reload" is its own small betrayal.
 *
 * Seeding the shuffle on the round solves both: the order is unrelated to how
 * the content was authored, and it is the same every time that round is served.
 */

/** FNV-1a. Small, well-mixed for short ASCII keys, and no dependency. */
function hash(seed: string): number {
    let h = 0x811c9dc5;

    for (let i = 0; i < seed.length; i += 1) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }

    return h >>> 0;
}

/** mulberry32: one 32-bit state, good distribution, ten lines. */
function generator(state: number): () => number {
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;

        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * A shuffle that depends only on the seed.
 *
 * Fisher-Yates, so every permutation is equally likely across seeds -- the naive
 * `sort(() => Math.random() - 0.5)` is not uniform and would leave a weaker
 * version of the bias this exists to remove.
 *
 * Pass something stable and unique per round: a round id or session-question id.
 * Passing the incident or question id instead would be a subtler version of the
 * original bug -- every player would see the same "random" order for the same
 * content, forever, and it could be memorised.
 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
    const copy = [...items];
    const next = generator(hash(seed));

    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }

    return copy;
}
