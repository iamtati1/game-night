import { Ship } from "../world/Ship.js";
import { rungLabel, type EncounterRung } from "../api/encounter.js";

/**
 * THE CONCEPT, AS A SHORT ROUTE YOU FLY.
 *
 * The gap this closes: until now `EncounterPage` imported nothing from the
 * world layer. The Journey map is a route through a star system with the
 * learner's craft parked on it, and the moment the learner actually started
 * LEARNING something they dropped out of that world into a page of buttons.
 * The game was beside the course rather than the way through it.
 *
 * So the rungs of a concept are stations on a leg of that same route. The
 * craft sits at the one in front of you, the stations behind are lit, the ones
 * ahead are dim, and clearing a rung flies you to the next. Nothing about
 * progression changed to make this work -- `cleared` already came back from
 * the server for every rung, and this reads it.
 *
 * WHAT IT DELIBERATELY DOES NOT SHOW. No score, no timer, no percentage, no
 * attempt count, no streak. A learner who is stuck should be looking at the
 * question and the sentence telling them what to try next, not at something
 * measuring them. The route answers one question -- "where am I in this
 * concept, and what is left?" -- and nothing else.
 *
 * STATION NAMES ARE THE LEARNER'S WORDS. "Spot it", "Write it", "Find the
 * problem" -- the same labels the rung header uses, from the same function. A
 * beginner never has to know what `recognise` or `produce` mean to understand
 * what the next station is asking of them.
 *
 * NOT A CANVAS, for the reason WorldPage says it: this is an ordered list with
 * real text in curriculum order, that happens to be positioned. A spatial
 * interface is the easiest thing here to make unusable with a keyboard, and
 * the cheapest moment to prevent that is while writing it.
 */
export function ConceptRun({ rungs }: { rungs: readonly EncounterRung[] }) {
    if (rungs.length === 0) return null;

    const playable = rungs.filter((r) => r.options.length > 0);

    if (playable.length === 0) return null;

    const done = playable.filter((r) => r.cleared).length;
    const atEnd = done === playable.length;
    /* The station the craft is parked at: the first unfinished one, or the
       last if there are none left. */
    const here = atEnd ? playable.length - 1 : done;

    return (
        <div className="run">
            <p className="run-caption">
                {atEnd
                    ? "Every stop on this one is behind you."
                    : done === 0
                      ? `${playable.length} stops on this concept.`
                      : `${playable.length - done} to go.`}
            </p>

            <ol className="run-route">
                {playable.map((rung, i) => {
                    const state = rung.cleared ? "done" : i === here ? "here" : "ahead";

                    return (
                        <li key={rung.demandSlug} className={`run-stop is-${state}`}>
                            <span className="run-mark" aria-hidden="true" />

                            <span className="run-name">{rungLabel(rung.demandSlug)}</span>

                            {i === here && (
                                <span className="run-ship">
                                    <Ship
                                        size={26}
                                        rotate={90}
                                        state={atEnd ? "departing" : "learning"}
                                        label={
                                            atEnd
                                                ? "Your craft, ready to move on"
                                                : "Your craft, here"
                                        }
                                    />
                                </span>
                            )}

                            {/* The position is already readable from the names
                                and the craft's label, so the marks do not
                                repeat it one element at a time. */}
                            <span className="visually-hidden">
                                {rung.cleared ? " — done" : i === here ? " — you are here" : ""}
                            </span>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
