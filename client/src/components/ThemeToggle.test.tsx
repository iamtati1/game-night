import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "./ThemeToggle.js";
import { currentTheme } from "../games/theme.js";

/**
 * The reversible theme switch: warm cream by default, warm dusk one tap away,
 * remembered on this device, applied before the first paint.
 */

beforeEach(() => {
    delete document.documentElement.dataset.theme;
    window.localStorage.clear();
});
afterEach(cleanup);

describe("the theme switch", () => {
    it("is the light cream theme unless dusk was chosen", () => {
        expect(currentTheme()).toBe("cream");
        render(<ThemeToggle />);
        expect(screen.getByRole("button", { name: "Dark theme" }).getAttribute("aria-pressed")).toBe("false");
    });

    it("switches to dusk and back, on the page and in storage", () => {
        render(<ThemeToggle />);
        const toggle = screen.getByRole("button", { name: "Dark theme" });

        fireEvent.click(toggle);
        expect(document.documentElement.dataset.theme).toBe("dusk");
        expect(window.localStorage.getItem("jolt.theme")).toBe("dusk");
        expect(toggle.getAttribute("aria-pressed")).toBe("true");

        fireEvent.click(toggle);
        expect(document.documentElement.dataset.theme).toBe("cream");
        expect(window.localStorage.getItem("jolt.theme")).toBe("cream");
        expect(toggle.getAttribute("aria-pressed")).toBe("false");
    });
});
