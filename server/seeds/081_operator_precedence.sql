-- Operator precedence gets its own concept, and the five questions that always
-- belonged to it move there.
--
-- THE DEFECT. arithmetic-operators teaches one operation at a time -- 2 + 3,
-- 10 - 4, 3 * 2, 8 / 2 -- and nothing in its lesson mentions precedence,
-- brackets, or left-to-right evaluation. Four of its predict candidates and the
-- whole of its explain rung required exactly that reasoning:
--
--   2 + 3 * 4                          multiplication before addition
--   (2 + 3) * 4                        brackets first
--   6 / 2 * 3                          equal rank, left to right
--   5 + 5 - 4                          equal rank, left to right
--   why 2 + 3 * 4 displays 14          the rule itself, stated
--
-- A learner who walked the lesson in front of them had been shown nothing that
-- answers any of them. Every one already carries a correct explanation: the
-- content was never wrong, it was attached to a concept that does not teach it.
-- So this moves them rather than rewriting or duplicating anything.
--
-- arithmetic-operators keeps `predict` -- it still has single-operation
-- questions of its own -- and loses `explain`, which had no candidate left once
-- the question above moved. 014 drops that pair; see curriculum.ts.
--
-- WHY A MOVE AND NOT attach_question_challenge(). That helper returns early
-- when a question already has a challenge -- see seeds/015 -- so it can attach
-- an untagged question but cannot re-home a tagged one. seeds/029 set the
-- precedent for the move itself.
--
-- WHY THE CHALLENGE AND NOT THE QUESTION. See the comment on the loop below:
-- repointing questions.challenge_id leaves an empty challenge on a rung the
-- curriculum no longer declares, which wedges the next run of 014 against
-- ON DELETE RESTRICT.
--
-- FRESH DATABASES NEVER NEED THIS. 032_values_completion.sql now authors the
-- explain question on operator-precedence directly, and this seed finds nothing
-- to move. It exists for databases seeded before the split.
--
-- EVIDENCE FOLLOWS. CLEARED_RUNGS_CTE derives a cleared rung as
-- session_questions -> questions -> challenges, so a learner's past answers
-- follow the question to its new concept. On a database with history that means
-- clears recorded against arithmetic-operators move to operator-precedence --
-- which is the honest outcome, since the learner answered a precedence
-- question. The count is reported below rather than assumed.
--
-- Ordering: 014_curriculum.sql creates the concept and its rungs, so this must
-- run after it. It is idempotent -- a second run finds the rows already on the
-- destination concept and does nothing.
--
-- TWO SEEDING RUNS ON A DATABASE THAT WAS ALREADY SEEDED. 014 drops the
-- (arithmetic-operators, explain) pair, and on an existing database the explain
-- challenge is still sitting on it when 014 runs -- this seed is numbered after
-- 014 and cannot be otherwise, because the concept it moves things ONTO is one
-- of the rows 014 creates. 014 therefore skips that pair rather than aborting
-- (see the prune guard in scripts/generate-curriculum.ts), this seed moves the
-- challenge off it, and the NEXT `npm run seed` removes the now-unreferenced
-- pair. Nothing is lost in between: the rung stays declared for exactly as long
-- as something is still standing on it.
--
-- A fresh database needs only one run -- no challenge exists on that pair when
-- 014 runs, so the prune succeeds immediately.

BEGIN;

DO $$
DECLARE
    v_moved     INT := 0;
    v_evidence  INT;
    v_challenge BIGINT;
    r           RECORD;
BEGIN
    -- What is about to move, and what history rides along with it.
    SELECT COUNT(*) INTO v_evidence
    FROM session_questions sq
    JOIN questions q   ON q.id  = sq.question_id
    JOIN challenges ch ON ch.id = q.challenge_id
    JOIN concepts c    ON c.id  = ch.concept_id
    WHERE c.slug = 'arithmetic-operators'
      AND q.prompt LIKE ANY (ARRAY[
          '%2 + 3 * 4%', '%(2 + 3) * 4%', '%6 / 2 * 3%', '%5 + 5 - 4%'
      ]);

    RAISE NOTICE 'operator-precedence: % session_questions rows reference the questions being moved', v_evidence;

    FOR r IN
        SELECT * FROM (VALUES
            ('%console.log(2 + 3 * 4)%',            'predict'),
            ('%console.log((2 + 3) * 4)%',          'predict'),
            ('%console.log(6 / 2 * 3)%',            'predict'),
            ('%console.log(5 + 5 - 4)%',            'predict'),
            ('%Why does console.log(2 + 3 * 4)%',   'explain')
        ) AS t(pattern, demand)
    LOOP
        /*
         * THE CHALLENGE MOVES, NOT THE QUESTION.
         *
         * Repointing questions.challenge_id would need a fresh challenge per
         * question (questions_challenge_id_idx is unique) and would leave the
         * old one behind with nothing on it. For `explain` that leftover is
         * fatal rather than untidy: arithmetic-operators no longer declares
         * that rung, so the next run of the generated 014 tries to delete the
         * (arithmetic-operators, explain) pair and challenges -> concept_demands
         * is ON DELETE RESTRICT. An empty challenge sitting on a dropped rung
         * would wedge re-seeding permanently.
         *
         * Moving the challenge row creates nothing and deletes nothing. The
         * question follows it, and so does every piece of evidence recorded
         * against it -- session_questions through the question,
         * activity_completions and bug_hunt_incidents through the challenge.
         * Nothing anchored to a precedence question is lost or reassigned to
         * someone else's concept.
         *
         * Anchored on the SOURCE concept and demand, so a re-run finds nothing
         * (the rows are already on operator-precedence) and a lookalike prompt
         * elsewhere in the bank is never caught. The demand is part of the
         * anchor because the explain prompt contains the predict prompt.
         */
        SELECT ch.id INTO v_challenge
        FROM challenges ch
        JOIN concepts c  ON c.id = ch.concept_id
        JOIN demands  d  ON d.id = ch.demand_id
        JOIN questions q ON q.challenge_id = ch.id
        WHERE c.slug = 'arithmetic-operators'
          AND d.slug = r.demand
          AND q.prompt LIKE r.pattern
          AND q.is_active
        LIMIT 1;

        -- Already moved, or never present. Either way there is nothing to do.
        CONTINUE WHEN v_challenge IS NULL;

        UPDATE challenges ch
        SET concept_id = (SELECT id FROM concepts WHERE slug = 'operator-precedence'),
            demand_id  = (SELECT id FROM demands  WHERE slug = r.demand)
        WHERE ch.id = v_challenge;

        v_moved := v_moved + 1;
    END LOOP;

    RAISE NOTICE 'operator-precedence: % challenges re-homed', v_moved;
END;
$$;

COMMIT;
