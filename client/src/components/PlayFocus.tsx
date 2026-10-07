import { Link } from "react-router-dom";
import { CODE_BLITZ, BUG_HUNT, GAMES } from "../games/catalog.js";
import type { Encounter } from "../api/encounter.js";
import type { JourneyPathResponse } from "../api/types.js";

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
 * route is the concept itself, and that is what this leads with. The two games
 * are described by the curriculum relationship they genuinely have -- both are
 * already gated to what the learner has reached -- and nothing more.
 */

const nameOf = (slug: string) => GAMES.find((g) => g.slug === slug)?.name ?? slug;

export function PlayFocus({
    path,
    encounter
}: {
    path: JourneyPathResponse | null;
    /** Null while it loads, or when the current concept could not be read. */
    encounter: Encounter | null;
}) {
    const current = path?.current ?? null;

    /* Nothing to say yet, or a learner who has finished everything reachable.
       Silence is right here -- an empty band would be worse than no band. */
    if (!current) return null;

    const topicName = path?.topics.find((t) => t.slug === current.topic)?.name ?? null;

    /* What is actually left on this concept, counted the way the concept page
       counts it: a rung the curriculum declares but nothing fills is not
       something the learner can go and do. */
    const playable = (encounter?.rungs ?? []).filter((r) => r.options.length > 0);
    const left = playable.filter((r) => !r.cleared).length;

    const routes = [
        /* The concept-targeted route, and the only one that can be. */
        playable.length > 0 && {
            key: "concept",
            name: "Keep going",
            to: `/concept/${current.slug}`,
            why:
                left === 0
                    ? "every stop on this one is behind you"
                    : `the ${left === 1 ? "last stop" : `${left} stops`} left on this concept`
        },
        /* Curriculum-aware, but not aimable at one concept. Described as what
           they are: both deal only from what the learner has reached. */
        {
            key: CODE_BLITZ,
            name: nameOf(CODE_BLITZ),
            to: `/${CODE_BLITZ}`,
            why: "opens with what the curriculum says is next, then deals against the clock"
        },
        {
            key: BUG_HUNT,
            name: nameOf(BUG_HUNT),
            to: `/${BUG_HUNT}`,
            why: "broken code, drawn from the concepts you have reached"
        }
    ].filter((r): r is { key: string; name: string; to: string; why: string } => Boolean(r));

    return (
        <section className="play-focus" aria-labelledby="play-focus-heading">
            <p className="play-focus-label">You are learning</p>

            <h2 className="play-focus-concept" id="play-focus-heading">
                <Link to={`/concept/${current.slug}`}>{current.name}</Link>
            </h2>

            {topicName && <p className="play-focus-topic">{topicName}</p>}

            <ul className="play-focus-routes">
                {routes.map((route) => (
                    <li key={route.key}>
                        <Link className="play-focus-route" to={route.to}>
                            <span className="play-focus-route-name">{route.name}</span>
                            <span className="play-focus-route-why">{route.why}</span>
                        </Link>
                    </li>
                ))}
            </ul>

            {/* The honest branch. A concept whose rungs are declared but not yet
                filled has nothing to go and do there, and saying so beats a
                "Keep going" that leads to an empty page. */}
            {encounter && playable.length === 0 && (
                <p className="play-focus-none">
                    There is nothing to play on this one yet — it is taught in{" "}
                    <Link to={`/concept/${current.slug}`}>the concept itself</Link>.
                </p>
            )}
        </section>
    );
}
