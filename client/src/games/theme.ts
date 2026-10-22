import { useSyncExternalStore } from "react";

/**
 * Light (warm cream) or dark (warm dusk): the reversible theme switch.
 *
 * The choice lives on <html data-theme> so CSS can read it, and in
 * localStorage ("jolt.theme") so it is remembered on this device -- a
 * preference, not account state. index.html applies the stored choice before
 * the first paint, so a page never flashes the other theme.
 *
 * CREAM IS THE DEFAULT, the approved direction. Dusk is one tap away in the
 * header for anyone who prefers it, and is exactly the theme Jolt had before:
 * the cream rules live in one block (world.css) gated on the attribute.
 */

export type Theme = "cream" | "dusk";

const KEY = "jolt.theme";
const listeners = new Set<() => void>();

export function currentTheme(): Theme {
    return document.documentElement.dataset.theme === "dusk" ? "dusk" : "cream";
}

export function setTheme(theme: Theme): void {
    document.documentElement.dataset.theme = theme;
    try {
        window.localStorage.setItem(KEY, theme);
    } catch {
        // Storage unavailable: the choice holds for this visit.
    }
    for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function useTheme(): Theme {
    return useSyncExternalStore(subscribe, currentTheme, () => "cream");
}
