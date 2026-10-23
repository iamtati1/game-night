/**
 * The topic checkpoints' answer key, and the rule that judges a submission.
 *
 * WHY THE SERVER HOLDS THIS. A checkpoint pass completes a topic and opens the
 * next one. It used to be recorded on the browser's word: the quiz was marked
 * client-side and POST /topics/:topic/challenge read nothing but `neededRetry`,
 * so an empty request passed. The server now judges the answers itself.
 *
 * THE RULE. Every step must be answered correctly, first time or on its retry.
 * A wrong first answer on a step that offers a retry is fine if the retry is
 * right (and records needed_retry); a wrong answer with no retry left, or a
 * wrong retry, fails the checkpoint. The learner can take it again.
 *
 * WHERE THE WORDS LIVE. The questions, code and feedback are authored in
 * client/src/games/lessons.ts (TOPIC_CHALLENGES); this file holds only what
 * judging needs: each step's choices and which one is right.
 * checkpoints.test.ts fails if the two drift apart.
 *
 * THE MISSION HALF of a topic that has one (Variables) is a program the learner
 * writes and runs in the browser. It stays browser-reported, as concept
 * missions are (see isMissionChallenge in encounter.ts).
 *
 * WHAT THIS DOES NOT STOP. The answer key also ships in the client bundle,
 * because the quiz gives per-choice feedback as it goes. Someone reading the
 * bundle could script correct answers. Closing that means serving checkpoint
 * questions from the server one at a time, like Code Blitz -- a larger change.
 */

interface KeyedQuestion {
    choices: readonly string[];
    correct: string;
}

interface KeyedStep extends KeyedQuestion {
    retry: KeyedQuestion | null;
}

export const CHECKPOINT_KEYS: Readonly<Record<string, readonly KeyedStep[]>> = {
    values: [
        { choices: ["string", "number"], correct: "string", retry: null },
        { choices: ["number", "string"], correct: "number", retry: null },
        {
            choices: ["false", "true"],
            correct: "false",
            retry: { choices: ["false", "true"], correct: "false" }
        }
    ],
    variables: [
        { choices: ["10", "20"], correct: "10", retry: null },
        { choices: ["20", "10", "30"], correct: "20", retry: null },
        {
            choices: ["8", "5", "undefined"],
            correct: "8",
            retry: { choices: ["4", "2"], correct: "4" }
        }
    ],
    operators: [
        { choices: ["true", "false", "15"], correct: "true", retry: null },
        { choices: ["true", "false"], correct: "true", retry: null },
        {
            choices: ["true", "false"],
            correct: "true",
            retry: { choices: ["false", "true"], correct: "false" }
        }
    ]
};

export function hasCheckpoint(topic: string): boolean {
    return Object.hasOwn(CHECKPOINT_KEYS, topic);
}

/** One step as the learner answered it: the choice's text, and the retry's when one was taken. */
export interface CheckpointAnswer {
    choice: string;
    retry?: string;
}

export type CheckpointVerdict =
    | { outcome: "passed"; neededRetry: boolean }
    | { outcome: "failed" }
    /** Not a submission of this checkpoint at all: wrong shape, length or choices. */
    | { outcome: "malformed"; reason: string };

function isAnswer(value: unknown): value is CheckpointAnswer {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const { choice, retry } = value as { choice?: unknown; retry?: unknown };
    return typeof choice === "string" && (retry === undefined || typeof retry === "string");
}

/**
 * Judges a submission against the key. Malformed means the request does not
 * describe a walk through this checkpoint (a missing step, a choice the step
 * never offered, a retry where none could have been shown); failed means it
 * does, and an answer was wrong.
 */
export function judgeCheckpoint(topic: string, answers: unknown): CheckpointVerdict {
    const steps = CHECKPOINT_KEYS[topic];

    if (!steps) return { outcome: "malformed", reason: "No checkpoint for this topic" };

    if (!Array.isArray(answers) || answers.length !== steps.length || !answers.every(isAnswer)) {
        return { outcome: "malformed", reason: `Expected an answer for each of the ${steps.length} questions` };
    }

    let neededRetry = false;
    let failed = false;

    for (const [i, step] of steps.entries()) {
        const answer = answers[i]!;

        if (!step.choices.includes(answer.choice)) {
            return { outcome: "malformed", reason: `Question ${i + 1} has no such answer` };
        }

        if (answer.choice === step.correct) {
            if (answer.retry !== undefined) {
                return { outcome: "malformed", reason: `Question ${i + 1} was right first time; it has no retry` };
            }
            continue;
        }

        if (!step.retry) {
            if (answer.retry !== undefined) {
                return { outcome: "malformed", reason: `Question ${i + 1} has no retry` };
            }
            failed = true;
            continue;
        }

        if (answer.retry === undefined || !step.retry.choices.includes(answer.retry)) {
            return { outcome: "malformed", reason: `Question ${i + 1} needs its retry answered` };
        }

        neededRetry = true;
        if (answer.retry !== step.retry.correct) failed = true;
    }

    return failed ? { outcome: "failed" } : { outcome: "passed", neededRetry };
}
