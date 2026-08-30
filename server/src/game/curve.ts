/**
 * The shape of a Code Blitz session.
 *
 * A run used to be ten questions pulled at random from one pool, so it could
 * open on closures and close on `typeof`. The bank now carries a tier, and this
 * is what turns that metadata into a session that actually builds.
 *
 * Pure on purpose: no database, no clock. Which tier each slot wants is a design
 * decision, and design decisions are worth being able to test directly rather
 * than inferring from a ROW_NUMBER() window in a query. Same reasoning as
 * bugHunt/queries.ts, which keeps its ramp out of SQL for the same reason.
 */

/** A question, reduced to what the curve needs to decide anything. */
export interface Dealable {
    id: string;
    /** 1-4. Null for a question written before tiers existed. */
    difficulty: number | null;
    /** Its curriculum unit -- 'loops', 'functions', and so on. */
    topic: string | null;
}

/**
 * A question with no tier is treated as practical rather than skipped.
 *
 * Skipping would silently retire content the moment someone added a question
 * and forgot the tier -- a failure that looks like nothing at all. Tier 2 is the
 * least wrong guess: it can be dealt anywhere in the middle of a run without
 * making the opening hard or the ending trivial.
 */
export const UNTIERED_AS = 2;

/**
 * How far a slot's target may wander from the ramp, before rounding.
 *
 * 0.45 is chosen rather than tuned: it is large enough that adjacent slots
 * overlap -- so slot 4 is sometimes tier 2 and sometimes tier 3 -- and small
 * enough that it can never move a slot by a whole tier. That combination is
 * what makes a run feel varied without letting question two be a closure
 * question. Any value at or above 0.5 would let the first slot leave tier 1.
 */
const JITTER = 0.45;

/**
 * How far the whole session's climb may bend, up or down.
 *
 * Drawn once per session rather than per slot, so a run bends coherently
 * instead of rattling. Kept below JITTER so the two together cannot move a
 * neighbouring pair by a full two tiers -- a wrong answer must never be followed
 * by a cliff, and the test suite pins that.
 */
const SESSION_BEND = 0.3;

/**
 * The hardest tier a session of this length is allowed to reach.
 *
 * A three-question run that climbs 1 → 4 is not a curve, it is a cliff: there
 * is no room for the middle that makes the ending feel earned. Short sessions
 * compress into the tiers they can actually build through.
 */
export function topTierFor(questionCount: number): number {
    if (questionCount >= 6) return 4;
    if (questionCount >= 3) return 3;

    return 2;
}

/**
 * The tier each slot aims at, before the bank gets a say.
 *
 * A straight ramp from 1 to the top tier, plus jitter. The ramp is what makes
 * the average climb; the jitter is what stops a player learning that question
 * five is always tier 2. `random` is injected so the tests can pin the shape
 * without pinning the randomness.
 */
export function difficultyCurve(
    questionCount: number,
    random: () => number = Math.random
): number[] {
    const top = topTierFor(questionCount);

    // One offset for the whole session, applied to the middle of the ramp only.
    //
    // Per-slot jitter alone left four slots fixed: where the ramp lands exactly
    // on an integer -- questions 1, 4, 7 and 10 of a ten-question run -- +/-0.45
    // can never round anywhere else, so those slots were the same tier every
    // game. This bends the middle of the curve up or down per session, so the
    // run that reaches tier 2 at question three is a different run from the one
    // that reaches it at question four.
    //
    // Weighted by sin(pi * progress), which is zero at both ends: the opening
    // stays tier 1 and the finish stays at the top tier, because those two are
    // the promises the curve makes. Only the climb between them moves.
    const bend = (random() * 2 - 1) * SESSION_BEND;

    const curve: number[] = [];

    for (let slot = 0; slot < questionCount; slot += 1) {
        // Single-question sessions have no ramp to speak of; they open where
        // every session opens.
        const progress = questionCount === 1 ? 0 : slot / (questionCount - 1);
        const base = 1 + progress * (top - 1);
        const middle = Math.sin(Math.PI * progress);
        // Only the BEND is weighted toward the middle. Weighting the jitter too
        // was a mistake worth recording: it flattened the slots either side of
        // the anchors -- question two went from a 67/33 split between tiers 1
        // and 2 to 94/6 -- so the run came out more predictable overall, not
        // less. The jitter stays uniform.
        const wandered = base + bend * middle + (random() * 2 - 1) * JITTER;
        const wanted = Math.min(top, Math.max(1, Math.round(wandered)));

        // No question may be more than one tier from the one before it.
        //
        // Enforced here rather than left to fall out of the numbers. With the
        // bend and the jitter both free, a six-question run produced 1 1 3 3 3 4
        // -- a two-tier step that reads as the game punishing you for the
        // previous answer. Parameters that merely make that rare are not the
        // same as a rule that makes it impossible, and this is the fairness
        // promise the whole curve rests on.
        const previous = curve[slot - 1];
        const stepped =
            previous === undefined
                ? wanted
                : Math.min(previous + 1, Math.max(previous - 1, wanted));

        curve.push(stepped);
    }

    return curve;
}

/**
 * Picks one question per slot, following the curve.
 *
 * Candidates arrive already ordered "unseen first, then random", so taking the
 * first acceptable match of a tier keeps both the recency preference and the
 * variation -- the same trick Bug Hunt uses. Nothing is picked twice, because a
 * chosen question is removed from the pool.
 *
 * Falls back to the nearest available tier when the bank is thin in one. A run
 * three questions short because tier 4 ran dry is worse than a run whose last
 * question is a shade easier than intended: the curve is a target, not a promise
 * the bank can always keep.
 */
export function dealSession<T extends Dealable>(
    candidates: readonly T[],
    questionCount: number,
    random: () => number = Math.random
): T[] {
    const remaining = [...candidates];
    const curve = difficultyCurve(questionCount, random);
    const dealt: T[] = [];

    const tierOf = (q: Dealable) => q.difficulty ?? UNTIERED_AS;

    for (const want of curve) {
        if (remaining.length === 0) break;

        const atTier = remaining.filter((q) => tierOf(q) === want);
        const pool = atTier.length > 0 ? atTier : nearestTier(remaining, want, tierOf);

        // Soft guard against two questions in a row on the same curriculum unit.
        //
        // This used to compare the first line of code of each prompt, which was a
        // string-similarity guess: two map() questions with different variable
        // names read as unrelated, and two unrelated questions that both opened
        // `const nums = [1, 2, 3];` read as identical. The topic is the real
        // answer to the question that guess was approximating.
        //
        // Still a preference rather than a filter, and deliberately so. Forcing
        // a different unit every slot would turn the run into a curriculum quiz
        // whose next topic you could predict; letting it repeat when the tier has
        // nothing else keeps the difficulty curve in charge. Structured
        // randomness, not a fixed rota.
        const lastTopic = dealt.length > 0 ? dealt[dealt.length - 1]!.topic : null;
        const fresh = pool.filter((q) => q.topic !== lastTopic);
        const pick = (fresh.length > 0 ? fresh : pool)[0]!;

        dealt.push(pick);
        remaining.splice(remaining.indexOf(pick), 1);
    }

    return dealt;
}

/** Everything at whichever tier is closest to the one wanted. */
function nearestTier<T extends Dealable>(
    remaining: readonly T[],
    want: number,
    tierOf: (q: Dealable) => number
): T[] {
    const distance = Math.min(...remaining.map((q) => Math.abs(tierOf(q) - want)));

    return remaining.filter((q) => Math.abs(tierOf(q) - want) === distance);
}
