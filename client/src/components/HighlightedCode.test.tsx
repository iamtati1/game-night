import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HighlightedCode, tokenize } from "./HighlightedCode.js";

afterEach(cleanup);

const kinds = (source: string) => tokenize(source).filter((t) => t.kind !== "plain").map((t) => [t.kind, t.text]);

describe("tokenize", () => {
    it("tells a string apart from the number it looks like", () => {
        expect(kinds('console.log("5" + 5);')).toEqual([
            ["string", '"5"'],
            ["number", "5"]
        ]);
    });

    it("colours words of the language, not the names a programmer chose", () => {
        expect(kinds("const total = 10;\nlet count = total;")).toEqual([
            ["keyword", "const"],
            ["number", "10"],
            ["keyword", "let"]
        ]);
    });

    it("keeps a quote inside a comment as part of the comment", () => {
        expect(kinds('// don\'t "run" this\nreturn 1;')).toEqual([
            ["comment", '// don\'t "run" this'],
            ["keyword", "return"],
            ["number", "1"]
        ]);
    });

    it("does not let an unterminated string swallow the next line", () => {
        expect(kinds('let a = "oops;\nlet b = 2;')).toEqual([
            ["keyword", "let"],
            ["string", '"oops;'],
            ["keyword", "let"],
            ["number", "2"]
        ]);
    });

    it("treats a digit inside a name as part of the name", () => {
        expect(kinds("let cargo2 = cargo;")).toEqual([["keyword", "let"]]);
    });

    it("reproduces the source exactly, character for character", () => {
        const source = 'const msg = `Hi ${name}`;\n/* note */ if (x === 1) {\n  console.log(\'a\');\n}';
        expect(tokenize(source).map((t) => t.text).join("")).toBe(source);
    });
});

describe("HighlightedCode", () => {
    it("renders exactly the source text, so copying and textContent are unchanged", () => {
        const source = 'let ship = "Aurora";\nconsole.log(ship);';
        const { container } = render(
            <pre>
                <HighlightedCode code={source} />
            </pre>
        );
        expect(container.querySelector("pre")!.textContent).toBe(source);
        expect(container.querySelector(".tok-string")!.textContent).toBe('"Aurora"');
        expect(container.querySelector(".tok-keyword")!.textContent).toBe("let");
    });
});
