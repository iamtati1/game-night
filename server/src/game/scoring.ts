// Pure scoring rules: no database, no Express, no clock. Everything is passed
// in, which makes this the one part of gameplay that is trivially unit-testable.

import { COMPLETION_BONUS_XP, perUnitXp } from "../games/xp.js";

export const QUESTION_TIME_LIMIT_MS = 35_000;
export const QUESTIONS_PER_SESSION = 10;

const BASE_POINTS = 100;
const MAX_SPEED_BONUS = 50;
// Derived from the platform rule rather than hardcoded, so a perfect game is
// worth the same XP here as in every other game. Evaluates to 10 and 25.
const XP_PER_CORRECT = perUnitXp(QUESTIONS_PER_SESSION);
const XP_COMPLETION_BONUS = COMPLETION_BONUS_XP;

/**
 * How long a correct answer keeps the full speed bonus.
 *
 * The previous curve decayed from the first millisecond, so reading a five-line
 * snippet cost points before the player had even understood the question -- the
 * scoring pressed for speed at exactly the moment the game wants thinking. Eight
 * seconds is long enough to read and decide; past that, faster is genuinely
 * better and the bonus starts to slide.
 */
export const FULL_SPEED_BONUS_MS = 8_000;

/**
 * Points for a single answer.
 *
 * A flat maximum for the first eight seconds, then a linear decay across the
 * rest of the window: an answer inside the grace period scores 150, one at the
 * buzzer scores 100. Incorrect and timed-out answers score nothing.
 *
 * The floor is deliberate and unchanged -- a correct answer never scores less
 * than BASE_POINTS, however long it took.
 */
export function pointsForAnswer(isCorrect: boolean, elapsedMs: number): number {
    if (!isCorrect) {
        return 0;
    }

    const elapsed = Math.max(0, elapsedMs);

    if (elapsed <= FULL_SPEED_BONUS_MS) {
        return BASE_POINTS + MAX_SPEED_BONUS;
    }

    const decayWindow = QUESTION_TIME_LIMIT_MS - FULL_SPEED_BONUS_MS;
    const remaining = Math.max(0, QUESTION_TIME_LIMIT_MS - elapsed);
    const bonus = Math.round((remaining / decayWindow) * MAX_SPEED_BONUS);

    return BASE_POINTS + bonus;
}

export interface ScoredAnswer {
    isCorrect: boolean | null;
    servedAt: Date | null;
    answeredAt: Date | null;
}

/** Session score: the sum of every answer's points. */
export function scoreForSession(answers: ScoredAnswer[]): number {
    return answers.reduce((total, answer) => {
        if (answer.isCorrect !== true || !answer.servedAt || !answer.answeredAt) {
            return total;
        }

        return total + pointsForAnswer(true, answer.answeredAt.getTime() - answer.servedAt.getTime());
    }, 0);
}

/**
 * XP deliberately ignores speed. Score rewards performance; XP rewards
 * finishing, so account progression is not gated on reflexes.
 */
export function xpForSession(answers: ScoredAnswer[]): number {
    const correct = answers.filter((answer) => answer.isCorrect === true).length;

    return correct * XP_PER_CORRECT + XP_COMPLETION_BONUS;
}

export function isExpired(servedAt: Date, now: Date): boolean {
    return now.getTime() - servedAt.getTime() > QUESTION_TIME_LIMIT_MS;
}

// isResumable and SESSION_RESUME_WINDOW_MS were deleted when pause/resume landed.
// They implemented lazy abandonment: a session untouched for 15 minutes was
// abandoned on the next request. That directly contradicted "closing the tab must
// not destroy the game", it was measured from started_at (meaningless once a
// session can span a pause), and Flush never had an equivalent -- so the two games
// disagreed about whether a session survived.
//
// Nothing replaces it. A session now lives until the player resumes, pauses or
// quits it, and the only cost of vanishing is the single unit that was on screen,
// which the ordinary lazy timeout sweep adjudicates on return.
