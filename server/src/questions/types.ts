/**
 * The contract the rest of the application depends on. Nothing outside
 * src/questions/providers/ should import a vendor-specific module, so swapping
 * or adding a provider never reaches gameplay code.
 */

export interface NormalizedOption {
    text: string;
    isCorrect: boolean;
}

export interface NormalizedQuestion {
    prompt: string;
    /** Provider identifier stored on the row, e.g. "quizapi" or "internal". */
    source: string;
    /** The provider's stable id for this question; half of the dedup key. */
    externalRef: string;
    options: NormalizedOption[];
    /**
     * Carried through the abstraction but not persisted: there is no difficulty
     * or category column yet, and adding one before a feature needs it would be
     * speculative. Present so practice mode / daily challenges / difficulty
     * levels can use it later without changing this interface.
     */
    difficulty?: string;
    category?: string;
    tags?: string[];
}

export interface RejectedQuestion {
    externalRef?: string;
    reason: string;
}

export interface FetchResult {
    questions: NormalizedQuestion[];
    /** Per-question failures. One bad question must not fail the whole batch. */
    rejected: RejectedQuestion[];
}

export interface FetchQuestionsParams {
    limit: number;
    tags?: string[];
    difficulty?: string;
}

export interface QuestionProvider {
    readonly name: string;
    fetchQuestions(params: FetchQuestionsParams): Promise<FetchResult>;
}

export type ProviderErrorKind = "network" | "timeout" | "http" | "rate_limited" | "malformed";

/** Typed so callers and tests can distinguish a timeout from a schema change. */
export class ProviderError extends Error {
    readonly kind: ProviderErrorKind;
    readonly status?: number;

    constructor(kind: ProviderErrorKind, message: string, status?: number) {
        super(message);
        this.name = "ProviderError";
        this.kind = kind;
        this.status = status;
    }
}
