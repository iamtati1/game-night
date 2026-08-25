import { useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { JoltLogo } from "./components/JoltLogo.js";
import { useAuth } from "./auth/AuthContext.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
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
                            <Link to="/">Games</Link>
                            <Link to="/history">History</Link>
                            <span className="muted">{user.username}</span>
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
    return (
        <div className="app">
            <Header />

            <main>
                <Routes>
                    <Route path="/" element={<LandingPage />} />
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
