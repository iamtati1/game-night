import type { Request } from "express";

/**
 * Which of this learner's runs are relaxed: played with no clock.
 *
 * WHERE THIS LIVES, AND WHY. A relaxed run is a property of one game session,
 * but game_sessions has no column for it and this pass adds no migration. The
 * login session is server-side (connect-pg-simple, see session.ts), lives as
 * long as the learner stays signed in, and is the same object on every request
 * that can serve, answer, pause, resume or finish a run -- so a run's pace is
 * kept there, keyed by the game session id.
 *
 * THE FAILURE MODE IS THE OLD BEHAVIOUR. If the entry is lost (signed out and
 * back in mid-run, or the run continued in another browser), the run is
 * treated as timed from that point: the default clock, the default scoring.
 * Nothing is lost, inflated or skipped -- a learner simply gets the clock the
 * game had before this option existed. docs/KNOWN_LIMITATIONS.md says so.
 *
 * Bounded so a long-lived login cannot grow without limit; only the newest
 * runs matter, since only one run per game can be live at a time.
 */
const MAX_REMEMBERED = 20;

type WithRelaxed = Request["session"] & { relaxedRuns?: string[] };

export function markRelaxed(req: Request, sessionId: string): void {
    const session = req.session as WithRelaxed | undefined;
    if (!session) return;
    const runs = (session.relaxedRuns ?? []).filter((id) => id !== String(sessionId));
    runs.push(String(sessionId));
    session.relaxedRuns = runs.slice(-MAX_REMEMBERED);
}

export function isRelaxed(req: Request, sessionId: string): boolean {
    const session = req.session as WithRelaxed | undefined;
    return session?.relaxedRuns?.includes(String(sessionId)) ?? false;
}
