/**
 * The teaching half of Jolt: what a learner is shown, and what they are asked,
 * before any game gets involved.
 *
 * WHY THIS IS AUTHORED HERE AND NOT IN POSTGRES. Same reasoning as learnBeats.ts,
 * and the same limit on it. A lesson is not dealt, not timed, not scored and not
 * randomised -- there is exactly one per concept, and it changes only when
 * someone rewrites the teaching. That is a constant, and putting constants in a
 * table buys a migration and a seed to deliver text. What IS durable -- which
 * concepts a learner has demonstrated -- lives in the database, because it is
 * per learner and has to survive.
 *
 * The line moves the day a lesson needs to vary per learner, or the day these
 * questions need to be dealt by a game rather than walked in order. Neither is
 * true yet.
 *
 * WHAT A LESSON IS NOT. Not a question bank slice. Every step below was written
 * against one concept's objective, in a deliberate order -- recognise before
 * predict, one idea at a time -- and each wrong answer carries feedback naming
 * the misconception that produced it. A step that could be answered by someone
 * who had not read the teaching is a step that teaches nothing.
 */

/** What the learner is asked to do. Mirrors the curriculum's demand ladder. */
/**
 * The rungs a LESSON step can be evidence at.
 *
 * `recall` joined at `string-methods`, `explain` at `while-loops`, and
 * `diagnose` at `functions-as-values` -- all three are things a lesson step can
 * ask directly, because "retrieve it", "give the mechanism" and "locate the
 * fault" are all questions with options.
 *
 * `produce` and `repair` stay out, and will: a lesson step cannot be evidence
 * of WRITING code. That is what the encounter's movement activities are for.
 */
export type LessonDemand = "recognise" | "recall" | "predict" | "explain" | "diagnose";

export interface LessonChoice {
    text: string;
    correct?: boolean;
    /**
     * Shown when this specific wrong answer is chosen.
     *
     * Not "incorrect" -- the misconception that leads here, named. A distractor
     * without one is a distractor nobody learns from.
     */
    feedback?: string;
}

export interface LessonStep {
    demand: LessonDemand;
    /** The question, in as few words as it can be asked. */
    ask: string;
    /** Optional snippet. Shown as code, above the choices. */
    code?: string;
    choices: LessonChoice[];
    /** Said after a correct answer. One line, reinforcing the rule. */
    confirm: string;
    /**
     * The thing worth noticing that the question did not ask about.
     *
     * Shown after a correct answer, under the confirmation. "The quotes tell
     * JavaScript this is a string — they are not printed" belongs here: it is
     * the next idea, introduced while the learner is looking at an example of
     * it, rather than sprung on them as a question two steps later.
     */
    aside?: string;
    /**
     * A second, closely related question offered after a wrong answer.
     *
     * Deliberately NOT the same question again: repeating it rewards guessing,
     * where a neighbouring one asks whether the feedback landed. A step with no
     * retry simply moves on after the explanation -- being stuck is worse than
     * being wrong.
     */
    retry?: Omit<LessonStep, "retry">;
}

/**
 * One thing the learner is shown before anything is asked.
 *
 * SEE IT comes before UNDERSTAND IT, so the code and what it actually displays
 * are shown together. A note that says "prints Hello" asks the learner to
 * imagine the output; an output block shows it.
 */
export interface TeachBlock {
    code: string;
    /**
     * What the code displays, rendered as real console output rather than
     * described in prose. Omitted when the snippet displays nothing.
     */
    output?: string;
    /** One line naming what is being looked at. */
    note: string;
    /**
     * The code broken into its pieces, each named.
     *
     * This is the UNDERSTAND IT step. A beginner shown `console.log("Hello")`
     * is looking at four unfamiliar things at once -- a name, parentheses,
     * quotes and a word -- and cannot be asked about any of them until someone
     * has said which is which.
     */
    parts?: { piece: string; means: string }[];
}

export interface Lesson {
    /**
     * The curriculum concept this teaches, or null when this is a topic's
     * cumulative challenge rather than a lesson.
     */
    concept: string | null;
    /**
     * Set only on a topic challenge: the topic slug it closes.
     *
     * A challenge is the same shape as a lesson because it IS the same
     * interaction -- ask, answer, feedback, retry. What differs is that it
     * teaches nothing new (`teach` is empty), it draws on several concepts at
     * once, and finishing it completes the topic rather than a concept. One type
     * rather than two keeps the page, the ordering and the tests single.
     */
    challengeFor?: string;
    title: string;
    /** Why a learner should care, in one sentence. */
    why: string;
    /** The worked examples, shown before anything is asked. */
    teach: TeachBlock[];
    /** What to notice. One line, the thing the questions then test. */
    notice: string;
    steps: LessonStep[];
}

/**
 * VALUES -- the first topic, in the curriculum's own concept order.
 *
 * Four concepts, written to be met in this sequence and no other. `typeof` comes
 * last on purpose: it is a tool for inspecting types, and it means nothing to
 * someone who has not yet met the idea that values have types at all.
 */
export const LESSONS: readonly Lesson[] = [
    {
        concept: "console-output",
        title: "Seeing what your code does",
        why: "Everything else you learn here starts with looking at a line of code and knowing what it puts on screen.",
        teach: [
            {
                code: 'console.log("Hello");',
                output: "Hello",
                note: "This is the whole of it — a line of code, and what it displays.",
                parts: [
                    { piece: "console.log(  )", means: "displays whatever you put inside the brackets" },
                    { piece: '"Hello"', means: "the thing being displayed" },
                    { piece: "the quotes", means: "tell JavaScript this is text — they are not displayed themselves" }
                ]
            },
            {
                code: 'console.log("Hi");\nconsole.log("Bye");',
                output: "Hi\nBye",
                note: "Two lines, two displays, in the order they are written."
            }
        ],
        notice: "Whatever sits inside the brackets is what appears.",
        steps: [
            {
                demand: "recognise",
                ask: "What will this display?",
                code: 'console.log("Hi");',
                choices: [
                    { text: "Hi", correct: true },
                    {
                        text: '"Hi"',
                        feedback:
                            "Very close — the quotes are instructions to JavaScript, not part of the text. It displays Hi without them."
                    },
                    {
                        text: "console.log",
                        feedback:
                            "console.log is the thing doing the displaying. What gets displayed is whatever is inside its brackets."
                    },
                    {
                        text: "nothing",
                        feedback: "console.log always displays what is inside its brackets."
                    }
                ],
                confirm: "console.log displays the value inside the brackets.",
                aside: "Notice the quotes did not appear. They tell JavaScript that Hi is text, and then they step out of the way."
            },
            {
                demand: "predict",
                ask: "And this one?",
                code: "console.log(5);",
                choices: [
                    { text: "5", correct: true },
                    {
                        text: '"5"',
                        feedback:
                            "There are no quotes here at all, so none appear. It displays just 5."
                    }
                ],
                confirm: "Numbers do not need quotes — they go in as they are.",
                aside: 'So `5` and `"5"` are both allowed. They display the same thing, and shortly you will see they are not the same kind of value.'
            },
            {
                demand: "predict",
                ask: "What about this?",
                code: 'console.log("5");',
                choices: [
                    { text: "5", correct: true },
                    {
                        text: '"5"',
                        feedback: "The quotes never appear in the output. They only tell JavaScript this is text."
                    },
                    {
                        text: "an error",
                        feedback:
                            "This is perfectly valid. Text that happens to be a digit is still text, and JavaScript is happy with it."
                    }
                ],
                confirm: 'Both `5` and `"5"` display 5.',
                aside: "They look identical on screen and JavaScript treats them very differently. That difference is the next thing you will meet."
            },
            {
                demand: "predict",
                ask: "Two lines this time. What appears?",
                code: 'console.log("one");\nconsole.log("two");',
                choices: [
                    { text: "one\ntwo", correct: true },
                    {
                        text: "two\none",
                        feedback:
                            "Lines run from the top down, so the first console.log displays first."
                    },
                    {
                        text: "one two",
                        feedback:
                            "Each console.log gets its own line, so these appear one above the other."
                    }
                ],
                confirm: "Top to bottom, one line each.",
                retry: {
                    demand: "predict",
                    ask: "And these?",
                    code: "console.log(1);\nconsole.log(2);",
                    choices: [
                        { text: "1\n2", correct: true },
                        { text: "2\n1", feedback: "The first line runs first." }
                    ],
                    confirm: "Exactly."
                }
            }
        ]
    },
    {
        concept: "arithmetic-operators",
        title: "Doing arithmetic",
        why: "Arithmetic is the clearest case of an expression turning into a single value.",
        /*
         * TAUGHT THROUGH console.log, because that is what the learner has met.
         * This concept used to sit in Operators, three topics later, where a
         * bare `2 + 3` with a note saying "produces 5" was safe. In Values it
         * comes straight after Running Code and Reading Output, and a lesson
         * whose teaching shows an expression on its own and whose first question
         * shows `console.log(3 * 4)` is asking the learner to bridge that gap
         * unaided.
         */
        teach: [
            {
                code: "console.log(2 + 3);",
                output: "5",
                note: "The sum is worked out first, and the single value it produces is what gets displayed.",
                parts: [
                    { piece: "2 + 3", means: "an expression — code that produces a value" },
                    { piece: "5", means: "the one value it produced" }
                ]
            },
            {
                code: "console.log(10 - 4);\nconsole.log(3 * 2);\nconsole.log(8 / 2);",
                output: "6\n6\n4",
                note: "Subtract, multiply, divide. Each line produces one number.",
                parts: [
                    { piece: "*", means: "multiply" },
                    { piece: "/", means: "divide" }
                ]
            }
        ],
        notice: "Each expression is worked out into one value before anything else uses it.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: "console.log(3 * 4);",
                choices: [
                    { text: "12", correct: true },
                    { text: "7", feedback: "That would be 3 + 4. The * is multiplication." },
                    { text: "34", feedback: "These are numbers being multiplied, not text being joined." }
                ],
                confirm: "One expression, one value."
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: "console.log(10 / 4);",
                choices: [
                    { text: "2.5", correct: true },
                    {
                        text: "2",
                        feedback:
                            "JavaScript does not round division down. There is one number type and it holds decimals, so this is 2.5."
                    }
                ],
                confirm: "Division can give you a decimal.",
                retry: {
                    demand: "predict",
                    ask: "And this?",
                    code: "console.log(9 / 2);",
                    choices: [
                        { text: "4.5", correct: true },
                        { text: "4", feedback: "No rounding — the answer keeps its decimal." }
                    ],
                    confirm: "Right."
                }
            }
        ]
    },
    {
        concept: "expressions-produce-values",
        title: "Code that works something out",
        why: "Most lines of JavaScript work something out first. Reading code means seeing what each bit turns into.",
        teach: [
            {
                code: "console.log(2 + 3);",
                output: "5",
                note: "JavaScript worked out 2 + 3 before displaying anything.",
                parts: [
                    { piece: "2 + 3", means: "gets worked out first, into the single value 5" },
                    { piece: "console.log(  )", means: "then displays that result" }
                ]
            },
            {
                code: "console.log(10 - 4);",
                output: "6",
                note: "Same idea with a different sum."
            }
        ],
        notice: "The sum disappears and its answer takes its place.",
        steps: [
            {
                demand: "predict",
                ask: "What appears?",
                code: "console.log(4 + 4);",
                choices: [
                    { text: "8", correct: true },
                    {
                        text: "4 + 4",
                        feedback:
                            "JavaScript works the sum out before displaying it, so you see the answer rather than the sum."
                    },
                    { text: "44", feedback: "These are numbers being added, not text being joined together." }
                ],
                confirm: "Worked out first, then displayed."
            },
            {
                demand: "predict",
                ask: "And this?",
                code: "console.log(3 * 2);",
                choices: [
                    { text: "6", correct: true },
                    { text: "5", feedback: "That would be 3 + 2. The * means multiply." },
                    { text: "32", feedback: "Multiplication gives a number, not the digits side by side." }
                ],
                confirm: "* multiplies.",
                aside: "The same thing happens with -, * and /. Each one works out to a single value."
            },
            {
                demand: "recognise",
                ask: "Which of these works something out?",
                choices: [
                    { text: "8 / 2", correct: true },
                    {
                        text: "+",
                        feedback:
                            "An operator on its own has nothing to work on. It needs a value either side of it."
                    },
                    {
                        text: "console.log",
                        feedback:
                            "On its own this is just a name. It does something when you call it with brackets after it."
                    }
                ],
                confirm: "8 / 2 becomes 4.",
                retry: {
                    demand: "recognise",
                    ask: "And which of these works something out?",
                    choices: [
                        { text: "5 - 1", correct: true },
                        { text: "let", feedback: "let is a keyword for making variables, not a sum." }
                    ],
                    confirm: "Right — it becomes 4."
                }
            }
        ]
    },
    {
        concept: "primitive-types",
        title: "Values come in kinds",
        why: "What a value can do depends on what kind of thing it is. This is the distinction everything later rests on.",
        teach: [
            {
                code: "console.log(25);",
                output: "25",
                note: "No quotes. This is a number.",
                parts: [{ piece: "25", means: "a number — JavaScript can do arithmetic with it" }]
            },
            {
                code: 'console.log("25");',
                output: "25",
                note: "Quotes. This one is text, even though it looks the same on screen.",
                parts: [{ piece: '"25"', means: "a string — two characters that happen to be digits" }]
            },
            {
                code: "console.log(true);",
                output: "true",
                note: "A third kind: true and false are the only two of these.",
                parts: [{ piece: "true", means: "a boolean — one of exactly two values" }]
            }
        ],
        notice: "The quotes are what decide it, not what the characters look like.",
        steps: [
            {
                demand: "recognise",
                ask: "What kind of value is 25?",
                choices: [
                    { text: "a number", correct: true },
                    {
                        text: "a string",
                        feedback: "There are no quotes around it, so this is a number rather than text."
                    },
                    {
                        text: "a boolean",
                        feedback: "Booleans are only ever true or false."
                    }
                ],
                confirm: "No quotes, so a number."
            },
            {
                demand: "recognise",
                ask: 'And what kind of value is "25"?',
                choices: [
                    { text: "a string", correct: true },
                    {
                        text: "a number",
                        feedback:
                            "The characters inside are digits, but the quotes are what decide it. Quotes make it text."
                    }
                ],
                confirm: "Quotes make it a string, however numeric it looks.",
                aside: "This is the one that catches everybody. 25 and \"25\" look identical when displayed, and JavaScript treats them as different kinds of thing.",
                retry: {
                    demand: "recognise",
                    ask: 'What kind of value is "true"?',
                    choices: [
                        { text: "a string", correct: true },
                        {
                            text: "a boolean",
                            feedback:
                                "The word is true, but it is inside quotes — so it is text that happens to spell a boolean."
                        }
                    ],
                    confirm: "Quotes win."
                }
            },
            {
                demand: "predict",
                ask: "So what does this display?",
                code: 'console.log("5" === 5);',
                choices: [
                    { text: "false", correct: true },
                    {
                        text: "true",
                        feedback:
                            'They look the same, but "5" is a string and 5 is a number. Different kinds of thing means not the same value.'
                    }
                ],
                confirm: "Different kinds, so not equal.",
                aside: "=== is how you ask whether two values are the same. You will meet it properly in Operators."
            }
        ]
    },
    {
        concept: "booleans",
        title: "true and false",
        why: "Every decision a program makes comes down to one of two values. These are they.",
        /*
         * NO COMPARISON HERE ANY MORE, and that is the point.
         *
         * This lesson used to teach `5 > 3` -- four of its six steps were
         * comparison questions -- because comparison-operators sat two topics
         * away and booleans was the only place the idea could be introduced.
         * Comparison now sits directly after this concept, so it owns
         * "comparisons produce booleans" and this one owns the two values
         * themselves. A learner here has not met `>` yet, and nothing on this
         * screen asks them to.
         */
        teach: [
            {
                code: "console.log(true);\nconsole.log(false);",
                output: "true\nfalse",
                note: "These two are the whole set. There is no third.",
                parts: [{ piece: "true / false", means: "values, like 25 or \"hello\" — just only two of them" }]
            },
            {
                code: 'console.log("true");',
                output: "true",
                note: "Careful: this is the WORD, not the boolean. It only looks the same once printed.",
                parts: [
                    { piece: '"true"', means: "text that happens to spell the word" },
                    { piece: "the quotes", means: "what makes it text rather than a boolean" }
                ]
            }
        ],
        notice: "true and false are values in their own right — not words, and not numbers.",
        steps: [
            {
                demand: "recognise",
                ask: "Which of these is a boolean?",
                code: 'console.log(5);\nconsole.log("true");\nconsole.log(true);',
                choices: [
                    { text: "true", correct: true },
                    {
                        text: '"true"',
                        feedback:
                            'The quotes make it text. "true" is a string that happens to spell the word — the boolean is the one without quotes.'
                    },
                    {
                        text: "5",
                        feedback: "5 is a number. Booleans are only ever true or false."
                    }
                ],
                confirm: "true without quotes is the boolean. With quotes it is just a word.",
                aside: "There are exactly two booleans in the whole language. Every other value is something else.",
                retry: {
                    demand: "recognise",
                    ask: "And in this one?",
                    code: 'console.log("false");\nconsole.log(false);',
                    choices: [
                        { text: "false", correct: true },
                        { text: '"false"', feedback: "Still text — the quotes are the giveaway." }
                    ],
                    confirm: "Without quotes, it is the boolean."
                }
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: "console.log(false);",
                choices: [
                    { text: "false", correct: true },
                    { text: "true", feedback: "It prints the value it was given, and it was given false." },
                    {
                        text: '"false"',
                        feedback:
                            "The quotes are only how text is written in code. This value is a boolean, so there were never any quotes to print."
                    }
                ],
                confirm: "A boolean prints as the bare word, with no quotes.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: 'console.log("false");',
                    choices: [
                        { text: "false", correct: true },
                        { text: '"false"', feedback: "The quotes mark where the text starts and ends — they are not printed." }
                    ],
                    confirm: "Same output, different kind of value. That is what typeof is for, shortly."
                }
            }
        ]
    },
    {
        concept: "comparison-operators",
        title: "Comparing two values",
        why: "Comparisons are how a program asks a question about two values.",
        /*
         * Shown through console.log for the same reason arithmetic is: this
         * concept moved into Values, where the learner has met output and
         * little else, and a lesson must not open on syntax its own teaching
         * never showed.
         */
        teach: [
            {
                code: "console.log(5 > 3);",
                output: "true",
                note: "The comparison is a question, and the answer it produces is a boolean.",
                parts: [
                    { piece: "5 > 3", means: "asks: is 5 bigger than 3?" },
                    { piece: "true", means: "the answer — not either of the numbers" }
                ]
            },
            {
                code: "console.log(5 < 3);\nconsole.log(4 >= 4);\nconsole.log(2 <= 1);",
                output: "false\ntrue\nfalse",
                note: "Smaller than, at least, at most. Each one answers true or false.",
                parts: [
                    { piece: ">=", means: "bigger than or equal to" },
                    { piece: "<=", means: "smaller than or equal to" }
                ]
            }
        ],
        notice: "A comparison always produces a boolean — never one of the numbers.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: "console.log(4 >= 4);",
                choices: [
                    { text: "true", correct: true },
                    {
                        text: "false",
                        feedback:
                            ">= means greater than OR equal to. They are equal, so it holds."
                    }
                ],
                confirm: "The 'or equal to' half counts."
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: "console.log(2 > 7);",
                choices: [
                    { text: "false", correct: true },
                    { text: "true", feedback: "2 is the smaller number, so this does not hold." },
                    { text: "2", feedback: "A comparison hands back true or false, not one of the numbers." }
                ],
                confirm: "False is a value like any other.",
                retry: {
                    demand: "predict",
                    ask: "And this?",
                    code: "console.log(10 <= 3);",
                    choices: [
                        { text: "false", correct: true },
                        { text: "true", feedback: "10 is bigger than 3, so it is not less than or equal." }
                    ],
                    confirm: "Right."
                }
            }
        ]
    },
    {
        concept: "typeof",
        title: "Asking what type a value is",
        why: "Sometimes you need JavaScript to tell you what it is holding, rather than working it out yourself.",
        teach: [
            {
                code: "console.log(typeof 25);",
                output: "number",
                note: "typeof asks JavaScript what kind of value it is holding.",
                parts: [
                    { piece: "typeof", means: "asks: what kind of value is this?" },
                    { piece: "25", means: "the value being asked about" },
                    { piece: "number", means: "the answer, as text" }
                ]
            },
            { code: 'console.log(typeof "hello");', output: "string", note: "Text gives back string." },
            { code: "console.log(typeof true);", output: "boolean", note: "And a boolean gives back boolean." }
        ],
        notice: "typeof hands back the name of the type, as a string.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: 'console.log(typeof "25");',
                choices: [
                    { text: "string", correct: true },
                    {
                        text: "number",
                        feedback:
                            'The quotes make 25 a string. typeof reports how the value is stored, not what it looks like — so this gives "string".'
                    },
                    { text: "25", feedback: "typeof reports the type, never the value itself." }
                ],
                confirm: "Quotes make it a string, and typeof says so.",
                aside: "You already knew this from the last lesson. typeof is just a way of asking JavaScript instead of working it out yourself."
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: "console.log(typeof 25);",
                choices: [
                    { text: "number", correct: true },
                    {
                        text: "string",
                        feedback: 'No quotes this time, so it really is a number. Compare it with typeof "25".'
                    }
                ],
                confirm: "No quotes, so number.",
                retry: {
                    demand: "predict",
                    ask: "One more — what does this print?",
                    code: "console.log(typeof false);",
                    choices: [
                        { text: "boolean", correct: true },
                        { text: "false", feedback: "typeof gives the type's name, not the value." },
                        { text: "string", feedback: 'It would only be a string if it were written "false".' }
                    ],
                    confirm: "Boolean — true and false are the two of them."
                }
            }
        ]
    }
];

/* --------------------------------------------------- VALUES, the last two
 *
 * The values topic declares seven concepts, not five. These two close it, and
 * without them the journey dead-ends before Variables can unlock -- the path
 * walks every concept the curriculum declares, not every concept that happens
 * to have a lesson.
 *
 * Both stay deliberately small. type-coercion is load-bearing and reappears for
 * the rest of the curriculum, but a beginner meeting it for the first time needs
 * the observation -- + and - behave differently with a string -- not the rules.
 */
export let VALUES_TAIL_LESSONS: readonly Lesson[] = [
    {
        concept: "null-vs-undefined",
        title: "Two ways of having nothing",
        why: "You will see both, and they mean different things about how the nothing got there.",
        /*
         * TAUGHT WITHOUT VARIABLES, because this concept closes Values and the
         * learner has not reached Variables yet.
         *
         * The canonical demonstration of `undefined` is a name that was declared
         * and never filled, and this lesson used to open on exactly that --
         * `let score;` -- which is Variables #2. A learner here has not met
         * `let`, so the lesson taught the concept using syntax it could not
         * assume.
         *
         * What IS available is `typeof`, the concept immediately before this
         * one, and it draws the distinction sharply: the two values report
         * different types, and one of them famously lies. That is a real
         * mechanism rather than a substitute for one -- but it is worth being
         * honest that the most natural example of undefined, an unfilled
         * variable, cannot be shown until Variables.
         */
        teach: [
            {
                code: "console.log(undefined);\nconsole.log(null);",
                output: "undefined\nnull",
                note: "Two different ways of saying there is nothing here.",
                parts: [
                    { piece: "undefined", means: "what JavaScript produces on its own when no value was supplied" },
                    { piece: "null", means: "a value somebody writes on purpose to mean nothing" }
                ]
            },
            {
                code: "console.log(typeof undefined);\nconsole.log(typeof null);",
                output: "undefined\nobject",
                note: "They are not the same kind of thing — and the second answer is a famous mistake JavaScript has never been able to fix.",
                parts: [
                    { piece: '"undefined"', means: "undefined is its own type, with only itself in it" },
                    { piece: '"object"', means: "wrong, and kept wrong on purpose: fixing it would break the web" }
                ]
            }
        ],
        notice: "undefined means nobody got round to it. null means somebody chose emptiness on purpose.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: "console.log(null);",
                choices: [
                    { text: "null", correct: true },
                    {
                        text: "undefined",
                        feedback:
                            "undefined is what JavaScript reaches for on its own. This one was written down deliberately, so it prints as what it is."
                    },
                    { text: "nothing", feedback: "It does print — the value it prints just happens to mean emptiness." }
                ],
                confirm: "null is a value you can write, and it displays as itself.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: "console.log(undefined);",
                    choices: [
                        { text: "undefined", correct: true },
                        { text: "null", feedback: "null is the one somebody has to type. This is the other." }
                    ],
                    confirm: "Both print, and each prints its own name."
                }
            },
            {
                demand: "recognise",
                ask: "Which one did a programmer choose deliberately?",
                choices: [
                    { text: "null", correct: true },
                    {
                        text: "undefined",
                        feedback:
                            "undefined is what JavaScript leaves behind when nothing was set. null is the one somebody has to type."
                    }
                ],
                confirm: "null is a decision; undefined is an absence.",
                aside: "That is the whole difference, and it is why the two are not interchangeable."
            }
        ]
    }
];

/* ------------------------------------------------------------- VARIABLES
 *
 * Eight concepts, and the order is the teaching. Declaration, initialization
 * and assignment are three statements a beginner reads as one, so they are met
 * one at a time and contrasted directly. let-vs-let comes after reassignment
 * because let is defined by what it refuses -- the rule is meaningless before
 * you have watched a name be pointed somewhere new.
 */
export let VARIABLES_LESSONS: readonly Lesson[] = [
    {
        concept: "variables-name-values",
        title: "Names and values",
        why: "Naming a value is how a program refers to it again later instead of repeating it.",
        teach: [
            { code: "let score = 25;", note: "score is the name · 25 is the value" },
            { code: 'let player = "Ada";', note: "player is the name · \"Ada\" is the value" }
        ],
        notice: "The name and the value are two different things. The name points at the value.",
        steps: [
            {
                demand: "recognise",
                ask: "In this line, what is the name?",
                code: "let total = 40;",
                choices: [
                    { text: "total", correct: true },
                    {
                        text: "40",
                        feedback:
                            "40 is the value — the actual piece of information. The name is the label on the left of the =, which is total."
                    },
                    {
                        text: "const",
                        feedback:
                            "let is the keyword that makes the variable. The name is the word right after it: total."
                    }
                ],
                confirm: "total is the name; 40 is what it points at."
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: 'let city = "Lagos";\nconsole.log(city);',
                choices: [
                    { text: "Lagos", correct: true },
                    {
                        text: "city",
                        feedback:
                            "Using the name fetches the value it points at, so this prints Lagos. It would only print the word city if it were in quotes."
                    }
                ],
                confirm: "Using the name gets you the value.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: "let age = 7;\nconsole.log(age);",
                    choices: [
                        { text: "7", correct: true },
                        { text: "age", feedback: "The name fetches the value — 7." }
                    ],
                    confirm: "Right."
                }
            }
        ]
    },
    {
        concept: "declaration",
        title: "Declaring a variable",
        why: "Before a name can hold anything, the name has to exist.",
        teach: [
            { code: "let score;", note: "makes the name score — no value given yet" },
            { code: "let score;\nconsole.log(score);", note: "prints  undefined  — nothing was put in it" }
        ],
        notice: "A declaration on its own creates the name and leaves it holding undefined.",
        steps: [
            {
                demand: "recognise",
                ask: "Which line declares a variable without giving it a value?",
                choices: [
                    { text: "let count;", correct: true },
                    {
                        text: "count = 5;",
                        feedback:
                            "This puts 5 into count, but it does not create the name — no let or let here."
                    },
                    {
                        text: "let count = 5;",
                        feedback:
                            "This one does declare count, but it also gives it a value straight away. The question asked for a declaration on its own."
                    }
                ],
                confirm: "let count; creates the name and stops there."
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: "let total;\nconsole.log(total);",
                choices: [
                    { text: "undefined", correct: true },
                    {
                        text: "0",
                        feedback:
                            "JavaScript does not assume a number. A name with nothing put in it holds undefined."
                    },
                    {
                        text: "null",
                        feedback:
                            "null is a value somebody chooses to put in. Nobody put anything in here, so it is undefined."
                    }
                ],
                confirm: "Declared and empty means undefined.",
                retry: {
                    demand: "predict",
                    ask: "And this?",
                    code: "let name;\nconsole.log(name);",
                    choices: [
                        { text: "undefined", correct: true },
                        { text: '""', feedback: "An empty string would have to be put there. Nothing was." }
                    ],
                    confirm: "Still undefined."
                }
            }
        ]
    },
    {
        concept: "initialization",
        title: "Giving it a first value",
        why: "Almost all real code creates the name and fills it in the same breath.",
        teach: [
            { code: "let score;", note: "declaration — score holds undefined" },
            { code: "let score = 25;", note: "initialization — the name and its first value together" }
        ],
        notice: "Initialization is a declaration and a first value on one line.",
        steps: [
            {
                demand: "recognise",
                ask: "Which line initializes a variable?",
                choices: [
                    { text: "let score = 25;", correct: true },
                    {
                        text: "let score;",
                        feedback:
                            "That declares score but gives it nothing. Initializing means supplying the first value too."
                    },
                    {
                        text: "score = 25;",
                        feedback:
                            "This puts 25 into a name that must already exist. Initialization creates the name and fills it at once."
                    }
                ],
                confirm: "Declared and filled on the same line."
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: "let lives = 3;\nconsole.log(lives);",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: "let bays = 7;\nconsole.log(bays);",
                    choices: [
                        { text: "7", correct: true },
                        {
                            text: "bays",
                            feedback: "Without quotes the name is looked up, and it was filled with 7 on the line above."
                        }
                    ],
                    confirm: "The value it was created with is the value it holds."
                },
                choices: [
                    { text: "3", correct: true },
                    {
                        text: "undefined",
                        feedback:
                            "It would be undefined if the line were just let lives;. Here it was given 3 straight away."
                    }
                ],
                confirm: "It had a value from the start."
            }
        ]
    },
    {
        concept: "assignment",
        title: "Putting a value in",
        why: "Assignment is how a value gets into a name that already exists.",
        teach: [
            { code: "let score;\nscore = 25;", note: "the name first, the value after" },
            { code: "let total;\ntotal = 2 + 3;", note: "the right side is worked out first — total becomes 5" }
        ],
        notice: "Everything on the right of the = is worked out first, then stored under the name on the left.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: "let total;\ntotal = 4 + 6;\nconsole.log(total);",
                choices: [
                    { text: "10", correct: true },
                    {
                        text: "4 + 6",
                        feedback:
                            "The right side is worked out before anything is stored, so total holds the single value 10."
                    },
                    {
                        text: "undefined",
                        feedback:
                            "It was undefined after the first line, but the second line put a value in it."
                    }
                ],
                confirm: "Right side first, then stored."
            },
            {
                demand: "recognise",
                ask: "Which line assigns a value to a name that already exists?",
                choices: [
                    { text: "score = 12;", correct: true },
                    {
                        text: "let score = 12;",
                        feedback:
                            "This creates score as well as filling it. The question asked about a name that already exists."
                    },
                    { text: "let score;", feedback: "This creates the name but puts nothing in it." }
                ],
                confirm: "No let or let — just the name and the value.",
                retry: {
                    demand: "recognise",
                    ask: "And which of these assigns to an existing name?",
                    choices: [
                        { text: "lives = 3;", correct: true },
                        { text: "let lives = 3;", feedback: "let also creates the name." }
                    ],
                    confirm: "Right."
                }
            }
        ]
    },
    {
        concept: "reading-variables",
        title: "Reading a variable",
        why: "Following any program means working out what each name holds at that moment.",
        teach: [
            { code: "let score = 25;\nconsole.log(score);", note: "prints  25" },
            { code: "let a = 4;\nconsole.log(a + 1);", note: "prints  5  — a is swapped for 4 first" }
        ],
        notice: "Wherever a name appears, swap it for the value it currently holds.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: "let price = 8;\nconsole.log(price * 2);",
                choices: [
                    { text: "16", correct: true },
                    {
                        text: "price * 2",
                        feedback:
                            "price is swapped for 8 first, then 8 * 2 is worked out, so 16 prints."
                    },
                    {
                        text: "8",
                        feedback: "8 is what price holds, but the line then multiplies it by 2."
                    }
                ],
                confirm: "Swap the name for its value, then work it out."
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: 'let first = "Ada";\nconsole.log("first");',
                choices: [
                    { text: "first", correct: true },
                    {
                        text: "Ada",
                        feedback:
                            'The quotes make this the text "first", not the variable. Without quotes it would have printed Ada.'
                    }
                ],
                confirm: "Quotes mean text, not a name.",
                retry: {
                    demand: "predict",
                    ask: "And this?",
                    code: 'let n = 5;\nconsole.log(n);',
                    choices: [
                        { text: "5", correct: true },
                        { text: "n", feedback: "No quotes, so this is the variable and it holds 5." }
                    ],
                    confirm: "Exactly."
                }
            }
        ]
    },
    {
        concept: "reassignment",
        title: "Changing what a name holds",
        why: "Values that change over time are most of what programs actually do.",
        teach: [
            { code: "let score = 25;\nscore = 30;", note: "score now holds 30" },
            {
                code: "let score = 25;\nconsole.log(score);\nscore = 30;\nconsole.log(score);",
                note: "prints  25  then  30"
            }
        ],
        notice: "Assigning again replaces the value from that line onward. Earlier lines keep the old one.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: "let score = 10;\nscore = 20;\nconsole.log(score);",
                choices: [
                    { text: "20", correct: true },
                    {
                        text: "10",
                        feedback:
                            "The second line replaced the value. By the time the log runs, score holds 20."
                    },
                    {
                        text: "30",
                        feedback:
                            "Reassigning replaces the value rather than adding to it, so score is 20, not 10 + 20."
                    }
                ],
                confirm: "The newest assignment wins."
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: "let n = 1;\nconsole.log(n);\nn = 2;",
                choices: [
                    { text: "1", correct: true },
                    {
                        text: "2",
                        feedback:
                            "The log runs before the reassignment. Lines run top to bottom, so n is still 1 at that point."
                    }
                ],
                confirm: "Only lines after the change see the new value.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: "let n = 5;\nn = 9;\nconsole.log(n);",
                    choices: [
                        { text: "9", correct: true },
                        { text: "5", feedback: "The change happens before the log this time." }
                    ],
                    confirm: "Order is everything."
                }
            }
        ]
    },
    {
        concept: "let-vs-const",
        title: "let and const",
        why: "Choosing const where you can is how you say a value is not meant to change.",
        teach: [
            { code: "let score = 10;\nscore = 20;", note: "fine — let can be reassigned" },
            { code: "const score = 10;\nscore = 20;", note: "error — const cannot be reassigned" }
        ],
        notice: "let allows a new value later. const does not.",
        steps: [
            {
                demand: "recognise",
                ask: "Which of these causes an error?",
                choices: [
                    { text: "const n = 1;\nn = 2;", correct: true },
                    {
                        text: "let n = 1;\nn = 2;",
                        feedback: "let is exactly the keyword that allows this. No error here."
                    },
                    {
                        text: "let n;\nn = 2;",
                        feedback:
                            "This is fine too — n was declared with let, so putting a value in is allowed."
                    }
                ],
                confirm: "const refuses a new value."
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: "const total = 7;\nconsole.log(total);",
                choices: [
                    { text: "7", correct: true },
                    {
                        text: "an error",
                        feedback:
                            "const only complains if you try to reassign it. Reading it is perfectly fine."
                    }
                ],
                confirm: "const stops changes, not reads.",
                retry: {
                    demand: "recognise",
                    ask: "Which keyword would you use for a value that has to change later?",
                    choices: [
                        { text: "let", correct: true },
                        { text: "const", feedback: "const is the one that refuses a new value." }
                    ],
                    confirm: "let for things that change."
                }
            }
        ]
    },
    {
        concept: "variable-state",
        title: "Following a variable",
        why: "Reading real code means holding what each name currently contains in your head.",
        teach: [
            {
                code: "let score = 10;\nscore = 20;\nscore = 30;\nconsole.log(score);",
                note: "prints  30  — only the last assignment survives"
            }
        ],
        notice: "At any line, a variable holds exactly one value: whatever was put in most recently.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: "let score = 10;\nscore = 20;\nscore = 30;\nconsole.log(score);",
                choices: [
                    { text: "30", correct: true },
                    { text: "10", feedback: "10 was replaced twice before the log ran." },
                    {
                        text: "60",
                        feedback:
                            "Each assignment replaces the last rather than adding to it, so the values do not total up."
                    }
                ],
                confirm: "Only the most recent value survives."
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: "let a = 2;\nlet b = a;\na = 5;\nconsole.log(b);",
                choices: [
                    { text: "2", correct: true },
                    {
                        text: "5",
                        feedback:
                            "b was given whatever a held at that moment, which was 2. Changing a afterwards does not reach back and change b."
                    }
                ],
                confirm: "b took a copy of the value, not a link to the name.",
                retry: {
                    demand: "predict",
                    ask: "And this?",
                    code: "let x = 1;\nlet y = x;\nx = 9;\nconsole.log(y);",
                    choices: [
                        { text: "1", correct: true },
                        { text: "9", feedback: "y kept the value it was given — 1." }
                    ],
                    confirm: "Right."
                }
            }
        ]
    }
];

/* ------------------------------------------------------------- OPERATORS
 *
 * Six concepts. Arithmetic first because it is the one place an expression's
 * value is obvious; comparison and equality then reuse the boolean idea from
 * Values, and equality reuses the string-versus-number distinction directly.
 * Truthy/falsy comes last and stays small -- a handful of values, not the
 * coercion table.
 */
export const OPERATORS_LESSONS: readonly Lesson[] = [
    {
        concept: "assignment-operators",
        title: "Updating a value in place",
        why: "Counters and running totals are written this way in essentially all real code.",
        teach: [
            { code: "let score = 10;\nscore += 5;", note: "score becomes 15 — the same as score = score + 5" },
            { code: "let score = 10;\nscore -= 2;", note: "score becomes 8" }
        ],
        notice: "+= reads the variable, changes it, and stores the result back under the same name.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: "let score = 10;\nscore += 5;\nconsole.log(score);",
                choices: [
                    { text: "15", correct: true },
                    {
                        text: "10",
                        feedback:
                            "Unlike score + 5 on its own, += stores the result back, so score really does change."
                    },
                    { text: "5", feedback: "+= adds to what is already there rather than replacing it." }
                ],
                confirm: "Read, change, store back."
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: "let n = 8;\nn -= 3;\nn += 1;\nconsole.log(n);",
                choices: [
                    { text: "6", correct: true },
                    { text: "5", feedback: "Close — the last line adds one back, so 5 becomes 6." },
                    { text: "12", feedback: "-= subtracts. 8 - 3 is 5, then + 1 is 6." }
                ],
                confirm: "Each line updates the value the next line sees.",
                retry: {
                    demand: "predict",
                    ask: "And this?",
                    code: "let n = 4;\nn += 6;\nconsole.log(n);",
                    choices: [
                        { text: "10", correct: true },
                        { text: "6", feedback: "It adds to the 4 already there." }
                    ],
                    confirm: "Right."
                }
            }
        ]
    },
    {
        concept: "type-coercion",
        title: "When types get mixed",
        why: "JavaScript will quietly convert a value to make an operation work, and the result surprises everyone once.",
        teach: [
            {
                code: 'console.log("5" + 3);',
                output: "53",
                note: "One side is text, and + joins text rather than adding.",
                parts: [
                    { piece: '"5"', means: "a string — the quotes make it text" },
                    { piece: "+", means: "joins, when either side is text" }
                ]
            },
            {
                code: 'console.log("5" - 3);',
                output: "2",
                note: "Same string, different operator, completely different answer.",
                parts: [{ piece: "-", means: "has no meaning for text, so JavaScript turns \"5\" into the number 5" }]
            }
        ],
        notice: "+ joins when either side is text. Every other arithmetic operator converts to numbers instead.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: 'console.log("5" + 3);',
                choices: [
                    { text: "53", correct: true },
                    {
                        text: "8",
                        feedback:
                            'One side is a string, and + joins text when it sees one. So "5" and 3 are stuck together into "53".'
                    }
                ],
                confirm: "+ with a string joins rather than adds."
            },
            {
                demand: "predict",
                ask: "And this one?",
                code: 'console.log("5" - 3);',
                choices: [
                    { text: "2", correct: true },
                    {
                        text: "53",
                        feedback:
                            'Only + joins text. Subtraction has no meaning for strings, so "5" is converted to the number 5 first.'
                    },
                    {
                        text: "an error",
                        feedback:
                            "JavaScript converts rather than complaining. That is exactly what makes this worth knowing."
                    }
                ],
                confirm: "Same string, different operator, completely different answer.",
                retry: {
                    demand: "predict",
                    ask: "One more — what does this print?",
                    code: 'console.log("10" * 2);',
                    choices: [
                        { text: "20", correct: true },
                        { text: "102", feedback: "Only + joins. * converts the string to a number." }
                    ],
                    confirm: "Right."
                }
            }
        ]
    },
    {
        concept: "equality",
        title: "Checking if two values are the same",
        why: "Deciding whether two things match is one of the most common checks you will write.",
        teach: [
            { code: "5 === 5", note: "produces  true" },
            { code: "5 === 6", note: "produces  false" },
            { code: '"5" === 5', note: 'produces  false  — a string is not a number' }
        ],
        notice: "=== checks the value AND the type. !== is the opposite question.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: 'console.log("5" === 5);',
                choices: [
                    { text: "false", correct: true },
                    {
                        text: "true",
                        feedback:
                            'They look the same on screen, but "5" is a string and 5 is a number. === checks the type too, so this is false.'
                    }
                ],
                confirm: "Same characters, different types, not equal."
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: "console.log(3 !== 4);",
                choices: [
                    { text: "true", correct: true },
                    {
                        text: "false",
                        feedback:
                            "!== asks 'are these different?'. 3 and 4 really are different, so the answer is true."
                    }
                ],
                confirm: "!== is true when the values differ.",
                retry: {
                    demand: "predict",
                    ask: "And this?",
                    code: "console.log(7 === 7);",
                    choices: [
                        { text: "true", correct: true },
                        { text: "false", feedback: "Same value and same type, so they are equal." }
                    ],
                    confirm: "Right."
                }
            }
        ]
    },
    {
        concept: "logical-operators",
        title: "Combining two conditions",
        why: "Real checks usually depend on more than one thing being true at once.",
        teach: [
            { code: "true && true", note: "produces  true  — && needs both sides" },
            { code: "true && false", note: "produces  false" },
            { code: "false || true", note: "produces  true  — || needs only one side" }
        ],
        notice: "&& is 'both'. || is 'either'.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: "console.log(true && false);",
                choices: [
                    { text: "false", correct: true },
                    {
                        text: "true",
                        feedback:
                            "&& needs both sides to be true. One of them is false, so the whole thing is false."
                    }
                ],
                confirm: "Both, or nothing."
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: "console.log(5 > 3 || 2 > 9);",
                choices: [
                    { text: "true", correct: true },
                    {
                        text: "false",
                        feedback:
                            "The comparisons produce true and false. || needs only one true side, and the first one is true."
                    }
                ],
                confirm: "Either side is enough for ||.",
                retry: {
                    demand: "predict",
                    ask: "And this?",
                    code: "console.log(1 > 2 || 3 > 10);",
                    choices: [
                        { text: "false", correct: true },
                        { text: "true", feedback: "Both sides are false this time, so || has nothing to hold on to." }
                    ],
                    confirm: "Right."
                }
            }
        ]
    },
    {
        concept: "truthy-falsy",
        title: "Values that count as true or false",
        why: "JavaScript will treat almost any value as a yes or a no when it needs to.",
        teach: [
            { code: "Boolean(true)\nBoolean(false)", note: "true  ·  false" },
            { code: 'Boolean("hello")\nBoolean(0)', note: "true  ·  false" },
            { code: 'Boolean("")', note: "false — an empty string counts as no" }
        ],
        notice: "A short list counts as false: 0, an empty string, null and undefined. Almost everything else counts as true.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: "console.log(Boolean(0));",
                choices: [
                    { text: "false", correct: true },
                    {
                        text: "true",
                        feedback:
                            "0 is one of the short list of values JavaScript treats as no. Any other number counts as yes."
                    }
                ],
                confirm: "Zero counts as no."
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: 'console.log(Boolean("0"));',
                choices: [
                    { text: "true", correct: true },
                    {
                        text: "false",
                        feedback:
                            'This is the string "0", not the number 0. It is text with a character in it, and any non-empty string counts as yes.'
                    }
                ],
                confirm: "A non-empty string counts as yes, whatever is in it.",
                retry: {
                    demand: "predict",
                    ask: "And this?",
                    code: 'console.log(Boolean(""));',
                    choices: [
                        { text: "false", correct: true },
                        { text: "true", feedback: "This string has nothing in it, so it counts as no." }
                    ],
                    confirm: "Empty means no."
                }
            }
        ]
    }
];

/* ------------------------------------------------------ TOPIC CHALLENGES
 *
 * The checkpoint that makes a topic mean something. Clicking through five
 * lessons is evidence of attendance; a challenge asks whether the ideas connect
 * when they arrive together and unlabelled.
 *
 * Every challenge draws ONLY on concepts already taught -- a challenge that
 * needed something from the next topic would be a trap rather than a check.
 * They carry no `teach`: there is nothing new here.
 */
/* ---------------------------------------------------------- CONTROL FLOW
 *
 * Five concepts, and the order is the teaching: make one decision, then chain
 * them, then combine them, then nest them, then produce a value with one.
 *
 * Everything here is runnable. `littleJs` gained booleans, comparison, logical
 * operators, `if`/`else` and the ternary when the curriculum reached them, so a
 * learner can type any snippet on these screens and watch it run.
 *
 * `guard-clauses` is deliberately NOT here. It moved to Functions, because
 * leaving a function early needs a function -- see curriculum.ts.
 */
export const CONTROL_FLOW_LESSONS: readonly Lesson[] = [
    {
        concept: "if-else",
        title: "Making a decision",
        why: "Everything a program decides comes down to running one piece of code instead of another.",
        teach: [
            {
                code: 'let fuel = 80;\nif (fuel > 50) {\n  console.log("Plenty");\n}',
                output: "Plenty",
                note: "The condition in the brackets is asked first. It answered true, so the block ran.",
                parts: [
                    { piece: "if ( )", means: "asks a question before deciding whether to run the block" },
                    { piece: "fuel > 50", means: "the question — it produces true or false" },
                    { piece: "{ }", means: "the block: what runs when the answer is true" }
                ]
            },
            {
                code: 'let fuel = 10;\nif (fuel > 50) {\n  console.log("Plenty");\n} else {\n  console.log("Running low");\n}',
                output: "Running low",
                note: "`else` is the other road. Exactly one of the two blocks runs — never both, never neither.",
                parts: [{ piece: "else", means: "what runs when the condition was false" }]
            }
        ],
        notice: "The condition is just an expression that produces true or false. You have been writing those since comparison.",
        steps: [
            {
                demand: "recognise",
                ask: "Which part decides whether the block runs?",
                code: 'if (crew > 3) {\n  console.log("Full");\n}',
                choices: [
                    { text: "crew > 3", correct: true },
                    { text: "if", feedback: "`if` is the instruction to ask. The question itself is inside the brackets." },
                    { text: 'console.log("Full")', feedback: "That is what runs afterwards, not what decides." }
                ],
                confirm: "The condition is the expression inside the brackets.",
                aside: "Anything that produces a value can go there — which is why truthiness matters.",
                retry: {
                    demand: "recognise",
                    ask: "And in this one?",
                    code: 'if (name === "Tati") {\n  console.log("Hello");\n}',
                    choices: [
                        { text: 'name === "Tati"', correct: true },
                        { text: "===", feedback: "That is one operator inside the condition, not the whole question." }
                    ],
                    confirm: "The whole comparison is the condition."
                }
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: 'let fuel = 20;\nif (fuel > 50) {\n  console.log("Plenty");\n} else {\n  console.log("Low");\n}',
                choices: [
                    { text: "Low", correct: true },
                    { text: "Plenty", feedback: "20 is not greater than 50, so the condition was false." },
                    { text: "Plenty then Low", feedback: "Only one of the two blocks ever runs." }
                ],
                confirm: "False condition, so the else block ran.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: 'let crew = 4;\nif (crew > 2) {\n  console.log("Ready");\n} else {\n  console.log("Waiting");\n}',
                    choices: [
                        { text: "Ready", correct: true },
                        { text: "Waiting", feedback: "4 really is greater than 2, so the first block runs." }
                    ],
                    confirm: "True condition, so the first block ran."
                }
            }
        ]
    },
    {
        concept: "else-if-chains",
        title: "More than two roads",
        why: "Most decisions have more than two outcomes, and the order you ask in decides the answer.",
        teach: [
            {
                code: 'let score = 75;\nif (score > 90) {\n  console.log("A");\n} else if (score > 70) {\n  console.log("B");\n} else {\n  console.log("C");\n}',
                output: "B",
                note: "Each condition is tried in order. The FIRST one that is true wins, and the rest are never even asked.",
                parts: [
                    { piece: "else if", means: "another question, asked only if the ones above were false" },
                    { piece: "else", means: "what happens when none of them matched" }
                ]
            }
        ],
        notice: "The first match wins. A chain written in the wrong order can make a branch unreachable.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: 'let n = 100;\nif (n > 10) {\n  console.log("big");\n} else if (n > 50) {\n  console.log("huge");\n}',
                choices: [
                    { text: "big", correct: true },
                    { text: "huge", feedback: "Both conditions are true — but the first one was asked first, and the chain stops there." },
                    { text: "big then huge", feedback: "A chain runs at most one branch." }
                ],
                confirm: "The first true branch wins, even when a later one is also true.",
                aside: "That is why the narrowest condition usually goes first.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: 'let n = 2;\nif (n > 10) {\n  console.log("big");\n} else if (n > 1) {\n  console.log("small");\n} else {\n  console.log("tiny");\n}',
                    choices: [
                        { text: "small", correct: true },
                        { text: "tiny", feedback: "The else only runs when every condition above it was false." }
                    ],
                    confirm: "The first match was the second branch."
                }
            }
        ]
    },
    {
        concept: "compound-conditions",
        title: "Asking two things at once",
        why: "Real conditions usually have more than one part, and JavaScript stops reading as soon as the answer is settled.",
        teach: [
            {
                code: 'let fuel = 80;\nlet crew = 4;\nif (fuel > 50 && crew > 2) {\n  console.log("Cleared");\n}',
                output: "Cleared",
                note: "`&&` needs both sides true. Both were, so the block ran.",
                parts: [{ piece: "&&", means: "and — true only when both sides are true" }]
            },
            {
                code: 'let fuel = 10;\nif (fuel > 50 && fuel < 100) {\n  console.log("Cleared");\n}',
                note: "Nothing printed. The left side was false, so the answer was already settled and the right side was never looked at.",
                output: ""
            }
        ],
        notice: "`&&` stops at the first false part and `||` stops at the first true one. The rest is never evaluated.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: 'let ready = false;\nlet fuelled = true;\nif (ready && fuelled) {\n  console.log("Go");\n} else {\n  console.log("Hold");\n}',
                choices: [
                    { text: "Hold", correct: true },
                    { text: "Go", feedback: "`&&` needs BOTH sides true, and `ready` is false." }
                ],
                confirm: "One false side is enough to settle an `&&`.",
                retry: {
                    demand: "predict",
                    ask: "And with `||`?",
                    code: 'let ready = false;\nlet fuelled = true;\nif (ready || fuelled) {\n  console.log("Go");\n} else {\n  console.log("Hold");\n}',
                    choices: [
                        { text: "Go", correct: true },
                        { text: "Hold", feedback: "`||` needs only one true side, and `fuelled` is true." }
                    ],
                    confirm: "One true side is enough to settle an `||`."
                }
            }
        ]
    },
    {
        concept: "nested-conditions",
        title: "A decision inside a decision",
        why: "Some questions only make sense once another has already been answered.",
        teach: [
            {
                code: 'let docked = true;\nlet fuel = 20;\nif (docked) {\n  if (fuel > 50) {\n    console.log("Launch");\n  } else {\n    console.log("Refuel first");\n  }\n}',
                output: "Refuel first",
                note: "The inner question is only asked because the outer one was true. Undocked, neither line could ever print.",
                parts: [{ piece: "the inner if", means: "reached only when the outer condition was true" }]
            }
        ],
        notice: "An inner condition is unreachable unless the outer one holds. That is what nesting means.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: 'let docked = false;\nlet fuel = 80;\nif (docked) {\n  if (fuel > 50) {\n    console.log("Launch");\n  }\n}\nconsole.log("Done");',
                choices: [
                    { text: "Done", correct: true },
                    { text: "Launch then Done", feedback: "`fuel > 50` is true, but it is never asked — the outer condition was false." },
                    { text: "Launch", feedback: "The last line is outside both blocks, so it always runs." }
                ],
                confirm: "The inner question was never reached.",
                aside: "A nested condition can be true and still change nothing.",
                retry: {
                    demand: "predict",
                    ask: "And when it is docked?",
                    code: 'let docked = true;\nlet fuel = 80;\nif (docked) {\n  if (fuel > 50) {\n    console.log("Launch");\n  }\n}',
                    choices: [
                        { text: "Launch", correct: true },
                        { text: "nothing", feedback: "Both conditions are true this time, so the inner block runs." }
                    ],
                    confirm: "Outer true, then inner true."
                }
            }
        ]
    },
    {
        concept: "ternary",
        title: "A decision that produces a value",
        why: "Sometimes you do not want to run different code — you want to choose between two values.",
        teach: [
            {
                code: 'let fuel = 80;\nlet status = fuel > 50 ? "Plenty" : "Low";\nconsole.log(status);',
                output: "Plenty",
                note: "The whole thing produces ONE value, which is why it can sit on the right of an `=`. An `if` cannot.",
                parts: [
                    { piece: "fuel > 50", means: "the condition, exactly as in an if" },
                    { piece: "?", means: "the value to use when it is true" },
                    { piece: ":", means: "the value to use when it is false" }
                ]
            }
        ],
        notice: "A ternary is an expression: it collapses to a value. An if is a statement: it runs code.",
        steps: [
            {
                demand: "recognise",
                ask: "Which of these produces a value you could store in a variable?",
                choices: [
                    { text: 'n > 0 ? "up" : "down"', correct: true },
                    { text: 'if (n > 0) { "up" }', feedback: "An `if` runs code. It does not collapse to a value, so there is nothing to store." }
                ],
                confirm: "Only the ternary is an expression.",
                retry: {
                    demand: "recognise",
                    ask: "Which part is used when the condition is false?",
                    code: 'let label = ready ? "Go" : "Wait";',
                    choices: [
                        { text: '"Wait"', correct: true },
                        { text: '"Go"', feedback: "That is the true side — it comes before the colon." }
                    ],
                    confirm: "After the colon is the false side."
                }
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: 'let crew = 1;\nlet label = crew > 2 ? "Full" : "Short";\nconsole.log(label);',
                choices: [
                    { text: "Short", correct: true },
                    { text: "Full", feedback: "1 is not greater than 2, so the false side was chosen." },
                    { text: "true", feedback: "The condition produces true or false, but the ternary hands back one of the two values instead." }
                ],
                confirm: "The condition was false, so the value after the colon won.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: 'let n = 10;\nconsole.log(n > 5 ? "big" : "small");',
                    choices: [
                        { text: "big", correct: true },
                        { text: "small", feedback: "10 is greater than 5, so the true side is chosen." }
                    ],
                    confirm: "True side this time."
                }
            }
        ]
    }
];

/* --------------------------------------------------------------- STRINGS
 *
 * Seven concepts, ordered so each one is the tool the next needs: what text IS,
 * joining it, measuring it, reaching into it, reshaping it, building it
 * cleanly, and finally the thing that ties the topic together -- none of the
 * reshaping ever changed the original.
 *
 * `littleJs` gained `.length`, position access and a fixed table of methods
 * when the curriculum reached here. Template literals it already had.
 */
export const STRING_LESSONS: readonly Lesson[] = [
    {
        concept: "string-literals",
        title: "Text, and things that look like text",
        why: "Quotes are the difference between a value you can do arithmetic with and one you cannot.",
        teach: [
            {
                code: 'console.log("25");\nconsole.log(25);',
                output: "25\n25",
                note: "Identical on screen, and not the same value at all. The quotes are the only clue in the code.",
                parts: [
                    { piece: '"25"', means: "text that happens to be made of digits" },
                    { piece: "25", means: "a number you can do arithmetic with" }
                ]
            },
            {
                code: 'console.log(typeof "25");\nconsole.log(typeof 25);',
                output: "string\nnumber",
                note: "`typeof` is how you settle it when the output cannot.",
                parts: [{ piece: '"string"', means: "JavaScript\'s name for text" }]
            }
        ],
        notice: "Quotes make text. What is inside them is never read as code or as a number.",
        steps: [
            {
                demand: "recognise",
                ask: "Which of these is text?",
                choices: [
                    { text: '"7"', correct: true },
                    { text: "7", feedback: "No quotes, so this is the number seven." },
                    { text: "true", feedback: "That is a boolean — one of exactly two values." }
                ],
                confirm: "The quotes are what make it text.",
                aside: "Single and double quotes both work, as long as you close with the one you opened with.",
                retry: {
                    demand: "recognise",
                    ask: "And which of these?",
                    choices: [
                        { text: '"false"', correct: true },
                        { text: "false", feedback: "Without quotes it is the boolean, not the word." }
                    ],
                    confirm: "Quoted, so text."
                }
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'console.log("3" + "4");',
                choices: [
                    { text: "34", correct: true },
                    { text: "7", feedback: "Both sides are text, so `+` joins them rather than adding." },
                    { text: '"34"', feedback: "The quotes mark where text starts and ends in the code — they are not printed." }
                ],
                confirm: "Two pieces of text joined end to end.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: "console.log(3 + 4);",
                    choices: [
                        { text: "7", correct: true },
                        { text: "34", feedback: "No quotes here, so these are numbers and `+` adds." }
                    ],
                    confirm: "Numbers add; text joins."
                }
            }
        ]
    },
    {
        concept: "string-concatenation",
        title: "Joining text together",
        why: "Almost every message a program shows is built out of pieces.",
        teach: [
            {
                code: 'let name = "Tati";\nconsole.log("Hello, " + name + "!");',
                output: "Hello, Tati!",
                note: "Three pieces, joined left to right into one value.",
                parts: [
                    { piece: '"Hello, "', means: "text, including the space — spaces inside quotes are real" },
                    { piece: "name", means: "the value held by the name, dropped in" }
                ]
            },
            {
                code: 'let bays = 4;\nconsole.log("Bays: " + bays);',
                output: "Bays: 4",
                note: "A number joined to text becomes text. The `+` follows the text side.",
                parts: [{ piece: "+", means: "joins when either side is text, adds when both are numbers" }]
            }
        ],
        notice: "Spaces have to be inside the quotes. JavaScript adds none of its own.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'let first = "Nova";\nlet second = "Drift";\nconsole.log(first + second);',
                choices: [
                    { text: "NovaDrift", correct: true },
                    { text: "Nova Drift", feedback: "Nothing put a space there. A space has to be joined in like any other text." },
                    { text: "first second", feedback: "Without quotes the names are looked up, not printed." }
                ],
                confirm: "Joined with nothing between them.",
                aside: 'To get a gap you join three pieces: `first + " " + second`.',
                retry: {
                    demand: "predict",
                    ask: "And with a space joined in?",
                    code: 'let first = "Nova";\nlet second = "Drift";\nconsole.log(first + " " + second);',
                    choices: [
                        { text: "Nova Drift", correct: true },
                        { text: "NovaDrift", feedback: "The middle piece is a space, and it is text like any other." }
                    ],
                    confirm: "Three pieces this time."
                }
            }
        ]
    },
    {
        concept: "string-length",
        title: "How much text is there",
        why: "Checking that something is not empty, or not too long, is one of the commonest things a program does.",
        teach: [
            {
                code: 'let name = "Tati";\nconsole.log(name.length);',
                output: "4",
                note: "`.length` counts characters. It is not a question you call — there are no brackets after it.",
                parts: [
                    { piece: ".length", means: "how many characters the text holds" },
                    { piece: "4", means: "T, a, t, i" }
                ]
            },
            {
                code: 'console.log("".length);\nconsole.log("a b".length);',
                output: "0\n3",
                note: "Empty text has length 0, and a space counts as a character like any other.",
                parts: [{ piece: '""', means: "empty text — a real value, just with nothing in it" }]
            }
        ],
        notice: "Spaces count. `.length` counts characters, not words.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'console.log("Jolt ".length);',
                choices: [
                    { text: "5", correct: true },
                    { text: "4", feedback: "There is a space after the t, and a space is a character." },
                    { text: "1", feedback: "`.length` counts characters, not words." }
                ],
                confirm: "Four letters and a space.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: 'console.log("  ".length);',
                    choices: [
                        { text: "2", correct: true },
                        { text: "0", feedback: "It is not empty — it holds two spaces." }
                    ],
                    confirm: "Two spaces, two characters."
                }
            }
        ]
    },
    {
        concept: "string-indexing",
        title: "Reaching one character",
        why: "Once you can count characters, the next thing you want is to look at one.",
        teach: [
            {
                code: 'let name = "Tati";\nconsole.log(name[0]);\nconsole.log(name[3]);',
                output: "T\ni",
                note: "Positions start at 0, not 1. The first character is at 0 and the last is at length minus one.",
                parts: [
                    { piece: "[0]", means: "the first character" },
                    { piece: "[3]", means: "the fourth — and the last, in text of length 4" }
                ]
            }
        ],
        notice: "The last position is always `length - 1`, because counting starts at zero.",
        steps: [
            {
                demand: "recognise",
                ask: "Which one reaches the FIRST character?",
                code: 'let word = "Jolt";',
                choices: [
                    { text: "word[0]", correct: true },
                    { text: "word[1]", feedback: "That is the second character. Counting starts at 0." },
                    { text: "word.length", feedback: "That counts the characters rather than reaching one." }
                ],
                confirm: "Position 0 is the first.",
                aside: "This zero-based counting is everywhere in JavaScript — arrays work the same way.",
                retry: {
                    demand: "recognise",
                    ask: "And which reaches the LAST character of `Jolt`?",
                    code: 'let word = "Jolt";',
                    choices: [
                        { text: "word[3]", correct: true },
                        { text: "word[4]", feedback: "Length is 4, so the last position is 3." }
                    ],
                    confirm: "Length minus one."
                }
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'let word = "Jolt";\nconsole.log(word[1]);',
                choices: [
                    { text: "o", correct: true },
                    { text: "J", feedback: "J is at position 0. Position 1 is the second character." },
                    { text: "Jo", feedback: "One position gives one character." }
                ],
                confirm: "Second character, first position after zero.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: 'let word = "Jolt";\nconsole.log(word[0]);',
                    choices: [
                        { text: "J", correct: true },
                        { text: "o", feedback: "Position 0 is the very first character." }
                    ],
                    confirm: "Zero is the first."
                }
            }
        ]
    },
    {
        concept: "string-methods",
        title: "Reshaping text",
        why: "Trimming stray spaces and changing case are what you do to almost every piece of text a user types.",
        teach: [
            {
                code: 'let name = "  tati  ";\nconsole.log(name.trim());\nconsole.log(name.trim().toUpperCase());',
                output: "tati\nTATI",
                note: "Each one hands back NEW text, which is why they can be chained one after another.",
                parts: [
                    { piece: ".trim()", means: "text with the spaces at each end removed" },
                    { piece: ".toUpperCase()", means: "text with every letter made capital" },
                    { piece: "the brackets", means: "these are things you call, unlike `.length`" }
                ]
            },
            {
                code: 'console.log("Jolt".slice(0, 2));\nconsole.log("Jolt".includes("ol"));',
                output: "Jo\ntrue",
                note: "`slice` takes a piece out by position; `includes` answers a yes-or-no question.",
                parts: [
                    { piece: ".slice(0, 2)", means: "from position 0 up to but not including 2" },
                    { piece: ".includes( )", means: "is this text inside that text — true or false" }
                ]
            }
        ],
        notice: "A method is called with brackets. `.length` has none, because it is a count rather than an action.",
        steps: [
            {
                demand: "recall",
                ask: "Which method removes the spaces from both ends of some text?",
                choices: [
                    { text: ".trim()", correct: true },
                    { text: ".slice()", feedback: "That takes a piece out by position, wherever you ask for it." },
                    { text: ".toLowerCase()", feedback: "That changes letter case and leaves spaces alone." }
                ],
                confirm: "`.trim()` takes the ends off.",
                retry: {
                    demand: "recall",
                    ask: "And which one answers true or false?",
                    choices: [
                        { text: ".includes()", correct: true },
                        { text: ".toUpperCase()", feedback: "That hands back text, not an answer." }
                    ],
                    confirm: "`.includes()` asks a question."
                }
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'console.log("  Jolt  ".trim().length);',
                choices: [
                    { text: "4", correct: true },
                    { text: "8", feedback: "The trim happens first, so the spaces are gone before anything is counted." },
                    { text: "6", feedback: "`.trim()` removes the spaces at BOTH ends." }
                ],
                confirm: "Trimmed first, then counted.",
                aside: "Reading left to right is the same order it runs in.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: 'console.log("jolt".toUpperCase());',
                    choices: [
                        { text: "JOLT", correct: true },
                        { text: "jolt", feedback: "The method hands back the changed text — that is what is being logged." }
                    ],
                    confirm: "Every letter capitalised."
                }
            }
        ]
    },
    {
        concept: "template-literals",
        title: "Building text without the plus signs",
        why: "Joining with `+` gets unreadable fast, and there is a cleaner way to do the same thing.",
        teach: [
            {
                code: 'let name = "Tati";\nlet bays = 4;\nconsole.log(`${name} has ${bays} bays`);',
                output: "Tati has 4 bays",
                note: "Backticks instead of quotes, and each `${ }` is a hole a value drops into.",
                parts: [
                    { piece: "the backticks", means: "what makes this a template rather than ordinary text" },
                    { piece: "${name}", means: "the value held by that name, put here" },
                    { piece: "the spaces", means: "written where you want them, no joining needed" }
                ]
            },
            {
                code: 'let bays = 4;\nconsole.log(`Bays: ${bays + 1}`);',
                output: "Bays: 5",
                note: "Anything that produces a value can go in the hole, not just a name.",
                parts: [{ piece: "${bays + 1}", means: "worked out first, then dropped in" }]
            }
        ],
        notice: "Same result as joining with `+`, and far easier to read once there is more than one value.",
        steps: [
            {
                demand: "recognise",
                ask: "Which one is a template literal?",
                choices: [
                    { text: "`Hi ${name}`", correct: true },
                    { text: '"Hi " + name', feedback: "That joins with `+` — the same result, but not a template." },
                    { text: '"Hi ${name}"', feedback: "Ordinary quotes, so `${name}` is printed as written rather than filled in." }
                ],
                confirm: "Backticks are what make it a template.",
                retry: {
                    demand: "recognise",
                    ask: "Which part gets replaced by a value?",
                    code: "console.log(`Fuel: ${fuel}`);",
                    choices: [
                        { text: "${fuel}", correct: true },
                        { text: "Fuel:", feedback: "That is ordinary text inside the backticks and is printed as written." }
                    ],
                    confirm: "Only what is inside `${ }`."
                }
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'let name = "Tati";\nconsole.log("Hi ${name}");',
                choices: [
                    { text: "Hi ${name}", correct: true },
                    { text: "Hi Tati", feedback: "These are ordinary quotes, not backticks, so nothing is filled in." },
                    { text: "Hi", feedback: "The whole of what is inside the quotes is printed." }
                ],
                confirm: "Without backticks, `${ }` is just characters.",
                aside: "This is a real and very common typo — the fix is to swap the quotes for backticks.",
                retry: {
                    demand: "predict",
                    ask: "And with backticks?",
                    code: 'let name = "Tati";\nconsole.log(`Hi ${name}`);',
                    choices: [
                        { text: "Hi Tati", correct: true },
                        { text: "Hi ${name}", feedback: "Backticks make the hole real, so the value drops in." }
                    ],
                    confirm: "Backticks fill the hole."
                }
            }
        ]
    },
    {
        concept: "string-immutability",
        title: "Nothing you do changes the original",
        why: "This is the mistake behind a whole class of bugs: calling a method and expecting the text to have changed.",
        teach: [
            {
                code: 'let name = "tati";\nname.toUpperCase();\nconsole.log(name);',
                output: "tati",
                note: "The method ran and produced `TATI` — and nothing kept it, so the name still holds what it always held.",
                parts: [{ piece: "name.toUpperCase()", means: "hands back new text; does not change `name`" }]
            },
            {
                code: 'let name = "tati";\nlet shout = name.toUpperCase();\nconsole.log(name);\nconsole.log(shout);',
                output: "tati\nTATI",
                note: "Keeping the result is the whole fix. The original is still there, unchanged, which is usually what you want.",
                parts: [{ piece: "let shout =", means: "somewhere to put the new text" }]
            }
        ],
        notice: "String methods never edit. They hand back something new, and you have to catch it.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'let word = "  hi  ";\nword.trim();\nconsole.log(word.length);',
                choices: [
                    { text: "6", correct: true },
                    { text: "2", feedback: "`.trim()` handed back trimmed text, but nothing kept it, so `word` is unchanged." },
                    { text: "0", feedback: "The text is still exactly what it was." }
                ],
                confirm: "The result was thrown away, so nothing changed.",
                aside: "`word = word.trim()` is how you would actually keep it.",
                retry: {
                    demand: "predict",
                    ask: "And when the result is kept?",
                    code: 'let word = "  hi  ";\nword = word.trim();\nconsole.log(word.length);',
                    choices: [
                        { text: "2", correct: true },
                        { text: "6", feedback: "This time the trimmed text was stored back into `word`." }
                    ],
                    confirm: "Caught and kept."
                }
            }
        ]
    }
];

/* ----------------------------------------------------------------- LOOPS
 *
 * Six concepts. `for-of-for-in` is NOT among them -- it is about choosing
 * between arrays and objects, and both are topics away, so it moved to Objects.
 *
 * Everything here is taught over numbers and strings, which is all the learner
 * has. `littleJs` gained `for`, `while`, `break` and `continue` when the
 * curriculum reached this topic, which also made its step budget a real timeout
 * for the first time.
 */
export const LOOP_LESSONS: readonly Lesson[] = [
    {
        concept: "for-loop-anatomy",
        title: "The three parts of a for loop",
        why: "A for loop looks like a lot at once, and it is really just three small things on one line.",
        teach: [
            {
                code: "for (let i = 0; i < 3; i += 1) {\n  console.log(i);\n}",
                output: "0\n1\n2",
                note: "Three passes, and `i` was 0, then 1, then 2. The loop stopped when the condition stopped being true.",
                parts: [
                    { piece: "let i = 0", means: "the start — runs once, before anything else" },
                    { piece: "i < 3", means: "the condition — checked before every pass" },
                    { piece: "i += 1", means: "the step — runs after every pass" }
                ]
            },
            {
                code: "for (let i = 0; i < 0; i += 1) {\n  console.log(i);\n}",
                output: "",
                note: "Nothing printed. The condition is checked BEFORE the first pass, so a loop can run zero times.",
                parts: [{ piece: "i < 0", means: "false straight away, so the body never runs" }]
            }
        ],
        notice: "Start once, check before each pass, step after each pass. The count is how many times the condition held.",
        steps: [
            {
                demand: "recognise",
                ask: "Which part decides whether another pass happens?",
                code: "for (let i = 0; i < 5; i += 1) {\n  console.log(i);\n}",
                choices: [
                    { text: "i < 5", correct: true },
                    { text: "let i = 0", feedback: "That runs once at the start and never again." },
                    { text: "i += 1", feedback: "That runs after each pass. It changes `i`, but the condition is what is asked." }
                ],
                confirm: "The middle part is the condition.",
                aside: "Change it and you change how many passes happen — that is the whole of loop-conditions.",
                retry: {
                    demand: "recognise",
                    ask: "And which part runs only once?",
                    code: "for (let n = 1; n < 4; n += 1) {\n  console.log(n);\n}",
                    choices: [
                        { text: "let n = 1", correct: true },
                        { text: "n += 1", feedback: "That runs after every pass, not once." }
                    ],
                    confirm: "The start runs once."
                }
            },
            {
                demand: "predict",
                ask: "How many lines does this print?",
                code: "for (let i = 0; i < 4; i += 1) {\n  console.log(i);\n}",
                choices: [
                    { text: "4", correct: true },
                    { text: "5", feedback: "`i` is 0, 1, 2 and 3. At 4 the condition is false, so there is no fifth pass." },
                    { text: "3", feedback: "Counting starts at 0, so 0 through 3 is four passes." }
                ],
                confirm: "Zero through three — four passes.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: "for (let i = 1; i < 4; i += 1) {\n  console.log(i);\n}",
                    choices: [
                        { text: "3", correct: true },
                        { text: "4", feedback: "This one starts at 1, so it runs for 1, 2 and 3." }
                    ],
                    confirm: "Starting point matters as much as the condition."
                }
            }
        ]
    },
    {
        concept: "while-loops",
        title: "Repeating without counting",
        why: "Sometimes you do not know how many passes you need — only when to stop.",
        teach: [
            {
                code: "let n = 0;\nwhile (n < 3) {\n  console.log(n);\n  n += 1;\n}",
                output: "0\n1\n2",
                note: "Same result as a for loop, with the three parts spread out instead of gathered on one line.",
                parts: [
                    { piece: "let n = 0", means: "the start — now an ordinary line above the loop" },
                    { piece: "while (n < 3)", means: "the condition, checked before every pass" },
                    { piece: "n += 1", means: "the step — now your job, inside the body" }
                ]
            }
        ],
        notice: "A while loop gives you nowhere to put the step, so forgetting it is the classic way to make a loop that never ends.",
        steps: [
            {
                demand: "recognise",
                ask: "Which loop would you reach for when you do not know how many passes there will be?",
                choices: [
                    { text: "while", correct: true },
                    { text: "for", feedback: "A for loop gathers a counter and a bound in one line, which is most useful when you DO know the count." }
                ],
                confirm: "A while loop asks only when to stop.",
                retry: {
                    demand: "recognise",
                    ask: "And in a while loop, whose job is the step?",
                    choices: [
                        { text: "yours, inside the body", correct: true },
                        { text: "the loop does it", feedback: "A for loop has a slot for it. A while loop does not." }
                    ],
                    confirm: "Nothing steps it for you."
                }
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: "let n = 3;\nwhile (n < 3) {\n  console.log(n);\n  n += 1;\n}",
                choices: [
                    { text: "nothing", correct: true },
                    { text: "3", feedback: "The condition is checked BEFORE the first pass, and 3 is not less than 3." },
                    { text: "0 1 2", feedback: "`n` starts at 3 here, not at 0." }
                ],
                confirm: "Checked first, so zero passes.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: "let n = 1;\nwhile (n < 3) {\n  console.log(n);\n  n += 1;\n}",
                    choices: [
                        { text: "1 then 2", correct: true },
                        { text: "1 2 3", feedback: "At 3 the condition is false, so there is no pass for it." }
                    ],
                    confirm: "Two passes."
                }
            },
            {
                demand: "explain",
                ask: "Why does a while loop whose body never changes anything run forever?",
                choices: [
                    {
                        text: "The condition reads the same values every pass, so it can never become false",
                        correct: true
                    },
                    {
                        text: "Because while loops have no built-in limit on passes",
                        feedback: "True of for loops too — what stops either is the condition going false."
                    },
                    {
                        text: "Because the condition is only checked once at the start",
                        feedback: "It is checked before every pass. That is exactly why nothing changing means nothing stops."
                    }
                ],
                confirm: "Something inside has to move the condition towards false.",
                aside: "That is why the step is the first thing to look for when a loop hangs."
            }
        ]
    },
    {
        concept: "loop-conditions",
        title: "Covering everything exactly once",
        why: "Off-by-one is the commonest loop bug there is, and it comes straight from the condition.",
        teach: [
            {
                code: 'let word = "Jolt";\nfor (let i = 0; i < word.length; i += 1) {\n  console.log(word[i]);\n}',
                output: "J\no\nl\nt",
                note: "Length is 4 and the last position is 3, so `< length` covers every character and stops in the right place.",
                parts: [
                    { piece: "i < word.length", means: "less-than, because the last position is length minus one" },
                    { piece: "word[i]", means: "the character at the position this pass is on" }
                ]
            },
            {
                code: 'let word = "Jolt";\nfor (let i = 0; i <= word.length; i += 1) {\n  console.log(word[i]);\n}',
                output: "J\no\nl\nt",
                note: "`<=` asks for position 4, which does not exist. The first four are right and then it reaches past the end.",
                parts: [{ piece: "i <= word.length", means: "one pass too many — the off-by-one" }]
            }
        ],
        notice: "Positions run from 0 to length minus one, so the condition is `<` and not `<=`.",
        steps: [
            {
                demand: "predict",
                ask: "How many passes does this make?",
                code: 'let word = "Jolt";\nfor (let i = 0; i < word.length; i += 1) {\n  console.log(i);\n}',
                choices: [
                    { text: "4", correct: true },
                    { text: "5", feedback: "Length is 4, and `<` stops before 4, so the passes are 0, 1, 2 and 3." },
                    { text: "3", feedback: "Starting at 0 and stopping before 4 is four passes, not three." }
                ],
                confirm: "One pass per character.",
                retry: {
                    demand: "predict",
                    ask: "And with `<=`?",
                    code: 'let word = "Jolt";\nfor (let i = 0; i <= word.length; i += 1) {\n  console.log(i);\n}',
                    choices: [
                        { text: "5", correct: true },
                        { text: "4", feedback: "`<=` lets 4 through as well, so there is one extra pass." }
                    ],
                    confirm: "One too many — and position 4 is past the end."
                }
            }
        ]
    },
    {
        concept: "accumulators",
        title: "Building something up",
        why: "Totalling, counting and collecting are all the same shape: one variable outside, updated inside.",
        teach: [
            {
                code: "let total = 0;\nfor (let i = 1; i < 5; i += 1) {\n  total += i;\n}\nconsole.log(total);",
                output: "10",
                note: "`total` is declared OUTSIDE so it survives every pass. Inside, each pass adds to what is already there.",
                parts: [
                    { piece: "let total = 0", means: "outside the loop — it has to outlive each pass" },
                    { piece: "total += i", means: "inside — add this pass's value to what is already there" }
                ]
            },
            {
                code: 'let word = "Jolt";\nlet backwards = "";\nfor (let i = 0; i < word.length; i += 1) {\n  backwards = word[i] + backwards;\n}\nconsole.log(backwards);',
                output: "tloJ",
                note: "The same shape builds text rather than a number. Putting each character in FRONT is what reverses it.",
                parts: [{ piece: 'let backwards = ""', means: "the starting point — empty, like 0 is for a total" }]
            }
        ],
        notice: "Declare it outside the loop. Declared inside, it would start over on every pass.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: "let total = 0;\nfor (let i = 1; i < 4; i += 1) {\n  total += i;\n}\nconsole.log(total);",
                choices: [
                    { text: "6", correct: true },
                    { text: "3", feedback: "It adds 1, then 2, then 3 — the total, not the last value." },
                    { text: "0", feedback: "`total` is outside the loop, so what each pass adds stays." }
                ],
                confirm: "One plus two plus three.",
                aside: "Move the declaration inside the loop and it resets every pass — a classic bug.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: "let count = 0;\nfor (let i = 0; i < 5; i += 1) {\n  count += 1;\n}\nconsole.log(count);",
                    choices: [
                        { text: "5", correct: true },
                        { text: "10", feedback: "It adds one per pass, and there are five passes." }
                    ],
                    confirm: "Counting is the same shape as totalling."
                }
            }
        ]
    },
    {
        concept: "break-continue",
        title: "Leaving early and skipping a pass",
        why: "Searching usually means stopping as soon as you have found the thing.",
        teach: [
            {
                code: "for (let i = 0; i < 10; i += 1) {\n  if (i === 3) {\n    break;\n  }\n  console.log(i);\n}",
                output: "0\n1\n2",
                note: "`break` leaves the loop entirely. The condition would have allowed seven more passes and none of them happened.",
                parts: [{ piece: "break", means: "stop the loop now, and carry on after it" }]
            },
            {
                code: "for (let i = 0; i < 4; i += 1) {\n  if (i === 1) {\n    continue;\n  }\n  console.log(i);\n}",
                output: "0\n2\n3",
                note: "`continue` skips the rest of THIS pass only. The loop carries on with the next one.",
                parts: [{ piece: "continue", means: "skip to the next pass" }]
            }
        ],
        notice: "break ends the loop; continue ends the pass. One of them is far more drastic than the other.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: "for (let i = 0; i < 5; i += 1) {\n  if (i === 2) {\n    break;\n  }\n  console.log(i);\n}",
                choices: [
                    { text: "0 then 1", correct: true },
                    { text: "0 1 3 4", feedback: "That would be `continue`. `break` ends the loop rather than skipping a pass." },
                    { text: "0 1 2 3 4", feedback: "The break happens before the log on the pass where `i` is 2." }
                ],
                confirm: "It left the loop at 2.",
                retry: {
                    demand: "predict",
                    ask: "And with continue instead?",
                    code: "for (let i = 0; i < 4; i += 1) {\n  if (i === 2) {\n    continue;\n  }\n  console.log(i);\n}",
                    choices: [
                        { text: "0 1 3", correct: true },
                        { text: "0 1", feedback: "`continue` skips only that one pass; the loop keeps going." }
                    ],
                    confirm: "One pass skipped, the rest ran."
                }
            },
            {
                demand: "explain",
                ask: "Why would you use break rather than letting the loop finish?",
                choices: [
                    {
                        text: "Once the answer is found, the remaining passes cannot change it",
                        correct: true
                    },
                    {
                        text: "Because a loop is not allowed to run to completion after an if",
                        feedback: "It is perfectly allowed. break is a choice, not a requirement."
                    },
                    {
                        text: "Because break makes the loop condition false",
                        feedback: "It does not touch the condition — it leaves regardless of what the condition says."
                    }
                ],
                confirm: "Stopping early is about the work being done, not about the loop being broken."
            }
        ]
    },
    {
        concept: "nested-loops",
        title: "A loop inside a loop",
        why: "Pairs, grids and comparisons all need one loop to run completely inside another.",
        teach: [
            {
                code: 'for (let a = 0; a < 2; a += 1) {\n  for (let b = 0; b < 3; b += 1) {\n    console.log(a + "-" + b);\n  }\n}',
                output: "0-0\n0-1\n0-2\n1-0\n1-1\n1-2",
                note: "The inner loop runs all the way through on EVERY pass of the outer one. Two passes outside, three inside, six lines.",
                parts: [
                    { piece: "the outer loop", means: "runs twice" },
                    { piece: "the inner loop", means: "runs three times, for each of those" }
                ]
            }
        ],
        notice: "Multiply them. Two outer passes and three inner passes is six times through the inner body.",
        steps: [
            {
                demand: "predict",
                ask: "How many lines does this print?",
                code: 'for (let a = 0; a < 3; a += 1) {\n  for (let b = 0; b < 4; b += 1) {\n    console.log(a + "-" + b);\n  }\n}',
                choices: [
                    { text: "12", correct: true },
                    { text: "7", feedback: "The inner loop runs fully for each outer pass, so they multiply rather than add." },
                    { text: "4", feedback: "That is one pass of the inner loop. It happens three times." }
                ],
                confirm: "Three times four.",
                aside: "This is why a nested loop over something large gets slow so quickly.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: 'for (let a = 0; a < 2; a += 1) {\n  for (let b = 0; b < 2; b += 1) {\n    console.log("x");\n  }\n}',
                    choices: [
                        { text: "4", correct: true },
                        { text: "2", feedback: "Two outer passes, each running two inner passes." }
                    ],
                    confirm: "Two times two."
                }
            }
        ]
    }
];

/* ------------------------------------------------------------- FUNCTIONS
 *
 * Six concepts. `default-rest-params` is NOT among them -- rest gathers extra
 * arguments INTO AN ARRAY, and arrays are two topics later, so it moved to
 * Arrays beside `array-copy-spread`, which teaches the same three dots the
 * other way round.
 *
 * `littleJs` gained definitions, calls, parameters, `return`, arrows and
 * functions-as-values here -- and, found along the way, negative numbers.
 */
export const FUNCTION_LESSONS: readonly Lesson[] = [
    {
        concept: "function-declaration",
        title: "Naming a piece of work",
        why: "A function lets you write something once and run it whenever you need it.",
        teach: [
            {
                code: 'function greet() {\n  console.log("Hello");\n}\n\ngreet();',
                output: "Hello",
                note: "Two separate things: the definition stores the instructions, and the call runs them.",
                parts: [
                    { piece: "function greet()", means: "the definition — a name for these instructions" },
                    { piece: "{ }", means: "the body: what runs when it is called" },
                    { piece: "greet()", means: "the call — the brackets are what make it run" }
                ]
            },
            {
                code: 'function greet() {\n  console.log("Hello");\n}',
                output: "",
                note: "Nothing printed. Defining a function never runs it — something has to call it.",
                parts: [{ piece: "no call", means: "so the body never runs" }]
            }
        ],
        notice: "Defining stores the work. Calling does the work. The brackets are the difference.",
        steps: [
            {
                demand: "recognise",
                ask: "Which line runs the function?",
                code: 'function greet() {\n  console.log("Hello");\n}\n\ngreet();',
                choices: [
                    { text: "greet();", correct: true },
                    { text: "function greet()", feedback: "That defines it. Defining never runs anything." },
                    { text: 'console.log("Hello")', feedback: "That is inside the body — it runs only when the function is called." }
                ],
                confirm: "The brackets at the call are what run it.",
                retry: {
                    demand: "recognise",
                    ask: "And which part is the body?",
                    code: "function go() {\n  console.log(1);\n}",
                    choices: [
                        { text: "the part between { and }", correct: true },
                        { text: "function go()", feedback: "That is the header — it names the function and lists its parameters." }
                    ],
                    confirm: "The braces hold the work."
                }
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'function greet() {\n  console.log("Hello");\n}',
                choices: [
                    { text: "nothing", correct: true },
                    { text: "Hello", feedback: "Nothing called it. A definition on its own never runs." },
                    { text: "an error", feedback: "Defining a function you never call is perfectly fine." }
                ],
                confirm: "Defined, never called, so nothing happened.",
                aside: "Forgetting the call is one of the commonest reasons code seems to do nothing.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: 'function greet() {\n  console.log("Hello");\n}\ngreet();\ngreet();',
                    choices: [
                        { text: "Hello twice", correct: true },
                        { text: "Hello once", feedback: "It was called twice, and a function runs every time it is called." }
                    ],
                    confirm: "Once per call."
                }
            }
        ]
    },
    {
        concept: "parameters-arguments",
        title: "Passing values in",
        why: "A function that always does exactly the same thing is rarely the one you want.",
        teach: [
            {
                code: 'function greet(name) {\n  console.log("Hello, " + name);\n}\n\ngreet("Tati");\ngreet("Sam");',
                output: "Hello, Tati\nHello, Sam",
                note: "One definition, two calls, two results. `name` stood for a different value each time.",
                parts: [
                    { piece: "name", means: "the parameter — a name in the definition, with no value of its own" },
                    { piece: '"Tati"', means: "the argument — the actual value passed at the call" }
                ]
            }
        ],
        notice: "Parameters are names in the definition. Arguments are the values handed over at the call.",
        steps: [
            {
                demand: "recognise",
                ask: "Which one is the argument?",
                code: 'function greet(name) {\n  console.log(name);\n}\n\ngreet("Tati");',
                choices: [
                    { text: '"Tati"', correct: true },
                    { text: "name", feedback: "That is the parameter — the name inside the definition." },
                    { text: "greet", feedback: "That is the function itself." }
                ],
                confirm: "The value at the call is the argument.",
                retry: {
                    demand: "recognise",
                    ask: "And which is the parameter?",
                    code: "function double(n) {\n  return n * 2;\n}",
                    choices: [
                        { text: "n", correct: true },
                        { text: "2", feedback: "That is just a number inside the body." }
                    ],
                    confirm: "The name in the header."
                }
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: "function f(a) {\n  a = 99;\n  return a;\n}\n\nlet a = 1;\nconsole.log(f(a));\nconsole.log(a);",
                choices: [
                    { text: "99 then 1", correct: true },
                    { text: "99 then 99", feedback: "The parameter is its own name inside the function. Changing it does not reach back out." },
                    { text: "1 then 1", feedback: "Inside the function `a` really was set to 99, and that is what came back." }
                ],
                confirm: "The outer name was never touched.",
                aside: "They happen to share a name here, which is exactly what makes this worth checking.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: 'function shout(word) {\n  return word.toUpperCase();\n}\nconsole.log(shout("hi"));',
                    choices: [
                        { text: "HI", correct: true },
                        { text: "hi", feedback: "The method handed back new text and that is what was returned." }
                    ],
                    confirm: "The argument went in, the result came back."
                }
            }
        ]
    },
    {
        concept: "return-values",
        title: "Getting something back",
        why: "Printing shows you a value. Returning gives it to the code that asked.",
        teach: [
            {
                code: "function add(a, b) {\n  return a + b;\n}\n\nlet total = add(2, 3);\nconsole.log(total);",
                output: "5",
                note: "`return` hands the value back to whoever called, which is why it can be stored.",
                parts: [
                    { piece: "return a + b", means: "work it out, then hand it back" },
                    { piece: "let total = add(2, 3)", means: "the call is replaced by what came back" }
                ]
            },
            {
                code: 'function add(a, b) {\n  console.log(a + b);\n}\n\nlet total = add(2, 3);\nconsole.log(total);',
                output: "5\nundefined",
                note: "This one PRINTS instead of returning, so there was nothing to store. A function with no return gives undefined.",
                parts: [{ piece: "undefined", means: "what you get when nothing was returned" }]
            }
        ],
        notice: "Printing and returning are different things. Only one of them gives the caller a value.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: "function f() {\n  let x = 1;\n}\nconsole.log(f());",
                choices: [
                    { text: "undefined", correct: true },
                    { text: "1", feedback: "`x` was never returned — it only existed inside the function." },
                    { text: "nothing", feedback: "console.log always prints something; what it was given here was undefined." }
                ],
                confirm: "No return, so undefined.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: 'function f() {\n  return 1;\n  console.log("after");\n}\nconsole.log(f());',
                    choices: [
                        { text: "1", correct: true },
                        { text: "after then 1", feedback: "`return` ends the function immediately — nothing below it runs." }
                    ],
                    confirm: "Return ends the function there and then."
                }
            },
            {
                demand: "explain",
                ask: "Why can a returned value be stored in a variable when a printed one cannot?",
                choices: [
                    {
                        text: "The call is replaced by whatever was returned, so there is a value where the call was",
                        correct: true
                    },
                    {
                        text: "Because console.log sends its value somewhere that cannot be read back",
                        feedback: "Closer to a description of the symptom. The reason is what the CALL turns into."
                    },
                    {
                        text: "Because printing happens after the function finishes",
                        feedback: "It happens during. Timing is not what makes the difference."
                    }
                ],
                confirm: "A call is an expression, and return is what decides its value.",
                aside: "That is why `let x = f();` works at all — `f()` collapses to a value like any other expression."
            }
        ]
    },
    {
        concept: "guard-clauses",
        title: "Dealing with the exception first",
        why: "Handling the awkward case up front keeps the main path flat and readable.",
        teach: [
            {
                code: 'function describe(n) {\n  if (n < 0) {\n    return "negative";\n  }\n\n  return "ok";\n}\n\nconsole.log(describe(-5));\nconsole.log(describe(5));',
                output: "negative\nok",
                note: "The first return ends the function, so the line below it only runs when the guard did not fire.",
                parts: [
                    { piece: "if (n < 0) { return ... }", means: "the guard — handle the exception and leave" },
                    { piece: 'return "ok"', means: "the happy path, not nested inside anything" }
                ]
            }
        ],
        notice: "A guard returns early so the rest of the function does not have to be wrapped in an else.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'function f(n) {\n  if (n < 0) {\n    return "neg";\n  }\n  return "pos";\n}\nconsole.log(f(-1));',
                choices: [
                    { text: "neg", correct: true },
                    { text: "pos", feedback: "The guard fired first, and a return ends the function immediately." },
                    { text: "neg then pos", feedback: "A function returns once. The second line never ran." }
                ],
                confirm: "The guard caught it and left.",
                retry: {
                    demand: "predict",
                    ask: "And when the guard does not fire?",
                    code: 'function f(n) {\n  if (n < 0) {\n    return "neg";\n  }\n  return "pos";\n}\nconsole.log(f(3));',
                    choices: [
                        { text: "pos", correct: true },
                        { text: "neg", feedback: "3 is not less than 0, so the guard was skipped." }
                    ],
                    confirm: "Straight past the guard to the happy path."
                }
            },
            {
                demand: "explain",
                ask: "Why does a guard clause remove the need for an else?",
                choices: [
                    {
                        text: "The early return ends the function, so anything below it is already the other case",
                        correct: true
                    },
                    {
                        text: "Because an if without an else is faster to run",
                        feedback: "Speed is not the reason, and it would not be worth the change if it were."
                    },
                    {
                        text: "Because else can only be used once in a function",
                        feedback: "It can be used as often as you like. The point is not needing it."
                    }
                ],
                confirm: "Leaving early is what makes the rest unconditional."
            }
        ]
    },
    {
        concept: "arrow-functions",
        title: "A shorter way to write one",
        why: "Most modern JavaScript writes small functions this way, so you need to be able to read it.",
        teach: [
            {
                code: "const double = (n) => n * 2;\n\nconsole.log(double(4));",
                output: "8",
                note: "No `function`, no braces, and no `return` — with a single expression, the value comes back automatically.",
                parts: [
                    { piece: "(n)", means: "the parameters, exactly as before" },
                    { piece: "=>", means: "the arrow, where `function` used to be" },
                    { piece: "n * 2", means: "the body — one expression, returned without saying so" }
                ]
            },
            {
                code: "const double = (n) => {\n  return n * 2;\n};\n\nconsole.log(double(4));",
                output: "8",
                note: "With braces you are back to an ordinary body, and then you DO have to write `return`.",
                parts: [{ piece: "{ return n * 2; }", means: "braces mean a body, and a body needs an explicit return" }]
            }
        ],
        notice: "No braces means the expression is returned for you. Braces mean you write the return yourself.",
        steps: [
            {
                demand: "recognise",
                ask: "Which of these returns a value?",
                choices: [
                    { text: "const f = (n) => n + 1;", correct: true },
                    { text: "const f = (n) => { n + 1; };", feedback: "Braces mean an ordinary body, and this one never says `return` — so it gives undefined." }
                ],
                confirm: "Without braces, the expression is handed back for you.",
                retry: {
                    demand: "recognise",
                    ask: "And which one needs the word return?",
                    choices: [
                        { text: "const f = (n) => { ... };", correct: true },
                        { text: "const f = (n) => n;", feedback: "That one returns its expression automatically." }
                    ],
                    confirm: "Braces, so an explicit return."
                }
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: "const triple = (n) => n * 3;\nconsole.log(triple(2));",
                choices: [
                    { text: "6", correct: true },
                    { text: "undefined", feedback: "With no braces the expression is returned automatically." },
                    { text: "n * 3", feedback: "The body is worked out with `n` standing for 2." }
                ],
                confirm: "Implicit return.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: "const triple = (n) => { n * 3; };\nconsole.log(triple(2));",
                    choices: [
                        { text: "undefined", correct: true },
                        { text: "6", feedback: "The braces make it a body, and nothing in it returns." }
                    ],
                    confirm: "Braces without a return give undefined."
                }
            }
        ]
    },
    {
        concept: "functions-as-values",
        title: "A function is a value too",
        why: "Passing a function somewhere else is how callbacks, array methods and event handlers all work.",
        teach: [
            {
                code: 'function shout() {\n  return "HI";\n}\n\nconsole.log(shout);\nconsole.log(shout());',
                output: "[function shout]\nHI",
                note: "Without brackets you get the function itself. With them you get what it produced.",
                parts: [
                    { piece: "shout", means: "the function, as a value you could store or pass on" },
                    { piece: "shout()", means: "the result of running it" }
                ]
            },
            {
                code: "function twice(fn) {\n  return fn() + fn();\n}\n\nfunction one() {\n  return 1;\n}\n\nconsole.log(twice(one));",
                output: "2",
                note: "`one` was handed over without being called. `twice` decided when to call it — and called it twice.",
                parts: [
                    { piece: "twice(one)", means: "passing the function, not its result" },
                    { piece: "fn()", means: "the receiving function choosing when to run it" }
                ]
            }
        ],
        notice: "The brackets are the whole difference. Passing `f` gives the function; passing `f()` gives its result.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'function shout() {\n  return "HI";\n}\nconsole.log(shout);',
                choices: [
                    { text: "the function itself, not HI", correct: true },
                    { text: "HI", feedback: "There are no brackets, so it was never called." },
                    { text: "an error", feedback: "A function is a perfectly ordinary value to pass around." }
                ],
                confirm: "No brackets, no call.",
                retry: {
                    demand: "predict",
                    ask: "And with brackets?",
                    code: 'function shout() {\n  return "HI";\n}\nconsole.log(shout());',
                    choices: [
                        { text: "HI", correct: true },
                        { text: "the function itself", feedback: "The brackets ran it, so what is logged is what it returned." }
                    ],
                    confirm: "Brackets run it."
                }
            },
            {
                demand: "diagnose",
                ask: "This should run the function twice and gives an error instead. Which line is the cause?",
                code: "function twice(fn) {\n  return fn() + fn();\n}\nfunction one() {\n  return 1;\n}\nconsole.log(twice(one()));",
                choices: [
                    { text: "console.log(twice(one()));", correct: true },
                    { text: "return fn() + fn();", feedback: "That is right — it calls whatever it was given, which is what twice is for." },
                    { text: "function one() {", feedback: "The definition is fine — it returns 1, which is exactly what twice expects to receive." }
                ],
                confirm: "`one()` passed the RESULT. `twice` needs the function itself.",
                aside: "Dropping the brackets at the call site is the fix — `twice(one)`."
            },
            {
                demand: "explain",
                ask: "Why does passing a function let the receiving code decide when it runs?",
                choices: [
                    {
                        text: "Nothing has run yet — only the instructions were handed over",
                        correct: true
                    },
                    {
                        text: "Because functions are always run last in JavaScript",
                        feedback: "There is no such rule. What matters is that the brackets were not used."
                    },
                    {
                        text: "Because the function is copied into the other function",
                        feedback: "Copying or not, the point is that it has not been called."
                    }
                ],
                confirm: "Handing over instructions is not the same as following them."
            }
        ]
    }
];

/*
 * SCOPE.
 *
 * The topic that made littleJs tell the truth. Until this point the
 * interpreter kept one flat table of variables and was therefore wrong about
 * all five of these concepts at once -- most seriously, a function could read
 * the locals of whoever called it. Every example below has been run.
 */
export const SCOPE_LESSONS: readonly Lesson[] = [
    {
        concept: "block-vs-function-scope",
        title: "Where a variable lives",
        why: "Knowing where a name ends is what stops two parts of a program quietly fighting over it.",
        teach: [
            {
                code: "let a = 1;\n{\n  let b = 2;\n  console.log(a);\n}\nconsole.log(b);",
                output: "1\nthen an error",
                note: "Inside the braces you can see out. Outside them you cannot see in.",
                parts: [
                    { piece: "{ }", means: "a scope — everything `let` inside it ends here" },
                    { piece: "console.log(a)", means: "fine: `a` was declared further out" },
                    { piece: "console.log(b)", means: "an error: `b` ended at the `}`" }
                ]
            },
            {
                code: "if (true) {\n  var c = 3;\n}\nconsole.log(c);",
                output: "3",
                note: "`var` is the exception, and it is why `let` exists. Braces do not stop it.",
                parts: [{ piece: "var", means: "belongs to the whole function, not to the block" }]
            }
        ],
        notice: "`let` ends at its closing brace. `var` ignores braces completely.",
        steps: [
            {
                demand: "recognise",
                ask: "Which names can still be read on the last line?",
                code: "let a = 1;\nif (true) {\n  let b = 2;\n  var c = 3;\n}\nconsole.log(a);",
                choices: [
                    { text: "a and c", correct: true },
                    { text: "a, b and c", feedback: "`b` was declared with `let` inside the braces, so it ended there." },
                    { text: "a only", feedback: "`var c` is not stopped by braces — it is still readable." }
                ],
                confirm: "`let` stops at the brace; `var` does not.",
                retry: {
                    demand: "recognise",
                    ask: "Simpler: which one survives the block?",
                    code: "{\n  let x = 1;\n  var y = 2;\n}",
                    choices: [
                        { text: "y", correct: true },
                        { text: "x", feedback: "`let` belongs to the braces it was written in." }
                    ],
                    confirm: "`var` escapes the block."
                }
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let a = 1;\n{\n  let b = 2;\n}\nconsole.log(b);",
                choices: [
                    { text: "an error", correct: true },
                    { text: "2", feedback: "`b` ended at the `}`. There is nothing to print by that line." },
                    { text: "undefined", feedback: "A name that does not exist is an error, not `undefined`." }
                ],
                confirm: "The block was `b`'s whole life.",
                aside: "Braces on their own are a scope. No `if` or `for` is needed to make one."
            },
            {
                demand: "explain",
                ask: "Why does a `let` inside `{ }` disappear at the closing brace?",
                choices: [
                    { text: "The block is its whole lifetime — it begins when the block runs and ends when the block does", correct: true },
                    { text: "The braces hide it from the lines above", feedback: "Not hidden — ended. Hiding would mean it still existed somewhere." },
                    { text: "A variable is removed once it has been used", feedback: "It can be read as often as you like inside the block." }
                ],
                confirm: "Bounded, not hidden."
            }
        ]
    },
    {
        concept: "hoisting-tdz",
        title: "Using a name too early",
        why: "Two kinds of declaration fail in two different ways, and the messages only make sense once you know why.",
        teach: [
            {
                code: "console.log(n);\nvar n = 5;",
                output: "undefined",
                note: "The NAME arrives at the top of the function. The VALUE arrives on its own line.",
                parts: [
                    { piece: "var n", means: "exists from the start, holding nothing" },
                    { piece: "= 5", means: "happens later, when this line runs" }
                ]
            },
            {
                code: "console.log(n);\nlet n = 5;",
                output: "an error",
                note: "`let` reserves the name too — it just refuses to be read before its line.",
                parts: [{ piece: "let n", means: "spoken for from the top, unreadable until its line: the dead zone" }]
            }
        ],
        notice: "Both names exist early. `var` holds `undefined`; `let` refuses to answer at all.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: "console.log(n);\nvar n = 5;",
                choices: [
                    { text: "undefined", correct: true },
                    { text: "5", feedback: "The value is set on the second line, which has not run yet." },
                    { text: "an error", feedback: "With `var` the name already exists — it is just empty." }
                ],
                confirm: "Name early, value late.",
                retry: {
                    demand: "predict",
                    ask: "And with the lines the other way round?",
                    code: "var n = 5;\nconsole.log(n);",
                    choices: [
                        { text: "5", correct: true },
                        { text: "undefined", feedback: "The value was set before the log this time." }
                    ],
                    confirm: "Order is the whole question here."
                }
            },
            {
                demand: "diagnose",
                ask: "This should print 5 and fails. Which line is the cause?",
                code: "console.log(n);\nlet n = 5;",
                choices: [
                    { text: "console.log(n);", correct: true },
                    { text: "let n = 5;", feedback: "The declaration is fine. Reading it before that line is what fails." },
                    { text: "nothing — it works", feedback: "Run it and you get an error about `n` being declared further down." }
                ],
                confirm: "Read too early."
            },
            {
                demand: "explain",
                ask: "Why does `var n` give `undefined` before its line while `let n` errors?",
                choices: [
                    { text: "Both names exist from the start; `var` already holds `undefined`, and `let` refuses to be read until its line runs", correct: true },
                    { text: "`let` is not hoisted and `var` is", feedback: "`let` IS hoisted. That is why it does not fall through to an outer `n` of the same name." },
                    { text: "`var` is older and JavaScript is more forgiving about it", feedback: "Age has nothing to do with it — the two reserve the name in different states." }
                ],
                confirm: "Both reserved. Only one is readable.",
                aside: "\"let is not hoisted\" is the usual explanation and it is wrong. The name is reserved — it just will not answer yet."
            }
        ]
    },
    {
        concept: "shadowing",
        title: "Two names, one word",
        why: "When the same word means two different variables, you need to know which one a line is talking to.",
        teach: [
            {
                code: 'let name = "outer";\nfunction f() {\n  let name = "inner";\n  console.log(name);\n}\nf();\nconsole.log(name);',
                output: "inner\nouter",
                note: "Two separate variables. The inner one wins inside `f`, and ends with it.",
                parts: [
                    { piece: "let name (inside)", means: "a NEW variable — not a change to the outer one" },
                    { piece: "the last line", means: "back outside, where the outer `name` was never touched" }
                ]
            }
        ],
        notice: "An inner `let` of the same name is a second variable, not a reassignment.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'let name = "outer";\nfunction f() {\n  let name = "inner";\n  console.log(name);\n}\nf();\nconsole.log(name);',
                choices: [
                    { text: "inner then outer", correct: true },
                    { text: "inner then inner", feedback: "The inner `name` ended with the function. The outer one never changed." },
                    { text: "outer then outer", feedback: "Inside `f` the inner `name` is the only one in reach." }
                ],
                confirm: "Two variables, one word.",
                retry: {
                    demand: "predict",
                    ask: "And without the inner `let`?",
                    code: 'let name = "outer";\nfunction f() {\n  name = "inner";\n}\nf();\nconsole.log(name);',
                    choices: [
                        { text: "inner", correct: true },
                        { text: "outer", feedback: "With no `let` there is no second variable — that line changed the outer one." }
                    ],
                    confirm: "No `let`, no new variable."
                }
            },
            {
                demand: "diagnose",
                ask: "This should add 1 to the total and fails. Which line is the cause?",
                code: "let total = 0;\nfunction bump() {\n  let total = total + 1;\n}\nbump();",
                choices: [
                    { text: "let total = total + 1;", correct: true },
                    { text: "let total = 0;", feedback: "The outer total is fine. The problem is the line that declares a second one." },
                    { text: "bump();", feedback: "Calling it is correct — what it does when called is not." }
                ],
                confirm: "It shadowed the variable it was trying to read.",
                aside: "The `total` on the right of the `=` is the NEW one, which has no value yet. Dropping `let` fixes it."
            }
        ]
    },
    {
        concept: "closures",
        title: "A function that remembers",
        why: "A function carries the variables it was written beside, and keeps them after everything around it has finished.",
        teach: [
            {
                code: "function makeCounter() {\n  let n = 0;\n  return () => {\n    n = n + 1;\n    return n;\n  };\n}\nconst next = makeCounter();\nconsole.log(next());\nconsole.log(next());",
                output: "1\n2",
                note: "`makeCounter` finished long ago. `n` did not.",
                parts: [
                    { piece: "let n = 0", means: "written inside, so the returned function can see it" },
                    { piece: "return () => ...", means: "hands back the function, with `n` still attached" },
                    { piece: "next()", means: "carries on from where the last call left `n`" }
                ]
            },
            {
                code: "function makeCounter() {\n  let n = 0;\n  return () => {\n    n = n + 1;\n    return n;\n  };\n}\nconst a = makeCounter();\nconst b = makeCounter();\nconsole.log(a());\nconsole.log(b());",
                output: "1\n1",
                note: "Each call to the factory made a fresh `n`, so the two counters are strangers.",
                parts: [{ piece: "two calls", means: "two separate `n`s" }]
            }
        ],
        notice: "The function kept the VARIABLE, not a copy of its value.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: "function makeCounter() {\n  let n = 0;\n  return () => {\n    n = n + 1;\n    return n;\n  };\n}\nconst next = makeCounter();\nconsole.log(next());\nconsole.log(next());",
                choices: [
                    { text: "1 then 2", correct: true },
                    { text: "1 then 1", feedback: "`n` is kept between calls, so the second call starts from 1." },
                    { text: "an error", feedback: "`n` is still reachable through the returned function." }
                ],
                confirm: "The variable outlived the call that made it.",
                retry: {
                    demand: "predict",
                    ask: "Simpler: what does this print?",
                    code: "function adder(a) {\n  return (b) => a + b;\n}\nconst add5 = adder(5);\nconsole.log(add5(3));",
                    choices: [
                        { text: "8", correct: true },
                        { text: "an error", feedback: "`a` is still there — the returned function captured it." }
                    ],
                    confirm: "The 5 came along with the function."
                }
            },
            {
                demand: "diagnose",
                ask: "Each counter should count on its own. Which line is the cause?",
                code: "let n = 0;\nfunction makeCounter() {\n  return () => {\n    n = n + 1;\n    return n;\n  };\n}\nconst a = makeCounter();\nconst b = makeCounter();\nconsole.log(a());\nconsole.log(b());",
                choices: [
                    { text: "let n = 0;", correct: true },
                    { text: "const b = makeCounter();", feedback: "Making a second counter is the intent — the problem is what it shares." },
                    { text: "return () => {", feedback: "Returning the function is right. Where its variable lives is not." }
                ],
                confirm: "One `n` outside, shared by both.",
                aside: "Move `let n = 0;` inside the factory and each call gets its own."
            },
            {
                demand: "explain",
                ask: "Why can a function read a variable after the function that created it has finished?",
                choices: [
                    { text: "It captured the variable itself, not a copy of its value", correct: true },
                    { text: "The outer function keeps running quietly in the background", feedback: "It really has finished. Nothing of it is still running." },
                    { text: "The value was copied in when the function was made", feedback: "A copy could not change — and a counter plainly does." }
                ],
                confirm: "The variable came along, not its value."
            }
        ]
    },
    {
        concept: "loop-variable-capture",
        title: "What the loop left behind",
        why: "Functions made inside a loop are the place `let` and `var` differ most, and the bug is famously confusing.",
        teach: [
            {
                code: "let show = 0;\nfor (var i = 0; i < 3; i = i + 1) {\n  if (i === 0) {\n    show = () => i;\n  }\n}\nconsole.log(show());",
                output: "3",
                note: "Made on the first pass, run after the loop — and `var` gave all three passes one `i`.",
                parts: [
                    { piece: "var i", means: "ONE variable for the whole loop" },
                    { piece: "() => i", means: "captures that one variable, not the value it held then" },
                    { piece: "show()", means: "runs after the loop, when `i` has reached 3" }
                ]
            },
            {
                code: "let show = 0;\nfor (let i = 0; i < 3; i = i + 1) {\n  if (i === 0) {\n    show = () => i;\n  }\n}\nconsole.log(show());",
                output: "0",
                note: "One word changed. `let` gives every pass its own `i`, so the function kept the first pass's.",
                parts: [{ piece: "let i", means: "a fresh `i` on every pass — three in total" }]
            }
        ],
        notice: "`var`: one variable, shared. `let`: one per pass.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let show = 0;\nfor (var i = 0; i < 3; i = i + 1) {\n  if (i === 0) {\n    show = () => i;\n  }\n}\nconsole.log(show());",
                choices: [
                    { text: "3", correct: true },
                    { text: "0", feedback: "That is what `let` would give. `var` leaves one shared `i`, counted up to 3." },
                    { text: "an error", feedback: "`i` is still perfectly readable after the loop — that is the problem." }
                ],
                confirm: "One `i`, and the loop finished with it at 3.",
                retry: {
                    demand: "predict",
                    ask: "And with `let` instead?",
                    code: "let show = 0;\nfor (let i = 0; i < 3; i = i + 1) {\n  if (i === 0) {\n    show = () => i;\n  }\n}\nconsole.log(show());",
                    choices: [
                        { text: "0", correct: true },
                        { text: "3", feedback: "`let` made a separate `i` for each pass, and this one captured the first." }
                    ],
                    confirm: "A fresh binding per pass."
                }
            },
            {
                demand: "diagnose",
                ask: "This should print 0 and prints 3. Which line is the cause?",
                code: "let show = 0;\nfor (var i = 0; i < 3; i = i + 1) {\n  if (i === 0) {\n    show = () => i;\n  }\n}\nconsole.log(show());",
                choices: [
                    { text: "for (var i = 0; i < 3; i = i + 1) {", correct: true },
                    { text: "show = () => i;", feedback: "Capturing `i` is the intent. Which `i` there is to capture is decided in the loop head." },
                    { text: "console.log(show());", feedback: "Running it afterwards is the point of the example." }
                ],
                confirm: "The loop head decides how many `i`s exist."
            },
            {
                demand: "explain",
                ask: "Why does swapping `var` for `let` change what the captured function sees?",
                choices: [
                    { text: "`let` gives each pass its own binding, so the function captured that pass's value", correct: true },
                    { text: "`let` copies the value into the function as it is made", feedback: "No copying happens — a closure keeps the variable. There are simply more variables." },
                    { text: "`let` stops the loop variable from changing", feedback: "It changes on every pass either way. What differs is how many of it there are." }
                ],
                confirm: "More variables, not different reading.",
                aside: "This is the one place the difference between `let` and `var` is visible in the output rather than in an error."
            }
        ]
    }
];

/*
 * ARRAYS.
 *
 * The topic that taught littleJs what a list is. Every example here has been
 * run, including the two that surprise people: an index past the end is
 * `undefined` rather than an error, and two lists with the same contents are
 * not equal.
 */
export const ARRAY_LESSONS: readonly Lesson[] = [
    {
        concept: "array-indexing",
        title: "Items by position",
        why: "A list holds many values under one name, and the position is how you reach one.",
        teach: [
            {
                code: "let scores = [90, 80, 70];\nconsole.log(scores[0]);\nconsole.log(scores[2]);",
                output: "90\n70",
                note: "Positions start at 0, exactly as they do in text.",
                parts: [
                    { piece: "[90, 80, 70]", means: "the list, written out" },
                    { piece: "scores[0]", means: "the first item" },
                    { piece: "scores[2]", means: "the third — and here the last" }
                ]
            },
            {
                code: "let scores = [90, 80, 70];\nconsole.log(scores[3]);",
                output: "undefined",
                note: "Past the end is not an error. JavaScript hands back `undefined` and carries on.",
                parts: [{ piece: "[3]", means: "there is no fourth item, so: undefined" }]
            }
        ],
        notice: "Counting from zero, and nothing past the end — just `undefined`.",
        steps: [
            {
                demand: "recognise",
                ask: "Which one reaches the FIRST item?",
                code: "let scores = [90, 80, 70];",
                choices: [
                    { text: "scores[0]", correct: true },
                    { text: "scores[1]", feedback: "That is the second item. Counting starts at 0." },
                    { text: "scores(0)", feedback: "Round brackets would try to call it. A position needs square ones." }
                ],
                confirm: "Position 0 is the first.",
                retry: {
                    demand: "recognise",
                    ask: "And which reaches the LAST one here?",
                    code: "let scores = [90, 80, 70];",
                    choices: [
                        { text: "scores[2]", correct: true },
                        { text: "scores[3]", feedback: "Three items end at position 2 — `[3]` is past the end." }
                    ],
                    confirm: "One less than the count."
                }
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let scores = [90, 80, 70];\nconsole.log(scores[3]);",
                choices: [
                    { text: "undefined", correct: true },
                    { text: "70", feedback: "70 is at position 2. There is nothing at 3." },
                    { text: "an error", feedback: "Reaching past the end is allowed — you just get `undefined`." }
                ],
                confirm: "Nothing there, so: undefined.",
                aside: "This is why a bad index often shows up later, somewhere else, as an odd value."
            }
        ]
    },
    {
        concept: "array-length",
        title: "How many, and the last one",
        why: "Almost every loop over a list needs its length, and the last index is never the length.",
        teach: [
            {
                code: "let a = [4, 5, 6];\nconsole.log(a.length);\nconsole.log(a[a.length - 1]);",
                output: "3\n6",
                note: "`length` counts. Positions stop one short of it.",
                parts: [
                    { piece: ".length", means: "how many items — 3" },
                    { piece: "[a.length - 1]", means: "the last position — 2" }
                ]
            }
        ],
        notice: "The last index is always `length - 1`, whatever the list holds.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let a = [4, 5, 6];\nconsole.log(a.length);\nconsole.log(a[a.length - 1]);",
                choices: [
                    { text: "3 then 6", correct: true },
                    { text: "3 then undefined", feedback: "`length - 1` is 2, and position 2 holds 6." },
                    { text: "2 then 6", feedback: "`length` counts the items — there are three." }
                ],
                confirm: "Count three, last position two."
            },
            {
                demand: "diagnose",
                ask: "This should print the last item and prints undefined. Which line is the cause?",
                code: "let a = [4, 5, 6];\nconsole.log(a[a.length]);",
                choices: [
                    { text: "console.log(a[a.length]);", correct: true },
                    { text: "let a = [4, 5, 6];", feedback: "The list is fine. The index reaching into it is not." },
                    { text: "nothing — it works", feedback: "`a[3]` is one past the end, so it gives `undefined`." }
                ],
                confirm: "Off by exactly one.",
                retry: {
                    demand: "diagnose",
                    ask: "Which of these prints 6?",
                    code: "let a = [4, 5, 6];",
                    choices: [
                        { text: "a[a.length - 1]", correct: true },
                        { text: "a[a.length]", feedback: "That is position 3, and the list stops at 2." }
                    ],
                    confirm: "Minus one, every time."
                }
            }
        ]
    },
    {
        concept: "array-mutation",
        title: "Changing a list in place",
        why: "Some methods change the list you call them on, and knowing which is the difference between a bug and a fix.",
        teach: [
            {
                code: "let a = [1, 2];\nlet b = a.push(3);\nconsole.log(b);\nconsole.log(a.length);",
                output: "3\n3",
                note: "`push` changed `a` — and handed back the new LENGTH, not the list.",
                parts: [
                    { piece: "a.push(3)", means: "changes `a` in place" },
                    { piece: "b", means: "the new length, 3 — a number, not a list" }
                ]
            },
            {
                code: "let a = [1, 2, 3];\nlet b = a.slice(1);\nconsole.log(b.length);\nconsole.log(a.length);",
                output: "2\n3",
                note: "`slice` is the other kind: it leaves `a` alone and returns something new.",
                parts: [{ piece: "a.slice(1)", means: "a NEW list — `a` is untouched" }]
            }
        ],
        notice: "`push` and `pop` change the list. `slice` hands back a new one.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let a = [1, 2];\nlet b = a.push(3);\nconsole.log(b);",
                choices: [
                    { text: "3", correct: true },
                    { text: "[1, 2, 3]", feedback: "`push` returns the new length, not the list." },
                    { text: "undefined", feedback: "It does return something — the count after pushing." }
                ],
                confirm: "The new length.",
                aside: "Storing the result of `push` is a common way to end up holding a number where a list was meant to be."
            },
            {
                demand: "diagnose",
                ask: "This should leave the original untouched and changes it. Which line is the cause?",
                code: "let original = [1, 2];\nlet copy = original;\ncopy.push(3);\nconsole.log(original.length);",
                choices: [
                    { text: "let copy = original;", correct: true },
                    { text: "copy.push(3);", feedback: "Pushing to a copy would be fine. The trouble is that this is not a copy." },
                    { text: "let original = [1, 2];", feedback: "Making the list is not the problem." }
                ],
                confirm: "A second name, not a second list.",
                retry: {
                    demand: "diagnose",
                    ask: "Which of these actually makes a copy?",
                    code: "let original = [1, 2];",
                    choices: [
                        { text: "let copy = [...original];", correct: true },
                        { text: "let copy = original;", feedback: "That points a new name at the same list." }
                    ],
                    confirm: "The dots build a new one."
                }
            },
            {
                demand: "explain",
                ask: "Why does `const` not stop an array being changed?",
                choices: [
                    { text: "It fixes which list the name points at, not what is inside that list", correct: true },
                    { text: "Arrays are always mutable and const only applies to numbers", feedback: "const works the same way on every value — what it guards is the name." },
                    { text: "push is allowed to bypass const", feedback: "Nothing bypasses it. `push` never changes where the name points." }
                ],
                confirm: "The name is fixed; the contents are not."
            }
        ]
    },
    {
        concept: "array-copy-spread",
        title: "Copying instead of sharing",
        why: "Sharing a list by accident is one of the most common bugs there is, and spread is the usual fix.",
        teach: [
            {
                code: "let a = [1, 2];\nlet b = [...a];\nb.push(3);\nconsole.log(a.length);\nconsole.log(b.length);",
                output: "2\n3",
                note: "`[...a]` builds a new list holding the same items. Two lists now, not one.",
                parts: [
                    { piece: "[...a]", means: "a new list, with a's items poured into it" },
                    { piece: "a.length", means: "still 2 — the push went to the other one" }
                ]
            },
            {
                code: "let inner = [1];\nlet a = [inner];\nlet b = [...a];\nb[0].push(2);\nconsole.log(inner.length);",
                output: "2",
                note: "One level only. The inner list was not copied — both still point at it.",
                parts: [{ piece: "b[0]", means: "the SAME list `inner` is, so pushing reaches it" }]
            }
        ],
        notice: "Spread copies the outer list. Anything nested inside is still shared.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let a = [1, 2];\nlet b = [...a];\nb.push(3);\nconsole.log(a.length);",
                choices: [
                    { text: "2", correct: true },
                    { text: "3", feedback: "`b` is a separate list — pushing to it does not reach `a`." },
                    { text: "an error", feedback: "Spreading a list into brackets is ordinary JavaScript." }
                ],
                confirm: "Two lists, so the original is untouched.",
                retry: {
                    demand: "predict",
                    ask: "Simpler: is the copy the same list?",
                    code: "let a = [1];\nlet b = [...a];\nconsole.log(a === b);",
                    choices: [
                        { text: "false", correct: true },
                        { text: "true", feedback: "The dots built a new list. Only `let b = a;` would have shared one." }
                    ],
                    confirm: "A new one, so not the same."
                }
            },
            {
                demand: "explain",
                ask: "Why is a spread copy called shallow?",
                choices: [
                    { text: "It makes a new outer list, but anything nested inside is still the same list as before", correct: true },
                    { text: "It copies only the first item", feedback: "Every item comes across — the question is whether the items themselves are copied." },
                    { text: "The copy can be read but not changed", feedback: "It is an ordinary list and can be changed freely." }
                ],
                confirm: "One level deep, and no further."
            }
        ]
    },
    {
        concept: "default-rest-params",
        title: "Missing arguments, and extra ones",
        why: "A default saves the caller from passing the obvious thing; rest lets them pass as many as they like.",
        teach: [
            {
                code: 'function greet(name, greeting = "Hello") {\n  return greeting + ", " + name;\n}\nconsole.log(greet("Tati"));\nconsole.log(greet("Tati", "Hi"));',
                output: "Hello, Tati\nHi, Tati",
                note: "The default fills in only when the argument is missing.",
                parts: [
                    { piece: 'greeting = "Hello"', means: "used when nothing is passed for it" },
                    { piece: 'greet("Tati", "Hi")', means: "something was passed, so the default stands aside" }
                ]
            },
            {
                code: "function count(...things) {\n  return things.length;\n}\nconsole.log(count(1, 2, 3));\nconsole.log(count());",
                output: "3\n0",
                note: "`...things` gathers whatever is left into a list — possibly an empty one.",
                parts: [{ piece: "...things", means: "a list of every remaining argument" }]
            }
        ],
        notice: "A default fills a gap. Rest collects the leftovers into an array.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'function greet(name, greeting = "Hello") {\n  return greeting + ", " + name;\n}\nconsole.log(greet("Tati"));',
                choices: [
                    { text: "Hello, Tati", correct: true },
                    { text: "undefined, Tati", feedback: "The default is exactly what stops `greeting` being undefined." },
                    { text: "an error", feedback: "Leaving out an argument that has a default is allowed." }
                ],
                confirm: "The default filled the gap.",
                retry: {
                    demand: "predict",
                    ask: "And with both given?",
                    code: 'function greet(name, greeting = "Hello") {\n  return greeting + ", " + name;\n}\nconsole.log(greet("Tati", "Hi"));',
                    choices: [
                        { text: "Hi, Tati", correct: true },
                        { text: "Hello, Tati", feedback: "A default only applies when nothing was passed." }
                    ],
                    confirm: "Given beats default."
                }
            }
        ]
    },
    {
        concept: "nested-arrays",
        title: "Lists inside lists",
        why: "Grids, rows and groups are all arrays whose items happen to be arrays.",
        teach: [
            {
                code: "let grid = [[1, 2], [3, 4]];\nconsole.log(grid[1]);\nconsole.log(grid[1][1]);",
                output: "[3, 4]\n4",
                note: "One pair of brackets gets an inner list. Two get an item out of it.",
                parts: [
                    { piece: "grid[1]", means: "the second inner list" },
                    { piece: "grid[1][1]", means: "that list's second item" }
                ]
            }
        ],
        notice: "Each `[ ]` goes one level deeper.",
        steps: [
            {
                demand: "recognise",
                ask: "Which one reaches the 4?",
                code: "let grid = [[1, 2], [3, 4]];",
                choices: [
                    { text: "grid[1][1]", correct: true },
                    { text: "grid[3]", feedback: "The outer list has two items, so `[3]` is past its end." },
                    { text: "grid[1]", feedback: "That is the whole inner list `[3, 4]`, not one item from it." }
                ],
                confirm: "Two levels, two sets of brackets.",
                retry: {
                    demand: "recognise",
                    ask: "And which one reaches the 3?",
                    code: "let grid = [[1, 2], [3, 4]];",
                    choices: [
                        { text: "grid[1][0]", correct: true },
                        { text: "grid[0][1]", feedback: "That is the FIRST inner list's second item, which is 2." }
                    ],
                    confirm: "Second list, first item."
                }
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let grid = [[1, 2], [3, 4]];\nconsole.log(grid[0].length);",
                choices: [
                    { text: "2", correct: true },
                    { text: "4", feedback: "That would be the total number of items across both inner lists." },
                    { text: "1", feedback: "`grid[0]` is `[1, 2]`, which holds two items." }
                ],
                confirm: "The inner list's own count."
            }
        ]
    },
    {
        concept: "array-reference-identity",
        title: "Same list, or just the same contents?",
        why: "Comparing arrays with `===` almost never does what people expect, and knowing why saves hours.",
        teach: [
            {
                code: "let a = [1, 2];\nlet b = [1, 2];\nconsole.log(a === b);",
                output: "false",
                note: "Two lists were written, so there are two. Identical contents do not make them one.",
                parts: [{ piece: "===", means: "are these the SAME list?" }]
            },
            {
                code: "let a = [1, 2];\nlet b = a;\nconsole.log(a === b);",
                output: "true",
                note: "One list with two names. Now they really are the same thing.",
                parts: [{ piece: "let b = a", means: "a second name, not a second list" }]
            }
        ],
        notice: "`===` asks whether they are one list, never whether they look alike.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let a = [1, 2];\nlet b = [1, 2];\nconsole.log(a === b);",
                choices: [
                    { text: "false", correct: true },
                    { text: "true", feedback: "They hold the same numbers, but they are two separate lists." },
                    { text: "an error", feedback: "Comparing lists is allowed — it just asks a different question than you might think." }
                ],
                confirm: "Two lists, so not the same one.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: "let a = [1, 2];\nlet b = a;\nconsole.log(a === b);",
                    choices: [
                        { text: "true", correct: true },
                        { text: "false", feedback: "`b` was never a new list — it is the same one under another name." }
                    ],
                    confirm: "One list, two names."
                }
            },
            {
                demand: "explain",
                ask: "Why are two arrays holding identical items still not equal?",
                choices: [
                    { text: "Comparing them asks whether they are the same list, not whether they look the same", correct: true },
                    { text: "Arrays can never be compared with ===", feedback: "They can, and two names for one list compare as true." },
                    { text: "The items are compared one at a time and that always fails", feedback: "The items are never compared at all." }
                ],
                confirm: "Identity, not resemblance."
            }
        ]
    }
];

/*
 * ARRAY METHODS.
 *
 * The topic that taught littleJs to call a callback. Every example here has
 * been run, including the three that catch people: `forEach` hands back
 * nothing, `sort` with no comparator compares AS TEXT, and `sort` returns the
 * very list it just rearranged.
 */
export const ARRAY_METHOD_LESSONS: readonly Lesson[] = [
    {
        concept: "map",
        title: "One in, one out",
        why: "Transforming a whole list is the single most common thing anyone does with one.",
        teach: [
            {
                code: "let a = [1, 2, 3];\nlet doubled = a.map((n) => n * 2);\nconsole.log(doubled);\nconsole.log(a);",
                output: "[2, 4, 6]\n[1, 2, 3]",
                note: "A new list the same length, and the original untouched.",
                parts: [
                    { piece: "(n) => n * 2", means: "runs once per item; what it RETURNS goes in the new list" },
                    { piece: "doubled", means: "the new list" },
                    { piece: "a", means: "unchanged — map never writes back" }
                ]
            },
            {
                code: "let a = [1, 2, 3];\nconsole.log(a.map((n) => { n * 2; }));",
                output: "[undefined, undefined, undefined]",
                note: "Braces make a body, and a body with no `return` gives undefined — once per item.",
                parts: [{ piece: "{ n * 2; }", means: "computes, returns nothing, collects nothing" }]
            }
        ],
        notice: "map collects what your function RETURNS. No return, nothing collected.",
        steps: [
            {
                demand: "recall",
                ask: "Which method builds a new list by passing every item through a function?",
                choices: [
                    { text: ".map()", correct: true },
                    { text: ".forEach()", feedback: "That runs your function but hands nothing back." },
                    { text: ".filter()", feedback: "That keeps items as they are; it does not change them." }
                ],
                confirm: "Same length, new contents."
            },
            {
                demand: "recognise",
                ask: "Which one doubles every number into a new list?",
                code: "let a = [1, 2, 3];",
                choices: [
                    { text: "a.map((n) => n * 2)", correct: true },
                    { text: "a.forEach((n) => n * 2)", feedback: "The doubled values are computed and thrown away." },
                    { text: "a.map(n * 2)", feedback: "`map` needs a function, not a value." }
                ],
                confirm: "map collects the results.",
                retry: {
                    demand: "recognise",
                    ask: "Simpler: which of these returns something for map to keep?",
                    code: "// two arrow bodies",
                    choices: [
                        { text: "(n) => n + 1", correct: true },
                        { text: "(n) => { n + 1; }", feedback: "Braces need an explicit `return`." }
                    ],
                    confirm: "No braces, implicit return."
                }
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let a = [1, 2, 3];\nlet b = a.map((n) => n * 2);\nconsole.log(a);",
                choices: [
                    { text: "[1, 2, 3]", correct: true },
                    { text: "[2, 4, 6]", feedback: "That is `b`. `map` leaves the original alone." },
                    { text: "undefined", feedback: "`a` is still the list it always was." }
                ],
                confirm: "The original never changes."
            },
            {
                demand: "diagnose",
                ask: "This should hold the doubled numbers and holds three undefineds. Which line is the cause?",
                code: "let a = [1, 2, 3];\nlet doubled = a.map((n) => { n * 2; });\nconsole.log(doubled);",
                choices: [
                    { text: "let doubled = a.map((n) => { n * 2; });", correct: true },
                    { text: "console.log(doubled);", feedback: "Printing it is fine — the trouble is what is in it." },
                    { text: "let a = [1, 2, 3];", feedback: "The list is exactly what was wanted — the trouble is further down." }
                ],
                confirm: "A body with no return gives undefined."
            }
        ]
    },
    {
        concept: "for-each",
        title: "Doing, not making",
        why: "Some loops are for producing a value and some are for having an effect, and mixing them up is a bug.",
        teach: [
            {
                code: 'let names = ["Tati", "Sam"];\nnames.forEach((n) => {\n  console.log(n);\n});',
                output: "Tati\nSam",
                note: "Runs the function once per item. That is all it does.",
                parts: [{ piece: "forEach", means: "for the effect — printing here — not for a result" }]
            },
            {
                code: "let a = [1, 2];\nlet out = a.forEach((n) => n * 2);\nconsole.log(out);",
                output: "undefined",
                note: "Whatever the function returns is discarded. forEach always gives undefined.",
                parts: [{ piece: "out", means: "undefined, every time" }]
            }
        ],
        notice: "forEach gives back nothing, so nothing can be chained onto it.",
        steps: [
            {
                demand: "recall",
                ask: "Which method runs a function for every item and hands nothing back?",
                choices: [
                    { text: ".forEach()", correct: true },
                    { text: ".map()", feedback: "That hands back a new list." },
                    { text: ".reduce()", feedback: "That hands back one combined value." }
                ],
                confirm: "Effect, not result."
            },
            {
                demand: "recognise",
                ask: "Which one prints each name on its own line?",
                code: 'let names = ["Tati", "Sam"];',
                choices: [
                    { text: "names.forEach((n) => { console.log(n); })", correct: true },
                    { text: "console.log(names);", feedback: "That prints the whole list as one line." },
                    { text: "names.map((n) => n);", feedback: "That builds a copy and prints nothing." }
                ],
                confirm: "Once per item."
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let a = [1, 2];\nlet out = a.forEach((n) => n * 2);\nconsole.log(out);",
                choices: [
                    { text: "undefined", correct: true },
                    { text: "[2, 4]", feedback: "That is what `map` would give. forEach discards the results." },
                    { text: "2", feedback: "Nothing is collected at all." }
                ],
                confirm: "Always undefined.",
                retry: {
                    demand: "predict",
                    ask: "And with map instead?",
                    code: "let a = [1, 2];\nlet out = a.map((n) => n * 2);\nconsole.log(out);",
                    choices: [
                        { text: "[2, 4]", correct: true },
                        { text: "undefined", feedback: "`map` is the one that collects." }
                    ],
                    confirm: "That is the difference."
                }
            },
            {
                demand: "explain",
                ask: "Why can another method not be chained onto forEach?",
                choices: [
                    { text: "It hands back undefined, so there is nothing for the next method to be called on", correct: true },
                    { text: "forEach has to be last in a chain by rule", feedback: "There is no such rule — it is simply what it returns." },
                    { text: "forEach changes the original list", feedback: "It changes nothing; it just runs your function." }
                ],
                confirm: "Chaining needs a result."
            }
        ]
    },
    {
        concept: "filter",
        title: "Keeping some of them",
        why: "Narrowing a list to the items you care about is the other half of working with one.",
        teach: [
            {
                code: "let a = [1, 2, 3, 4];\nconsole.log(a.filter((n) => n > 2));",
                output: "[3, 4]",
                note: "Your function answers yes or no. The yeses are collected.",
                parts: [
                    { piece: "(n) => n > 2", means: "a test — it should give true or false" },
                    { piece: "[3, 4]", means: "a new list, possibly shorter, possibly empty" }
                ]
            },
            {
                code: 'let names = ["Tati", "Al"];\nconsole.log(names.filter((n) => n.length));',
                output: '["Tati", "Al"]',
                note: "A number is not a test. 4 and 2 are both truthy, so both were kept.",
                parts: [{ piece: "n.length", means: "truthy whenever it is not 0 — so almost always" }]
            }
        ],
        notice: "filter asks whether your answer is TRUTHY, not whether it is big.",
        steps: [
            {
                demand: "recall",
                ask: "Which method keeps only the items that pass a test?",
                choices: [
                    { text: ".filter()", correct: true },
                    { text: ".find()", feedback: "That gives one item, not a list of them." },
                    { text: ".some()", feedback: "That gives true or false about the whole list." }
                ],
                confirm: "A list of the ones that passed."
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let a = [1, 2, 3, 4];\nconsole.log(a.filter((n) => n > 2));",
                choices: [
                    { text: "[3, 4]", correct: true },
                    { text: "[1, 2]", feedback: "Those are the ones that failed the test." },
                    { text: "true", feedback: "`filter` gives a list; `some` would give true." }
                ],
                confirm: "The passing ones, in a new list.",
                retry: {
                    demand: "predict",
                    ask: "And when nothing passes?",
                    code: "let a = [1, 2];\nconsole.log(a.filter((n) => n > 9).length);",
                    choices: [
                        { text: "0", correct: true },
                        { text: "undefined", feedback: "You still get a list — an empty one." }
                    ],
                    confirm: "An empty list, not nothing."
                }
            },
            {
                demand: "diagnose",
                ask: "This should keep only names longer than two letters, and keeps all three. Which line is the cause?",
                code: 'let names = ["Tati", "Al", "Sam"];\nlet long = names.filter((n) => n.length);\nconsole.log(long.length);',
                choices: [
                    { text: "let long = names.filter((n) => n.length);", correct: true },
                    { text: "console.log(long.length);", feedback: "The printing is right; the filtering is not." },
                    { text: 'let names = ["Tati", "Al", "Sam"];', feedback: "The names are right; it is the test applied to them that is not." }
                ],
                confirm: "A number is not a test.",
                aside: "`n.length > 2` is the test that was meant. 4, 2 and 3 are all truthy."
            }
        ]
    },
    {
        concept: "find-some-every",
        title: "Looking for one, or asking about all",
        why: "Three methods that look alike and answer three different questions.",
        teach: [
            {
                code: "let a = [1, 2, 3];\nconsole.log(a.find((n) => n > 1));\nconsole.log(a.some((n) => n > 1));\nconsole.log(a.every((n) => n > 1));",
                output: "2\ntrue\nfalse",
                note: "An item, a yes-or-no, and another yes-or-no about every single one.",
                parts: [
                    { piece: "find", means: "the FIRST item that passes, or undefined" },
                    { piece: "some", means: "did at least one pass?" },
                    { piece: "every", means: "did they all pass?" }
                ]
            },
            {
                code: "let a = [1];\nconsole.log(a.find((n) => n > 5));",
                output: "undefined",
                note: "Nothing passed, so there is no item to hand back.",
                parts: [{ piece: "undefined", means: "not an error, and not an empty list" }]
            }
        ],
        notice: "find gives an item. some and every give true or false.",
        steps: [
            {
                demand: "recall",
                ask: "Which one hands back a single item rather than a list or a yes-or-no?",
                choices: [
                    { text: ".find()", correct: true },
                    { text: ".filter()", feedback: "That gives a list, even when only one item matches." },
                    { text: ".some()", feedback: "That answers yes or no about the list, rather than handing you an item." }
                ],
                confirm: "One item, or undefined."
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let a = [1, 2, 3];\nconsole.log(a.find((n) => n > 5));\nconsole.log(a.some((n) => n > 5));",
                choices: [
                    { text: "undefined then false", correct: true },
                    { text: "false then false", feedback: "`find` has no item to give, so it gives undefined — not false." },
                    { text: "undefined then undefined", feedback: "`some` is a yes-or-no question and always answers one." }
                ],
                confirm: "Different questions, different answers.",
                retry: {
                    demand: "predict",
                    ask: "Simpler: what does find give when something matches?",
                    code: "let a = [1, 2, 3];\nconsole.log(a.find((n) => n > 1));",
                    choices: [
                        { text: "2", correct: true },
                        { text: "[2, 3]", feedback: "That is what `filter` would give. `find` stops at the first." }
                    ],
                    confirm: "The first one that passes."
                }
            },
            {
                demand: "explain",
                ask: "Why does every() hand back true for an empty list?",
                choices: [
                    { text: "There is no item that fails the test, and not failing is all every checks for", correct: true },
                    { text: "An empty list counts as holding one invisible item", feedback: "It holds nothing at all — that is the point." },
                    { text: "An empty list is itself truthy", feedback: "True, but unrelated: `every` never looks at the list's truthiness." }
                ],
                confirm: "Nothing to fail, so nothing failed.",
                aside: "`some` on the same empty list is false, for the mirror-image reason."
            }
        ]
    },
    {
        concept: "reduce",
        title: "A whole list into one value",
        why: "Totals, maximums, counts — anything that comes out of a list as a single answer.",
        teach: [
            {
                code: "let a = [1, 2, 3];\nconsole.log(a.reduce((total, n) => total + n, 0));",
                output: "6",
                note: "The 0 is where the running total starts. Each item is folded into it.",
                parts: [
                    { piece: "total", means: "the running answer so far" },
                    { piece: "n", means: "the item being folded in" },
                    { piece: ", 0", means: "the starting value — easy to forget, and it matters" }
                ]
            },
            {
                code: 'let a = [1, 2, 3];\nconsole.log(a.reduce((sum, n) => sum + n, ""));',
                output: "123",
                note: "Start from text and the first `+` joins instead of adding — and then everything does.",
                parts: [{ piece: '""', means: "a starting value of the wrong type changes what `+` means" }]
            }
        ],
        notice: "The starting value decides what kind of answer you get.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let a = [1, 2, 3];\nconsole.log(a.reduce((total, n) => total + n, 0));",
                choices: [
                    { text: "6", correct: true },
                    { text: "[1, 2, 3]", feedback: "`reduce` gives one value, not a list." },
                    { text: "0", feedback: "0 is where it starts, not where it ends." }
                ],
                confirm: "One value out of the whole list.",
                retry: {
                    demand: "predict",
                    ask: "And starting from 10?",
                    code: "let a = [1, 2, 3];\nconsole.log(a.reduce((total, n) => total + n, 10));",
                    choices: [
                        { text: "16", correct: true },
                        { text: "6", feedback: "The starting value is part of the total." }
                    ],
                    confirm: "It starts where you say."
                }
            },
            {
                demand: "diagnose",
                ask: "This should add up to 6 and prints 123. Which line is the cause?",
                code: 'let a = [1, 2, 3];\nlet total = a.reduce((sum, n) => sum + n, "");\nconsole.log(total);',
                choices: [
                    { text: 'let total = a.reduce((sum, n) => sum + n, "");', correct: true },
                    { text: "console.log(total);", feedback: "It printed exactly what it was given." },
                    { text: "let a = [1, 2, 3];", feedback: "The numbers are fine — what they are added to is not." }
                ],
                confirm: "A text starting value makes `+` join."
            },
            {
                demand: "explain",
                ask: "Why does reduce need a starting value for a list that might be empty?",
                choices: [
                    { text: "With no items to take a first value from and nothing given, there is no answer it could return", correct: true },
                    { text: "The starting value tells reduce how many items to expect", feedback: "It never needs to know that." },
                    { text: "An empty list would otherwise return an empty list", feedback: "`reduce` returns a value, never a list." }
                ],
                confirm: "It has to start somewhere."
            }
        ]
    },
    {
        concept: "sort",
        title: "Order, and the trap in it",
        why: "Sorting numbers without a comparator is one of the most reliably surprising things in JavaScript.",
        teach: [
            {
                code: "let a = [10, 9, 1];\na.sort();\nconsole.log(a);",
                output: "[1, 10, 9]",
                note: "With no comparator, items are compared AS TEXT. \"10\" sorts before \"9\".",
                parts: [
                    { piece: "sort()", means: "turns each item into text and compares the text" },
                    { piece: "[1, 10, 9]", means: "correct alphabetically, wrong numerically" }
                ]
            },
            {
                code: "let a = [10, 9, 1];\na.sort((x, y) => x - y);\nconsole.log(a);",
                output: "[1, 9, 10]",
                note: "A comparator says how two items compare: negative, zero, positive.",
                parts: [{ piece: "(x, y) => x - y", means: "negative puts x first — exactly what numbers need" }]
            }
        ],
        notice: "sort changes the original AND returns it. `a.sort() === a` is true.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let a = [10, 9, 1];\na.sort();\nconsole.log(a);",
                choices: [
                    { text: "[1, 10, 9]", correct: true },
                    { text: "[1, 9, 10]", feedback: "That needs a comparator. Without one these are compared as text." },
                    { text: "[10, 9, 1]", feedback: "It did sort — just not numerically." }
                ],
                confirm: "Text order, not number order.",
                retry: {
                    demand: "predict",
                    ask: "And with a comparator?",
                    code: "let a = [10, 9, 1];\na.sort((x, y) => x - y);\nconsole.log(a);",
                    choices: [
                        { text: "[1, 9, 10]", correct: true },
                        { text: "[1, 10, 9]", feedback: "The comparator is what makes it numeric." }
                    ],
                    confirm: "Now it is numbers."
                }
            },
            {
                demand: "diagnose",
                ask: "This should put the scores in numerical order and does not. Which line is the cause?",
                code: "let scores = [10, 9, 1];\nscores.sort();\nconsole.log(scores);",
                choices: [
                    { text: "scores.sort();", correct: true },
                    { text: "console.log(scores);", feedback: "It printed what it was given." },
                    { text: "let scores = [10, 9, 1];", feedback: "The scores are right; how they are put in order is the problem." }
                ],
                confirm: "Empty brackets ask for text order."
            },
            {
                demand: "explain",
                ask: "Why does sorting change the original rather than returning a sorted copy?",
                choices: [
                    { text: "sort rearranges the very list it was called on, and hands that same list back", correct: true },
                    { text: "sort returns a new list and the old one is thrown away", feedback: "Nothing is thrown away — the original is the one that changed." },
                    { text: "A copy would lose the comparator", feedback: "The comparator is only used while sorting." }
                ],
                confirm: "It mutates, and returns itself.",
                aside: "To keep the original, sort a copy: `[...a].sort()`."
            }
        ]
    },
    {
        concept: "flat",
        title: "Lifting nested lists",
        why: "Nested lists turn up constantly, and flattening them is usually one call.",
        teach: [
            {
                code: "let a = [1, [2, [3]]];\nconsole.log(a.flat());\nconsole.log(a.flat(2));",
                output: "[1, 2, [3]]\n[1, 2, 3]",
                note: "One level by default. Say how many to go further.",
                parts: [
                    { piece: "flat()", means: "lifts one level" },
                    { piece: "flat(2)", means: "lifts two" }
                ]
            }
        ],
        notice: "The default depth is 1, which is why some nesting usually survives.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let a = [1, [2, [3]]];\nconsole.log(a.flat());",
                choices: [
                    { text: "[1, 2, [3]]", correct: true },
                    { text: "[1, 2, 3]", feedback: "That is `flat(2)`. One level leaves the inner list intact." },
                    { text: "[1, [2, [3]]]", feedback: "One level did come up — the 2 is no longer nested." }
                ],
                confirm: "One level, and the deeper one stays.",
                retry: {
                    demand: "predict",
                    ask: "And with flat(2)?",
                    code: "let a = [1, [2, [3]]];\nconsole.log(a.flat(2));",
                    choices: [
                        { text: "[1, 2, 3]", correct: true },
                        { text: "[1, 2, [3]]", feedback: "Two levels is enough to reach the 3." }
                    ],
                    confirm: "As deep as you ask."
                }
            },
            {
                demand: "explain",
                ask: "Why does flat() often leave some nesting behind?",
                choices: [
                    { text: "It lifts one level unless you tell it how many to lift", correct: true },
                    { text: "It stops at the first item that is not a list", feedback: "It walks the whole list; depth is what limits it." },
                    { text: "The deepest level is always kept", feedback: "`flat(Infinity)` flattens all the way down." }
                ],
                confirm: "A depth of 1, by default."
            }
        ]
    },
    {
        concept: "method-chaining",
        title: "One into the next",
        why: "Most real list code is two or three of these in a row, and reading it means following what flows between them.",
        teach: [
            {
                code: "let a = [1, 2, 3, 4];\nconsole.log(a.filter((n) => n > 1).map((n) => n * 10));",
                output: "[20, 30, 40]",
                note: "filter ran first and handed on [2, 3, 4]. map worked from that, not from `a`.",
                parts: [
                    { piece: "a.filter(...)", means: "gives [2, 3, 4]" },
                    { piece: ".map(...)", means: "runs on THAT list, not the original" }
                ]
            }
        ],
        notice: "Each method starts where the one before it finished — so order changes the answer.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let a = [1, 2, 3, 4];\nconsole.log(a.filter((n) => n > 1).map((n) => n * 10));",
                choices: [
                    { text: "[20, 30, 40]", correct: true },
                    { text: "[10, 20, 30, 40]", feedback: "The 1 was filtered out before map ever saw it." },
                    { text: "[2, 3, 4]", feedback: "That is the halfway point — map still has to run." }
                ],
                confirm: "Filter first, then map what survived.",
                retry: {
                    demand: "predict",
                    ask: "Simpler: what does the first half give?",
                    code: "let a = [1, 2, 3, 4];\nconsole.log(a.filter((n) => n > 1));",
                    choices: [
                        { text: "[2, 3, 4]", correct: true },
                        { text: "[1]", feedback: "Those are the ones that failed." }
                    ],
                    confirm: "And that is what map receives."
                }
            }
        ]
    }
];

/*
 * OBJECTS.
 *
 * The widest extension littleJs has had: object literals, dot and bracket
 * access, `delete`, `for...of`, `for...in`, `?.`, destructuring, spread,
 * `JSON` and `new Map()` / `new Set()`. Every example here has been run.
 */
export const OBJECT_LESSONS: readonly Lesson[] = [
    {
        concept: "object-access",
        title: "Values with names",
        why: "A list numbers its items. An object names them, which is what most real data looks like.",
        teach: [
            {
                code: 'let u = { name: "Tati", city: "Brooklyn" };\nconsole.log(u.name);\nconsole.log(u["city"]);',
                output: "Tati\nBrooklyn",
                note: "Two ways in. A dot for a name you are writing out, brackets for one you are working out.",
                parts: [
                    { piece: "{ name: ..., city: ... }", means: "the object, written out" },
                    { piece: "u.name", means: "the property literally called name" },
                    { piece: 'u["city"]', means: "the same thing, with the key as a value" }
                ]
            },
            {
                code: 'let u = { city: "Brooklyn" };\nlet k = "city";\nconsole.log(u[k]);\nconsole.log(u.k);',
                output: "Brooklyn\nundefined",
                note: "`u.k` looks for a property actually called k. Only brackets work out what the key is.",
                parts: [{ piece: "u.k", means: "the literal name k — not what k holds" }]
            }
        ],
        notice: "A dot takes the name as written. Brackets evaluate what is inside them.",
        steps: [
            {
                demand: "recognise",
                ask: "Which one reads the city when the key is in a variable?",
                code: 'let u = { city: "Brooklyn" };\nlet k = "city";',
                choices: [
                    { text: "u[k]", correct: true },
                    { text: "u.k", feedback: "That looks for a property called k, which this object has not got." },
                    { text: "u(k)", feedback: "Round brackets would try to call the object as a function." }
                ],
                confirm: "Brackets work the key out first.",
                retry: {
                    demand: "recognise",
                    ask: "And when the key is written out?",
                    code: 'let u = { city: "Brooklyn" };',
                    choices: [
                        { text: "both u.city and u[\"city\"]", correct: true },
                        { text: "only u[\"city\"]", feedback: "A dot is fine for a name you are writing yourself." }
                    ],
                    confirm: "Either reaches the same property."
                }
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let p = { a: 1 };\nconsole.log(p.b);",
                choices: [
                    { text: "undefined", correct: true },
                    { text: "an error", feedback: "Reading a property that is not there is allowed." },
                    { text: "null", feedback: "`null` has to be put there on purpose; a missing property gives undefined." }
                ],
                confirm: "Missing is quiet.",
                aside: "Which is why a mistyped property name usually shows up much later, somewhere else."
            }
        ]
    },
    {
        concept: "object-mutation",
        title: "Adding and removing",
        why: "Objects are not fixed once made, and the difference between emptying a property and removing it matters.",
        teach: [
            {
                code: "let p = { a: 1 };\np.b = 2;\ndelete p.a;\nconsole.log(p);",
                output: "{ b: 2 }",
                note: "Assigning a property that does not exist creates it. `delete` takes one away entirely.",
                parts: [
                    { piece: "p.b = 2", means: "adds a new property" },
                    { piece: "delete p.a", means: "removes the key as well as the value" }
                ]
            },
            {
                code: "let p = { a: 1, b: 2 };\np.b = undefined;\nconsole.log(p);",
                output: "{ a: 1, b: undefined }",
                note: "Setting it to undefined empties it. The key is still there.",
                parts: [{ piece: "p.b = undefined", means: "a value changed, not a key removed" }]
            }
        ],
        notice: "`delete` removes the key. Setting it to undefined only empties it.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let p = { a: 1 };\np.b = 2;\ndelete p.a;\nconsole.log(p);",
                choices: [
                    { text: "{ b: 2 }", correct: true },
                    { text: "{ a: 1, b: 2 }", feedback: "`delete p.a` took that one away." },
                    { text: "{ a: undefined, b: 2 }", feedback: "`delete` removes the key, not just the value." }
                ],
                confirm: "One added, one removed."
            },
            {
                demand: "diagnose",
                ask: "This should remove the property and it is still there. Which line is the cause?",
                code: "let p = { a: 1, b: 2 };\np.b = undefined;\nconsole.log(p);",
                choices: [
                    { text: "p.b = undefined;", correct: true },
                    { text: "console.log(p);", feedback: "It printed honestly — the key really is still there." },
                    { text: "let p = { a: 1, b: 2 };", feedback: "The object is fine to start with." }
                ],
                confirm: "Emptied, not removed.",
                retry: {
                    demand: "diagnose",
                    ask: "Which one actually removes it?",
                    code: "let p = { a: 1, b: 2 };",
                    choices: [
                        { text: "delete p.b;", correct: true },
                        { text: "p.b = null;", feedback: "That is another value in the same key." }
                    ],
                    confirm: "`delete` is the one."
                }
            }
        ]
    },
    {
        concept: "nested-objects",
        title: "Objects inside objects",
        why: "Real data is nested almost immediately, and one missing level is the commonest crash there is.",
        teach: [
            {
                code: 'let u = { home: { city: "Brooklyn" } };\nconsole.log(u.home.city);\nconsole.log(u.home);',
                output: "Brooklyn\n{ city: \"Brooklyn\" }",
                note: "One step per level. Stopping early gives you the inner object itself.",
                parts: [
                    { piece: "u.home", means: "the inner object" },
                    { piece: "u.home.city", means: "a property of that inner object" }
                ]
            },
            {
                code: 'let u = { home: { city: "Brooklyn" } };\nconsole.log(u.work.city);',
                output: "an error",
                note: "`u.work` is undefined, and reading `.city` from nothing is where it stops.",
                parts: [{ piece: "u.work", means: "missing — so there is nothing to read .city from" }]
            }
        ],
        notice: "One missing property is quiet. Reaching THROUGH one is not.",
        steps: [
            {
                demand: "recognise",
                ask: "Which one reaches the city?",
                code: 'let u = { home: { city: "Brooklyn" } };',
                choices: [
                    { text: "u.home.city", correct: true },
                    { text: "u.city", feedback: "The outer object has no city of its own." },
                    { text: "u[home][city]", feedback: "Those brackets use home and city as variables, not as keys." }
                ],
                confirm: "One step per level."
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'let u = { home: { city: "Brooklyn" } };\nconsole.log(u.work.city);',
                choices: [
                    { text: "an error", correct: true },
                    { text: "undefined", feedback: "That is what `u.work` alone would give. Reading through it is what fails." },
                    { text: "Brooklyn", feedback: "There is no `work` on this object at all." }
                ],
                confirm: "Through a missing level is where it stops.",
                retry: {
                    demand: "predict",
                    ask: "And just the one step?",
                    code: 'let u = { home: { city: "Brooklyn" } };\nconsole.log(u.work);',
                    choices: [
                        { text: "undefined", correct: true },
                        { text: "an error", feedback: "One missing property is allowed; it is going further that fails." }
                    ],
                    confirm: "That difference is the whole next concept."
                }
            }
        ]
    },
    {
        concept: "for-of-for-in",
        title: "Values, or keys",
        why: "Two loops that look almost identical and walk completely different things.",
        teach: [
            {
                code: "for (const n of [10, 20]) {\n  console.log(n);\n}",
                output: "10\n20",
                note: "`of` walks the values of a list.",
                parts: [{ piece: "of", means: "the items themselves" }]
            },
            {
                code: 'for (const i in ["a", "b"]) {\n  console.log(i);\n}',
                output: "0\n1",
                note: "`in` walks the KEYS — and a list's keys are its positions, as text.",
                parts: [{ piece: "in", means: "the keys: 0 and 1, not \"a\" and \"b\"" }]
            },
            {
                code: "let p = { a: 1, b: 2 };\nfor (const k in p) {\n  console.log(k);\n}",
                output: "a\nb",
                note: "On an object, keys are what you usually want — which is what `in` is for.",
                parts: [{ piece: "in on an object", means: "its property names" }]
            }
        ],
        notice: "`of` for a list's values. `in` for an object's keys.",
        steps: [
            {
                demand: "recognise",
                ask: "Which loop prints the VALUES of a list?",
                code: "let nums = [10, 20];",
                choices: [
                    { text: "for (const n of nums)", correct: true },
                    { text: "for (const n in nums)", feedback: "That walks the keys, which for a list are 0 and 1." },
                    { text: "for (n of nums)", feedback: "The loop variable still has to be declared." }
                ],
                confirm: "`of` gives the items."
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'for (const i in ["a", "b"]) {\n  console.log(i);\n}',
                choices: [
                    { text: "0 then 1", correct: true },
                    { text: "a then b", feedback: "That is `of`. `in` walks the keys." },
                    { text: "nothing", feedback: "The list has two keys, so the body runs twice." }
                ],
                confirm: "Keys, and a list's keys are positions.",
                retry: {
                    demand: "predict",
                    ask: "And with `of` instead?",
                    code: 'for (const i of ["a", "b"]) {\n  console.log(i);\n}',
                    choices: [
                        { text: "a then b", correct: true },
                        { text: "0 then 1", feedback: "`of` hands over the values." }
                    ],
                    confirm: "One word, completely different output."
                }
            },
            {
                demand: "diagnose",
                ask: "This should print each name and prints numbers. Which line is the cause?",
                code: 'let names = ["Tati", "Sam"];\nfor (const n in names) {\n  console.log(n);\n}',
                choices: [
                    { text: "for (const n in names) {", correct: true },
                    { text: "console.log(n);", feedback: "It printed exactly what the loop handed it." },
                    { text: 'let names = ["Tati", "Sam"];', feedback: "The list itself is right — it is the loop form above that is not." }
                ],
                confirm: "`in` where `of` was meant."
            }
        ]
    },
    {
        concept: "optional-chaining",
        title: "Reaching through what might not be there",
        why: "Data you did not create is full of gaps, and one `?.` is usually the whole fix.",
        teach: [
            {
                code: 'let u = { name: "Tati" };\nconsole.log(u.home?.city);',
                output: "undefined",
                note: "`u.home` is missing, so `?.` stops and the answer is undefined.",
                parts: [{ piece: "?.", means: "if there is nothing here, stop and give undefined" }]
            },
            {
                code: 'let u = { name: "Tati" };\nconsole.log(u.home.city);',
                output: "an error",
                note: "Without it, the same line fails.",
                parts: [{ piece: ".city", means: "read from nothing — which is where it stops" }]
            }
        ],
        notice: "`?.` has to sit at the step that might be missing.",
        steps: [
            {
                demand: "recognise",
                ask: "`home` may be missing. Which one gives undefined instead of failing?",
                code: 'let u = { name: "Tati" };',
                choices: [
                    { text: "u.home?.city", correct: true },
                    { text: "u.home.city", feedback: "That is the version that fails — there is no guard anywhere." },
                    { text: "u?.home.city", feedback: "That guards `u`, which is present. `.city` still falls over." }
                ],
                confirm: "Guard the step that might be missing.",
                retry: {
                    demand: "recognise",
                    ask: "Where does the question mark go?",
                    code: "// reaching a.b.c, where b might be missing",
                    choices: [
                        { text: "a.b?.c", correct: true },
                        { text: "a?.b.c", feedback: "That guards `a`. It is `b` that might not be there." }
                    ],
                    confirm: "At the gap."
                }
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'let u = { name: "Tati" };\nconsole.log(u.home?.city);',
                choices: [
                    { text: "undefined", correct: true },
                    { text: "an error", feedback: "The question mark is exactly what stops that." },
                    { text: "Tati", feedback: "Nothing here reads `name`." }
                ],
                confirm: "Stopped, not failed."
            },
            {
                demand: "explain",
                ask: "Why does `a?.b.c` not fail at `.c` when `a` is missing?",
                choices: [
                    { text: "The ?. stops the whole rest of the chain, not only the step it is written on", correct: true },
                    { text: "undefined quietly answers any property with undefined", feedback: "It does not — reading a property of undefined is an error." },
                    { text: "The chain is read from right to left", feedback: "It is read left to right, one step at a time." }
                ],
                confirm: "One question mark guards everything after it."
            }
        ]
    },
    {
        concept: "destructuring",
        title: "Taking the parts you want",
        why: "Pulling two or three properties out by name is clearer than repeating the object every time.",
        teach: [
            {
                code: 'let p = { name: "Tati", age: 3 };\nconst { name, age } = p;\nconsole.log(name);\nconsole.log(age);',
                output: "Tati\n3",
                note: "The braces on the left say which properties to take. Each becomes a variable of that name.",
                parts: [
                    { piece: "{ name, age }", means: "take these two properties" },
                    { piece: "= p", means: "out of this object" }
                ]
            },
            {
                code: "const [first, second] = [10, 20];\nconsole.log(second);",
                output: "20",
                note: "Square brackets do the same for a list, by position rather than by name.",
                parts: [{ piece: "[first, second]", means: "positions 0 and 1" }]
            }
        ],
        notice: "Braces take by name. Brackets take by position.",
        steps: [
            {
                demand: "recognise",
                ask: "Which one pulls `name` out into its own variable?",
                code: 'let p = { name: "Tati", age: 3 };',
                choices: [
                    { text: "const { name } = p;", correct: true },
                    { text: "const name = { p };", feedback: "That builds a new object holding p." },
                    { text: "const [name] = p;", feedback: "Square brackets take by position, from a list." }
                ],
                confirm: "Braces, on the left."
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: "const { missing } = { a: 1 };\nconsole.log(missing);",
                choices: [
                    { text: "undefined", correct: true },
                    { text: "an error", feedback: "Destructuring is reading properties, and a missing one is allowed." },
                    { text: "{ a: 1 }", feedback: "The variable gets the property, not the whole object." }
                ],
                confirm: "Same as reading it the long way.",
                retry: {
                    demand: "predict",
                    ask: "And when it is there?",
                    code: "const { a } = { a: 1 };\nconsole.log(a);",
                    choices: [
                        { text: "1", correct: true },
                        { text: "{ a: 1 }", feedback: "The variable holds the property's value." }
                    ],
                    confirm: "The value, by name."
                }
            }
        ]
    },
    {
        concept: "object-references",
        title: "One object, two names",
        why: "This is the bug that makes a change appear somewhere you never touched.",
        teach: [
            {
                code: "let a = { x: 1 };\nlet b = a;\nb.x = 9;\nconsole.log(a.x);",
                output: "9",
                note: "`let b = a` copied the way to reach the object, not the object.",
                parts: [
                    { piece: "let b = a", means: "a second name for ONE object" },
                    { piece: "b.x = 9", means: "changes the object both names hold" }
                ]
            },
            {
                code: 'let settings = { theme: "dark" };\nlet copy = { ...settings };\ncopy.theme = "light";\nconsole.log(settings.theme);',
                output: "dark",
                note: "Spread builds a new object with the same properties. Now there really are two.",
                parts: [{ piece: "{ ...settings }", means: "a new object, one level deep" }]
            }
        ],
        notice: "A name holds a way to REACH an object. Copying that still leads to the one object.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let a = { x: 1 };\nlet b = a;\nb.x = 9;\nconsole.log(a.x);",
                choices: [
                    { text: "9", correct: true },
                    { text: "1", feedback: "There is only one object, and it was changed." },
                    { text: "an error", feedback: "Nothing here is invalid — it just does more than it looks like." }
                ],
                confirm: "One object, two names.",
                retry: {
                    demand: "predict",
                    ask: "And with a real copy?",
                    code: "let a = { x: 1 };\nlet b = { ...a };\nb.x = 9;\nconsole.log(a.x);",
                    choices: [
                        { text: "1", correct: true },
                        { text: "9", feedback: "Spread made a second object, so `a` was untouched." }
                    ],
                    confirm: "Two objects now."
                }
            },
            {
                demand: "diagnose",
                ask: "This should leave the original alone and changes it. Which line is the cause?",
                code: 'let settings = { theme: "dark" };\nlet copy = settings;\ncopy.theme = "light";\nconsole.log(settings.theme);',
                choices: [
                    { text: "let copy = settings;", correct: true },
                    { text: 'copy.theme = "light";', feedback: "Changing a copy would be fine. The trouble is that this is not one." },
                    { text: "console.log(settings.theme);", feedback: "It printed exactly what it was given; the trouble is further up." }
                ],
                confirm: "The name says copy; the line does not make one."
            },
            {
                demand: "explain",
                ask: "Why does assigning an object to a second name not copy it?",
                choices: [
                    { text: "The name holds a reference to the object, and assigning copies the reference rather than the contents", correct: true },
                    { text: "Objects are too large to copy automatically", feedback: "Size has nothing to do with it — a one-property object behaves the same way." },
                    { text: "Only arrays are copied when assigned", feedback: "Arrays behave exactly like this too." }
                ],
                confirm: "The reference is what gets copied."
            }
        ]
    },
    {
        concept: "json-shape",
        title: "An object as text",
        why: "Anything that leaves your program — saved, sent, stored — leaves as text.",
        teach: [
            {
                code: 'let p = { name: "Tati", age: 3 };\nlet text = JSON.stringify(p);\nconsole.log(text);\nconsole.log(JSON.parse(text).name);',
                output: '{"name":"Tati","age":3}\nTati',
                note: "Out to text with stringify, back to an object with parse.",
                parts: [
                    { piece: "JSON.stringify", means: "object to text" },
                    { piece: "JSON.parse", means: "text back to an object" }
                ]
            },
            {
                code: "let p = { a: 1, f: () => 1 };\nconsole.log(JSON.stringify(p));",
                output: '{"a":1}',
                note: "JSON carries data, not behaviour. The function was dropped without a word.",
                parts: [{ piece: "f: () => 1", means: "gone — and so would undefined be" }]
            }
        ],
        notice: "A round trip can quietly give back less than you put in.",
        steps: [
            {
                demand: "recognise",
                ask: "Which one turns an object into text?",
                choices: [
                    { text: "JSON.stringify(p)", correct: true },
                    { text: "JSON.parse(p)", feedback: "That goes the other way: text into an object." },
                    { text: "p.toText()", feedback: "There is no such method — the conversion lives on JSON, not on the object." }
                ],
                confirm: "stringify goes out, parse comes back."
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let p = { a: 1, f: () => 1 };\nconsole.log(JSON.stringify(p));",
                choices: [
                    { text: '{"a":1}', correct: true },
                    { text: '{"a":1,"f":null}', feedback: "In an object the key is dropped entirely. In a LIST it would become null." },
                    { text: "an error", feedback: "It does not complain — which is what makes it worth knowing." }
                ],
                confirm: "Functions do not survive.",
                retry: {
                    demand: "predict",
                    ask: "And undefined?",
                    code: "console.log(JSON.stringify({ a: 1, b: undefined }));",
                    choices: [
                        { text: '{"a":1}', correct: true },
                        { text: '{"a":1,"b":undefined}', feedback: "JSON has no way to write undefined at all." }
                    ],
                    confirm: "Dropped, like a function."
                }
            }
        ]
    },
    {
        concept: "built-in-collections",
        title: "When an object is the wrong shape",
        why: "Two ready-made collections that solve problems a plain object solves awkwardly.",
        teach: [
            {
                code: "let s = new Set([1, 1, 2, 2, 3]);\nconsole.log(s.size);\nconsole.log(s.has(2));",
                output: "3\ntrue",
                note: "A Set never holds a value twice. Counting distinct things is one line.",
                parts: [
                    { piece: "new Set([...])", means: "builds from a list, dropping repeats" },
                    { piece: ".size", means: "how many distinct values" }
                ]
            },
            {
                code: 'let m = new Map();\nm.set("a", 1);\nconsole.log(m.get("a"));\nconsole.log(m.size);',
                output: "1\n1",
                note: "A Map keeps pairs, and its keys do not have to be text.",
                parts: [{ piece: ".set / .get", means: "the pair going in, and coming back" }]
            }
        ],
        notice: "A Set is about uniqueness. A Map is about pairs.",
        steps: [
            {
                demand: "recall",
                ask: "Which one holds each value only once, however many times it is added?",
                choices: [
                    { text: "a Set", correct: true },
                    { text: "a Map", feedback: "A Map holds pairs; its KEYS are unique, but that is a different thing." },
                    { text: "an array", feedback: "An array keeps everything, repeats included." }
                ],
                confirm: "Uniqueness is what a Set is."
            },
            {
                demand: "recognise",
                ask: "Which one counts how many DIFFERENT numbers are in the list?",
                code: "let nums = [1, 1, 2];",
                choices: [
                    { text: "new Set(nums).size", correct: true },
                    { text: "nums.length", feedback: "That counts every entry, repeats and all." },
                    { text: "nums.size", feedback: "Lists have `length`; `size` belongs to Sets and Maps." }
                ],
                confirm: "Build a Set, then count it."
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let s = new Set([1, 1, 2, 2, 3]);\nconsole.log(s.size);",
                choices: [
                    { text: "3", correct: true },
                    { text: "5", feedback: "Five went in, but a Set never holds the same value twice." },
                    { text: "2", feedback: "There are three distinct values: 1, 2 and 3." }
                ],
                confirm: "Repeats never arrived.",
                retry: {
                    demand: "predict",
                    ask: "And the list it came from?",
                    code: "let nums = [1, 1, 2, 2, 3];\nconsole.log(nums.length);",
                    choices: [
                        { text: "5", correct: true },
                        { text: "3", feedback: "The list still holds everything — only the Set dropped repeats." }
                    ],
                    confirm: "Which is the whole difference."
                }
            }
        ]
    }
];

/*
 * ERRORS.
 *
 * The topic that gave littleJs error types, `throw`, `try`/`catch`/`finally`
 * and a call stack. Every example has been run, and every trace shown is one
 * the interpreter actually produced.
 */
export const ERROR_LESSONS: readonly Lesson[] = [
    {
        concept: "error-types",
        title: "What kind of wrong",
        why: "The type is the first word of the message, and it narrows the search before you read anything else.",
        teach: [
            {
                code: "let user = {};\nconsole.log(user.profile.name);",
                output: "TypeError",
                note: "`user.profile` is undefined, and reading `.name` from nothing is a TypeError.",
                parts: [
                    { piece: "TypeError", means: "a value was used as a kind of thing it is not" },
                    { piece: "user.profile", means: "undefined — there is nothing to read from" }
                ]
            },
            {
                code: "console.log(total);",
                output: "ReferenceError",
                note: "A different kind of wrong: this name was never declared at all.",
                parts: [{ piece: "ReferenceError", means: "the NAME does not exist" }]
            }
        ],
        notice: "TypeError is about what a value is. ReferenceError is about a name that is not there.",
        steps: [
            {
                demand: "recall",
                ask: "Which type means a value was used as a kind of thing it is not?",
                choices: [
                    { text: "TypeError", correct: true },
                    { text: "ReferenceError", feedback: "That one means the NAME does not exist at all." },
                    { text: "RangeError", feedback: "That one is about running away — too deep, or too long." }
                ],
                confirm: "About the value, not the name."
            },
            {
                demand: "recognise",
                ask: "Which error does this cause?",
                code: "let user = {};\nconsole.log(user.profile.name);",
                choices: [
                    { text: "TypeError", correct: true },
                    { text: "ReferenceError", feedback: "`user` was declared on the line above, so the name exists." },
                    { text: "SyntaxError", feedback: "The code is written correctly — it fails while running, not while being read." }
                ],
                confirm: "Reading from nothing.",
                retry: {
                    demand: "recognise",
                    ask: "And this one?",
                    code: "console.log(total);",
                    choices: [
                        { text: "ReferenceError", correct: true },
                        { text: "TypeError", feedback: "There is no value involved — the name itself was never declared." }
                    ],
                    confirm: "No such name."
                }
            }
        ]
    },
    {
        concept: "throwing",
        title: "Refusing to carry on",
        why: "When a function is given something it cannot work with, stopping loudly beats returning something wrong.",
        teach: [
            {
                code: 'function withdraw(amount) {\n  if (amount <= 0) {\n    throw new Error("Amount must be positive");\n  }\n  return amount;\n}\nconsole.log(withdraw(5));',
                output: "5",
                note: "A guard that throws. The good case is unaffected.",
                parts: [
                    { piece: "throw", means: "stop here and hand this error to the caller" },
                    { piece: 'new Error("...")', means: "the error itself, with a message" }
                ]
            },
            {
                code: 'function check(n) {\n  if (n < 0) {\n    throw new Error("negative");\n  }\n  return n;\n}\nconsole.log(check(5));\nconsole.log(check(-1));',
                output: "5\nthen the program stops",
                note: "Nothing caught it, so the second log never ran — and nor would anything after it.",
                parts: [{ piece: "check(-1)", means: "threw, and stopped everything" }]
            }
        ],
        notice: "Throwing stops the work. Returning an error hands back a value nobody has to look at.",
        steps: [
            {
                demand: "recognise",
                ask: "Which line refuses the bad input and stops the function?",
                code: "function withdraw(amount) {\n  // ...\n}",
                choices: [
                    { text: 'throw new Error("Amount must be positive");', correct: true },
                    { text: 'console.log("Amount must be positive");', feedback: "That prints and then carries on with the bad amount." },
                    { text: 'return new Error("Amount must be positive");', feedback: "That hands back an error as an ordinary value, which the caller may never check." }
                ],
                confirm: "Only `throw` stops it."
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'function check(n) {\n  if (n < 0) {\n    throw new Error("negative");\n  }\n  return n;\n}\nconsole.log(check(5));\nconsole.log(check(-1));',
                choices: [
                    { text: "5, and then the program stops with an error", correct: true },
                    { text: "5 then -1", feedback: "The second call never returned — it threw." },
                    { text: "5 then negative", feedback: "The message is not printed; it travels with the error." }
                ],
                confirm: "One good call, then a stop.",
                retry: {
                    demand: "predict",
                    ask: "And with the call caught?",
                    code: 'function check(n) {\n  if (n < 0) {\n    throw new Error("negative");\n  }\n  return n;\n}\ntry {\n  check(-1);\n} catch (e) {\n  console.log("handled");\n}',
                    choices: [
                        { text: "handled", correct: true },
                        { text: "nothing", feedback: "The catch block ran, and it printed." }
                    ],
                    confirm: "Caught, so not fatal."
                }
            }
        ]
    },
    {
        concept: "try-catch",
        title: "Deciding what happens next",
        why: "A failure you expected is not an emergency — it is a branch you have not written yet.",
        teach: [
            {
                code: 'try {\n  throw new Error("x");\n} catch (e) {\n  console.log("caught");\n} finally {\n  console.log("always");\n}\nconsole.log("after");',
                output: "caught\nalways\nafter",
                note: "Three blocks, three different times. And the program carried on.",
                parts: [
                    { piece: "try", means: "the risky work" },
                    { piece: "catch (e)", means: "runs only if it failed; `e` is what was thrown" },
                    { piece: "finally", means: "runs either way" }
                ]
            },
            {
                code: 'let u = {};\ntry {\n  console.log(u.a.b);\n} catch (e) {\n  console.log(e.name);\n}',
                output: "TypeError",
                note: "Failures JavaScript raises can be caught too, and they arrive with their type.",
                parts: [{ piece: "e.name", means: "the type of whatever was caught" }]
            }
        ],
        notice: "`finally` is the tidying up, so it is not tied to whether anything failed.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'try {\n  throw new Error("x");\n} catch (e) {\n  console.log("caught");\n} finally {\n  console.log("always");\n}\nconsole.log("after");',
                choices: [
                    { text: "caught, always, after", correct: true },
                    { text: "caught, after", feedback: "`finally` runs too — that is what makes it finally." },
                    { text: "caught, always", feedback: "Catching it means the program was not stopped, so `after` ran." }
                ],
                confirm: "All three, in that order.",
                retry: {
                    demand: "predict",
                    ask: "And when nothing fails?",
                    code: 'try {\n  console.log("fine");\n} catch (e) {\n  console.log("caught");\n} finally {\n  console.log("always");\n}',
                    choices: [
                        { text: "fine, always", correct: true },
                        { text: "fine, caught, always", feedback: "`catch` only runs when something was thrown." }
                    ],
                    confirm: "No failure, no catch — but still finally."
                }
            },
            {
                demand: "explain",
                ask: "Why does finally run even when catch has already dealt with the error?",
                choices: [
                    { text: "finally is for work that has to happen either way, so it is not tied to whether anything failed", correct: true },
                    { text: "catch has not finished handling the error until finally runs", feedback: "`catch` is finished when its block ends; `finally` is a separate promise." },
                    { text: "finally always runs before catch", feedback: "It runs after — you can see the order in the output." }
                ],
                confirm: "Tidying up, either way."
            }
        ]
    },
    {
        concept: "stack-traces",
        title: "Where it happened",
        why: "The trace tells you which line was running, which is almost always where to start.",
        teach: [
            {
                code: 'function format(u) {\n  return u.name.toUpperCase();\n}\nfunction render(u) {\n  return format(u);\n}\nrender({});',
                output: "TypeError\n    at format\n    at render",
                note: "Most recent first. `format` was running; `render` was waiting for it.",
                parts: [
                    { piece: "at format", means: "the top — where it actually failed" },
                    { piece: "at render", means: "the call that was still waiting" }
                ]
            }
        ],
        notice: "The top of a trace is where it broke. The lines under it are who was waiting.",
        steps: [
            {
                demand: "recognise",
                ask: "Which function was running when it failed?",
                code: "TypeError: cannot read .toUpperCase of undefined\n    at format\n    at render",
                choices: [
                    { text: "format", correct: true },
                    { text: "render", feedback: "`render` called `format` and was waiting for it to come back." },
                    { text: "both at the same time", feedback: "Only one line runs at a time; the rest are paused." }
                ],
                confirm: "The top of the trace.",
                retry: {
                    demand: "recognise",
                    ask: "Simpler: in a trace, which end is where it broke?",
                    code: "    at inner      <- ?\n    at middle\n    at outer      <- ?",
                    choices: [
                        { text: "the top", correct: true },
                        { text: "the bottom", feedback: "The bottom is where it all started — the first call, not the failing one." }
                    ],
                    confirm: "Most recent first."
                }
            },
            {
                demand: "diagnose",
                ask: "The trace is `at format` then `at render`. Which line is the cause?",
                code: "function format(u) {\n  return u.name.toUpperCase();\n}\nfunction render(u) {\n  return format(u);\n}\nrender({});",
                choices: [
                    { text: "return u.name.toUpperCase();", correct: true },
                    { text: "return format(u);", feedback: "That call is in the trace because it was waiting, not because it is wrong." },
                    { text: "render({});", feedback: "Passing an empty object is what EXPOSED the bug, but the failing line is in format." }
                ],
                confirm: "Top of the trace, and the line it names.",
                aside: "Worth knowing: the line that PUT the bad value there is often further down than the one that failed."
            },
            {
                demand: "explain",
                ask: "Why is the top line of a trace usually the most useful?",
                choices: [
                    { text: "It is where execution actually was when it failed, and the lines below are calls still waiting", correct: true },
                    { text: "It is the first function the program ran", feedback: "That would be the BOTTOM of the trace, not the top." },
                    { text: "The lines below belong to the language rather than to your program", feedback: "They are your functions too — just paused ones." }
                ],
                confirm: "Top of the pile is what was running."
            }
        ]
    },
    {
        concept: "debugging-strategy",
        title: "Narrowing it down",
        why: "Changing things until it works teaches you nothing, and usually takes longer.",
        teach: [
            {
                code: "// right here:   the data going in\n// wrong here:   the total coming out\n// so check:     a value in the middle",
                output: "half the code ruled out, either way",
                note: "Two known points turn a search into halving. Each check removes half of what is left.",
                parts: [
                    { piece: "two known points", means: "one place it is right, one place it is wrong" },
                    { piece: "a check between them", means: "rules out half, whichever answer it gives" }
                ]
            },
            {
                code: "// one change  -> the next run answers one question\n// three changes -> a working program, and three suspects",
                output: "information per attempt",
                note: "More runs, fewer dead ends.",
                parts: [{ piece: "one change", means: "a result you can actually read" }]
            }
        ],
        notice: "A hypothesis is only worth having if a single change could show it was wrong.",
        steps: [
            {
                demand: "diagnose",
                ask: "Data is right going into a long function and wrong coming out. What is the most useful next check?",
                choices: [
                    { text: "A value halfway through, to halve what is left to search", correct: true },
                    { text: "The data source again, to be certain", feedback: "You already know it is right there — the check would tell you nothing new." },
                    { text: "Every line from the top, in order", feedback: "That works eventually, and halving gets there in far fewer steps." }
                ],
                confirm: "Halve the range.",
                retry: {
                    demand: "diagnose",
                    ask: "Simpler: you know it is right at line 1 and wrong at line 100. Where do you look?",
                    code: "// right at 1\n// wrong at 100",
                    choices: [
                        { text: "around line 50", correct: true },
                        { text: "line 2, then line 3, and so on", feedback: "That is up to 98 checks. One in the middle rules out half of them at once." }
                    ],
                    confirm: "In the middle, every time."
                }
            },
            {
                demand: "explain",
                ask: "Why is changing one thing at a time faster, even though it means more runs?",
                choices: [
                    { text: "Each run answers one question, so the result rules something in or out", correct: true },
                    { text: "Several changes take longer to type", feedback: "Typing is not what costs you — not knowing which change mattered is." },
                    { text: "JavaScript only applies the first change it finds", feedback: "It applies all of them, which is precisely the problem." }
                ],
                confirm: "Information per attempt.",
                aside: "Three changes and a working program leave you with three suspects and no way to choose between them."
            }
        ]
    }
];

/*
 * THE DOM.
 *
 * The only topic with host objects. littleJs deliberately had no `document`
 * for twelve topics; this one cannot be taught honestly without one, because
 * `event-order` is a claim about a journey rather than about a line. Every
 * example here was run against a real tree.
 */
export const DOM_LESSONS: readonly Lesson[] = [
    {
        concept: "selecting-elements",
        title: "Finding things on the page",
        why: "Everything else in the DOM starts with getting hold of an element.",
        teach: [
            {
                code: '<ul id="list">\n  <li class="item">A</li>\n  <li class="item done">B</li>\n</ul>\n\nconsole.log(document.querySelectorAll(".item").length);\nconsole.log(document.querySelector(".item").textContent);',
                output: "2\nA",
                note: "Selectors are the ones you already know from CSS.",
                parts: [
                    { piece: "querySelectorAll", means: "every match, as a list" },
                    { piece: "querySelector", means: "the first match, or null" },
                    { piece: '".item"', means: "a class — `#` would be an id, a bare word a tag" }
                ]
            },
            {
                code: 'console.log(document.querySelector("#nope"));',
                output: "null",
                note: "Nothing found is `null`, not an error — so the failure usually appears a line later.",
                parts: [{ piece: "null", means: "no match; reading a property of it is what fails" }]
            }
        ],
        notice: "querySelector gives one or null. querySelectorAll gives a list, possibly empty.",
        steps: [
            {
                demand: "recognise",
                ask: "Which one finds EVERY item in the list?",
                code: '<ul id="list">\n  <li class="item">A</li>\n  <li class="item done">B</li>\n</ul>',
                choices: [
                    { text: 'document.querySelectorAll(".item")', correct: true },
                    { text: 'document.querySelector(".item")', feedback: "That stops at the first one it finds." },
                    { text: 'document.querySelectorAll("#item")', feedback: "`#` looks for an id, and nothing here has that id." }
                ],
                confirm: "All of them, as a list.",
                retry: {
                    demand: "recognise",
                    ask: "And which finds the list itself?",
                    code: '<ul id="list"> ... </ul>',
                    choices: [
                        { text: 'document.querySelector("#list")', correct: true },
                        { text: 'document.querySelector(".list")', feedback: "`.` looks for a class; `list` here is an id." }
                    ],
                    confirm: "`#` for an id."
                }
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'console.log(document.querySelectorAll(".item").length);\nconsole.log(document.querySelector("#nope"));',
                choices: [
                    { text: "2 then null", correct: true },
                    { text: "2 then undefined", feedback: "A missing element is `null` — `undefined` is what a missing PROPERTY gives." },
                    { text: "2 then an error", feedback: "Not finding something is allowed; using what you did not find is what fails." }
                ],
                confirm: "Two found, one not.",
                aside: "A selector typo almost always shows up on the next line, as \"cannot read property of null\"."
            }
        ]
    },
    {
        concept: "element-properties",
        title: "Reading and changing an element",
        why: "An element is an object, and its properties are the page itself rather than a description of it.",
        teach: [
            {
                code: '<div id="panel"><h2 class="title">Scores</h2></div>\n\nlet t = document.querySelector(".title");\nt.textContent = "Totals";\nconsole.log(t.textContent);\nconsole.log(t.tagName);',
                output: "Totals\nH2",
                note: "Setting the property changed the page. There is no separate step.",
                parts: [
                    { piece: "textContent", means: "the text inside, readable and writable" },
                    { piece: "tagName", means: "the tag, in capitals" }
                ]
            }
        ],
        notice: "The element in your variable IS the thing on screen. Nothing is copied.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'let t = document.querySelector(".title");\nt.textContent = "Totals";\nconsole.log(t.textContent);\nconsole.log(t.tagName);',
                choices: [
                    { text: "Totals then H2", correct: true },
                    { text: "Scores then H2", feedback: "The line above replaced the text, and reading it back gives the new one." },
                    { text: "Totals then h2", feedback: "`tagName` comes back in capitals — worth knowing before comparing it." }
                ],
                confirm: "Changed, and in capitals.",
                retry: {
                    demand: "predict",
                    ask: "Simpler: what does this print?",
                    code: '<h2 class="title">Scores</h2>\n\nconsole.log(document.querySelector(".title").textContent);',
                    choices: [
                        { text: "Scores", correct: true },
                        { text: "title", feedback: "That is the class. `textContent` is the text inside the tag." }
                    ],
                    confirm: "The text inside."
                }
            },
            {
                demand: "explain",
                ask: "Why does setting textContent change the screen straight away?",
                choices: [
                    { text: "The element you are holding is the page itself, not a copy of it", correct: true },
                    { text: "The browser re-reads the HTML file after every change", feedback: "The HTML file is never read again after the page loads." },
                    { text: "querySelector returns a copy that is kept in step", feedback: "There is no copy to keep in step — it is the same object." }
                ],
                confirm: "One object, not two."
            }
        ]
    },
    {
        concept: "event-listeners",
        title: "Code that runs later",
        why: "Nearly everything a page does is a function you handed over in advance.",
        teach: [
            {
                code: 'let t = document.querySelector(".title");\nt.addEventListener("click", () => {\n  console.log("clicked");\n});\nconsole.log("set up");\nt.click();',
                output: "set up\nclicked",
                note: "Adding a listener does not run it. \"set up\" printed first, though its line is second.",
                parts: [
                    { piece: '"click"', means: "which event to wait for" },
                    { piece: "() => { ... }", means: "the function, handed over for later" }
                ]
            },
            {
                code: 'function handle() {\n  console.log("clicked");\n}\nt.addEventListener("click", handle());',
                output: "clicked, and then a failure",
                note: "The brackets called it NOW and registered its result — undefined — as the listener.",
                parts: [{ piece: "handle()", means: "the result, not the function" }]
            }
        ],
        notice: "Hand over the function without brackets. With them you hand over its answer.",
        steps: [
            {
                demand: "recognise",
                ask: "Which line runs `handle` when the button is clicked?",
                choices: [
                    { text: 'button.addEventListener("click", handle);', correct: true },
                    { text: 'button.addEventListener("click", handle());', feedback: "That calls it immediately and registers whatever it returned." },
                    { text: 'button.addEventListener(handle, "click");', feedback: "The event name comes first, then the function." }
                ],
                confirm: "No brackets."
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'let t = document.querySelector(".title");\nt.addEventListener("click", () => {\n  console.log("clicked");\n});\nconsole.log("set up");\nt.click();',
                choices: [
                    { text: "set up then clicked", correct: true },
                    { text: "clicked then set up", feedback: "The listener waited for the click, which happens on the last line." },
                    { text: "set up only", feedback: "`t.click()` is the click — the listener ran." }
                ],
                confirm: "Registered first, run later.",
                retry: {
                    demand: "predict",
                    ask: "And with no click at all?",
                    code: 'let t = document.querySelector(".title");\nt.addEventListener("click", () => {\n  console.log("clicked");\n});\nconsole.log("set up");',
                    choices: [
                        { text: "set up", correct: true },
                        { text: "set up then clicked", feedback: "Nothing clicked it, so the listener never ran." }
                    ],
                    confirm: "Waiting, not running."
                }
            },
            {
                demand: "diagnose",
                ask: "This logs once immediately and then fails. Which line is the cause?",
                code: 'let t = document.querySelector(".title");\nfunction handle() {\n  console.log("clicked");\n}\nt.addEventListener("click", handle());\nt.click();',
                choices: [
                    { text: 't.addEventListener("click", handle());', correct: true },
                    { text: "function handle() {", feedback: "The function is fine — it is how it is handed over that is not." },
                    { text: "t.click();", feedback: "Clicking is what was meant to work; it fails because nothing useful was registered." }
                ],
                confirm: "Brackets called it too early."
            }
        ]
    },
    {
        concept: "event-order",
        title: "An event is a journey",
        why: "A click is not one moment on one element — it passes through everything containing it.",
        teach: [
            {
                code: '<div id="panel"><h2 class="title">Scores</h2></div>\n\nlet outer = document.querySelector("#panel");\nlet inner = document.querySelector(".title");\nouter.addEventListener("click", () => { console.log("outer"); });\ninner.addEventListener("click", () => { console.log("inner"); });\ninner.click();',
                output: "inner\nouter",
                note: "The click reached the title, then travelled back up through the panel.",
                parts: [
                    { piece: "inner", means: "the target — reached first" },
                    { piece: "outer", means: "an ancestor — reached on the way back up" }
                ]
            },
            {
                code: 'outer.addEventListener("click", () => { console.log("capture"); }, true);\ninner.addEventListener("click", () => { console.log("target"); });\ninner.click();',
                output: "capture\ntarget",
                note: "A third argument of `true` listens on the way DOWN instead.",
                parts: [{ piece: "true", means: "capture: runs before the target, not after" }]
            }
        ],
        notice: "Down to the target, then back up. Most listeners run on the way up.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log when the title is clicked?",
                code: 'let outer = document.querySelector("#panel");\nlet inner = document.querySelector(".title");\nouter.addEventListener("click", () => { console.log("outer"); });\ninner.addEventListener("click", () => { console.log("inner"); });\ninner.click();',
                choices: [
                    { text: "inner then outer", correct: true },
                    { text: "outer then inner", feedback: "That is the capture order, which needs a third argument of `true`." },
                    { text: "inner only", feedback: "The event carried on up to the panel, and its listener ran too." }
                ],
                confirm: "Target first, then upwards.",
                retry: {
                    demand: "predict",
                    ask: "And with the outer one set to capture?",
                    code: 'outer.addEventListener("click", () => { console.log("outer"); }, true);\ninner.addEventListener("click", () => { console.log("inner"); });\ninner.click();',
                    choices: [
                        { text: "outer then inner", correct: true },
                        { text: "inner then outer", feedback: "`true` moves that listener to the way down, before the target." }
                    ],
                    confirm: "Capture runs first."
                }
            },
            {
                demand: "explain",
                ask: "Why does clicking a child also run a listener on its parent?",
                choices: [
                    { text: "The event travels back up through the ancestors after reaching the target", correct: true },
                    { text: "The parent's listener is copied onto each child", feedback: "Nothing is copied — there is one listener, and the event comes to it." },
                    { text: "Listeners always run in the order they were added", feedback: "Order here is decided by the journey, not by when you called addEventListener." }
                ],
                confirm: "It passes through on the way up.",
                aside: "Which is why one listener on a container can serve every element inside it."
            }
        ]
    },
    {
        concept: "dom-as-tree",
        title: "The page is a tree",
        why: "Once you can see the shape, moving around it stops being guesswork.",
        teach: [
            {
                code: '<div id="panel"><h2 class="title">Scores</h2></div>\n\nlet title = document.querySelector(".title");\nconsole.log(title.parentElement.id);\nconsole.log(title.parentElement.children.length);',
                output: "panel\n1",
                note: "Up with `parentElement`, down with `children`. Every element has both.",
                parts: [
                    { piece: "parentElement", means: "one step up" },
                    { piece: "children", means: "the elements directly inside" }
                ]
            }
        ],
        notice: "Every element knows its parent and its children, so you can walk either way from anywhere.",
        steps: [
            {
                demand: "recognise",
                ask: "Which one reaches the element that CONTAINS the title?",
                code: '<div id="panel"><h2 class="title">Scores</h2></div>',
                choices: [
                    { text: "title.parentElement", correct: true },
                    { text: "title.parent", feedback: "Not a property an element has — the full name is `parentElement`." },
                    { text: "title.children[0]", feedback: "That goes down, into the title, rather than up out of it." }
                ],
                confirm: "One step up.",
                retry: {
                    demand: "recognise",
                    ask: "And which goes the other way?",
                    code: "// from the panel, to what is inside it",
                    choices: [
                        { text: "panel.children", correct: true },
                        { text: "panel.parentElement", feedback: "That goes up, away from what is inside." }
                    ],
                    confirm: "Down into it."
                }
            },
            {
                demand: "explain",
                ask: "Why can the whole page be reached from any single element?",
                choices: [
                    { text: "Every element knows its parent and its children, so the tree can be walked either way from anywhere", correct: true },
                    { text: "Each element holds a list of every other element", feedback: "It only knows its immediate neighbours — that is enough." },
                    { text: "The elements are really stored in one flat list", feedback: "They are a tree; the nesting in the HTML is the shape." }
                ],
                confirm: "Links up and links down."
            }
        ]
    }
];

/*
 * ASYNC.
 *
 * The topic that taught littleJs to wait: two queues, promises, `setTimeout`
 * and real suspension at `await`. Every example here has been run, and the
 * ordering in each is the ordering the interpreter actually produces.
 */
export const ASYNC_LESSONS: readonly Lesson[] = [
    {
        concept: "callbacks",
        title: "Handing work over",
        why: "Most of what a program waits for is handled by giving someone else a function to call when it is ready.",
        teach: [
            {
                code: 'function later(fn) {\n  setTimeout(fn, 0);\n}\nconsole.log("asked");\nlater(() => { console.log("ran"); });\nconsole.log("carried on");',
                output: "asked\ncarried on\nran",
                note: "Handing a function over is not running it. The rest of the file finished first.",
                parts: [
                    { piece: "later(fn)", means: "takes a function and arranges for it" },
                    { piece: "() => {...}", means: "handed over, not called" },
                    { piece: "ran", means: "last, even with a delay of 0" }
                ]
            }
        ],
        notice: "A callback is a function you hand over now to be called later.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'function later(fn) {\n  setTimeout(fn, 0);\n}\nconsole.log("asked");\nlater(() => { console.log("ran"); });\nconsole.log("carried on");',
                choices: [
                    { text: "asked, carried on, ran", correct: true },
                    { text: "asked, ran, carried on", feedback: "Nothing queued can run while ordinary lines are still going." },
                    { text: "ran, asked, carried on", feedback: "The callback had not even been handed over yet." }
                ],
                confirm: "Queued work waits its turn.",
                retry: {
                    demand: "predict",
                    ask: "Simpler: does handing a function over run it?",
                    code: "later(() => { console.log(\"ran\"); });",
                    choices: [
                        { text: "no — it runs later", correct: true },
                        { text: "yes — immediately", feedback: "The brackets that would run it are not there." }
                    ],
                    confirm: "Handed over, not called."
                }
            },
            {
                demand: "diagnose",
                ask: "This logs immediately and then fails. Which line is the cause?",
                code: 'function later(fn) {\n  setTimeout(fn, 0);\n}\nfunction hi() {\n  console.log("hi");\n}\nlater(hi());',
                choices: [
                    { text: "later(hi());", correct: true },
                    { text: "setTimeout(fn, 0);", feedback: "That is fine — it is what it was given that is wrong." },
                    { text: "function hi() {", feedback: "The function itself is correct." }
                ],
                confirm: "Brackets called it too early."
            }
        ]
    },
    {
        concept: "promise-states",
        title: "A value that is coming",
        why: "A promise is how JavaScript hands you something that does not exist yet.",
        teach: [
            {
                code: 'let p = new Promise((resolve) => {\n  setTimeout(() => { resolve("done"); }, 0);\n});\nconsole.log(p);',
                output: "Promise { pending }",
                note: "Printed before the timer finished, so it has not settled yet.",
                parts: [
                    { piece: "pending", means: "not settled — no value yet" },
                    { piece: "resolve(\"done\")", means: "settles it, once and for good" }
                ]
            },
            {
                code: 'console.log(Promise.resolve(2));\nconsole.log(Promise.reject("no"));',
                output: 'Promise { 2 }\nPromise { rejected: no }',
                note: "The two ways it can settle: fulfilled with a value, or rejected with a reason.",
                parts: [{ piece: "settled", means: "fixed — it will never change again" }]
            }
        ],
        notice: "Pending, then fulfilled or rejected. Once settled, never again.",
        steps: [
            {
                demand: "recognise",
                ask: "A promise has settled. Which pair of states can it be in?",
                choices: [
                    { text: "fulfilled or rejected", correct: true },
                    { text: "pending or waiting", feedback: "Pending is the state BEFORE it settles." },
                    { text: "done or failed", feedback: "The right idea, but not the words JavaScript uses." }
                ],
                confirm: "Two ways to settle."
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'let p = new Promise((resolve) => {\n  setTimeout(() => { resolve("done"); }, 0);\n});\nconsole.log(p);',
                choices: [
                    { text: "Promise { pending }", correct: true },
                    { text: "done", feedback: "The timer has not fired yet when this line runs." },
                    { text: "undefined", feedback: "`p` holds the promise itself, which is a real value." }
                ],
                confirm: "Still waiting.",
                retry: {
                    demand: "predict",
                    ask: "And one that has already settled?",
                    code: "console.log(Promise.resolve(2));",
                    choices: [
                        { text: "Promise { 2 }", correct: true },
                        { text: "2", feedback: "It is still a promise — printing it shows the promise, not the value." }
                    ],
                    confirm: "A handle on the value, not the value."
                }
            },
            {
                demand: "explain",
                ask: "Why can a `.then` be attached to a promise that has already settled?",
                choices: [
                    { text: "a settled promise keeps its result, so a handler added later still receives it", correct: true },
                    { text: "the promise waits a moment in case anything attaches", feedback: "It does not wait — the result is simply kept." },
                    { text: "attaching a handler puts it back into pending", feedback: "Settling is permanent; nothing moves it back." }
                ],
                confirm: "The result is kept."
            }
        ]
    },
    {
        concept: "event-loop",
        title: "Whose turn it is",
        why: "Output arriving in an order you did not expect is almost always this, and the rule is short.",
        teach: [
            {
                code: 'console.log("1");\nsetTimeout(() => { console.log("4"); }, 0);\nPromise.resolve().then(() => { console.log("3"); });\nconsole.log("2");',
                output: "1\n2\n3\n4",
                note: "Ordinary lines first, then promise work, then timers.",
                parts: [
                    { piece: "1 and 2", means: "ordinary code — runs to the end first" },
                    { piece: "3", means: "promise work — next in line" },
                    { piece: "4", means: "a timer — last, even at 0" }
                ]
            }
        ],
        notice: "All synchronous code finishes, then queued work runs.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'console.log("1");\nsetTimeout(() => { console.log("4"); }, 0);\nPromise.resolve().then(() => { console.log("3"); });\nconsole.log("2");',
                choices: [
                    { text: "1, 2, 3, 4", correct: true },
                    { text: "1, 2, 4, 3", feedback: "Promise work goes ahead of timers." },
                    { text: "1, 3, 2, 4", feedback: "Nothing queued runs while ordinary lines are still going." }
                ],
                confirm: "Sync, then promises, then timers.",
                retry: {
                    demand: "predict",
                    ask: "Simpler: which comes first?",
                    code: 'setTimeout(() => { console.log("timer"); }, 0);\nconsole.log("now");',
                    choices: [
                        { text: "now, then timer", correct: true },
                        { text: "timer, then now", feedback: "A delay of 0 still means `after this code finishes`." }
                    ],
                    confirm: "Ordinary lines always finish first."
                }
            },
            {
                demand: "explain",
                ask: "Why does `setTimeout(f, 0)` not run f straight away?",
                choices: [
                    { text: "f is queued, and the queue is only read once the current code has finished", correct: true },
                    { text: "a delay of 0 is rounded up by the browser", feedback: "Even an exact 0 would still wait for the queue." },
                    { text: "f runs now but its output is held back", feedback: "It genuinely has not run yet." }
                ],
                confirm: "One thread, one queue."
            }
        ]
    },
    {
        concept: "async-await",
        title: "Waiting without the mess",
        why: "`await` lets asynchronous code read top to bottom like ordinary code.",
        teach: [
            {
                code: 'async function go() {\n  console.log("a");\n  const v = await Promise.resolve(1);\n  console.log(v);\n}\ngo();\nconsole.log("b");',
                output: "a\nb\n1",
                note: "At the await, `go` hands control back. \"b\" runs, then the rest of `go`.",
                parts: [
                    { piece: "async", means: "this function may wait, and hands back a promise" },
                    { piece: "await", means: "pause HERE until the promise settles" },
                    { piece: "b", means: "runs while go is paused — the page is not frozen" }
                ]
            }
        ],
        notice: "`await` pauses the function it is in, not the program.",
        steps: [
            {
                demand: "recognise",
                ask: "Which one waits for the value and then uses it?",
                choices: [
                    { text: "const v = await p;", correct: true },
                    { text: "const v = p;", feedback: "That holds the promise itself, not what it settles with." },
                    { text: "const v = p.value;", feedback: "A promise has no `.value` to read." }
                ],
                confirm: "`await` turns it into the value."
            },
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'async function go() {\n  console.log("a");\n  const v = await Promise.resolve(1);\n  console.log(v);\n}\ngo();\nconsole.log("b");',
                choices: [
                    { text: "a, b, 1", correct: true },
                    { text: "a, 1, b", feedback: "At the await, `go` hands control back — so `b` goes next." },
                    { text: "b, a, 1", feedback: "`go()` is called first and runs normally until the await." }
                ],
                confirm: "The caller carries on.",
                retry: {
                    demand: "predict",
                    ask: "Simpler: what runs while `go` is waiting?",
                    code: "go();\nconsole.log(\"b\");",
                    choices: [
                        { text: "the line after the call", correct: true },
                        { text: "nothing — everything waits", feedback: "Only the async function pauses." }
                    ],
                    confirm: "One function waits; the rest carries on."
                }
            },
            {
                demand: "diagnose",
                ask: "This should log 3 and logs a promise. Which line is the cause?",
                code: 'async function total() {\n  const a = await Promise.resolve(2);\n  return a + 1;\n}\nconsole.log(total());',
                choices: [
                    { text: "console.log(total());", correct: true },
                    { text: "return a + 1;", feedback: "Returning 3 is right — it is how the result is collected that is not." },
                    { text: "async function total() {", feedback: "Marking it async is correct; that is why it waits." }
                ],
                confirm: "An async function always hands back a promise."
            },
            {
                demand: "explain",
                ask: "Why does `await` pause the function without freezing the page?",
                choices: [
                    { text: "the function hands control back and is resumed later from where it stopped", correct: true },
                    { text: "each async function runs on its own thread", feedback: "There is one thread; the function steps aside rather than running beside." },
                    { text: "everything pauses, but only briefly", feedback: "Nothing else pauses at all." }
                ],
                confirm: "It steps aside."
            }
        ]
    },
    {
        concept: "error-propagation",
        title: "Failures that arrive late",
        why: "A failure inside asynchronous work does not land where you would expect, and silence is the usual result.",
        teach: [
            {
                code: 'async function go() {\n  try {\n    await Promise.reject("boom");\n  } catch (e) {\n    console.log("caught " + e);\n  }\n  console.log("after");\n}\ngo();',
                output: "caught boom\nafter",
                note: "A rejected await behaves like a throw inside the function, so the catch takes it.",
                parts: [
                    { piece: "await a rejection", means: "throws, right there" },
                    { piece: "after", means: "it was handled, so the function carried on" }
                ]
            },
            {
                code: 'async function go() {\n  await Promise.reject("boom");\n}\ngo();',
                output: "nothing at all",
                note: "The rejection went into the promise `go()` returned, and nobody was listening.",
                parts: [{ piece: "go()", means: "hands back a promise that rejects, unwatched" }]
            }
        ],
        notice: "A rejection travels until something catches it. Nothing catching it is silence.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'async function go() {\n  try {\n    await Promise.reject("boom");\n  } catch (e) {\n    console.log("caught " + e);\n  }\n  console.log("after");\n}\ngo();',
                choices: [
                    { text: "caught boom, then after", correct: true },
                    { text: "caught boom only", feedback: "It was handled, so the function carried on to the next line." },
                    { text: "nothing — it fails", feedback: "The try is exactly what stops it failing." }
                ],
                confirm: "Caught, then onwards.",
                retry: {
                    demand: "predict",
                    ask: "And with no try at all?",
                    code: 'async function go() {\n  await Promise.reject("boom");\n}\ngo();',
                    choices: [
                        { text: "nothing is logged", correct: true },
                        { text: "an error is shown", feedback: "The rejection goes into the returned promise, which nothing is watching." }
                    ],
                    confirm: "Silence is the dangerous part."
                }
            },
            {
                demand: "diagnose",
                ask: "This should report the failure and reports nothing. Which line is the cause?",
                code: 'async function go() {\n  await Promise.reject("boom");\n}\ngo();',
                choices: [
                    { text: "go();", correct: true },
                    { text: 'await Promise.reject("boom");', feedback: "That is the failure itself — the question is where it was meant to land." },
                    { text: "async function go() {", feedback: "The function itself is correct — it is how it is handed over that is not." }
                ],
                confirm: "Nothing was listening."
            },
            {
                demand: "explain",
                ask: "Why does a plain try around `go()` not catch a rejection from inside it?",
                choices: [
                    { text: "the call itself succeeds and hands back a promise; the failure arrives afterwards", correct: true },
                    { text: "try and catch only works on throw", feedback: "It catches rejected awaits too — but only if the await is inside it." },
                    { text: "async functions hide their failures", feedback: "Nothing is hidden; it simply arrives after the try has finished." }
                ],
                confirm: "The try is over before it fails."
            }
        ]
    },
    {
        concept: "promise-all",
        title: "Several at once",
        why: "Waiting for three things one after another takes three times as long as waiting for them together.",
        teach: [
            {
                code: 'Promise.all([Promise.resolve(1), Promise.resolve(2)]).then((vs) => {\n  console.log(vs);\n});',
                output: "[1, 2]",
                note: "One handler, once, with every value — in the order they were GIVEN.",
                parts: [
                    { piece: "[p1, p2]", means: "a list of promises" },
                    { piece: "vs", means: "a list of values, in the same order" }
                ]
            },
            {
                code: 'Promise.all([Promise.resolve(1), Promise.reject("no")]).catch((e) => {\n  console.log("caught " + e);\n});',
                output: "caught no",
                note: "One rejection is enough. It does not wait for the rest.",
                parts: [{ piece: "catch", means: "fires as soon as any one of them rejects" }]
            }
        ],
        notice: "Waits for every one; rejects the moment any one does.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'Promise.all([Promise.resolve(1), Promise.resolve(2)]).then((vs) => {\n  console.log(vs);\n});',
                choices: [
                    { text: "[1, 2]", correct: true },
                    { text: "1 then 2", feedback: "The handler is called once, with a list — not once per promise." },
                    { text: "Promise { pending }", feedback: "`.then` receives the settled values, not the promise." }
                ],
                confirm: "One list, in order.",
                retry: {
                    demand: "predict",
                    ask: "And if one rejects?",
                    code: 'Promise.all([Promise.resolve(1), Promise.reject("no")]).catch((e) => { console.log("caught " + e); });',
                    choices: [
                        { text: "caught no", correct: true },
                        { text: "[1]", feedback: "It does not hand back the ones that worked — one failure fails the lot." }
                    ],
                    confirm: "All or nothing."
                }
            },
            {
                demand: "explain",
                ask: "Why is `Promise.all` usually faster than awaiting each one in turn?",
                choices: [
                    { text: "all of them are already running, so the wait is the longest one rather than the sum", correct: true },
                    { text: "it runs them on several threads at once", feedback: "There is still one thread — the waiting is what overlaps." },
                    { text: "it skips any that take too long", feedback: "It waits for every single one." }
                ],
                confirm: "They overlap."
            }
        ]
    }
];

/*
 * ALGORITHMS.
 *
 * The topic that found the bug hiding recursion: a suppressed walk still
 * evaluated, so consuming the tokens after a `return` CALLED the function
 * again. Every example here has been run, and runs properly now.
 */
export const ALGORITHM_LESSONS: readonly Lesson[] = [
    {
        concept: "recursion",
        title: "A function that calls itself",
        why: "Some problems are easiest to describe in terms of a smaller version of themselves.",
        teach: [
            {
                code: 'function down(n) {\n  if (n === 0) {\n    return "liftoff";\n  }\n  console.log(n);\n  return down(n - 1);\n}\nconsole.log(down(3));',
                output: "3\n2\n1\nliftoff",
                note: "Each call does its bit, then asks a smaller version of itself.",
                parts: [
                    { piece: "if (n === 0)", means: "the case that stops — an answer, not another question" },
                    { piece: "down(n - 1)", means: "the same problem, one step smaller" },
                    { piece: "liftoff", means: "travels back out through every waiting call" }
                ]
            }
        ],
        notice: "Get smaller, and know when to stop.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: 'function down(n) {\n  if (n === 0) {\n    return "liftoff";\n  }\n  console.log(n);\n  return down(n - 1);\n}\nconsole.log(down(3));',
                choices: [
                    { text: "3, 2, 1, liftoff", correct: true },
                    { text: "3, 2, 1, 0", feedback: "At 0 it returns the word instead of printing the number." },
                    { text: "liftoff", feedback: "Each call before the last one printed its own number first." }
                ],
                confirm: "Down to the stop, then back out.",
                retry: {
                    demand: "predict",
                    ask: "Simpler: how many times does this print?",
                    code: 'function down(n) {\n  if (n === 0) {\n    return "end";\n  }\n  console.log(n);\n  return down(n - 1);\n}\ndown(2);',
                    choices: [
                        { text: "twice", correct: true },
                        { text: "three times", feedback: "At 0 it stops without printing." }
                    ],
                    confirm: "Once per call above the stop."
                }
            },
            {
                demand: "diagnose",
                ask: "This counts down and never stops. Which line is the cause?",
                code: "function down(n) {\n  console.log(n);\n  return down(n - 1);\n}\ndown(3);",
                choices: [
                    { text: "there is no line that stops it", correct: true },
                    { text: "return down(n - 1);", feedback: "Getting smaller is right — what is missing is somewhere to stop." },
                    { text: "down(3);", feedback: "Starting at 3 is fine; it would run away from any number." }
                ],
                confirm: "Something is missing, not wrong."
            }
        ]
    },
    {
        concept: "base-cases",
        title: "Knowing when to stop",
        why: "A recursion without a reachable stopping point is the fastest way to crash a program.",
        teach: [
            {
                code: "function total(n) {\n  if (n === 0) {\n    return 0;\n  }\n  return n + total(n - 1);\n}\nconsole.log(total(4));",
                output: "10",
                note: "4 + 3 + 2 + 1 + 0. Every call waits on a smaller one, and 0 is where the answers start.",
                parts: [
                    { piece: "if (n === 0) return 0", means: "the base case: an answer with no further call" },
                    { piece: "n + total(n - 1)", means: "this bit, plus the answer to the smaller problem" }
                ]
            },
            {
                code: "function total(n) {\n  if (n === 0) {\n    return 0;\n  }\n  return n + total(n + 1);\n}\nconsole.log(total(4));",
                output: "it never finishes",
                note: "The base case is fine. Nothing ever reaches it — each call asks about a bigger number.",
                parts: [{ piece: "n + 1", means: "moving away from 0 instead of towards it" }]
            }
        ],
        notice: "A base case has to be reachable, not just present.",
        steps: [
            {
                demand: "diagnose",
                ask: "This should add 4 + 3 + 2 + 1 and never finishes. Which line is the cause?",
                code: "function total(n) {\n  if (n === 0) {\n    return 0;\n  }\n  return n + total(n + 1);\n}\nconsole.log(total(4));",
                choices: [
                    { text: "return n + total(n + 1);", correct: true },
                    { text: "if (n === 0) {", feedback: "The stopping point is right — nothing ever gets to it." },
                    { text: "console.log(total(4));", feedback: "Starting at 4 is fine — it is the direction of travel that is not." }
                ],
                confirm: "It moves the wrong way.",
                retry: {
                    demand: "diagnose",
                    ask: "Which direction reaches 0 from 4?",
                    code: "// total(4) ... which call gets closer to 0?",
                    choices: [
                        { text: "total(n - 1)", correct: true },
                        { text: "total(n + 1)", feedback: "That goes 5, 6, 7 — away from 0." }
                    ],
                    confirm: "Towards the stop."
                }
            },
            {
                demand: "explain",
                ask: "Why does every recursive function need a base case?",
                choices: [
                    { text: "without one there is nothing that returns an answer instead of asking again", correct: true },
                    { text: "the computer can only hold so many waiting calls", feedback: "That is the symptom you see, not the reason it is needed." },
                    { text: "a function may not call itself more than once", feedback: "It can call itself as many times as it needs to." }
                ],
                confirm: "Somewhere the answers have to start."
            }
        ]
    },
    {
        concept: "search-strategies",
        title: "Looking in the right way",
        why: "How you search matters far more than how fast your computer is.",
        teach: [
            {
                code: "let left = 8;\nlet checks = 0;\nwhile (left > 1) {\n  left = left / 2;\n  checks = checks + 1;\n}\nconsole.log(checks);",
                output: "3",
                note: "8 to 4 to 2 to 1. Checking every item instead would take up to 8.",
                parts: [
                    { piece: "left / 2", means: "one comparison rules out half" },
                    { piece: "3", means: "against 8 for checking one at a time" }
                ]
            }
        ],
        notice: "Halving only works if the list is sorted — that is what one comparison buys you.",
        steps: [
            {
                demand: "predict",
                ask: "What does this log?",
                code: "let left = 8;\nlet checks = 0;\nwhile (left > 1) {\n  left = left / 2;\n  checks = checks + 1;\n}\nconsole.log(checks);",
                choices: [
                    { text: "3", correct: true },
                    { text: "8", feedback: "That is checking every item, one at a time." },
                    { text: "4", feedback: "8, 4, 2, 1 — the halvings are the three steps between them." }
                ],
                confirm: "Three halvings.",
                retry: {
                    demand: "predict",
                    ask: "And starting from 4?",
                    code: "let left = 4;\nlet checks = 0;\nwhile (left > 1) {\n  left = left / 2;\n  checks = checks + 1;\n}\nconsole.log(checks);",
                    choices: [
                        { text: "2", correct: true },
                        { text: "4", feedback: "4 to 2, then 2 to 1 — that is two halvings, not four." }
                    ],
                    confirm: "Doubling the list adds one step."
                }
            },
            {
                demand: "explain",
                ask: "Why can a sorted list be searched by halving when an unsorted one cannot?",
                choices: [
                    { text: "in a sorted list one comparison tells you which half the answer is in", correct: true },
                    { text: "a sorted list is stored differently, so the middle is faster to reach", feedback: "Reaching the middle costs the same either way." },
                    { text: "halving works on any list but only answers correctly when sorted", feedback: "There is nothing to halve — one comparison rules out one item." }
                ],
                confirm: "One comparison, half the list."
            }
        ]
    },
    {
        concept: "sorting-basics",
        title: "One pass at a time",
        why: "Watching a sort do one pass is the clearest way to see why it needs several.",
        teach: [
            {
                code: "let a = [4, 3, 2, 1];\nfor (let i = 0; i < a.length - 1; i = i + 1) {\n  if (a[i] > a[i + 1]) {\n    let t = a[i];\n    a[i] = a[i + 1];\n    a[i + 1] = t;\n  }\n}\nconsole.log(a);",
                output: "[3, 2, 1, 4]",
                note: "One pass carried the biggest item to the end. Everything else moved one place.",
                parts: [
                    { piece: "a[i] > a[i + 1]", means: "compare neighbours" },
                    { piece: "the swap", means: "three lines, because you need somewhere to put the first value" },
                    { piece: "4 at the end", means: "one item in its final place" }
                ]
            }
        ],
        notice: "One pass settles one item. That is why there has to be another.",
        steps: [
            {
                demand: "predict",
                ask: "This is ONE pass. What does it log?",
                code: "let a = [4, 3, 2, 1];\nfor (let i = 0; i < a.length - 1; i = i + 1) {\n  if (a[i] > a[i + 1]) {\n    let t = a[i];\n    a[i] = a[i + 1];\n    a[i + 1] = t;\n  }\n}\nconsole.log(a);",
                choices: [
                    { text: "[3, 2, 1, 4]", correct: true },
                    { text: "[1, 2, 3, 4]", feedback: "That would take several passes — this is one." },
                    { text: "[4, 3, 2, 1]", feedback: "Swaps did happen; the biggest moved all the way along." }
                ],
                confirm: "The largest reached the end.",
                retry: {
                    demand: "predict",
                    ask: "Simpler: after comparing 4 and 3, what are the first two items?",
                    code: "let a = [4, 3, 2, 1];",
                    choices: [
                        { text: "3 then 4", correct: true },
                        { text: "4 then 3", feedback: "They were the wrong way round, so they swapped." }
                    ],
                    confirm: "And then 4 meets the next one."
                }
            },
            {
                demand: "explain",
                ask: "Why does a simple sort need several passes rather than one?",
                choices: [
                    { text: "one pass only settles the largest item; the rest are still out of order", correct: true },
                    { text: "each pass may make only a single swap", feedback: "A pass can swap many times — it did three times here." },
                    { text: "the first pass compares and a later one moves", feedback: "Each pass does both — it compares and swaps as it goes." }
                ],
                confirm: "One item settled per pass."
            }
        ]
    },
    {
        concept: "complexity",
        title: "How the work grows",
        why: "The useful question is not how long something takes, but what happens when the input gets bigger.",
        teach: [
            {
                code: "// 10 items  -> 10 checks\n// 20 items  -> 20 checks\n// checking every item: grows in step with n",
                output: "double the list, double the work",
                note: "One check per item. Nested loops would square it; halving grows far more slowly.",
                parts: [
                    { piece: "in step with n", means: "one pass over the list" },
                    { piece: "the square of n", means: "a loop inside a loop" },
                    { piece: "halving", means: "8 items in 3 steps, 16 in 4" }
                ]
            }
        ],
        notice: "Complexity is about growth, not seconds.",
        steps: [
            {
                demand: "recall",
                ask: "Checking every item in a list of n items. How does the work grow as n grows?",
                choices: [
                    { text: "in step with n", correct: true },
                    { text: "with the square of n", feedback: "That is a loop inside a loop — this is one pass." },
                    { text: "not at all", feedback: "A longer list plainly means more checks." }
                ],
                confirm: "One check per item.",
                retry: {
                    demand: "recall",
                    ask: "And a loop inside a loop, over the same list?",
                    code: "for (...) {\n  for (...) {\n    // ...\n  }\n}",
                    choices: [
                        { text: "with the square of n", correct: true },
                        { text: "in step with n", feedback: "The inner loop runs fully for every step of the outer one." }
                    ],
                    confirm: "n times n."
                }
            },
            {
                demand: "explain",
                ask: "Why does complexity describe how work grows rather than how long it takes?",
                choices: [
                    { text: "the same code runs at different speeds on different machines, but grows the same way", correct: true },
                    { text: "measuring time accurately is too difficult to bother with", feedback: "Timing is easy — it just does not transfer between machines." },
                    { text: "how long it takes depends mostly on the language", feedback: "That changes the speed, not how the work scales." }
                ],
                confirm: "Growth is what transfers."
            }
        ]
    }
];

export const TOPIC_CHALLENGES: readonly Lesson[] = [
    {
        concept: null,
        challengeFor: "values",
        title: "Values challenge",
        why: "Three lines that use everything Values covered. Work out what each one prints.",
        teach: [],
        notice: "Read it as one program, top to bottom.",
        steps: [
            {
                demand: "predict",
                ask: "What does the first line print?",
                code: 'const age = "25";\n\nconsole.log(typeof age);',
                choices: [
                    { text: "string", correct: true },
                    {
                        text: "number",
                        feedback:
                            'age holds "25" with quotes, so it is text. typeof reports how it is stored, not what it looks like.'
                    }
                ],
                confirm: "Quotes made it a string, and typeof said so."
            },
            {
                demand: "predict",
                ask: "And this one?",
                code: "console.log(typeof 25);",
                choices: [
                    { text: "number", correct: true },
                    { text: "string", feedback: "No quotes this time, so it really is a number." }
                ],
                confirm: "Same digits, different type."
            },
            {
                demand: "predict",
                ask: "And the last?",
                code: 'const age = "25";\n\nconsole.log(age === 25);',
                choices: [
                    { text: "false", correct: true },
                    {
                        text: "true",
                        feedback:
                            'age is the string "25" and 25 is a number. === checks the type as well as the characters, so they do not match.'
                    }
                ],
                confirm: "That is the whole of Values in one line.",
                retry: {
                    demand: "predict",
                    ask: "One more — what does this print?",
                    code: 'console.log("7" === 7);',
                    choices: [
                        { text: "false", correct: true },
                        { text: "true", feedback: "String on one side, number on the other." }
                    ],
                    confirm: "Right."
                }
            }
        ]
    },
    {
        concept: null,
        challengeFor: "variables",
        title: "Variables challenge",
        why: "Follow one variable through a short program and say what it holds at each point.",
        teach: [],
        notice: "The value changes as the lines run. Track it line by line.",
        steps: [
            {
                demand: "predict",
                ask: "What does the first log print?",
                code: "let score = 10;\nconsole.log(score);\nscore = 20;\nconsole.log(score);",
                choices: [
                    { text: "10", correct: true },
                    {
                        text: "20",
                        feedback:
                            "The first log runs before the reassignment. At that line score still holds 10."
                    }
                ],
                confirm: "Top to bottom — the change has not happened yet."
            },
            {
                demand: "predict",
                ask: "And the second?",
                code: "let score = 10;\nconsole.log(score);\nscore = 20;\nconsole.log(score);",
                choices: [
                    { text: "20", correct: true },
                    { text: "10", feedback: "By this line score has been reassigned to 20." },
                    { text: "30", feedback: "Reassigning replaces the value rather than adding to it." }
                ],
                confirm: "The newest value wins."
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: "let total;\ntotal = 5;\ntotal = total + 3;\nconsole.log(total);",
                choices: [
                    { text: "8", correct: true },
                    {
                        text: "5",
                        feedback:
                            "The third line works out total + 3 — that is 5 + 3 — and stores the 8 back into total."
                    },
                    {
                        text: "undefined",
                        feedback:
                            "total was undefined after the first line only. The lines after it put values in."
                    }
                ],
                confirm: "Declared, assigned, read and reassigned — all four in four lines.",
                retry: {
                    demand: "predict",
                    ask: "One more — what does this print?",
                    code: "let n = 2;\nn = n + n;\nconsole.log(n);",
                    choices: [
                        { text: "4", correct: true },
                        { text: "2", feedback: "The right side is worked out first: 2 + 2." }
                    ],
                    confirm: "Right."
                }
            }
        ]
    },
    {
        concept: null,
        challengeFor: "operators",
        title: "Operators challenge",
        why: "Arithmetic, variables, comparison, equality and logic, all in one short program.",
        teach: [],
        notice: "Work out each expression into a single value before judging the whole line.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: "let score = 10;\nscore += 5;\nconsole.log(score > 12);",
                choices: [
                    { text: "true", correct: true },
                    {
                        text: "false",
                        feedback:
                            "score becomes 15 on the second line, and 15 is greater than 12."
                    },
                    { text: "15", feedback: "A comparison prints true or false, not the number." }
                ],
                confirm: "Update first, then compare."
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: "const total = 4 * 2;\nconsole.log(total === 8 && total > 5);",
                choices: [
                    { text: "true", correct: true },
                    {
                        text: "false",
                        feedback:
                            "total is 8. Both sides hold — 8 === 8 and 8 > 5 — and && needs both, which it has."
                    }
                ],
                confirm: "Both sides true, so && is true."
            },
            {
                demand: "predict",
                ask: "And this one?",
                code: 'const answer = "8";\nconsole.log(answer === 8 || answer === "8");',
                choices: [
                    { text: "true", correct: true },
                    {
                        text: "false",
                        feedback:
                            'The first side is false — a string is not a number. But the second side compares "8" with "8", which matches, and || needs only one.'
                    }
                ],
                confirm: "One true side is enough, and the type distinction decided which one.",
                retry: {
                    demand: "predict",
                    ask: "One more — what does this print?",
                    code: "console.log(3 + 3 === 6 && 1 > 2);",
                    choices: [
                        { text: "false", correct: true },
                        { text: "true", feedback: "The first half holds, but 1 > 2 does not — and && needs both." }
                    ],
                    confirm: "Right."
                }
            }
        ]
    }
];

/** Every authored lesson and challenge, in the order a learner meets them. */
/*
 * `this` AND CLASSES -- the last topic, and the one every earlier topic was
 * quietly building toward.
 *
 * The order is not negotiable and it is not alphabetical. `this` comes first
 * because a method is a function that uses it; a class is a way of writing
 * methods; a prototype is where those methods actually live; and inheritance is
 * one prototype chain sitting on another. Each concept is the previous one
 * asked again at a greater distance.
 *
 * NOTHING HERE IS VOCABULARY FOR ITS OWN SAKE. Every snippet runs in littleJs,
 * so each claim below is checkable by a learner who pastes it into Experiment --
 * which several of these lessons explicitly invite.
 */
const THIS_AND_CLASS_LESSONS: readonly Lesson[] = [
    {
        concept: "this-binding",
        title: "What `this` Refers To",
        why: "Objects need a way to talk about themselves, and `this` is it.",
        teach: [
            {
                code: 'const person = {\n  name: "Tati",\n  greet() {\n    console.log(this.name);\n  }\n};\n\nperson.greet();',
                output: "Tati",
                note: "`this` inside `greet` means the object the method was called on.",
                parts: [
                    { piece: "person.greet()", means: "called ON person, so `this` is person" },
                    { piece: "this.name", means: "reads `name` from whatever `this` is" }
                ]
            },
            {
                code: 'const other = { name: "Sam", greet: person.greet };\n\nother.greet();',
                output: "Sam",
                note: "The SAME function. Nothing about it changed — only who called it.",
                parts: [
                    { piece: "greet: person.greet", means: "the very same function, stored on a second object" },
                    { piece: "other.greet()", means: "called on other, so now `this` is other" }
                ]
            },
            {
                code: "const loose = person.greet;\n\nloose();",
                note: "Taken off the object, there is no object left to be `this` — so this fails.",
                parts: [
                    { piece: "const loose = person.greet", means: "the function, without the object it came from" },
                    { piece: "loose()", means: "called on nothing, so `this` is nothing" }
                ]
            }
        ],
        notice: "`this` is decided by the dot in front of the call, not by where the function was written.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: 'const dog = {\n  name: "Rex",\n  bark() { console.log(this.name); }\n};\n\ndog.bark();',
                choices: [
                    { text: "Rex", correct: true },
                    {
                        text: "undefined",
                        feedback:
                            "`this` is not empty here — `dog.bark()` has `dog` in front of the dot, so `this` is `dog`."
                    },
                    { text: "name", feedback: "`this.name` reads the value stored at `name`, not the word itself." },
                    { text: "this.name", feedback: "The code runs rather than being printed as text." }
                ],
                confirm: "The dot in front of the call decided it: `dog.bark()` makes `this` mean `dog`.",
                aside: "That is why methods almost always read their own data through `this` rather than by name.",
                retry: {
                    demand: "predict",
                    ask: "Same idea, different object. What prints?",
                    code: 'const cat = {\n  name: "Mo",\n  bark() { console.log(this.name); }\n};\n\ncat.bark();',
                    choices: [
                        { text: "Mo", correct: true },
                        { text: "Rex", feedback: "`this` is the object in front of THIS call, which is `cat`." }
                    ],
                    confirm: "Whatever is in front of the dot is what `this` means."
                }
            },
            {
                demand: "predict",
                ask: "The same function, a different object in front of the dot. What prints?",
                code: 'function who() { console.log(this.name); }\n\nconst a = { name: "Ada", who: who };\nconst b = { name: "Bo", who: who };\n\nb.who();',
                choices: [
                    { text: "Bo", correct: true },
                    {
                        text: "Ada",
                        feedback:
                            "`a` was written first, but that does not matter. The call was `b.who()`, so `this` is `b`."
                    },
                    { text: "undefined", feedback: "There is an object in front of the dot, so `this` is that object." }
                ],
                confirm: "One function, two objects, two answers — chosen entirely by the call.",
                aside: "This is the sentence worth keeping: `this` is about HOW a function is called."
            },
            {
                demand: "diagnose",
                ask: "Which line is the cause of the failure?",
                code: 'const timer = {\n  label: "tick",\n  show() { console.log(this.label); }\n};\n\nconst run = timer.show;\nrun();',
                choices: [
                    { text: "const run = timer.show;", correct: true },
                    { text: "show() { console.log(this.label); }", feedback: "The method is fine — it works when called as `timer.show()`." },
                    { text: 'label: "tick",', feedback: "The data is there. The problem is that the call cannot reach it." },
                    { text: "run();", feedback: "This line only runs what the line above handed it, already detached." }
                ],
                confirm:
                    "Taking the method off the object left the function with no object to be `this`.",
                aside: "Calling it as `timer.show()` keeps the connection."
            },
            {
                /* The teaching screen's own vocabulary has no `repair` -- that
                   rung is carried by a challenge in the database. Here the same
                   idea is asked as a diagnosis of what to change. */
                demand: "diagnose",
                ask: "How should the last line be written so it prints `tick`?",
                code: 'const timer = {\n  label: "tick",\n  show() { console.log(this.label); }\n};\n\nconst run = timer.show;\nrun();',
                choices: [
                    { text: "Replace the last two lines with `timer.show();`", correct: true },
                    {
                        text: "Change `this.label` to `label`",
                        feedback:
                            "`label` on its own is not a variable anywhere — it is a property, and `this` is how a method reaches it."
                    },
                    {
                        text: "Add quotes: `console.log(\"this.label\")`",
                        feedback: "That would print the words `this.label` instead of the value."
                    }
                ],
                confirm: "Keeping the object in front of the dot is the fix.",
                aside: "There are other ways to reattach a function to an object; this is the one you need first."
            },
            {
                demand: "explain",
                ask: "Why do the same function's two calls give different answers?",
                code: 'const a = { name: "Ada", who };\nconst b = { name: "Bo", who };\n\na.who();\nb.who();',
                choices: [
                    { text: "`this` is whatever object was in front of the dot at the call", correct: true },
                    { text: "the function is copied separately onto each object", feedback: "There is one function. Both names point at it." },
                    { text: "objects remember which function was written first", feedback: "Nothing is remembered — the call decides each time." }
                ],
                confirm: "The call site decides. That is the whole rule.",
                aside: "Worth trying in Experiment: add a third object and predict the answer before running it."
            }
        ]
    },
    {
        concept: "methods",
        title: "Writing Object Methods",
        why: "An object that can only hold data makes you do all the work to it from outside.",
        teach: [
            {
                code: 'const tally = {\n  count: 0,\n  add() {\n    this.count = this.count + 1;\n  }\n};\n\ntally.add();\ntally.add();\nconsole.log(tally.count);',
                output: "2",
                note: "A method can CHANGE its object, not only read it.",
                parts: [
                    { piece: "add() { ... }", means: "the short way to put a function on an object" },
                    { piece: "this.count = this.count + 1", means: "reads its own count, then stores the new one back" }
                ]
            },
            {
                code: 'const box = {\n  items: 2,\n  describe() { return "holds " + this.items; },\n  report() { console.log(this.describe()); }\n};\n\nbox.report();',
                output: "holds 2",
                note: "A method can call another method on the same object through `this`.",
                parts: [{ piece: "this.describe()", means: "the object calling its own other method" }]
            }
        ],
        notice: "A method is just a function stored on an object — `this` is how it reaches the rest of that object.",
        steps: [
            {
                demand: "recognise",
                ask: "Which one is a method?",
                choices: [
                    { text: "greet() { return \"hi\"; } inside an object", correct: true },
                    { text: "const greet = \"hi\";", feedback: "That stores text. A method is a function the object can run." },
                    { text: "function greet() {} on its own", feedback: "A function on its own is not attached to any object." }
                ],
                confirm: "A function stored on an object is a method.",
                aside: "It is written without the word `function` inside an object — just the name and brackets."
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: 'const cart = {\n  total: 10,\n  addFee(fee) { return this.total + fee; }\n};\n\nconsole.log(cart.addFee(5));',
                choices: [
                    { text: "15", correct: true },
                    { text: "10", feedback: "The method adds the argument to its own total before returning." },
                    { text: "5", feedback: "`this.total` is 10, and the 5 is added to it." },
                    { text: "undefined", feedback: "The method returns a value, and that value is printed." }
                ],
                confirm: "A method can take arguments like any function AND reach its object through `this`.",
                aside: "That mix — its own data plus what you pass in — is most of what methods are for.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: 'const jar = {\n  coins: 4,\n  take(n) { return this.coins - n; }\n};\n\nconsole.log(jar.take(1));',
                    choices: [
                        { text: "3", correct: true },
                        { text: "4", feedback: "The argument is subtracted from the jar's own `coins`." }
                    ],
                    confirm: "Its own data, minus what you passed in."
                }
            }
        ]
    },
    {
        concept: "classes",
        title: "Defining Classes",
        why: "When you need many objects shaped the same way, writing each one out by hand stops working.",
        teach: [
            {
                code: 'class Dog {\n  constructor(name) {\n    this.name = name;\n  }\n  speak() {\n    console.log(this.name + " says woof");\n  }\n}\n\nconst rex = new Dog("Rex");\nrex.speak();',
                output: "Rex says woof",
                note: "A class is a description. `new` builds one actual object from it.",
                parts: [
                    { piece: "class Dog {", means: "describes how to build dogs — it is not a dog itself" },
                    { piece: "constructor(name)", means: "runs once per new dog, to set it up" },
                    { piece: "this.name = name", means: "stores the given name on the dog being built" },
                    { piece: 'new Dog("Rex")', means: "builds one, running the constructor against it" }
                ]
            },
            {
                code: 'const a = new Dog("Rex");\nconst b = new Dog("Bo");\n\na.speak();\nb.speak();',
                output: "Rex says woof\nBo says woof",
                note: "Two objects, their own names, one shared `speak`.",
                parts: [{ piece: "new ... new ...", means: "each call builds a separate object" }]
            }
        ],
        notice: "The class is written once; every object built from it has the same methods and its own data.",
        steps: [
            {
                demand: "recognise",
                ask: "Which line actually builds a dog?",
                code: 'class Dog {\n  constructor(name) { this.name = name; }\n}',
                choices: [
                    { text: 'const d = new Dog("Rex");', correct: true },
                    { text: "class Dog { ... }", feedback: "That describes how to build one. Nothing is built until `new` runs." },
                    { text: "constructor(name) { ... }", feedback: "The constructor runs during building — it does not start it." },
                    { text: "Dog(\"Rex\");", feedback: "Without `new`, nothing is built." }
                ],
                confirm: "`new` is what turns the description into an actual object.",
                aside: "The capital letter on `Dog` is a convention that says \"this is a class\"."
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: 'class Counter {\n  constructor() { this.n = 0; }\n  add() { this.n = this.n + 1; }\n}\n\nconst a = new Counter();\nconst b = new Counter();\na.add();\na.add();\nb.add();\n\nconsole.log(a.n + " and " + b.n);',
                choices: [
                    { text: "2 and 1", correct: true },
                    {
                        text: "3 and 3",
                        feedback:
                            "Each `new Counter()` builds a separate object with its own `n`. They do not share it."
                    },
                    { text: "1 and 1", feedback: "`a.add()` ran twice, so `a.n` reached 2." },
                    { text: "0 and 0", feedback: "`add` changes the counter it was called on." }
                ],
                confirm: "Shared behaviour, separate data — that is what building two instances means.",
                aside: "If they shared `n`, a class would be no better than one object.",
                retry: {
                    demand: "predict",
                    ask: "Two instances again. What prints?",
                    code: 'class Box {\n  constructor(n) { this.n = n; }\n}\n\nconst x = new Box(1);\nconst y = new Box(9);\nconsole.log(x.n);',
                    choices: [
                        { text: "1", correct: true },
                        { text: "9", feedback: "`y` was built second, but `x` kept the value it was built with." }
                    ],
                    confirm: "Each instance holds its own data."
                }
            }
        ]
    },
    {
        concept: "prototypes",
        title: "Prototypes and Method Lookup",
        why: "Knowing where a method actually lives explains several things that otherwise look like magic.",
        teach: [
            {
                code: 'class Dog {\n  constructor(name) { this.name = name; }\n  speak() { return "woof"; }\n}\n\nconst rex = new Dog("Rex");',
                note: "`rex` holds `name`. It does NOT hold `speak` — the class does.",
                parts: [
                    { piece: "this.name = name", means: "put on the dog itself, one copy per dog" },
                    { piece: "speak() { ... }", means: "stored once on the class, shared by every dog" }
                ]
            },
            {
                code: "rex.speak();",
                note: "Looks on `rex` first, does not find `speak`, then follows the link to `Dog` and finds it there.",
                parts: [{ piece: "rex -> Dog", means: "the lookup walks outward until it finds a match, or runs out" }]
            }
        ],
        notice: "A method call looks at the object first and the class second — that order is the whole mechanism.",
        steps: [
            {
                demand: "recognise",
                ask: "Where does `speak` actually live?",
                code: 'class Dog {\n  constructor(name) { this.name = name; }\n  speak() { return "woof"; }\n}\nconst rex = new Dog("Rex");',
                choices: [
                    { text: "on the class, shared by every dog", correct: true },
                    { text: "on `rex`, copied in when it was built", feedback: "If it were copied, a thousand dogs would mean a thousand copies of the same function." },
                    { text: "nowhere until it is called", feedback: "It is stored when the class is defined." }
                ],
                confirm: "Written once on the class, found by every instance that needs it.",
                aside: "`name` is the opposite — each dog has its own.",
                retry: {
                    demand: "recognise",
                    ask: "And where does `name` live?",
                    choices: [
                        { text: "on each dog, separately", correct: true },
                        { text: "on the class, shared", feedback: "The constructor put it on the dog being built, so each has its own." }
                    ],
                    confirm: "Data on the instance, behaviour on the class."
                }
            },
            {
                demand: "explain",
                ask: "Why does this print `own` rather than `method`?",
                code: 'class Tag {\n  constructor() { this.label = "own"; }\n  label() { return "method"; }\n}\n\nconsole.log(new Tag().label);',
                choices: [
                    { text: "the object's own property is found before the class is looked at", correct: true },
                    { text: "a constructor always wins over a method", feedback: "Nothing about constructors wins — it is the ORDER of the search." },
                    { text: "methods cannot be named the same as properties", feedback: "They can. One simply hides the other." }
                ],
                confirm: "Own properties first, class second. The search stops at the first match.",
                aside: "Worth trying in Experiment: remove the constructor line and watch the answer change."
            }
        ]
    },
    {
        concept: "inheritance",
        title: "Extending Classes with Inheritance",
        why: "When two classes are nearly the same, you want to write the difference and not the whole thing again.",
        teach: [
            {
                code: 'class Animal {\n  constructor(name) { this.name = name; }\n  speak() { return this.name + " makes a sound"; }\n}\n\nclass Dog extends Animal {}\n\nconsole.log(new Dog("Rex").speak());',
                output: "Rex makes a sound",
                note: "`Dog` defines nothing, and still has everything `Animal` has.",
                parts: [{ piece: "extends Animal", means: "look in Animal for anything Dog does not have" }]
            },
            {
                code: 'class Dog extends Animal {\n  speak() { return super.speak() + ", specifically a bark"; }\n}\n\nconsole.log(new Dog("Rex").speak());',
                output: "Rex makes a sound, specifically a bark",
                note: "`super.speak()` runs the parent version, then this one adds to it.",
                parts: [
                    { piece: "speak() { ... }", means: "Dog's own version, found before Animal's" },
                    { piece: "super.speak()", means: "deliberately reaching the version above" }
                ]
            }
        ],
        notice: "A subclass gets everything, can replace any part of it, and can still call the original with `super`.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: 'class Animal {\n  speak() { return "some sound"; }\n}\nclass Dog extends Animal {\n  speak() { return "woof"; }\n}\n\nconsole.log(new Dog().speak());',
                choices: [
                    { text: "woof", correct: true },
                    { text: "some sound", feedback: "Dog has its own `speak`, and the search finds that one first." },
                    { text: "some sound woof", feedback: "Only one runs. Dog's version replaced Animal's unless it calls `super`." }
                ],
                confirm: "Dog's own version was found before Animal's — the same order as always.",
                aside: "Replacing a parent's method like this is called overriding.",
                retry: {
                    demand: "predict",
                    ask: "Now Dog defines nothing. What prints?",
                    code: 'class Animal {\n  speak() { return "some sound"; }\n}\nclass Dog extends Animal {}\n\nconsole.log(new Dog().speak());',
                    choices: [
                        { text: "some sound", correct: true },
                        { text: "nothing — Dog is empty", feedback: "Dog has no `speak` of its own, so the search carries on into Animal." }
                    ],
                    confirm: "Nothing of its own means everything from the parent."
                }
            },
            {
                demand: "explain",
                ask: "Why does `super.speak()` matter here?",
                code: 'class Dog extends Animal {\n  speak() { return super.speak() + " — a bark"; }\n}',
                choices: [
                    { text: "it runs the parent's version so this one can add to it rather than replace it", correct: true },
                    { text: "it is required in every subclass method", feedback: "Only needed when you want the parent's version as well." },
                    { text: "it makes the method run twice", feedback: "Two different methods run once each — the parent's, then the rest of this one." }
                ],
                confirm: "Extending behaviour instead of replacing it is exactly what `super` is for.",
                aside: "Without it, the parent's work is simply gone."
            }
        ]
    }
];

export const ALL_LESSONS: readonly Lesson[] = [
    ...LESSONS,
    ...VALUES_TAIL_LESSONS,
    ...VARIABLES_LESSONS,
    ...OPERATORS_LESSONS,
    ...CONTROL_FLOW_LESSONS,
    ...STRING_LESSONS,
    ...LOOP_LESSONS,
    ...FUNCTION_LESSONS,
    ...SCOPE_LESSONS,
    ...ARRAY_LESSONS,
    ...ARRAY_METHOD_LESSONS,
    ...OBJECT_LESSONS,
    ...ERROR_LESSONS,
    ...DOM_LESSONS,
    ...ASYNC_LESSONS,
    ...ALGORITHM_LESSONS,
    ...THIS_AND_CLASS_LESSONS,
    ...TOPIC_CHALLENGES
];

export function lessonFor(concept: string | null): Lesson | null {
    return concept ? (ALL_LESSONS.find((l) => l.concept === concept) ?? null) : null;
}

/** The cumulative challenge that closes a topic, if one is authored. */
export function challengeFor(topic: string | null): Lesson | null {
    return topic ? (ALL_LESSONS.find((l) => l.challengeFor === topic) ?? null) : null;
}

/** Concept slugs with an authored lesson, in the order they are taught. */
export const TAUGHT_CONCEPTS = ALL_LESSONS.filter((l) => l.concept !== null).map(
    (l) => l.concept as string
);

/** Topics with an authored cumulative challenge. */
export const CHALLENGED_TOPICS = ALL_LESSONS.filter((l) => l.challengeFor).map(
    (l) => l.challengeFor as string
);
