/**
 * Selection policy: among challenges the curriculum already allows, which
 * should Jolt prefer?
 *
 * The last curriculum layer, and the first pure one:
 *
 *     eligibility.ts  is this concept reachable?        SQL, reads history
 *     roles.ts        meet it, or drill it?             SQL, reads history
 *     frontier.ts     how demanding a rung?             SQL, reads history
 *     demand.ts       what kind of thinking?            SQL, reads history
 *     policy.ts       given all that, which one?        PURE                <- here
 *
 * Pure for the same reason curve.ts is: everything above needs the learner's
 * whole history joined against the curriculum, so it has to run in the query.
 * This does not. It is a preference over candidates that have already been
 * fetched, which makes it a design decision -- and design decisions in this
 * codebase are worth being able to read and test directly rather than inferring
 * from a window function.
 *
 * WHAT THIS DOES NOT DECIDE. Prerequisites, whether the concept has been
 * encountered, whether a role is eligible, either ceiling, anything about the
 * database, anything game-specific, XP, scoring. All upstream, all already done
 * by the time a candidate reaches here.
 *
 * THE TWO AXES ARE NEVER COMBINED. There is no difficulty + demandOrder, no
 * difficulty * demandOrder, no total-difficulty scalar anywhere in this file.
 * `difficulty 3 / predict` is not above or below `difficulty 1 / diagnose` --
 * they are different kinds of work, and any arithmetic that put them on one line
 * would be inventing a pedagogy nobody chose. What the policy compares instead
 * is DISTANCE FROM THE LEARNER'S OWN FRONTIER, measured separately on each axis,
 * and it only ever prefers one candidate over another when it is no further away
 * on either axis and closer on at least one.
 *
 * That is Pareto dominance, and it is the whole ranking rule. Its useful
 * property is that it refuses to answer when the axes genuinely disagree: given
 * `difficulty 2 / diagnose` and `difficulty 3 / predict` against a frontier of
 * (3, diagnose), neither is closer on both, so both come back in the same tier.
 * A formula would have silently picked one. See rankByFrontier.
 */

/** A challenge that has already passed every curriculum gate. */
export interface Candidate {
    challengeId: string;
    conceptId: string;
    /** demands.display_order -- deeper thinking is a higher number. */
    demandOrder: number;
    /** challenges.difficulty, 1-4. NOT questions.difficulty, which is pacing. */
    difficulty: number;
    /**
     * introduce | practise | reinforce.
     *
     * Carried but deliberately not acted on: whether a role may be selected is
     * roles.ts's decision and is already settled upstream. It is here so a
     * caller can log or group by it without a second lookup.
     */
    role: string;
}

/** Where the learner has reached on each axis, from frontier.ts and demand.ts. */
export interface Ceilings {
    difficulty: number;
    demandOrder: number;
}

/**
 * Ceilings are PER CONCEPT, so a pool spanning several concepts needs a lookup
 * rather than one pair.
 *
 * Added when this policy met its first real candidate set: a Code Blitz deal
 * draws from the whole bank, and `equality` and `primitive-types` have
 * different ceilings for the same learner. A single Ceilings is still accepted
 * -- it is the right shape when every candidate shares a concept, which is what
 * the unit tests exercise -- and is simply treated as the answer for every
 * concept.
 */
export type CeilingsFor = Ceilings | ((conceptId: string) => Ceilings);

function ceilingsOf(ceilings: CeilingsFor, conceptId: string): Ceilings {
    return typeof ceilings === "function" ? ceilings(conceptId) : ceilings;
}

/**
 * How far a candidate sits below the frontier, per axis. Never combined.
 *
 * Zero on an axis means "exactly at the learner's edge on that axis". Larger
 * means easier, or shallower thinking, than where they have got to.
 */
function distances(candidate: Candidate, ceilings: CeilingsFor): [number, number] {
    const reached = ceilingsOf(ceilings, candidate.conceptId);

    return [
        reached.difficulty - candidate.difficulty,
        reached.demandOrder - candidate.demandOrder
    ];
}

/**
 * Drops candidates above either ceiling.
 *
 * Priority 1, and defensive rather than load-bearing: the SQL layers should
 * never hand one of these over. Kept because this module is pure and cheap to
 * call, and because a candidate above the learner's frontier is the one mistake
 * that would be actively harmful rather than merely suboptimal -- it is the
 * "here is a closure question, you have met nothing" failure the whole
 * curriculum exists to stop.
 *
 * An empty result for a non-empty input therefore means an upstream bug, not a
 * learner with nothing to do.
 */
export function withinCeilings(
    candidates: readonly Candidate[],
    ceilings: CeilingsFor
): Candidate[] {
    return candidates.filter((c) => {
        const reached = ceilingsOf(ceilings, c.conceptId);

        return c.difficulty <= reached.difficulty && c.demandOrder <= reached.demandOrder;
    });
}

/** Whether `a` is at least as close on both axes and closer on at least one. */
function dominates(a: Candidate, b: Candidate, ceilings: CeilingsFor): boolean {
    const [aDifficulty, aDemand] = distances(a, ceilings);
    const [bDifficulty, bDemand] = distances(b, ceilings);

    return (
        aDifficulty <= bDifficulty &&
        aDemand <= bDemand &&
        (aDifficulty < bDifficulty || aDemand < bDemand)
    );
}

/**
 * Candidates grouped into tiers of equal preference, best first.
 *
 * Priority 2. Each tier is the set of candidates nothing remaining beats on both
 * axes at once; peel it off, repeat. A single tier can hold coordinates that
 * look nothing alike, and that is the point rather than a defect:
 *
 *     frontier (3, diagnose), available (2, diagnose) and (3, predict)
 *     -> one tier containing both
 *
 * Neither is closer to the frontier on both axes, so the policy declines to rank
 * them. Anything that put one first -- a sum, a product, a "demand wins"
 * precedence -- would be a pedagogical claim this slice has not been given.
 * Returning them together makes the open question visible to the caller instead
 * of burying it here.
 *
 * Tiers are returned rather than a single winner for the same reason: a dealer
 * takes several units, and it should walk outward from the frontier rather than
 * asking this function repeatedly for "the best".
 */
export function rankByFrontier(
    candidates: readonly Candidate[],
    ceilings: CeilingsFor
): Candidate[][] {
    let remaining = withinCeilings(candidates, ceilings);
    const tiers: Candidate[][] = [];

    while (remaining.length > 0) {
        const front = remaining.filter(
            (c) => !remaining.some((other) => dominates(other, c, ceilings))
        );

        // Cannot happen -- dominance is a strict partial order, so a finite
        // non-empty set always has a maximal element -- but an empty front would
        // spin forever, and a loop that cannot terminate is worth a guard rather
        // than a comment promising it will.
        if (front.length === 0) {
            tiers.push(remaining);
            break;
        }

        tiers.push(front);
        remaining = remaining.filter((c) => !front.includes(c));
    }

    return tiers;
}

/**
 * Which facets of a candidate are new, given what has already been chosen.
 *
 * Priority 3, and compared lexicographically rather than added up: an unused
 * coordinate beats an unused concept, which beats an unused demand, which beats
 * an unused difficulty. Summing them would need weights, and weights on these
 * four would be a recommendation engine wearing a small hat.
 */
function freshness(candidate: Candidate, chosen: readonly Candidate[]): boolean[] {
    const coordinate = (c: Candidate) => `${c.conceptId}:${c.demandOrder}:${c.difficulty}`;

    return [
        !chosen.some((c) => coordinate(c) === coordinate(candidate)),
        !chosen.some((c) => c.conceptId === candidate.conceptId),
        !chosen.some((c) => c.demandOrder === candidate.demandOrder),
        !chosen.some((c) => c.difficulty === candidate.difficulty)
    ];
}

/** Lexicographic comparison of two freshness vectors; fresher sorts first. */
function byFreshness(a: boolean[], b: boolean[]): number {
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) {
            return a[i] ? -1 : 1;
        }
    }

    return 0;
}

/**
 * The candidates to deal, in order, best first.
 *
 * Tier by tier from the frontier outward; within a tier, whatever adds the most
 * variety to what has been taken so far; and then, when two candidates are still
 * indistinguishable, by challengeId.
 *
 * DETERMINISTIC BY CONSTRUCTION -- Priority 4. Same candidates and same ceilings
 * give the same order every time. There is no clock and no randomness here, and
 * there should not be: a run that is varied game to game is a PACING concern,
 * and curve.ts already owns it (its jitter and session bend exist for exactly
 * that). Mixing randomness in here would make the policy untestable to buy
 * something the layer below already provides.
 *
 * `count` is a cap, not a promise. Fewer candidates than asked for is a thin
 * bank, which is the caller's problem to notice -- the same contract dealSession
 * has.
 */
export function selectInOrder(
    candidates: readonly Candidate[],
    ceilings: CeilingsFor,
    count = Number.POSITIVE_INFINITY
): Candidate[] {
    const chosen: Candidate[] = [];

    for (const tier of rankByFrontier(candidates, ceilings)) {
        const pool = [...tier];

        while (pool.length > 0 && chosen.length < count) {
            pool.sort(
                (a, b) =>
                    byFreshness(freshness(a, chosen), freshness(b, chosen)) ||
                    a.challengeId.localeCompare(b.challengeId)
            );

            chosen.push(pool.shift()!);
        }

        if (chosen.length >= count) {
            break;
        }
    }

    return chosen;
}

/**
 * The single most preferred tier -- everything the policy considers equally
 * appropriate right now.
 *
 * Returns a set rather than one candidate on purpose. When the axes disagree the
 * tier holds more than one, and a caller that wants exactly one should take the
 * head of selectInOrder, which has applied variety and a deterministic
 * tie-break; this is for asking what the policy actually thinks.
 */
export function preferred(
    candidates: readonly Candidate[],
    ceilings: CeilingsFor
): Candidate[] {
    return rankByFrontier(candidates, ceilings)[0] ?? [];
}
