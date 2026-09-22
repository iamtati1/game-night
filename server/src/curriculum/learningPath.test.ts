import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { findJourneyPath, recordDemonstration } from "./lessons.js";
import {
    ALL_LESSONS,
    LESSONS,
    VALUES_TAIL_LESSONS,
    OPERATORS_LESSONS,
    TOPIC_CHALLENGES,
    VARIABLES_LESSONS
} from "../../../client/src/games/lessons.ts";

/**
 * The learning path: what a beginner is shown, in what order, and what moving
 * through it changes.
 *
 * These assertions are about the PRODUCT PROMISE rather than about rows. A
 * learner should always be able to answer "where am I, what am I learning, what
 * comes next" — so the tests ask those questions and check the answers are
 * singular, ordered, and move only when the learner does something.
 *
 * findJourneyPath and recordDemonstration read `pool`, so the executed tests
 * below re-run their SQL against the fixture. Where a query is exercised
 * directly, the statement is the one the module ships.
 */

let fx: CurriculumFixture;

beforeAll(async () => {
    fx = await buildCurriculumFixture();
}, 120_000);

/** The journey, computed the way findJourneyPath computes it. */
async function path(userId: string) {
    const rows = await fx.rows<{
        topic_slug: string;
        concept_slug: string;
        demonstrated: boolean;
    }>(
        `SELECT t.slug AS topic_slug, c.slug AS concept_slug,
                (d.user_id IS NOT NULL) AS demonstrated
         FROM topics t
         JOIN concepts c ON c.topic_id = t.id
         LEFT JOIN concept_demonstrations d ON d.concept_id = c.id AND d.user_id = $1
         ORDER BY t.display_order, c.display_order`,
        [userId]
    );

    const firstOpen = rows.find((r) => !r.demonstrated);

    return {
        rows,
        current: firstOpen ?? null,
        demonstrated: rows.filter((r) => r.demonstrated).map((r) => r.concept_slug)
    };
}

async function demonstrate(userId: string, slug: string, neededRetry = false) {
    await fx.db.query(
        `INSERT INTO concept_demonstrations (user_id, concept_id, needed_retry)
         SELECT $1, c.id, $3 FROM concepts c WHERE c.slug = $2
         ON CONFLICT (user_id, concept_id) DO NOTHING`,
        [userId, slug, neededRetry]
    );
}

// ── where am I ───────────────────────────────────────────────────────────

describe("a brand-new learner starts at the very beginning", () => {
    it("is put on the first concept of the first topic", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("p1@example.com");
            const { current } = await path(learner);

            expect(current?.topic_slug).toBe("values");
            expect(current?.concept_slug).toBe("console-output");
        });
    });

    it("has demonstrated nothing", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("p2@example.com");

            expect((await path(learner)).demonstrated).toEqual([]);
        });
    });

    it("is never on more than one concept at a time", async () => {
        // The difference between a path and a menu. A beginner who can start
        // anywhere has been handed back the choice the journey exists to make.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("p3@example.com");
            const { rows } = await path(learner);
            const open = rows.filter((r) => !r.demonstrated);

            expect(open.length, "many are undemonstrated").toBeGreaterThan(1);
            expect(
                open[0]!.concept_slug,
                "but only the first of them is current"
            ).toBe("console-output");
        });
    });
});

// ── what moves it ────────────────────────────────────────────────────────

describe("finishing a lesson moves the learner on, and nothing else does", () => {
    it("advances to the next concept in the topic's order", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("p4@example.com");

            await demonstrate(learner, "console-output");

            expect((await path(learner)).current?.concept_slug).toBe(
                "expressions-produce-values"
            );
        });
    });

    it("walks values in the authored order, one concept at a time", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("p5@example.com");
            const seen: string[] = [];

            for (let i = 0; i < 7; i += 1) {
                const { current } = await path(learner);

                if (!current) break;

                seen.push(current.concept_slug);
                await demonstrate(learner, current.concept_slug);
            }

            expect(seen).toEqual([
                "console-output",
                "expressions-produce-values",
                "primitive-types",
                "booleans",
                "typeof",
                "null-vs-undefined",
                "type-coercion"
            ]);
        });
    });

    it("moves to the next topic only after the current one is finished", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("p6@example.com");
            const values = (await path(learner)).rows.filter(
                (r) => r.topic_slug === "values"
            );

            for (const row of values.slice(0, -1)) {
                await demonstrate(learner, row.concept_slug);
            }

            expect(
                (await path(learner)).current?.topic_slug,
                "one concept left, so still in values"
            ).toBe("values");

            await demonstrate(learner, values.at(-1)!.concept_slug);

            expect((await path(learner)).current?.topic_slug).toBe("variables");
        });
    });

    it("does not move for another learner", async () => {
        await fx.scenario(async () => {
            const studious = await fx.insertUser("p7a@example.com");
            const bystander = await fx.insertUser("p7b@example.com");

            await demonstrate(studious, "console-output");

            expect((await path(studious)).current?.concept_slug).toBe(
                "expressions-produce-values"
            );
            expect((await path(bystander)).current?.concept_slug).toBe("console-output");
        });
    });

    it("is idempotent -- re-walking a lesson changes nothing", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("p8@example.com");

            await demonstrate(learner, "console-output");
            await demonstrate(learner, "console-output");

            const [{ n }] = await fx.rows<{ n: number }>(
                `SELECT COUNT(*)::INT n FROM concept_demonstrations WHERE user_id = $1`,
                [learner]
            );

            expect(n).toBe(1);
        });
    });

    it("keeps the record that a learner needed a retry", async () => {
        // Recorded, not acted on. Overwriting it on a clean second pass would
        // erase the only evidence a remediation pass could use.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("p9@example.com");

            await demonstrate(learner, "console-output", true);
            await demonstrate(learner, "console-output", false);

            const [{ needed_retry }] = await fx.rows<{ needed_retry: boolean }>(
                `SELECT needed_retry FROM concept_demonstrations WHERE user_id = $1`,
                [learner]
            );

            expect(needed_retry).toBe(true);
        });
    });
});

// ── the lessons themselves ───────────────────────────────────────────────

describe("the authored lessons are teachable, not a question pool", () => {
    it("names only concepts the curriculum declares", async () => {
        const slugs = (
            await fx.rows<{ slug: string }>(`SELECT slug FROM concepts`)
        ).map((r) => r.slug);

        for (const lesson of LESSONS) {
            expect(slugs, `${lesson.concept} is not a curriculum concept`).toContain(
                lesson.concept
            );
        }
    });

    it("covers the whole values topic, in curriculum order", async () => {
        const values = (
            await fx.rows<{ slug: string }>(
                `SELECT c.slug FROM concepts c JOIN topics t ON t.id = c.topic_id
                 WHERE t.slug = 'values' ORDER BY c.display_order`
            )
        ).map((r) => r.slug);

        // Every concept, not just the front: the journey walks all seven, so a
        // gap would dead-end the learner before Variables could unlock.
        expect([...LESSONS, ...VALUES_TAIL_LESSONS].map((l) => l.concept)).toEqual(values);
    });

    it("teaches before it asks", async () => {
        for (const lesson of LESSONS) {
            expect(lesson.teach.length, `${lesson.concept} shows no worked example`)
                .toBeGreaterThan(0);
            expect(lesson.notice.length, `${lesson.concept} says nothing to notice`)
                .toBeGreaterThan(10);
            expect(lesson.why.length, `${lesson.concept} never says why`).toBeGreaterThan(20);
        }
    });

    it("opens on recognition or a single prediction, never deep reasoning", async () => {
        for (const lesson of LESSONS) {
            expect(
                ["recognise", "predict"],
                `${lesson.concept} opens on something harder`
            ).toContain(lesson.steps[0]!.demand);
        }
    });

    it("gives every wrong answer feedback that names the misconception", async () => {
        const walk = (lesson: (typeof LESSONS)[number]) =>
            lesson.steps.flatMap((s) => [s, ...(s.retry ? [s.retry] : [])]);

        for (const lesson of LESSONS) {
            for (const step of walk(lesson)) {
                expect(
                    step.choices.filter((c) => c.correct),
                    `${lesson.concept}: "${step.ask}" needs exactly one right answer`
                ).toHaveLength(1);

                for (const wrong of step.choices.filter((c) => !c.correct)) {
                    expect(
                        wrong.feedback,
                        `${lesson.concept}: "${wrong.text}" teaches nothing`
                    ).toBeTruthy();
                    expect(wrong.feedback!.length).toBeGreaterThan(25);
                    expect(
                        wrong.feedback!.toLowerCase(),
                        "feedback must explain, not just judge"
                    ).not.toBe("incorrect");
                }
            }
        }
    });

    it("never retries with the identical question", async () => {
        // Repeating it rewards guessing; a neighbour asks whether the
        // explanation landed.
        for (const lesson of LESSONS) {
            for (const step of lesson.steps) {
                if (!step.retry) continue;

                expect(
                    step.retry.ask === step.ask && step.retry.code === step.code,
                    `${lesson.concept} retries with the same question`
                ).toBe(false);
            }
        }
    });

    it("confirms a right answer with the rule rather than a cheer", async () => {
        for (const lesson of LESSONS) {
            for (const step of lesson.steps) {
                expect(step.confirm.length, `${lesson.concept} confirm is too thin`)
                    .toBeGreaterThan(10);
            }
        }
    });
});

// ── the loop is not a game ───────────────────────────────────────────────

describe("learning happens before pressure", () => {
    const page = readFileSync(
        new URL("../../../client/src/pages/LessonPage.tsx", import.meta.url),
        "utf8"
    );

    it("has no clock", () => {
        for (const timed of ["Countdown", "deadline", "timeLimit", "setInterval"]) {
            expect(page, `the lesson must not be timed (${timed})`).not.toContain(timed);
        }
    });

    it("awards no XP and keeps no score DURING the lesson", () => {
        // Scoped to the interaction. The completion screen does report the
        // points earned -- that is the recognition the learner should get --
        // but nothing is counted while they are still working through it, so
        // there is no running score to play for.
        //
        // Statements only: prose about an absence is not the absence.
        const interaction = readFileSync(
            new URL("../../../client/src/components/SceneLesson.tsx", import.meta.url),
            "utf8"
        );
        const code = interaction
            .split("\n")
            .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
            .join("\n");

        for (const word of ["xp", "score", "points"]) {
            expect(
                new RegExp(`\\b${word}\\b`, "i").test(code),
                `the lesson interaction mentions ${word}`
            ).toBe(false);
        }
    });

    it("walks the authored order rather than shuffling", () => {
        expect(page).not.toContain("Math.random");
        expect(page).toContain("lesson.steps[index]");
    });
});

// ── the three-topic journey ──────────────────────────────────────────────

/** Marks a topic's cumulative challenge passed. */
async function passChallenge(userId: string, topic: string) {
    await fx.db.query(
        `INSERT INTO topic_challenge_completions (user_id, topic_id)
         SELECT $1, t.id FROM topics t WHERE t.slug = $2
         ON CONFLICT (user_id, topic_id) DO NOTHING`,
        [userId, topic]
    );
}

/** Every concept of a topic, in curriculum order. */
async function conceptsOf(topic: string): Promise<string[]> {
    const rows = await fx.rows<{ slug: string }>(
        `SELECT c.slug FROM concepts c JOIN topics t ON t.id = c.topic_id
         WHERE t.slug = $1 ORDER BY c.display_order`,
        [topic]
    );

    return rows.map((r) => r.slug);
}

/** Has the learner reached this topic's first concept? */
async function reached(userId: string, topic: string): Promise<boolean> {
    const { current } = await path(userId);

    return current?.topic_slug === topic;
}

describe("a topic is not complete until its challenge is passed", () => {
    it("holds the learner at values with every values lesson done", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("c1@example.com");

            for (const slug of await conceptsOf("values")) {
                await demonstrate(learner, slug);
            }

            // Every concept demonstrated, challenge not taken. The concept-level
            // path has moved on, but the topic has not completed.
            const done = await fx.rows<{ n: number }>(
                `SELECT COUNT(*)::INT n FROM topic_challenge_completions WHERE user_id = $1`,
                [learner]
            );

            expect(done[0]!.n, "no challenge passed yet").toBe(0);
        });
    });

    it("completes values only once the challenge is passed", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("c2@example.com");

            for (const slug of await conceptsOf("values")) {
                await demonstrate(learner, slug);
            }
            await passChallenge(learner, "values");

            const [{ n }] = await fx.rows<{ n: number }>(
                `SELECT COUNT(*)::INT n FROM topic_challenge_completions tc
                 JOIN topics t ON t.id = tc.topic_id
                 WHERE tc.user_id = $1 AND t.slug = 'values'`,
                [learner]
            );

            expect(n).toBe(1);
        });
    });

    it("re-taking a challenge records one fact, not two", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("c3@example.com");

            await passChallenge(learner, "values");
            await passChallenge(learner, "values");

            const [{ n }] = await fx.rows<{ n: number }>(
                `SELECT COUNT(*)::INT n FROM topic_challenge_completions WHERE user_id = $1`,
                [learner]
            );

            expect(n).toBe(1);
        });
    });
});

describe("values unlocks variables unlocks operators", () => {
    it("does not reach variables while a values concept is outstanding", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("u1@example.com");
            const values = await conceptsOf("values");

            for (const slug of values.slice(0, -1)) {
                await demonstrate(learner, slug);
            }

            expect(await reached(learner, "variables")).toBe(false);
            expect((await path(learner)).current?.topic_slug).toBe("values");
        });
    });

    it("reaches variables once values is worked through", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("u2@example.com");

            for (const slug of await conceptsOf("values")) {
                await demonstrate(learner, slug);
            }
            await passChallenge(learner, "values");

            expect(await reached(learner, "variables")).toBe(true);
            expect((await path(learner)).current?.concept_slug).toBe(
                "variables-name-values"
            );
        });
    });

    it("does not reach operators while a variables concept is outstanding", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("u3@example.com");

            for (const slug of await conceptsOf("values")) await demonstrate(learner, slug);
            await passChallenge(learner, "values");

            const variables = await conceptsOf("variables");
            for (const slug of variables.slice(0, -1)) await demonstrate(learner, slug);

            expect(await reached(learner, "operators")).toBe(false);
        });
    });

    it("reaches operators once variables is worked through", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("u4@example.com");

            for (const topic of ["values", "variables"]) {
                for (const slug of await conceptsOf(topic)) await demonstrate(learner, slug);
                await passChallenge(learner, topic);
            }

            expect(await reached(learner, "operators")).toBe(true);
            expect((await path(learner)).current?.concept_slug).toBe(
                "arithmetic-operators"
            );
        });
    });

    it("keeps progress across a re-entry", async () => {
        // Nothing is held in the page. Reading the path again is the whole of
        // "refresh and carry on".
        await fx.scenario(async () => {
            const learner = await fx.insertUser("u5@example.com");

            await demonstrate(learner, "console-output");

            const first = await path(learner);
            const second = await path(learner);

            expect(second.current?.concept_slug).toBe(first.current?.concept_slug);
            expect(second.demonstrated).toEqual(["console-output"]);
        });
    });
});

// ── the authored content, across all three topics ────────────────────────

describe("variables and operators are authored to the curriculum's order", () => {
    it("teaches every variables concept, in curriculum order", async () => {
        expect(VARIABLES_LESSONS.map((l) => l.concept)).toEqual(
            await conceptsOf("variables")
        );
    });

    it("teaches every operators concept, in curriculum order", async () => {
        expect(OPERATORS_LESSONS.map((l) => l.concept)).toEqual(
            await conceptsOf("operators")
        );
    });

    it("has a cumulative challenge for each of the three topics", () => {
        expect(TOPIC_CHALLENGES.map((c) => c.challengeFor)).toEqual([
            "values",
            "variables",
            "operators"
        ]);
    });

    it("gives challenges no teaching -- they check, they do not introduce", () => {
        for (const challenge of TOPIC_CHALLENGES) {
            expect(challenge.teach, `${challenge.challengeFor} challenge teaches`).toEqual([]);
            expect(challenge.steps.length).toBeGreaterThanOrEqual(3);
        }
    });

    it("holds every authored lesson to the same standard", () => {
        const walk = (l: (typeof ALL_LESSONS)[number]) =>
            l.steps.flatMap((s) => [s, ...(s.retry ? [s.retry] : [])]);

        for (const lesson of ALL_LESSONS) {
            const label = lesson.concept ?? `${lesson.challengeFor} challenge`;

            for (const step of walk(lesson)) {
                expect(
                    step.choices.filter((c) => c.correct),
                    `${label}: "${step.ask}" needs exactly one right answer`
                ).toHaveLength(1);

                for (const wrong of step.choices.filter((c) => !c.correct)) {
                    expect(wrong.feedback, `${label}: "${wrong.text}" teaches nothing`)
                        .toBeTruthy();
                    expect(wrong.feedback!.length).toBeGreaterThan(25);
                }
            }

            for (const step of lesson.steps) {
                if (!step.retry) continue;

                expect(
                    step.retry.ask === step.ask && step.retry.code === step.code,
                    `${label} retries with the same question`
                ).toBe(false);
            }
        }
    });

    it("covers all three topics and nothing beyond them", () => {
        const taught = new Set(ALL_LESSONS.map((l) => l.concept ?? l.challengeFor));

        expect(taught.size, "21 concepts plus 3 challenges").toBe(24);
    });
});

describe("every concept on the three-topic path has a lesson", () => {
    it("leaves no gap a learner could walk into", async () => {
        // The failure this catches is specific and was real: the journey walks
        // every concept the curriculum declares, so a concept with no authored
        // lesson is a dead end the learner cannot get past — and Values has
        // seven concepts, not the five the first pass wrote.
        const authored = new Set(
            ALL_LESSONS.filter((l) => l.concept).map((l) => l.concept as string)
        );

        for (const topic of ["values", "variables", "operators"]) {
            for (const slug of await conceptsOf(topic)) {
                expect(authored, `${topic} → ${slug} has no lesson`).toContain(slug);
            }
        }
    });
});

// ── the beginner gradient ────────────────────────────────────────────────

describe("the opening lessons show before they ask", () => {
    /** The topic a learner meets first, where the ramp matters most. */
    const opening = [...LESSONS, ...VALUES_TAIL_LESSONS];

    it("shows real output, not a description of it", async () => {
        // SEE IT. A note reading "prints Hello" asks the learner to imagine the
        // output; an output block shows it. Every snippet that logs something
        // must carry what it logs.
        for (const lesson of opening) {
            for (const block of lesson.teach) {
                if (!block.code.includes("console.log")) continue;

                expect(
                    block.output,
                    `${lesson.concept}: "${block.code.split("\n")[0]}" shows no output`
                ).toBeDefined();
            }
        }
    });

    it("names the pieces of the very first thing a learner sees", async () => {
        // UNDERSTAND IT. console.log("Hello") is four unfamiliar things at once.
        // The first teach block of the first lesson has to say which is which.
        const first = opening[0]!;

        expect(first.concept).toBe("console-output");
        expect(first.teach[0]!.parts, "the opening example is not broken down")
            .toBeDefined();
        expect(first.teach[0]!.parts!.length).toBeGreaterThanOrEqual(3);
    });

    it("opens each lesson on a question the teaching just answered", async () => {
        // The first step must be answerable by someone who has read the teach
        // block and nothing else. A first step whose code introduces syntax the
        // teaching never showed is the "five problems in one question" failure.
        for (const lesson of opening) {
            const first = lesson.steps[0]!;
            const shown = lesson.teach.map((t) => t.code).join("\n");

            if (!first.code) continue;

            // Every identifier-ish token in the question should have appeared in
            // the teaching, ignoring the values themselves.
            const vocabulary = (text: string) =>
                (text.match(/[a-zA-Z_][a-zA-Z0-9_.]*/g) ?? []).filter(
                    (word) => !["true", "false"].includes(word)
                );

            for (const word of vocabulary(first.code)) {
                expect(
                    vocabulary(shown),
                    `${lesson.concept}: first question uses ${word}, never shown in the teaching`
                ).toContain(word);
            }
        }
    });

    it("ramps within a lesson rather than jumping", async () => {
        // console-output is the worked example of the gradient: four steps, each
        // a small move on from the last, before the learner is asked to tell a
        // string from a number at all.
        const first = opening[0]!;

        expect(first.steps.length, "the opening lesson needs room to ramp")
            .toBeGreaterThanOrEqual(4);
        expect(first.steps[0]!.demand).toBe("recognise");
    });

    it("carries the next idea as an aside rather than springing it as a question", async () => {
        // "The quotes are not printed" is introduced while the learner is
        // looking at an example of it — not two steps later as a question.
        const withAsides = opening.filter((l) => l.steps.some((s) => s.aside));

        expect(
            withAsides.length,
            "the opening topic should introduce ideas beside the answers"
        ).toBeGreaterThanOrEqual(4);

        for (const lesson of opening) {
            for (const step of lesson.steps) {
                if (!step.aside) continue;

                expect(
                    step.aside.length,
                    `${lesson.concept}: an aside should say something`
                ).toBeGreaterThan(30);
            }
        }
    });
});

// ── the interactive lesson, and what it pays ─────────────────────────────

describe("the console-output lesson is discovered, not explained", () => {
    it("makes the learner run code before anything is claimed about it", async () => {
        const { CONSOLE_OUTPUT } = await import("../../../client/src/games/scenes.ts");

        // The first thing the learner DOES is run code — scenes before it are
        // read-only reassurance, and nothing is claimed about JavaScript until
        // they have watched a line of it work.
        const firstInteractive = CONSOLE_OUTPUT.scenes.findIndex(
            (s) => s.kind === "run" || s.kind === "edit"
        );
        const firstAsk = CONSOLE_OUTPUT.scenes.findIndex((s) => s.kind === "ask");

        expect(firstInteractive).toBeGreaterThan(-1);
        expect(firstInteractive, "running comes before being asked").toBeLessThan(firstAsk);
    });

    it("holds the terminology back until the learner has done everything", async () => {
        // The ordering error this pins. The reveal used to sit at scene 5 --
        // before the learner had changed a single character -- so the code was
        // taken apart with names for its pieces while it was still unfamiliar.
        // Terminology confirms an experience; it cannot substitute for one.
        const { CONSOLE_OUTPUT } = await import("../../../client/src/games/scenes.ts");
        const at = (kind: string) => CONSOLE_OUTPUT.scenes.findIndex((s) => s.kind === kind);

        const reveal = at("reveal");

        expect(reveal, "there is a concept reveal").toBeGreaterThan(-1);
        expect(reveal, "after they have run code").toBeGreaterThan(at("run"));
        expect(reveal, "after they have CHANGED code").toBeGreaterThan(at("edit"));
        expect(reveal, "after they have answered something").toBeGreaterThan(at("ask"));
    });

    it("keeps the learner oriented in a place, not just a lesson", async () => {
        // "What am I learning?" has to be answerable without leaving the scene.
        // The topic is named as a PLACE because the journey is meant to become
        // somewhere a learner goes -- naming it now makes that a visual change
        // later rather than a new idea.
        const { CONSOLE_OUTPUT } = await import("../../../client/src/games/scenes.ts");

        expect(CONSOLE_OUTPUT.place).toBe("Values");

        const player = readFileSync(
            new URL("../../../client/src/components/SceneLesson.tsx", import.meta.url),
            "utf8"
        );

        expect(player, "and it is on screen throughout").toContain("scene-place");
    });

    it("makes running take long enough to watch", async () => {
        // Instant output reads as a caption printed beside the code. The delay
        // and the travelling pulse are what make it read as a consequence.
        const player = readFileSync(
            new URL("../../../client/src/components/SceneLesson.tsx", import.meta.url),
            "utf8"
        );

        expect(player, "the run has a deliberate duration").toContain("900");
        expect(player, "and collapses for reduced motion").toContain(
            "prefers-reduced-motion"
        );
    });

    it("lets the learner run code several times before asking anything", async () => {
        const { CONSOLE_OUTPUT } = await import("../../../client/src/games/scenes.ts");
        const runs = CONSOLE_OUTPUT.scenes.filter((s) => s.kind === "run");

        expect(runs.length).toBeGreaterThanOrEqual(3);

        for (const run of runs) {
            expect(run.kind === "run" && run.output, "every run shows real output").toBeTruthy();
        }
    });

    it("does not ask the learner to predict anything until late in the lesson", async () => {
        // The ramp. A beginner who gets the first question wrong was failed by
        // the scenes before it, so the first question comes after they have
        // read, watched, been told what happened, seen it taken apart, and
        // changed it themselves.
        const { CONSOLE_OUTPUT } = await import("../../../client/src/games/scenes.ts");
        const firstAsk = CONSOLE_OUTPUT.scenes.findIndex((s) => s.kind === "ask");

        expect(firstAsk, "the first question is not in the opening half").toBeGreaterThan(
            CONSOLE_OUTPUT.scenes.length / 2
        );
    });

    it("has the learner change the code and run their own version", async () => {
        // THE SCENE THAT TEACHES. Watching output appear proves the line does
        // something; changing it and watching the output follow proves what it
        // does, and proves it to the learner rather than telling them.
        const { CONSOLE_OUTPUT } = await import("../../../client/src/games/scenes.ts");
        const edit = CONSOLE_OUTPUT.scenes.find((s) => s.kind === "edit");

        expect(edit, "the lesson never lets the learner change anything").toBeDefined();
        expect(edit!.kind === "edit" && edit!.template).toContain("{slot}");

        // And it comes before the first question, so the question is a
        // formality rather than a test.
        const editAt = CONSOLE_OUTPUT.scenes.findIndex((s) => s.kind === "edit");
        const firstAsk = CONSOLE_OUTPUT.scenes.findIndex((s) => s.kind === "ask");

        expect(editAt).toBeLessThan(firstAsk);
    });

    it("gives the learner moments to notice what happened, not just questions", async () => {
        const { CONSOLE_OUTPUT } = await import("../../../client/src/games/scenes.ts");
        const moments = CONSOLE_OUTPUT.scenes.filter((s) => s.kind === "moment");

        expect(moments.length, "a lesson of pure interaction never lets anyone land")
            .toBeGreaterThanOrEqual(4);

        for (const moment of moments) {
            if (moment.kind !== "moment") continue;

            expect(moment.lines.length, "a moment is one or two lines, never a paragraph")
                .toBeLessThanOrEqual(3);
            expect(moment.action, "and its button says what it does").not.toBe("Next");
        }
    });

    it("opens on reassurance rather than on code", async () => {
        const { CONSOLE_OUTPUT } = await import("../../../client/src/games/scenes.ts");
        const first = CONSOLE_OUTPUT.scenes[0]!;

        expect(first.kind).toBe("moment");
        expect(first.kind === "moment" && first.headline).toContain(
            "don't need to know JavaScript"
        );
    });

    it("gives every wrong answer a specific misconception", async () => {
        const { CONSOLE_OUTPUT } = await import("../../../client/src/games/scenes.ts");

        for (const scene of CONSOLE_OUTPUT.scenes) {
            if (scene.kind !== "ask") continue;

            for (const choice of scene.choices.filter((c) => !c.correct)) {
                expect(choice.feedback, `"${choice.text}" teaches nothing`).toBeTruthy();
                expect(choice.feedback!.length).toBeGreaterThan(25);
            }
        }
    });

    it("carries a demonstration near the end", async () => {
        const { CONSOLE_OUTPUT } = await import("../../../client/src/games/scenes.ts");
        const demonstration = CONSOLE_OUTPUT.scenes.find(
            (s) => s.kind === "ask" && s.final
        );

        expect(demonstration, "nothing in the lesson is the demonstration").toBeDefined();
    });

    it("closes on what the learner can now do, not on a question", async () => {
        // The last thing a learner reads should be the point of the lesson, not
        // the answer to its final question. "You can now write a program that
        // shows something" is what they came for.
        const { CONSOLE_OUTPUT } = await import("../../../client/src/games/scenes.ts");
        const last = CONSOLE_OUTPUT.scenes.at(-1)!;

        expect(last.kind).toBe("moment");
        expect(last.kind === "moment" && last.eyebrow).toContain("you can now");
    });

    it("never names a concept it has not taught", async () => {
        const { CONSOLE_OUTPUT } = await import("../../../client/src/games/scenes.ts");
        const prose = CONSOLE_OUTPUT.scenes
            .map((s) =>
                s.kind === "run"
                    ? `${s.invite} ${s.after}`
                    : s.kind === "reveal"
                      ? `${s.headline} ${s.parts.map((p) => p.means).join(" ")}`
                      : `${s.ask} ${s.confirm} ${s.aside ?? ""}`
            )
            .join(" ")
            .toLowerCase();

        // Terminology a learner on their first lesson has never met.
        for (const jargon of ["expression", "argument", "coercion", "variable", "function"]) {
            expect(prose, `the first lesson uses the word "${jargon}"`).not.toContain(jargon);
        }
    });
});

describe("points come from understanding, and cannot be farmed", () => {
    it("pays nothing to a learner who has demonstrated nothing", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("pt1@example.com");
            const [row] = await fx.rows<{ concepts: number; challenges: number }>(
                `SELECT (SELECT COUNT(*)::INT FROM concept_demonstrations WHERE user_id = $1) AS concepts,
                        (SELECT COUNT(*)::INT FROM topic_challenge_completions WHERE user_id = $1) AS challenges`,
                [learner]
            );

            expect(row!.concepts * 25 + row!.challenges * 75).toBe(0);
        });
    });

    it("pays for each concept demonstrated", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("pt2@example.com");

            await demonstrate(learner, "console-output");
            await demonstrate(learner, "expressions-produce-values");

            const [row] = await fx.rows<{ n: number }>(
                `SELECT COUNT(*)::INT n FROM concept_demonstrations WHERE user_id = $1`,
                [learner]
            );

            expect(row!.n * 25).toBe(50);
        });
    });

    it("pays nothing for re-walking a lesson", async () => {
        // The anti-farming property, and it is structural rather than a rule:
        // the primary key makes the second walk insert nothing, so it earns
        // nothing. There is no repeatable action that pays.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("pt3@example.com");

            await demonstrate(learner, "console-output");
            await demonstrate(learner, "console-output");
            await demonstrate(learner, "console-output");

            const [row] = await fx.rows<{ n: number }>(
                `SELECT COUNT(*)::INT n FROM concept_demonstrations WHERE user_id = $1`,
                [learner]
            );

            expect(row!.n, "three walks, one payment").toBe(1);
        });
    });

    it("is one learner's own", async () => {
        await fx.scenario(async () => {
            const a = await fx.insertUser("pt4a@example.com");
            const b = await fx.insertUser("pt4b@example.com");

            await demonstrate(a, "console-output");

            const [row] = await fx.rows<{ n: number }>(
                `SELECT COUNT(*)::INT n FROM concept_demonstrations WHERE user_id = $1`,
                [b]
            );

            expect(row!.n).toBe(0);
        });
    });

    it("leaves the games' XP constants alone", async () => {
        const xp = readFileSync(new URL("../games/xp.ts", import.meta.url), "utf8");

        expect(xp).toContain("PERFECT_GAME_XP = 125");
        expect(xp).toContain("COMPLETION_BONUS_XP = 25");
    });
});

// ── the entry experience ─────────────────────────────────────────────────

describe("a learner always has one obvious next action", () => {
    const home = readFileSync(
        new URL("../../../client/src/pages/HomePage.tsx", import.meta.url),
        "utf8"
    );
    const app = readFileSync(
        new URL("../../../client/src/App.tsx", import.meta.url),
        "utf8"
    );

    it("puts Home at the front door and the games one step in", () => {
        // `/` used to be the games grid, for everyone, signed in or not. A
        // first-time visitor had to already know what Jolt was to choose one.
        expect(app).toContain('<Route path="/" element={<HomePage />} />');
        expect(app).toContain('<Route path="/play" element={<LandingPage />} />');
    });

    it("tells a signed-out visitor what Jolt is before asking anything", () => {
        expect(home).toContain("Learn JavaScript by playing with it");
        expect(home, "and that no prior code is needed").toContain(
            "You do not need to know any code"
        );
    });

    it("offers exactly one primary action on each branch", () => {
        // One `button primary big` for the signed-out branch and one for the
        // signed-in branch. More than that is the choose-your-destination
        // problem this page exists to remove.
        const primaries = home.match(/className="button primary big/g) ?? [];

        expect(primaries).toHaveLength(2);
    });

    it("points that action at the concept the existing progression chose", () => {
        // Home reads /api/curriculum/path rather than deciding anything itself,
        // so Home and Journey can never disagree about what is next.
        expect(home).toContain("/api/curriculum/path");
        expect(home).toContain("`/learn/${current.slug}`");
        expect(home, "and at the challenge when that is what is due").toContain(
            "`/challenge/${challenge.slug}`"
        );
    });

    it("keeps the navigation to four ordered destinations", () => {
        const nav = app.slice(app.indexOf("{user ? ("), app.indexOf("Log out"));
        const links = [...nav.matchAll(/<Link to="([^"]+)">([^<]+)<\/Link>/g)].map(
            (m) => m[2]
        );

        expect(links).toEqual(["Home", "Journey", "Play", "History"]);
    });
});

describe("finishing a concept is recognised as a capability", () => {
    const complete = readFileSync(
        new URL("../../../client/src/components/ConceptComplete.tsx", import.meta.url),
        "utf8"
    );

    it("says what the learner can do, in the curriculum's own words", () => {
        // `objective` completes "I know how to ___" by construction, so this is
        // authored curriculum text rather than a second copy written for the UI.
        expect(complete).toContain("You can now");
        expect(complete).toContain("just?.objective");
    });

    it("shows the points earned", () => {
        expect(complete).toContain("+25");
    });

    it("hands the learner straight to the next thing", () => {
        expect(complete).toContain("`/learn/${next.slug}`");
        expect(complete).toContain("Continue");
    });

    it("reads the total back from the server rather than inventing one", () => {
        expect(complete).toContain("/api/curriculum/path");
    });
});
