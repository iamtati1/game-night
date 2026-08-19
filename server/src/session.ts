import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db.js";

// Missing secret is a configuration error, not a transient failure: fail fast
// at startup, the same rule DATABASE_URL follows.
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required");
}

const PgSession = connectPgSimple(session);

const ONE_WEEK_MS = 1000 * 60 * 60 * 24 * 7;

export const sessionMiddleware = session({
    // createTableIfMissing lets connect-pg-simple own its own schema, so the
    // hand-written migration set stays at 000-005.
    store: new PgSession({
        pool,
        tableName: "session",
        createTableIfMissing: true
    }),
    name: "gn.sid",
    secret: sessionSecret,
    resave: false,
    // Do not persist a row for visitors who never log in.
    saveUninitialized: false,
    cookie: {
        // Unreadable from JavaScript, so an XSS bug cannot exfiltrate it.
        httpOnly: true,
        // HTTPS only in production; local dev is plain HTTP.
        secure: process.env.NODE_ENV === "production",
        // Primary CSRF mitigation, which is the exposure cookies bring.
        sameSite: "lax",
        maxAge: ONE_WEEK_MS
    }
});
