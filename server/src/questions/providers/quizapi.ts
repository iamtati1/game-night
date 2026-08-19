import {
    ProviderError,
    type FetchQuestionsParams,
    type FetchResult,
    type NormalizedOption,
    type NormalizedQuestion,
    type QuestionProvider,
    type RejectedQuestion
} from "../types.js";
import { quizApiResponseSchema, type QuizApiQuestion } from "../schemas.js";

const BASE_URL = "https://quizapi.io/api/v1/questions";
const ANSWER_KEYS = ["answer_a", "answer_b", "answer_c", "answer_d", "answer_e", "answer_f"];

export const SOURCE_NAME = "quizapi";

// Our schema enforces exactly one active correct option, and the game UI binds
// keys 1-4, so anything outside this range is rejected at normalization rather
// than blowing up on a constraint later.
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;

export interface QuizApiOptions {
    apiKey: string;
    /** Per-attempt budget. Kept tight on the gameplay path. */
    timeoutMs?: number;
    /** Retries are for the CLI path; the gameplay path passes 0. */
    retries?: number;
    fetchImpl?: typeof fetch;
}

function normalize(raw: QuizApiQuestion): NormalizedQuestion | RejectedQuestion {
    const externalRef = String(raw.id);
    const prompt = raw.question?.trim() ?? "";

    if (!prompt) {
        return { externalRef, reason: "blank prompt" };
    }

    if (prompt.length > 5000) {
        return { externalRef, reason: "prompt exceeds 5000 characters" };
    }

    const options: NormalizedOption[] = [];

    for (const key of ANSWER_KEYS) {
        const text = raw.answers[key];

        if (typeof text !== "string" || text.trim() === "") {
            continue;
        }

        // Booleans arrive as strings; compare literally.
        const correct =
            raw.correct_answers?.[`${key}_correct`] === "true" || raw.correct_answer === key;

        options.push({ text: text.trim(), isCorrect: correct });
    }

    if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
        return { externalRef, reason: `has ${options.length} options, need ${MIN_OPTIONS}-${MAX_OPTIONS}` };
    }

    const correctCount = options.filter((o) => o.isCorrect).length;

    if (correctCount !== 1) {
        return { externalRef, reason: `has ${correctCount} correct options, need exactly 1` };
    }

    return {
        prompt,
        source: SOURCE_NAME,
        externalRef,
        options,
        difficulty: raw.difficulty ?? undefined,
        category: raw.category ?? undefined,
        tags: raw.tags?.map((t) => t.name)
    };
}

function isRejected(value: NormalizedQuestion | RejectedQuestion): value is RejectedQuestion {
    return "reason" in value;
}

export class QuizApiProvider implements QuestionProvider {
    readonly name = SOURCE_NAME;

    private readonly apiKey: string;
    private readonly timeoutMs: number;
    private readonly retries: number;
    private readonly fetchImpl: typeof fetch;

    constructor(options: QuizApiOptions) {
        this.apiKey = options.apiKey;
        this.timeoutMs = options.timeoutMs ?? 5000;
        this.retries = options.retries ?? 0;
        this.fetchImpl = options.fetchImpl ?? fetch;
    }

    async fetchQuestions(params: FetchQuestionsParams): Promise<FetchResult> {
        const url = new URL(BASE_URL);
        url.searchParams.set("apiKey", this.apiKey);
        url.searchParams.set("limit", String(Math.min(params.limit, 20)));

        if (params.tags?.length) {
            url.searchParams.set("tags", params.tags.join(","));
        }

        if (params.difficulty) {
            url.searchParams.set("difficulty", params.difficulty);
        }

        const payload = await this.requestWithRetry(url);
        const parsed = quizApiResponseSchema.safeParse(payload);

        if (!parsed.success) {
            // A shape we do not recognise is a provider failure, not a crash.
            throw new ProviderError("malformed", "Response did not match the expected schema");
        }

        const questions: NormalizedQuestion[] = [];
        const rejected: RejectedQuestion[] = [];

        for (const raw of parsed.data) {
            const result = normalize(raw);

            if (isRejected(result)) {
                rejected.push(result);
            } else {
                questions.push(result);
            }
        }

        return { questions, rejected };
    }

    private async requestWithRetry(url: URL): Promise<unknown> {
        let lastError: ProviderError | null = null;

        for (let attempt = 0; attempt <= this.retries; attempt += 1) {
            try {
                return await this.requestOnce(url);
            } catch (err) {
                const error =
                    err instanceof ProviderError
                        ? err
                        : new ProviderError("network", String(err));

                // 4xx means we asked wrongly, or we are rate limited. Retrying
                // makes both worse, so only network faults and 5xx are retried.
                if (error.kind === "http" || error.kind === "rate_limited" || error.kind === "malformed") {
                    throw error;
                }

                lastError = error;

                if (attempt < this.retries) {
                    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1) ** 2));
                }
            }
        }

        throw lastError ?? new ProviderError("network", "Request failed");
    }

    private async requestOnce(url: URL): Promise<unknown> {
        let response: Response;

        try {
            response = await this.fetchImpl(url, {
                signal: AbortSignal.timeout(this.timeoutMs),
                headers: { Accept: "application/json" }
            });
        } catch (err) {
            const name = (err as { name?: string })?.name;

            if (name === "TimeoutError" || name === "AbortError") {
                throw new ProviderError("timeout", `Request exceeded ${this.timeoutMs}ms`);
            }

            throw new ProviderError("network", String(err));
        }

        if (response.status === 429) {
            throw new ProviderError("rate_limited", "Provider rate limit reached", 429);
        }

        if (response.status >= 500) {
            throw new ProviderError("network", `Provider returned ${response.status}`, response.status);
        }

        if (!response.ok) {
            throw new ProviderError("http", `Provider returned ${response.status}`, response.status);
        }

        try {
            return await response.json();
        } catch {
            throw new ProviderError("malformed", "Response body was not valid JSON");
        }
    }
}
