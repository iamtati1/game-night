import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Learn -> Play loop closes on the client as well as the server.
 *
 * POST /api/sessions now has three answers, not two: a dealt round, a genuine
 * 503, and -- for a learner whose pool is thin because they have not met enough
 * of the curriculum yet -- the concept to meet next, in the same `{
 * introduction }` shape GET /api/curriculum/introduction returns. Measured
 * against the real seeds, that third answer is what a brand-new learner gets
 * twice before their first round: 0 dealable at registration, 7 after the
 * console-output beat, 14 after arithmetic-operators.
 *
 * If GamePage ignores it, `begin()` falls through to `setEntered(true)` with no
 * session and no question, and the learner lands on a blank round that can
 * never start.
 *
 * SOURCE ASSERTIONS, for the reason preGame.node.test.ts gives: what matters is
 * that the branch exists ahead of the fall-through, which is a property of the
 * code. This does NOT prove the beat renders -- the render path is the one the
 * entrance probe already used and is unchanged.
 */
// Resolved from the working directory rather than import.meta.url: Vite rewrites
// that during transform, so it does not point at the file on disk here.
const GAME_PAGE = readFileSync(join(process.cwd(), "src/pages/GamePage.tsx"), "utf8");
const TYPES = readFileSync(join(process.cwd(), "src/api/types.ts"), "utf8");

describe("a thin pool sends the learner to the Learn Beat", () => {
    it("declares the introduction on the start-session contract", () => {
        expect(TYPES).toMatch(/export interface StartSessionResponse[\s\S]*?introduction\?: Introduction;/);
    });

    it("handles it in begin() before falling through to the round", () => {
        const begin = GAME_PAGE.slice(GAME_PAGE.indexOf("const begin = useCallback"));
        const branch = begin.indexOf("data.introduction");
        const fallThrough = begin.indexOf("setEntered(true)");

        expect(branch).toBeGreaterThan(-1);
        expect(fallThrough).toBeGreaterThan(-1);
        // Order is the whole point: after setEntered(true) this would be dead
        // code and the learner would be stranded on an empty round.
        expect(branch).toBeLessThan(fallThrough);
    });

    it("shows that beat rather than entering the round", () => {
        const begin = GAME_PAGE.slice(
            GAME_PAGE.indexOf("const begin = useCallback"),
            GAME_PAGE.indexOf("setEntered(true)", GAME_PAGE.indexOf("const begin = useCallback"))
        );

        expect(begin).toMatch(/setIntroduction\(data\.introduction\)/);
        expect(begin).toMatch(/setLearning\(true\)/);
        // Returns, so none of the session wiring below runs on this path.
        expect(begin).toMatch(/setLearning\(true\);\s*\n\s*return;/);
    });

    it("does not strand a resuming player on an empty screen either", () => {
        const resume = GAME_PAGE.slice(
            GAME_PAGE.indexOf("async function handleResume"),
            GAME_PAGE.indexOf("useEffect", GAME_PAGE.indexOf("async function handleResume"))
        );

        expect(resume).toMatch(/data\.introduction/);
        expect(resume.indexOf("data.introduction")).toBeLessThan(resume.indexOf("setPaused(false)"));
    });
});
