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

// Requests go to the same origin and are forwarded to the API by Vite's dev
// proxy, so the session cookie is sent automatically -- no credentials option
// and no CORS configuration needed.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;

    try {
        response = await fetch(path, {
            headers: init?.body ? { "Content-Type": "application/json" } : undefined,
            ...init
        });
    } catch {
        throw new ApiError(0, "Could not reach the server. Is it running on port 3000?");
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
