/**
 * The system's voice.
 *
 * Everything here is deterministic -- selected by incident number and outcome,
 * never at random. Three reasons that matters: a line can be asserted in a test,
 * the same line cannot land twice in one run, and a player replaying an incident
 * they lost hears the same system rather than a different one.
 *
 * Kept short on purpose. The system is a colleague in an incident channel, not a
 * narrator: it says one thing, then gets out of the way of the code. Anything
 * longer than a line and a half is read once and skipped forever after.
 */

/** Picks deterministically, and never runs off the end of the list. */
function pick(lines: readonly string[], seed: number): string {
    return lines[Math.abs(Math.trunc(seed)) % lines.length]!;
}

const ALERTS = [
    "Something just started failing. Getting you the details now.",
    "Another one. This system is having a day.",
    "Alert came in hot. Take a look.",
    "That escalated. New incident on the board."
] as const;

const BOSS_ALERT = "This is the one underneath all the others. If it goes, everything goes.";

/**
 * The beat before an incident is fetched. Boss gets its own, always.
 *
 * Indexed from incidentNumber - 1 so the first incident gets the opening line.
 * Indexing from the number itself handed incident one "Another one" -- which
 * reads as a continuation of something that had not happened yet.
 */
export function alertLine(incidentNumber: number, isBoss: boolean): string {
    return isBoss ? BOSS_ALERT : pick(ALERTS, incidentNumber - 1);
}

const RESOLVED = [
    "Good catch. Service is back on its feet.",
    "That was the one. Nicely spotted.",
    "Patch holds. We're still standing.",
    "Clean fix. The on-call rotation thanks you."
] as const;

const STREAK_LINES = [
    "Three in a row. You're making this look routine.",
    "Four straight. Whatever you're doing, keep doing it.",
    "Five for five. The system owes you one."
] as const;

/** A streak of three or more earns its own acknowledgement. */
export function resolvedLine(incidentNumber: number, streak: number): string {
    if (streak >= 3) return pick(STREAK_LINES, streak - 3);

    return pick(RESOLVED, incidentNumber);
}

const RETRY = [
    "Nope. Still throwing.",
    "That wasn't it. Service is still down.",
    "Close, but the errors haven't stopped.",
    "Not that one. Look again."
] as const;

export function retryLine(incidentNumber: number): string {
    return pick(RETRY, incidentNumber);
}

const FAILED = [
    "We couldn't stabilise that one. Moving on.",
    "That service is staying down for now.",
    "Lost that one. It happens."
] as const;

/** Running out of time reads differently from being wrong twice, so it says so. */
export function failedLine(incidentNumber: number, timedOut: boolean): string {
    return timedOut
        ? "Out of time. The retry queue took it."
        : pick(FAILED, incidentNumber);
}

/**
 * Encouragement AFTER a failure, deliberately separate from the line above.
 *
 * A failed incident is the moment a player is most likely to stop, so the system
 * has to hand them a reason to keep going rather than leave them with the loss.
 * It never appears after the last incident, where "keep going" would be a lie.
 */
export function recoverableLine(): string {
    return "System's still recoverable. Keep going.";
}

const DEBRIEF_PERFECT = "Every service back online. The system lives to crash another day.";
const DEBRIEF_GOOD = "Most of it survived. That's a better shift than some.";
const DEBRIEF_ROUGH = "Rough one. The incident report is going to make interesting reading.";

/** The closing line on the debrief. Honest about how it actually went. */
export function debriefLine(resolved: number, total: number): string {
    if (resolved === total) return DEBRIEF_PERFECT;
    if (resolved >= Math.ceil(total / 2)) return DEBRIEF_GOOD;

    return DEBRIEF_ROUGH;
}

/**
 * How serious this incident is, in the system's own words.
 *
 * The server stores difficulty 1-5 and the client was dropping it entirely. A
 * number out of five means nothing to a player mid-incident; a severity word
 * does, and it sets expectations before they start reading.
 */
const SEVERITY = ["Routine", "Elevated", "Serious", "Severe", "Critical"] as const;

export function severityLabel(difficulty: number): string {
    const index = Math.min(SEVERITY.length, Math.max(1, Math.trunc(difficulty))) - 1;

    return SEVERITY[index]!;
}

/**
 * What the clock is saying about the system's chances.
 *
 * Matches Countdown's own three tiers so the words and the colour never disagree
 * -- a bar that has gone red under the word "stable" is worse than no words.
 */
export const TIMER_LABELS = {
    calm: "System holding",
    warn: "Degrading fast",
    urgent: "Failure imminent"
} as const;

/**
 * Where the player is in the run, in the run's own language.
 *
 * Replaces nothing -- the pip row still says 4 / 10 -- but gives the position a
 * meaning. "Hunt 7 of 10" is a coordinate; "DEEPER IN" is a place.
 */
export function runPhase(hunt: number, total: number): string {
    if (hunt === total) return "Final hunt";
    if (hunt <= 3) return "Warming up";
    if (hunt <= 6) return "Getting sharp";

    return "Deeper in";
}
