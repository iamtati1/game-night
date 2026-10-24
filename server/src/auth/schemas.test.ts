import { describe, expect, it } from "vitest";
import { registerSchema } from "./schemas.js";

/**
 * Registration's 400s are validation, and each names its field in words a
 * learner can act on. QA: a register 400 on the deployed app was read from the
 * console, because the reason was easy to miss on the page.
 */

const valid = { email: "learner@example.com", username: "learner", password: "longenough1" };
const reasons = (input: object) => {
    const r = registerSchema.safeParse(input);
    return r.success ? [] : r.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
};

describe("registration validation", () => {
    it("accepts real addresses, normalised", () => {
        for (const email of ["learner@gmail.com", "Learner+Demo@Example.COM ", "o'brien@sub.example.co.uk"]) {
            expect(reasons({ ...valid, email }), email).toEqual([]);
        }
        expect(registerSchema.parse({ ...valid, email: " A@B.io " }).email).toBe("a@b.io");
    });

    it("says what a valid email looks like when the domain has no dot", () => {
        expect(reasons({ ...valid, email: "test@test" })).toEqual([
            { field: "email", message: "Enter a full email address, like name@example.com" }
        ]);
    });

    it("names the username and password rules", () => {
        expect(reasons({ ...valid, username: " ab " })).toEqual([
            { field: "username", message: "Username must be at least 3 characters" }
        ]);
        expect(reasons({ ...valid, password: "short" })).toEqual([
            { field: "password", message: "Password must be at least 8 characters" }
        ]);
    });
});
