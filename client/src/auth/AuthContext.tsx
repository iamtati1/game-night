import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode
} from "react";
import { ApiError, api } from "../api/client.js";
import type { PublicUser } from "../api/types.js";

interface AuthState {
    user: PublicUser | null;
    /** True until the initial session check resolves, so routes do not flash. */
    loading: boolean;
    register: (email: string, username: string, password: string) => Promise<void>;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<PublicUser | null>(null);
    const [loading, setLoading] = useState(true);

    // The session lives in an httpOnly cookie the client cannot read, so the
    // only way to know who we are is to ask the server.
    useEffect(() => {
        let active = true;

        api.get<{ user: PublicUser }>("/api/users/me")
            .then((data) => active && setUser(data.user))
            .catch((err) => {
                // 401 just means "not logged in" -- not an error worth surfacing.
                if (active && !(err instanceof ApiError && err.status === 401)) {
                    console.error("Session check failed:", err);
                }
            })
            .finally(() => active && setLoading(false));

        return () => {
            active = false;
        };
    }, []);

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

    const logout = useCallback(async () => {
        await api.post("/api/auth/logout");
        setUser(null);
    }, []);

    const value = useMemo(
        () => ({ user, loading, register, login, logout }),
        [user, loading, register, login, logout]
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
