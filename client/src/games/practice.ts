import type { Movement } from "./missions.js";

/**
 * GUIDED PRACTICE: write the thing you were just shown.
 *
 * THE STAGE THAT WAS MISSING. Measured across Values and Variables, the
 * curriculum declares 41 (concept, demand) pairs and only 12 had anything
 * playable. `predict` had 22 items and `diagnose` 12 -- but `produce` and
 * `apply` had ZERO, at every single concept that declares them.
 *
 * So a learner's real path was: lesson, then predict, then diagnose. They were
 * asked to say what code does and to find what was wrong with it, and never
 * once to write any. This is the step between "I was shown a variable" and
 * "predict what this program prints".
 *
 * ONE OR TWO MOVEMENTS, NEVER MORE. This is not a mission. A mission closes a
 * topic and asks the learner to combine everything in it; this closes a single
 * concept and asks for that concept alone, immediately after meeting it, while
 * the example is still on screen in their memory.
 *
 * REUSES THE MISSION'S MACHINERY ENTIRELY -- the same Movement type, the same
 * scoped evaluator, the same structural checks, the same MissionScene. What
 * differs is scope and when it appears, which is a content decision rather than
 * an architectural one.
 *
 * PREREQUISITE SAFETY IS THE HARD CONSTRAINT. Every snippet here uses only
 * console.log, string and number literals, + - *, and names. No arrays, no
 * functions, no objects, no comparison, no methods. A learner practising
 * `declaration` has met exactly one topic before this one, and the code they
 * are asked to write must stay inside that.
 */
export interface Practice {
    /** The concept this practises. */
    concept: string;
    /** Shown above the work. One line, naming the concept. */
    title: string;
    movements: readonly Movement[];
}

/* Shared shape of a "write it" check: it ran, it printed, and the structure is
   what the concept is about. */
function ran(run: Parameters<Movement["check"]>[0]): string | null {
    if (run.error) return run.error;
    if (run.output.length === 0) {
        return "Nothing was printed. Use `console.log(...)` to show the value.";
    }

    return null;
}

export const PRACTICES: readonly Practice[] = [
    /* ───────────────────────────────── variables · declaration ───────── */
    {
        concept: "declaration",
        title: "Make a name",
        movements: [
            {
                concept: "declaration",
                demand: "produce",
                brief: "Your ship has 100 fuel. Give that value the name `fuel`.",
                starter: "let fuel = ___;",
                after: "`fuel` is a name now. `100` is what it refers to.",
                check: (run) => {
                    if (run.error) return run.error;

                    if (run.declared.length === 0) {
                        return "Nothing was declared. Start the line with `let`, then the name.";
                    }

                    if (!run.declared.includes("fuel")) {
                        return `You named it \`${run.declared[0]}\`. This one needs to be called \`fuel\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ──────────────────────────── variables · initialization ─────────── */
    {
        concept: "initialization",
        title: "A name and a starting value",
        movements: [
            {
                concept: "initialization",
                demand: "produce",
                brief: "Name the number of passengers `crew`, starting at 3, and print it.",
                starter: "",
                after: "Declared and given a starting value in one line — that is initialisation.",
                check: (run) => {
                    const broke = ran(run);

                    if (broke) return broke;

                    if (!run.declared.includes("crew")) {
                        return run.declared.length === 0
                            ? "Declare the name first: `let crew = 3;`"
                            : `You named it \`${run.declared[0]}\`. This one needs to be \`crew\`.`;
                    }

                    if (run.output[run.output.length - 1] !== "3") {
                        return `That printed \`${run.output[run.output.length - 1]}\`. It should print \`3\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ─────────────────────────────── variables · assignment ──────────── */
    {
        concept: "assignment",
        title: "Work it out, then store it",
        movements: [
            {
                concept: "assignment",
                demand: "produce",
                brief:
                    "`total` starts at 5. Add 3 to it — storing the result back in `total` — then print it.",
                starter: "let total = 5;\n",
                after: "The right-hand side was worked out first, then stored back under the same name.",
                check: (run) => {
                    const broke = ran(run);

                    if (broke) return broke;

                    if (!run.declared.includes("total")) {
                        return "Keep the name `total` from the first line.";
                    }

                    const printed = run.output[run.output.length - 1];

                    if (printed === "5") {
                        return "That is still 5. Working out `total + 3` is not enough — store it back with `total = total + 3;`.";
                    }

                    if (printed !== "8") {
                        return `That printed \`${printed}\`. It should print \`8\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ──────────────────────── variables · reading-variables ──────────── */
    {
        concept: "reading-variables",
        title: "Use the name",
        movements: [
            {
                concept: "reading-variables",
                demand: "apply",
                brief: "`fuel` already holds 80. Print `Fuel: 80` — using the name, not the number.",
                starter: "let fuel = 80;\nconsole.log(___);",
                after: "The message asked `fuel` what it held rather than containing 80 itself.",
                check: (run) => {
                    const broke = ran(run);

                    if (broke) return broke;

                    const printed = run.output[run.output.length - 1];
                    const usedName = run.namesUsedInOutput.some((names) => names.includes("fuel"));

                    if (printed === "Fuel: 80" && !usedName) {
                        return "Right output — but `80` is typed into the message. Use the name `fuel` instead.";
                    }

                    if (!usedName) return "Use the name `fuel` inside `console.log`.";

                    if (printed !== "Fuel: 80") {
                        return `That printed \`${printed}\`. It needs to read exactly \`Fuel: 80\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ─────────────────────────────── variables · reassignment ────────── */
    {
        concept: "reassignment",
        title: "Point it somewhere new",
        movements: [
            {
                concept: "reassignment",
                demand: "apply",
                brief:
                    "`fuel` starts at 100. Burn some: make it 60 on a new line, then print it.",
                starter: "let fuel = 100;\n",
                after: "The name stayed the same. What it refers to changed.",
                check: (run) => {
                    const broke = ran(run);

                    if (broke) return broke;

                    if (run.reassigned.length === 0) {
                        return "Change it on a line of its own: `fuel = 60;` — no `let` the second time.";
                    }

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "60") {
                        return `That printed \`${printed}\`. After the burn it should print \`60\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ─────────────────────────── variables · variable-state ──────────── */
    {
        concept: "variable-state",
        title: "Two names at once",
        movements: [
            {
                concept: "variable-state",
                demand: "produce",
                brief:
                    "The ship has 80 fuel and 3 passengers. Name both, then print `Fuel: 80` and `Crew: 3` on separate lines.",
                starter: "",
                after: "Two names, two values, both read back. That is the state of the program.",
                check: (run) => {
                    const broke = ran(run);

                    if (broke) return broke;

                    if (run.declared.length < 2) {
                        return run.declared.length === 0
                            ? "Start by naming the fuel: `let fuel = 80;`"
                            : `You named \`${run.declared[0]}\`. The other reading needs a name too.`;
                    }

                    const [first, second] = run.output;

                    if (first !== "Fuel: 80") {
                        return `The first line reads \`${first ?? "nothing"}\`. It should read \`Fuel: 80\`.`;
                    }

                    if (second !== "Crew: 3") {
                        return `The second line reads \`${second ?? "nothing"}\`. It should read \`Crew: 3\`.`;
                    }

                    if (run.namesUsedInOutput.filter((n) => n.length > 0).length < 2) {
                        return "One of those lines has its number typed in. Both should come from a name.";
                    }

                    return null;
                }
            }
        ]
    }
];

/** The practice for a concept, or null where none is authored yet. */
export function practiceFor(concept: string | null): Practice | null {
    if (!concept) return null;

    return PRACTICES.find((p) => p.concept === concept) ?? null;
}
