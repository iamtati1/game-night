import { useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { JoltLogo } from "./components/JoltLogo.js";
import { Cosmos } from "./world/Cosmos.js";
import { Icon } from "./world/Icon.js";
import { useAuth } from "./auth/AuthContext.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import { HomePage } from "./pages/HomePage.js";
import { JourneyPage } from "./pages/JourneyPage.js";
import { PlaygroundPage } from "./pages/PlaygroundPage.js";
import { WorldPage } from "./pages/WorldPage.js";
import { PracticePage } from "./pages/PracticePage.js";
import { EncounterPage } from "./pages/EncounterPage.js";
import { LessonPage } from "./pages/LessonPage.js";
import { BugHuntPage } from "./pages/BugHuntPage.js";
import { BugHuntResultsPage } from "./pages/BugHuntResultsPage.js";
import { FlushPage } from "./pages/FlushPage.js";
import { FlushResultsPage } from "./pages/FlushResultsPage.js";
import { GamePage } from "./pages/GamePage.js";
import { MemoryPage } from "./pages/MemoryPage.js";
import { MemoryResultsPage } from "./pages/MemoryResultsPage.js";
import { ReactionPage } from "./pages/ReactionPage.js";
import { ReactionResultsPage } from "./pages/ReactionResultsPage.js";
import { HistoryPage } from "./pages/HistoryPage.js";
import { LandingPage } from "./pages/LandingPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { RegisterPage } from "./pages/RegisterPage.js";
import { ResultsPage } from "./pages/ResultsPage.js";

function Header() {
    const { user, loading, logout } = useAuth();
    const [loggingOut, setLoggingOut] = useState(false);
    const [failed, setFailed] = useState(false);

    /**
     * The rejection from logout() has to be caught somewhere. Left as
     * `void logout()` it became an unhandled promise rejection: the request
     * failed, the session stayed live on the server, and the player got no
     * indication either way -- the one outcome worse than a failed logout is a
     * silent one.
     */
    async function handleLogout() {
        setLoggingOut(true);
        setFailed(false);

        try {
            await logout();
        } catch {
            // Still signed in, so the nav stays and says why.
            setFailed(true);
        } finally {
            setLoggingOut(false);
        }
    }

    return (
        <header className="site-header">
            <Link className="brand" to="/">
                <JoltLogo />
            </Link>

            {/*
                Rendered in both states, which is the whole point.

                Gating the entire <nav> on `user` was the logout bug: signing out
                removed the navigation rather than swapping it. The masthead and
                the game cards stayed exactly where they were, so the only visible
                consequence of logging out was the top-right corner going blank --
                which reads as "nothing happened", not as "you are signed out".
                It also left no way back in, on any page.

                Held back until `loading` resolves so the first paint does not
                flash "Log in" at a player who is already signed in.
            */}
            {!loading && (
                <nav>
                    {user ? (
                        <>
                            {/* First in the nav on purpose: the journey is the
                                product, and the games are how it is practiced. */}
                            {/*
                                THREE AREAS, NOT FIVE DESTINATIONS.
                                
                                It was Home, Map, Play, Experiment and Log, all
                                at equal weight -- and three of those answered
                                the same question. Home is "where am I and what
                                is next", the Map is the same path drawn out,
                                and Home linked to both of the others, so the
                                navigation competed with the page it landed on.
                                A learner reading five equal words has to work
                                out what five things are before choosing one.

                                What is left is the three things a learner
                                actually does:

                                  Learn        the curriculum and where you are in it
                                  Play         the world and the games
                                  Experiment   free JavaScript, nothing marked

                                Learn points at Home rather than at the Map,
                                because Home answers "what now" with one lit
                                control and the Map is the whole route -- the
                                overview is a click deeper, where it belongs
                                for a beginner.

                                The Log did not disappear; it moved beside the
                                pilot below, with the account. It is a real
                                thing to want and it is not a fourth area.
                            */}
                            <Link to="/" aria-label="Learn">
                                <Icon name="map" />
                                <span className="nav-label">Learn</span>
                            </Link>
                            <Link to="/play" aria-label="Play">
                                <Icon name="play" />
                                <span className="nav-label">Play</span>
                            </Link>
                            <Link to="/experiment" aria-label="Experiment">
                                <Icon name="spark" />
                                <span className="nav-label">Experiment</span>
                            </Link>

                            {/* The pilot, set apart from the three areas by a
                                hairline: an identity is not somewhere you can
                                navigate to. The Log sits here too -- secondary
                                by placement rather than by being hidden. */}
                            <span className="nav-pilot">
                                <Link className="nav-aside" to="/history" aria-label="Log">
                                    <Icon name="log" size={16} />
                                    <span className="nav-label">Log</span>
                                </Link>
                                <span className="nav-avatar" aria-hidden="true">
                                    {user.username.slice(0, 1).toUpperCase()}
                                </span>
                                <span className="nav-name">{user.username}</span>
                            </span>
                            {failed && (
                                <span className="logout-error" role="alert">
                                    Could not log out — still signed in.
                                </span>
                            )}
                            <button
                                className="button ghost small"
                                disabled={loggingOut}
                                onClick={() => void handleLogout()}
                            >
                                {loggingOut ? "Logging out…" : "Log out"}
                            </button>
                        </>
                    ) : (
                        <>
                            <Link to="/login">Log in</Link>
                            <Link className="button primary small" to="/register">
                                Create account
                            </Link>
                        </>
                    )}
                </nav>
            )}
        </header>
    );
}

export default function App() {
    // Read once, at the top of the component, rather than inline in the JSX.
    // A hook buried in an attribute is legal but it hides the dependency.
    const { pathname } = useLocation();

    return (
        <div className="app">
            {/*
                Mounted here, outside <Routes>, so it never remounts on
                navigation. That is what makes Jolt one continuous place:
                travelling from Home to the map to a lesson moves the content
                while the nebulae keep drifting at exactly the phase they were
                at. Inside the router, every route change would restart every
                animation and turn travel into a page load.
            */}
            <Cosmos />

            <Header />

            {/*
                Keyed on the path so each route mounts fresh and replays its
                arrival animation. The Cosmos above is deliberately OUTSIDE
                this, so the sky holds its phase while the content moves --
                that difference is what makes navigating feel like travelling
                rather than like loading a new document.
            */}
            <main className="route" key={pathname}>
                <Routes>
                    {/* Home is the front door and answers "what now?".
                        The games grid, which used to live here, is now /play --
                        practice for what the journey teaches. */}
                    <Route path="/" element={<HomePage />} />
                    <Route path="/play" element={<LandingPage />} />
                    {/* The learning path. /journey is where a learner sees
                        where they are; /learn/:concept is one lesson. Both
                        behind auth, because both read and write learner state. */}
                    <Route
                        path="/journey"
                        element={
                            <ProtectedRoute>
                                <JourneyPage />
                            </ProtectedRoute>
                        }
                    />
                    {/*
                        EXPERIMENT. Free exploration, and the only place in
                        Jolt where running code means nothing: no evidence, no
                        progression, no grade. Behind auth only because the
                        whole shell is -- it reads and writes no learner state.
                    */}
                    <Route
                        path="/experiment"
                        element={
                            <ProtectedRoute>
                                <PlaygroundPage />
                            </ProtectedRoute>
                        }
                    />
                    {/*
                        One world, close up. The map answers "where am I in
                        JavaScript"; this answers "I am here". Same curriculum,
                        same endpoint, neither replacing the other.
                    */}
                    {/* One concept, end to end: learn it, try it, write it,
                        finish it. The curriculum decides what happens on it. */}
                    <Route
                        path="/concept/:concept"
                        element={
                            <ProtectedRoute>
                                <EncounterPage />
                            </ProtectedRoute>
                        }
                    />
                    {/* Write the thing you were just shown. The stage between
                        meeting a concept and being asked to predict it. */}
                    <Route
                        path="/practise/:concept"
                        element={
                            <ProtectedRoute>
                                <PracticePage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/world/:topic"
                        element={
                            <ProtectedRoute>
                                <WorldPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/challenge/:topic"
                        element={
                            <ProtectedRoute>
                                <LessonPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/learn/:concept"
                        element={
                            <ProtectedRoute>
                                <LessonPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    {/*
                        Code Blitz. It used to sit on the generic /play, which
                        worked only while the games grid lived at /. When the
                        grid moved to /play there were suddenly TWO routes
                        registered for that path, React Router matched the first
                        one, and Code Blitz became unreachable -- clicking it
                        rendered the grid again. It now has a route of its own,
                        like every other game.
                    */}
                    <Route
                        path="/code-blitz"
                        element={
                            <ProtectedRoute>
                                <GamePage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/flush"
                        element={
                            <ProtectedRoute>
                                <FlushPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/flush/results/:id"
                        element={
                            <ProtectedRoute>
                                <FlushResultsPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/reaction"
                        element={
                            <ProtectedRoute>
                                <ReactionPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/reaction/results/:id"
                        element={
                            <ProtectedRoute>
                                <ReactionResultsPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/memory"
                        element={
                            <ProtectedRoute>
                                <MemoryPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/memory/results/:id"
                        element={
                            <ProtectedRoute>
                                <MemoryResultsPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/bug-hunt"
                        element={
                            <ProtectedRoute>
                                <BugHuntPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/bug-hunt/results/:id"
                        element={
                            <ProtectedRoute>
                                <BugHuntResultsPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/history"
                        element={
                            <ProtectedRoute>
                                <HistoryPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/results/:id"
                        element={
                            <ProtectedRoute>
                                <ResultsPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="*"
                        element={
                            <section className="panel narrow">
                                <h1>Page not found</h1>
                                <Link className="button primary" to="/">
                                    Back home
                                </Link>
                            </section>
                        }
                    />
                </Routes>
            </main>
        </div>
    );
}
