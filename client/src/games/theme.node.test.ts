import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** The theme's boot script and the cream block's gating, read from source. */
describe("the cream theme in source", () => {
    it("is applied before the app loads, so a page never flashes the other theme", () => {
        const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
        const boot = html.indexOf('localStorage.getItem("jolt.theme")');
        const app = html.indexOf('src="/src/main.tsx"');

        expect(boot).toBeGreaterThan(-1);
        expect(boot).toBeLessThan(app);
        expect(html).toContain('document.documentElement.dataset.theme = theme');
    });

    it("keeps every cream rule behind the attribute, so dusk is exactly the old theme", () => {
        const css = readFileSync(join(process.cwd(), "src/world/world.css"), "utf8");
        const block = css.slice(css.lastIndexOf("/*", css.indexOf("WARM CREAM THEME"))).replace(/\/\*[\s\S]*?\*\//g, "");
        const rules = block.match(/^[^\s@}][^{]*\{/gm) ?? [];

        expect(rules.length).toBeGreaterThan(10);
        for (const rule of rules) expect(rule, rule).toMatch(/^:root\[data-theme="cream"\]/);
    });
});
