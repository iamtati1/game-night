import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client.js";
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
 */
export function PracticePage() {
    const { concept } = useParams<{ concept: string }>();
    const practice = practiceFor(concept ?? null);

    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);

    const finish = useCallback(
        async (neededRetry: boolean) => {
            if (!practice) return;

            setBusy(true);

            try {
                await api.post(`/api/curriculum/concepts/${practice.concept}/demonstrate`, {
                    neededRetry,
                    // The rung this is evidence of. Taken from the last
                    // movement, which is the deepest thing they did.
                    demand: practice.movements[practice.movements.length - 1]!.demand
                });
            } catch {
                // They still did the work. Losing the record is worth a silent
                // retry next time, not an error page over finished practice.
            }

            setDone(true);
            setBusy(false);
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
