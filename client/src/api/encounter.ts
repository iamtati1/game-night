/**
 * The encounter, as the server describes it.
 *
 * Mirrors EncounterView in server/src/curriculum/encounter.ts. Everything here
 * is DECIDED THERE: which rungs exist, what can be played at each, which are
 * cleared, which one is next, and what the exercises may assume the learner
 * knows. The client renders this; it does not compute any of it.
 */
export interface EncounterOption {
    challengeId: string;
    difficulty: number;
    /** `mission` carries no id -- the movement is found by (concept, demand). */
    content: { kind: "question"; id: string } | { kind: "incident"; id: string } | { kind: "mission" };
}

export interface EncounterRung {
    demandSlug: string;
    demandOrder: number;
    cleared: boolean;
    /** Empty when the curriculum declares the rung and nothing fills it yet. */
    options: EncounterOption[];
}

export interface Encounter {
    conceptSlug: string;
    name: string;
    objective: string;
    meaning: string;
    topicSlug: string;
    prerequisites: string[];
    demonstrated: boolean;
    rungs: EncounterRung[];
    reachable: boolean;
    unmetPrerequisites: string[];
    allowedConcepts: string[];
    currentRung: string | null;
    next: { slug: string; name: string } | null;
    playable: boolean;
}

export interface Exercise {
    challengeId: string;
    kind: "question" | "incident";
    /** The question, in prose. Never code -- the server splits it. */
    ask: string;
    code: string | null;
    /** What is wrong, for a diagnosis. Null for a question. */
    brief: string | null;
    options: { id: string; text: string }[];
}

export interface Judgement {
    correct: boolean;
    explanation: string | null;
    correctOptionId: string;
}

/**
 * What the learner is told a rung is for.
 *
 * The curriculum's demand slugs are internal vocabulary -- a learner should
 * never have to know what `predict` means to use Jolt. These are the same rungs
 * in their terms. An unknown slug falls back to itself rather than being hidden,
 * so a new rung is visibly unlabelled instead of silently missing.
 */
const RUNG_LABELS: Record<string, string> = {
    recognise: "Spot it",
    recall: "Remember it",
    predict: "Work out what happens",
    apply: "Use it",
    produce: "Write it",
    diagnose: "Find the problem",
    repair: "Fix it",
    explain: "Explain it"
};

export function rungLabel(demandSlug: string): string {
    return RUNG_LABELS[demandSlug] ?? demandSlug;
}
