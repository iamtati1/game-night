import type { FieldError } from "./types.js";

export class ApiError extends Error {
    // Written as plain fields rather than constructor parameter properties:
    // the client tsconfig sets erasableSyntaxOnly, which bans TS-only syntax
    // that a type-stripping runtime could not simply delete.
    readonly status: number;
    readonly details: FieldError[];
    /** The parsed response body, for endpoints that return more than error+details. */
    readonly body: unknown;

    constructor(status: number, message: string, details: FieldError[] = [], body: unknown = null) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.details = details;
        this.body = body;
    }

    /** Flattens field errors into one readable line for form display. */
    get detailText(): string {
        return this.details.length
            ? this.details.map((d) => d.message).join(" ")
            : this.message;
    }
}

/**
 * Where the API lives.
 *
 * Empty in development: Vite proxies /api to the Express server, so a relative
 * path is same-origin and the session cookie rides along on its own.
 *
 * In production the client is a static site on its own origin and the API is a
 * separate service, so VITE_API_URL carries the API's origin and every request
 * becomes cross-origin. Vite inlines this at BUILD time -- it is baked into the
 * bundle, so changing it means rebuilding, not restarting.
 */
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;

    try {
        response = await fetch(`${API_BASE}${path}`, {
            headers: init?.body ? { "Content-Type": "application/json" } : undefined,
            // Required the moment the API is on another origin: without it the
            // browser sends no session cookie and every request looks logged out.
            // Harmless same-origin, where it is already the effective behaviour.
            credentials: "include",
            ...init
        });
    } catch {
        throw new ApiError(
            0,
            API_BASE
                ? `Could not reach the API at ${API_BASE}.`
                : "Could not reach the server. Is it running on port 3000?"
        );
    }

    if (response.status === 204) {
        return undefined as T;
    }

    // An error page from a proxy or crash is not JSON; never assume it is.
    const body = await response.json().catch(() => null);

    if (!response.ok) {
        throw new ApiError(
            response.status,
            body?.error ?? `Request failed with status ${response.status}`,
            body?.details ?? [],
            body
        );
    }

    return body as T;
}

export const api = {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown) =>
        request<T>(path, {
            method: "POST",
            body: body === undefined ? undefined : JSON.stringify(body)
        })
};
