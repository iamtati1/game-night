import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaygroundPage } from "./PlaygroundPage.js";

/**
 * The playground, and the one promise it has to keep.
 *
 * Experimenting is consequence-free: running code here must not clear a rung,
 * record a demonstration, award anything or move the learner. The strongest
 * form of that promise is structural -- this page imports no API client and
 * makes no request on any path -- so the test that matters most is the one
 * watching `fetch`.
 */
function show() {
    render(
        <MemoryRouter>
            <PlaygroundPage />
        </MemoryRouter>
    );

    const editor = () => screen.getByLabelText("Your code") as HTMLTextAreaElement;

    return {
        editor,
        type: (value: string) => fireEvent.change(editor(), { target: { value } }),
        /* The run is two beats, so the timer has to be let through. */
        run: () => {
            fireEvent.click(screen.getByRole("button", { name: /run it/i }));
            act(() => {
                vi.runAllTimers();
            });
        }
    };
}

describe("the Experiment playground", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
        vi.useRealTimers();
        cleanup();
    });

    it("opens with a starter example rather than an empty editor", () => {
        const pg = show();

        expect(pg.editor().value).toContain("let score = 10");
    });

    it("runs the code and shows what the last line was", () => {
        const pg = show();

        pg.run();

        expect(screen.getByText("15")).toBeTruthy();
    });

    it("runs the CHANGED code, not the code it started with", () => {
        const pg = show();

        pg.type("let score = 10;\nscore = score + 20;\nscore;");
        pg.run();

        expect(screen.getByText("30")).toBeTruthy();
    });

    it("can be run again and again", () => {
        const pg = show();

        pg.run();
        expect(screen.getByText("15")).toBeTruthy();

        pg.type("1 + 1;");
        pg.run();

        expect(screen.getByText("2")).toBeTruthy();
    });

    it("shows a mistake instead of breaking, and keeps the output before it", () => {
        const pg = show();

        pg.type('console.log("before");\nnope;');
        pg.run();

        expect(screen.getByText("ReferenceError")).toBeTruthy();

        // What ran before the failure is still shown -- seeing how far it got
        // is most of what makes an error useful.
        expect(screen.getByText("before")).toBeTruthy();
    });

    it("keeps the sandbox: an untaught construct is still refused by name", () => {
        // `class Thing {}` was the example until this-and-classes made classes
        // real grammar. The sandbox rule is unchanged -- only the construct
        // used to demonstrate it had to move on.
        const pg = show();

        pg.type("let a = new Thing();");
        pg.run();

        expect(screen.getByText(/not something we have covered yet/i)).toBeTruthy();
    });

    it("runs a class the learner writes, now that classes are taught", () => {
        const pg = show();

        pg.type('class Dog { speak() { return "woof"; } }\nnew Dog().speak();');
        pg.run();

        expect(screen.getByText("woof")).toBeTruthy();
    });

    /**
     * The promise, asserted rather than trusted. If anyone ever wires this page
     * to the API, this fails.
     */
    it("never calls the server, however many times it is run", () => {
        const pg = show();

        pg.run();
        pg.type("2 + 2;");
        pg.run();

        expect(screen.getByText("4")).toBeTruthy();
        expect(fetch).not.toHaveBeenCalled();
    });
});
