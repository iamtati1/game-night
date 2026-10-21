import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode
} from "react";
import { ApiError, api, isUnreachable } from "../api/client.js";
import type { PublicUser } from "../api/types.js";

interface AuthState {
    user: PublicUser | null;
    /** True until the initial session check resolves, so routes do not flash. */
    loading: boolean;
    /**
     * The session check could not reach the server. NOT the same as signed
     * out: the session may be perfectly good, so nothing should send the
     * learner to the login page because of it.
     */
    unavailable: boolean;
    /** Runs the session check again, for a "try again" after an outage. */
    retrySession: () => void;
    register: (email: string, username: string, password: string) => Promise<void>;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<PublicUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [unavailable, setUnavailable] = useState(false);
    const [attempt, setAttempt] = useState(0);

    // The session lives in an httpOnly cookie the client cannot read, so the
    // only way to know who we are is to ask the server.
    //
    // ONLY A 401 MEANS SIGNED OUT. Every failure used to leave `user` null,
    // and ProtectedRoute sends a null user to /login -- so an API outage told a
    // signed-in learner to sign in again. An unreachable server is recorded as
    // such, and the gate shows that instead.
    useEffect(() => {
        let active = true;

        setLoading(true);
        api.get<{ user: PublicUser }>("/api/users/me")
            .then((data) => {
                if (!active) return;
                setUser(data.user);
                setUnavailable(false);
            })
            .catch((err) => {
                if (!active) return;
                if (err instanceof ApiError && err.status === 401) {
                    setUnavailable(false);
                    return;
                }
                // Anything else -- no response, a gateway with nothing behind
                // it, a 5xx -- says nothing about the session.
                setUnavailable(isUnreachable(err) || (err instanceof ApiError && err.status >= 500) || !(err instanceof ApiError));
                console.error("Session check failed:", err);
            })
            .finally(() => active && setLoading(false));

        return () => {
            active = false;
        };
    }, [attempt]);

    const retrySession = useCallback(() => setAttempt((n) => n + 1), []);

    const register = useCallback(async (email: string, username: string, password: string) => {
        const data = await api.post<{ user: PublicUser }>("/api/auth/register", {
            email,
            username,
            password
        });
        setUser(data.user);
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        const data = await api.post<{ user: PublicUser }>("/api/auth/login", { email, password });
        setUser(data.user);
    }, []);

    /**
     * Clears local auth state only after the server confirms the session is gone.
     *
     * The server is authoritative here, so the order is deliberate: awaiting the
     * request before setUser(null) means the logged-out UI is a report of what
     * happened, not a prediction. Clearing first would show the logged-out header
     * whether or not the session actually ended -- which is indistinguishable, to
     * the player, from a logout that worked.
     *
     * A 401 is the one failure that still means success: the session was already
     * gone, which is the state we were trying to reach. Every other failure
     * rethrows with the user left signed in, because the server still holds a
     * live session and the header should keep saying so.
     */
    const logout = useCallback(async () => {
        try {
            await api.post("/api/auth/logout");
        } catch (err) {
            if (!(err instanceof ApiError && err.status === 401)) {
                throw err;
            }
        }

        setUser(null);
    }, []);

    const value = useMemo(
        () => ({ user, loading, unavailable, retrySession, register, login, logout }),
        [user, loading, unavailable, retrySession, register, login, logout]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error("useAuth must be used inside an AuthProvider");
    }

    return context;
}
