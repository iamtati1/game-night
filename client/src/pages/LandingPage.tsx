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
import { gameStatuses, type BugHuntReadiness, type FlushReadiness } from "../games/gameStatus.js";

import { usePageTitle } from "../usePageTitle.js";
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
    usePageTitle("Games");
    const { user, loading } = useAuth();
    const [resumable, setResumable] = useState<ResumableSession[]>([]);
    const [stats, setStats] = useState<StatsResponse | null>(null);
    /* The curriculum half. Both reset to null when the user changes, so one
       learner's position can never be shown to the next one. */
    const [path, setPath] = useState<JourneyPathResponse | null>(null);
    const [encounter, setEncounter] = useState<Encounter | null>(null);
    /* What the two gated games would say if started now -- read-only, from
       the same function their start routes refuse on. Null until loaded, and
       left null on failure: a card says nothing rather than guess. */
    const [flushReady, setFlushReady] = useState<FlushReadiness | null>(null);
    const [huntReady, setHuntReady] = useState<BugHuntReadiness | null>(null);

    // Both are real endpoints returning this player's real numbers. Signed out,
    // or on failure, the sections simply do not render.
    useEffect(() => {
        if (!user) {
            setResumable([]);
            setStats(null);
            setPath(null);
            setEncounter(null);
            setFlushReady(null);
            setHuntReady(null);
            return;
        }

        let active = true;

        void api
            .get<FlushReadiness>("/api/flush/readiness")
            .then((d) => active && setFlushReady(d))
            .catch(() => undefined);

        void api
            .get<BugHuntReadiness>("/api/bug-hunt/readiness")
            .then((d) => active && setHuntReady(d))
            .catch(() => undefined);

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
    const statuses = user ? gameStatuses({ flush: flushReady, bugHunt: huntReady }) : null;
    const played = stats?.totals.gamesCompleted ?? 0;

    return (
        <div className="landing">

            {/* Compact on purpose: the page name, four words, and then the games.
                Anything taller pushes the games below the fold. */}
            <header className="masthead">
                {/* The page's own name. The JOLT wordmark is in the site header
                    already; repeating it here as the h1 left the page with no
                    heading that said what it was. The spark stays as branding. */}
                <h1 className="hero-brand" id="games-heading">
                    <span className="hero-spark" aria-hidden="true">
                        <JoltLogo markOnly />
                    </span>
                    Games
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

            {/* WHAT THE GAMES ARE FOR, in one line, then the games themselves
                -- first, so all five are found before anything else. Each card
                says whether it can be played now and whether it counts. */}
            {user && (
                <p className="practice-lede muted">
                    None of these is required. Each one says whether you can play it now, and whether it
                    counts toward your journey.
                </p>
            )}

            <ul className="game-grid" id="games" aria-labelledby="games-heading">
                {LIVE_GAMES.map((game) => (
                    <GameCard
                        key={game.slug}
                        game={game}
                        resumable={resumeFor(game.slug)}
                        status={statuses?.[game.slug] ?? null}
                    />
                ))}
            </ul>

            {/* The course, after the games: on this page the games are what
                was asked for, and Home already leads with the next lesson. */}
            {user && <PlayFocus path={path} encounter={encounter} />}
        </div>
    );
}
