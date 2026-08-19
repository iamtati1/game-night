/**
 * Manual import: npm run import:questions [count] [tag]
 *
 * Nobody is waiting on this, so it gets a longer timeout and real retries --
 * unlike the gameplay path, which uses a single tight attempt.
 */
import { importQuestions } from "../src/questions/importer.js";
import { countEligibleQuestions } from "../src/questions/queries.js";
import { createProviderFromEnv } from "../src/questions/topUp.js";
import { pool } from "../src/db.js";

const limit = Number(process.argv[2] ?? 20);
const tag = process.argv[3] ?? "JavaScript";

const provider = createProviderFromEnv(10_000, 2);

if (!provider) {
    console.error("QUIZAPI_KEY is not set in server/.env -- nothing to import from.");
    process.exit(1);
}

try {
    const before = await countEligibleQuestions();
    const report = await importQuestions(provider, { limit, tags: [tag] });
    const after = await countEligibleQuestions();

    console.log(`provider:   ${report.provider}`);
    console.log(`imported:   ${report.imported}`);
    console.log(`duplicates: ${report.duplicates}`);
    console.log(`rejected:   ${report.rejected.length}`);

    for (const reject of report.rejected) {
        console.log(`  - ${reject.externalRef ?? "?"}: ${reject.reason}`);
    }

    console.log(`eligible pool: ${before} -> ${after}`);
} catch (err) {
    console.error("Import failed:", err);
    process.exitCode = 1;
} finally {
    await pool.end();
}
