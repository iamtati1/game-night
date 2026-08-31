import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
}

/**
 * Render's *internal* database URL is reached over its private network and needs
 * no TLS. The *external* URL does, and rejects an unencrypted connection.
 *
 * rejectUnauthorized is false because Render's managed Postgres presents a
 * certificate signed by its own CA, which is not in Node's trust store -- the
 * connection is still encrypted, it just is not verified against a public root.
 * Prefer the internal URL in production and leave this off.
 */
const useSsl = process.env.DATABASE_SSL === "true";

const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {})
});

pool.on("error", (err) => {
    console.error("Unexpected PostgreSQL pool error:", err);
});

export { pool };
