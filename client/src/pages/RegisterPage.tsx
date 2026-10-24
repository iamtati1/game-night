import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import { JoltLogo } from "../components/JoltLogo.js";

import { usePageTitle } from "../usePageTitle.js";
export function RegisterPage() {
    usePageTitle("Create account");
    const { register } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    /** The server's reasons, by field, shown under the field they are about. */
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);

    async function onSubmit(event: FormEvent) {
        event.preventDefault();
        setError(null);
        setFieldErrors({});
        setBusy(true);

        try {
            await register(email, username, password);
            navigate("/");
        } catch (err) {
            // A 400 or 409 names the field at fault. Each reason goes under its
            // own field rather than all of them run together under the button,
            // where a learner in a hurry did not see them. Anything else (the
            // server unreachable, a 500) stays a general message.
            const byField: Record<string, string> = {};
            if (err instanceof ApiError) {
                for (const d of err.details) {
                    if (["email", "username", "password"].includes(d.field)) byField[d.field] = d.message;
                }
            }
            setFieldErrors(byField);
            setError(
                Object.keys(byField).length > 0
                    ? null
                    : err instanceof ApiError
                      ? err.detailText
                      : "Something went wrong"
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="auth">
            <div className="auth-brand">
                <JoltLogo />
                <p>Play. Get better.</p>
            </div>

            <div className="panel">
                <h1>Start your first run.</h1>
                <p className="auth-sub">Takes about ten seconds. Then pick a game.</p>

                <form onSubmit={onSubmit} noValidate>
                <label htmlFor="reg-email">Email</label>
                {/* The email is how this account signs in, so it carries the
                    `username` token: that is what password managers save as
                    the login and fill into the login form's email field. */}
                <input
                    id="reg-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={fieldErrors.email ? true : undefined}
                    aria-describedby={fieldErrors.email ? "reg-email-error" : undefined}
                    required
                />
                {fieldErrors.email && (
                    <p id="reg-email-error" className="field-error" role="alert">
                        {fieldErrors.email}
                    </p>
                )}

                <label htmlFor="reg-username">Username</label>
                {/* A display name, not the login: `nickname`, so a password
                    manager does not save it as the account's username. */}
                <input
                    id="reg-username"
                    name="nickname"
                    type="text"
                    autoComplete="nickname"
                    minLength={3}
                    maxLength={30}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    aria-invalid={fieldErrors.username ? true : undefined}
                    aria-describedby={fieldErrors.username ? "reg-username-error" : undefined}
                    required
                />
                {fieldErrors.username && (
                    <p id="reg-username-error" className="field-error" role="alert">
                        {fieldErrors.username}
                    </p>
                )}

                <label htmlFor="reg-password">Password</label>
                <input
                    id="reg-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={200}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={fieldErrors.password ? true : undefined}
                    aria-describedby={fieldErrors.password ? "reg-password-error reg-password-hint" : "reg-password-hint"}
                    required
                />
                <p id="reg-password-hint" className="hint">At least 8 characters.</p>
                {fieldErrors.password && (
                    <p id="reg-password-error" className="field-error" role="alert">
                        {fieldErrors.password}
                    </p>
                )}

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
