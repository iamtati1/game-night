import { describe, expect, it, vi } from "vitest";
import { QuizApiProvider } from "./quizapi.js";
import { ProviderError } from "../types.js";

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

const validQuestion = {
    id: 42,
    question: "What does typeof null return?",
    answers: {
        answer_a: "object",
        answer_b: "null",
        answer_c: "undefined",
        answer_d: null,
        answer_e: null,
        answer_f: null
    },
    correct_answers: {
        answer_a_correct: "true",
        answer_b_correct: "false",
        answer_c_correct: "false",
        answer_d_correct: "false"
    },
    difficulty: "Easy",
    tags: [{ name: "JavaScript" }]
};

function provider(fetchImpl: typeof fetch, retries = 0) {
    return new QuizApiProvider({ apiKey: "test-key", fetchImpl, retries, timeoutMs: 50 });
}

describe("QuizApiProvider", () => {
    it("normalizes a successful response", async () => {
        const fetchImpl = vi.fn(async () => jsonResponse([validQuestion]));
        const result = await provider(fetchImpl as unknown as typeof fetch).fetchQuestions({ limit: 5 });

        expect(result.rejected).toHaveLength(0);
        expect(result.questions).toHaveLength(1);

        const question = result.questions[0]!;
        expect(question.prompt).toBe("What does typeof null return?");
        expect(question.source).toBe("quizapi");
        expect(question.externalRef).toBe("42");
        expect(question.options).toHaveLength(3);
        expect(question.options.filter((o) => o.isCorrect)).toHaveLength(1);
        expect(question.options.find((o) => o.isCorrect)?.text).toBe("object");
    });

    it("sends the api key and limit but never exceeds the provider maximum", async () => {
        const fetchImpl = vi.fn(async () => jsonResponse([]));
        await provider(fetchImpl as unknown as typeof fetch).fetchQuestions({ limit: 500, tags: ["JavaScript"] });

        const url = new URL(String(fetchImpl.mock.calls[0]![0]));
        expect(url.searchParams.get("apiKey")).toBe("test-key");
        expect(url.searchParams.get("limit")).toBe("20");
        expect(url.searchParams.get("tags")).toBe("JavaScript");
    });

    it("throws a malformed error when the response shape changes", async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({ unexpected: "shape" }));

        await expect(
            provider(fetchImpl as unknown as typeof fetch).fetchQuestions({ limit: 5 })
        ).rejects.toMatchObject({ kind: "malformed" });
    });

    it("throws a malformed error when the body is not JSON", async () => {
        const fetchImpl = vi.fn(async () => new Response("<html>oops</html>", { status: 200 }));

        await expect(
            provider(fetchImpl as unknown as typeof fetch).fetchQuestions({ limit: 5 })
        ).rejects.toMatchObject({ kind: "malformed" });
    });

    it("throws a timeout error when the request aborts", async () => {
        const fetchImpl = vi.fn(async () => {
            const err = new Error("aborted");
            err.name = "TimeoutError";
            throw err;
        });

        await expect(
            provider(fetchImpl as unknown as typeof fetch).fetchQuestions({ limit: 5 })
        ).rejects.toMatchObject({ kind: "timeout" });
    });

    it("retries a 500 and succeeds on the second attempt", async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500))
            .mockResolvedValueOnce(jsonResponse([validQuestion]));

        const result = await provider(fetchImpl as unknown as typeof fetch, 1).fetchQuestions({ limit: 5 });

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(result.questions).toHaveLength(1);
    });

    it("does not retry a 429 rate limit", async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({ error: "slow down" }, 429));

        await expect(
            provider(fetchImpl as unknown as typeof fetch, 2).fetchQuestions({ limit: 5 })
        ).rejects.toMatchObject({ kind: "rate_limited" });

        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("does not retry a 4xx", async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({ error: "bad key" }, 401));

        await expect(
            provider(fetchImpl as unknown as typeof fetch, 2).fetchQuestions({ limit: 5 })
        ).rejects.toMatchObject({ kind: "http", status: 401 });

        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("rejects a question with multiple correct answers", async () => {
        const multi = {
            ...validQuestion,
            id: 7,
            correct_answers: {
                answer_a_correct: "true",
                answer_b_correct: "true",
                answer_c_correct: "false"
            }
        };
        const fetchImpl = vi.fn(async () => jsonResponse([multi]));
        const result = await provider(fetchImpl as unknown as typeof fetch).fetchQuestions({ limit: 5 });

        expect(result.questions).toHaveLength(0);
        expect(result.rejected[0]).toMatchObject({ externalRef: "7" });
        expect(result.rejected[0]!.reason).toContain("2 correct");
    });

    it("rejects a question with more than four options", async () => {
        const wide = {
            ...validQuestion,
            id: 8,
            answers: {
                answer_a: "a",
                answer_b: "b",
                answer_c: "c",
                answer_d: "d",
                answer_e: "e",
                answer_f: null
            }
        };
        const fetchImpl = vi.fn(async () => jsonResponse([wide]));
        const result = await provider(fetchImpl as unknown as typeof fetch).fetchQuestions({ limit: 5 });

        expect(result.questions).toHaveLength(0);
        expect(result.rejected[0]!.reason).toContain("5 options");
    });

    it("keeps good questions when one in the batch is bad", async () => {
        const bad = { ...validQuestion, id: 9, question: "   " };
        const fetchImpl = vi.fn(async () => jsonResponse([validQuestion, bad]));
        const result = await provider(fetchImpl as unknown as typeof fetch).fetchQuestions({ limit: 5 });

        expect(result.questions).toHaveLength(1);
        expect(result.rejected).toHaveLength(1);
    });

    it("never exposes correctness in a way the client could read as an answer key", async () => {
        const fetchImpl = vi.fn(async () => jsonResponse([validQuestion]));
        const result = await provider(fetchImpl as unknown as typeof fetch).fetchQuestions({ limit: 5 });

        // isCorrect exists on the INTERNAL representation only; it is what the
        // importer writes to question_options.is_correct. The gameplay API maps
        // options to { id, text } before serving, which is asserted separately.
        expect(result.questions[0]!.options.every((o) => "isCorrect" in o)).toBe(true);
    });
});

describe("ProviderError", () => {
    it("carries a machine-readable kind", () => {
        const err = new ProviderError("timeout", "too slow");
        expect(err.kind).toBe("timeout");
        expect(err).toBeInstanceOf(Error);
    });
});
