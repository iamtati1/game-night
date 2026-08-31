import { describe, expect, it } from "vitest";
import { ACTIVE_SESSION_INDEX, isActiveSessionConflict } from "./conflicts.js";

/** Shaped like a real node-postgres DatabaseError. */
function pgError(code: string, constraint?: string) {
    return Object.assign(new Error("duplicate key value violates unique constraint"), {
        code,
        constraint
    });
}

describe("isActiveSessionConflict", () => {
    it("matches a duplicate on the one-active-session index", () => {
        expect(isActiveSessionConflict(pgError("23505", ACTIVE_SESSION_INDEX))).toBe(true);
    });

    it("does NOT match a unique violation on a different constraint", () => {
        // The important case. Treating any 23505 as a lost session race would
        // convert unrelated bugs into a silently resumed game.
        expect(isActiveSessionConflict(pgError("23505", "users_email_unique"))).toBe(false);
        expect(isActiveSessionConflict(pgError("23505", "session_questions_unique_question"))).toBe(
            false
        );
    });

    it("does not match a unique violation with no constraint name", () => {
        expect(isActiveSessionConflict(pgError("23505"))).toBe(false);
    });

    it("does not match other Postgres error codes", () => {
        expect(isActiveSessionConflict(pgError("23503", ACTIVE_SESSION_INDEX))).toBe(false);
        expect(isActiveSessionConflict(pgError("23514", ACTIVE_SESSION_INDEX))).toBe(false);
    });

    it("survives non-error values without throwing", () => {
        expect(isActiveSessionConflict(null)).toBe(false);
        expect(isActiveSessionConflict(undefined)).toBe(false);
        expect(isActiveSessionConflict("23505")).toBe(false);
        expect(isActiveSessionConflict(new Error("plain"))).toBe(false);
    });
});
