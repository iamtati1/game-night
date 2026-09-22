-- The first Learn -> Play loop: one concept, one introduction, one exercise.
--
--     primitive-types / recognise / introduce   -> the Learn Beat
--     primitive-types / predict   / practise    -> an existing Code Blitz question
--
-- TWO CHALLENGES AND NOTHING ELSE. This is a vertical architecture slice, not a
-- tagging pass. 231 of the 232 dealable questions stay untagged and keep flowing
-- through the transitional escape hatch; exactly one is claimed here.
--
-- WHY primitive-types. It is the curriculum's only root -- zero prerequisites --
-- so the introduce/practise transition is the only thing that can gate its
-- content. Any other concept would mix the role layer's behaviour with the
-- prerequisite layer's, and the point of this slice is to see one of them move.
--
-- THE INTRODUCTION HAS NO CONTENT ROW, deliberately.
--
-- Content points UP at a challenge (migration 021), and an introduction's
-- content is a Learn Beat, which lives in client/src/games/learnBeats.ts keyed
-- by concept slug. It is never dealt, never scored and never timed, so it has no
-- questions row and no bug_hunt_incidents row to point up from. Giving
-- `challenges` a beat_id column to point DOWN at it instead is exactly the
-- polymorphic mega-table migration 021 exists to avoid. The concept slug is the
-- join, and the server sends it.
--
-- CONVERGENT. Re-running changes nothing: the introduction is anchored on
-- "one active introduce challenge per concept" -- which migration 024 enforces
-- with a partial unique index -- and the practice is anchored on the question it
-- is attached to, exactly as seed 015 anchors the equality slice.

BEGIN;

-- Mirrors difficultyFor() in client/src/games/curriculum.ts, for the same
-- reason seed 015 does: the value must be derived from the curriculum rather
-- than typed in, or a challenge could carry a number the curriculum would never
-- produce. Defined and dropped here because seed 015 drops its own copy.
CREATE OR REPLACE FUNCTION curriculum_difficulty(p_concept TEXT, p_demand TEXT)
RETURNS SMALLINT
LANGUAGE sql
AS $$
    SELECT (CASE WHEN d.display_order >= 4 THEN
        CASE t.tier WHEN 'beginner' THEN 2 WHEN 'intermediate' THEN 3 ELSE 4 END
      ELSE CASE t.tier WHEN 'beginner' THEN 1 WHEN 'intermediate' THEN 2 ELSE 3 END END)::SMALLINT
    FROM concepts c
    JOIN topics t ON t.id = c.topic_id
    CROSS JOIN demands d
    WHERE c.slug = p_concept AND d.slug = p_demand;
$$;

-- ──────────────────────────────────────────────── the introduction ──
--
-- At `recognise`, the shallowest rung on the ladder: an introduction asks the
-- learner to recognise the thing, not to produce or diagnose it.
-- primitive-types declares recognise, which the composite foreign key to
-- concept_demands requires.
INSERT INTO challenges (concept_id, demand_id, role, difficulty)
SELECT c.id, d.id, 'introduce', curriculum_difficulty('primitive-types', 'recognise')
FROM concepts c, demands d
WHERE c.slug = 'primitive-types'
  AND d.slug = 'recognise'
  AND NOT EXISTS (
      SELECT 1 FROM challenges ch
      WHERE ch.concept_id = c.id AND ch.role = 'introduce' AND ch.is_active
  );

-- ──────────────────────────────────────────────────── the practice ──
--
--     What does this log?
--     console.log(typeof "5", typeof 5);   ->   "string" "number"
--
-- Chosen because it already exists, already passes ELIGIBLE_QUESTION_PREDICATE
-- (four options, one correct), and asks exactly the concept's objective: name
-- what kind of thing a value is.
--
-- PROVISIONAL TAG. This question sits on the line between `primitive-types` and
-- `typeof` -- it names the types of two literals, using typeof as the
-- instrument. It is tagged here because the slice needs one real exercise behind
-- the introduction, not because the mapping is settled. The content tagging pass
-- may well move it to `typeof`, and nothing in the architecture depends on which
-- of the two it lands on.
CREATE OR REPLACE FUNCTION attach_practice(p_prompt TEXT, p_concept TEXT, p_demand TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_question  BIGINT;
    v_existing  BIGINT;
    v_challenge BIGINT;
BEGIN
    SELECT id, challenge_id INTO v_question, v_existing
    FROM questions WHERE prompt = p_prompt;

    IF v_question IS NULL THEN
        RAISE EXCEPTION 'no question with that prompt: %', p_prompt;
    END IF;

    -- Already linked. The content is the anchor, so this is where re-running
    -- stops rather than creating a second challenge for the same exercise.
    IF v_existing IS NOT NULL THEN
        RETURN;
    END IF;

    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, 'practise', curriculum_difficulty(p_concept, p_demand)
    FROM concepts c, demands d
    WHERE c.slug = p_concept AND d.slug = p_demand
    RETURNING id INTO v_challenge;

    UPDATE questions SET challenge_id = v_challenge WHERE id = v_question;
END;
$$;

SELECT attach_practice(
    E'What does this log?\n\nconsole.log(typeof "5", typeof 5);',
    'primitive-types',
    'predict'
);

DROP FUNCTION attach_practice(TEXT, TEXT, TEXT);
DROP FUNCTION curriculum_difficulty(TEXT, TEXT);

COMMIT;
