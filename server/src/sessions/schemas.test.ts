import { describe, expect, it } from "vitest";
import { requestedFocusTopic, startSessionSchema, wantsFreshSession } from "./schemas.js";

describe("wantsFreshSession", () => {
    // The default has to be "resume", because that is the branch that cannot
    // destroy a player's progress by accident. Anything unparseable falls back to
    // it rather than being treated as consent to discard a game.
    it("defaults to resuming", () => {
        expect(wantsFreshSession(undefined)).toBe(false);
        expect(wantsFreshSession(null)).toBe(false);
        expect(wantsFreshSession({})).toBe(false);
    });

    it("requires an explicit boolean true", () => {
        expect(wantsFreshSession({ fresh: true })).toBe(true);
        expect(wantsFreshSession({ fresh: false })).toBe(false);
    });

    it("does not accept a truthy string as consent to discard a game", () => {
        expect(wantsFreshSession({ fresh: "true" })).toBe(false);
        expect(wantsFreshSession({ fresh: 1 })).toBe(false);
    });

    it("ignores unrelated body fields", () => {
        expect(wantsFreshSession({ fresh: true, sessionId: "9" })).toBe(true);
        expect(wantsFreshSession("nonsense")).toBe(false);
    });
});

/**
 * THE BOUNDARY ON `?focus=`.
 *
 * `/code-blitz?focus=<topic>` is a real entry point: GamePage reads the query
 * parameter and puts it in the start request. The enum it is checked against
 * was nine units from migration 018 long after migration 022 widened the
 * database to sixteen, so seven real topics silently fell to null. It now
 * mirrors the constraint, and these tests fail if it drifts again.
 *
 * What the focus CANNOT do is what makes the entry point safe either way: it
 * reserves slots in one deal and is never persisted. Evidence comes from the
 * server's own /api/curriculum/introduction and is gated by mayPlayChallenge,
 * neither of which reads it -- so a forged focus cannot clear a rung, record a
 * demonstration or unlock a concept.
 */
describe("the focus topic a client may ask for", () => {
    it("accepts a real unit", () => {
        expect(requestedFocusTopic({ focusTopic: "variables" })).toBe("variables");
    });

    it("accepts the curriculum topics the stale enum used to drop", () => {
        // THE REGRESSION THIS FILE EXISTS FOR. These are real topics with real
        // questions, and until the enum was synced to migration 022 every one of
        // them parsed as invalid and fell to null -- a focus request that looked
        // honoured and was not.
        for (const topic of ["values", "operators", "control-flow", "strings", "errors", "dom", "algorithms"]) {
            expect(requestedFocusTopic({ focusTopic: topic }), topic).toBe(topic);
        }
    });

    it("still accepts the legacy conditionals slug, because questions still use it", () => {
        expect(requestedFocusTopic({ focusTopic: "conditionals" })).toBe("conditionals");
    });

    it("refuses a unit that does not exist, rather than passing it through", () => {
        expect(requestedFocusTopic({ focusTopic: "not-a-topic" })).toBeNull();
        expect(requestedFocusTopic({ focusTopic: "../../etc/passwd" })).toBeNull();
        expect(requestedFocusTopic({ focusTopic: "" })).toBeNull();
    });

    it("refuses anything that is not a string", () => {
        expect(requestedFocusTopic({ focusTopic: 7 })).toBeNull();
        expect(requestedFocusTopic({ focusTopic: ["variables"] })).toBeNull();
        expect(requestedFocusTopic({ focusTopic: { slug: "variables" } })).toBeNull();
    });

    it("treats an absent or malformed body as no focus at all", () => {
        expect(requestedFocusTopic(undefined)).toBeNull();
        expect(requestedFocusTopic(null)).toBeNull();
        expect(requestedFocusTopic("variables")).toBeNull();
    });
});

/**
 * THE CONCEPT IS NOT THE CLIENT'S TO NAME.
 *
 * Code Blitz now reserves two beats for the learner's current concept, and a
 * correct answer in one of them clears that concept's rung -- which is evidence.
 * So where the concept comes from is a security question, not a plumbing one: a
 * client able to name it could aim a run at whichever rung it wanted to clear.
 *
 * It comes from findCurrentConcept on the server, and the start-session body has
 * no field for it. These tests pin that absence, because the failure mode is a
 * field being added later for convenience and nobody noticing what it unlocked.
 */
describe("what a client may say when starting a run", () => {
    it("accepts only `fresh` and `focusTopic`", () => {
        expect(Object.keys(startSessionSchema.shape).sort()).toEqual(["focusTopic", "fresh"]);
    });

    it("has no concept field, under any spelling", () => {
        const keys = Object.keys(startSessionSchema.shape);

        for (const forbidden of ["concept", "conceptId", "concept_id", "focusConcept"]) {
            expect(keys, `${forbidden} must not be accepted`).not.toContain(forbidden);
        }
    });

    it("drops a concept a client sends anyway", () => {
        // Zod strips unknown keys rather than rejecting, so the parsed body
        // simply does not carry it -- and nothing downstream could read it.
        const parsed = startSessionSchema.parse({
            fresh: true,
            concept: "closures",
            conceptId: "42"
        });

        expect(parsed).toEqual({ fresh: true });
    });

    it("keeps focusTopic a pacing hint, not an evidence key", () => {
        // focusTopic stays client-supplied precisely because it cannot decide
        // what may be earned: it reserves beats by topic, and a rung is keyed on
        // a concept. If it ever starts selecting evidence, it has to move to the
        // server the way the concept did.
        expect(requestedFocusTopic({ focusTopic: "variables" })).toBe("variables");
        expect(requestedFocusTopic({ focusTopic: "variables", concept: "closures" })).toBe(
            "variables"
        );
    });
});
