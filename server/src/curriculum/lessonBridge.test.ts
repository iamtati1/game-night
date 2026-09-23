import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";

/**
 * THE BRIDGE BETWEEN A LESSON AND THE CURRICULUM.
 *
 * A lesson reaches a learner only through an `introduce` challenge. That row is
 * what the journey offers, what completing the lesson records against, and
 * therefore what makes the concept met so its practice is released. A lesson
 * without one is unreachable; an introduction without one points the learner at
 * a concept Jolt has nothing to say about.
 *
 * Both halves were authored independently and drifted badly: the client carried
 * 21 lessons while the database joined 2 of them, and a learner starting from
 * zero ran out of curriculum after two steps. Nothing failed -- there was no
 * test that could see both halves at once.
 *
 * This is that test. It is deliberately a BICONDITIONAL, because the two
 * failure modes are different and both are silent:
 *
 *     lesson without introduction   -> written content nobody can reach
 *     introduction without lesson   -> the journey offers an empty room
 *
 * It reads the client source rather than importing it, for the same reason
 * learningPath.test.ts does: the server does not build the client, and the
 * point is to check what was actually written down.
 */
const LESSON_SOURCES = ["lessons.ts", "scenes.ts"] as const;

function authoredLessonConcepts(): Set<string> {
    const source = LESSON_SOURCES.map((file) =>
        readFileSync(new URL(`../../../client/src/games/${file}`, import.meta.url), "utf8")
    ).join("\n");

    // `concept: null` marks a topic challenge, which belongs to a topic rather
    // than to any one concept and so has no introduction to match.
    return new Set([...source.matchAll(/concept:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]!));
}

describe("every authored lesson is reachable", () => {
    let fx: CurriculumFixture;
    let introduced: Set<string>;
    const authored = authoredLessonConcepts();

    beforeAll(async () => {
        fx = await buildCurriculumFixture();

        const rows = await fx.rows<{ slug: string }>(
            `SELECT c.slug
             FROM challenges ch
             JOIN concepts c ON c.id = ch.concept_id
             WHERE ch.role = 'introduce' AND ch.is_active`
        );

        introduced = new Set(rows.map((r) => r.slug));
    }, 120000);

    it("finds lessons to check at all", () => {
        // Guards the regex itself. If the lesson format changes and this stops
        // matching, every assertion below would pass vacuously.
        expect(authored.size).toBeGreaterThan(15);
    });

    it("gives every concept with a lesson an introduction to reach it by", () => {
        const unreachable = [...authored].filter((slug) => !introduced.has(slug)).sort();

        expect(
            unreachable,
            "these concepts have a written lesson that no learner can ever be offered"
        ).toEqual([]);
    });

    it("gives every introduction a lesson to open", () => {
        const empty = [...introduced].filter((slug) => !authored.has(slug)).sort();

        expect(
            empty,
            "the journey would offer these concepts and then have nothing to show"
        ).toEqual([]);
    });

    /**
     * The regression that motivated all of this. Walking the journey the way a
     * learner does -- take what is offered, complete it, ask again -- has to get
     * further than a couple of steps before running out.
     */
    it("lets a learner starting from zero walk the whole authored curriculum", async () => {
        const user = await fx.insertUser("bridge-walk@jolt.test");
        const visited: string[] = [];

        for (let step = 0; step < authored.size + 2; step += 1) {
            const next = await fx.rows<{ slug: string }>(
                `SELECT c.slug
                 FROM challenges ch
                 JOIN concepts c ON c.id = ch.concept_id
                 JOIN topics   t ON t.id = c.topic_id
                 WHERE ch.role = 'introduce' AND ch.is_active
                   AND ch.concept_id NOT IN (
                       SELECT ch2.concept_id
                       FROM introduction_completions ic
                       JOIN challenges ch2 ON ch2.id = ic.challenge_id
                       WHERE ic.user_id = $1)
                 ORDER BY t.display_order, c.display_order
                 LIMIT 1`,
                [user]
            );

            if (next.length === 0) break;

            visited.push(next[0]!.slug);

            await fx.rows(
                `INSERT INTO introduction_completions (user_id, challenge_id)
                 SELECT $1, ch.id
                 FROM challenges ch
                 JOIN concepts c ON c.id = ch.concept_id
                 WHERE c.slug = $2 AND ch.role = 'introduce'
                 ON CONFLICT DO NOTHING`,
                [user, next[0]!.slug]
            );
        }

        expect(
            visited.length,
            `a beginner stalled after ${visited.length} lessons: ${visited.join(" -> ")}`
        ).toBe(authored.size);
    }, 120000);
});
