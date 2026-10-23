import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { play } from "../games/sound.js";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import { challengeFor, lessonFor, type LessonStep } from "../games/lessons.js";
import { missionFor } from "../games/missions.js";
import { MissionScene } from "../components/MissionScene.js";
import { sceneLessonFor } from "../games/scenes.js";
import { markTutorialSeen } from "../games/tutorial.js";
import { MissionPanel } from "../components/MissionPanel.js";
import type { JourneyPathResponse } from "../api/types.js";
import { SceneLesson } from "../components/SceneLesson.js";
import { ConceptComplete } from "../components/ConceptComplete.js";
import { CheckpointComplete } from "../components/CheckpointComplete.js";
import { ConceptTeaching } from "../components/ConceptTeaching.js";
import { HighlightedCode } from "../components/HighlightedCode.js";

import { usePageTitle } from "../usePageTitle.js";
import { ACTION } from "../vocabulary.js";
/**
 * One concept's lesson: teach, then ask, then answer back.
 *
 *     TEACH  →  step 1  →  step 2  →  …  →  demonstrated
 *                  ↓ wrong
 *              feedback → retry → on
 *
 * NOT TIMED, NOT SCORED, NOT DEALT. There is no clock, no points and no XP here,
 * and the steps are walked in the order they were authored rather than shuffled
 * by a curve. Learning happens before pressure; the games are where pressure
 * belongs.
 *
 * A WRONG ANSWER IS PART OF THE LESSON, not a failure of it. The chosen option
 * carries feedback naming the misconception that leads to it, and the retry is a
 * NEIGHBOURING question rather than the same one again — repeating it rewards
 * guessing, where a near-miss asks whether the explanation landed. Getting a
 * retry wrong explains once more and moves on: being stuck teaches nothing.
 */
/**
 * Renders a lesson OR a topic challenge — the same interaction either way, which
 * is why they share a component and a content type. `topic` in the route means a
 * challenge; `concept` means a lesson. Only where completion is reported differs.
 */
export function LessonPage() {
    const { concept, topic } = useParams<{ concept?: string; topic?: string }>();
    // Replayed from Profile: the same tutorial, closing words for a returning learner.
    const replay = useSearchParams()[0].get("replay") === "1";
    // A topic is a checkpoint; a concept here is a lesson (the playable
    // tutorial, for console-output). It said "Checkpoint" for both.
    usePageTitle(topic ? "Checkpoint" : (sceneLessonFor(concept ?? null)?.title ?? "Lesson"));
    const lesson = useMemo(
        () => (topic ? challengeFor(topic) : lessonFor(concept ?? null)),
        [concept, topic]
    );

    /** Which authored step we are on. */
    const [index, setIndex] = useState(0);
    /** Reading the teaching, before any question. */
    /**
     * Challenges open straight on the first question: they have no worked
     * examples, and a teach screen with nothing on it is a click for nothing.
     */
    const [phase, setPhase] = useState<"teach" | "ask">("teach");
    /** Set once the learner has answered the step in front of them. */
    const [chosen, setChosen] = useState<number | null>(null);
    /** True while showing the retry of the current step rather than the step. */
    const [retrying, setRetrying] = useState(false);
    /** Recorded for the whole lesson, reported once at the end. */
    const [neededRetry, setNeededRetry] = useState(false);
    const [done, setDone] = useState(false);
    /** The playable tutorial was finished: show the hand-over to the first mission. */
    const [tutorialDone, setTutorialDone] = useState(false);
    const [busy, setBusy] = useState(false);
    /** The server's reason for not recording this, when it would not. */
    const [refused, setRefused] = useState<string | null>(null);

    /*
     * A CHECKPOINT IS JUDGED BY THE SERVER. Each step's answer (and its retry's,
     * when one was shown) is kept and sent with the pass, and the server checks
     * every one against its own key. Refs rather than state, because the last
     * answer is recorded and the request built in the same click.
     */
    const answers = useRef<{ choice: string; retry?: string }[]>([]);
    /** A step ended wrong: no retry left, or the retry was wrong too. */
    const missed = useRef(false);
    /** The checkpoint was walked with a wrong answer in it; offer it again. */
    const [notPassed, setNotPassed] = useState(false);

    const step: LessonStep | null = useMemo(() => {
        if (!lesson) return null;

        const authored = lesson.steps[index];

        if (!authored) return null;

        return retrying && authored.retry ? { ...authored.retry } : authored;
    }, [lesson, index, retrying]);

    /**
     * Records the completion.
     *
     * Takes the retry flag as an argument rather than reading state: the scene
     * player knows whether a retry happened at the moment it finishes, and a
     * setState would not have flushed by the time this ran.
     */
    const finishWith = useCallback(
        async (retried: boolean) => {
            const done = lesson ?? sceneLessonFor(concept ?? null);

            if (!done) return;

            setBusy(true);

            try {
                await api.post(
                    lesson?.challengeFor
                        ? `/api/curriculum/topics/${lesson.challengeFor}/challenge`
                        : `/api/curriculum/concepts/${"concept" in done ? done.concept : concept}/demonstrate`,
                    lesson?.challengeFor
                        ? { neededRetry: retried, answers: answers.current }
                        : { neededRetry: retried }
                );
                setDone(true);
            } catch (err) {
                // A CHECKPOINT IS THE UNLOCK, so a refused one cannot be shown
                // as a completed one -- see the `refused` branch below. A
                // refused concept demonstration is the same lie one level down.
                setRefused(
                    err instanceof ApiError
                        ? err.message
                        : "That could not be recorded just now."
                );
            }

            setBusy(false);
        },
        [lesson, concept]
    );

    /**
     * The mission that closes this topic, if one is authored.
     *
     * A topic with a mission is completed by TWO pieces of evidence, not one:
     * the quiz shows the learner can say what code does, the mission shows they
     * can make code do something. They are different capabilities and Jolt asks
     * for both -- so finishing the quiz hands over to the mission rather than
     * recording the topic.
     */
    const mission = useMemo(() => (topic ? missionFor(topic) : null), [topic]);
    const [quizDone, setQuizDone] = useState(false);

    const finish = useCallback(async () => {
        if (!lesson) return;

        setBusy(true);

        try {
            await api.post(
                lesson.challengeFor
                    ? `/api/curriculum/topics/${lesson.challengeFor}/challenge`
                    : `/api/curriculum/concepts/${lesson.concept}/demonstrate`,
                lesson.challengeFor ? { neededRetry, answers: answers.current } : { neededRetry }
            );
            setDone(true);
        } catch (err) {
            // Not swallowed. Losing the record silently is what made a learner
            // believe a module had completed while the server still had it open.
            setRefused(
                err instanceof ApiError ? err.message : "That could not be recorded just now."
            );
        }

        setBusy(false);
    }, [lesson, neededRetry]);

    /**
     * Finishing the quiz half. Records nothing on its own -- the topic is only
     * recorded once the mission is passed too, because passing half of the
     * evidence is not the capability.
     */
    const finishQuiz = useCallback(() => {
        // Not passed: say so now, before the mission and without a request the
        // server would refuse. The server still judges every pass it is sent.
        if (lesson?.challengeFor && missed.current) {
            setNotPassed(true);
            return;
        }

        if (mission) {
            setQuizDone(true);
            return;
        }

        void finish();
    }, [lesson, mission, finish]);

    /** Back to the first question, with nothing carried over. Records nothing. */
    const retakeCheckpoint = useCallback(() => {
        answers.current = [];
        missed.current = false;
        setIndex(0);
        setChosen(null);
        setRetrying(false);
        setNeededRetry(false);
        setQuizDone(false);
        setRefused(null);
        setNotPassed(false);
    }, []);

    const advance = useCallback(() => {
        if (!lesson || !step) return;

        const authored = lesson.steps[index]!;
        const wasWrong = chosen !== null && !step.choices[chosen]?.correct;
        const text = chosen !== null ? step.choices[chosen]?.text : undefined;

        if (text !== undefined) {
            if (retrying) {
                const last = answers.current[answers.current.length - 1];
                if (last) last.retry = text;
            } else {
                answers.current.push({ choice: text });
            }
        }

        // Wrong with nothing left to try on this step.
        if (wasWrong && (retrying || !authored.retry)) {
            missed.current = true;
        }

        // Wrong, and this step has a retry we have not shown yet.
        if (wasWrong && !retrying && authored.retry) {
            setRetrying(true);
            setChosen(null);
            setNeededRetry(true);
            return;
        }

        setRetrying(false);
        setChosen(null);

        if (index + 1 < lesson.steps.length) {
            setIndex(index + 1);
            return;
        }

        finishQuiz();
    }, [lesson, step, index, chosen, retrying, finishQuiz]);

    // The interactive form, where one exists. A concept with a scene lesson gets
    // the scene player; the other twenty keep the prose form, and completion is
    // reported identically either way — the progression layer never learns which
    // shape the learner walked.
    const scenes = useMemo(() => (topic ? null : sceneLessonFor(concept ?? null)), [concept, topic]);

    // Quiz passed, mission still to go. `neededRetry` carries across both
    // halves: struggling anywhere in the topic is one fact about the learner,
    // not two.
    // Not once the server has refused the pass: the refusal (and its retake)
    // must show, not the mission the learner already finished.
    if (mission && quizDone && !done && !refused) {
        return (
            <MissionScene
                mission={mission}
                busy={busy}
                onFinish={(retried) => {
                    // finishWith takes the value rather than reading state:
                    // setNeededRetry would not have flushed by the time the
                    // request is built, and this is the one fact the request
                    // carries. Combined with the quiz half, because struggling
                    // anywhere in the topic is one fact about the learner.
                    const struggled = neededRetry || retried;

                    setNeededRetry(struggled);
                    void finishWith(struggled);
                }}
            />
        );
    }

    /*
     * THE PLAYABLE TUTORIAL RECORDS NOTHING. It used to post /demonstrate on
     * its last scene, which the server refuses until the concept's practice
     * stops are cleared -- so a new learner finished the tutorial and met an
     * error. Now finishing (or skipping) it is remembered on this device and
     * hands over to the first mission, whose practice stops are the evidence.
     */
    if (scenes) {
        if (tutorialDone) {
            return <TutorialDone concept={scenes.concept} replay={replay} />;
        }

        return (
            <>
                <SceneLesson
                    lesson={scenes}
                    busy={false}
                    onFinish={() => {
                        markTutorialSeen(scenes.concept);
                        setTutorialDone(true);
                    }}
                />
                <p className="scene-skip">
                    <Link
                        to={`/concept/${scenes.concept}`}
                        onClick={() => markTutorialSeen(scenes.concept)}
                    >
                        Skip to the practice
                    </Link>
                </p>
            </>
        );
    }

    if (!lesson) {
        return (
            <section className="panel narrow">
                <p className="muted">There is no lesson written for that yet.</p>
                <Link className="button primary" to="/journey">
                    {ACTION.seeJourney}
                </Link>
            </section>
        );
    }

    if (refused) {
        /* THE SERVER REFUSED THE RECORD, SO NOTHING IS CELEBRATED. This used to
           fall through to the completion screen regardless, which announced a
           finished topic over a checkpoint the server had rejected -- and a
           rejected checkpoint is precisely the case where the next module has
           NOT opened. */
        return (
            <section className="panel narrow">
                <p className="form-error" role="alert">
                    {refused}
                </p>
                <div className="checkpoint-actions">
                    {lesson.challengeFor && (
                        <button className="button primary" onClick={retakeCheckpoint}>
                            Try the checkpoint again
                        </button>
                    )}
                    <Link className={`button ${lesson.challengeFor ? "ghost" : "primary"}`} to="/journey">
                        {ACTION.seeJourney}
                    </Link>
                </div>
            </section>
        );
    }

    if (notPassed) {
        /* NOT A FAILURE SCREEN. Every concept in the topic is already
           demonstrated; this asks for the whole topic at once, and one answer
           was off. Nothing was recorded, and the same questions are one tap
           away -- with the feedback just read fresh in mind. */
        return (
            <section className="panel narrow">
                <h1>Not quite there yet</h1>
                <p role="status">
                    One or more answers in the {lesson.title.toLowerCase()} were not right, so the
                    checkpoint is not passed yet. Nothing was recorded. Read the feedback, then go
                    through it again.
                </p>
                <div className="checkpoint-actions">
                    <button className="button primary" onClick={retakeCheckpoint}>
                        Try the checkpoint again
                    </button>
                    <Link className="button ghost" to="/journey">
                        {ACTION.seeJourney}
                    </Link>
                </div>
            </section>
        );
    }

    if (done) {
        // Challenges close a topic rather than a concept, so they get their own
        // arrival; ConceptComplete speaks in terms of one capability.
        if (lesson.concept) {
            return <ConceptComplete concept={lesson.concept} />;
        }

        return (
            <CheckpointComplete
                topic={lesson.challengeFor ?? topic ?? ""}
                title={lesson.title}
            />
        );
    }

    // Derived rather than pushed into state during render: a challenge has no
    // worked examples, so its teach phase does not exist rather than being
    // skipped by a setState the renderer would have to run twice for.
    const showing = lesson.teach.length === 0 ? "ask" : phase;

    if (showing === "teach") {
        return (
            <section className="lesson">
                <p className="lesson-eyebrow">
                    {(lesson.challengeFor ?? lesson.concept ?? "").replace(/-/g, " ")}
                </p>
                <h1 className="lesson-title">{lesson.title}</h1>
                <p className="lesson-why">{lesson.why}</p>

                <ConceptTeaching teach={lesson.teach} notice={lesson.notice} />

                <button className="button primary big" onClick={() => setPhase("ask")}>
                    Got it. Try one
                </button>
            </section>
        );
    }

    const answered = chosen !== null;
    const picked = answered ? step!.choices[chosen]! : null;
    const right = picked?.correct === true;

    return (
        <section className="lesson">
            <p className="lesson-eyebrow">
                {lesson.title}
                <span className="lesson-progress">
                    {index + 1} / {lesson.steps.length}
                </span>
            </p>

            <p className="lesson-ask">{step!.ask}</p>

            {step!.code && (
                <pre className="lesson-code">
                    <code><HighlightedCode code={step!.code} /></code>
                </pre>
            )}

            <ol className="lesson-choices">
                {step!.choices.map((choice, i) => (
                    <li key={choice.text}>
                        <button
                            className={`lesson-choice${
                                answered && i === chosen ? (right ? " is-right" : " is-wrong") : ""
                            }${answered && choice.correct ? " is-answer" : ""}`}
                            disabled={answered}
                            onClick={() => {
                                setChosen(i);
                                play(choice.correct ? "correct" : "incorrect");
                            }}
                        >
                            <code>{choice.text}</code>
                        </button>
                    </li>
                ))}
            </ol>

            {answered && (
                <div className={`lesson-feedback ${right ? "right" : "wrong"}`} role="status">
                    <p className="lesson-feedback-head">
                        {right ? "Yes" : "Not quite"}
                    </p>
                    <p className="lesson-feedback-body">
                        {right ? step!.confirm : (picked?.feedback ?? step!.confirm)}
                    </p>

                    {/* The next idea, introduced while the learner is looking at
                        an example of it rather than sprung on them as a question
                        two steps later. Only after a correct answer: a learner
                        who just got it wrong has one thing to absorb already. */}
                    {right && step!.aside && (
                        <p className="lesson-aside">{step!.aside}</p>
                    )}
                </div>
            )}

            {answered && (
                <button className="button primary big" disabled={busy} onClick={advance}>
                    {!right && !retrying && lesson.steps[index]!.retry
                        ? "Try a similar one"
                        : index + 1 < lesson.steps.length
                          ? "Next"
                          : "Finish"}
                </button>
            )}
        </section>
    );
}

/**
 * After the tutorial: what they just did, in one line, and their first mission.
 *
 * The mission panel reads the path like everywhere else, so the button goes to
 * the concept's practice (the tutorial is marked seen by now). If the path
 * cannot be read, the concept page is still one link away.
 */
function TutorialDone({ concept, replay = false }: { concept: string; replay?: boolean }) {
    const [path, setPath] = useState<JourneyPathResponse | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let active = true;
        api.get<JourneyPathResponse>("/api/curriculum/path")
            .then((data) => active && setPath(data))
            .catch(() => active && setFailed(true));
        return () => {
            active = false;
        };
    }, []);

    return (
        <section className="tutorial-done">
            {replay ? (
                <>
                    <h1 className="tutorial-done-title">Tutorial replayed.</h1>
                    <p className="tutorial-done-lede">
                        Nothing was recorded and your progress is as you left it. Here is your next step.
                    </p>
                </>
            ) : (
                <>
                    <h1 className="tutorial-done-title">You wrote your first program.</h1>
                    <p className="tutorial-done-lede">
                        Next is your first mission: a few short steps that count toward your journey.
                    </p>
                </>
            )}
            {path && <MissionPanel path={path} />}
            {(failed || (path && !path.current)) && (
                <Link className="button primary big" to={`/concept/${concept}`}>
                    {replay ? "Go to the practice" : "Go to your first mission"}
                </Link>
            )}
        </section>
    );
}

