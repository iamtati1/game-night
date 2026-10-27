import { describe, expect, it } from "vitest";
import { explanationParts, sentences } from "./explanation.js";

/* Texts are real explanations from the question bank (read on a clone). */
describe("splitting an explanation into sentences", () => {
    it("ends a sentence at a full stop followed by more text", () => {
        expect(
            sentences("The line `let b = a;` reads `a` and stores its value, `5`. Logging `b` prints that copy.")
        ).toEqual(["The line `let b = a;` reads `a` and stores its value, `5`.", "Logging `b` prints that copy."]);
    });

    it("never cuts inside backticks, a decimal or a property", () => {
        expect(sentences("Use `a. b` here. Then 0.5 and a.length stay whole.")).toEqual([
            "Use `a. b` here.",
            "Then 0.5 and a.length stay whole."
        ]);
    });

    it("keeps a sentence that starts with a lowercase keyword", () => {
        expect(sentences("var has one binding. let gives each iteration its own.")).toEqual([
            "var has one binding.",
            "let gives each iteration its own."
        ]);
    });

    it("keeps a closing quote with its sentence, and does not end at e.g.", () => {
        expect(sentences('It prints "Hi." Then, e.g. this, it stops.')).toEqual(['It prints "Hi."', "Then, e.g. this, it stops."]);
    });

    it("does not end a sentence on an ellipsis in code shorthand", () => {
        expect(sentences("Nothing awaits it. await Promise.all(users.map(...)) would work.")).toEqual([
            "Nothing awaits it.",
            "await Promise.all(users.map(...)) would work."
        ]);
    });

    it("loses no text: joined back, the sentences are the original", () => {
        const text =
            "Throwing stops the function immediately and hands the error to whoever called it. Logging prints and carries on regardless; returning an error hands it back as an ordinary value the caller may never look at; and building one without throwing it does nothing at all.";
        expect(sentences(text).join(" ")).toBe(text);
    });
});

describe("an explanation's parts", () => {
    it("leads with the first sentence and shows the second", () => {
        expect(explanationParts("true is a value in its own right. It is displayed without quotes.")).toEqual({
            lead: "true is a value in its own right.",
            rest: "It is displayed without quotes.",
            more: null
        });
    });

    it("puts a third sentence and beyond in `more`", () => {
        const parts = explanationParts(
            "`+=` adds to what fuel already holds, so fuel is 8. `-=` then takes 1 from that 8. Each line changes the value the next line sees. 4 would mean every line started again."
        );
        expect(parts.lead).toBe("`+=` adds to what fuel already holds, so fuel is 8.");
        expect(parts.rest).toBe("`-=` then takes 1 from that 8.");
        expect(parts.more).toBe("Each line changes the value the next line sees. 4 would mean every line started again.");
    });

    it("leads a bare verdict together with the rule after it", () => {
        expect(
            explanationParts("Nothing here. The wrong value has already been returned by the line above.")
        ).toEqual({
            lead: "Nothing here. The wrong value has already been returned by the line above.",
            rest: null,
            more: null
        });
    });

    it("is one lead for a one-sentence explanation", () => {
        expect(explanationParts("Lines run top to bottom.")).toEqual({ lead: "Lines run top to bottom.", rest: null, more: null });
    });
});
