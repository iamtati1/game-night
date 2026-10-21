import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { play } from "../games/sound.js";
import { ACTION, STATE } from "../vocabulary.js";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import { rungLabel, type Encounter, type Exercise, type Judgement } from "../api/encounter.js";
import { ConceptTeaching } from "../components/ConceptTeaching.js";
import { withCode } from "../components/CodeText.js";
import { ConceptRun } from "../components/ConceptRun.js";
import { RemediationStep } from "../components/RemediationStep.js";
import { ConceptComplete } from "../components/ConceptComplete.js";
import { MissionScene } from "../components/MissionScene.js";
import { lessonFor } from "../games/lessons.js";
import { movementMissionFor } from "../games/movements.js";
import { remediationFor } from "../games/remediation.js";
import { HighlightedCode } from "../components/HighlightedCode.js";

import { usePageTitle } from "../usePageTitle.js";
/**
 * One concept, end to end: learn it, try it, write it, finish it.
 *
 * THE PROBLEM THIS SOLVES. Jolt could already teach a concept and could already
 * ask questions about a topic, but not in the same place -- a learner read about
 * variables in the world and then answered whatever the bank happened to deal
 * from `topic = 'variables'`. This screen is one concept from beginning to end,
 * and every activity on it is at that concept and the rung the learner is on.
 *
 * THE CURRICULUM DECIDES EVERYTHING. Which rungs exist, what can be played at
 * each, which are already cleared, which one is next, and what follows -- all of
 * it comes from /api/curriculum/concepts/:concept/encounter. This file chooses
 * markup. It does not choose content, order, difficulty or progression, and the
 * one thing it looks up locally is the authored teaching for the concept the
 * server named.
 *
 * NO NEW CONTENT SYSTEM. Teaching is `lessons.ts`, already written. Writing code
 * is a `missions.ts` movement run through `littleJs`, already written, rendered
 * by `MissionScene`, already built. Questions are curriculum questions from the
 * database, judged by the server. Nothing here is a second copy of any of them.
 *
 * THE RUNG VOCABULARY NEVER REACHES THE LEARNER. `predict` and `produce` are how
 * the curriculum talks to itself; the learner sees "Work out what happens" and
 * "Write it". Nobody should have to learn Jolt's internal model to learn
 * JavaScript.
 */
/** No response at all (status 0, or not an ApiError), or the server or a
    gateway failing (5xx): not the server deciding anything, so trying again is
    the honest offer. A 4xx is an answer, and retrying it changes nothing. */
const transient = (err: unknown) =>
    !(err instanceof ApiError) || err.status === 0 || err.status >= 500;

export function EncounterPage() {
    usePageTitle("Lesson");
    const { concept } = useParams<{ concept: string }>();

    const [encounter, setEncounter] = useState<Encounter | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    /** Reading the teaching, before anything is asked. */
    const [phase, setPhase] = useState<"learn" | "work">("learn");
    /** Missed something anywhere in this concept. One fact, reported once. */
    const [neededRetry, setNeededRetry] = useState(false);
    const [done, setDone] = useState(false);
    /**
     * The server's refusal, kept so the page can say what is actually left.
     *
     * Null means "nothing has been refused", not "everything is fine" -- the
     * only thing that means the concept is finished is `done`, and the only
     * thing that sets `done` is a 200 from /demonstrate.
     */
    const [refused, setRefused] = useState<{
        message: string;
        outstanding: string[];
        unplayable: boolean;
        /** The request failed rather than being refused: recording can be retried. */
        retry: boolean;
    } | null>(null);
    /**
     * A stop was cleared and saved, but what comes next could not be loaded.
     *
     * This used to be read as "nothing comes next": a failed refresh went
     * straight on to completing the concept, which the server then refused,
     * and the learner was told their stops were not done.
     */
    const [stepError, setStepError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const data = await api.get<Encounter>(
                `/api/curriculum/concepts/${concept}/encounter`
            );

            setEncounter(data);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Could not load that concept.");
        }
    }, [concept]);

    useEffect(() => {
        void load();
    }, [load]);

    const teaching = useMemo(() => lessonFor(concept ?? null), [concept]);

    /** The rung in front of the learner, named by the server. */
    const rung = useMemo(
        () => encounter?.rungs.find((r) => r.demandSlug === encounter.currentRung) ?? null,
        [encounter]
    );

    /**
     * Finishing the last playable rung completes the concept.
     *
     * Recorded through the existing endpoint, with the existing meaning: one row
     * per concept, `demand_id` annotating the deepest rung this visit reached.
     * Per-rung progress was already recorded as each rung was cleared; this is
     * the concept-level fact the world reads.
     *
     * THE SERVER DECIDES, AND A REFUSAL IS NOT A COMPLETION. This used to set
     * `done` in the catch as well as the try, on the reasoning that a recorded
     * rung with an unrecorded concept is recoverable. It is -- but the learner
     * was shown the full arrival either way, which meant a 409 read as "you
     * finished this" while the concept stayed `current`, its topic stayed
     * incomplete, and the next module stayed shut. Nothing downstream could
     * correct that, because nothing downstream knew it had happened.
     */
    const finish = useCallback(
        async (struggled: boolean) => {
            // Claimed here, whoever calls: a cleared last stop calls this AND
            // makes the concept `owed`, and without this the owed effect below
            // recorded the same concept a second time.
            claimed.current = true;
            setBusy(true);

            try {
                await api.post(`/api/curriculum/concepts/${concept}/demonstrate`, {
                    neededRetry: struggled,
                    demand: rung?.demandSlug ?? null
                });
                setRefused(null);
                setDone(true);
            } catch (err) {
                const body = err instanceof ApiError ? (err.body as Record<string, unknown>) : null;
                const retry = transient(err);

                setRefused({
                    // A failed request is not a refusal, and says so. Every stop
                    // was already saved as it was cleared -- this is only the
                    // concept-level record that failed.
                    message: retry
                        ? "Every stop here is saved, but finishing this concept could not be recorded just now."
                        : err instanceof ApiError
                          ? err.message
                          : "That could not be recorded just now.",
                    outstanding: Array.isArray(body?.outstanding)
                        ? (body.outstanding as string[])
                        : [],
                    unplayable: body?.unplayable === true,
                    retry
                });

                // Back to the server's version of where the learner stands,
                // rather than leaving a stale ladder on the screen.
                await load();
            } finally {
                setBusy(false);
            }
        },
        [concept, load, rung]
    );

    /** Called when a rung is cleared. Reloads, then advances or finishes. */
    const rungCleared = useCallback(
        async (struggled: boolean) => {
            const nowStruggled = neededRetry || struggled;

            setNeededRetry(nowStruggled);

            const refreshed = await api
                .get<Encounter>(`/api/curriculum/concepts/${concept}/encounter`)
                .catch(() => null);

            // Not knowing what is next is not the same as nothing being next.
            if (!refreshed) {
                setStepError("Your answer is saved, but the next step could not be loaded just now.");
                return;
            }

            setStepError(null);
            setEncounter(refreshed);

            if (refreshed.currentRung === null) {
                await finish(nowStruggled);
            }
        },
        [concept, finish, neededRetry]
    );

    /*
     * THE DEAD END, AND WHY IT WAS THE BUG.
     *
     * `currentRung` is null in two different situations: the ladder is behind
     * the learner, or what is left of it is holes. In BOTH the server would
     * accept the demonstration -- `evidenceFor` only ever counts rungs that
     * something can play. This screen recorded neither. It printed "You have
     * done everything here." and a link back to the world, and the concept
     * stayed undemonstrated for good.
     *
     * That is reachable without doing anything unusual. The rungs are cleared
     * by evidence, and evidence comes from Code Blitz and Bug Hunt as well as
     * from here -- so a learner who clears a concept's stops while playing,
     * or who simply reloads after clearing the last one, arrives at a concept
     * that is finished and cannot be finished. Their topic never completes and
     * the next module never opens, which is exactly what it looked like: being
     * told you had done everything while nothing unlocked.
     *
     * CLAIMED ONCE, AND NOT BEFORE THE TEACHING. The ref makes this a single
     * attempt rather than a loop, and waiting for `work` keeps the lesson
     * first for a learner who came back to re-read it. Only a 200 sets `done`
     * -- see `finish` -- so a refusal shows the refusal, not a celebration.
     */
    const owed =
        encounter !== null &&
        encounter.reachable &&
        encounter.currentRung === null &&
        !encounter.demonstrated;
    const claimed = useRef(false);

    /*
     * A NEW CONCEPT IS A NEW SCREEN, even though it is the same component.
     * The route has no key, so walking from one concept to the next reuses
     * this instance and every one of these would otherwise carry over --
     * `done` would show the previous arrival over the new concept, and
     * `claimed` would stop the next finished ladder being recorded at all.
     */
    useEffect(() => {
        claimed.current = false;
        setEncounter(null);
        setDone(false);
        setRefused(null);
        setStepError(null);
        setNeededRetry(false);
        setPhase("learn");
    }, [concept]);

    /* A concept with no authored teaching has no learn phase to wait for. */
    const pastTeaching = phase === "work" || !teaching;

    useEffect(() => {
        if (!owed || claimed.current || done || !pastTeaching) return;

        claimed.current = true;
        void finish(neededRetry);
    }, [owed, done, pastTeaching, finish, neededRetry]);

    if (error) {
        return (
            <section className="panel narrow">
                <p className="form-error" role="alert">{error}</p>
                <Link className="button primary" to="/journey">{ACTION.seeJourney}</Link>
            </section>
        );
    }

    if (!encounter) {
        return <section className="panel narrow"><p className="muted">Loading…</p></section>;
    }

    if (done) {
        return (
            /*
             * ConceptComplete owns the arrival, including what comes next --
             * the topic checkpoint when one is due, otherwise the next concept.
             * The encounter used to add its own "Next" underneath, which put two
             * different next steps on one screen and left the learner to pick.
             */
            <ConceptComplete concept={encounter.conceptSlug} />
        );
    }

    /* A LOCKED CONCEPT EXPLAINS ITSELF. The endpoint answers 200 with the reason
       precisely so this screen can say which concept is in the way, and link to
       it, rather than showing a disabled thing with no explanation. */
    if (!encounter.reachable) {
        const blocker = encounter.blockedBy;

        /* THE SERVER NAMES THE BLOCKER, so this screen does not work it out.
           Concepts open one at a time, in order, so the thing in the way is
           often not one of this concept's own prerequisites at all -- and
           then the list below was empty and the screen said nothing. */
        if (blocker) {
            const to = blocker.kind === "checkpoint" ? `/challenge/${blocker.slug}` : `/concept/${blocker.slug}`;

            return (
                <section className="panel narrow">
                    <p className="lesson-eyebrow">{encounter.topicSlug.replace(/-/g, " ")}</p>
                    <h1 className="lesson-title">{encounter.name}</h1>
                    <p className="lesson-why">
                        {blocker.kind === "checkpoint"
                            ? `Not open yet: the ${blocker.name} checkpoint comes first.`
                            : `Not open yet: ${blocker.name} comes first. Concepts open one at a time, in order.`}
                    </p>

                    <Link className="button primary" to={to}>
                        {blocker.kind === "checkpoint"
                            ? `Take the ${blocker.name} checkpoint`
                            : `Go to ${blocker.name}`}
                    </Link>

                    <p className="lesson-aside-link">
                        or <Link to="/journey">see your journey</Link>
                    </p>
                </section>
            );
        }

        /* No named blocker. Never invent one: say plainly that earlier steps
           come first, and go back to the journey, which always knows. */
        if (encounter.unmetPrerequisites.length === 0) {
            return (
                <section className="panel narrow">
                    <p className="lesson-eyebrow">{encounter.topicSlug.replace(/-/g, " ")}</p>
                    <h1 className="lesson-title">{encounter.name}</h1>
                    <p className="lesson-why">
                        Not open yet: the steps before it on your journey come first.
                    </p>

                    <Link className="button primary" to="/journey">
                        {ACTION.seeJourney}
                    </Link>
                </section>
            );
        }

        return (
            <section className="panel narrow">
                <p className="lesson-eyebrow">{encounter.topicSlug.replace(/-/g, " ")}</p>
                <h1 className="lesson-title">{encounter.name}</h1>
                <p className="lesson-why">Not yet: this one builds on something else.</p>

                <ul className="encounter-locked">
                    {encounter.unmetPrerequisites.map((slug) => (
                        <li key={slug}>
                            <Link to={`/concept/${slug}`}>{slug.replace(/-/g, " ")}</Link>
                            {" comes first."}
                        </li>
                    ))}
                </ul>

                <Link className="button primary" to={`/world/${encounter.topicSlug}`}>
                    Back to {encounter.topicSlug.replace(/-/g, " ")}
                </Link>
            </section>
        );
    }

    const header = (
        <>
            {/* YOU ARE HERE, in the learner's words, on every screen of the
                encounter -- not only the first. */}
            <p className="lesson-eyebrow">
                {encounter.topicSlug.replace(/-/g, " ")} · {STATE.here}
            </p>
            <h1 className="lesson-title">{encounter.name}</h1>

            {/* The route, on the teaching screen as well as the working ones:
                a learner about to start should be able to see what the concept
                is going to ask of them before they agree to begin. */}
            <ConceptRun rungs={encounter.rungs} />
        </>
    );

    if (phase === "learn" && teaching) {
        return (
            <section className="lesson">
                {header}
                <p className="lesson-why">{teaching.why}</p>

                <ConceptTeaching teach={teaching.teach} notice={teaching.notice} />

                {/* The label tells the truth about what the button does. A
                    learner whose stops are all behind them is not about to try
                    one; they are about to have the concept recorded. */}
                <button className="button primary big" onClick={() => setPhase("work")}>
                    {owed ? "Got it. Finish this concept" : "Got it. Try one"}
                </button>

                {/*
                    The one place a module points at the playground, and it is
                    an offer rather than a step: a learner who wants to poke at
                    the example before being asked anything can, and the rung
                    is waiting either way. Not per concept -- the playground is
                    a tool, not an exercise.
                */}
                <p className="lesson-aside-link">
                    or <Link to="/experiment">try it yourself first</Link>: nothing is
                    marked there.
                </p>
            </section>
        );
    }

    /* EVERY RUNG IS DECLARED, PLAYABLE OR NOT. A concept whose ladder has a hole
       says so, here, rather than quietly being shorter than the curriculum says
       it is. */
    if (!rung) {
        const ladder = (
            <ul className="encounter-rungs">
                {encounter.rungs.map((r) => (
                    <li
                        key={r.demandSlug}
                        data-state={r.cleared ? "cleared" : r.options.length ? "open" : "unbuilt"}
                    >
                        {rungLabel(r.demandSlug)}
                        {r.cleared ? " ✓" : r.options.length === 0 ? ", not built yet" : ""}
                    </li>
                ))}
            </ul>
        );

        /* Being recorded. Said out loud rather than shown as a still screen
           that happens to be about to change. */
        if (busy) {
            return (
                <section className="lesson">
                    {header}
                    <p className="lesson-why" role="status">
                        Finishing this concept…
                    </p>
                    {ladder}
                </section>
            );
        }

        /* THE SERVER SAID NO, SO THIS SCREEN SAYS NO. Named outstanding stops
           rather than a shrug, because the learner can act on a name. */
        if (refused) {
            return (
                <section className="lesson">
                    {header}
                    <p className="lesson-why" role="alert">
                        {refused.unplayable
                            ? "There is nothing to practise here yet, so this concept cannot be finished."
                            : refused.message}
                    </p>

                    {refused.outstanding.length > 0 && (
                        <p className="encounter-outstanding">
                            Still to do:{" "}
                            {refused.outstanding.map((slug) => rungLabel(slug)).join(", ")}
                        </p>
                    )}

                    {ladder}

                    {refused.retry ? (
                        <>
                            <button
                                className="button primary"
                                onClick={() => void finish(neededRetry)}
                            >
                                Try again
                            </button>
                            <p className="lesson-aside-link">
                                or{" "}
                                <Link to={`/world/${encounter.topicSlug}`}>
                                    back to {encounter.topicSlug.replace(/-/g, " ")}
                                </Link>
                            </p>
                        </>
                    ) : (
                        <Link className="button primary" to={`/world/${encounter.topicSlug}`}>
                            Back to {encounter.topicSlug.replace(/-/g, " ")}
                        </Link>
                    )}
                </section>
            );
        }

        /* Already recorded, on a revisit. The arrival is not replayed -- that
           belongs to the moment it happened -- but the learner is pointed at
           the next thing rather than only backwards. */
        return (
            <section className="lesson">
                {header}
                <p className="lesson-why">
                    {encounter.demonstrated
                        ? "You have done everything here."
                        : "There is nothing to practise here yet."}
                </p>

                {ladder}

                {encounter.demonstrated && encounter.next ? (
                    <Link className="button primary big" to={`/concept/${encounter.next.slug}`}>
                        Next: {encounter.next.name}
                    </Link>
                ) : (
                    <Link className="button primary" to={`/world/${encounter.topicSlug}`}>
                        Back to {encounter.topicSlug.replace(/-/g, " ")}
                    </Link>
                )}

                {encounter.demonstrated && encounter.next && (
                    <p className="lesson-aside-link">
                        or <Link to={`/world/${encounter.topicSlug}`}>back to the module</Link>
                    </p>
                )}
            </section>
        );
    }

    const option = rung.options[0]!;

    return (
        <section className="lesson">
            {header}

            {stepError && (
                <div className="encounter-step-error" role="alert">
                    <p className="form-error">{stepError}</p>
                    <button
                        className="button ghost"
                        disabled={busy}
                        onClick={() => void rungCleared(neededRetry)}
                    >
                        Try again
                    </button>
                </div>
            )}

            {/* WHAT THE LEARNER IS DOING, AND WHY, in their vocabulary. */}
            <p className="encounter-rung-label">
                {rungLabel(rung.demandSlug)} · {encounter.objective}
            </p>

            {option.content.kind === "mission" ? (
                <MissionRung
                    concept={encounter.conceptSlug}
                    demand={rung.demandSlug}
                    challengeId={option.challengeId}
                    busy={busy}
                    onCleared={rungCleared}
                />
            ) : (
                /* A question and an incident are the same interaction: read
                   something, choose, find out why. Playtesting the diagnose rung
                   as a separate game handoff was the point at which the concept
                   stopped feeling like one experience -- so it is not one. */
                <ExerciseRung
                    key={option.challengeId}
                    concept={encounter.conceptSlug}
                    demand={rung.demandSlug}
                    challengeId={option.challengeId}
                    busy={busy}
                    onCleared={rungCleared}
                    onRelearn={() => setPhase("learn")}
                />
            )}
        </section>
    );
}

/**
 * An exercise rung: read something, choose, and find out why.
 *
 * Serves BOTH kinds the encounter can deal here. A Code Blitz question asks what
 * the code prints; a Bug Hunt incident gives a bug report and asks which line is
 * at fault. The shape is identical and the learner should not be sent to another
 * screen -- still less another game -- to answer the second one.
 *
 * NOTHING IS JUDGED HERE. The option ids go to the server and the verdict comes
 * back with the reasoning attached -- the same rule the games keep, and the
 * reason the correct answer is not sitting in the page for anyone to read.
 *
 * A WRONG ANSWER IS NOT A FAILURE STATE. It shows the explanation and offers the
 * question again. There is no score to lose and nothing is locked; the only
 * thing a miss leaves behind is `neededRetry`.
 */
function ExerciseRung({
    concept,
    demand,
    challengeId,
    busy,
    onCleared,
    onRelearn
}: {
    concept: string;
    demand: string;
    challengeId: string;
    busy: boolean;
    onCleared: (neededRetry: boolean) => void | Promise<void>;
    /**
     * Back to the explanation, for a learner the repair did not reach.
     *
     * THE THIRD RUNG OF THE REMEDIATION LADDER. The first two were already
     * here -- the wrong option's own feedback names the misconception, and
     * `repair` offers a NEIGHBOURING question rather than the same one again.
     * After that the only offer was "Try again", which sends a learner who has
     * now missed twice round the identical loop a third time.
     *
     * Missing an idea twice is not a signal to try harder. It is a signal that
     * the explanation has not landed, and the thing that helps is the
     * explanation.
     */
    onRelearn: () => void;
}) {
    const [exercise, setExercise] = useState<Exercise | null>(null);
    const [chosen, setChosen] = useState<string | null>(null);
    const [verdict, setVerdict] = useState<Judgement | null>(null);
    const [missed, setMissed] = useState(false);
    const [sending, setSending] = useState(false);
    // How many of a diagnosis's authored hints the learner has asked for. Free
    // here -- the encounter scores nothing -- and revealed one at a time so
    // the first one is a nudge rather than the answer.
    const [hintsShown, setHintsShown] = useState(0);
    /**
     * Showing the authored repair rather than the question.
     *
     * Offered once. A learner who misses the original, repairs the idea, and
     * misses it again is not helped by being sent round the same loop -- at that
     * point the plain retry is the honest offer.
     */
    const [repairing, setRepairing] = useState(false);
    const [repaired, setRepaired] = useState(false);
    const repair = useMemo(() => remediationFor(concept, demand), [concept, demand]);
    /**
     * The question could not be fetched. It used to be swallowed, which left
     * "Loading…" on screen for good. Bumping `attempt` asks again -- a GET, so
     * safe to repeat -- and the `active` flag drops any answer that arrives
     * after a newer request has started.
     */
    const [loadFailed, setLoadFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    /**
     * The answer could not be sent: the option that was chosen, kept so it can
     * be sent again without hunting for it, and whether resending can help.
     * Not a verdict -- nothing is marked until the server judges it.
     */
    const [sendFailed, setSendFailed] = useState<{ optionId: string; message: string; retry: boolean } | null>(null);
    /** Set synchronously, so a double click cannot send two answers. */
    const inFlight = useRef(false);

    useEffect(() => {
        let active = true;

        setLoadFailed(false);

        void api
            .get<Exercise>(`/api/curriculum/challenges/${challengeId}/exercise`)
            .then((data) => {
                if (active) {
                    setExercise(data);
                    setChosen(null);
                    setVerdict(null);
                    setHintsShown(0);
                }
            })
            .catch(() => {
                if (active) setLoadFailed(true);
            });

        return () => {
            active = false;
        };
    }, [challengeId, attempt]);

    const answer = async (optionId: string) => {
        if (verdict || inFlight.current) return;

        inFlight.current = true;
        setSending(true);
        setChosen(optionId);
        setSendFailed(null);

        try {
            const judged = await api.post<Judgement>(
                `/api/curriculum/challenges/${challengeId}/answer`,
                { optionId, neededRetry: missed }
            );

            setVerdict(judged);
            play(judged.correct ? "correct" : "incorrect");
            if (!judged.correct) setMissed(true);
        } catch (err) {
            // NOT A WRONG ANSWER. A wrong answer is a 200 with `correct: false`
            // and its own feedback above; this is the answer never being judged.
            const retry = transient(err);

            setSendFailed({
                optionId,
                retry,
                message: retry
                    ? "Your answer could not be sent, so it has not been marked yet."
                    : err instanceof ApiError
                      ? `Your answer was not accepted: ${err.message}.`
                      : "Your answer was not accepted."
            });
        } finally {
            inFlight.current = false;
            setSending(false);
        }
    };

    if (!exercise) {
        return loadFailed ? (
            <div className="encounter-load-error" role="alert">
                <p className="form-error">
                    This question could not be loaded just now. Nothing is lost: what you have
                    done on this concept is saved.
                </p>
                <button className="button primary" onClick={() => setAttempt((n) => n + 1)}>
                    Try again
                </button>
            </div>
        ) : (
            <p className="muted">Loading…</p>
        );
    }

    const failedChoice = sendFailed
        ? exercise.options.find((o) => o.id === sendFailed.optionId) ?? null
        : null;

    if (repairing && repair) {
        return (
            <RemediationStep
                step={repair}
                onSolved={() => {
                    // BACK TO THE ORIGINAL QUESTION, which is the only thing
                    // that clears the rung. The repair records nothing.
                    setRepairing(false);
                    setRepaired(true);
                    setVerdict(null);
                    setChosen(null);
                }}
            />
        );
    }

    return (
        <>
            {/* WHAT IS WRONG, before the code it is wrong in. */}
            {exercise.brief && <p className="encounter-brief">{exercise.brief}</p>}

            {/* The question as PROSE. It used to be rendered inside the code
                block, where it read as part of the program. */}
            <p className="lesson-ask">{withCode(exercise.ask)}</p>

            {exercise.code && (
                <pre className="lesson-code">
                    <code><HighlightedCode code={exercise.code} /></code>
                </pre>
            )}

            <ul className="lesson-choices">
                {exercise.options.map((o) => (
                    <li key={o.id}>
                        <button
                            className={
                                verdict && o.id === verdict.correctOptionId
                                    ? "lesson-choice is-answer"
                                    : verdict && o.id === chosen
                                      ? "lesson-choice is-wrong"
                                      : "lesson-choice"
                            }
                            disabled={sending || verdict !== null}
                            onClick={() => void answer(o.id)}
                        >
                            {withCode(o.text)}
                        </button>
                    </li>
                ))}
            </ul>

            {/* The answer was never judged. The choice is named, so the
                learner can see it was kept, and can send the same one again. */}
            {sendFailed && !verdict && (
                <div className="encounter-send-error" role="alert">
                    <p className="form-error">
                        {sendFailed.message}
                        {failedChoice && (
                            <>
                                {" "}
                                Your choice: {withCode(failedChoice.text)}
                            </>
                        )}
                    </p>
                    {sendFailed.retry && (
                        <button
                            className="button primary"
                            disabled={sending}
                            onClick={() => void answer(sendFailed.optionId)}
                        >
                            Send it again
                        </button>
                    )}
                </div>
            )}

            {(exercise.hints?.length ?? 0) > 0 && (
                <div className="encounter-hints">
                    {hintsShown > 0 && (
                        <ol className="encounter-hint-list">
                            {exercise.hints!.slice(0, hintsShown).map((hint) => (
                                <li key={hint}>{withCode(hint)}</li>
                            ))}
                        </ol>
                    )}
                    {!verdict && hintsShown < exercise.hints!.length && (
                        <button
                            className="button ghost"
                            onClick={() => {
                                setHintsShown((n) => n + 1);
                                play("hint");
                            }}
                        >
                            {hintsShown === 0 ? "Show a hint" : "Show another hint"} (
                            {exercise.hints!.length - hintsShown} left)
                        </button>
                    )}
                </div>
            )}

            {verdict && (
                <div
                    className={`lesson-feedback ${verdict.correct ? "right" : "wrong"}`}
                    role="status"
                >
                    <p className="lesson-feedback-head">
                        {verdict.correct ? "Yes" : "Not quite"}
                    </p>

                    {/* THE REASONING, right or wrong. A learner who guessed
                        correctly needs it as much as one who missed. */}
                    {verdict.explanation && (
                        <p className="lesson-feedback-body">
                            {withCode(verdict.explanation)}
                        </p>
                    )}

                    {verdict.correct ? (
                        <button
                            className="button primary big"
                            disabled={busy}
                            onClick={() => void onCleared(missed)}
                        >
                            Keep going
                        </button>
                    ) : repair && !repaired ? (
                        /* THE REPAIR, not the same question again. Repetition
                           rewards guessing; a neighbouring problem asks whether
                           the explanation landed. */
                        <button className="button primary big" onClick={() => setRepairing(true)}>
                            Try a simpler one
                        </button>
                    ) : (
                        /*
                         * MISSED, AND THE REPAIR DID NOT REACH THEM EITHER.
                         *
                         * Re-reading the explanation is the PRIMARY offer now,
                         * not the secondary one: a third attempt at an idea
                         * that has not landed is guessing with extra steps.
                         * Trying again stays available -- a learner who knows
                         * they simply misread should not be marched back
                         * through the lesson.
                         */
                        <div className="encounter-stuck">
                            <p className="encounter-stuck-note">
                                Missed it twice: worth another look at the explanation.
                            </p>

                            <button className="button primary big" onClick={onRelearn}>
                                Back to the explanation
                            </button>

                            <button
                                className="button ghost"
                                onClick={() => {
                                    setVerdict(null);
                                    setChosen(null);
                                }}
                            >
                                Try again anyway
                            </button>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

/**
 * A mission rung: write the code, run it, and be judged on what you wrote.
 *
 * Reuses MissionScene exactly as the topic mission does. The only difference is
 * that the Mission handed to it holds the single movement declaring this
 * (concept, demand), which is what makes a topic-closing demonstration usable as
 * one rung of one concept.
 *
 * The completion is recorded against the CHALLENGE, which is what makes the rung
 * read as cleared afterwards -- a movement produces no attempt row of its own,
 * because littleJs runs in the browser.
 */
function MissionRung({
    concept,
    demand,
    challengeId,
    busy,
    onCleared
}: {
    concept: string;
    demand: string;
    challengeId: string;
    busy: boolean;
    onCleared: (neededRetry: boolean) => void | Promise<void>;
}) {
    const mission = useMemo(() => movementMissionFor(concept, demand), [concept, demand]);
    /** The record failed; holds what to resend. */
    const [failed, setFailed] = useState<{ retried: boolean } | null>(null);
    /** Set synchronously, so one finished program is recorded once at a time. */
    const sending = useRef(false);

    if (!mission) {
        return (
            <p className="muted">
                The curriculum expects a writing exercise here, but none is authored yet.
            </p>
        );
    }

    /**
     * Records the finished program, then moves on -- and only then.
     *
     * The failure used to be swallowed and the rung treated as cleared, so the
     * learner was moved on to a ladder that still had this stop open and landed
     * back on it with no explanation. Now a failed record says so and can be
     * sent again; the written program stays on screen.
     */
    const record = async (retried: boolean) => {
        if (sending.current) return;

        sending.current = true;
        setFailed(null);

        try {
            await api.post(`/api/curriculum/challenges/${challengeId}/completion`, {
                neededRetry: retried
            });
        } catch {
            setFailed({ retried });
            return;
        } finally {
            sending.current = false;
        }

        await onCleared(retried);
    };

    return (
        <>
            <MissionScene
                mission={mission}
                busy={busy}
                onFinish={(retried) => void record(retried)}
            />

            {failed && (
                <div className="encounter-send-error" role="alert">
                    <p className="form-error">
                        Your program works, but it could not be saved just now.
                    </p>
                    <button className="button primary" onClick={() => void record(failed.retried)}>
                        Send it again
                    </button>
                </div>
            )}
        </>
    );
}
