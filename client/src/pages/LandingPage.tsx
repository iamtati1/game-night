import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import { GameCard } from "../components/GameCard.js";
import { JoltLogo } from "../components/JoltLogo.js";
import { LIVE_GAMES, UPCOMING } from "../games/catalog.js";

interface ResumableRow {
    game: { slug: string };
    unitsDone: number;
    unitsTotal: number;
    score: number;
}

interface StatsResponse {
    totals: { gamesCompleted: number; totalXp: number; totalScore: number };
}

const LOOP = [
    { step: "Pick", copy: "Choose a challenge." },
    { step: "Play", copy: "Decide under pressure." },
    { step: "See", copy: "Know instantly how you did." },
    { step: "Again", copy: "Beat the last run." }
];

export function LandingPage() {
    const { user, loading } = useAuth();
    const [resumable, setResumable] = useState<ResumableRow[]>([]);
    const [stats, setStats] = useState<StatsResponse | null>(null);

    // Both of these are real endpoints returning this player's real numbers. When
    // signed out, or if either call fails, the sections simply do not render --
    // an empty state beats an invented one.
    useEffect(() => {
        if (!user) {
            setResumable([]);
            setStats(null);
            return;
        }

        let active = true;

        void api
            .get<{ sessions: ResumableRow[] }>("/api/me/sessions/resumable")
            .then((d) => active && setResumable(d.sessions))
            .catch(() => undefined);

        void api
            .get<StatsResponse>("/api/users/me/stats")
            .then((d) => active && setStats(d))
            .catch(() => undefined);

        return () => {
            active = false;
        };
    }, [user]);

    const resumeFor = (slug: string) => resumable.find((r) => r.game.slug === slug) ?? null;
    const played = stats ? stats.totals.gamesCompleted : 0;

    return (
        <div className="landing">
            {/* ---------------------------------------------------------- hero -- */}
            <section className="hero">
                <div className="hero-copy">
                    {/* The wordmark is the anchor, not a caption. It is the largest
                        thing on the page and the tagline steps down under it, so the
                        first thing read is the product's name rather than a slogan
                        that could belong to anything. */}
                    <h1 className="hero-brand">
                        <span className="hero-spark" aria-hidden="true">
                            <JoltLogo markOnly />
                        </span>
                        JOLT
                    </h1>

                    <p className="hero-title">
                        <span className="line">Think fast.</span>
                        <span className="line accentuate">Play again.</span>
                    </p>

                    <p className="hero-lede">
                        Jolt is a collection of short challenges built to test how you think,
                        react and solve. Pick one. You&rsquo;ll know in a minute how you did.
                    </p>

                    <div className="hero-cta">
                        <a className="button primary big" href="#games">
                            Play Jolt
                        </a>
                        {!loading && !user && (
                            <Link className="button ghost big" to="/register">
                                Create an account
                            </Link>
                        )}
                        {user && (
                            <Link className="button ghost big" to="/history">
                                Your runs
                            </Link>
                        )}
                    </div>

                    {/* Real totals only. A player with nothing yet gets an invitation
                        rather than a row of zeroes -- an empty dashboard on first visit
                        reads as "you have failed to start", which is the opposite of
                        what this page is for. */}
                    {stats && (
                        <div className={`your-jolt${played === 0 ? " is-empty" : ""}`}>
                            <span className="your-jolt-label">
                                {played === 0 ? "No runs yet" : "Your Jolt"}
                            </span>

                            {played === 0 ? (
                                <p className="your-jolt-invite">Your first run is waiting.</p>
                            ) : (
                                <p className="your-jolt-figures">
                                    <span>
                                        <strong>{played}</strong>
                                        {played === 1 ? "run" : "runs"}
                                    </span>
                                    <span>
                                        <strong>{stats.totals.totalXp}</strong>XP
                                    </span>
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Fragments of the two real games, stacked and offset. The hero shows
                    what you are about to play rather than an abstract illustration. */}
                <div className="hero-art" aria-hidden="true">
                    <div className="art-card art-blitz">
                        <span className="art-label">Code Blitz</span>
                        <span className="art-bar" />
                        <code>console.log([1,2] + [3,4])</code>
                        <span className="art-row is-hit">&quot;1,23,4&quot;</span>
                        <span className="art-row">[1, 2, 3, 4]</span>
                    </div>

                    <div className="art-card art-flush">
                        <span className="art-label">Flush</span>
                        <ol className="art-console">
                            <li className="on">sync</li>
                            <li />
                            <li />
                        </ol>
                        <span className="art-chips">
                            <i>timeout</i>
                            <i>promise</i>
                        </span>
                    </div>

                    <span className="art-score">
                        +150<span className="art-score-label">pts</span>
                    </span>
                </div>
            </section>

            {/* --------------------------------------------------------- games -- */}
            <section className="section" id="games">
                <header className="section-head">
                    <h2>Pick your Jolt.</h2>
                    <p>Two live now. Each one is a different way to be wrong.</p>
                </header>

                <ul className="game-grid">
                    {LIVE_GAMES.map((game) => (
                        <GameCard key={game.slug} game={game} resumable={resumeFor(game.slug)} />
                    ))}
                </ul>
            </section>

            {/* ---------------------------------------- different instincts -- */}
            <section className="section">
                <header className="section-head">
                    <h2>Different games. Same goal.</h2>
                    <p>
                        Think faster. Notice more. Solve better. Each game goes after a
                        different instinct, so getting good at one will not carry you
                        through the next.
                    </p>
                </header>

                {/* A list, not another row of cards. Three card grids in a row would
                    make the page read as one repeating module. */}
                <dl className="instincts">
                    {[...LIVE_GAMES, ...UPCOMING].map((game) => (
                        <div key={game.slug} style={{ ["--row-accent" as string]: game.accent }}>
                            <dt>
                                {game.name}
                                {game.status === "soon" && <span className="soon-tag">Soon</span>}
                            </dt>
                            <dd>{game.instinct}</dd>
                        </div>
                    ))}
                </dl>
            </section>

            {/* ------------------------------------------------------ the loop -- */}
            <section className="section">
                <header className="section-head">
                    <h2>Not a course. Not a quiz.</h2>
                    <p>
                        No syllabus, nothing to complete. A run takes a couple of minutes,
                        shows you exactly where you went wrong, and hands you the chance to
                        go again.
                    </p>
                </header>

                <ol className="loop">
                    {LOOP.map((item, i) => (
                        <li key={item.step}>
                            <span className="loop-n">{String(i + 1).padStart(2, "0")}</span>
                            <h3>{item.step}</h3>
                            <p>{item.copy}</p>
                        </li>
                    ))}
                    {/* Closes the loop visually: the fourth step points back at the first. */}
                    <li className="loop-back" aria-hidden="true">
                        <span>Go again</span>
                    </li>
                </ol>
            </section>

            {/* -------------------------------------------------------- coming -- */}
            {/* Deliberately chips rather than cards. Full cards gave unbuilt games the
                same visual weight as the two you can actually play, which is the one
                thing a roadmap section must never do. */}
            <section className="section soon-section">
                <header className="section-head">
                    <h2>More Jolts.</h2>
                    <p>Not built yet — here so you know where this is going.</p>
                </header>

                <ul className="soon-list">
                    {UPCOMING.map((game) => (
                        <li
                            key={game.slug}
                            className="soon-chip"
                            style={{ ["--chip-accent" as string]: game.accent }}
                        >
                            <span className="soon-chip-name">{game.name}</span>
                            <span className="soon-chip-instinct">{game.instinct}</span>
                        </li>
                    ))}
                </ul>
            </section>

            {/* ----------------------------------------------------------- cta -- */}
            <section className="closer">
                <p className="closer-kicker">One more?</p>
                <h2>Pick a challenge and see what you&rsquo;ve got.</h2>
                <a className="button primary big" href="#games">
                    Play Jolt
                </a>
            </section>
        </div>
    );
}
