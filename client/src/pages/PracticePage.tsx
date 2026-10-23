import { useCallback, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import { MissionScene } from "../components/MissionScene.js";
import { ConceptComplete } from "../components/ConceptComplete.js";
import { practiceFor } from "../games/practice.js";

import { ACTION } from "../vocabulary.js";
/**
 * Write the thing you were just shown.
 *
 * The stage between meeting a concept and being asked to predict what it does.
 * It exists because the curriculum declared `produce` and `apply` on six
 * Variables concepts and not one of them had anything playable: the learner
 * went straight from a lesson to a prediction question, and was never asked to
 * write a line of the thing they had just been taught.
 *
 * REUSES MissionScene ENTIRELY. A practice and a mission are the same
 * interaction -- type, run, see, be told the one next thing to try -- and they
 * differ in scope and in when they appear, which are content decisions. Giving
 * practice its own player would be a second implementation of the same screen.
 *
 * RECORDS THE RUNG IT IS EVIDENCE OF. The demonstration carries `demand`, which
 * is what concept_demonstrations.demand_id was added for and what nothing had
 * consumed until now. A lesson demonstration says "they met this"; this one
 * says what they can do with it.
 *
 * COMPLETE ONLY WHEN THE SERVER SAYS SO. This used to swallow any failure and
 * show the completion screen anyway -- "+25", "You can now", Continue to the
 * next concept -- over a demonstration the server had refused (409 until the
 * concept's practice stops are cleared). Now a refusal is said plainly, with
 * the way to the concept's practice, and a failure to reach the server offers
 * to send the same record again. Re-sending is safe: a concept already
 * demonstrated answers 200 and records nothing new.
 */

/** Why the record was not made, and whether sending it again could help. */
interface NotRecorded {
    message: string;
    retryable: boolean;
}

function notRecorded(err: unknown): NotRecorded {
    // The server answered and said no (not open, evidence missing): sending
    // the same thing again would get the same answer.
    if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        return { message: err.message, retryable: false };
    }

    // No answer, or the server failing: the practice is done, only the record
    // is missing.
    return {
        message: "Your practice could not be saved just now. Nothing is lost: try again in a moment.",
        retryable: true
    };
}
export function PracticePage() {
    const { concept } = useParams<{ concept: string }>();
    const practice = practiceFor(concept ?? null);

    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [failed, setFailed] = useState<NotRecorded | null>(null);
    /** One request at a time: a second click while one is in flight sends nothing. */
    const sending = useRef(false);
    /** What the practice finished with, so a retry sends the same record. */
    const retried = useRef(false);

    const finish = useCallback(
        async (neededRetry: boolean) => {
            if (!practice || sending.current) return;

            sending.current = true;
            retried.current = neededRetry;
            // `failed` is left as it is: on a retry the panel stays up (saying
            // "Saving…") rather than remounting the practice at its first step.
            setBusy(true);

            try {
                await api.post(`/api/curriculum/concepts/${practice.concept}/demonstrate`, {
                    neededRetry,
                    // The rung this is evidence of. Taken from the last
                    // movement, which is the deepest thing they did.
                    demand: practice.movements[practice.movements.length - 1]!.demand
                });
                setDone(true);
            } catch (err) {
                setFailed(notRecorded(err));
            } finally {
                sending.current = false;
                setBusy(false);
            }
        },
        [practice]
    );

    if (!practice) {
        return (
            <section className="panel narrow">
                <p className="muted">There is nothing to practise there yet.</p>
                <Link className="button primary" to="/journey">
                    {ACTION.seeJourney}
                </Link>
            </section>
        );
    }

    if (done) return <ConceptComplete concept={practice.concept} />;

    if (failed) {
        return (
            <section className="panel narrow">
                <h1>Not recorded yet</h1>
                <p className="form-error" role="alert">
                    {failed.message}
                </p>
                <div className="checkpoint-actions">
                    {failed.retryable ? (
                        <button
                            className="button primary"
                            disabled={busy}
                            onClick={() => void finish(retried.current)}
                        >
                            {busy ? "Saving…" : "Try again"}
                        </button>
                    ) : (
                        <Link className="button primary" to={`/concept/${practice.concept}`}>
                            Go to the practice
                        </Link>
                    )}
                    <Link className="button ghost" to="/journey">
                        {ACTION.seeJourney}
                    </Link>
                </div>
            </section>
        );
    }

    return (
        <MissionScene
            mission={{
                topic: "variables",
                title: practice.title,
                place: "Practice",
                capability: "",
                movements: practice.movements
            }}
            busy={busy}
            onFinish={(retried) => void finish(retried)}
        />
    );
}
