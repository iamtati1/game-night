import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SERVER_SRC = new URL("..", import.meta.url).pathname;

function readAll(dir: string): { file: string; text: string }[] {
    return readdirSync(join(SERVER_SRC, dir))
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
        .map((f) => ({ file: `${dir}/${f}`, text: readFileSync(join(SERVER_SRC, dir, f), "utf8") }));
}

describe("architecture boundaries", () => {
    // CASE 9: gameplay must not depend on the external API.
    it("no gameplay file imports a vendor-specific provider", () => {
        for (const { file, text } of readAll("game")) {
            expect(text, `${file} must not reference a vendor`).not.toMatch(/providers\/|quizapi/i);
        }
    });

    it("gameplay reaches the provider layer only through the topUp seam", () => {
        const routes = readFileSync(join(SERVER_SRC, "game/routes.ts"), "utf8");
        const questionImports = [...routes.matchAll(/from "\.\.\/questions\/([\w.]+)\.js"/g)].map(
            (m) => m[1]
        );

        expect(new Set(questionImports)).toEqual(new Set(["topUp", "queries"]));
    });

    // CASE 10: correct answers must not reach the client before submission.
    it("served questions expose only id and text", () => {
        const routes = readFileSync(join(SERVER_SRC, "game/routes.ts"), "utf8");

        expect(routes).toMatch(/options: shuffle\(options\)\.map\(\(o\) => \(\{ id: o\.id, text: o\.option_text \}\)\)/);
        // The raw option rows carry is_correct; they must never be spread wholesale.
        expect(routes).not.toMatch(/options: shuffle\(options\),/);
    });

    it("correct_option_text is only written on answer or timeout, never at planning time", () => {
        const queries = readFileSync(join(SERVER_SRC, "game/queries.ts"), "utf8");
        const planningInsert = queries.slice(
            queries.indexOf("INSERT INTO session_questions"),
            queries.indexOf("export async function listSessionQuestions")
        );

        expect(planningInsert).not.toMatch(/correct_option_text/);
    });
});
