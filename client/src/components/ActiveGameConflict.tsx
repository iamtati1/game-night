import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import type { AbandonResponse } from "../api/types.js";

interface ActiveGameConflictProps {
    /** The game currently holding the active-session slot. */
    activeGame: { slug: string; name: string };
    /** The game the player was trying to start. */
    wantedGame: string;
    /** Called once the slot is free, so the caller can retry its start. */
    onAbandoned: () => void;
}

const PLAY_PATH: Record<string, string> = {
    "code-blitz": "/play",
    flush: "/flush"
};

/**
 * Shown when a player tries to start one game while another is in progress.
 *
 * A user may hold only one in-progress session at a time, so this is a real fork
 * rather than an error: go back to the game they left, or end it and play the new
 * one. Deliberately not automatic -- silently abandoning a game somebody is nine
 * questions into would be worse than asking.
 */
export function ActiveGameConflict({
    activeGame,
    wantedGame,
    onAbandoned
}: ActiveGameConflictProps) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Addressed by game slug rather than "whatever is active": a panel left open
    // in a stale tab must not be able to quit a game the player has started since.
    async function abandon() {
        setBusy(true);
        setError(null);

        try {
            await api.post<AbandonResponse>(`/api/me/sessions/${activeGame.slug}/abandon`);
            onAbandoned();
        } catch (err) {
            setBusy(false);
            setError(err instanceof ApiError ? err.detailText : "Could not end that game");
        }
    }

    return (
        <section className="panel narrow center">
            <p className="eyebrow">One game at a time</p>
            <h1>{activeGame.name} is still going</h1>
            <p className="muted">
                You can only have one game running. Pick up where you left off, or end it and
                start {wantedGame}.
            </p>

            {error && (
                <p className="form-error" role="alert">
                    {error}
                </p>
            )}

            <div className="cta-row center-row">
                <Link className="button primary" to={PLAY_PATH[activeGame.slug] ?? "/"}>
                    Resume {activeGame.name}
                </Link>
                <button className="button ghost" onClick={() => void abandon()} disabled={busy}>
                    {busy ? "Ending…" : `End it, play ${wantedGame}`}
                </button>
            </div>
        </section>
    );
}
