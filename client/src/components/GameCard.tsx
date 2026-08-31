import { useState } from "react";
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
/**
 * The one shared piece of every preview.
 *
 * Every Jolt game puts a label, a clock and a score along the top of its
 * gameplay screen, so a card that shows the same strip reads as a screenshot of
 * a game rather than as an abstract graphic. It is three empty spans -- the
 * point is the silhouette, not the data -- which is what keeps this a thumbnail
 * instead of a second copy of each game's HUD.
 *
 * `fill` is how far the meter has run, so a card can suggest "early in a round"
 * or "nearly out of time" without any of them animating.
 */
function PreviewHud({ fill = 62 }: { fill?: number }) {
    return (
        <span className="pv-hud">
            <i className="pv-hud-label" />
            <i className="pv-hud-meter">
                <i style={{ width: `${fill}%` }} />
            </i>
            <i className="pv-hud-score" />
        </span>
    );
}

/**
 * A miniature of the real thing.
 *
 * Each of these is the smallest arrangement that still reads as its game: the
 * answer stack with one row hit, the console with one line already printed, the
 * signal alone in the middle, the sequence half faded, the listing with one line
 * flagged. Deliberately NOT a scaled copy of the gameplay markup -- these share
 * the HUD strip above and nothing else, so a change to a game's screen cannot
 * silently break its card.
 */
/**
 * A real frame of the game, with the drawn preview behind it.
 *
 * The station shows what is actually inside it rather than a diagram of it. The
 * drawn preview is not deleted: it is the fallback, and it still renders for any
 * game with no capture yet -- Flush today -- and for anyone whose browser fails
 * to load the image. A card with a hole in it would be worse than a card with an
 * abstraction in it.
 *
 * Cropped from the top, because every capture is a full 1440x900 page: the
 * gameplay sits in the upper two thirds and the lower third is empty floor. The
 * frame is the existing preview box, so the card's dimensions, radius and
 * hierarchy are untouched -- only what fills the box has changed.
 */
function Shot({ game }: { game: GameEntry }) {
    const [failed, setFailed] = useState(false);

    if (!game.screenshot || failed) {
        return <Preview motif={game.motif} />;
    }

    return (
        <div className={`preview preview-shot preview-shot-${game.motif}`} aria-hidden="true">
            <img src={game.screenshot} alt="" loading="lazy" onError={() => setFailed(true)} />
        </div>
    );
}

function Preview({ motif }: { motif: GameEntry["motif"] }) {
    if (motif === "blitz") {
        // Reading fast against a clock: a stack of answers, one of them taken.
        return (
            <div className="preview preview-blitz" aria-hidden="true">
                <PreviewHud fill={38} />
                <span className="preview-row" />
                <span className="preview-row is-hit" />
                <span className="preview-row" />
            </div>
        );
    }

    if (motif === "flush") {
        // Output landing in order, with tiles still waiting underneath.
        return (
            <div className="preview preview-flush" aria-hidden="true">
                <PreviewHud fill={70} />
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
        // Nothing but the signal. The empty space IS the game.
        return (
            <div className="preview preview-reaction" aria-hidden="true">
                <PreviewHud fill={88} />
                <span className="preview-stage">
                    <span className="preview-ring" />
                    <span className="preview-dot" />
                </span>
            </div>
        );
    }

    if (motif === "memory") {
        // Untouched, deliberately. Adding the shared strip shrank the sequence
        // and stranded it at the bottom of the card -- it made the benchmark
        // worse. The sequence filling the whole preview IS the read here, and
        // this one was already doing its job.
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
        // Was four identical bars and read as a barcode. Line numbers in the
        // gutter are what make a stack of rectangles read as code, and one
        // flagged row is what makes it read as code with something wrong in it.
        return (
            <div className="preview preview-bughunt" aria-hidden="true">
                <PreviewHud fill={46} />
                <span className="preview-codeline" />
                <span className="preview-codeline is-flagged" />
                <span className="preview-codeline is-short" />
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

            <Shot game={game} />

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
