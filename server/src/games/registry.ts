import { pool } from "../db.js";
import { GAME_SLUGS } from "./constants.js";

/**
 * Checks that every game the code knows about has a row in `games`.
 *
 * Sessions resolve their game_id with a subquery on the slug:
 *
 *     INSERT INTO game_sessions (user_id, game_id)
 *     VALUES ($1, (SELECT id FROM games WHERE slug = $2))
 *
 * That is the right pattern -- it survives a reseed, reads clearly in logs, and
 * never hardcodes an id. But a SELECT that matches nothing yields NULL rather
 * than an error, so a missing row does not surface as "this game is not
 * registered". It surfaces several statements later, inside a transaction, as
 * "null value in column game_id violates not-null constraint" -- a message about
 * a column, naming neither the game nor the migration that would fix it.
 *
 * This turns that into a question the server can answer directly.
 */
export interface RegistryCheck {
    ok: boolean;
    /** Slugs the code expects but the database does not have. */
    missing: string[];
}

export async function checkGameRegistry(): Promise<RegistryCheck> {
    const result = await pool.query<{ slug: string }>(
        `SELECT slug FROM games WHERE slug = ANY($1)`,
        [[...GAME_SLUGS]]
    );

    const present = new Set(result.rows.map((row) => row.slug));
    const missing = GAME_SLUGS.filter((slug) => !present.has(slug));

    return { ok: missing.length === 0, missing: [...missing] };
}

/** The message the readiness endpoint and the logs both use. */
export function registryMessage(missing: string[]): string {
    return (
        `${missing.join(", ")} registered in code but missing from the games table. ` +
        `A migration has not been applied — sessions for these games will fail with ` +
        `a game_id not-null violation until it is.`
    );
}
