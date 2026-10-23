/**
 * How long the signal waits to be answered before the round ends itself.
 *
 * Its own module rather than a constant inside ReactionPage so the test that
 * pins it to the server's bound does not have to import the whole page, and its
 * router, to check one number.
 *
 * The number must equal MAX_PLAUSIBLE_MS in server/src/reaction/scoring.ts.
 * Past that bound the server will not accept a reaction time -- it is longer
 * than any real reaction is -- so a client that kept waiting would leave a
 * player who looked away with a round that can no longer be submitted and a run
 * that cannot be finished. Ending it here turns "you stopped playing" into a
 * result instead of an error.
 */
export const DEADLINE_MS = 5000;

/**
 * The fastest press that counts as a reaction.
 *
 * Must equal MIN_PLAUSIBLE_MS in server/src/reaction/scoring.ts: below human
 * reaction latency, so a press this soon after the signal was an anticipation,
 * not a reaction -- a false start. Sent as a reaction, the server refused it
 * and the run stopped on a developer-facing error. Classified here, it is the
 * false start it is.
 */
export const FASTEST_MS = 80;
