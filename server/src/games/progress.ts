/**
 * Improvement metrics, derived from data the games already record.
 *
 * Nothing here reads a clock, a database or a request. Every input is passed in,
 * so each rule is directly testable -- the same discipline the scoring modules
 * follow, and the reason these live in the domain layer rather than inside a
 * query.
 *
 * Deliberately a short list. A metric earns its place only if it answers "am I
 * getting better at this?"; anything that is merely countable is left uncounted.
 */

/** One scoring unit of a finished run, in the order it was played. */
export interface PlayedUnit {
    /** Did the player get it right? Code Blitz: a correct answer. Flush: a round
     *  flushed in full. */
    success: boolean;
    /** How long the unit took, or null when it was never answered -- a timeout
     *  has no response time, and averaging one in as "slow" would be a lie. */
    durationMs: number | null;
}

/**
 * The longest unbroken run of successes.
 *
 * Streak is the one metric here that rewards consistency rather than totals: a
 * player can hold their accuracy steady while their streak climbs, and that is
 * exactly the shape of getting better at something.
 */
export function longestStreak(units: PlayedUnit[]): number {
    let best = 0;
    let current = 0;

    for (const unit of units) {
        current = unit.success ? current + 1 : 0;
        best = Math.max(best, current);
    }

    return best;
}

/**
 * Mean duration across units that actually have one.
 *
 * Returns null rather than 0 for an empty set: "no data yet" and "instant" are
 * different claims, and a zero here would render as a suspiciously perfect time.
 */
export function averageDurationMs(units: PlayedUnit[]): number | null {
    const timed = units.filter((u) => u.durationMs !== null).map((u) => u.durationMs!);

    if (timed.length === 0) {
        return null;
    }

    return Math.round(timed.reduce((total, ms) => total + ms, 0) / timed.length);
}

/**
 * Share of units the player got right, as a ratio between 0 and 1.
 *
 * Deliberately NOT the same figure as computeAccuracy in users/shared.ts, and
 * deliberately not called accuracy. That one asks "of the questions you answered,
 * how many were right?" and excludes timeouts from its denominator. This one
 * counts every unit faced, so running out of time counts against you -- which is
 * the honest measure for "am I getting better", since timing out more often is
 * getting worse, not neutral.
 *
 * The scale matches computeAccuracy's ratio on purpose: two figures in the same
 * response measuring the same kind of thing on different scales is a bug waiting
 * for a client to divide by a hundred twice.
 */
export function successRate(units: PlayedUnit[]): number | null {
    if (units.length === 0) {
        return null;
    }

    return Math.round((units.filter((u) => u.success).length / units.length) * 1000) / 1000;
}

/**
 * Splits runs, newest first, into the most recent window and the window before
 * it, so a metric can be compared against the player's own earlier form.
 *
 * Both windows must be full to be comparable. A "trend" drawn from one recent
 * run against one older one is noise wearing a percentage sign, so a partial
 * earlier window yields nothing rather than something misleading.
 */
export function splitWindows<T>(runsNewestFirst: T[], window: number): {
    recent: T[];
    previous: T[];
} | null {
    if (window <= 0 || runsNewestFirst.length < window * 2) {
        return null;
    }

    return {
        recent: runsNewestFirst.slice(0, window),
        previous: runsNewestFirst.slice(window, window * 2)
    };
}

/**
 * Percentage change from `previous` to `recent`, positive meaning the number
 * went up.
 *
 * Whether "up" is good depends on the metric -- accuracy rising is progress,
 * response time rising is not -- so this deliberately does not decide. The
 * caller knows which direction it wanted.
 */
export function percentChange(previous: number | null, recent: number | null): number | null {
    if (previous === null || recent === null || previous === 0) {
        return null;
    }

    return Math.round(((recent - previous) / previous) * 1000) / 10;
}
