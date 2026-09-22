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
export type LessonDemand = "recognise" | "predict";

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
        title: "true, false, and where they come from",
        why: "Every decision a program makes comes down to a boolean. This is where they come from.",
        teach: [
            {
                code: "console.log(true);\nconsole.log(false);",
                output: "true\nfalse",
                note: "These two are the whole set. There is no third.",
                parts: [{ piece: "true / false", means: "values, like 25 or \"hello\" — just only two of them" }]
            },
            {
                code: "console.log(5 > 3);",
                output: "true",
                note: "A comparison is a question, and the answer it hands back is a boolean.",
                parts: [
                    { piece: "5 > 3", means: "asks: is 5 bigger than 3?" },
                    { piece: "true", means: "the answer — not one of the numbers" }
                ]
            },
            { code: "console.log(5 < 3);", output: "false", note: "The same question the other way round." }
        ],
        notice: "A comparison is an expression, and the value it produces is always true or false.",
        steps: [
            {
                demand: "predict",
                ask: "What does this produce?",
                code: "5 > 3",
                choices: [
                    { text: "true", correct: true },
                    { text: "false", feedback: "5 is the larger number, so 5 > 3 holds." },
                    {
                        text: "5",
                        feedback:
                            "A comparison does not hand back one of the numbers — it hands back true or false."
                    }
                ],
                confirm: "Comparisons produce a boolean.",
                aside: "That is what makes them useful: a program can act on a true or a false, where it could not act on the number 5."
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: "console.log(2 > 10);",
                choices: [
                    { text: "false", correct: true },
                    { text: "true", feedback: "2 is smaller than 10, so this comparison does not hold." }
                ],
                confirm: "False — and false is a value like any other.",
                retry: {
                    demand: "predict",
                    ask: "And this one?",
                    code: "console.log(7 < 9);",
                    choices: [
                        { text: "true", correct: true },
                        { text: "false", feedback: "7 really is less than 9, so this holds." }
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
export const VALUES_TAIL_LESSONS: readonly Lesson[] = [
    {
        concept: "null-vs-undefined",
        title: "Two ways of having nothing",
        why: "You will see both, and they mean different things about how the nothing got there.",
        teach: [
            {
                code: "let score;\nconsole.log(score);",
                output: "undefined",
                note: "Nobody put anything in score, so JavaScript has its own word for that.",
                parts: [{ piece: "undefined", means: "JavaScript's answer when nothing was ever set" }]
            },
            {
                code: "let score = null;\nconsole.log(score);",
                output: "null",
                note: "Here somebody chose emptiness deliberately.",
                parts: [{ piece: "null", means: "a value a programmer writes on purpose to mean nothing" }]
            }
        ],
        notice: "undefined means nobody got round to it. null means somebody chose emptiness on purpose.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: "let score;\nconsole.log(score);",
                choices: [
                    { text: "undefined", correct: true },
                    {
                        text: "null",
                        feedback:
                            "null only appears when somebody writes it. Nothing was assigned here, so JavaScript's own answer is undefined."
                    }
                ],
                confirm: "Nobody set it, so undefined."
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
                retry: {
                    demand: "predict",
                    ask: "What does this print?",
                    code: "const score = null;\nconsole.log(score);",
                    choices: [
                        { text: "null", correct: true },
                        { text: "undefined", feedback: "null was assigned here, so that is what it holds." }
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
    }
];

/* ------------------------------------------------------------- VARIABLES
 *
 * Eight concepts, and the order is the teaching. Declaration, initialization
 * and assignment are three statements a beginner reads as one, so they are met
 * one at a time and contrasted directly. let-vs-const comes after reassignment
 * because const is defined by what it refuses -- the rule is meaningless before
 * you have watched a name be pointed somewhere new.
 */
export const VARIABLES_LESSONS: readonly Lesson[] = [
    {
        concept: "variables-name-values",
        title: "Names and values",
        why: "Naming a value is how a program refers to it again later instead of repeating it.",
        teach: [
            { code: "const score = 25;", note: "score is the name · 25 is the value" },
            { code: 'const player = "Ada";', note: "player is the name · \"Ada\" is the value" }
        ],
        notice: "The name and the value are two different things. The name points at the value.",
        steps: [
            {
                demand: "recognise",
                ask: "In this line, what is the name?",
                code: "const total = 40;",
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
                            "const is the keyword that makes the variable. The name is the word right after it: total."
                    }
                ],
                confirm: "total is the name; 40 is what it points at."
            },
            {
                demand: "predict",
                ask: "What does this print?",
                code: 'const city = "Lagos";\nconsole.log(city);',
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
                    code: "const age = 7;\nconsole.log(age);",
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
                            "This puts 5 into count, but it does not create the name — no let or const here."
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
                confirm: "No let or const — just the name and the value.",
                retry: {
                    demand: "recognise",
                    ask: "And which of these assigns to an existing name?",
                    choices: [
                        { text: "lives = 3;", correct: true },
                        { text: "const lives = 3;", feedback: "const also creates the name." }
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
            { code: "const score = 25;\nconsole.log(score);", note: "prints  25" },
            { code: "const a = 4;\nconsole.log(a + 1);", note: "prints  5  — a is swapped for 4 first" }
        ],
        notice: "Wherever a name appears, swap it for the value it currently holds.",
        steps: [
            {
                demand: "predict",
                ask: "What does this print?",
                code: "const price = 8;\nconsole.log(price * 2);",
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
                code: 'const first = "Ada";\nconsole.log("first");',
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
                    code: 'const n = 5;\nconsole.log(n);',
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
        concept: "arithmetic-operators",
        title: "Doing arithmetic",
        why: "Arithmetic is the clearest case of an expression turning into a single value.",
        teach: [
            { code: "2 + 3", note: "produces  5" },
            { code: "10 - 4\n3 * 2\n8 / 2", note: "produce  6  ·  6  ·  4" }
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
        concept: "comparison-operators",
        title: "Comparing two values",
        why: "Comparisons are how a program asks a question about two values.",
        teach: [
            { code: "5 > 3", note: "produces  true" },
            { code: "5 < 3\n4 >= 4\n2 <= 1", note: "produce  false  ·  true  ·  false" }
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
export const ALL_LESSONS: readonly Lesson[] = [
    ...LESSONS,
    ...VALUES_TAIL_LESSONS,
    ...VARIABLES_LESSONS,
    ...OPERATORS_LESSONS,
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
