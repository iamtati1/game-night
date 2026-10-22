import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The desktop arena layouts for Code Blitz and Bug Hunt are layout only.
 *
 * jsdom applies no CSS, so these read the stylesheet and the page source:
 *   - the layout exists only at 64rem and up (phones keep one column);
 *   - nothing in it reorders content visually (no `order`, no `*-reverse`),
 *     so what a sighted learner sees and what the keyboard and a screen reader
 *     follow are the same sequence;
 *   - Bug Hunt's arena wrapper holds the code and the answer controls, and the
 *     report, traces and actions stay outside it, in the supporting column.
 */
const css = readFileSync(join(process.cwd(), "src/world/world.css"), "utf8");
const block = css.slice(css.indexOf("DESKTOP GAMEPLAY: arena + supporting column"));
const media = block.slice(block.indexOf("@media (min-width: 64rem)"));
const page = readFileSync(join(process.cwd(), "src/pages/BugHuntPage.tsx"), "utf8");

describe("desktop gameplay layout", () => {
    it("applies only on wide screens", () => {
        expect(media.startsWith("@media (min-width: 64rem)")).toBe(true);
        expect(media).toContain(".game.blitz:has(> .play-stage)");
        expect(media).toContain(".bh-incident > .bh-arena");
    });

    it("never reorders content away from DOM order", () => {
        expect(media).not.toMatch(/\border\s*:/);
        expect(media).not.toMatch(/reverse/);
    });

    it("puts Bug Hunt's code and answers in the arena, and the report and actions beside it", () => {
        const arena = page.slice(page.indexOf('<div className="bh-arena">'), page.indexOf('<ol className="bh-hints">'));
        expect(arena).toContain("<CodeLines");
        expect(arena).toContain("<PatchChoices");
        expect(arena).not.toContain("bh-actions");
        expect(arena).not.toContain("bh-report");
    });
});
