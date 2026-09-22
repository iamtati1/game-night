import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    new URL("../../migrations/023_add_bug_hunt_challenge_id.sql", import.meta.url),
    "utf8"
);

const challengesMigration = readFileSync(
    new URL("../../migrations/021_create_challenges.sql", import.meta.url),
    "utf8"
);

describe("migration 023 keeps the Bug Hunt challenge relationship", () => {
    it("adds a nullable challenge_id without backfilling existing incidents", () => {
        expect(migration).toContain(
            "ADD COLUMN challenge_id BIGINT NULL"
        );

        expect(migration).not.toMatch(
            /UPDATE\s+bug_hunt_incidents/i
        );

        expect(migration).not.toMatch(
            /SET\s+challenge_id/i
        );
    });

    it("references challenges with RESTRICT", () => {
        expect(migration).toMatch(
            /FOREIGN KEY\s*\(challenge_id\)\s*REFERENCES\s+challenges\s*\(id\)\s*ON DELETE RESTRICT/i
        );
    });

    it("enforces one challenge per Bug Hunt incident", () => {
        expect(migration).toMatch(
            /CREATE UNIQUE INDEX bug_hunt_incidents_challenge_id_idx/i
        );

        expect(migration).toMatch(
            /ON bug_hunt_incidents\s*\(challenge_id\)\s*WHERE challenge_id IS NOT NULL/i
        );
    });

    it("does not alter existing Bug Hunt content columns", () => {
        expect(migration).not.toMatch(
            /DROP COLUMN/i
        );

        expect(migration).not.toMatch(
            /ALTER COLUMN/i
        );

        expect(migration).not.toMatch(
            /UPDATE\s+bug_hunt_incidents/i
        );
    });

    it("does not put Bug Hunt content ownership on challenges", () => {
        const sqlOnly = challengesMigration
            .split("\n")
            .filter((line) => !line.trimStart().startsWith("--"))
            .join("\n");

        for (const column of [
            "question_id",
            "snippet_id",
            "incident_id",
        ]) {
            expect(sqlOnly).not.toContain(column);
        }
    });

    it("uses a partial unique index so unassigned incidents can coexist", () => {
        expect(migration).toMatch(
            /CREATE UNIQUE INDEX bug_hunt_incidents_challenge_id_idx\s+ON bug_hunt_incidents\s*\(challenge_id\)\s+WHERE challenge_id IS NOT NULL/i
        );
    });
});
