import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthContext.js";

/** Client-side gate only. The server enforces auth independently -- this exists
 *  for UX, not security. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
    const { user, loading, unavailable, retrySession } = useAuth();
    const location = useLocation();

    if (loading) {
        return <p className="muted center">Checking your session…</p>;
    }

    // The server could not be reached, which says nothing about whether the
    // learner is signed in. Stay on this route and offer to try again, rather
    // than sending a signed-in learner to the login page.
    if (!user && unavailable) {
        return (
            <section className="panel narrow">
                <h1>Jolt is not responding</h1>
                <p role="alert">
                    We could not reach Jolt's server just now. Your progress is safe: nothing was
                    lost. Try again in a moment.
                </p>
                <button className="button primary" onClick={retrySession}>
                    Try again
                </button>
            </section>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }

    return <>{children}</>;
}
