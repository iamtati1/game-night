import "express-session";

// The session cookie carries only a user id; everything else is looked up
// server-side on each request.
declare module "express-session" {
    interface SessionData {
        userId?: string;
    }
}

// Populated by requireAuth so route handlers get a typed, already-verified user.
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                username: string;
                email: string;
                createdAt: string;
            };
        }
    }
}
