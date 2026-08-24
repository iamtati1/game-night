import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
        env: {
            // Modules that reach db.ts fail fast without this, which is correct in
            // production and unhelpful in a unit test. A Pool is lazy -- it opens
            // no socket until a query runs -- so importing the registry under test
            // costs nothing. The host is deliberately unroutable: any test that
            // actually tries to query will fail loudly rather than silently
            // reaching a real database.
            DATABASE_URL: "postgres://vitest:vitest@127.0.0.1:1/unused"
        }
    }
});
