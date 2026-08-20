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
 *  because /results/:id would show a score of 0 and a list of pending questions. */
function targetFor(session: HistorySession): string {
    return session.status === "in_progress" ? "/play" : `/results/${session.id}`;
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
                <h1>No games yet</h1>
                <p className="muted">
                    Code Blitz is ten questions, thirty seconds each. About five minutes.
                </p>
                <Link className="button primary" to="/play">
                    Play Code Blitz
                </Link>
            </section>
        );
    }

    if (sessions.length === 0) {
        return (
            <section className="panel narrow center">
                <h1>Nothing on this page</h1>
                <p className="muted">You have {pagination.total} games in total.</p>
                <button className="button primary" onClick={() => setParams({})}>
                    Back to the first page
                </button>
            </section>
        );
    }

    return (
        <section>
            <p className="eyebrow">Game history</p>
            <h1>{pagination.total} games</h1>

            <ol className="breakdown history">
                {sessions.map((session) => (
                    <li key={session.id}>
                        <Link className="history-row" to={targetFor(session)}>
                            <div className="history-main">
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
                                    {session.correctCount}/{session.totalQuestions} correct
                                    {session.timedOutCount > 0 && ` · ${session.timedOutCount} timed out`}
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
