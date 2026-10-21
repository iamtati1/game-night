import { useEffect, useState } from "react";
import { withCode } from "../components/CodeText.js";
import { Link, useParams } from "react-router-dom";
import { splitPrompt } from "../games/prompt.js";
import { ApiError, api } from "../api/client.js";
import type { SessionSummary } from "../api/types.js";
import { rungLabel } from "../api/encounter.js";
import { nextStepAfterRound } from "../games/progression.js";
import { RunVerdict } from "../components/RunVerdict.js";
import { TopicStanding } from "../components/TopicStanding.js";
import { useRunContext } from "../games/useRunContext.js";

import { usePageTitle } from "../usePageTitle.js";
import { ACTION } from "../vocabulary.js";
interface RoundCurriculum {
    /** `topic` is the world the concept sits in; null when the path cannot say. */
    concept: { slug: string; name: string; topic?: { slug: string; name: string } | null } | null;
    rungs: { cleared: number; playable: number } | null;
    earned: { conceptSlug: string; conceptName: string; demandSlug: string }[];
}

export function ResultsPage() {
    usePageTitle("Code Blitz results");
    const { id } = useParams<{ id: string }>();
    const [session, setSession] = useState<SessionSummary | null>(null);
    /**
     * What this round changed, as the SERVER sees it.
     *
     * Arrives with the summary rather than being worked out here: which rungs
     * the run produced evidence for, and where the learner now stands on their
     * current concept. A results screen that counted its own correct answers
     * would be a second progress model, and the first thing to disagree with
     * the map.
     */
    const [curriculum, setCurriculum] = useState<RoundCurriculum | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { previousBest, improvement } = useRunContext("code-blitz", id);

    useEffect(() => {
        let active = true;

        api.get<{ session: SessionSummary; curriculum: RoundCurriculum }>(
            `/api/sessions/${id}`
        )
            .then((data) => {
                if (!active) return;

                setSession(data.session);
                setCurriculum(data.curriculum ?? null);
            })
            .catch(
                (err) =>
                    active &&
                    setError(err instanceof ApiError ? err.detailText : "Could not load results")
            );

        return () => {
            active = false;
        };
    }, [id]);

    if (error) {
        return (
            <section className="panel narrow">
                <h1>Results unavailable</h1>
                <p className="form-error" role="alert">
                    {error}
                </p>
                <Link className="button primary" to="/play">
                    {ACTION.backToGames}
                </Link>
            </section>
        );
    }

    if (!session) {
        return <p className="muted center">Tallying up…</p>;
    }

    // A timed-out question is a miss too: no answer given is not the same as
    // right, and it is exactly the kind of thing worth reviewing.
    const misses = session.questions.filter((q) => q.isCorrect !== true);
    const correctCount = session.questions.length - misses.length;

    /**
     * Per-unit tally for this run, strongest first.
     *
     * Computed here rather than asked of the server: it is a count over ten rows
     * the page already holds, and a round trip for it would be a round trip for
     * arithmetic. Questions written before topics existed are skipped rather than
     * bucketed as "unknown", which would read as a tenth unit.
     */
    const practiced = Object.values(
        session.questions.reduce<Record<string, { topic: string; correct: number; total: number }>>(
            (acc, q) => {
                if (!q.topic) return acc;

                const row = (acc[q.topic] ??= { topic: q.topic, correct: 0, total: 0 });

                row.total += 1;
                if (q.isCorrect === true) row.correct += 1;

                return acc;
            },
            {}
        )
    ).sort((a, b) => b.correct / b.total - a.correct / a.total);

    /** The weakest unit of the run, and only when there is something to fix. */
    const weakest = [...practiced]
        .reverse()
        .find((t) => t.correct < t.total) ?? null;

    return (
        <section className="results">
            {/* The score is the headline, at brand scale. This screen is the "see"
                step of the loop, and the number is the only thing the player came
                back for. */}
            <p className="run-eyebrow">Code Blitz</p>
            <p className="run-score">
                <strong>{session.score}</strong>
                <span>points</span>
            </p>

            {/* The reward, where it is earned. XP was accruing invisibly: it
                appeared only in a history row and a landing total, so the moment
                it was actually won showed nothing. */}
            <p className="xp-earned">
                XP <strong>+{session.xpEarned}</strong>
            </p>

            {session.relaxed && (
                <p className="results-pace muted">Relaxed run: no timer, so no speed bonus. XP is the same either way.</p>
            )}

            <RunVerdict
                score={session.score}
                previousBest={previousBest}
                improvement={improvement}
            />

            {/* The decision first: what the round changed and the one next step,
                then -- below -- the figures and every question, for whoever
                wants them. On a phone this used to sit under the whole
                breakdown. */}
            {/*
             * WHAT THE ROUND DID TO THE LEARNING, not just to the score.
             *
             * Until now a run ended in points and XP, and the rungs it had
             * cleared were discoverable only by navigating back to the concept
             * and noticing. Every number here is the server's.
             *
             * It stops short of claiming mastery on purpose: clearing a rung
             * and demonstrating a concept are different things, and nothing on
             * this screen calls /demonstrate.
             */}
            {curriculum?.concept && (
                <div className="round-learning">
                    <p className="round-learning-label">You are learning</p>
                    <h2 className="round-learning-concept">{curriculum.concept.name}</h2>

                    {curriculum.earned.length > 0 ? (
                        <ul className="round-learning-earned">
                            {curriculum.earned.map((rung) => (
                                <li key={`${rung.conceptSlug}:${rung.demandSlug}`}>
                                    <span aria-hidden="true">✓</span>{" "}
                                    <strong>{rungLabel(rung.demandSlug)}</strong>
                                    {rung.conceptSlug !== curriculum.concept!.slug && (
                                        <span className="round-learning-elsewhere">
                                            {" "}
                                            · {rung.conceptName}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        /* The honest branch. A run with no correct answer on a
                           tagged practice question changed nothing, and saying
                           so beats implying otherwise. */
                        <p className="round-learning-none">
                            Nothing cleared this run: the questions that count toward this
                            concept are the ones marked while you play.
                        </p>
                    )}

                    {curriculum.rungs && curriculum.rungs.playable > 0 && (
                        <p className="round-learning-standing">
                            {curriculum.rungs.cleared} of {curriculum.rungs.playable} stops done
                            on this concept
                            {curriculum.rungs.cleared < curriculum.rungs.playable
                                ? ": keep going to demonstrate it."
                                : ": you can demonstrate it now."}
                        </p>
                    )}

                    {/* ONE NEXT ACTION, NAMED FROM STATE.
                        A results screen that ends in a score leaves the learner
                        to work out what to do with it. This says the single
                        next thing and why -- derived in games/progression.ts
                        from the same rung counts above, so it can never offer
                        a demonstration the server would refuse. Nothing here
                        claims an unlock: `rungs.cleared >= playable` is the
                        condition the encounter itself demonstrates on. */}
                    {(() => {
                        const next = nextStepAfterRound(
                            curriculum.concept && curriculum.rungs
                                ? {
                                      slug: curriculum.concept.slug,
                                      name: curriculum.concept.name,
                                      rungs: curriculum.rungs
                                  }
                                : null
                        );

                        return (
                            <p className="round-learning-next">
                                <Link className="button primary" to={next.href}>
                                    {next.label}
                                </Link>
                                <span className="round-learning-because">{next.because}</span>
                            </p>
                        );
                    })()}
                </div>
            )}

            {/* ONE PRIMARY ACTION. With a concept, the primary is the next
                step above, already named from state, and it goes straight back
                to the concept -- where the learner was before the round and
                where the progress they just made lives. A second primary,
                "Continue learning", to the same concept competed with it. With
                no concept, playing again is the primary -- and is offered
                once, not as a primary and a ghost copy of itself. "Pick
                another Jolt" is gone, as on the other games' results: it only
                repeated the nav's Play. */}
            <div className="cta-row">
                <Link
                    className={`button ${curriculum?.concept ? "ghost" : "primary"}`}
                    to="/code-blitz"
                >
                    Play again
                </Link>
            </div>

            {/* Three figures, not seven. Correct-of-total, how fast, how many in a
                row -- the things a player can actually try to move next run.
                Incorrect and timed-out were the same fact stated twice more. */}
            <dl className="run-figures">
                <div>
                    <dt>Correct</dt>
                    <dd>
                        {session.correctCount}/{session.totalQuestions}
                    </dd>
                </div>
                {session.averageResponseMs !== null &&
                    session.averageResponseMs !== undefined && (
                        <div>
                            <dt>Average</dt>
                            <dd>{(session.averageResponseMs / 1000).toFixed(1)}s</dd>
                        </div>
                    )}
                <div>
                    <dt>Best streak</dt>
                    <dd>{session.bestStreak}</dd>
                </div>
            </dl>

            {/* Only what went wrong. Ten full questions buried the score under a
                transcript of things the player already knows they got right; the
                reason to look down here is to find out what beat you. */}
            {misses.length === 0 ? (
                <p className="clean-sweep">Every answer correct.</p>
            ) : (
                <p className="review-head">
                    {misses.length === 1 ? "The one you missed" : `The ${misses.length} you missed`}
                    {correctCount > 0 && (
                        <span className="muted">
                            {" "}
                            · {correctCount} correct not shown
                        </span>
                    )}
                </p>
            )}

            <ol className="breakdown">
                {misses.map((q) => (
                    <li key={q.displayOrder} className="bad">
                        {/* The number, because this is a subset now: without it the
                            player cannot tell which question they are looking at. */}
                        <p className="review-n">Q{q.displayOrder}</p>
                        {/* Same split as the game screen. Without it the review
                            screen rendered "What does this log?" in monospace, so
                            prose looked like code in exactly the place a player
                            goes to understand what they got wrong.
                            
                            Deliberately not applied to Flush: its snippets are all
                            code and use blank lines between statements, so the same
                            rule would promote the first line to prose. */}
                        <p className="review-ask">{splitPrompt(q.prompt).question}</p>
                        {splitPrompt(q.prompt).code && (
                            <pre className="prompt small">{splitPrompt(q.prompt).code}</pre>
                        )}
                        <p className="answer-line">
                            {q.status === "timed_out" ? (
                                <span className="tag timeout">No answer</span>
                            ) : (
                                <span className="tag incorrect">{q.selectedOption}</span>
                            )}
                            {q.correctOption && (
                                <span className="muted"> · answer: {q.correctOption}</span>
                            )}
                            {q.responseTimeMs !== null && (
                                <span className="muted">
                                    {" "}
                                    · {(q.responseTimeMs / 1000).toFixed(1)}s
                                </span>
                            )}
                        </p>
                        {/* The reason, not just the answer. Naming the right
                            option tells a player they were wrong; this is the
                            only thing on the page that tells them why. */}
                        {q.explanation && <p className="review-why">{withCode(q.explanation)}</p>}
                    </li>
                ))}
            </ol>

            {/* The Progress beat of the learning loop. Answers "what did I just
                learn, and what next" in the curriculum's own terms, where the
                tally below answers "how did this run go".

                THE LEARNER'S OWN TOPIC, OR NONE. This was fixed to variables,
                so every learner was shown "Your variables journey" whatever
                they were working on. The server now names the topic of the
                concept they are on; without one there is nothing true to show,
                so nothing is shown. */}
            {/* SUBORDINATE TO THE NEXT STEP (readability pass). The topic map
                and the per-topic tally are useful, but on screen they competed
                with the one action at the top and with the missed-question
                review above. They sit behind one disclosure now. */}
            {(curriculum?.concept?.topic || practiced.length > 0) && (
            <details className="results-details">
                <summary>Details: your topic and this run by topic</summary>

            {curriculum?.concept?.topic && <TopicStanding topic={curriculum.concept.topic.slug} />}

            {/* What was practiced, and what to do about it. A run that ends with a
                score is a game; a run that ends naming the weakest unit is a
                lesson. The recommendation is deliberately one line -- the moment
                it becomes a panel of numbers it is a dashboard. */}
            {practiced.length > 0 && (
                <div className="practiced">
                    <p className="review-head">Practiced</p>
                    <ul className="topic-tally">
                        {practiced.map((t) => (
                            <li key={t.topic} className={t.correct === t.total ? "all" : ""}>
                                <span className="topic-name">{t.topic}</span>
                                <span className="topic-score">
                                    {t.correct}/{t.total}
                                </span>
                            </li>
                        ))}
                    </ul>
                    {/* A fact, not a second "Next": the next step is the one
                        action at the top of the page. */}
                    {weakest && (
                        <p className="next-up">
                            Weakest this run: <strong>{weakest.topic}</strong>, {weakest.correct} of{" "}
                            {weakest.total}.
                        </p>
                    )}
                </div>
            )}
            </details>
            )}

        </section>
    );
}
