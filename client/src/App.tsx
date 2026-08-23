import { Link, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import { FlushPage } from "./pages/FlushPage.js";
import { FlushResultsPage } from "./pages/FlushResultsPage.js";
import { GamePage } from "./pages/GamePage.js";
import { HistoryPage } from "./pages/HistoryPage.js";
import { LandingPage } from "./pages/LandingPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { RegisterPage } from "./pages/RegisterPage.js";
import { ResultsPage } from "./pages/ResultsPage.js";

function Header() {
    const { user, logout } = useAuth();

    return (
        <header className="site-header">
            <Link className="brand" to="/">
                <span className="brand-mark">GN</span> Game Night
            </Link>

            {user && (
                <nav>
                    <Link to="/history">History</Link>
                    <span className="muted">{user.username}</span>
                    <button className="button ghost small" onClick={() => void logout()}>
                        Log out
                    </button>
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
