import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import type { BugHuntSessionSummary } from "../api/types.js";
import { RunVerdict } from "../components/RunVerdict.js";
import { BUG_HUNT } from "../games/catalog.js";
import { debriefLine } from "../games/bugHuntVoice.js";
import { useRunContext } from "../games/useRunContext.js";

/** Bug categories as a player would say them, not as the column stores them. */
const CATEGORY_LABELS: Record<string, string> = {
    "array-access": "Array access",
    async: "Async and await",
    scope: "Scope and closures",
    mutation: "Mutation and references",
    comparison: "Comparisons",
    "return-value": "Return values",
    "off-by-one": "Loop boundaries",
    "type-coercion": "Type coercion"
};

const label = (category: string) => CATEGORY_LABELS[category] ?? category;

/**
 * What the run says about the player, derived only from what they actually met.
 *
 * Strict rules, because the alternative is flattery. A category is only claimed
 * as strong if every incident in it was resolved, and only flagged for practice
 * if none were -- a mixed category says nothing reliable from one run, so it
 * says nothing. With a five-incident sample, anything looser would be inventing
 * a personality from noise.
 */
function readPerformance(byCategory: BugHuntSessionSummary["byCategory"]) {
    const strong = byCategory.filter((c) => c.seen > 0 && c.resolved === c.seen);
    const weak = byCategory.filter((c) => c.seen > 0 && c.resolved === 0);

    return {
        strong: strong.map((c) => label(c.category)),
        weak: weak.map((c) => label(c.category))
    };
}

/**
 * The quickest stabilisation of the run.
 *
 * Derived from the per-incident times the report already carries rather than
 * asked of the server -- a fastest-fix column would be one more number that can
 * disagree with the rows underneath it.
 */
function fastestFix(incidents: BugHuntSessionSummary["incidents"]): number | null {
    const times = incidents
        .filter((i) => i.status === "resolved" && i.resolutionMs !== null)
        .map((i) => i.resolutionMs!);

    return times.length === 0 ? null : Math.min(...times);
}

function seconds(ms: number | null): string {
    if (ms === null) return "—";

    return `${(ms / 1000).toFixed(1)}s`;
}

export function BugHuntResultsPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [session, setSession] = useState<BugHuntSessionSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [starting, setStarting] = useState(false);
    const { previousBest, improvement } = useRunContext(BUG_HUNT, id);

    useEffect(() => {
        let active = true;

        api.get<{ session: BugHuntSessionSummary }>(`/api/bug-hunt/sessions/${id}`)
            .then((data) => active && setSession(data.session))
            .catch(
                (err) =>
                    active &&
                    setError(err instanceof ApiError ? err.detailText : "Could not load the report")
            );

        return () => {
            active = false;
        };
    }, [id]);

    async function huntAgain() {
        setStarting(true);

        try {
            // A fresh run, dealt by the server. Which incidents come up is the
            // server's decision -- it deprioritises the ones from recent runs --
            // so there is deliberately nothing to randomise here.
            await api.post("/api/bug-hunt/sessions", { fresh: true });
            navigate("/bug-hunt", { replace: true });
        } catch {
            setStarting(false);
            navigate("/bug-hunt");
        }
    }

    if (error) {
        return (
            <section className="panel narrow">
                <h1>Report unavailable</h1>
                <p className="form-error" role="alert">
                    {error}
                </p>
                <Link className="button primary" to="/">
                    Back to Jolt
                </Link>
            </section>
        );
    }

    if (!session) {
        return <p className="muted center">Compiling incident report…</p>;
    }

    const { strong, weak } = readPerformance(session.byCategory);
    const allClear = session.incidentsResolved === session.totalIncidents;

    return (
        <section className="bh-results">
            <header className="bh-results-head">
                <p className={`bh-results-state ${allClear ? "restored" : "degraded"}`}>
                    <span aria-hidden="true">{allClear ? "✓" : "⚠"}</span>{" "}
                    {allClear ? "System restored" : "System stabilized"}
                </p>

                <p className="bh-results-line">
                    {allClear
                        ? "Every incident resolved. Production survived the shift."
                        : `${session.incidentsResolved} of ${session.totalIncidents} incidents resolved. The rest are in the log below.`}
                </p>

                <p className="bh-results-score">{session.score}</p>
                <RunVerdict
                    score={session.score}
                    previousBest={previousBest}
                    improvement={improvement}
                />
            </header>

            <dl className="bh-results-stats">
                <div>
                    <dt>Resolved</dt>
                    <dd>
                        {session.incidentsResolved}
                        <span className="of">/ {session.totalIncidents}</span>
                    </dd>
                </div>
                <div>
                    <dt>First-try fixes</dt>
                    <dd>{session.firstTryFixes}</dd>
                </div>
                <div>
                    <dt>Best streak</dt>
                    <dd>{session.bestStreak}</dd>
                </div>
                <div>
                    <dt>Traces pulled</dt>
                    <dd>{session.hintsUsed}</dd>
                </div>
                <div>
                    <dt>Fastest fix</dt>
                    <dd>{seconds(fastestFix(session.incidents))}</dd>
                </div>
                <div>
                    <dt>Avg. time to fix</dt>
                    <dd>{seconds(session.averageResolutionMs)}</dd>
                </div>
                <div>
                    <dt>Final integrity</dt>
                    <dd>{session.systemIntegrity}%</dd>
                </div>
                <div>
                    <dt>XP earned</dt>
                    <dd>+{session.xpEarned}</dd>
                </div>
            </dl>

            {(strong.length > 0 || weak.length > 0) && (
                <div className="bh-readout">
                    {strong.length > 0 && (
                        <p className="bh-readout-line strong">
                            <span className="bh-readout-tag">Strong today</span>
                            {strong.join(" · ")}
                        </p>
                    )}
                    {weak.length > 0 && (
                        <p className="bh-readout-line weak">
                            <span className="bh-readout-tag">Keep practicing</span>
                            {weak.join(" · ")}
                        </p>
                    )}
                </div>
            )}

            <ol className="bh-log">
                {session.incidents.map((entry) => (
                    <li key={entry.incidentNumber} className={`bh-log-row ${entry.status}`}>
                        <div className="bh-log-head">
                            <span className="bh-log-no" aria-hidden="true">
                                {String(entry.incidentNumber).padStart(2, "0")}
                            </span>
                            <span className="bh-log-title">
                                {entry.title}
                                {entry.isBoss && <span className="bh-log-boss">Critical</span>}
                            </span>
                            <span className={`bh-log-status ${entry.status}`}>
                                <span aria-hidden="true">
                                    {entry.status === "resolved" ? "✓" : "✕"}
                                </span>{" "}
                                {entry.status === "resolved" ? "Resolved" : "Lost"}
                            </span>
                            <span className="bh-log-points">
                                {entry.pointsAwarded > 0 ? `+${entry.pointsAwarded}` : "—"}
                            </span>
                        </div>

                        <p className="bh-log-meta">
                            {label(entry.bugCategory)}
                            {entry.hintsUsed > 0 &&
                                ` · ${entry.hintsUsed} trace${entry.hintsUsed === 1 ? "" : "s"}`}
                            {entry.resolutionMs !== null && ` · ${seconds(entry.resolutionMs)}`}
                        </p>

                        {/* The answer, on every incident -- including the ones that
                            were resolved first try. Finding out what it was is the
                            part that makes the next run better. */}
                        {entry.correctOption && (
                            <p className="bh-log-answer">
                                <code>{entry.correctOption}</code>
                            </p>
                        )}
                        {entry.explanation && (
                            <p className="bh-log-why">{entry.explanation}</p>
                        )}
                    </li>
                ))}
            </ol>

            <div className="bh-results-actions">
                <button className="button primary big" disabled={starting} onClick={() => void huntAgain()}>
                    {starting ? "Dispatching…" : "Hunt again"}
                </button>
                <Link className="button ghost" to="/">
                    Back to Jolt
                </Link>
            </div>

            {/* The system's last word. Honest about how it went -- a flattering
                line after a bad run reads as the game not paying attention. */}
            <p className="bh-signoff">
                <span className="bh-voice-tag">System</span>
                {debriefLine(session.incidentsResolved, session.totalIncidents)}
            </p>

            <p className="bh-replay-note muted">
                A new hunt pulls different incidents — the ones you just saw go to the back of the
                queue.
            </p>
        </section>
    );
}
