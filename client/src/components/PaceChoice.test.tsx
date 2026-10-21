import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PaceChoice } from "./PaceChoice.js";
import { usePace } from "../games/usePace.js";

function Harness({ speedBonus }: { speedBonus?: boolean }) {
    const [timed, setTimed] = usePace();
    return <PaceChoice timed={timed} onChange={setTimed} clock="18 seconds a question" speedBonus={speedBonus} />;
}

afterEach(() => {
    cleanup();
    window.localStorage.clear();
});

describe("PaceChoice", () => {
    it("defaults to relaxed and says exactly what that means", () => {
        render(<Harness />);
        expect((screen.getByRole("checkbox", { name: "Play with the clock" }) as HTMLInputElement).checked).toBe(false);
        expect(screen.getByText(/^No timer\./).textContent).toBe("No timer. Same questions and XP, without the speed bonus.");
    });

    it("switches to timed, names the clock and the bonus, and remembers it", () => {
        const view = render(<Harness />);
        fireEvent.click(screen.getByRole("checkbox", { name: "Play with the clock" }));
        expect(screen.getByText(/^18 seconds a question\./).textContent).toContain("speed bonus");

        view.unmount();
        render(<Harness />);
        expect((screen.getByRole("checkbox", { name: "Play with the clock" }) as HTMLInputElement).checked).toBe(true);
    });

    it("never promises or withholds a speed bonus a game does not have", () => {
        render(<Harness speedBonus={false} />);
        expect(screen.getByText(/^No timer\./).textContent).not.toMatch(/speed bonus/);
        fireEvent.click(screen.getByRole("checkbox"));
        expect(screen.getByText(/^18 seconds a question\./).textContent).not.toMatch(/speed bonus/);
    });
});
