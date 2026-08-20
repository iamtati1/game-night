import { insertImportedQuestion } from "./queries.js";
import type { FetchQuestionsParams, QuestionProvider, RejectedQuestion } from "./types.js";

export interface ImportReport {
    provider: string;
    imported: number;
    duplicates: number;
    rejected: RejectedQuestion[];
    failed: number;
}

/**
 * Fetch -> validate/normalize (inside the provider) -> persist. The importer
 * knows nothing about any vendor; it only speaks the QuestionProvider contract.
 *
 * Errors from the provider propagate: deciding whether a failure is tolerable
 * belongs to the caller, because the gameplay path and the CLI answer that
 * question differently.
 */
export async function importQuestions(
    provider: QuestionProvider,
    params: FetchQuestionsParams
): Promise<ImportReport> {
    const { questions, rejected } = await provider.fetchQuestions(params);

    let imported = 0;
    let duplicates = 0;
    let failed = 0;

    for (const question of questions) {
        try {
            const outcome = await insertImportedQuestion(question);

            if (outcome === "inserted") {
                imported += 1;
            } else {
                duplicates += 1;
            }
        } catch (err) {
            // One bad row must not abandon the rest of the batch.
            failed += 1;
            console.error(
                `Failed to insert question ${question.externalRef} from ${provider.name}:`,
                err
            );
        }
    }

    return { provider: provider.name, imported, duplicates, rejected, failed };
}
