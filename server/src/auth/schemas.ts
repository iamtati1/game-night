import { z } from "zod";

// These transforms deliberately mirror the CHECK constraints in 001:
//   users_email_normalized        -> email = LOWER(TRIM(email))
//   users_username_no_outer_whitespace -> username = TRIM(username)
// Normalizing here means the database constraint stays a backstop rather than
// the thing users actually hit, so they get a 400 naming the field instead of
// a 500 carrying a Postgres string.
export const registerSchema = z.object({
    email: z.string().trim().max(254).toLowerCase().pipe(z.email()),
    username: z
        .string()
        .trim()
        .min(3, "Username must be at least 3 characters")
        .max(30, "Username must be at most 30 characters"),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        // Argon2 has no 72-byte truncation problem like bcrypt, but an
        // unbounded password is a cheap way to make the server burn CPU.
        .max(200, "Password must be at most 200 characters")
});

export const loginSchema = z.object({
    email: z.string().trim().toLowerCase(),
    password: z.string()
});

export interface FieldError {
    field: string;
    message: string;
}

export function toFieldErrors(error: z.ZodError): FieldError[] {
    return error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message
    }));
}
