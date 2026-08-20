import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchResult, QuestionProvider } from "./types.js";
import { ProviderError } from "./types.js";

vi.mock("./queries.js", () => ({
    countEligibleQuestions: vi.fn(),
    ELIGIBLE_QUESTION_PREDICATE: ""
}));

vi.mock("./importer.js", () => ({
    importQuestions: vi.fn()
}));

const { countEligibleQuestions } = await import("./queries.js");
const { importQuestions } = await import("./importer.js");
const { ensureQuestionPool, resetTopUpState, MIN_POOL_SIZE, FAILURE_COOLDOWN_MS } = await import(
    "./topUp.js"
);

const countMock = vi.mocked(countEligibleQuestions);
const importMock = vi.mocked(importQuestions);

function stubProvider(impl?: () => Promise<FetchResult>): QuestionProvider {
    return {
        name: "stub",
        fetchQuestions: vi.fn(impl ?? (async () => ({ questions: [], rejected: [] })))
    };
}

describe("ensureQuestionPool", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetTopUpState();
    });

    it("never contacts the provider when the local pool is healthy", async () => {
        countMock.mockResolvedValue(MIN_POOL_SIZE);
        const provider = stubProvider();

        const outcome = await ensureQuestionPool(provider);

        expect(outcome.attempted).toBe(false);
        expect(provider.fetchQuestions).not.toHaveBeenCalled();
        expect(importMock).not.toHaveBeenCalled();
    });

    it("does nothing when no provider is configured", async () => {
        countMock.mockResolvedValue(3);

        const outcome = await ensureQuestionPool(null);

        expect(outcome.attempted).toBe(false);
        expect(outcome.eligibleAfter).toBe(3);
        expect(importMock).not.toHaveBeenCalled();
    });

    it("imports when the pool is below the threshold", async () => {
        countMock.mockResolvedValueOnce(5).mockResolvedValueOnce(25);
        importMock.mockResolvedValue({
            provider: "stub",
            imported: 20,
            duplicates: 0,
            rejected: [],
            failed: 0
        });

        const outcome = await ensureQuestionPool(stubProvider());

        expect(outcome.attempted).toBe(true);
        expect(outcome.eligibleAfter).toBe(25);
        expect(importMock).toHaveBeenCalledTimes(1);
    });

    it("widens the tag filter only when the narrow query imported nothing", async () => {
        countMock.mockResolvedValueOnce(5).mockResolvedValueOnce(12);
        importMock
            .mockResolvedValueOnce({ provider: "stub", imported: 0, duplicates: 20, rejected: [], failed: 0 })
            .mockResolvedValueOnce({ provider: "stub", imported: 7, duplicates: 0, rejected: [], failed: 0 });

        await ensureQuestionPool(stubProvider());

        expect(importMock).toHaveBeenCalledTimes(2);
        expect(importMock.mock.calls[0]![1]).toMatchObject({ tags: ["JavaScript"] });
        expect(importMock.mock.calls[1]![1]!.tags!.length).toBeGreaterThan(1);
    });

    // CASE 7: provider down, enough local questions -> gameplay continues.
    it("swallows a provider failure and reports the existing local pool", async () => {
        countMock.mockResolvedValue(12);
        importMock.mockRejectedValue(new ProviderError("timeout", "too slow"));

        const outcome = await ensureQuestionPool(stubProvider());

        expect(outcome.eligibleAfter).toBe(12);
        expect(outcome.reason).toContain("timeout");
    });

    // CASE 8: provider down, too few local questions -> caller still sees the
    // real count and applies the existing 503 rule. ensureQuestionPool never throws.
    it("never throws, so a provider outage cannot become a 500", async () => {
        countMock.mockResolvedValue(2);
        importMock.mockRejectedValue(new ProviderError("network", "ECONNREFUSED"));

        await expect(ensureQuestionPool(stubProvider())).resolves.toMatchObject({
            eligibleAfter: 2
        });
    });

    it("backs off after a failure instead of retrying on every game start", async () => {
        countMock.mockResolvedValue(2);
        importMock.mockRejectedValue(new ProviderError("network", "down"));

        await ensureQuestionPool(stubProvider(), 1_000);
        expect(importMock).toHaveBeenCalledTimes(1);

        // Second start, still inside the cooldown: the provider is left alone.
        const outcome = await ensureQuestionPool(stubProvider(), 1_000 + FAILURE_COOLDOWN_MS - 1);
        expect(importMock).toHaveBeenCalledTimes(1);
        expect(outcome.reason).toContain("cooling down");

        // Once the cooldown lapses, it is willing to try again.
        await ensureQuestionPool(stubProvider(), 1_000 + FAILURE_COOLDOWN_MS + 1);
        expect(importMock).toHaveBeenCalledTimes(2);
    });
});
