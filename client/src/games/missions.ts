import { runLittleJs, type RunResult } from "./littleJs.js";

/**
 * A mission: the demonstration that closes a topic.
 *
 * WHAT MAKES IT DIFFERENT FROM A QUESTION. A question asks whether the learner
 * can say what code does. A mission asks whether they can make code do
 * something. Those are different capabilities and Jolt checks both -- the quiz
 * produces `predict` evidence, this produces `apply` and `produce`.
 *
 * EVERY MOVEMENT IS JUDGED ON STRUCTURE, NOT ONLY OUTPUT. The single most
 * important check in the Variables mission accepts and rejects two programs
 * that print exactly the same thing:
 *
 *     console.log("Fuel: 100")        rejected -- the value is typed in
 *     console.log("Fuel: " + fuel)    accepted -- the name is used
 *
 * A mission that compared output alone would pass the first, and would be
 * teaching a learner that typing the answer is the same as knowing it.
 *
 * FAILURE COSTS NOTHING. There is no attempt limit, no score, no penalty. A
 * `check` returns the ONE next thing to try, named specifically, and the
 * learner runs again. What a miss actually costs is recorded elsewhere as
 * `needed_retry`, which exists to make later practice better rather than to
 * punish anyone.
 */
export interface Movement {
    /** The world's instruction. Names the capability, never "make it work". */
    brief: string;
    /** The concept this movement is evidence for. */
    concept: string;
    /** The rung this movement is evidence at. */
    demand: "apply" | "produce";
    /** What the learner starts with. `___` marks where they are expected to work. */
    starter: string;
    /**
     * Judges a run. Returns null when the movement is satisfied, or the one
     * next thing to try.
     */
    check: (run: RunResult, source: string) => string | null;
    /** Said once it is satisfied. Confirms the idea, not the correctness. */
    after: string;
}

export interface Mission {
    /** The topic this mission closes. Matches TOPIC_CHALLENGES' challengeFor. */
    topic: string;
    title: string;
    /** One line of world, setting up why any of this is happening. */
    place: string;
    movements: readonly Movement[];
    /** The capability, in the learner's terms, once every movement is done. */
    capability: string;
}

/** Ran at all, printed something, and did not error. */
function ran(run: RunResult): string | null {
    if (run.error) return run.error;
    if (run.output.length === 0) return "Nothing was printed. Use `console.log(...)` to show something.";

    return null;
}

export const VARIABLES_MISSION: Mission = {
    topic: "variables",
    title: "Launch check",
    place: "Docking bay",
    capability: "name a value, use the name, and change the value in one place",

    movements: [
        /* ---------------------------------------------- 1 · give it a name */
        {
            concept: "initialization",
            demand: "produce",
            brief: "The fuel gauge is dead. Declare a name for the fuel and give it the value 100.",
            starter: "let fuel = ___;",
            after: "`fuel` is now a name, and `100` is the value it refers to.",
            check: (run) => {
                if (run.error) return run.error;

                if (run.declared.length === 0) {
                    return "Nothing was declared yet. Use `let fuel = 100;` to create the name.";
                }

                if (!run.declared.includes("fuel")) {
                    return `You declared \`${run.declared[0]}\`. The gauge is looking for a name called \`fuel\`.`;
                }

                return null;
            }
        },

        /* ------------------------------------------------- 2 · use the name */
        {
            concept: "reading-variables",
            demand: "apply",
            brief: "The board is blank. Make it read exactly `Fuel: 100`, using the name, not the number.",
            starter: 'let fuel = 100;\nconsole.log(___);',
            after: "The message asked `fuel` what it held. It did not contain 100 itself.",
            check: (run) => {
                const broke = ran(run);

                if (broke) return broke;

                const usedAName = run.namesUsedInOutput.some((names) => names.includes("fuel"));
                const printed = run.output[run.output.length - 1];

                // The whole point of the mission. Right output, wrong idea:
                // said BEFORE the output is praised, so the learner does not
                // read "correct" and stop.
                if (printed === "Fuel: 100" && !usedAName) {
                    return "That is the right output, but `100` is typed straight into the message. Use the name `fuel` instead of the number.";
                }

                if (!usedAName) return "Use the name `fuel` inside `console.log`.";
                if (printed !== "Fuel: 100") {
                    return `The board reads \`${printed}\`. It needs to read exactly \`Fuel: 100\`.`;
                }

                return null;
            }
        },

        /* --------------------------------------------- 3 · change the value */
        {
            concept: "reassignment",
            demand: "apply",
            brief: "Burn some fuel. Make the board read `Fuel: 50`. Change the value, not the message.",
            starter: 'let fuel = 100;\nconsole.log("Fuel: " + fuel);',
            after: "One number changed and the message followed. That is what naming a value buys you.",
            check: (run, source) => {
                const broke = ran(run);

                if (broke) return broke;

                const printed = run.output[run.output.length - 1];
                const usedAName = run.namesUsedInOutput.some((names) => names.includes("fuel"));

                // Editing the string is the miss this movement exists to catch:
                // it produces the right board and demonstrates nothing.
                if (!usedAName) {
                    return "The message has the number written into it again. Keep using `fuel`, and change what `fuel` holds.";
                }

                if (printed !== "Fuel: 50") {
                    return `The board reads \`${printed}\`. It needs to read \`Fuel: 50\`.`;
                }

                // Reached 50 by editing the declaration or by reassigning --
                // both are genuinely changing the value, and a learner who
                // writes `fuel = 50;` on a new line has understood MORE, not
                // less. Neither is corrected.
                if (!source.includes("50")) {
                    return "The board is right, but nothing in the program says 50.";
                }

                return null;
            }
        },

        /* ------------------------------------------ 4 · use it independently */
        {
            concept: "variable-state",
            demand: "produce",
            brief: "Final check. The board needs two readings: `Fuel: 50` on one line, `Crew: 3` on the next.",
            starter: "",
            after: "Two names, two values, one board. You did that from nothing.",
            check: (run) => {
                const broke = ran(run);

                if (broke) return broke;

                if (run.declared.length < 2) {
                    return run.declared.length === 0
                        ? "Declare a name for each reading, starting with `let fuel = 50;`."
                        : `You declared \`${run.declared[0]}\`. The second reading needs a name of its own.`;
                }

                const [first, second] = run.output;

                if (first !== "Fuel: 50") {
                    return `The first line reads \`${first ?? "nothing"}\`. It needs to read \`Fuel: 50\`.`;
                }

                if (second !== "Crew: 3") {
                    return `The second line reads \`${second ?? "nothing"}\`. It needs to read \`Crew: 3\`.`;
                }

                const bothUsed = run.namesUsedInOutput.filter((names) => names.length > 0).length;

                if (bothUsed < 2) {
                    return "One of those lines has its number typed in. Both readings should come from a name.";
                }

                return null;
            }
        }
    ]
};

export const MISSIONS: readonly Mission[] = [VARIABLES_MISSION];

/** The mission that closes a topic, or null if that topic has none yet. */
export function missionFor(topic: string): Mission | null {
    return MISSIONS.find((m) => m.topic === topic) ?? null;
}

/** Runs a movement's code and judges it in one step. */
export function attempt(movement: Movement, source: string): { ok: boolean; run: RunResult; note: string | null } {
    const run = runLittleJs(source);
    const note = movement.check(run, source);

    return { ok: note === null, run, note };
}
