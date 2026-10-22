import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { GameMotif } from "../games/catalog.js";
import { recommendedIsland, type Island, type IslandState } from "../games/islands.js";

/**
 * THE GAMES, AS FIVE ISLANDS.
 *
 * One shared visual language -- a ring of water, a sand base, a landform in the
 * game's accent -- with a different landform per game, so each has its own
 * personality without the five looking like five different apps:
 *
 *     Code Blitz   a jagged peak      quick, sharp
 *     Flush        stacked terraces   things in order
 *     Reaction     a volcano          wait for it... then go
 *     Memory       standing stones    a sequence to hold
 *     Bug Hunt     a cove and beacon  something to find
 *
 * Selecting an island opens one compact panel below the map: name, what it is,
 * whether it is open and whether it counts, and one action. The recommended
 * island is selected to begin with, so the obvious next action is already on
 * screen. An island not yet open is drawn in mist and still opens its panel,
 * which says what opens it. Availability is never colour alone: every island
 * says its state in words.
 */

const STATE_WORD: Record<IslandState, string | null> = {
    resume: "Run in progress",
    ready: "Open",
    misty: "In the mist: not open yet",
    unknown: null
};

export function IslandMap({ islands }: { islands: Island[] }) {
    const recommended = recommendedIsland(islands);
    const [selected, setSelected] = useState<string>(recommended?.slug ?? islands[0]?.game.slug ?? "");
    const chosen = islands.find((i) => i.game.slug === selected) ?? null;
    const panelRef = useRef<HTMLDivElement>(null);

    /* On a phone the panel can sit below the fold, so a tap would seem to do
       nothing. Bring it into view -- only as far as needed, and without a
       smooth scroll for anyone who asked for less motion. */
    const choose = (slug: string) => {
        setSelected(slug);
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        window.requestAnimationFrame(() =>
            panelRef.current?.scrollIntoView?.({ block: "nearest", behavior: reduced ? "auto" : "smooth" })
        );
    };

    return (
        <section className="islands">
            <ul className="island-sea" aria-label="Games">
                {islands.map((island) => {
                    const isRecommended = recommended?.slug === island.game.slug;
                    const word = STATE_WORD[island.state];

                    return (
                        <li key={island.game.slug} className={`island-spot is-${island.game.motif}`}>
                            <button
                                type="button"
                                className={`island is-${island.state}${selected === island.game.slug ? " is-selected" : ""}${
                                    isRecommended ? " is-recommended" : ""
                                }`}
                                style={{ "--island": island.game.accent } as React.CSSProperties}
                                aria-pressed={selected === island.game.slug}
                                aria-controls="island-panel"
                                onClick={() => choose(island.game.slug)}
                            >
                                {isRecommended && <span className="island-flag">Recommended</span>}
                                <IslandArt motif={island.game.motif} />
                                <span className="island-name">{island.game.name}</span>
                                {word && <span className="island-state">{word}</span>}
                            </button>
                        </li>
                    );
                })}
            </ul>

            <div id="island-panel" className="island-panel-region" aria-live="polite" ref={panelRef}>
                {chosen && (
                    <IslandPanel
                        island={chosen}
                        why={recommended?.slug === chosen.game.slug ? recommended.why : null}
                    />
                )}
            </div>
        </section>
    );
}

function IslandPanel({ island, why }: { island: Island; why: string | null }) {
    const { game } = island;

    return (
        <article className={`island-panel is-${island.state}`} style={{ "--island": game.accent } as React.CSSProperties}>
            <p className="island-panel-eyebrow">
                {game.category}
                {why && <> · Recommended: {why.toLowerCase()}</>}
            </p>
            <h2 className="island-panel-name">{game.name}</h2>
            <p className="island-panel-hook">{game.hook}</p>

            {island.resume && (
                <p className="island-panel-resume">
                    {(game.unit ?? "Round")} {Math.min(island.resume.unitsDone + 1, island.resume.unitsTotal)} of{" "}
                    {island.resume.unitsTotal} · {island.resume.score} pts so far
                </p>
            )}

            {island.status && <p className={`island-panel-status is-${island.state}`}>{island.status}</p>}
            {island.counts !== null && (
                <p className="island-panel-counts">
                    {island.counts ? "Counts toward your journey." : "Just for fun: doesn’t count toward your course."}
                </p>
            )}

            <Link
                className={`button ${island.state === "misty" ? "ghost" : "primary"} big island-panel-action`}
                to={game.path}
                aria-label={island.actionLabel}
            >
                {island.action}
            </Link>
            <p className="island-panel-shape">{game.shape}</p>
        </article>
    );
}

/**
 * The island drawings. Decorative: every island's name and state are in text
 * beside it, so the art is hidden from screen readers.
 */
function IslandArt({ motif }: { motif: GameMotif }) {
    return (
        <svg className="island-art" viewBox="0 0 160 110" aria-hidden="true" focusable="false">
            {/* Water and sand: the same on every island. */}
            <ellipse className="island-water" cx="80" cy="86" rx="74" ry="18" />
            <ellipse className="island-sand" cx="80" cy="80" rx="58" ry="14" />
            {LANDFORMS[motif]}
        </svg>
    );
}

const LANDFORMS: Record<GameMotif, React.ReactNode> = {
    blitz: (
        <>
            <path className="island-land" d="M34 80 L58 40 L70 56 L86 18 L100 52 L112 38 L128 80 Z" />
            <path className="island-mark" d="M84 30 l-8 16 h8 l-6 14 l14-20 h-8 l6-10 Z" />
        </>
    ),
    flush: (
        <>
            <path className="island-land" d="M36 80 h88 v-12 h-10 v-12 h-12 v-12 h-14 v-10 h-16 v10 h-14 v12 h-12 v12 h-10 Z" />
            <path className="island-mark" d="M72 40 h16 M64 52 h32 M56 64 h48" />
        </>
    ),
    reaction: (
        <>
            <path className="island-land" d="M30 80 L66 34 h28 L130 80 Z" />
            <path className="island-mark" d="M80 30 v-14 M70 24 l-6-8 M90 24 l6-8" />
        </>
    ),
    memory: (
        <>
            <path className="island-land" d="M36 80 q44-34 88 0 Z" />
            <rect className="island-mark is-solid" x="52" y="44" width="12" height="26" rx="3" />
            <rect className="island-mark is-solid" x="74" y="34" width="12" height="36" rx="3" />
            <rect className="island-mark is-solid" x="96" y="46" width="12" height="24" rx="3" />
        </>
    ),
    bughunt: (
        <>
            <path className="island-land" d="M32 80 q12-30 40-30 q8-18 28-10 q24 8 28 40 Z" />
            <path className="island-mark" d="M110 50 v-26 M104 24 h12 M110 18 a4 4 0 1 0 0.01 0" />
        </>
    )
};
