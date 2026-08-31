import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from "./auth/cookie.js";
import { pool } from "./db.js";

// Missing secret is a configuration error, not a transient failure: fail fast
// at startup, the same rule DATABASE_URL follows.
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required");
}

const PgSession = connectPgSimple(session);

export const sessionMiddleware = session({
    // createTableIfMissing lets connect-pg-simple own its own schema, so the
    // hand-written migration set stays at 000-005.
    store: new PgSession({
        pool,
        tableName: "session",
        createTableIfMissing: true
    }),
    // Shared with the logout handler, so the cookie that gets set and the cookie
    // that gets cleared can never describe different cookies. See auth/cookie.ts.
    name: SESSION_COOKIE_NAME,
    secret: sessionSecret,
    resave: false,
    // Do not persist a row for visitors who never log in.
    saveUninitialized: false,
    cookie: SESSION_COOKIE_OPTIONS
});
