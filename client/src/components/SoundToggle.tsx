import { Icon } from "../world/Icon.js";
import { setSoundEnabled, useSoundEnabled } from "../games/sound.js";

/**
 * The speaker in the header: one tap mutes or unmutes Jolt's sound effects.
 *
 * A toggle button (aria-pressed) with a fixed name, so a screen reader hears
 * "Sound effects, toggle button, pressed" rather than a label that flips
 * meaning. The tooltip says what a tap will do.
 */
export function SoundToggle() {
    const on = useSoundEnabled();

    return (
        <button
            type="button"
            className="sound-toggle"
            aria-label="Sound effects"
            aria-pressed={on}
            title={on ? "Sound effects on: tap to mute" : "Sound effects off: tap to turn on"}
            onClick={() => setSoundEnabled(!on)}
        >
            <Icon name={on ? "sound-on" : "sound-off"} size={20} />
        </button>
    );
}
