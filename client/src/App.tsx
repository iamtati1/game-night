import { useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { JoltLogo } from "./components/JoltLogo.js";
import { Cosmos } from "./world/Cosmos.js";
import { Icon } from "./world/Icon.js";
import { useAuth } from "./auth/AuthContext.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import { HomePage } from "./pages/HomePage.js";
import { JourneyPage } from "./pages/JourneyPage.js";
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
                            {/* Three destinations, in the order a learner needs
                                them: what now, where am I going, where do I
                                practice. History is real but not a beginner's
                                concern, so it sits last. */}
                            <Link to="/" aria-label="Home">
                                <Icon name="home" />
                                <span className="nav-label">Home</span>
                            </Link>
                            <Link to="/journey" aria-label="Map">
                                <Icon name="map" />
                                <span className="nav-label">Map</span>
                            </Link>
                            <Link to="/play" aria-label="Play">
                                <Icon name="play" />
                                <span className="nav-label">Play</span>
                            </Link>
                            <Link to="/history" aria-label="Log">
                                <Icon name="log" />
                                <span className="nav-label">Log</span>
                            </Link>

                            {/* The pilot, set apart from the destinations by a
                                hairline: an identity is not somewhere you can
                                navigate to, and reading as a fifth link is what
                                made the old nav feel like five equal choices. */}
                            <span className="nav-pilot">
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
                    <Route
                        path="/play"
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
