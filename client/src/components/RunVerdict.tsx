import type { GameImprovement } from "../api/types.js";

interface RunVerdictProps {
    score: number;
    /** Best score across this player's earlier completed runs of this game, or
     *  null when this was their first. */
    previousBest: number | null;
    improvement: GameImprovement | null;
}

/**
 * The one line above the score that says whether this run was worth something.
 *
 * Deliberately at most one claim. Stacking "new best" and "faster" and "better
 * accuracy" turns a result into a report; the player should get the single most
 * interesting thing that is actually true, and nothing when nothing is.
 */
export function RunVerdict({ score, previousBest, improvement }: RunVerdictProps) {
    // A personal best only means something against runs that already existed.
    // On a first run there is nothing to beat, so nothing is claimed.
    if (previousBest !== null && score > previousBest) {
        return <p className="verdict is-best">New best</p>;
    }

    const speed = improvement?.trend?.speed;

    // Negative change means the recent window is quicker than the one before it.
    // Only worth saying when it is clearly not noise.
    if (speed?.changePercent != null && speed.changePercent <= -5) {
        // Clamped at 99. A time reduction can approach 100% but never reach it,
        // and rounding 99.6 up to "100% faster" claims the player answered
        // instantly. Clamping down can understate a huge gain; it can never
        // overstate one, which is the side to err on.
        const faster = Math.min(99, Math.abs(Math.round(speed.changePercent)));

        return <p className="verdict">{faster}% faster than your earlier runs</p>;
    }

    const rate = improvement?.trend?.successRate;

    // Deliberately unquantified. successRate is a 0-1 ratio, so a relative change
    // reads absurdly (0.1 to 0.5 is "+400% more accurate") while an absolute one
    // is measured in percentage points, which would collide with the score's
    // "points" a few lines above. The fact is worth stating; the number is not.
    if (rate?.previous != null && rate.recent != null && rate.recent - rate.previous >= 0.03) {
        return <p className="verdict">More accurate than your earlier runs</p>;
    }

    return null;
}
