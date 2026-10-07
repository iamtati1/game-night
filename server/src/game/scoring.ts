// Pure scoring rules: no database, no Express, no clock. Everything is passed
// in, which makes this the one part of gameplay that is trivially unit-testable.

import { COMPLETION_BONUS_XP, perUnitXp } from "../games/xp.js";

/**
 * How long a read-it-and-pick-one question gets.
 *
 * WAS 35 SECONDS, which made the worst case ten questions x 35s = nearly six
 * minutes for a round meant to be a short, energetic one. Eighteen puts the cap
 * at three minutes and leaves ten seconds of thinking beyond
 * FULL_SPEED_BONUS_MS -- the eight seconds the scoring already treats as "long
 * enough to read and decide".
 *
 * THE QUESTION COUNT IS DELIBERATELY UNCHANGED. XP per correct answer is
 * derived from QUESTIONS_PER_SESSION, so dealing fewer questions would move
 * what a perfect game is worth. Shortening the clock changes how long a round
 * takes and nothing about what it pays.
 */
export const QUESTION_TIME_LIMIT_MS = 18_000;

/**
 * How long an assembly question gets.
 *
 * The base limit is calibrated for read-it-and-pick-one. complete-code asks the
 * player to read the snippet, decide what belongs in the gap AND place several
 * tokens in order, which is simply more to do, so it keeps the same roughly
 * 40% head start over the base limit it has always had.
 */
export const ASSEMBLY_TIME_LIMIT_MS = 25_000;

export type ChallengeType = "predict-output" | "complete-code" | "trace-value" | "match-concept";

/**
 * How many beats open the round with no clock at all.
 *
 * THE BEGINNER'S FIRST MINUTE. Code Blitz timed a learner's very first
 * question, including the first one they had ever seen -- and the product rule
 * is that a timer must earn its place: *does the timer help the learner
 * practise this skill?* Reading a line of code and saying what it prints is not
 * a speed skill, and it is certainly not one on the first attempt.
 *
 * Bug Hunt already settled this and the two games disagreed. Its opening hunts
 * have no deadline because "a countdown sitting at ninety seconds still tells a
 * player who is still learning the game that they are being measured". The same
 * sentence is true here.
 *
 * POSITION, NOT TIER -- and that is the one place this differs from Bug Hunt.
 * Bug Hunt's ramp is a literal, so "tier 1" and "the opening" are the same two
 * hunts every run. Code Blitz's curve is COMPUTED per session with a random
 * bend, so keying on tier would scatter untimed beats unpredictably through the
 * round. A learner has to be able to rely on "the opening is untimed" rather
 * than discover it at random, so it is the first two beats, always.
 *
 * Phase 3 makes this respond to the learner rather than being fixed.
 */
export const UNTIMED_OPENING_BEATS = 2;

/**
 * How the round is going for this learner, right now.
 *
 * WITHIN THE ROUND, NOT ACROSS THEIR HISTORY. Nothing is stored and nothing is
 * remembered tomorrow: this reads the answers already given in THIS run. That
 * is deliberate -- it needs no table, nothing to backfill, and it cannot drift
 * from the sessions it describes, which is the same reason the curriculum
 * derives learner state rather than storing it.
 */
export type Stance = "struggling" | "developing" | "confident";

/** Settled means the learner has had their go: answered it, or ran out of time. */
interface Settled {
    status: string;
    isCorrect: boolean | null;
}

/**
 * Two misses in a row is the signal, and it is the product's own:
 *
 *   "Learner misses reassignment twice -> Jolt detects difficulty -> reduce
 *    complexity -> remove timer -> give simpler example"
 *
 * CONSECUTIVE rather than cumulative, because the question being answered is
 * "are they stuck right now?" -- a learner who missed beats two and nine is
 * having a different experience from one who just missed two in a row. It
 * relaxes as soon as they get one right, so relief arrives quickly and leaves
 * quietly.
 */
export const MISSES_BEFORE_SUPPORT = 2;

/** Consecutive correct answers before a learner is treated as confident. */
export const RUN_BEFORE_CONFIDENT = 4;

export function stanceFor(answers: readonly Settled[]): Stance {
    const settled = answers.filter(
        (a) => a.status === "answered" || a.status === "timed_out"
    );

    let misses = 0;
    let run = 0;

    for (const answer of settled) {
        if (answer.isCorrect === true) {
            run += 1;
            misses = 0;
        } else {
            misses += 1;
            run = 0;
        }
    }

    if (misses >= MISSES_BEFORE_SUPPORT) return "struggling";
    if (run >= RUN_BEFORE_CONFIDENT) return "confident";

    return "developing";
}

/**
 * The clock a question runs on, or null when it has none.
 *
 * `displayOrder` is 1-based, matching session_questions.
 *
 * A STRUGGLING LEARNER GETS NO CLOCK, wherever they are in the round. This is
 * the whole of the adaptation: the support a learner needs when they have just
 * missed twice is time to think, not a faster version of the thing they are
 * already failing.
 *
 * Nothing is made HARDER for a confident learner here. The product rule is
 * understanding before speed, and a stretch mode that shortens the clock is a
 * separate decision with its own scoring consequences -- the stance is
 * reported so that decision can be made later, not pre-empted now.
 */
export function timeLimitFor(
    challengeType: string,
    displayOrder = Number.MAX_SAFE_INTEGER,
    stance: Stance = "developing"
): number | null {
    if (stance === "struggling") return null;
    if (displayOrder <= UNTIMED_OPENING_BEATS) return null;

    return challengeType === "complete-code" ? ASSEMBLY_TIME_LIMIT_MS : QUESTION_TIME_LIMIT_MS;
}
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
export function pointsForAnswer(
    isCorrect: boolean,
    elapsedMs: number,
    challengeType = "predict-output",
    displayOrder = Number.MAX_SAFE_INTEGER,
    stance: Stance = "developing"
): number {
    if (!isCorrect) {
        return 0;
    }

    /*
     * AN UNTIMED BEAT PAYS NO SPEED BONUS, which is Bug Hunt's rule and its
     * reasoning: awarding one would quietly reintroduce a clock the learner was
     * told they did not have, and inflate the easiest scores in the run.
     *
     * XP is unaffected either way -- it is derived from how many answers were
     * correct, not from points -- so a perfect game is still worth exactly
     * PERFECT_GAME_XP.
     */
    if (timeLimitFor(challengeType, displayOrder, stance) === null) {
        return BASE_POINTS;
    }

    const elapsed = Math.max(0, elapsedMs);

    if (elapsed <= FULL_SPEED_BONUS_MS) {
        return BASE_POINTS + MAX_SPEED_BONUS;
    }

    // Decays across whatever window this question type actually has, so an
    // assembly question is not judged against a clock it never ran on. The
    // untimed case returned above, so a limit exists by here.
    const limit = timeLimitFor(challengeType, displayOrder, stance)!;
    const decayWindow = limit - FULL_SPEED_BONUS_MS;
    const remaining = Math.max(0, limit - elapsed);
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

export function isExpired(
    servedAt: Date,
    now: Date,
    challengeType = "predict-output",
    displayOrder = Number.MAX_SAFE_INTEGER,
    stance: Stance = "developing"
): boolean {
    const limit = timeLimitFor(challengeType, displayOrder, stance);

    // An untimed beat cannot expire. Enforcing a deadline the learner was told
    // they did not have is the same mistake as awarding a speed bonus for it.
    if (limit === null) return false;

    return now.getTime() - servedAt.getTime() > limit;
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
