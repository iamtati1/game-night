import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";

export function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function onSubmit(event: FormEvent) {
        event.preventDefault();
        setError(null);
        setBusy(true);

        try {
            await login(email, password);
            navigate("/play");
        } catch (err) {
            // The server returns one generic message on purpose; show it as-is
            // rather than guessing which field was wrong.
            setError(err instanceof ApiError ? err.detailText : "Something went wrong");
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="panel narrow">
            <h1>Log in</h1>

            <form onSubmit={onSubmit} noValidate>
                <label htmlFor="login-email">Email</label>
                <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                />

                <label htmlFor="login-password">Password</label>
                <input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />

                {error && (
                    <p className="form-error" role="alert">
                        {error}
                    </p>
                )}

                <button className="button primary full" type="submit" disabled={busy}>
                    {busy ? "Logging in…" : "Log in"}
                </button>
            </form>

            <p className="muted">
                No account? <Link to="/register">Create one</Link>
            </p>
        </section>
    );
}
