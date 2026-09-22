import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { demandCeilingCte, metDemandsCte } from "./demand.js";

/**
 * The demand ceiling -- what kind of thinking a learner should meet next --
 * executed against a real PostgreSQL.
 *
 * THE FIXTURE CONCEPT IS `recursion`, chosen because the curriculum really does
 * declare exactly the ladder this behaviour is specified against:
 *
 *     predict (3) -> produce (4) -> diagnose (5)
 *
 * Nothing is invented for the test. The rung ORDERS are never written down
 * here either -- every assertion resolves a slug through `demands`, so
 * renumbering the ladder in the curriculum would move these tests with it rather
 * than break them.
 *
 * This layer is deliberately NOT wired into candidate selection; the last block
 * asserts that, because it is a decision rather than an omission.
 */

const LADDER = "recursion";

/** A second concept with a different ladder: predict, diagnose, repair, explain. */
const OTHER = "equality";

let fx: CurriculumFixture;

/** demands.display_order, read from the database rather than assumed. */
let order: Record<string, number>;

beforeAll(async () => {
    fx = await buildCurriculumFixture();

    const rungs = await fx.rows<{ slug: string; display_order: number }>(
        `SELECT slug, display_order FROM demands`
    );

    order = Object.fromEntries(rungs.map((r) => [r.slug, r.display_order]));

    const declared = await fx.rows<{ slug: string }>(
        `SELECT d.slug FROM concept_demands cd
         JOIN concepts c ON c.id = cd.concept_id
         JOIN demands d  ON d.id = cd.demand_id
         WHERE c.slug = $1 ORDER BY d.display_order`,
        [LADDER]
    );

    expect(
        declared.map((r) => r.slug),
        "the fixture depends on this ladder being what the curriculum declares"
    ).toEqual(["predict", "produce", "diagnose"]);
}, 120_000);

// ── reading the derived state ────────────────────────────────────────────

/** The demand ceiling for one concept, as a rung name. */
async function ceiling(userId: string, concept: string): Promise<string | null> {
    const found = await fx.rows<{ slug: string }>(
        `WITH ${demandCeilingCte("$1")}
         SELECT d.slug
         FROM demand_ceiling dc
         JOIN concepts c ON c.id = dc.concept_id
         JOIN demands d  ON d.display_order = dc.ceiling_order
         WHERE c.slug = $2`,
        [userId, concept]
    );

    return found[0]?.slug ?? null;
}

/** Every rung this learner has faced on a concept, shallowest first. */
async function faced(userId: string, concept: string): Promise<string[]> {
    const found = await fx.rows<{ slug: string }>(
        `WITH ${metDemandsCte("$1")}
         SELECT d.slug
         FROM met_demands md
         JOIN concepts c ON c.id = md.concept_id
         JOIN demands d  ON d.display_order = md.demand_order
         WHERE c.slug = $2
         ORDER BY d.display_order`,
        [userId, concept]
    );

    return found.map((r) => r.slug);
}

/** Practice at one rung of the ladder concept, behind its own question. */
async function rung(demand: string) {
    return fx.challengeFor(LADDER, "practise", { demand });
}

// ── 1-3 · the ladder climbs ──────────────────────────────────────────────

describe("1 · a learner with no practice starts at the shallowest declared rung", () => {
    it("points at predict, not recall or recognise", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d1@example.com");

            expect(await faced(learner, LADDER)).toEqual([]);
            expect(await ceiling(learner, LADDER)).toBe("predict");
        });
    });

    it("never points at a rung the concept does not declare", async () => {
        // recursion declares no `recall` and no `explain`, so its ladder starts
        // at predict and ends at diagnose. A concept is not assumed to use all
        // seven.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d1b@example.com");
            const reached = await ceiling(learner, LADDER);

            expect(["predict", "produce", "diagnose"]).toContain(reached);
        });
    });
});

describe("2 · facing predict raises the ceiling to produce", () => {
    it("advances one rung", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d2@example.com");
            const predict = await rung("predict");

            await fx.encounter(learner, predict.questionId, "answered");

            expect(await faced(learner, LADDER)).toEqual(["predict"]);
            expect(await ceiling(learner, LADDER)).toBe("produce");
        });
    });
});

describe("3 · facing produce raises it to diagnose", () => {
    it("advances again", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d3@example.com");
            const predict = await rung("predict");
            const produce = await rung("produce");

            await fx.encounter(learner, predict.questionId, "answered");
            await fx.encounter(learner, produce.questionId, "answered");

            expect(await ceiling(learner, LADDER)).toBe("diagnose");
        });
    });

    it("stops at the deepest rung the concept declares", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d3b@example.com");

            for (const name of ["predict", "produce", "diagnose"]) {
                const step = await rung(name);
                await fx.encounter(learner, step.questionId, "answered");
            }

            expect(
                await ceiling(learner, LADDER),
                "nothing deeper is declared, so the ceiling stays"
            ).toBe("diagnose");
        });
    });
});

// ── 4 · out-of-order exposure is not punished ────────────────────────────

describe("4 · a rung reached early is not taken away", () => {
    it("holds the ceiling at diagnose when produce was skipped", async () => {
        // THE CASE THIS LAYER EXISTS TO GET RIGHT. Games are different
        // modalities: a learner can meet diagnostic work in Bug Hunt long before
        // producing anything in Code Blitz. Sending them back down the ladder
        // would punish them for how the content happened to be dealt.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d4@example.com");
            const predict = await rung("predict");
            const diagnose = await rung("diagnose");

            await fx.encounter(learner, predict.questionId, "answered");
            await fx.encounter(learner, diagnose.questionId, "answered");

            expect(await faced(learner, LADDER)).toEqual(["predict", "diagnose"]);
            expect(await ceiling(learner, LADDER), "not produce").toBe("diagnose");
        });
    });

    it("reaches the top from a single deep encounter", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d4b@example.com");
            const diagnose = await rung("diagnose");

            await fx.encounter(learner, diagnose.questionId, "answered");

            expect(await ceiling(learner, LADDER)).toBe("diagnose");
        });
    });

    it("leaves the skipped rung reachable rather than consumed", async () => {
        // A ceiling admits everything beneath it. produce is still ahead of the
        // learner; it has simply stopped gating.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d4c@example.com");
            const diagnose = await rung("diagnose");

            await fx.encounter(learner, diagnose.questionId, "answered");

            expect(await faced(learner, LADDER)).not.toContain("produce");
            expect(order.produce).toBeLessThan(order[(await ceiling(learner, LADDER))!]!);
        });
    });
});

// ── 5-6 · what counts as exposure ────────────────────────────────────────

describe("5 · a wrong answer is still exposure", () => {
    it("advances on a timed-out question", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d5@example.com");
            const predict = await rung("predict");

            await fx.encounter(learner, predict.questionId, "timed_out");

            expect(await ceiling(learner, LADDER)).toBe("produce");
        });
    });

    it("advances on an incorrect answer", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d5b@example.com");
            const predict = await rung("predict");
            const [session] = await fx.rows<{ id: string }>(
                `INSERT INTO game_sessions (user_id, game_id, status, completed_at)
                 VALUES ($1, (SELECT id FROM games WHERE slug = 'code-blitz'),
                         'completed', CURRENT_TIMESTAMP)
                 RETURNING id`,
                [learner]
            );

            await fx.db.query(
                `INSERT INTO session_questions
                     (game_session_id, question_id, display_order, prompt_text, status,
                      served_at, answered_at, is_correct, selected_option_id,
                      selected_option_text, correct_option_text)
                 SELECT $1, $2, 1, 'p', 'answered',
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, FALSE,
                        o.id, o.option_text, 'x'
                 FROM question_options o
                 WHERE o.question_id = $2 AND NOT o.is_correct
                 LIMIT 1`,
                [session!.id, predict.questionId]
            );

            expect(
                await ceiling(learner, LADDER),
                "having tried the thinking is the signal, not having got it right"
            ).toBe("produce");
        });
    });
});

describe("6 · a question dealt but never faced is not exposure", () => {
    it("ignores a pending session question", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d6@example.com");
            const predict = await rung("predict");

            await fx.encounter(learner, predict.questionId, "pending");

            expect(await faced(learner, LADDER)).toEqual([]);
            expect(await ceiling(learner, LADDER)).toBe("predict");
        });
    });

    it("ignores a pending Bug Hunt round", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d6b@example.com");
            const predict = await rung("predict");
            const slug = await fx.attachIncident(predict.challengeId);

            await fx.encounterIncident(learner, slug, "pending");

            expect(await ceiling(learner, LADDER)).toBe("predict");
        });
    });
});

// ── 7 · one ladder, both games ───────────────────────────────────────────

describe("7 · exposure is shared across games", () => {
    it("lets a Bug Hunt round advance the ladder Code Blitz reads", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d7a@example.com");
            const predict = await rung("predict");
            const slug = await fx.attachIncident(predict.challengeId);

            await fx.encounterIncident(learner, slug, "resolved");

            expect(await ceiling(learner, LADDER)).toBe("produce");
        });
    });

    it("counts a failed hunt the same as a resolved one", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d7b@example.com");
            const predict = await rung("predict");
            const slug = await fx.attachIncident(predict.challengeId);

            await fx.encounterIncident(learner, slug, "failed");

            expect(await ceiling(learner, LADDER)).toBe("produce");
        });
    });

    it("lets a Code Blitz answer advance a rung a Bug Hunt incident sits on", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d7c@example.com");
            const predict = await rung("predict");
            const diagnose = await rung("diagnose");

            await fx.attachIncident(diagnose.challengeId);
            await fx.encounter(learner, predict.questionId, "answered");

            expect(await ceiling(learner, LADDER)).toBe("produce");
        });
    });
});

// ── 8-9 · isolation ──────────────────────────────────────────────────────

describe("8 · ladders are per concept", () => {
    it("does not let progress on one concept move another's ceiling", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d8@example.com");
            const predict = await rung("predict");

            await fx.encounter(learner, predict.questionId, "answered");

            expect(await ceiling(learner, LADDER)).toBe("produce");
            expect(
                await ceiling(learner, OTHER),
                "equality has its own ladder and no exposure on it"
            ).toBe("predict");
        });
    });

    it("gives each concept the ladder it actually declares", async () => {
        // equality declares predict, diagnose, repair, explain -- no produce.
        // Its ceiling must step from predict to diagnose, never through a rung
        // it does not afford.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d8b@example.com");
            const predict = await fx.challengeFor(OTHER, "practise", { demand: "predict" });

            await fx.encounter(learner, predict.questionId, "answered");

            expect(await ceiling(learner, OTHER)).toBe("diagnose");
        });
    });
});

describe("9 · ladders are per learner", () => {
    it("does not let one learner's exposure move another's ceiling", async () => {
        await fx.scenario(async () => {
            const studious = await fx.insertUser("d9a@example.com");
            const bystander = await fx.insertUser("d9b@example.com");
            const predict = await rung("predict");

            await fx.encounter(studious, predict.questionId, "answered");

            expect(await ceiling(studious, LADDER)).toBe("produce");
            expect(await ceiling(bystander, LADDER)).toBe("predict");
        });
    });
});

// ── 10 · an undeclared rung cannot exist ─────────────────────────────────

describe("10 · a challenge at an undeclared rung is structurally impossible", () => {
    it("is refused by the composite foreign key", async () => {
        // recursion declares predict, produce and diagnose -- not explain. The
        // guarantee is the schema's (challenges_concept_demand_fk, migration
        // 021), not this layer's, which is why this layer never has to filter
        // exposure against concept_demands.
        await fx.scenario(async () => {
            await expect(
                fx.challengeFor(LADDER, "practise", { demand: "explain" })
            ).rejects.toThrow();
        });
    });

    it("means every faced rung is one the concept declares", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d10@example.com");
            const diagnose = await rung("diagnose");

            await fx.encounter(learner, diagnose.questionId, "answered");

            const undeclared = await fx.rows<{ n: number }>(
                `WITH ${metDemandsCte("$1")}
                 SELECT COUNT(*)::INT n
                 FROM met_demands md
                 JOIN demands d ON d.display_order = md.demand_order
                 WHERE NOT EXISTS (
                     SELECT 1 FROM concept_demands cd
                     WHERE cd.concept_id = md.concept_id AND cd.demand_id = d.id
                 )`,
                [learner]
            );

            expect(undeclared[0]!.n).toBe(0);
        });
    });
});

// ── 11-12 · introduce and reinforce do not climb ─────────────────────────

describe("11 · completing an introduction does not climb the ladder", () => {
    it("leaves the ceiling at the shallowest rung", async () => {
        // An introduction says the CONCEPT was met. It says nothing about which
        // kind of thinking the learner has done.
        expect(metDemandsCte("$1")).not.toContain("introduction_completions");

        await fx.scenario(async () => {
            const learner = await fx.insertUser("d11@example.com");
            const intro = await fx.challengeFor(LADDER, "introduce", { demand: "predict" });

            await fx.db.query(
                `INSERT INTO introduction_completions (user_id, challenge_id) VALUES ($1, $2)`,
                [learner, intro.challengeId]
            );

            expect(await faced(learner, LADDER)).toEqual([]);
            expect(await ceiling(learner, LADDER)).toBe("predict");
        });
    });

    it("ignores an introduce challenge even if its content were somehow faced", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d11b@example.com");
            const intro = await fx.challengeFor(LADDER, "introduce", { demand: "predict" });

            await fx.encounter(learner, intro.questionId, "answered");

            expect(await ceiling(learner, LADDER)).toBe("predict");
        });
    });
});

describe("12 · reinforcement revisits a rung without advancing it", () => {
    it("does not climb on a reinforce challenge", async () => {
        // The distinction reinforcement will rest on: revisiting `predict` is
        // not the same as reaching `produce`. Enforced now so that when
        // reinforcement arrives it cannot advance the ladder by accident.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("d12@example.com");
            const again = await fx.challengeFor(LADDER, "reinforce", { demand: "predict" });

            await fx.encounter(learner, again.questionId, "answered");

            expect(await faced(learner, LADDER)).toEqual([]);
            expect(await ceiling(learner, LADDER)).toBe("predict");
        });
    });
});

// ── the model is derived, and deliberately not yet wired ─────────────────

describe("the demand layer is a model, not yet a selector", () => {
    const here = (name: string) =>
        readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

    it("informs ordering but gates nothing", () => {
        // Code Blitz reads the ceiling so the selection policy can rank by
        // distance from it. It does NOT filter on it, and cannot yet: a
        // concept's ceiling starts at the shallowest rung it DECLARES, while
        // content is authored wherever it is authored. primitive-types declares
        // recognise and predict and has one exercise, at predict -- so a demand
        // gate would withhold the very practice the Learn beat unlocks.
        const blitz = here("../game/queries.ts");

        expect(blitz, "the ceiling is read").toContain("demandCeilingCte");
        expect(blitz, "but never composed into the WHERE clause").not.toContain(
            "withinDemandCeiling"
        );

        for (const file of ["selection.ts", "../bugHunt/queries.ts"]) {
            expect(here(file), `${file} must not consume demand yet`).not.toContain(
                "demand.js"
            );
        }
    });

    it("reads the ladder from the database, never from a constant here", () => {
        const source = here("demand.ts");

        expect(source).toContain("concept_demands");
        expect(source).toContain("display_order");

        for (const rung of ["recall", "recognise", "predict", "produce", "diagnose", "repair"]) {
            expect(source, `demand.ts must not hardcode ${rung}`).not.toContain(`'${rung}'`);
        }
    });

    it("owns one idea and leaves the others alone", () => {
        const source = here("demand.ts");

        expect(source, "prerequisites belong to eligibility.ts").not.toContain("prerequisites");
        expect(source, "difficulty belongs to frontier.ts").not.toContain(
            "met_difficulties"
        );
    });

    it("counts only practice", () => {
        expect(metDemandsCte("$1").match(/ch\.role = 'practise'/g) ?? []).toHaveLength(2);
    });

    it("refuses anything but a positional placeholder", () => {
        expect(() => metDemandsCte("1")).toThrow();
        expect(() => demandCeilingCte("$1; DROP TABLE users")).toThrow();
    });
});
