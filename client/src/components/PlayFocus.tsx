import { Link } from "react-router-dom";
import { ACTION, STATE } from "../vocabulary.js";
import type { Encounter } from "../api/encounter.js";
import type { JourneyPathResponse } from "../api/types.js";
import { nextAction } from "../games/progression.js";

/**
 * WHAT TO PLAY FOR WHAT YOU ARE LEARNING.
 *
 * The gap this closes: `/play` was a flat grid of five cards and knew nothing
 * about the learner. Jolt knew exactly what they were working on -- the Home
 * page says it, the map says it, the encounter says it -- and the moment they
 * went to play, all of that was dropped and they picked a game by name. That is
 * the "two applications" seam.
 *
 * NO SECOND CURRICULUM, and no concept-selection logic here. Both inputs are
 * existing authenticated endpoints and both are decided server-side:
 *
 *   GET /api/curriculum/path                       -> `current`, the one concept
 *                                                     the learner is on
 *   GET /api/curriculum/concepts/:slug/encounter   -> that concept's rungs, and
 *                                                     what realises each one
 *
 * This component only reads them. It never picks a concept, never decides what
 * is reachable, and never sends anything.
 *
 * WHAT IS LEFT IS COUNTED, not assumed. A rung carries its own options, and a
 * rung with none is one the curriculum declares and nothing fills -- so it is
 * not something the learner can go and do. Only filled rungs are counted, which
 * is what keeps this truthful on half-built topics.
 *
 * HONEST ABOUT WHAT EACH ROUTE REALLY DOES, which is where the first draft of
 * this was wrong and worth recording. Linking Code Blitz with `?focus=<topic>`
 * looked like carrying context, but the dealer's focus enum is the NINE-unit
 * legacy taxonomy from migration 018 (`conditionals`, `async`, ...) while the
 * curriculum has sixteen topics (`values`, `operators`, `control-flow`, ...).
 * `?focus=values` is silently dropped -- the link would have looked targeted and
 * done nothing. Reproducing that enum here would also be a second source of
 * truth for it.
 *
 * They are also two different pools. A concept's `question` rungs are questions
 * tagged to its challenges and are played IN THE ENCOUNTER; Code Blitz deals
 * from the general pool by `questions.topic`. So the only concept-TARGETED
 * route is the concept itself, and it is the only one this band offers.
 */

/*
 * ONE PRIMARY ACTION, AND IT IS THE COURSE. UX audit: this band offered three
 * routes of equal weight -- Keep going, Code Blitz and Bug Hunt -- above five
 * equal game cards, so the course was one choice among eight. Bug Hunt in
 * particular was recommended to beginners it usually cannot deal a full run
 * to. The band now carries only the next step on the path; the games are all
 * still directly below it, as optional practice.
 */
export function PlayFocus({
    path,
    encounter
}: {
    path: JourneyPathResponse | null;
    /** Null while it loads, or when the current concept could not be read. */
    encounter: Encounter | null;
}) {
    /* The path's own next step. Nothing to say yet, or a learner who has
       finished everything reachable: silence, rather than an empty band. */
    const step = path ? nextAction(path) : null;

    if (!step) return null;

    /* A due checkpoint IS the next step, and the band used to vanish then. */
    if (step.kind === "checkpoint") {
        return (
            <section className="play-focus" aria-labelledby="play-focus-heading">
                <p className="play-focus-label">Next in your course</p>
                <h2 className="play-focus-concept" id="play-focus-heading">
                    {step.name}
                </h2>
                <Link className="button primary big" to={step.href}>
                    Take the checkpoint
                </Link>
            </section>
        );
    }

    const current = path!.current!;
    const topicName = path?.topics.find((t) => t.slug === current.topic)?.name ?? null;

    /* What is actually left on this concept, counted the way the concept page
       counts it: a rung the curriculum declares but nothing fills is not
       something the learner can go and do. */
    const playable = (encounter?.rungs ?? []).filter((r) => r.options.length > 0);
    const left = playable.filter((r) => !r.cleared).length;

    return (
        <section className="play-focus" aria-labelledby="play-focus-heading">
            <p className="play-focus-label">{STATE.here}</p>

            {/* Named, not linked: the button below is the one way in, so the
                name is not a second link to the same place. */}
            <h2 className="play-focus-concept" id="play-focus-heading">
                {current.name}
            </h2>

            {topicName && <p className="play-focus-topic">{topicName}</p>}

            {playable.length > 0 && (
                <>
                    <Link className="button primary big" to={step.href}>
                        {/* "Start", not "Continue", before anything is done --
                            the same rule Home uses. */}
                        {path && path.points.concepts === 0 && !path.topics.some((t) => t.state === "complete")
                            ? ACTION.startLearning
                            : ACTION.continueLearning}
                    </Link>
                    <p className="play-focus-route-why">
                        {left === 0
                            ? "every stop on this one is behind you"
                            : `the ${left === 1 ? "last stop" : `${left} stops`} left on this concept`}
                    </p>
                </>
            )}

            {/* The honest branch. A concept whose rungs are declared but not yet
                filled has nothing to go and do there, and saying so beats a
                button that leads to an empty page. */}
            {encounter && playable.length === 0 && (
                <p className="play-focus-none">
                    There is nothing to play on this one yet: it is taught in{" "}
                    <Link to={`/concept/${current.slug}`}>the concept itself</Link>.
                </p>
            )}
        </section>
    );
}
