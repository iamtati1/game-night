import { Link } from "react-router-dom";
import type { GameEntry } from "../games/catalog.js";

/**
 * A reduction of the real game screen, drawn in CSS.
 *
 * Code Blitz is a stack of answers with one of them right and a clock running
 * out; Flush is a numbered output console with tiles waiting to go into it. Two
 * different pictures, because they are two different games -- a shared card
 * shape with a swapped accent would say the opposite.
 */
function Preview({ motif }: { motif: GameEntry["motif"] }) {
    if (motif === "blitz") {
        return (
            <div className="preview preview-blitz" aria-hidden="true">
                <span className="preview-bar" />
                <span className="preview-row" />
                <span className="preview-row is-hit" />
                <span className="preview-row" />
            </div>
        );
    }

    if (motif === "flush") {
        return (
            <div className="preview preview-flush" aria-hidden="true">
                <span className="preview-line is-printed" />
                <span className="preview-line" />
                <span className="preview-line" />
                <span className="preview-chips">
                    <i />
                    <i />
                    <i />
                </span>
            </div>
        );
    }

    if (motif === "reaction") {
        return (
            <div className="preview preview-reaction" aria-hidden="true">
                <span className="preview-ring" />
                <span className="preview-dot" />
            </div>
        );
    }

    if (motif === "memory") {
        return (
            <div className="preview preview-memory" aria-hidden="true">
                <span className="preview-chip" />
                <span className="preview-chip is-fading" />
                <span className="preview-chip is-gone" />
                <span className="preview-chip is-gone" />
            </div>
        );
    }

    if (motif === "bughunt") {
        return (
            <div className="preview preview-bughunt" aria-hidden="true">
                <span className="preview-bugline" />
                <span className="preview-bugline is-flagged" />
                <span className="preview-bugline" />
                <span className="preview-bugline" />
            </div>
        );
    }

    return null;
}

interface GameCardProps {
    game: GameEntry;
    /** Real in-flight session, if the player has one. Drives "Continue". */
    resumable?: { unitsDone: number; unitsTotal: number; score: number } | null;
}

export function GameCard({ game, resumable }: GameCardProps) {
    const inner = (
        <>
            <div className="card-top">
                <span className="card-category">{game.category}</span>
                <span className="card-intensity" aria-label={`Intensity ${game.intensity} of 3`}>
                    {[1, 2, 3].map((n) => (
                        <i key={n} className={n <= game.intensity ? "on" : ""} />
                    ))}
                </span>
            </div>

            <Preview motif={game.motif} />

            <h3 className="card-name">{game.name}</h3>
            <p className="card-hook">{game.hook}</p>

            <div className="card-foot">
                <span className="card-shape">{game.shape}</span>
                <span className="card-play">
                    {resumable ? "Continue" : "Play"}
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
                        <path d="M5 12h12m-5-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </span>
            </div>

            {/* Real progress from the player's live session -- never a placeholder. */}
            {resumable && (
                <p className="card-resume">
                    {game.unit}{" "}
                    {Math.min(resumable.unitsDone + 1, resumable.unitsTotal)} of{" "}
                    {resumable.unitsTotal} · {resumable.score} pts
                </p>
            )}
        </>
    );

    // The whole card is one link rather than a card containing a button: a single
    // focus stop, one tab target, and no nested interactive elements to trip a
    // screen reader over.
    return (
        <li className="game-card" style={{ ["--card-accent" as string]: game.accent }}>
            <Link className="card-body" to={game.path} aria-label={`Play ${game.name}`}>
                {inner}
            </Link>
        </li>
    );
}
