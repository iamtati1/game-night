import type { ReactNode } from "react";

interface GameIntroProps {
    /** The game's name, small and tracked above the title. */
    eyebrow: string;
    /** What the game asks of you, in four or five words. */
    title: string;
    /** One or two lines on how it works. The rules, not the marketing. */
    lede: ReactNode;
    /** The real shape of a run -- rounds and timing, read off the actual config. */
    shape: string;
    /** Optional glimpse of the mechanic. Memory shows three symbols mid-fade. */
    preview?: ReactNode;
    busy: boolean;
    onStart: () => void;
    startLabel?: string;
}

/**
 * The entrance to a game.
 *
 * This exists because playing all five games back to back made one difference
 * obvious: Memory, Reaction and Bug Hunt introduce themselves before they start,
 * and Code Blitz and Flush drop you into question one with the clock already
 * running. The two without an entrance are the two that feel like an app.
 *
 * Deliberately a small shared component and not a universal game shell. All it
 * owns is the entrance -- name, promise, rules, shape, one button. Everything
 * past the button stays entirely each game's own.
 *
 * Memory keeps its own hand-built intro. It was the benchmark this was derived
 * from and there is nothing to gain by making it share.
 */
export function GameIntro({
    eyebrow,
    title,
    lede,
    shape,
    preview,
    busy,
    onStart,
    startLabel = "Start"
}: GameIntroProps) {
    return (
        <section className="game-intro">
            <p className="game-intro-eyebrow">{eyebrow}</p>
            <h1 className="game-intro-title">{title}</h1>
            <p className="game-intro-lede">{lede}</p>

            {preview && (
                <div className="game-intro-preview" aria-hidden="true">
                    {preview}
                </div>
            )}

            <p className="game-intro-shape">{shape}</p>

            <button className="button primary big" disabled={busy} onClick={onStart}>
                {busy ? "Starting…" : startLabel}
            </button>
        </section>
    );
}
