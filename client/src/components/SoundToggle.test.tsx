import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SoundToggle } from "./SoundToggle.js";
import { resetSoundForTests, soundEnabled } from "../games/sound.js";

beforeEach(() => {
    window.localStorage.clear();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
    resetSoundForTests();
});

afterEach(cleanup);

describe("the sound toggle", () => {
    it("is a named toggle button that says whether sound is on", () => {
        render(<SoundToggle />);
        const button = screen.getByRole("button", { name: "Sound effects" });
        expect(button.getAttribute("aria-pressed")).toBe("true");
        expect(button.getAttribute("title")).toMatch(/tap to mute/);
    });

    it("mutes on a tap, remembers it, and turns back on", () => {
        render(<SoundToggle />);
        const button = screen.getByRole("button", { name: "Sound effects" });

        fireEvent.click(button);
        expect(button.getAttribute("aria-pressed")).toBe("false");
        expect(soundEnabled()).toBe(false);
        expect(window.localStorage.getItem("jolt.sound")).toBe("off");

        fireEvent.click(button);
        expect(button.getAttribute("aria-pressed")).toBe("true");
        expect(window.localStorage.getItem("jolt.sound")).toBe("on");
    });

    it("shows the same state in every toggle on the page", () => {
        render(
            <>
                <SoundToggle />
                <SoundToggle />
            </>
        );
        const [a, b] = screen.getAllByRole("button", { name: "Sound effects" });
        fireEvent.click(a!);
        expect(b!.getAttribute("aria-pressed")).toBe("false");
    });
});
