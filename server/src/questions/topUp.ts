import { QuizApiProvider } from "./providers/quizapi.js";
import { importQuestions } from "./importer.js";
import { countEligibleQuestions } from "./queries.js";
import { ProviderError, type QuestionProvider } from "./types.js";

/** Top up before the pool is unplayable, so imports do not happen at the moment
 *  a player is blocked, and so consecutive games are not the same ten questions. */
export const MIN_POOL_SIZE = 25;

/** After a failure, do not contact the provider again from the gameplay path
 *  for this long. Without it, a provider that is down would add its full
 *  timeout to every single game start. */
export const FAILURE_COOLDOWN_MS = 5 * 60 * 1000;

const IMPORT_BATCH_SIZE = 20;
const PRIMARY_TAGS = ["JavaScript"];
const WIDER_TAGS = ["JavaScript", "Code", "SQL"];

let cooldownUntil = 0;

/** Test seam. */
export function resetTopUpState(): void {
    cooldownUntil = 0;
}

/**
 * Built from the environment, so the key never leaves the server and the rest of
 * the application depends only on QuestionProvider. Returns null when no key is
 * configured, which is a supported state: the game runs on local questions.
 */
export function createProviderFromEnv(timeoutMs = 5000, retries = 0): QuestionProvider | null {
    const apiKey = process.env.QUIZAPI_KEY;

    if (!apiKey) {
        return null;
    }

    return new QuizApiProvider({ apiKey, timeoutMs, retries });
}

export interface TopUpOutcome {
    eligibleBefore: number;
    eligibleAfter: number;
    attempted: boolean;
    reason?: string;
}

/**
 * Called before a game starts. Never throws: an external provider being down is
 * not an error condition for gameplay, it just means we play with what we have.
 */
export async function ensureQuestionPool(
    provider: QuestionProvider | null = createProviderFromEnv(),
    now: number = Date.now()
): Promise<TopUpOutcome> {
    const eligibleBefore = await countEligibleQuestions();

    if (eligibleBefore >= MIN_POOL_SIZE) {
        return { eligibleBefore, eligibleAfter: eligibleBefore, attempted: false, reason: "pool sufficient" };
    }

    if (!provider) {
        return { eligibleBefore, eligibleAfter: eligibleBefore, attempted: false, reason: "no provider configured" };
    }

    if (now < cooldownUntil) {
        return { eligibleBefore, eligibleAfter: eligibleBefore, attempted: false, reason: "cooling down after a recent failure" };
    }

    try {
        let report = await importQuestions(provider, { limit: IMPORT_BATCH_SIZE, tags: PRIMARY_TAGS });

        // Widen the net only if the narrow query did not yield anything usable.
        if (report.imported === 0) {
            report = await importQuestions(provider, { limit: IMPORT_BATCH_SIZE, tags: WIDER_TAGS });
        }

        const eligibleAfter = await countEligibleQuestions();

        console.info(
            `Question top-up from ${report.provider}: imported ${report.imported}, ` +
                `duplicates ${report.duplicates}, rejected ${report.rejected.length}, ` +
                `pool ${eligibleBefore} -> ${eligibleAfter}`
        );

        return { eligibleBefore, eligibleAfter, attempted: true };
    } catch (err) {
        cooldownUntil = now + FAILURE_COOLDOWN_MS;

        const kind = err instanceof ProviderError ? err.kind : "unknown";
        console.warn(
            `Question top-up failed (${kind}); continuing with ${eligibleBefore} local questions.`,
            err
        );

        return { eligibleBefore, eligibleAfter: eligibleBefore, attempted: true, reason: `provider failed: ${kind}` };
    }
}
