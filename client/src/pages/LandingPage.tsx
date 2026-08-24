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
                    <p className="hero-eyebrow">
                        <JoltLogo markOnly /> Quick-fire challenges
                    </p>

                    <h1 className="hero-title">
                        <span className="line">Think fast.</span>
                        <span className="line accentuate">Play again.</span>
                    </h1>

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

                    {/* Real totals, only once there is something true to say. */}
                    {stats && played > 0 && (
                        <p className="hero-stats">
                            <strong>{played}</strong> {played === 1 ? "run" : "runs"} finished
                            <span className="dot" />
                            <strong>{stats.totals.totalXp}</strong> XP
                        </p>
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
                    <h2>Pick your challenge.</h2>
                    <p>Two live now. Each one is a different way to be wrong.</p>
                </header>

                <ul className="game-grid">
                    {LIVE_GAMES.map((game) => (
                        <GameCard key={game.slug} game={game} resumable={resumeFor(game.slug)} />
                    ))}
                </ul>
            </section>

            {/* ------------------------------------------------ what is jolt -- */}
            <section className="section">
                <header className="section-head">
                    <h2>Not a course. Not a quiz.</h2>
                    <p>
                        There is no syllabus and nothing to complete. A run takes a couple of
                        minutes, tells you exactly where you went wrong, and hands you the
                        chance to go again.
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
                </ol>
            </section>

            {/* -------------------------------------------------------- coming -- */}
            <section className="section">
                <header className="section-head">
                    <h2>The lineup is growing.</h2>
                    <p>Not built yet — here so you know where this is going.</p>
                </header>

                <ul className="game-grid soon-grid">
                    {UPCOMING.map((game) => (
                        <GameCard key={game.slug} game={game} />
                    ))}
                </ul>
            </section>

            {/* ----------------------------------------------------------- cta -- */}
            <section className="closer">
                <h2>One round. See what you&rsquo;ve got.</h2>
                <a className="button primary big" href="#games">
                    Pick a game
                </a>
            </section>
        </div>
    );
}
