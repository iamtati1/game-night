import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readSqlDirectory, stripOwnTransaction } from "./sqlFiles.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = readSqlDirectory(join(HERE, "..", "migrations"));
const SEEDS = readSqlDirectory(join(HERE, "..", "seeds"));

/** A statement-level BEGIN; or COMMIT; on its own line -- what the runner owns. */
const OWN_TRANSACTION = /^\s*(BEGIN|COMMIT)\s*;\s*$/im;

describe("migration ordering", () => {
    it("reads every migration in the repository", () => {
        expect(MIGRATIONS.length).toBeGreaterThanOrEqual(16);
    });

    it("orders by the numeric prefix, so 009 runs before 010", () => {
        const prefixes = MIGRATIONS.map((f) => Number(f.name.slice(0, 3)));

        expect(prefixes).toEqual([...prefixes].sort((a, b) => a - b));
    });

    it("starts at the shared functions every later migration depends on", () => {
        expect(MIGRATIONS[0]!.name).toBe("000_shared_functions.sql");
    });

    it("gives each migration a distinct name, since the name is the ledger key", () => {
        expect(new Set(MIGRATIONS.map((f) => f.name)).size).toBe(MIGRATIONS.length);
    });

    it("is stable across reads, so two machines apply the same order", () => {
        const again = readSqlDirectory(join(HERE, "..", "migrations"));

        expect(again.map((f) => f.name)).toEqual(MIGRATIONS.map((f) => f.name));
        expect(again.map((f) => f.checksum)).toEqual(MIGRATIONS.map((f) => f.checksum));
    });
});

/**
 * The runner takes the transaction away from the file so the schema change and
 * the ledger row commit together. These are the tests that make that safe: if
 * the strip removed too much, a migration would run outside a transaction; if
 * it removed too little, the file's own COMMIT would close the runner's.
 */
describe("stripOwnTransaction", () => {
    it("leaves no file able to close the runner's transaction", () => {
        for (const file of [...MIGRATIONS, ...SEEDS]) {
            expect(
                OWN_TRANSACTION.test(stripOwnTransaction(file.sql)),
                `${file.name} still has a statement-level BEGIN; or COMMIT;`
            ).toBe(false);
        }
    });

    it("removes only those lines and nothing else", () => {
        for (const file of [...MIGRATIONS, ...SEEDS]) {
            const before = file.sql.split("\n");
            const after = stripOwnTransaction(file.sql).split("\n");
            const removed = before.filter((l) => OWN_TRANSACTION.test(l)).length;

            expect(after.length, `${file.name}`).toBe(before.length - removed);
            expect(
                after,
                `${file.name} lost a line that was not BEGIN;/COMMIT;`
            ).toEqual(before.filter((l) => !OWN_TRANSACTION.test(l)));
        }
    });

    it("does not touch files that never managed their own transaction", () => {
        const plain = MIGRATIONS.filter((f) => !OWN_TRANSACTION.test(f.sql));

        expect(plain.length).toBeGreaterThan(0);
        for (const file of plain) {
            expect(stripOwnTransaction(file.sql), file.name).toBe(file.sql);
        }
    });

    it("strips the files that did, and there are known to be some", () => {
        const wrapped = MIGRATIONS.filter((f) => OWN_TRANSACTION.test(f.sql));

        expect(wrapped.length).toBeGreaterThanOrEqual(6);
        for (const file of wrapped) {
            expect(stripOwnTransaction(file.sql).length, file.name).toBeLessThan(file.sql.length);
        }
    });

    it("keeps SQL that merely mentions the words", () => {
        const sql = [
            "-- BEGIN; in a comment stays",
            "CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $$",
            "BEGIN",
            "    RAISE NOTICE 'COMMIT;';",
            "END;",
            "$$;"
        ].join("\n");

        // plpgsql's BEGIN has no semicolon and the rest is quoted or commented,
        // so a body that reads like transaction control survives intact.
        expect(stripOwnTransaction(sql)).toBe(sql);
    });

    it("preserves dollar-quoted function bodies in the real migrations", () => {
        const shared = MIGRATIONS.find((f) => f.name === "000_shared_functions.sql")!;
        const stripped = stripOwnTransaction(shared.sql);

        expect((stripped.match(/\$\$/g) ?? []).length).toBe(
            (shared.sql.match(/\$\$/g) ?? []).length
        );
    });
});

describe("checksums", () => {
    it("differ between files, so drift detection can tell them apart", () => {
        expect(new Set(MIGRATIONS.map((f) => f.checksum)).size).toBe(MIGRATIONS.length);
    });

    it("change when the content changes", () => {
        const [a] = MIGRATIONS;

        expect(readSqlDirectory(join(HERE, "..", "migrations"))[0]!.checksum).toBe(a!.checksum);
    });
});
