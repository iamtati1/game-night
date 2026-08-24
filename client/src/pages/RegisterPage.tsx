import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import { JoltLogo } from "../components/JoltLogo.js";

export function RegisterPage() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function onSubmit(event: FormEvent) {
        event.preventDefault();
        setError(null);
        setBusy(true);

        try {
            await register(email, username, password);
            navigate("/");
        } catch (err) {
            setError(err instanceof ApiError ? err.detailText : "Something went wrong");
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="auth">
            <div className="auth-brand">
                <JoltLogo />
                <p>Think fast. Play again.</p>
            </div>

            <div className="panel">
                <h1>Start your first run.</h1>
                <p className="auth-sub">Takes about ten seconds. Then pick a game.</p>

                <form onSubmit={onSubmit} noValidate>
                <label htmlFor="reg-email">Email</label>
                <input
                    id="reg-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                />

                <label htmlFor="reg-username">Username</label>
                <input
                    id="reg-username"
                    type="text"
                    autoComplete="username"
                    minLength={3}
                    maxLength={30}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                />

                <label htmlFor="reg-password">Password</label>
                <input
                    id="reg-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
                <p className="hint">At least 8 characters.</p>

                {error && (
                    <p className="form-error" role="alert">
                        {error}
                    </p>
                )}

                <button className="button primary full" type="submit" disabled={busy}>
                    {busy ? "Creating account…" : "Create account"}
                </button>
                </form>

                <p className="muted auth-alt">
                    Already registered? <Link to="/login">Log in</Link>
                </p>
            </div>
        </section>
    );
}
