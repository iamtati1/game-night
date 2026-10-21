import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";

/**
 * A game the learner cannot fill yet, said as a next step rather than a fault.
 *
 * Flush and Bug Hunt both build a run only from content whose concepts the
 * learner has met, and both answer 503 with the reason when that is not
 * enough. The reason is the server's -- it alone knows the counts and the
 * curriculum -- so this only presents it, with the place it names.
 */
export interface Readiness {
    message: string;
    practice: { slug: string; name: string } | null;
}

/** The server's readiness answer for `error`, or null for any other failure. */
export function readinessFrom(err: unknown, error: string): Readiness | null {
    if (!(err instanceof ApiError) || err.status !== 503) return null;

    const body = err.body as { error?: string; practice?: { slug: string; name: string } | null } | null;
    if (body?.error !== error) return null;

    return { message: err.detailText, practice: body.practice ?? null };
}

interface NotReadyProps {
    title: string;
    readiness: Readiness;
    /** Wording for the link into the concept the server named. */
    practiceLabel: (name: string) => string;
    /** Where to go when no concept was named, or as the second way in. */
    other: { to: string; label: string };
}

export function NotReady({ title, readiness, practiceLabel, other }: NotReadyProps) {
    const { practice } = readiness;

    return (
        <section className="panel narrow">
            <h1>{title}</h1>
            <p>{readiness.message}</p>
            <div className="cta-row">
                {practice && (
                    <Link className="button primary" to={`/concept/${practice.slug}`}>
                        {practiceLabel(practice.name)}
                    </Link>
                )}
                <Link className={practice ? "button ghost" : "button primary"} to={other.to}>
                    {other.label}
                </Link>
            </div>
        </section>
    );
}
