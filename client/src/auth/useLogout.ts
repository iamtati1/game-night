import { useState } from "react";
import { useAuth } from "./AuthContext.js";

/**
 * Logging out, with its failure said out loud. Shared by the header and
 * Profile so both behave the same way.
 *
 * The rejection from logout() has to be caught somewhere. Left as
 * `void logout()` it became an unhandled promise rejection: the request
 * failed, the session stayed live on the server, and the player got no
 * indication either way -- the one outcome worse than a failed logout is a
 * silent one.
 */
export function useLogout() {
    const { logout } = useAuth();
    const [loggingOut, setLoggingOut] = useState(false);
    const [failed, setFailed] = useState(false);

    async function handleLogout() {
        setLoggingOut(true);
        setFailed(false);

        try {
            await logout();
        } catch {
            // Still signed in, so the page stays and says why.
            setFailed(true);
        } finally {
            setLoggingOut(false);
        }
    }

    return { loggingOut, failed, logOut: () => void handleLogout() };
}
