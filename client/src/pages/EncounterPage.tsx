import { useCallback, useEffect, useMemo, useState } from "react";
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
export function EncounterPage() {
    const { concept } = useParams<{ concept: string }>();

    const [encounter, setEncounter] = useState<Encounter | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    /** Reading the teaching, before anything is asked. */
    const [phase, setPhase] = useState<"learn" | "work">("learn");
    /** Missed something anywhere in this concept. One fact, reported once. */
    const [neededRetry, setNeededRetry] = useState(false);
    const [done, setDone] = useState(false);

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
     */
    const finish = useCallback(
        async (struggled: boolean) => {
            setBusy(true);

            try {
                await api.post(`/api/curriculum/concepts/${concept}/demonstrate`, {
                    neededRetry: struggled,
                    demand: rung?.demandSlug ?? null
                });
                setDone(true);
            } catch {
                // A recorded rung with an unrecorded concept is recoverable --
                // the next visit re-offers only what is still uncleared -- so
                // the learner is not stopped here.
                setDone(true);
            } finally {
                setBusy(false);
            }
        },
        [concept, rung]
    );

    /** Called when a rung is cleared. Reloads, then advances or finishes. */
    const rungCleared = useCallback(
        async (struggled: boolean) => {
            const nowStruggled = neededRetry || struggled;

            setNeededRetry(nowStruggled);

            const refreshed = await api
                .get<Encounter>(`/api/curriculum/concepts/${concept}/encounter`)
                .catch(() => null);

            if (refreshed) setEncounter(refreshed);

            if (!refreshed || refreshed.currentRung === null) {
                await finish(nowStruggled);
            }
        },
        [concept, finish, neededRetry]
    );

    if (error) {
        return (
            <section className="panel narrow">
                <p className="form-error" role="alert">{error}</p>
                <Link className="button primary" to="/journey">Back to your journey</Link>
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
        return (
            <section className="panel narrow">
                <p className="lesson-eyebrow">{encounter.topicSlug.replace(/-/g, " ")}</p>
                <h1 className="lesson-title">{encounter.name}</h1>
                <p className="lesson-why">Not yet — this one builds on something else.</p>

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
                {encounter.topicSlug.replace(/-/g, " ")} · you are here
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

                <button className="button primary big" onClick={() => setPhase("work")}>
                    Got it — try one
                </button>

                {/*
                    The one place a module points at the playground, and it is
                    an offer rather than a step: a learner who wants to poke at
                    the example before being asked anything can, and the rung
                    is waiting either way. Not per concept -- the playground is
                    a tool, not an exercise.
                */}
                <p className="lesson-aside-link">
                    or <Link to="/experiment">try it yourself first</Link> — nothing is
                    marked there.
                </p>
            </section>
        );
    }

    /* EVERY RUNG IS DECLARED, PLAYABLE OR NOT. A concept whose ladder has a hole
       says so, here, rather than quietly being shorter than the curriculum says
       it is. */
    if (!rung) {
        return (
            <section className="lesson">
                {header}
                <p className="lesson-why">
                    {encounter.rungs.every((r) => r.cleared)
                        ? "You have done everything here."
                        : "There is nothing to practise here yet."}
                </p>

                <ul className="encounter-rungs">
                    {encounter.rungs.map((r) => (
                        <li key={r.demandSlug} data-state={r.cleared ? "cleared" : r.options.length ? "open" : "unbuilt"}>
                            {rungLabel(r.demandSlug)}
                            {r.cleared ? " ✓" : r.options.length === 0 ? " — not built yet" : ""}
                        </li>
                    ))}
                </ul>

                <Link className="button primary" to={`/world/${encounter.topicSlug}`}>
                    Back to {encounter.topicSlug.replace(/-/g, " ")}
                </Link>
            </section>
        );
    }

    const option = rung.options[0]!;

    return (
        <section className="lesson">
            {header}

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

    useEffect(() => {
        let active = true;

        void api
            .get<Exercise>(`/api/curriculum/challenges/${challengeId}/exercise`)
            .then((data) => {
                if (active) {
                    setExercise(data);
                    setChosen(null);
                    setVerdict(null);
                }
            })
            .catch(() => undefined);

        return () => {
            active = false;
        };
    }, [challengeId]);

    const answer = async (optionId: string) => {
        if (verdict || sending) return;

        setSending(true);
        setChosen(optionId);

        try {
            const judged = await api.post<Judgement>(
                `/api/curriculum/challenges/${challengeId}/answer`,
                { optionId, neededRetry: missed }
            );

            setVerdict(judged);
            if (!judged.correct) setMissed(true);
        } finally {
            setSending(false);
        }
    };

    if (!exercise) {
        return <p className="muted">Loading…</p>;
    }

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
                    <code>{exercise.code}</code>
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
                                Missed it twice — worth another look at the explanation.
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

    if (!mission) {
        return (
            <p className="muted">
                The curriculum expects a writing exercise here, but none is authored yet.
            </p>
        );
    }

    return (
        <MissionScene
            mission={mission}
            busy={busy}
            onFinish={(retried) => {
                void (async () => {
                    await api
                        .post(`/api/curriculum/challenges/${challengeId}/completion`, {
                            neededRetry: retried
                        })
                        .catch(() => undefined);

                    await onCleared(retried);
                })();
            }}
        />
    );
}
