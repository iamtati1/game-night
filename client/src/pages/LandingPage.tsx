import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import type { JourneyPathResponse, ResumableResponse, ResumableSession } from "../api/types.js";
import type { Encounter } from "../api/encounter.js";
import { useAuth } from "../auth/AuthContext.js";
import { GameCard } from "../components/GameCard.js";
import { JoltLogo } from "../components/JoltLogo.js";
import { LIVE_GAMES } from "../games/catalog.js";
import { PlayFocus } from "../components/PlayFocus.js";

interface StatsResponse {
    totals: { gamesCompleted: number; totalXp: number; totalScore: number };
}

/**
 * The library.
 *
 * Everything that explained Jolt rather than showing it has been removed: the
 * instinct table, the four-step loop, the roadmap and the closing pitch. A player
 * arriving here should see games, not an argument for games -- the argument is
 * the games.
 *
 * WHAT IT NOW KNOWS. The grid is unchanged, and above it sits what the learner is
 * actually working on -- see PlayFocus. The page used to be the one place in Jolt
 * that had forgotten the learner was learning something; a signed-in player
 * arrived here from a concept and was asked to pick a game by name. Both of the
 * inputs are existing curriculum endpoints and both are per-learner, so nothing
 * here is cached across accounts and nothing is decided on the client.
 */
export function LandingPage() {
    const { user, loading } = useAuth();
    const [resumable, setResumable] = useState<ResumableSession[]>([]);
    const [stats, setStats] = useState<StatsResponse | null>(null);
    /* The curriculum half. Both reset to null when the user changes, so one
       learner's position can never be shown to the next one. */
    const [path, setPath] = useState<JourneyPathResponse | null>(null);
    const [encounter, setEncounter] = useState<Encounter | null>(null);

    // Both are real endpoints returning this player's real numbers. Signed out,
    // or on failure, the sections simply do not render.
    useEffect(() => {
        if (!user) {
            setResumable([]);
            setStats(null);
            setPath(null);
            setEncounter(null);
            return;
        }

        let active = true;

        void api
            .get<ResumableResponse>("/api/me/sessions/resumable")
            .then((d) => active && setResumable(d.sessions))
            .catch(() => undefined);

        void api
            .get<StatsResponse>("/api/users/me/stats")
            .then((d) => active && setStats(d))
            .catch(() => undefined);

        /* The current concept, then what can actually play it. Sequential
           because the second request is addressed by the first's answer --
           there is no endpoint that returns both, and inventing one would be a
           second way to ask a question the curriculum already answers. */
        void api
            .get<JourneyPathResponse>("/api/curriculum/path")
            .then(async (data) => {
                if (!active) return;

                setPath(data);

                if (!data.current) {
                    setEncounter(null);
                    return;
                }

                const view = await api.get<Encounter>(
                    `/api/curriculum/concepts/${data.current.slug}/encounter`
                );

                if (active) setEncounter(view);
            })
            .catch(() => undefined);

        return () => {
            active = false;
        };
    }, [user]);

    const resumeFor = (slug: string) => resumable.find((r) => r.game.slug === slug) ?? null;
    const played = stats?.totals.gamesCompleted ?? 0;

    return (
        <div className="landing">

            {/* Compact on purpose: the wordmark, four words, and then the games.
                Anything taller pushes the only interactive thing below the fold. */}
            <header className="masthead">
                <h1 className="hero-brand">
                    <span className="hero-spark" aria-hidden="true">
                        <JoltLogo markOnly />
                    </span>
                    JOLT
                </h1>

                <p className="masthead-tagline">Play. Get better.</p>

                {stats && played > 0 && (
                    <p className="masthead-stats">
                        <strong>{played}</strong> {played === 1 ? "run" : "runs"}
                        <span className="dot" />
                        <strong>{stats.totals.totalXp}</strong> XP
                    </p>
                )}

                {!loading && !user && (
                    <p className="masthead-note">
                        <Link to="/register">Create an account</Link> to keep your scores.
                    </p>
                )}
            </header>

            {user && <PlayFocus path={path} encounter={encounter} />}

            <ul className="game-grid" id="games">
                {LIVE_GAMES.map((game) => (
                    <GameCard key={game.slug} game={game} resumable={resumeFor(game.slug)} />
                ))}
            </ul>
        </div>
    );
}
