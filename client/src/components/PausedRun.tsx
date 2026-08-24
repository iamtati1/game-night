import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import { gameBySlug } from "../games/catalog.js";

interface PausedRunProps {
    /** Catalog slug. Supplies the game's name and accent, so nothing is hardcoded. */
    slug: string;
    /** Where the run stopped, in the game's own units. */
    progress: { unit: string; current: number; total: number } | null;
    score: number;
    busy: boolean;
    onResume: () => void;
}

/**
 * The screen a paused run sits on.
 *
 * Shared because pausing is genuinely one concept: both games stop the clock,
 * hold their place, and offer the same two ways forward. Only the name, the
 * accent and the word for a unit differ, and all three come from the catalog.
 *
 * It exists to answer three questions at a glance -- what am I in the middle of,
 * how far did I get, and how do I leave -- because the previous version answered
 * only the first.
 */
export function PausedRun({ slug, progress, score, busy, onResume }: PausedRunProps) {
    const navigate = useNavigate();
    const game = gameBySlug(slug);
    const [confirming, setConfirming] = useState(false);
    const [quitting, setQuitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function quit() {
        setQuitting(true);
        setError(null);

        try {
            await api.post(`/api/me/sessions/${slug}/abandon`);
            navigate("/", { replace: true });
        } catch (err) {
            setQuitting(false);
            setError(err instanceof ApiError ? err.detailText : "Could not quit this run");
        }
    }

    return (
        <section
            className="paused"
            style={game ? ({ ["--accent" as string]: game.accent }) : undefined}
        >
            <p className="paused-eyebrow">Paused</p>
            <h1 className="paused-game">{game?.name ?? slug}</h1>

            {/* The real position in the run. "Your progress is saved" is a promise;
                this is the evidence for it. */}
            {progress && (
                <p className="paused-progress">
                    <span>
                        {progress.unit} <strong>{progress.current}</strong> of {progress.total}
                    </span>
                    <span className="paused-dot" />
                    <span>
                        <strong>{score}</strong> pts
                    </span>
                </p>
            )}

            <p className="paused-note">
                The clock is stopped. Come back whenever — this run will be waiting.
            </p>

            {error && (
                <p className="form-error" role="alert">
                    {error}
                </p>
            )}

            {confirming ? (
                // Two steps, because the first one cannot be undone. Quitting is a
                // real choice here, not a slip on the way to Resume.
                <div className="paused-confirm">
                    <p>
                        Quit for good? This run keeps its score in your history, but you
                        will not be able to pick it up again.
                    </p>
                    <div className="paused-actions">
                        <button
                            className="button danger"
                            onClick={() => void quit()}
                            disabled={quitting}
                        >
                            {quitting ? "Quitting…" : "Yes, quit this run"}
                        </button>
                        <button
                            className="button ghost"
                            onClick={() => setConfirming(false)}
                            disabled={quitting}
                        >
                            Keep it
                        </button>
                    </div>
                </div>
            ) : (
                <div className="paused-actions">
                    <button className="button primary" onClick={onResume} disabled={busy}>
                        Resume
                    </button>
                    <button
                        className="button ghost"
                        onClick={() => setConfirming(true)}
                        disabled={busy}
                    >
                        Quit run
                    </button>
                </div>
            )}
        </section>
    );
}
