/**
 * What the player is told each mistake costs.
 *
 * The trace cost rides on the trace button, at the moment the player is deciding
 * whether to spend it -- there is no longer a permanent legend, because a player
 * mid-hunt does not need to be told what a failed incident costs. They duplicate
 * constants that live on the server, which is a liability: if the server retunes
 * them, this legend quietly starts lying about the player's own score.
 *
 * bugHuntIntegrity.test.ts pins these to the server's exported values, so the
 * duplication cannot drift silently. If that test fails, this file is wrong --
 * the server is the authority.
 */
export const INTEGRITY_COSTS = [
    { label: "Incident lost", cost: 10 },
    { label: "Extra attempt", cost: 3 },
    { label: "Trace pulled", cost: 1 }
] as const;
