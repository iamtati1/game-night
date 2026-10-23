import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import type { UserStatsResponse } from "../api/types.js";
import { useAuth } from "../auth/AuthContext.js";
import { useLogout } from "../auth/useLogout.js";
import { setSoundEnabled, useSoundEnabled } from "../games/sound.js";
import { setTheme, useTheme } from "../games/theme.js";
import { replayTutorialHref } from "../games/tutorial.js";
import { usePace } from "../games/usePace.js";
import { usePageTitle } from "../usePageTitle.js";
import { Icon } from "../world/Icon.js";

/**
 * PROFILE: the account and its settings, in one place.
 *
 * READS, NEVER WRITES LEARNER STATE. The account comes from the signed-in
 * session and the numbers from /api/users/me/stats, the endpoint the Games
 * page already reads. Every setting here is the same per-device preference
 * the rest of Jolt uses (theme, sound, pace, all in localStorage): changing
 * one sends nothing to the server and cannot touch progress.
 *
 * XP IS SAID TO BE PLAY. It counts games finished, not understanding, so it
 * sits beside a pointer to Skills rather than being presented as progress.
 */
export function ProfilePage() {
    usePageTitle("Profile");
    const { user } = useAuth();
    const { loggingOut, failed, logOut } = useLogout();

    if (!user) return null;

    const since = user.createdAt ? new Date(user.createdAt) : null;

    return (
        <section className="profile">
            <header className="profile-head">
                <h1 className="profile-title">Profile</h1>
                <p className="profile-lede">Your account and how Jolt looks, sounds and plays on this device.</p>
            </header>

            <div className="profile-grid">
                <section className="profile-card" aria-labelledby="profile-account">
                    <h2 id="profile-account" className="profile-card-title">
                        Account
                    </h2>
                    <dl className="profile-facts">
                        <div>
                            <dt>Username</dt>
                            <dd>{user.username}</dd>
                        </div>
                        <div>
                            <dt>Email</dt>
                            <dd>{user.email}</dd>
                        </div>
                        {since && !Number.isNaN(since.getTime()) && (
                            <div>
                                <dt>Learning since</dt>
                                <dd>{since.toLocaleDateString(undefined, { dateStyle: "medium" })}</dd>
                            </div>
                        )}
                    </dl>
                    <div className="profile-actions">
                        <Link className="button ghost" to="/history">
                            <Icon name="log" size={17} /> Your game log
                        </Link>
                        <button className="button ghost" disabled={loggingOut} onClick={logOut}>
                            <Icon name="exit" size={17} /> {loggingOut ? "Logging out…" : "Log out"}
                        </button>
                    </div>
                    {failed && (
                        <p className="form-error" role="alert">
                            Could not log out: still signed in.
                        </p>
                    )}
                </section>

                <ProfileStats />

                <ProfileSettings />

                <section className="profile-card" aria-labelledby="profile-tutorial">
                    <h2 id="profile-tutorial" className="profile-card-title">
                        First-time tutorial
                    </h2>
                    <p className="profile-note">
                        Walk the <code>console.log()</code> tutorial again. It records nothing, so your progress
                        stays exactly as it is.
                    </p>
                    <Link className="button ghost" to={replayTutorialHref()}>
                        Replay the tutorial
                    </Link>
                </section>
            </div>
        </section>
    );
}

function ProfileStats() {
    const [stats, setStats] = useState<UserStatsResponse | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let active = true;
        api.get<UserStatsResponse>("/api/users/me/stats")
            .then((data) => active && setStats(data))
            .catch(() => active && setFailed(true));
        return () => {
            active = false;
        };
    }, [attempt]);

    const played = (stats?.perGame ?? []).filter((g) => g.gamesCompleted > 0);

    return (
        <section className="profile-card" aria-labelledby="profile-stats">
            <h2 id="profile-stats" className="profile-card-title">
                Games played
            </h2>
            {failed ? (
                <>
                    <p role="alert">Your numbers did not load. Nothing is lost.</p>
                    <button className="button ghost small" onClick={() => {
                            setFailed(false);
                            setAttempt((n) => n + 1);
                        }}>
                        Try again
                    </button>
                </>
            ) : !stats ? (
                <p className="muted" role="status">
                    Loading your numbers…
                </p>
            ) : (
                <>
                    <dl className="profile-numbers">
                        <div>
                            <dt>Games finished</dt>
                            <dd>{stats.totals.gamesCompleted}</dd>
                        </div>
                        <div>
                            <dt>XP earned</dt>
                            <dd>{stats.totals.totalXp}</dd>
                        </div>
                    </dl>
                    {played.length > 0 && (
                        <ul className="profile-games" aria-label="By game">
                            {played.map((g) => (
                                <li key={g.game.slug}>
                                    <span>{g.game.name}</span>
                                    <span className="profile-games-detail">
                                        {g.gamesCompleted} finished
                                        {g.bestScore !== null && `, best ${g.bestScore}`}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className="profile-note">
                        XP counts the games you play. What you understand is on{" "}
                        <Link to="/skills">your Skills</Link>.
                    </p>
                </>
            )}
        </section>
    );
}

function ProfileSettings() {
    const theme = useTheme();
    const sound = useSoundEnabled();
    const [timed, setTimed] = usePace();

    return (
        <section className="profile-card" aria-labelledby="profile-settings">
            <h2 id="profile-settings" className="profile-card-title">
                Settings
            </h2>
            <p className="profile-note">Saved on this device only.</p>

            <fieldset className="profile-setting">
                <legend>Theme</legend>
                <label className="profile-option">
                    <input
                        type="radio"
                        name="theme"
                        checked={theme === "cream"}
                        onChange={() => setTheme("cream")}
                    />
                    <span>Light (cream)</span>
                </label>
                <label className="profile-option">
                    <input
                        type="radio"
                        name="theme"
                        checked={theme === "dusk"}
                        onChange={() => setTheme("dusk")}
                    />
                    <span>Dark (dusk)</span>
                </label>
            </fieldset>

            <fieldset className="profile-setting">
                <legend>Sound</legend>
                <label className="profile-option">
                    <input type="checkbox" checked={sound} onChange={(e) => setSoundEnabled(e.target.checked)} />
                    <span>Sound effects</span>
                </label>
            </fieldset>

            <fieldset className="profile-setting">
                <legend>Game pace</legend>
                <label className="profile-option">
                    <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} />
                    <span>Start Code Blitz, Flush and Bug Hunt with the clock</span>
                </label>
                <p className="profile-note">
                    {timed ? "Games start timed." : "Games start relaxed, with no timer."} You can still
                    change it on each game's intro. Reaction is always timed.
                </p>
            </fieldset>
        </section>
    );
}
