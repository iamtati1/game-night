import { describe, expect, it } from "vitest";
import { ACTIVE_SESSION_INDEX, isActiveSessionConflict, resolveSessionRace } from "./conflicts.js";

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

/**
 * Losing the create-session race must never be a 500.
 *
 * POST /api/sessions checks for an active session and then inserts, and those
 * are not one operation. When the slot changes hands in between, the INSERT is
 * rejected by game_sessions_one_active_per_user_idx -- and the route used to
 * rethrow that rejection whenever the winner was not Code Blitz, which the app's
 * error handler reported to the player as "Internal Server Error". Production
 * showed exactly that: two 409s, a 404, then a 500 on the same endpoint.
 *
 * The information needed to answer properly is always present. These name the
 * three states the loser can find the slot in.
 */
describe("resolveSessionRace", () => {
    const CODE_BLITZ = "code-blitz";

    it("resumes when this player's own game won the race", () => {
        // The ordinary double-submit: two requests for the same game, one row.
        // Resuming the winner is the right outcome, not a tolerated one.
        expect(resolveSessionRace({ gameSlug: CODE_BLITZ }, CODE_BLITZ)).toBe("resume");
    });

    it("reports a conflict when another game took the slot", () => {
        // The 500 in production. This is the same state the check at the top of
        // the route answers with 409 -- it simply arrived a moment later.
        for (const slug of ["flush", "memory", "reaction", "bug-hunt"]) {
            expect(resolveSessionRace({ gameSlug: slug }, CODE_BLITZ), slug).toBe("conflict");
        }
    });

    it("asks for a retry when the slot is already free again", () => {
        // Something held it when the INSERT was rejected and has since finished,
        // paused or been quit. Nothing to resume, nobody to name -- but trying
        // again will work, which a 500 never told the player.
        expect(resolveSessionRace(null, CODE_BLITZ)).toBe("retry");
    });

    it("never answers with anything that would raise a 500", () => {
        const states = [null, { gameSlug: CODE_BLITZ }, { gameSlug: "flush" }];

        for (const winner of states) {
            expect(["resume", "conflict", "retry"]).toContain(
                resolveSessionRace(winner, CODE_BLITZ)
            );
        }
    });

    it("decides by the game asked for, not by a hardcoded Code Blitz", () => {
        // The other four games create sessions the same way and can lose the
        // same race, so the rule must not be Code Blitz's alone.
        expect(resolveSessionRace({ gameSlug: "flush" }, "flush")).toBe("resume");
        expect(resolveSessionRace({ gameSlug: CODE_BLITZ }, "flush")).toBe("conflict");
    });
});
