import { pool } from "../db.js";

// id is BIGINT, which node-postgres returns as a string because bigint can
// exceed JavaScript's safe integer range. Keeping it a string all the way
// through avoids a silent precision bug later.
export interface PublicUser {
    id: string;
    username: string;
    email: string;
    createdAt: string;
}

interface UserRow {
    id: string;
    username: string;
    email: string;
    created_at: Date;
}

function toPublicUser(row: UserRow): PublicUser {
    return {
        id: row.id,
        username: row.username,
        email: row.email,
        createdAt: row.created_at.toISOString()
    };
}

// No SELECT-then-INSERT: the unique constraints are the concurrency-safe
// mechanism for detecting duplicates. Callers catch 23505.
export async function insertUser(
    email: string,
    username: string,
    passwordHash: string
): Promise<PublicUser> {
    const result = await pool.query<UserRow>(
        `INSERT INTO users (email, username, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, username, email, created_at`,
        [email, username, passwordHash]
    );

    return toPublicUser(result.rows[0]!);
}

export async function findActiveUserByEmail(
    email: string
): Promise<{ id: string; passwordHash: string } | null> {
    const result = await pool.query<{ id: string; password_hash: string }>(
        `SELECT id, password_hash
         FROM users
         WHERE email = $1 AND anonymized_at IS NULL`,
        [email]
    );

    const row = result.rows[0];

    return row ? { id: row.id, passwordHash: row.password_hash } : null;
}

export async function findActiveUserById(id: string): Promise<PublicUser | null> {
    const result = await pool.query<UserRow>(
        `SELECT id, username, email, created_at
         FROM users
         WHERE id = $1 AND anonymized_at IS NULL`,
        [id]
    );

    const row = result.rows[0];

    return row ? toPublicUser(row) : null;
}

// The session store has no foreign key to users, so anonymizing an account
// does not cascade to its sessions. This deletes them explicitly.
export async function invalidateUserSessions(userId: string): Promise<number> {
    const result = await pool.query(
        `DELETE FROM session WHERE sess->>'userId' = $1`,
        [userId]
    );

    return result.rowCount ?? 0;
}
