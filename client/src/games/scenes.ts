/**
 * Scene lessons: the interactive form of a Jolt lesson.
 *
 * The prose form in lessons.ts shows a learner everything, then asks. This one
 * gives them one thing at a time and lets them cause the behaviour before
 * anybody names it. The rule the content follows:
 *
 *     Jolt does not explain JavaScript. Jolt lets you discover how it works,
 *     and then confirms what you just saw.
 *
 * So an explanation is never the first thing on screen. It arrives after the
 * learner has pressed RUN and watched the output appear, at the point where it
 * confirms something rather than introduces it.
 *
 * THREE SCENE KINDS, AND DELIBERATELY NOT MORE. Run, ask, reveal. Every beat in
 * the target experience -- discover, interact, notice, predict, feedback, retry,
 * concept reveal, demonstrate -- is one of those three with different content.
 * A `notice` scene and a `predict` scene differ in what they ask, not in what
 * they are, so they are the same type with different words. Adding a scene kind
 * per beat would be a lesson engine; this is a lesson.
 *
 * Coexists with lessons.ts rather than replacing it: twenty concepts still use
 * the prose form, and LessonPage renders whichever exists.
 */

export interface SceneChoice {
    text: string;
    correct?: boolean;
    /** Names the misconception that leads here. Required on every wrong answer. */
    feedback?: string;
}

/**
 * DISCOVER / INTERACT. Code, a RUN button, and output that appears as a
 * consequence of pressing it.
 *
 * The learner causes the behaviour before anything is claimed about it. That is
 * the whole difference between this and a screenshot of a console.
 */
export interface RunScene {
    kind: "run";
    /** What the learner is being invited to do. One short line. */
    invite: string;
    code: string;
    /** What appears, after they press RUN. */
    output: string;
    /** Said once the output is on screen. The smallest true thing. */
    after: string;
}

/**
 * NOTICE / PREDICT / DEMONSTRATE. A question, answerable from what the learner
 * has already seen happen.
 */
export interface AskScene {
    kind: "ask";
    ask: string;
    code?: string;
    choices: SceneChoice[];
    /** Said on a correct answer. */
    confirm: string;
    /** The next idea, introduced beside a correct answer rather than as a question. */
    aside?: string;
    /** A nearby question after a wrong answer. Never the same one again. */
    retry?: Omit<AskScene, "kind" | "retry"> & { kind?: never };
    /**
     * The closing task. Getting here is what completes the concept, so it is the
     * one question a learner has to reach rather than merely attempt.
     */
    final?: true;
}

/**
 * CONCEPT REVEAL. The formal name, after the behaviour is already familiar.
 *
 * Annotated rather than prose: the learner has seen this code run, so pointing
 * at its pieces lands where a paragraph would not.
 */
export interface RevealScene {
    kind: "reveal";
    headline: string;
    code: string;
    parts: { piece: string; means: string }[];
}

/**
 * A beat with nothing to do but read one thing.
 *
 * The scenes that carry the "ohhh" are not the questions — they are the moments
 * between them, where the learner is told what just happened to them in plain
 * words and large type. A lesson made only of interactions never gives anyone
 * the chance to notice they have understood something.
 */
export interface MomentScene {
    kind: "moment";
    /** Small, above the headline. Sets the beat. */
    eyebrow?: string;
    /** The whole point of the scene, in display type. */
    headline: string;
    /** One or two short lines. Never a paragraph. */
    lines: string[];
    /** The button. Named for what it does next, not "Next". */
    action: string;
}

/**
 * The scene where the learner changes the code and runs it again.
 *
 * THIS IS THE ONE THAT TEACHES. Watching output appear proves a line does
 * something; changing the line and watching the output follow proves WHAT it
 * does, and proves it to the learner rather than telling them. Everything
 * before this scene is setup for it.
 *
 * Deliberately one editable slot, not an editor. A beginner given a blank code
 * pane has to know syntax before they can type anything; a beginner given one
 * word to change has to know nothing.
 */
export interface EditScene {
    kind: "edit";
    invite: string;
    /** The code, with {slot} marking the editable part. */
    template: string;
    /** What the slot starts as. */
    initial: string;
    /** Placeholder guidance, e.g. "type anything". */
    hint: string;
    /** Said once they have run their own version. */
    after: string;
}

export type Scene = MomentScene | RunScene | EditScene | AskScene | RevealScene;

export interface SceneLesson {
    concept: string;
    title: string;
    /**
     * Where this lesson happens.
     *
     * The topic's name today. It is held separately from the concept because the
     * journey is meant to become somewhere a learner GOES -- Values as a place
     * rather than a chapter heading -- and naming the place from the first
     * lesson means that change is a visual one later rather than a new idea the
     * learner has to be introduced to.
     */
    place: string;
    scenes: Scene[];
}

/**
 * console-output — the reference lesson.
 *
 * Nine scenes, and the learner presses RUN three times before being asked
 * anything that could be got wrong. The string/number distinction is SHOWN
 * twice (scene 6 and 7) and never named here: it belongs to primitive-types,
 * and naming it now would be the "five concepts in one question" problem this
 * lesson exists to avoid.
 */
/**
 * console-output — the gold-standard lesson.
 *
 * The target is not "completed the console-output lesson". It is: someone who
 * has never written a line of code can change and run a tiny JavaScript program
 * and say what it does.
 *
 * SHAPE. Twelve scenes, and the learner is not asked to predict anything until
 * scene 9. Before that they have: read two sentences, watched one line run,
 * been told plainly what just happened, seen the code taken apart, and CHANGED
 * IT THEMSELVES and run it again. The prediction is then a formality rather than
 * a test, which is the point -- a beginner who gets it wrong at scene 9 was
 * failed by scenes 1-8.
 *
 * SCENE 6 IS THE LESSON. Watching output appear proves the line does something.
 * Changing the word and watching the output follow proves what it does, and
 * proves it to the learner rather than telling them. Everything before it is
 * setup; everything after is consolidation.
 *
 * VOCABULARY. Nothing here is called an expression, an argument, a string, a
 * function or a value. The learner needs a mental model -- "code is a list of
 * instructions, and this one makes something appear" -- and every term spent
 * before that model exists is a term spent on nothing.
 */
export const CONSOLE_OUTPUT: SceneLesson = {
    concept: "console-output",
    title: "Your first program",
    place: "Values",
    scenes: [
        {
            kind: "moment",
            headline: "You don't need to know JavaScript yet.",
            lines: [
                "We're going to work it out one tiny piece at a time.",
                "Nothing you press here can break anything."
            ],
            action: "Let's go"
        },
        {
            kind: "moment",
            eyebrow: "01: the idea",
            headline: "Code is a list of instructions.",
            lines: [
                "You write an instruction. The computer follows it.",
                "That is the whole idea. Everything else is detail."
            ],
            action: "Show me one"
        },
        {
            kind: "run",
            invite: "Here is one instruction. Press RUN and watch.",
            code: 'console.log("Hello")',
            output: "Hello",
            after: "Hello appeared."
        },
        {
            kind: "moment",
            eyebrow: "02: what just happened",
            headline: "You made something happen.",
            lines: [
                "You gave JavaScript an instruction.",
                "JavaScript followed it."
            ],
            action: "Let me try"
        },
        {
            kind: "edit",
            invite: "Your turn. Change the word to anything you like, then run it.",
            template: 'console.log("{slot}")',
            initial: "Hello",
            hint: "type anything",
            after: "That came from you. You changed the instruction, so the result changed."
        },
        {
            kind: "moment",
            eyebrow: "03: the connection",
            headline: "Whatever goes in the brackets comes out.",
            lines: [
                "Change what is inside, and what appears changes with it.",
                "That is the whole of console.log."
            ],
            action: "Try something different"
        },
        {
            kind: "run",
            invite: "This one has no quote marks. What do you think happens?",
            code: "console.log(5)",
            output: "5",
            after: "It worked too. Numbers do not need quote marks around them."
        },
        {
            kind: "ask",
            ask: "So what would this one show?",
            code: 'console.log("Jolt")',
            choices: [
                { text: "Jolt", correct: true },
                {
                    text: '"Jolt"',
                    feedback:
                        "Look back at your own run: you typed a word and it appeared without quote marks around it. The quotes tell JavaScript where the word starts and stops, then they step out of the way."
                },
                {
                    text: "console.log",
                    feedback:
                        "console.log is the instruction doing the showing. What gets shown is whatever sits inside its brackets."
                }
            ],
            confirm: "Yes. Whatever is inside the brackets is what appears.",
            retry: {
                ask: "Try one more.",
                code: 'console.log("Yes")',
                choices: [
                    { text: "Yes", correct: true },
                    { text: '"Yes"', feedback: "The quote marks never appear in the result." }
                ],
                confirm: "That's it."
            }
        },
        {
            kind: "run",
            invite: "One last thing. A program can have more than one instruction.",
            code: 'console.log("one")\nconsole.log("two")',
            output: "one\ntwo",
            after: "Two instructions, followed in order, top to bottom."
        },
        {
            kind: "ask",
            final: true,
            ask: "Last question. What would this show?",
            code: 'console.log("ready")\nconsole.log("go")',
            choices: [
                { text: "ready\ngo", correct: true },
                {
                    text: "go\nready",
                    feedback:
                        "Instructions are followed from the top down, so the first one happens first."
                },
                {
                    text: "ready go",
                    feedback:
                        "Each instruction shows its own line, so these end up one above the other."
                }
            ],
            confirm: "Top to bottom, one line each.",
            retry: {
                ask: "Nearly: try this one.",
                code: "console.log(1)\nconsole.log(2)",
                choices: [
                    { text: "1\n2", correct: true },
                    { text: "2\n1", feedback: "The top instruction happens first." }
                ],
                confirm: "That's it."
            }
        },
        {
            kind: "reveal",
            headline: "Now the names for it",
            code: 'console.log("Hello")',
            parts: [
                { piece: "console.log", means: "the instruction you have been using. It means 'show this'" },
                { piece: "(  )", means: "what to show goes inside the brackets" },
                { piece: '"Hello"', means: "the thing being shown" },
                { piece: 'the "  "', means: "quote marks around words. They do not appear" }
            ]
        },
        {
            kind: "moment",
            eyebrow: "04: you can now",
            headline: "Write a program that shows something.",
            lines: [
                "You wrote one, changed it, and ran it yourself.",
                "That is genuinely how every program starts."
            ],
            action: "Finish"
        }
    ]
};

const SCENE_LESSONS: readonly SceneLesson[] = [CONSOLE_OUTPUT];

/** The interactive lesson for a concept, or null when only the prose form exists. */
export function sceneLessonFor(concept: string | null): SceneLesson | null {
    return concept ? (SCENE_LESSONS.find((l) => l.concept === concept) ?? null) : null;
}
