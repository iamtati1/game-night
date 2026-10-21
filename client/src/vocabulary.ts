/**
 * The words Jolt uses for where a learner is and what to do next.
 *
 * ONE SET OF WORDS ACROSS EVERY SCREEN. The learner's current step was "Your
 * current step" on the Journey, "you are here" on a lesson and "You are
 * learning" on Games; its topic was "Current topic" on Home and "You are here"
 * on the topic page; the same action was "Continue learning", "Keep going" and
 * "Take the launch check". A beginner reads different words as different
 * things.
 *
 * These are labels only. They never decide a state: every caller still reads
 * the state from the server's path and only asks here what to call it.
 *
 * WHAT IS DELIBERATELY NOT HERE. "You are learning <concept>" on a game's
 * intro and results describes what an activity teaches, not where the learner
 * is, so it keeps its own wording. In-activity steps ("Keep going" between a
 * lesson's stops, "Got it. Try one") are moves inside one screen, not
 * destinations, and stay with the screen that owns them.
 */

/**
 * Where something stands.
 *
 * TWO LEVELS, TWO WORDS. A step is where the learner is; the topic holding it
 * is in progress. Calling both "You're here" put the phrase twice on one
 * screen, once for the topic and once for the step inside it.
 */
export const STATE = {
    complete: "Complete",
    /** The learner's current step (a concept or a checkpoint). */
    here: "You’re here",
    /** The topic that holds the current step, as a row state. */
    inProgress: "In progress",
    /** The topic that holds the current step, as a page's label. */
    currentTopic: "Current topic",
    /** The next topic: nothing between it and the learner but finishing here. */
    upNext: "Up next",
    locked: "Locked",
    readyToPlay: "Ready to play"
} as const;

/** What to do. */
export const ACTION = {
    /** The primary next step, when the step is named nearby on the screen. */
    continueLearning: "Continue learning",
    /** The same step for a learner who has not finished anything yet. */
    startLearning: "Start learning",
    takeCheckpoint: "Take the checkpoint",
    seeJourney: "See your journey",
    /** Every link to /play. It was "Back home", "Back to Jolt" and "Play". */
    backToGames: "Back to Games",
    playGame: "Play a game"
} as const;

/**
 * A game's start button: "Start Code Blitz". Five games used to say "Start
 * blitz", "Start flush", "Start hunt", "Start" and "Start" for the same act.
 */
export function startGame(name: string): string {
    return `Start ${name}`;
}

/** The primary next step, when the button itself has to name it. */
export function continueTo(name: string): string {
    return `Continue: ${name}`;
}
