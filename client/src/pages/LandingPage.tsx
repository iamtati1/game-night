import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";

export function LandingPage() {
    const { user, loading } = useAuth();

    return (
        <section className="hero">
            <p className="eyebrow">Code Blitz</p>
            <h1>
                Ten questions.
                <br />
                Thirty seconds each.
            </h1>
            <p className="lede">
                Rapid-fire JavaScript and computer-science trivia. Answer fast to earn a speed
                bonus — the clock is kept on the server, so there is nowhere to hide.
            </p>

            {loading ? (
                <p className="muted">Loading…</p>
            ) : user ? (
                <div className="cta-row">
                    <Link className="button primary" to="/play">
                        Play Code Blitz
                    </Link>
                    <Link className="button ghost" to="/flush">
                        Play Flush
                    </Link>
                    <span className="muted">
                        Signed in as <strong>{user.username}</strong>
                    </span>
                </div>
            ) : (
                <div className="cta-row">
                    <Link className="button primary" to="/register">
                        Create an account
                    </Link>
                    <Link className="button ghost" to="/login">
                        Log in
                    </Link>
                </div>
            )}

            <ul className="feature-grid">
                <li>
                    <h2>100 + speed bonus</h2>
                    <p>Correct answers score 100, plus up to 50 more the faster you answer.</p>
                </li>
                <li>
                    <h2>Server-timed</h2>
                    <p>Response times are measured server-side. Late answers are refused.</p>
                </li>
                <li>
                    <h2>Resumable</h2>
                    <p>Close the tab by accident and pick the game back up within 15 minutes.</p>
                </li>
            </ul>
        </section>
    );
}
