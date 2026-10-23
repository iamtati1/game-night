import { SoundToggle } from "./components/SoundToggle.js";
import { ThemeToggle } from "./components/ThemeToggle.js";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { JoltLogo } from "./components/JoltLogo.js";
import { Cosmos } from "./world/Cosmos.js";
import { Icon } from "./world/Icon.js";
import { useAuth } from "./auth/AuthContext.js";
import { useLogout } from "./auth/useLogout.js";
import { navAreaFor, PRIMARY_NAV, type NavArea } from "./navArea.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import { HomePage } from "./pages/HomePage.js";
import { JourneyPage } from "./pages/JourneyPage.js";
import { SkillsPage } from "./pages/SkillsPage.js";
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
import { ProfilePage } from "./pages/ProfilePage.js";
import { LandingPage } from "./pages/LandingPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { RegisterPage } from "./pages/RegisterPage.js";
import { ResultsPage } from "./pages/ResultsPage.js";

function Header() {
    const { user, loading, unavailable } = useAuth();
    const area = navAreaFor(useLocation().pathname);
    const current = (a: NavArea) => (area === a ? ("page" as const) : undefined);
    const { loggingOut, failed, logOut } = useLogout();

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
                flash "Log in" at a player who is already signed in. Held back
                too while the server is unreachable: that says nothing about
                whether they are signed in, so "Log in" would be a guess.
            */}
            {!loading && !unavailable && (
                <nav aria-label="Site">
                    {user ? (
                        <>
                            {/*
                                FOUR PLACES: Home, Games, Skills, Profile.

                                Read from PRIMARY_NAV (navArea.ts), the same list
                                the phone's bottom bar uses. Home is your next
                                mission and the guided journey from it; Games
                                are the five islands; Skills is what you can
                                do; Profile is the account, its settings and
                                the Log. On a phone these move to
                                the bottom bar and this group is hidden, which
                                is what gives the top bar room again.

                                aria-current marks the area you are in, for
                                screen readers and for the visible mark.
                            */}
                            <span className="nav-primary">
                                {PRIMARY_NAV.map((item) => (
                                    <Link
                                        key={item.to}
                                        to={item.to}
                                        aria-label={item.label}
                                        aria-current={current(item.area)}
                                    >
                                        <Icon name={item.icon} />
                                        <span className="nav-label">{item.label}</span>
                                    </Link>
                                ))}
                            </span>

                            {/* The pilot, set apart from the places by a
                                hairline: who is signed in, and the way out.
                                Theme, sound and the Log live on Profile now,
                                one place for settings rather than icons
                                scattered along the bar. */}
                            <span className="nav-pilot">
                                {/* Experiment: free JavaScript with nothing at
                                    stake. Not one of the four places, so it sits
                                    here, still one click away. */}
                                <Link
                                    className="nav-aside"
                                    to="/experiment"
                                    aria-label="Experiment"
                                    aria-current={current("experiment")}
                                >
                                    <Icon name="spark" size={16} />
                                    <span className="nav-label">Experiment</span>
                                </Link>
                                <span className="nav-avatar" aria-hidden="true">
                                    {user.username.slice(0, 1).toUpperCase()}
                                </span>
                                <span className="nav-name">{user.username}</span>
                            </span>
                            {failed && (
                                <span className="logout-error" role="alert">
                                    Could not log out: still signed in.
                                </span>
                            )}
                            <button
                                className="button ghost small"
                                disabled={loggingOut}
                                onClick={logOut}
                            >
                                {loggingOut ? "Logging out…" : "Log out"}
                            </button>
                        </>
                    ) : (
                        <>
                            {/* No Profile to hold them yet, so a visitor
                                keeps the two switches in the bar. */}
                            <ThemeToggle />
                            <SoundToggle />
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

/**
 * THE PHONE'S BOTTOM BAR: the same four places as the header, in reach of a
 * thumb. Shown only on narrow screens (world.css), where the header's primary
 * group is hidden -- so there is always exactly one set of these links on
 * screen and in the accessibility tree.
 *
 * Signed in only, and only once the session is known: the four places all need
 * an account, and a bar that flashed in and out on first paint would be noise.
 */
function BottomNav() {
    const { user, loading, unavailable } = useAuth();
    const area = navAreaFor(useLocation().pathname);

    if (loading || unavailable || !user) return null;

    return (
        <nav className="bottom-nav" aria-label="Main">
            {PRIMARY_NAV.map((item) => (
                <Link key={item.to} to={item.to} aria-current={area === item.area ? "page" : undefined}>
                    <Icon name={item.icon} size={22} />
                    <span>{item.label}</span>
                </Link>
            ))}
        </nav>
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
                    {/* What the learner can do, from the same path: read-only. */}
                    <Route
                        path="/skills"
                        element={
                            <ProtectedRoute>
                                <SkillsPage />
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
                        path="/profile"
                        element={
                            <ProtectedRoute>
                                <ProfilePage />
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

            {/* Outside <main>, so it stays put across routes like the header. */}
            <BottomNav />
        </div>
    );
}
