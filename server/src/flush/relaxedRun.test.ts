import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A relaxed Flush run has no deadline anywhere the server enforces one.
 *
 * Flush pays no speed bonus, so the relaxed pace changes exactly one thing:
 * whether a round can expire. Every expiry check in the routes must therefore
 * be gated on it, and the served round must carry no deadline -- otherwise the
 * client hides the clock while the server still times the round out.
 */
const ROUTES = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");

describe("relaxed Flush", () => {
    it("guards every expiry check with the run's pace", () => {
        const checks = ROUTES.split("\n").filter((line) => /isExpired\(/.test(line) && !/^import|^\s*\*/.test(line));
        expect(checks.length).toBeGreaterThanOrEqual(2);
        for (const line of checks) expect(line, line.trim()).toMatch(/!relaxed &&/);
    });

    it("serves no deadline and no limit for a relaxed round", () => {
        expect(ROUTES).toMatch(/const limitMs = relaxed \? null : roundTimeLimitMs\(round\.total_outputs\)/);
        expect(ROUTES).toMatch(/deadlineAt: deadline === null \? null :/);
    });

    it("reads the pace from the run, not from each request body", () => {
        // Chosen once at start; every later route asks the login session.
        expect(ROUTES.match(/wantsRelaxedRun\(req\.body\)/g)).toHaveLength(1);
        expect((ROUTES.match(/isRelaxed\(req, /g) ?? []).length).toBeGreaterThanOrEqual(3);
    });
});
