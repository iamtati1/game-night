import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
    connectionString: databaseUrl,
    max: 10
});

pool.on("error", (err) => {
    console.error("Unexpected PostgreSQL pool error:", err);
});

export { pool };
