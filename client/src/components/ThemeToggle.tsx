import { setTheme, useTheme } from "../games/theme.js";
import { Icon } from "../world/Icon.js";

/**
 * The header's theme switch: light (warm cream) or dark (warm dusk).
 *
 * The button names what it will do, not what is on, and aria-pressed says
 * whether the dark theme is on -- so the state is never carried by the icon
 * alone. Next to the sound switch, the other per-device preference.
 */
export function ThemeToggle() {
    const theme = useTheme();
    const dark = theme === "dusk";

    return (
        <button
            type="button"
            className="sound-toggle theme-toggle"
            aria-pressed={dark}
            aria-label="Dark theme"
            title={dark ? "Switch to the light theme" : "Switch to the dark theme"}
            onClick={() => setTheme(dark ? "cream" : "dusk")}
        >
            <Icon name={dark ? "moon" : "sun"} size={18} />
        </button>
    );
}
