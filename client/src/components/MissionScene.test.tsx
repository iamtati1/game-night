import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MissionScene } from "./MissionScene.js";
import { VARIABLES_MISSION } from "../games/missions.js";

/**
 * The learner-facing walkthrough. Unit tests prove the judgements; this proves
 * a person can actually get from the first movement to the end.
 */
afterEach(cleanup);

function play() {
    const finished = vi.fn();
    const view = render(
        <MissionScene mission={VARIABLES_MISSION} busy={false} onFinish={finished} />
    );

    const editor = () => view.container.querySelector("textarea")!;
    const button = (re: RegExp) =>
        [...view.container.querySelectorAll("button")].find((b) => re.test(b.textContent ?? ""));

    return {
        ...view,
        finished,
        type: (value: string) => fireEvent.change(editor(), { target: { value } }),
        run: () => {
            fireEvent.click(button(/Run/)!);
            act(() => {
                vi.advanceTimersByTime(600);
            });
        },
        next: () => fireEvent.click(button(/Next|Finish/)!),
        canAdvance: () => button(/Next|Finish/) !== undefined,
        note: () => view.container.querySelector(".mission-note-body")?.textContent ?? "",
        console: () => view.container.querySelector(".scene-console")?.textContent ?? ""
    };
}

describe("a learner walks the launch check", () => {
    it("gets from the first movement to the end, and only then finishes", () => {
        vi.useFakeTimers();
        const m = play();

        // 1 · name it
        m.type("let fuel = 100;");
        m.run();
        expect(m.canAdvance(), "movement 1 solved").toBe(true);
        m.next();

        // 2 · use the name
        m.type('let fuel = 100;\nconsole.log("Fuel: " + fuel);');
        m.run();
        expect(m.canAdvance(), "movement 2 solved").toBe(true);
        m.next();

        // 3 · change the value
        m.type('let fuel = 50;\nconsole.log("Fuel: " + fuel);');
        m.run();
        expect(m.canAdvance(), "movement 3 solved").toBe(true);
        m.next();

        // Nothing has been reported yet: three of four is not the capability.
        expect(m.finished).not.toHaveBeenCalled();

        // 4 · do it yourself
        m.type(
            'let fuel = 50;\nlet crew = 3;\nconsole.log("Fuel: " + fuel);\nconsole.log("Crew: " + crew);'
        );
        m.run();
        m.next();

        expect(m.finished).toHaveBeenCalledTimes(1);
        // Walked it clean, so no retry is reported.
        expect(m.finished).toHaveBeenCalledWith(false);
        vi.useRealTimers();
    });

    it("shows the learner their own output even when the movement is not satisfied", () => {
        vi.useFakeTimers();
        const m = play();

        m.type('console.log("nope");');
        m.run();

        expect(m.console(), "their output is shown, not hidden").toContain("nope");
        expect(m.canAdvance()).toBe(false);
        vi.useRealTimers();
    });

    /* The decision the whole mission turns on, exercised through the UI. */
    it("holds the learner at movement 2 when the value is typed into the message", () => {
        vi.useFakeTimers();
        const m = play();

        m.type("let fuel = 100;");
        m.run();
        m.next();

        m.type('console.log("Fuel: 100");');
        m.run();

        expect(m.console(), "the board really does read Fuel: 100").toContain("Fuel: 100");
        expect(m.canAdvance(), "but it is not the capability").toBe(false);
        expect(m.note()).toContain("right output");
        expect(m.note()).toContain("fuel");

        // And the way forward is still open: fix it, run again, continue.
        m.type('let fuel = 100;\nconsole.log("Fuel: " + fuel);');
        m.run();
        expect(m.canAdvance()).toBe(true);
        vi.useRealTimers();
    });

    it("reports that a retry was needed when the learner missed on the way", () => {
        vi.useFakeTimers();
        const m = play();

        m.type("fuel = 100;");
        m.run();
        expect(m.canAdvance()).toBe(false);

        m.type("let fuel = 100;");
        m.run();
        m.next();

        for (const source of [
            'let fuel = 100;\nconsole.log("Fuel: " + fuel);',
            'let fuel = 50;\nconsole.log("Fuel: " + fuel);',
            'let fuel = 50;\nlet crew = 3;\nconsole.log("Fuel: " + fuel);\nconsole.log("Crew: " + crew);'
        ]) {
            m.type(source);
            m.run();
            m.next();
        }

        expect(m.finished).toHaveBeenCalledWith(true);
        vi.useRealTimers();
    });

    it("never shows a score, a timer, or an attempt count", () => {
        vi.useFakeTimers();
        const m = play();

        m.type("fuel = 100;");
        m.run();

        const text = m.container.textContent ?? "";

        expect(text).not.toMatch(/score|attempt|tries|remaining|seconds|wrong|incorrect/i);
        vi.useRealTimers();
    });

    it("names the concept rather than saying make it work", () => {
        vi.useFakeTimers();
        render(<MissionScene mission={VARIABLES_MISSION} busy={false} onFinish={vi.fn()} />);

        // Specificity is the teaching: the brief says what to declare.
        expect(screen.getByText(/Declare a name for the fuel/)).toBeTruthy();
        vi.useRealTimers();
    });
});
