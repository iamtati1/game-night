import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import type { HistoryResponse, HistorySession } from "../api/types.js";

const PAGE_SIZE = 10;

function formatWhen(session: HistorySession): string {
    const when = new Date(session.endedAt ?? session.startedAt);

    return when.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
    });
}

/** Completed games open their results; an unfinished game resumes instead,
 *  because a results page would show a score of 0 and a list of pending rounds.
 *
 *  Each game has its own results view: /api/sessions/:id is Code Blitz's endpoint
 *  and does not understand flush_rounds, so a Flush session sent there would
 *  render as a Code Blitz game with zero questions. */
function targetFor(session: HistorySession): string {
    const flush = session.game.slug === "flush";

    if (session.status === "in_progress") {
        return flush ? "/flush" : "/play";
    }

    return flush ? `/flush/results/${session.id}` : `/results/${session.id}`;
}

function StatusTag({ status }: { status: HistorySession["status"] }) {
    if (status === "completed") {
        return <span className="tag correct">Completed</span>;
    }

    if (status === "abandoned") {
        return <span className="tag timeout">Abandoned</span>;
    }

    return <span className="tag in-progress">In progress · Resume</span>;
}

export function HistoryPage() {
    const [params, setParams] = useSearchParams();
    const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0);

    const [data, setData] = useState<HistoryResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        setData(null);
        setError(null);

        api.get<HistoryResponse>(`/api/users/me/sessions?limit=${PAGE_SIZE}&offset=${offset}`)
            .then((response) => active && setData(response))
            .catch(
                (err) =>
                    active &&
                    setError(err instanceof ApiError ? err.detailText : "Could not load your history")
            );

        return () => {
            active = false;
        };
    }, [offset]);

    if (error) {
        return (
            <section className="panel narrow">
                <h1>History unavailable</h1>
                <p className="form-error" role="alert">
                    {error}
                </p>
                <Link className="button primary" to="/">
                    Back home
                </Link>
            </section>
        );
    }

    if (!data) {
        return <p className="muted center">Loading your games…</p>;
    }

    const { sessions, pagination } = data;

    // A player who has never played and a player who paginated past the end are
    // different problems, so they get different copy.
    if (sessions.length === 0 && pagination.total === 0) {
        return (
            <section className="panel narrow center">
                <h1>No runs yet</h1>
                <p className="muted">
                    Your first Jolt is waiting. Most runs take a couple of minutes.
                </p>
                <Link className="button primary" to="/#games">
                    Pick a game
                </Link>
            </section>
        );
    }

    if (sessions.length === 0) {
        return (
            <section className="panel narrow center">
                <h1>Nothing on this page</h1>
                <p className="muted">You have {pagination.total} runs in total.</p>
                <button className="button primary" onClick={() => setParams({})}>
                    Back to the first page
                </button>
            </section>
        );
    }

    return (
        <section className="runs">
            <p className="run-eyebrow">Your runs</p>
            <h1 className="history-title">
                {pagination.total} {pagination.total === 1 ? "run" : "runs"}
            </h1>

            <ol className="breakdown history">
                {sessions.map((session) => (
                    <li key={session.id}>
                        {/* The row carries the game's own accent, so a page of runs
                            is scannable by colour before it is read. */}
                        <Link
                            className={`history-row game-${session.game.slug}`}
                            to={targetFor(session)}
                        >
                            <div className="history-main">
                                <span className={`game-chip game-${session.game.slug}`}>
                                    {session.game.name}
                                </span>
                                <StatusTag status={session.status} />
                                <span className="muted">{formatWhen(session)}</span>
                            </div>

                            <div className="history-stats">
                                <span>
                                    <strong>
                                        {session.status === "completed" ? session.score : "—"}
                                    </strong>{" "}
                                    pts
                                </span>
                                <span className="muted">
                                    {session.status === "completed" ? `${session.xpEarned} XP` : "— XP"}
                                </span>
                                <span className="muted">
                                    {session.progress.correct}/{session.progress.total} correct
                                    {session.progress.timedOut > 0 &&
                                        ` · ${session.progress.timedOut} timed out`}
                                </span>
                            </div>
                        </Link>
                    </li>
                ))}
            </ol>

            {(offset > 0 || pagination.hasMore) && (
                <div className="cta-row">
                    <button
                        className="button ghost"
                        disabled={offset === 0}
                        onClick={() => setParams({ offset: String(Math.max(0, offset - PAGE_SIZE)) })}
                    >
                        Newer
                    </button>
                    <span className="muted">
                        {offset + 1}–{offset + sessions.length} of {pagination.total}
                    </span>
                    <button
                        className="button ghost"
                        disabled={!pagination.hasMore}
                        onClick={() => setParams({ offset: String(offset + PAGE_SIZE) })}
                    >
                        Older
                    </button>
                </div>
            )}
        </section>
    );
}
