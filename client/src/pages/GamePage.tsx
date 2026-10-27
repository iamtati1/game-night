import { useCallback, useEffect, useRef, useState } from "react";
import { play } from "../games/sound.js";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import { activeGameFrom } from "../api/types.js";
import type {
    AnswerResponse,
    CurrentQuestionResponse,
    ResumableResponse,
    ServedQuestion,
    StartSessionResponse,
    Introduction,
    IntroductionResponse,
    JourneyPathResponse
} from "../api/types.js";
import { LearningBridge } from "../components/LearningBridge.js";
import { ActiveGameConflict } from "../components/ActiveGameConflict.js";
import { Countdown } from "../components/Countdown.js";
import { GameIntro } from "../components/GameIntro.js";
import { PaceChoice } from "../components/PaceChoice.js";
import { usePace } from "../games/usePace.js";
import { startGame } from "../vocabulary.js";
import { PausedRun } from "../components/PausedRun.js";
import { GetReady } from "../components/GetReady.js";
import { learnBeatFor, learnBeatForConcept, type LearnBeat } from "../games/learnBeats.js";
import { lessonFor, plainIdea } from "../games/lessons.js";
import { CODE_BLITZ, gameBySlug } from "../games/catalog.js";
import { RoundProgress } from "../components/RoundProgress.js";
import { splitPrompt } from "../games/prompt.js";
import { HighlightedCode } from "../components/HighlightedCode.js";

import { usePageTitle } from "../usePageTitle.js";
import { usePauseOnLeave } from "../games/usePauseOnLeave.js";
import { Explanation } from "../components/Explanation.js";
const QUESTION_TIME_LIMIT_MS = 18_000;
/**
 * A lapse still auto-advances, and only a lapse.
 *
 * The timeout path has already fetched the next question by the time this
 * runs -- that fetch is what adjudicates the expired one -- so its clock
 * is live. Holding the player on a button here would spend time they are
 * about to need. There is also nothing to read: a lapse carries no
 * explanation and names no answer, by design.
 */
const LAPSE_DWELL_MS = 1400;

/**
 * There is no dwell timer for an answered question.
 *
 * It used to be 900ms on a correct answer and 1600ms on a wrong one, scaled to
 * how much there was to read. The problem is that the wrong-answer case is the
 * teaching moment -- the explanation, the answer you missed -- and no fixed
 * budget is right for reading it. A fast reader waits; a slow one loses it.
 *
 * The player advances instead. Safe to do here specifically because the next
 * question is fetched on advance rather than bundled into the answer response,
 * so its clock starts when they ask for it, not while they are still
 * reading. That ordering was already in place; this just uses it.
 */

/** Exit animation. Short enough to read as one motion with the entrance. */
const EXIT_MS = 170;

/** The OS asks for less motion; then the exit animation is off (index.css). */
function reducedMotion(): boolean {
    try {
        return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    } catch {
        return false;
    }
}

interface Feedback {
    outcome: "correct" | "incorrect" | "timed_out";
    correctOption: string;
    /** Why, in one line. Absent on older questions and on a lapse. */
    explanation: string | null;
    pointsAwarded: number;
    selectedOptionId: string | null;
}

/**
 * How one option should read once the answer is in.
 *
 * The distinction that matters is between `chosen-correct` and `revealed`: before
 * this, both got the same `.correct` class, so "I knew that" and "that was the
 * answer I missed" looked identical. A player could not tell their own success
 * from the game correcting them, which is the single most important thing a
 * feedback moment has to communicate.
 */
type OptionState = "chosen-correct" | "chosen-incorrect" | "revealed" | "muted" | "";

function optionStateFor(
    feedback: Feedback | null,
    option: { id: string; text: string }
): OptionState {
    if (!feedback) {
        return "";
    }

    const chosen = feedback.selectedOptionId === option.id;
    // correctOption is empty when the countdown lapsed rather than the player
    // answering: GET /api/sessions/current does not carry the answer to the
    // question that just expired. Guarding on it keeps an empty string from
    // matching an option and revealing the wrong row.
    const isAnswer = feedback.correctOption !== "" && feedback.correctOption === option.text;

    if (chosen && isAnswer) return "chosen-correct";
    if (chosen) return "chosen-incorrect";
    if (isAnswer) return "revealed";

    return "muted";
}

/** Decorative only -- the banner below carries the same meaning as text. */
const OPTION_GLYPH: Record<OptionState, string> = {
    "chosen-correct": "\u2713",
    "chosen-incorrect": "\u2715",
    revealed: "\u2713",
    muted: "",
    "": ""
};

/**
 * Your assembly against the right one, with the first divergent token marked.
 *
 * Deliberately not partial credit -- the answer is still right or wrong. This
 * only answers "where did I go wrong", which for a sequence is a different
 * question from "what was the answer", and the one worth showing.
 */
function AssemblyVerdict({ built, correct }: { built: string[]; correct: string }) {
    const wanted = correct.split(" ");
    const right = built.join(" ") === correct;

    // A client-side lapse adjudicates through GET /sessions/current, whose
    // response deliberately carries no correct answer -- so there is no second
    // row to draw, and drawing the first one alone reads as "correct: nothing".
    if (right || correct === "") {
        return null;
    }

    // The first place the two sequences differ, or the point where the shorter
    // one ran out.
    const divergesAt = built.findIndex((token, i) => token !== wanted[i]);
    const mark = divergesAt === -1 ? built.length : divergesAt;

    return (
        <div className="verdict-rows">
            <p className="verdict-row">
                <span className="verdict-label">You built</span>
                {built.map((token, i) => (
                    <span key={i} className={`verdict-token${i === mark ? " diverged" : ""}`}>
                        {token}
                    </span>
                ))}
            </p>
            <p className="verdict-row">
                <span className="verdict-label">Correct</span>
                {wanted.map((token, i) => (
                    <span key={i} className={`verdict-token${i === mark ? " diverged" : ""}`}>
                        {token}
                    </span>
                ))}
            </p>
        </div>
    );
}

/** The marker a complete-code prompt uses to say where the gap is. */
const GAP = "/*?*/";

/**
 * The fewest tokens an answer can be, matching submitAnswerSchema.
 *
 * The server rejects a shorter sequence outright rather than scoring it, so a
 * Submit that allowed one token turned a half-finished answer into an error
 * banner instead of a wrong answer. Committing a short-but-valid assembly is
 * still allowed, and is still simply wrong.
 */
const MIN_TOKENS = 2;

/**
 * The assembly stage: a snippet with a gap, and a bank to fill it from.
 *
 * The interaction is Memory's symbol bank and Flush's tile rack, which is
 * deliberate -- a player who has played either already knows this gesture, and
 * the mechanic is new enough without a new way of touching it.
 *
 * Placement is by tap, not drag. Dragging is worse on a phone, needs a pointer
 * fallback, and buys nothing here: tokens go in one order, at one place.
 */
function Assembly({
    question,
    placed,
    locked,
    onPlace,
    onRemove,
    onSubmit
}: {
    question: ServedQuestion;
    placed: string[];
    locked: boolean;
    onPlace: (id: string) => void;
    onRemove: (at: number) => void;
    onSubmit: () => void;
}) {
    const byId = new Map(question.options.map((o) => [o.id, o.text]));
    const { code } = splitPrompt(question.prompt);

    // A complete-code prompt always has a snippet and always marks its gap --
    // both are enforced by the content tests -- so this only guards the types.
    const [before, after] = (code ?? "").split(GAP);

    return (
        <div className="assembly">
            <pre className="prompt assembly-code">
                {before}
                <span className={`assembly-gap${placed.length ? " filled" : ""}`}>
                    {placed.length === 0 ? (
                        <span className="assembly-placeholder">&nbsp;</span>
                    ) : (
                        placed.map((id, i) => (
                            <button
                                key={`${id}-${i}`}
                                type="button"
                                className="assembly-placed"
                                onClick={() => onRemove(i)}
                                disabled={locked}
                                title="Remove"
                            >
                                {byId.get(id)}
                            </button>
                        ))
                    )}
                </span>
                {after}
            </pre>

            <ul className="assembly-bank">
                {question.options.map((option, index) => {
                    const used = placed.includes(option.id);

                    return (
                        <li key={option.id}>
                            <button
                                type="button"
                                className={`assembly-token${used ? " used" : ""}`}
                                onClick={() => onPlace(option.id)}
                                disabled={locked || used}
                            >
                                <kbd>{index + 1}</kbd>
                                <span className="assembly-token-text">{option.text}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>

            {/* Explicit, never automatic. Filling the last slot is not the same as
                being finished -- the player should be able to take one back and
                look again before committing. */}
            <button
                type="button"
                className="button primary assembly-submit"
                onClick={onSubmit}
                disabled={locked || placed.length < MIN_TOKENS}
            >
                Submit
                <span className="next-hint">Enter</span>
            </button>
        </div>
    );
}

export function GamePage() {
    usePageTitle("Code Blitz");
    const navigate = useNavigate();
    // ?focus=variables asks the dealer for an introduction slot and a
    // reinforcement slot on that unit. Absent, Code Blitz deals exactly as
    // before -- this is additive, not a new mode.
    const [searchParams] = useSearchParams();
    const focusTopic = searchParams.get("focus");
    /**
     * The concept the curriculum says to introduce next, decided server-side.
     *
     * Null until the entrance probe answers, and null for a learner who has met
     * everything currently reachable. This is the Learn half of Learn -> Play:
     * acknowledging it is what marks the concept encountered, which is what
     * makes its practice content eligible to be dealt.
     */
    const [introduction, setIntroduction] = useState<Introduction | null>(null);
    /**
     * The concept the curriculum says this learner is on, for the bridge at the
     * entrance. Read from the same /api/curriculum/path the map and Home read,
     * so the three cannot disagree about what the learner is learning.
     *
     * Separate from `introduction`, which is only non-null while a Learn Beat
     * is actually due. The bridge has to work on the fifth round of a concept
     * as well as the first.
     */
    const [currentConcept, setCurrentConcept] = useState<{
        name: string;
        objective: string;
    } | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [paused, setPaused] = useState(false);
    /** Counting in after Resume. The session is only resumed once the count
     *  finishes, so nothing is ticking while the numbers run. */
    const [resuming, setResuming] = useState(false);
    /** Where a paused run stopped. Set either from live state when the player
     *  pauses, or from the server when they arrive back on a paused run. */
    const [pausedInfo, setPausedInfo] = useState<{
        unit: string;
        current: number;
        total: number;
        score: number;
    } | null>(null);
    const [question, setQuestion] = useState<ServedQuestion | null>(null);
    /**
     * False until the player has actually chosen to begin.
     *
     * The page used to POST /api/sessions on mount, so arriving on the route WAS
     * starting a run -- question one was already on screen with its clock going
     * before the player had read anything. The entrance gates that.
     */
    const [entered, setEntered] = useState(false);
    /**
     * Between pressing Start and the session existing.
     *
     * The countdown has to run BEFORE the POST, not after: POST /api/sessions
     * serves the first question, and serving is what stamps served_at and starts
     * the 35-second clock. A countdown on the other side of that request would
     * be spending the player's own time.
     */
    const [countingIn, setCountingIn] = useState(false);
    const [beginning, setBeginning] = useState(false);
    const [timed, setTimed] = usePace();
    /**
     * Consecutive correct answers in this run.
     *
     * The value already existed -- results reports "best streak" -- but only once
     * the run was over, which is exactly when it can no longer change how anyone
     * plays. Tracked here so it is visible while there is still something to
     * protect. Client-side only; the server keeps deriving the authoritative
     * figure from the stored answers.
     */
    const [streak, setStreak] = useState(0);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    /** Set once an answer is in. Holds what to do when the player advances. */
    const [pendingAdvance, setPendingAdvance] = useState<
        { complete: boolean; sessionId: string | null } | null
    >(null);
    /**
     * Focus lands on Next once feedback is up. Browser QA: it stayed on the
     * page body, so a keyboard learner had nothing focused to act on (the
     * global Enter handler worked, but nothing said so). Safe with that
     * handler: it calls preventDefault on Enter and Space, which cancels the
     * button's own click, so one press still advances exactly once.
     */
    const nextRef = useRef<HTMLButtonElement | null>(null);


    // Leaving mid-run pauses it, so the clock stops and the run waits for
    // Resume -- see usePauseOnLeave.
    usePauseOnLeave(CODE_BLITZ, entered && sessionId !== null && question !== null && !paused && !resuming && !pendingAdvance?.complete);
    useEffect(() => {
        if (pendingAdvance) nextRef.current?.focus();
    }, [pendingAdvance]);
    /** The worked example to show before the run, when one applies. */
    const [learning, setLearning] = useState(false);
    /** Option ids placed into the gap, in the order the player placed them.
     *  Only ever non-empty for a complete-code question. */
    const [placed, setPlaced] = useState<string[]>([]);
    const [runningScore, setRunningScore] = useState(0);
    const [conflict, setConflict] = useState<{ slug: string; name: string } | null>(null);
    /** Bumped after abandoning, to re-run the start effect. */
    const [attempt, setAttempt] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    /**
     * The option sent and not yet judged. The answer request takes a moment,
     * and every option is disabled while it runs, so without this the screen
     * gave no sign which answer had been taken.
     */
    const [pickedId, setPickedId] = useState<string | null>(null);
    /** A hint request is in flight. */
    const [hinting, setHinting] = useState(false);
    /** Bumped once per adjudicated question. Used purely as a React key so the
     *  award and score animations replay on a repeat of the same value -- two
     *  correct answers worth +130 in a row must animate twice, not once. */
    const [beat, setBeat] = useState(0);

    /**
     * The card shown before the run starts.
     *
     * Two sources, and the curriculum wins. A concept-keyed beat is the Learn
     * half of the learning loop and completing it changes what the learner is
     * dealt next; the ?focus= beat is the older, unrecorded path and stays
     * exactly as it was.
     *
     * When the server offers an introduction no beat has been authored for, the
     * concept's own one-line meaning stands in rather than the introduction
     * silently disappearing -- which would leave its practice content
     * permanently unreachable.
     */
    const learnBeat: LearnBeat | null =
        learnBeatForConcept(introduction?.conceptSlug ?? null) ??
        (introduction ? beatFromLesson(introduction) : learnBeatFor(focusTopic));

    // Guards against the countdown firing while an answer is already in flight
    // or feedback is on screen.
    const settling = useRef(false);

    /** True while the current question is animating out. */
    const [leaving, setLeaving] = useState(false);

    /**
     * Every pending timeout, so unmounting cannot leave one running.
     *
     * This matters more than tidiness: the sequencing timers call navigate() when
     * a game ends, so one surviving an unmount would redirect a player who had
     * already left the page.
     */
    const timers = useRef<number[]>([]);

    const later = useCallback((fn: () => void, ms: number) => {
        timers.current.push(window.setTimeout(fn, ms));
    }, []);

    useEffect(
        () => () => {
            timers.current.forEach(window.clearTimeout);
            timers.current = [];
        },
        []
    );

    const finish = useCallback(
        (id: string) => {
            navigate(`/results/${id}`, { replace: true });
        },
        [navigate]
    );

    async function handlePause() {
        if (!sessionId || busy) return;

        setBusy(true);

        try {
            await api.post("/api/me/sessions/code-blitz/pause");

            if (question) {
                setPausedInfo({
                    unit: gameBySlug(CODE_BLITZ)?.unit ?? "Question",
                    current: question.questionNumber,
                    total: question.totalQuestions,
                    score: runningScore
                });
            }

            setPaused(true);
        } catch (err) {
            setError(
                err instanceof ApiError
                    ? err.detailText
                    : "Could not pause the game"
            );
        } finally {
            setBusy(false);
        }
    }

    async function handleResume() {
        setError(null);
        setBusy(true);

        try {
            const data = await api.post<StartSessionResponse>("/api/sessions");

            /*
             * Resuming reaches the availability check only if the paused run
             * has gone, so this should not happen -- but if it does, taking the
             * normal path would clear the question and leave the player on an
             * un-paused screen with nothing on it. Keep the paused card up and
             * say what is needed instead.
             */
            if (data.introduction) {
                setIntroduction(data.introduction);
                setResuming(false);
                setError("Finish the next Learn Beat before playing again.");
                return;
            }

            setSessionId(data.sessionId ?? null);
            setQuestion(data.question ?? null);
            setRunningScore(data.scoreSoFar ?? 0);
            // Without this, resuming a run that was paused before a reload
            // showed the intro instead of the question.
            setEntered(true);
            setPausedInfo(null);
            setPaused(false);
            setResuming(false);
        } catch (err) {
            // Drop out of the countdown, or the player is stranded watching "Go"
            // with no way back to the paused screen.
            setResuming(false);
            setError(
                err instanceof ApiError
                    ? err.detailText
                    : "Could not resume the game"
            );
        } finally {
            setBusy(false);
        }
    }

    // Start, resume, or -- if the player paused this run -- stop and ask.
    useEffect(() => {
        let active = true;

        void (async () => {
            // POST /api/sessions means "start or resume", so arriving on a paused
            // run silently un-paused it and restarted the clock. A pause is a
            // decision; only the player gets to undo it.
            try {
                const open = await api.get<ResumableResponse>("/api/me/sessions/resumable");
                const heldRun = open.sessions.find(
                    (s) => s.game.slug === CODE_BLITZ && s.status === "paused"
                );

                if (!active) return;

                if (heldRun) {
                    setPausedInfo({
                        unit: gameBySlug(CODE_BLITZ)?.unit ?? "Question",
                        current: Math.min(heldRun.unitsDone + 1, heldRun.unitsTotal),
                        total: heldRun.unitsTotal,
                        score: heldRun.score
                    });
                    setPaused(true);
                    return;
                }
            } catch {
                // A failed probe must never stop someone playing: fall through and
                // start the run the way this page always did.
            }

            if (!active) return;

            // Is a run already going? GET /sessions/current says so without
            // creating one -- it 404s when there is nothing in progress. A player
            // who refreshes mid-run goes straight back to their question; a
            // player arriving fresh gets the entrance.
            try {
                const current = await api.get<CurrentQuestionResponse>("/api/sessions/current");

                if (!active) return;

                if (current.complete && current.session) {
                    finish(current.session.id);
                    return;
                }

                if (current.question) {
                    // The run's id as well as its question. Browser QA: after a
                    // reload mid-run this was never set, and submit() returns
                    // early without one -- so no answer, by key or click, did
                    // anything, and an untimed question could never be left.
                    setSessionId(current.sessionId ?? null);
                    setQuestion(current.question);
                    setRunningScore(current.scoreSoFar ?? 0);
                    setEntered(true);
                    return;
                }
            } catch {
                // 404 means no run in progress, which is the normal first arrival.
            }

            if (!active) return;

            // Nothing in progress, so the entrance is about to render. Ask what
            // the curriculum wants introduced before it does.
            //
            // Deliberately last: a learner mid-run is returned to their question
            // without this request happening at all, and a learner who is up to
            // date gets null. Failure is silent for the same reason the resumable
            // probe's is -- not knowing what to teach must never stop someone
            // playing.
            try {
                const next = await api.get<IntroductionResponse>(
                    "/api/curriculum/introduction"
                );

                if (!active) return;

                setIntroduction(next.introduction);
            } catch {
                // Play on without an introduction.
            }

            // The bridge's other end. Failure is silent for the same reason:
            // not knowing what to say about the concept must never stop
            // someone playing.
            try {
                const path = await api.get<JourneyPathResponse>("/api/curriculum/path");

                if (!active) return;

                setCurrentConcept(
                    path.current
                        ? { name: path.current.name, objective: path.current.objective }
                        : null
                );
            } catch {
                // The entrance renders without it.
            }
        })();

        return () => {
            active = false;
        };
    }, [finish, attempt]);

    /**
     * The learner has read the beat and pressed the button.
     *
     * Reported BEFORE the count-in, and awaited, because the count-in is
     * followed immediately by POST /api/sessions -- and the concept has to be
     * encountered by the time the dealer runs, or the practice this
     * introduction just unlocked will not be in the candidate pool it sees.
     *
     * A failure here is not fatal and must not block play: the concept simply
     * stays un-encountered and the beat is offered again next time. Losing a run
     * to a failed bookkeeping request would be far worse than repeating one
     * card.
     */
    const acknowledge = useCallback(async () => {
        if (introduction) {
            try {
                await api.post(
                    `/api/curriculum/introductions/${introduction.challengeId}/complete`
                );
            } catch {
                // Offered again next time.
            }
        }

        setLearning(false);
        setCountingIn(true);
    }, [introduction]);

    /** Starts the run. Only ever called by the entrance's button. */
    const begin = useCallback(async () => {
        setBeginning(true);

        try {
            // The pace is chosen here, once, for a new run. Resume (handleResume)
            // sends nothing: a resumed run keeps the pace it was dealt with.
            const data = await api.post<StartSessionResponse>("/api/sessions", {
                ...(focusTopic ? { focusTopic } : {}),
                relaxed: !timed
            });

            if (data.session) {
                finish(data.session.id);
                return;
            }

            /*
             * The curriculum has something to teach before this round can be
             * dealt, so the beat comes back instead of a session.
             *
             * This is the loop closing rather than a failure, and it can fire
             * more than once: one Learn Beat unlocks seven practice questions
             * and a round needs ten, so an early learner meets two concepts
             * before their first game. Showing the next beat each time is what
             * makes that feel like a course instead of a locked door.
             *
             * `entered` is deliberately left alone -- nothing is in progress,
             * and the finally below drops out of the count-in.
             */
            if (data.introduction) {
                setIntroduction(data.introduction);
                setLearning(true);
                return;
            }

            setSessionId(data.sessionId ?? null);
            setQuestion(data.question ?? null);
            setRunningScore(data.scoreSoFar ?? 0);
            setEntered(true);
        } catch (err) {
            // 409 is not a failure: another game holds the single active session
            // slot, and the player gets to choose what happens.
            const conflicting = err instanceof ApiError ? activeGameFrom(err.body) : null;

            if (conflicting) {
                setConflict(conflicting);
                return;
            }

            setError(err instanceof ApiError ? err.detailText : "Could not start a game");
        } finally {
            setBeginning(false);
            // Cleared either way. On success `entered` takes over the render; on
            // failure the conflict and error gates above this one do.
            setCountingIn(false);
        }
    }, [finish, timed]);

    /**
     * Fetches the next question and starts its clock.
     *
     * GET /sessions/current is the endpoint that serves -- and therefore stamps
     * served_at on -- the next pending question. Calling it at the moment the
     * client is ready to render means the deadline the player is given is the
     * deadline they actually get.
     */
    const advanceToNext = useCallback(async () => {
        try {
            const data = await api.get<CurrentQuestionResponse>("/api/sessions/current");

            if (data.complete && data.session) {
                finish(data.session.id);
                return;
            }

            setQuestion(data.question ?? null);
            setRunningScore(data.scoreSoFar ?? 0);
            setPlaced([]);
            setLeaving(false);
            settling.current = false;
        } catch (err) {
            settling.current = false;
            setLeaving(false);
            setError(err instanceof ApiError ? err.detailText : "Lost track of the game");
        }
    }, [finish]);

    /** The player is done reading. Animate out, then ask for the next question. */
    const advance = useCallback(() => {
        if (!pendingAdvance) return;

        const pending = pendingAdvance;
        setPendingAdvance(null);

        // The outgoing question stays hidden (`leaving`) until the next one is
        // in: advanceToNext clears it. Clearing it here, before the request,
        // put the answered question back on screen unanswered for a round trip.
        setLeaving(true);

        const next = () => {
            setFeedback(null);

            if (pending.complete) {
                play("complete", pending.sessionId ?? undefined);
                finish(pending.sessionId ?? "");
                return;
            }

            void advanceToNext();
        };

        // Measured: Next to the next question took ~215ms locally, 170 of it
        // this wait. With reduced motion the exit animation does not run, so
        // the wait was for nothing. The request still starts only once the
        // exit is over, because it stamps served_at (the clock).
        if (reducedMotion()) {
            next();
            return;
        }

        later(next, EXIT_MS);
    }, [pendingAdvance, finish, advanceToNext]);

    /**
     * Sends an assembled answer.
     *
     * Shares everything after the request with submit(): the same feedback, the
     * same pending-advance handoff, the same scoring. Only the shape of what is
     * sent differs, because only the server decides whether it was right.
     */
    async function submitAssembly() {
        if (!sessionId || !question || settling.current || placed.length < MIN_TOKENS) return;

        settling.current = true;
        setBusy(true);

        try {
            const result = await api.post<AnswerResponse>(`/api/sessions/${sessionId}/answers`, {
                sessionQuestionId: question.sessionQuestionId,
                selectedOptionIds: placed
            });

            setRunningScore(result.scoreSoFar);
            setBeat((n) => n + 1);
            setStreak((n) => (result.outcome === "correct" ? n + 1 : 0));
            setFeedback({
                outcome: result.outcome,
                correctOption: result.correctOption,
                explanation: result.explanation,
                pointsAwarded: result.pointsAwarded,
                selectedOptionId: null
            });
            play(result.outcome === "correct" ? "correct" : "incorrect", question.sessionQuestionId);
            setPendingAdvance({
                complete: result.complete,
                sessionId: result.session?.id ?? sessionId
            });
        } catch (err) {
            settling.current = false;
            setError(err instanceof ApiError ? err.detailText : "Could not submit your answer");
        } finally {
            setBusy(false);
        }
    }

    async function submit(optionId: string) {
        if (!sessionId || !question || settling.current) return;

        settling.current = true;
        setBusy(true);
        setPickedId(optionId);

        try {
            const result = await api.post<AnswerResponse>(`/api/sessions/${sessionId}/answers`, {
                sessionQuestionId: question.sessionQuestionId,
                selectedOptionId: optionId
            });

            setRunningScore(result.scoreSoFar);
            setBeat((n) => n + 1);
            setStreak((n) => (result.outcome === "correct" ? n + 1 : 0));
            setFeedback({
                outcome: result.outcome,
                correctOption: result.correctOption,
                explanation: result.explanation,
                pointsAwarded: result.pointsAwarded,
                selectedOptionId: optionId
            });
            // With the words already on screen; the sound only adds to them.
            play(result.outcome === "correct" ? "correct" : "incorrect", question.sessionQuestionId);

            // Stop here. `settling.current` stays true until the player advances,
            // which is what keeps the expiry handler from firing underneath the
            // feedback they are still reading.
            setPendingAdvance({
                complete: result.complete,
                sessionId: result.session?.id ?? sessionId
            });
        } catch (err) {
            settling.current = false;
            setError(err instanceof ApiError ? err.detailText : "Could not submit your answer");
        } finally {
            setBusy(false);
            setPickedId(null);
        }
    }

    /*
     * WHEN THE CLOCK RUNS OUT, ASK FOR THE ANSWER, NOT THE NEXT QUESTION.
     *
     * UX audit: a timeout showed "Time's up" with no answer and no reason for
     * 1.4 seconds, then moved on -- so the questions a learner ran out of time
     * on were the only ones that taught nothing.
     *
     * The answer route already handles this. Sent with NO selected option, it
     * either adjudicates the question as timed out -- recording nothing the
     * learner chose, and returning the correct answer and the explanation
     * without serving the next question -- or, if the server's own deadline has
     * not quite passed, refuses with a 400 and records nothing at all. So this
     * asks, waits briefly on a 400, and asks again. The learner then reads the
     * answer and presses Next, exactly as after a wrong answer, and the next
     * question's clock starts then rather than during the dwell.
     *
     * If that cannot be done, the old path below still runs: it learns of the
     * lapse from GET /api/sessions/current, which carries no answer, so none is
     * shown.
     */
    const onExpire = useCallback(async () => {
        if (settling.current) return;

        settling.current = true;

        if (sessionId && question) {
            for (let tries = 0; tries < 4; tries++) {
                try {
                    const result = await api.post<AnswerResponse>(`/api/sessions/${sessionId}/answers`, {
                        sessionQuestionId: question.sessionQuestionId
                    });

                    if (result.outcome !== "timed_out") break;

                    setRunningScore(result.scoreSoFar);
                    setBeat((n) => n + 1);
                    setStreak(0);
                    play("incorrect", `timeout:${question.sessionQuestionId}`);
                    setFeedback({
                        outcome: "timed_out",
                        correctOption: result.correctOption,
                        explanation: result.explanation,
                        pointsAwarded: 0,
                        selectedOptionId: null
                    });
                    setPendingAdvance({
                        complete: result.complete,
                        sessionId: result.session?.id ?? sessionId
                    });
                    return;
                } catch (err) {
                    // Only "not expired yet" is worth waiting out.
                    if (!(err instanceof ApiError && err.status === 400) || tries === 3) break;
                    await new Promise<void>((resolve) => later(resolve, 500));
                }
            }
        }

        try {
            const data = await api.get<CurrentQuestionResponse>("/api/sessions/current");

            if (data.complete && data.session) {
                finish(data.session.id);
                return;
            }

            setRunningScore(data.scoreSoFar ?? 0);
            setBeat((n) => n + 1);
            setStreak(0);
            setFeedback({
                outcome: "timed_out",
                correctOption: "",
                explanation: null,
                pointsAwarded: 0,
                selectedOptionId: null
            });

            later(() => {
                setLeaving(true);

                later(() => {
                    setLeaving(false);
                    setFeedback(null);
                    setQuestion(data.question ?? null);
                    // The lapse path serves the next question itself rather than
                    // going through advanceToNext, so it has to clear the gap too.
                    // Without this, tokens placed on a question that timed out
                    // arrive on the next one, where their ids belong to nothing.
                    setPlaced([]);
                    settling.current = false;
                }, EXIT_MS);
            }, LAPSE_DWELL_MS);
        } catch (err) {
            settling.current = false;
            setError(err instanceof ApiError ? err.detailText : "Lost track of the game");
        }
    }, [finish, sessionId, question, later]);

    // Number keys 1-4 answer the question -- it is called Blitz for a reason.
    /**
     * Takes a hint: the server rules out one wrong answer and remembers that a
     * hint was taken, so a correct answer here scores half. The options it
     * rules out come back with the question on a reload, so this only updates
     * the question on screen -- never another one that arrived meanwhile.
     */
    async function takeHint() {
        if (!question || !sessionId || hinting) return;
        const asked = question.sessionQuestionId;

        setHinting(true);
        try {
            const result = await api.post<{ struckOptionIds: string[]; hintsLeft: number }>(
                `/api/sessions/${sessionId}/hints`,
                { sessionQuestionId: asked }
            );
            play("hint");
            setQuestion((q) =>
                q && q.sessionQuestionId === asked
                    ? { ...q, struckOptionIds: result.struckOptionIds, hintsLeft: result.hintsLeft }
                    : q
            );
        } catch {
            // Nothing changed on the server either way; the options stay as they were.
        } finally {
            setHinting(false);
        }
    }

    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            // Once an answer is in, the only key that does anything is the one
            // that moves on. Enter and Space both, because both are what people
            // reach for, and neither should scroll the page instead.
            if (pendingAdvance) {
                // Except on another control: Enter on the explanation's "More
                // on why" must open it, not skip past the explanation.
                const target = event.target instanceof Element ? event.target : null;
                if (target && target !== nextRef.current && target.closest("summary, a, button, input, select, textarea")) {
                    return;
                }

                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    advance();
                }
                return;
            }

            if (!question || settling.current) return;

            const index = Number(event.key) - 1;

            // Assembly: the same number keys place a token rather than answering
            // outright, Backspace takes the last one back, Enter commits.
            if (question.challengeType === "complete-code") {
                if (event.key === "Backspace") {
                    event.preventDefault();
                    setPlaced((ids) => ids.slice(0, -1));
                    return;
                }

                if (event.key === "Enter") {
                    event.preventDefault();
                    void submitAssembly();
                    return;
                }

                const token = question.options[index];

                if (token && !placed.includes(token.id)) {
                    setPlaced((ids) => [...ids, token.id]);
                }

                return;
            }

            // A ruled-out option cannot be chosen, by key any more than by click.
            if (
                Number.isInteger(index) &&
                index >= 0 &&
                index < question.options.length &&
                !(question.struckOptionIds ?? []).includes(question.options[index]!.id)
            ) {
                void submit(question.options[index]!.id);
            }
        }

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    if (conflict) {
        return (
            <ActiveGameConflict
                activeGame={conflict}
                wantedGame="Code Blitz"
                onAbandoned={() => {
                    setConflict(null);
                    setAttempt((n) => n + 1);
                }}
            />
        );
    }

    if (error) {
        return (
            <section className="panel narrow">
                <h1>Game interrupted</h1>
                <p className="form-error" role="alert">
                    {error}
                </p>
                <button className="button primary" onClick={() => window.location.reload()}>
                    Try again
                </button>
            </section>
        );
    }

    if (resuming) {
        return <GetReady onDone={() => void handleResume()} />;
    }

    if (paused) {
        return (
            <PausedRun
                slug={CODE_BLITZ}
                progress={pausedInfo}
                score={pausedInfo?.score ?? runningScore}
                busy={busy}
                onResume={() => setResuming(true)}
            />
        );
    }

    /* The entrance. Sits after the paused/conflict/error gates so a held run or a
       blocked start still wins -- those are answers to "why can I not play", and
       the intro is only for "you have not started yet". */
    if (!entered) {
        /* The Learn beat. Sits between Start and the count-in deliberately: no
           session exists yet, so no question has been served and no clock is
           running behind it. The player reads for as long as they like and the
           first challenge still arrives with its full time. */
        if (learning && learnBeat) {
            return (
                <section className="game blitz learn-beat">
                    {/* The concept's name, unless the title already is it (a beat
                        built from the lesson): saying it twice says nothing. */}
                    <p className="learn-eyebrow">
                        {(introduction?.conceptName ?? learnBeat.topic) === learnBeat.title
                            ? "New idea"
                            : `New idea · ${introduction?.conceptName ?? learnBeat.topic}`}
                    </p>
                    <h1 className="learn-title">{learnBeat.title}</h1>

                    {/* UNDERSTAND, THEN SEE. The idea in one plain sentence
                        first, so the example has something to show; then the
                        example, its output, and what happened in it. */}
                    <p className="learn-rule">{learnBeat.rule}</p>

                    {learnBeat.code && (
                        <>
                            <pre className="learn-code"><HighlightedCode code={learnBeat.code} /></pre>

                            {learnBeat.output && (
                                <p className="learn-output">
                                    <span className="learn-arrow">prints</span>{" "}
                                    <span className="learn-output-value">{learnBeat.output}</span>
                                </p>
                            )}

                            {learnBeat.note && <p className="learn-note">{learnBeat.note}</p>}
                        </>
                    )}

                    <button
                        type="button"
                        className="button primary"
                        onClick={() => void acknowledge()}
                    >
                        Got it. Try one
                    </button>
                </section>
            );
        }

        if (countingIn) {
            return <GetReady label="Code Blitz" onDone={() => void begin()} />;
        }

        return (
                <GameIntro
                eyebrow="Code Blitz"
                title="Read it. Call it."
                counts="course"
                focus={<LearningBridge concept={currentConcept} />}
                lede="Read a short piece of JavaScript and pick what it prints. Questions get harder as you go."
                shape={`10 questions · ${timed ? "18 seconds each" : "no timer"}`}
                pace={<PaceChoice timed={timed} onChange={setTimed} clock="18 seconds a question" />}
                busy={beginning}
                onStart={() => (learnBeat ? setLearning(true) : setCountingIn(true))}
                startLabel={startGame("Code Blitz")}
                />
        );
    }

    if (!question) {
        return <p className="muted center">Dealing your questions…</p>;
    }

    return (
        <section className="game blitz">
            {/* Names the game, reports the score, offers the exit. Three things,
                so the player always knows where they are and how to leave. */}
            <header className="hud">
                <span className="hud-left">
                    <span className="hud-title">Code Blitz</span>

                    {/* Only from two. A streak of one is just an answer, and a
                        badge that is always on screen stops meaning anything. */}
                    {streak > 1 && (
                        <span className={`blitz-streak${streak >= 4 ? " hot" : ""}`}>
                            <span aria-hidden="true">🔥</span>
                            <span key={`k${streak}`} className="blitz-streak-n">
                                {streak}
                            </span>
                        </span>
                    )}
                </span>

                {/* The award floats out of the score rather than sitting beside it,
                    so the number the player watches is the one that moves. */}
                <span className="score-slot">
                    <span className="hud-label">Score</span>
                    <span className="score" aria-live="polite">
                        <span key={`s${beat}`} className="score-value">
                            {runningScore}
                        </span>
                    </span>
                    {feedback?.outcome === "correct" && feedback.pointsAwarded > 0 && (
                        <span key={`a${beat}`} className="score-award" aria-hidden="true">
                            +{feedback.pointsAwarded}
                        </span>
                    )}
                </span>

                <button
                    className="button ghost small"
                    onClick={() => void handlePause()}
                    disabled={busy || feedback !== null}
                >
                    Pause
                </button>
            </header>

            <RoundProgress
                current={question.questionNumber}
                total={question.totalQuestions}
            />

            {/*
             * NO CLOCK ON THE OPENING BEATS.
             *
             * Deliberately renders nothing rather than a paused or full timer:
             * a countdown sitting there still tells a learner they are being
             * measured, which is the whole reason the opening is untimed. The
             * server decides which beats these are -- the client only honours
             * a null deadline.
             */}
            {/* A relaxed run says so once, on its intro: repeating "no timer" on
                all ten questions was noise. An untimed opening beat inside a
                timed run still says why the clock is missing. */}
            {question.deadlineAt === null ? (
                !question.relaxed && <p className="untimed-note">No timer on this one: take your time.</p>
            ) : (
                <Countdown
                    deadlineAt={question.deadlineAt}
                    totalMs={QUESTION_TIME_LIMIT_MS}
                    onExpire={onExpire}
                />
            )}

            {/* Keyed on the question, so React remounts it and the entrance
                animation replays without any state to reset. `leaving` drives the
                exit. Only opacity and transform move, so neither can reflow the
                page mid-answer. */}
            <div
                key={question.sessionQuestionId}
                className={`play-stage${leaving ? " leaving" : ""}`}
            >
                {(() => {
                    const { question: ask, code } = splitPrompt(question.prompt);

                    return (
                        <>
                            {/* THE RESERVED BEAT, MADE VISIBLE.
                                FOCUS_SLOTS has reserved two beats for the
                                learner's current concept since Phase 4B, and
                                nothing said so -- the game asked about the
                                thing they were studying and they had no way to
                                know. One line, in the game's own voice, above
                                the question. Deliberately not a card, not a
                                panel, and not on the other eight beats: a
                                marker that appears every time marks nothing. */}
                            {question.practisingNow && (
                                <p className="ask-practising">
                                    <span className="ask-practising-dot" aria-hidden="true" />
                                    Practicing{" "}
                                    <strong>{question.practisingNow.conceptName}</strong>
                                </p>
                            )}

                            {/* The question is a question. It reads in the UI face,
                                at reading size -- monospace was making prose look
                                like output the player had to parse. */}
                            <h1 className="ask">{ask}</h1>
                            {code && <pre className="prompt"><HighlightedCode code={code} /></pre>}
                        </>
                    );
                })()}

                {question.challengeType === "complete-code" ? (
                    <Assembly
                        question={question}
                        placed={placed}
                        locked={busy || leaving || feedback !== null}
                        onPlace={(id) => setPlaced((ids) => [...ids, id])}
                        onRemove={(at) => setPlaced((ids) => ids.filter((_, i) => i !== at))}
                        onSubmit={() => void submitAssembly()}
                    />
                ) : (
                <ul className={`options${feedback?.outcome === "timed_out" ? " lapsed" : ""}`}>
                    {question.options.map((option, index) => {
                        const state = optionStateFor(feedback, option);
                        const glyph = OPTION_GLYPH[state];
                        const struck = !feedback && (question.struckOptionIds ?? []).includes(option.id);
                        const picked = !feedback && pickedId === option.id;

                        return (
                            <li key={option.id}>
                                <button
                                    className={`option${state ? ` ${state}` : ""}${struck ? " struck" : ""}${picked ? " picked" : ""}`}
                                    onClick={() => void submit(option.id)}
                                    disabled={busy || leaving || feedback !== null || struck}
                                    aria-label={struck ? `${option.text}, ruled out by a hint` : undefined}
                                >
                                    <kbd>{index + 1}</kbd>
                                    <span className="option-text">{option.text}</span>
                                    {glyph && (
                                        <span className="option-glyph" aria-hidden="true">
                                            {glyph}
                                        </span>
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ul>
                )}

                {/* THE HINT: rules out a wrong answer, server-decided, at a
                    stated cost -- a correct answer then scores half (50) with
                    no speed bonus. XP is unchanged. Not on assembly questions. */}
                {question.challengeType !== "complete-code" &&
                    !feedback &&
                    ((question.hintsLeft ?? 0) > 0 || (question.struckOptionIds ?? []).length > 0) && (
                        <div className="hint-row">
                            <button
                                type="button"
                                className="button ghost small hint-button"
                                disabled={busy || hinting || (question.hintsLeft ?? 0) === 0}
                                onClick={() => void takeHint()}
                            >
                                {(question.struckOptionIds ?? []).length === 0
                                    ? "Hint: rule out a wrong answer"
                                    : (question.hintsLeft ?? 0) > 0
                                      ? "Rule out another"
                                      : "No hints left"}
                            </button>
                            <span className="hint-cost">
                                {(question.struckOptionIds ?? []).length === 0
                                    ? "A correct answer then scores half."
                                    : "Hint used: a correct answer scores half."}
                            </span>
                        </div>
                    )}
            </div>

            <div className="feedback" role="status">
                {feedback?.outcome === "correct" && (
                    <p className="tag correct">
                        Correct · +{feedback.pointsAwarded}
                        {(question.struckOptionIds ?? []).length > 0 && " (hint)"}
                    </p>
                )}
                {feedback?.outcome === "incorrect" && (
                    <p className="tag incorrect">Not quite: {feedback.correctOption}</p>
                )}
                {/* The answer is named only when the server sent it. The fallback
                    timeout path learns of the lapse from GET /api/sessions/current,
                    whose response does not carry it, and naming one would mean
                    inventing it. */}
                {feedback?.outcome === "timed_out" && (
                    <p className="tag timeout lapsed-tag">
                        {feedback.correctOption
                            ? `Time\u2019s up: the answer was ${feedback.correctOption}`
                            : "Time’s up"}
                    </p>
                )}
                {/* The reason, when the question carries one. This is the whole
                    point of the bank: a player who got it wrong should leave the
                    round knowing something they did not know going in. */}
                {/* An assembly answer is a sequence, so "not quite -- X" does not
                    tell the player much. Showing both rows and marking where they
                    first diverge names the one token that cost them the answer. */}
                {/* Not on a timeout: nothing was submitted, so there is no
                    "you built" to set beside the answer. */}
                {feedback && feedback.outcome !== "timed_out" && question.challengeType === "complete-code" && (
                    <AssemblyVerdict
                        built={placed.map((id) => question.options.find((o) => o.id === id)?.text ?? "")}
                        correct={feedback.correctOption}
                    />
                )}
                {feedback?.explanation && (
                    <Explanation className="feedback-why" text={feedback.explanation} />
                )}
                {pendingAdvance && (
                    <button type="button" ref={nextRef} className="button primary next-beat" onClick={advance}>
                        {pendingAdvance.complete ? "See results" : "Next"}
                        <span className="next-hint">Enter</span>
                    </button>
                )}
            </div>
        </section>
    );
}

/**
 * The Learn Beat for a concept with no hand-written beat: the first worked
 * example from the concept's own lesson.
 *
 * The beat used to fall back to the concept's one-line meaning alone -- a name
 * and a sentence, with no code -- so the "see it" step of understand, see, try
 * was missing for every concept but the few with an authored beat. Every lesson
 * already opens with a worked example and its real output, written for exactly
 * this learner at exactly this point; the beat shows that. A concept without a
 * lesson keeps the meaning on its own, as before.
 */
function beatFromLesson(introduction: {
    conceptSlug: string;
    conceptName: string;
    topicSlug: string;
    meaning: string;
}): LearnBeat {
    const lesson = lessonFor(introduction.conceptSlug);
    const example = lesson?.teach.find((block) => block.code.trim() !== "");
    return {
        topic: introduction.topicSlug,
        title: introduction.conceptName,
        code: example?.code ?? "",
        output: example?.output ?? "",
        // The lesson's "notice" before the curriculum's one-line meaning: the
        // notice is written for this learner at this point, while the meaning
        // is a definition and can use words not taught yet ("its arguments").
        rule: plainIdea(introduction.conceptSlug, introduction.meaning),
        note: example?.note
    };
}
