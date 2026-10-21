/**
 * Restrained syntax colouring for the code a learner reads.
 *
 * Four kinds are coloured -- keywords, strings, numbers, comments -- because
 * those are the distinctions a beginner is actually being taught to see: that
 * `"5"` and `5` are different things, that `const` is a word of the language
 * and `total` is a name someone chose. Everything else stays plain ink.
 * Colour is never the only signal; the text is unchanged and fully readable
 * without it.
 *
 * Purely presentational: the rendered text is exactly the source, character
 * for character, so copying it or asserting on its textContent is unaffected.
 * (Inline `code` in prose is withCode() in CodeText.tsx -- a different job.)
 */

export type TokenKind = "keyword" | "string" | "number" | "comment" | "plain";

export interface Token {
    kind: TokenKind;
    text: string;
}

const KEYWORDS = new Set([
    "async", "await", "break", "case", "catch", "class", "const", "continue",
    "default", "do", "else", "export", "extends", "false", "finally", "for",
    "function", "if", "import", "in", "instanceof", "let", "new", "null", "of",
    "return", "static", "super", "switch", "this", "throw", "true", "try",
    "typeof", "undefined", "var", "void", "while", "yield"
]);

/*
 * One pass, in priority order. Comments before strings so a quote inside a
 * comment stays a comment; strings before numbers so the 5 in "5" stays text.
 * An unterminated string runs to the end of its line rather than swallowing
 * the rest of the program.
 */
const PATTERN =
    /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;

export function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let last = 0;

    const plain = (text: string) => {
        if (!text) return;
        const previous = tokens[tokens.length - 1];
        if (previous?.kind === "plain") previous.text += text;
        else tokens.push({ kind: "plain", text });
    };

    for (const match of source.matchAll(PATTERN)) {
        const [text, comment, string, number, word] = match;
        plain(source.slice(last, match.index));
        last = match.index + text.length;

        if (comment) tokens.push({ kind: "comment", text });
        else if (string) tokens.push({ kind: "string", text });
        else if (number) tokens.push({ kind: "number", text });
        else if (word && KEYWORDS.has(word)) tokens.push({ kind: "keyword", text });
        else plain(text);
    }

    plain(source.slice(last));
    return tokens;
}

/** The highlighted source, for use inside an existing <pre>. */
export function HighlightedCode({ code }: { code: string }) {
    return (
        <>
            {tokenize(code).map((token, i) =>
                token.kind === "plain" ? (
                    token.text
                ) : (
                    <span key={i} className={`tok-${token.kind}`}>
                        {token.text}
                    </span>
                )
            )}
        </>
    );
}
