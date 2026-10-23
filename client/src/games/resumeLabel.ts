/**
 * Where a paused or unfinished run stands, as "round 2 of 5" -- or null when
 * the run has no rounds yet.
 *
 * Reaction and Memory create each round as it is served, so a run left before
 * its first round has none at all, and the count read "round 0 of 0". A run
 * with nothing to count says nothing rather than something wrong.
 */
export function resumePosition(unit: string, unitsDone: number, unitsTotal: number): string | null {
    if (unitsTotal <= 0) return null;

    return `${unit} ${Math.min(unitsDone + 1, unitsTotal)} of ${unitsTotal}`;
}
