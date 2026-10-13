import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

/**
 * A real PostgreSQL, built from the repository's own migrations and seeds.
 *
 * WHY THIS EXISTS. Every other SQL-shaped test here is source-level: it reads a
 * query and asserts its shape, which is right when the interesting part is a
 * decision that could have been written in TypeScript. The curriculum
 * predicates cannot be tested that way and be worth anything -- no string match
 * distinguishes a predicate that gates correctly from one that quietly matches
 * every row. So these tests execute the real exported fragments instead.
 *
 * NOT A FRAMEWORK. Two test files use it, both under curriculum/. It is named
 * *.fixture.ts rather than *.test.ts so vitest does not try to run it and so
 * tsconfig can keep it out of the build -- @electric-sql/pglite is a
 * devDependency and must never be reachable from dist/.
 */
export interface CurriculumFixture {
    db: PGlite;

    rows<T>(sql: string, params?: unknown[]): Promise<T[]>;

    /** A learner with no history. */
    insertUser(email: string): Promise<string>;

    /** Runs a mutation and undoes it, so the seeded data is never disturbed. */
    scenario<T>(fn: () => Promise<T>): Promise<T>;

    /**
     * Gives a concept an active challenge at `role`, realised by an existing
     * untagged question so a learner can be given history against it.
     *
     * Every concept used as a fixture declares `predict`, which the composite
     * foreign key to concept_demands requires.
     */
    challengeFor(
        concept: string,
        role?: "introduce" | "practise" | "reinforce",
        /**
         * `difficulty` is challenges.difficulty, normally derived by the
         * curriculum from (tier, demand) and passed explicitly here so a test
         * can build several practice rungs on one concept. `demand` must be one
         * the concept declares -- the composite foreign key to concept_demands
         * refuses anything else, which is itself worth a test.
         */
        options?: { difficulty?: number; demand?: string }
    ): Promise<{ challengeId: string; questionId: string }>;

    /**
     * The same thing, named for what the prerequisite layer cares about.
     *
     * Any ACTIVE challenge makes a concept teachable -- the prerequisite rule
     * never looks at role. Kept as a separate name so the prerequisite tests
     * read as what they are testing.
     */
    makeTeachable(concept: string): Promise<{ challengeId: string; questionId: string }>;

    /** One fixture-owned untagged question, for the "earns nothing" invariant. */
    untaggedQuestion(): Promise<string>;

    /**
     * The inverse: deactivates every challenge on a concept, so the
     * prerequisite layer stops considering it teachable.
     *
     * Needed because coverage now MOVES. The prerequisite rule's third case --
     * "unmet, but Jolt cannot teach it, so it does not block" -- used to be
     * demonstrable with whichever real concepts happened to have no content,
     * and seed 019 gave a lesson to every concept that had one written. A test
     * for a rule should not depend on the bank's current coverage, so a test
     * that needs an uncovered prerequisite now makes one. Only safe inside
     * scenario(), which rolls the change back.
     */
    makeUnteachable(concept: string): Promise<void>;

    /** Points an untagged Bug Hunt incident at a challenge, so it can be played. */
    attachIncident(challengeId: string): Promise<string>;

    /** Records that a learner faced a question, as a game would. */
    encounter(
        userId: string,
        questionId: string,
        status?: "answered" | "timed_out" | "pending"
    ): Promise<void>;

    /** Records that a learner faced a Bug Hunt incident. */
    encounterIncident(
        userId: string,
        slug: string,
        status?: "resolved" | "failed" | "pending"
    ): Promise<void>;
}

export async function buildCurriculumFixture(): Promise<CurriculumFixture> {
    const db = new PGlite();

    for (const dir of ["migrations", "seeds"]) {
        const base = new URL(`../../${dir}/`, import.meta.url);

        for (const file of readdirSync(base).filter((f) => f.endsWith(".sql")).sort()) {
            await db.exec(readFileSync(new URL(file, base), "utf8"));
        }
    }

    async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
        return (await db.query<T>(sql, params)).rows;
    }

    async function insertUser(email: string): Promise<string> {
        const [user] = await rows<{ id: string }>(
            `INSERT INTO users (email, username, password_hash)
             VALUES ($1, $1, 'x') RETURNING id`,
            [email]
        );

        return user!.id;
    }

    async function scenario<T>(fn: () => Promise<T>): Promise<T> {
        await db.exec("BEGIN");

        try {
            return await fn();
        } finally {
            await db.exec("ROLLBACK");
        }
    }

    async function challengeFor(
        concept: string,
        role: "introduce" | "practise" | "reinforce" = "practise",
        options: { difficulty?: number; demand?: string } = {}
    ): Promise<{ challengeId: string; questionId: string }> {
        const { difficulty = 1, demand = "predict" } = options;
        // Migration 024 allows one ACTIVE introduction per concept, so a test
        // that fabricates one for a concept the seeds already introduce is
        // replacing it, not adding a second. Retiring the incumbent is what
        // "this concept's introduction is now mine" means inside a scenario.
        if (role === "introduce") {
            await db.query(
                `UPDATE challenges SET is_active = FALSE
                 WHERE role = 'introduce' AND is_active
                   AND concept_id = (SELECT id FROM concepts WHERE slug = $1)`,
                [concept]
            );
        }

        const [challenge] = await rows<{ id: string }>(
            `INSERT INTO challenges (concept_id, demand_id, role, difficulty)
             SELECT c.id, d.id, $2, $3
             FROM concepts c, demands d
             WHERE c.slug = $1 AND d.slug = $4
             RETURNING id`,
            [concept, role, difficulty, demand]
        );

        // TAGS AN EXISTING UNTAGGED QUESTION, which is the documented
        // contract and not an implementation detail: eligibility.test.ts
        // snapshots the dealable set BEFORE calling makeTeachable and asserts
        // the question leaves it, so a row created here could never appear in
        // that snapshot. Briefly changing this to an INSERT turned that test
        // green on the type checker and silently false in substance.
        //
        // The source is the fixture's own pool rather than the legacy bank,
        // which seed 079 retired. See seedUntaggedPool for why the pool is
        // small and parked at the deepest topic.
        const [question] = await rows<{ id: string }>(
            `UPDATE questions SET challenge_id = $1
             WHERE id = (
                 SELECT q.id FROM questions q
                 WHERE q.challenge_id IS NULL
                   AND q.is_active
                   AND q.source = 'fixture-untagged'
                 ORDER BY q.id LIMIT 1
             )
             RETURNING id`,
            [challenge!.id]
        );

        if (!question) {
            throw new Error(
                "fixture untagged pool exhausted -- raise UNTAGGED_POOL_SIZE in database.fixture.ts"
            );
        }

        return { challengeId: challenge!.id, questionId: question!.id };
    }

    async function attachIncident(challengeId: string): Promise<string> {
        const [incident] = await rows<{ slug: string }>(
            // Restricted to a playable type, so the incident the caller gets back
            // is one ELIGIBLE_INCIDENT_PREDICATE would actually deal.
            `UPDATE bug_hunt_incidents SET challenge_id = $1
             WHERE id = (
                 SELECT id FROM bug_hunt_incidents
                 WHERE challenge_id IS NULL
                   AND is_active
                   AND challenge_type IN ('find_line', 'choose_patch')
                 ORDER BY id LIMIT 1
             )
             RETURNING slug`,
            [challengeId]
        );

        return incident!.slug;
    }

    /**
     * Ended, not live: game_sessions_one_active_per_user_idx permits a single
     * in-progress run per learner, and a learner with two encounters has two
     * finished runs behind them.
     */
    async function endedSession(userId: string, game: string): Promise<string> {
        const [session] = await rows<{ id: string }>(
            `INSERT INTO game_sessions (user_id, game_id, status, completed_at)
             VALUES ($1, (SELECT id FROM games WHERE slug = $2),
                     'completed', CURRENT_TIMESTAMP)
             RETURNING id`,
            [userId, game]
        );

        return session!.id;
    }

    async function encounter(
        userId: string,
        questionId: string,
        status: "answered" | "timed_out" | "pending" = "timed_out"
    ): Promise<void> {
        const sessionId = await endedSession(userId, "code-blitz");

        if (status === "answered") {
            await db.query(
                `INSERT INTO session_questions
                     (game_session_id, question_id, display_order, prompt_text, status,
                      served_at, answered_at, is_correct, selected_option_id,
                      selected_option_text, correct_option_text)
                 SELECT $1, $2, 1, 'p', 'answered',
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, TRUE,
                        o.id, o.option_text, o.option_text
                 FROM question_options o WHERE o.question_id = $2 ORDER BY o.id LIMIT 1`,
                [sessionId, questionId]
            );
            return;
        }

        if (status === "pending") {
            await db.query(
                `INSERT INTO session_questions
                     (game_session_id, question_id, display_order, prompt_text, status, served_at)
                 VALUES ($1, $2, 1, 'p', 'pending', CURRENT_TIMESTAMP)`,
                [sessionId, questionId]
            );
            return;
        }

        await db.query(
            `INSERT INTO session_questions
                 (game_session_id, question_id, display_order, prompt_text, status,
                  served_at, timed_out_at, correct_option_text)
             VALUES ($1, $2, 1, 'p', 'timed_out', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'x')`,
            [sessionId, questionId]
        );
    }

    async function encounterIncident(
        userId: string,
        slug: string,
        status: "resolved" | "failed" | "pending" = "failed"
    ): Promise<void> {
        const sessionId = await endedSession(userId, "bug-hunt");

        if (status === "pending") {
            await db.query(
                `INSERT INTO bug_hunt_rounds
                     (game_session_id, incident_id, display_order, time_limit_ms, status)
                 SELECT $1, i.id, 1, 60000, 'pending'
                 FROM bug_hunt_incidents i WHERE i.slug = $2`,
                [sessionId, slug]
            );
            return;
        }

        if (status === "resolved") {
            await db.query(
                `INSERT INTO bug_hunt_rounds
                     (game_session_id, incident_id, display_order, time_limit_ms, status,
                      served_at, ended_at, attempts, selected_option_id)
                 SELECT $1, i.id, 1, 60000, 'resolved',
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1,
                        (SELECT o.id FROM bug_hunt_options o
                         WHERE o.incident_id = i.id AND o.is_correct LIMIT 1)
                 FROM bug_hunt_incidents i WHERE i.slug = $2`,
                [sessionId, slug]
            );
            return;
        }

        await db.query(
            `INSERT INTO bug_hunt_rounds
                 (game_session_id, incident_id, display_order, time_limit_ms, status,
                  served_at, ended_at)
             SELECT $1, i.id, 1, 60000, 'failed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
             FROM bug_hunt_incidents i WHERE i.slug = $2`,
            [sessionId, slug]
        );
    }

    /**
     * The fixture's own untagged questions, seeded once before any scenario.
     *
     * WHY THEY EXIST. Seed 079 retired the legacy bank, and several tests need
     * an untagged question to prove the invariant that still matters: a
     * question with no challenge earns no curriculum credit. questions.
     * challenge_id is still nullable, so that invariant has to keep being
     * tested, and the test needs a row to test it with.
     *
     * WHY THEY ARE PARKED AT THE DEEPEST TOPIC. question_journey reads
     * questions.topic for an untagged row, so these sit at algorithms -- out of
     * reach of any beginner's journey ceiling. Parked anywhere earlier they
     * would be dealt to a learner with no history, which is exactly the
     * behaviour seed 079 removed and journey.test.ts now asserts is gone.
     *
     * WHY THE POOL IS SMALL. journeyCte's floor opens a topic once its
     * cumulative dealable count reaches QUESTIONS_PER_SESSION. Fewer than ten
     * rows cannot trip that, so the pool cannot drag a beginner's ceiling to
     * the end of the curriculum. Raise it only with that in mind.
     *
     * They never leave the fixture: this database is built in memory from the
     * repository's migrations and seeds and discarded with the process.
     */
    const UNTAGGED_POOL_SIZE = 8;

    async function seedUntaggedPool(): Promise<void> {
        for (let i = 0; i < UNTAGGED_POOL_SIZE; i += 1) {
            const [question] = await rows<{ id: string }>(
                `INSERT INTO questions
                     (prompt, difficulty, topic, challenge_type, challenge_id, source)
                 VALUES ($1, 1, 'algorithms', 'predict-output', NULL, 'fixture-untagged')
                 RETURNING id`,
                [`fixture untagged question ${i}`]
            );

            await db.query(
                `INSERT INTO question_options (question_id, option_text, display_order, is_correct)
                 VALUES ($1, 'right', 1, TRUE), ($1, 'wrong', 2, FALSE)`,
                [question!.id]
            );
        }
    }

    /**
     * One untagged question, created on demand inside the caller's scenario.
     *
     * Separate from the pool because the callers are different. challengeFor
     * needs a row that PRE-EXISTS the caller's snapshot; this is for tests that
     * simply need something untagged to answer, and creating it per scenario
     * keeps them independent of how many challengeFor has claimed.
     */
    async function untaggedQuestion(): Promise<string> {
        const [question] = await rows<{ id: string }>(
            `INSERT INTO questions
                 (prompt, difficulty, topic, challenge_type, challenge_id, source)
             VALUES ('fixture untagged on demand ' || clock_timestamp()::TEXT,
                     1, 'algorithms', 'predict-output', NULL, 'fixture-untagged-on-demand')
             RETURNING id`
        );

        await db.query(
            `INSERT INTO question_options (question_id, option_text, display_order, is_correct)
             VALUES ($1, 'right', 1, TRUE), ($1, 'wrong', 2, FALSE)`,
            [question!.id]
        );

        return question!.id;
    }

    await seedUntaggedPool();

    return {
        db,
        rows,
        insertUser,
        scenario,
        challengeFor,
        untaggedQuestion,
        makeTeachable: (concept) => challengeFor(concept, "practise"),
        makeUnteachable: async (concept) => {
            await rows(
                `UPDATE challenges SET is_active = FALSE
                 WHERE concept_id = (SELECT id FROM concepts WHERE slug = $1)`,
                [concept]
            );
        },
        attachIncident,
        encounter,
        encounterIncident
    };
}
