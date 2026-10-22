import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SceneLesson as Lesson } from "../games/scenes.js";
import { SceneLesson } from "./SceneLesson.js";

/**
 * The edit scene runs what the learner typed, for real (littleJs), as many
 * times as they like -- and a line they break says so instead of pretending.
 */

const LESSON: Lesson = {
    concept: "console-output",
    title: "Your first program",
    place: "Values",
    scenes: [
        {
            kind: "edit",
            invite: "Change the word, then run it.",
            template: 'console.log("{slot}")',
            initial: "Hello",
            hint: "type anything",
            after: "That came from you."
        }
    ]
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    vi.useRealTimers();
    cleanup();
});

const runAndWait = (name: RegExp) => {
    fireEvent.click(screen.getByRole("button", { name }));
    act(() => {
        vi.advanceTimersByTime(1000);
    });
};

describe("the edit scene", () => {
    it("runs the learner's own line and shows what JavaScript printed", () => {
        render(<SceneLesson lesson={LESSON} busy={false} onFinish={() => undefined} />);

        fireEvent.change(screen.getByRole("textbox", { name: "type anything" }), { target: { value: "Hi there" } });
        runAndWait(/Run your version/);

        expect(document.querySelector(".scene-output")?.textContent).toBe("Hi there");
        expect(screen.getByText("That came from you.")).toBeTruthy();
    });

    it("lets them change it and run again, as often as they like", () => {
        render(<SceneLesson lesson={LESSON} busy={false} onFinish={() => undefined} />);
        runAndWait(/Run your version/);
        expect(document.querySelector(".scene-output")?.textContent).toBe("Hello");

        const slot = screen.getByRole("textbox", { name: "type anything" });
        expect((slot as HTMLInputElement).disabled).toBe(false);
        fireEvent.change(slot, { target: { value: "Again" } });
        runAndWait(/Run your change/);

        expect(document.querySelector(".scene-output")?.textContent).toBe("Again");
    });

    it("shows JavaScript's complaint when the line cannot run, and holds Next until it can", () => {
        render(<SceneLesson lesson={LESSON} busy={false} onFinish={() => undefined} />);

        fireEvent.change(screen.getByRole("textbox", { name: "type anything" }), { target: { value: 'a"b' } });
        runAndWait(/Run your version/);

        expect(document.querySelector(".scene-console-error")?.textContent).toBeTruthy();
        expect(document.querySelector(".scene-output")).toBeNull();
        expect(screen.getByText(/Put the quote marks back/)).toBeTruthy();
        expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("finishes without a score or a clock", () => {
        const onFinish = vi.fn();
        const { container } = render(<SceneLesson lesson={LESSON} busy={false} onFinish={onFinish} />);
        runAndWait(/Run your version/);
        fireEvent.click(screen.getByRole("button", { name: "Next" }));

        expect(onFinish).toHaveBeenCalledTimes(1);
        expect(container.textContent).not.toMatch(/points|seconds|score/i);
    });
});
