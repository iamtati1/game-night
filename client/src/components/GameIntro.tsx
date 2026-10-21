import type { ReactNode } from "react";

interface GameIntroProps {
    /** The game's name, small and tracked above the title. */
    eyebrow: string;
    /** What the game asks of you, in four or five words. */
    title: string;
    /** One sentence on how it works. The rules, not the marketing. */
    lede: ReactNode;
    /**
     * Whether a run counts toward the course, said the same way on every game:
     * "course" for Code Blitz, Flush and Bug Hunt (they record learning
     * evidence), "fun" for Reaction and Memory (XP only). Optional `focus`
     * names what the run practises when the curriculum knows.
     */
    counts?: "course" | "fun";
    focus?: ReactNode;
    /** The real shape of a run -- rounds and timing, read off the actual config. */
    shape: string;
    /** Optional glimpse of the mechanic. Memory shows three symbols mid-fade. */
    preview?: ReactNode;
    /**
     * Optional "what this practises / how to play", for a game whose rule a
     * beginner cannot infer from the title. Read by screen readers, unlike
     * the decorative preview.
     */
    howTo?: ReactNode;
    /** The relaxed/timed choice, for a curriculum game (PaceChoice). */
    pace?: ReactNode;
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
 * All five games' start screens use it except Bug Hunt, whose themed briefing
 * (the incident fiction, integrity and attempts) is the game's identity.
 */
export function GameIntro({
    eyebrow,
    title,
    lede,
    counts,
    focus,
    shape,
    preview,
    howTo,
    pace,
    busy,
    onStart,
    startLabel = "Start"
}: GameIntroProps) {
    return (
        <section className="game-intro">
            <p className="game-intro-eyebrow">{eyebrow}</p>
            <h1 className="game-intro-title">{title}</h1>

            {counts && (
                <p className={`game-intro-counts ${counts}`}>
                    {counts === "course" ? "Counts toward your course" : "Just for fun · doesn\u2019t count toward your course"}
                </p>
            )}
            {focus}

            <p className="game-intro-lede">{lede}</p>

            {howTo && <div className="game-intro-howto">{howTo}</div>}

            {preview && (
                <div className="game-intro-preview" aria-hidden="true">
                    {preview}
                </div>
            )}

            <p className="game-intro-shape">{shape}</p>

            {pace}

            <button className="button primary big" disabled={busy} onClick={onStart}>
                {busy ? "Starting…" : startLabel}
            </button>
        </section>
    );
}
