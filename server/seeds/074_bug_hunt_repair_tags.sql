-- Bug Hunt, as a second genuine path through the curriculum's repair rungs.
--
-- THE GAP THIS CLOSES. 17 concepts declare a `repair` rung and 16 of them have
-- content, but only ONE was realised by a Bug Hunt incident -- the rest are
-- multiple-choice questions. So "fix the broken code" was a rung a learner
-- could only clear by reading about fixing broken code. Meanwhile 20 active
-- `choose_patch` incidents -- whose whole shape is "here is the bug, pick the
-- patch" -- sat untagged and could never be evidence of anything.
--
-- WHAT IS AND IS NOT TAGGED. Eleven, each because the bug it contains IS the
-- thing its rung asks the learner to repair. Nine are deliberately left alone:
--
--   can-vote-boundary        `>` vs `>=` -- comparison-operators declares no
--                            repair rung, and inventing one to house an
--                            incident is the curriculum following the content
--                            instead of the other way round
--   array-size-property      `.size` vs `.length`
--   analytics-last-event     off-by-one on an index
--   investigate-empty-filter filter returning nothing
--   payments-float-cents     IEEE-754 float precision, which is not coercion
--   cart-quantity-string     a second coercion bug; one incident per challenge
--   investigate-nan-total    likewise
--   analytics-reduce-async   a second async-await bug
--   analytics-shared-accumulator  a second object-references bug
--
-- The first five have no rung whose demand they actually match. The last four
-- match a rung that is already taken: bug_hunt_incidents_challenge_id_idx is
-- unique, so a challenge holds exactly one incident. They stay dealable as
-- untagged content, exactly as they are today -- nothing is lost by leaving
-- them, and tagging them would have meant either a duplicate rung or a rung
-- that does not mean what it says.
--
-- NO NEW EVIDENCE PATH. bug_hunt_rounds.status = 'resolved' already feeds
-- CLEARED_RUNGS_CTE. These rows only give that arm something to credit.
--
-- IDEMPOTENT. Seeds carry no ledger and run on every boot: an incident that
-- already carries a challenge_id is left exactly as it is, so a re-run cannot
-- create a second challenge for it.

BEGIN;

-- Same shape as seeds/018, which is where this pattern comes from. A challenge
-- is 1:1 with the exercise that realises it, so each incident gets its own
-- rather than being hung off the question's challenge -- two pieces of content
-- on one challenge would make the encounter offer the same challengeId twice.
CREATE OR REPLACE FUNCTION attach_repair_incident(p_slug TEXT, p_concept TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_incident  BIGINT;
    v_existing  BIGINT;
    v_challenge BIGINT;
BEGIN
    SELECT id, challenge_id INTO v_incident, v_existing
    FROM bug_hunt_incidents WHERE slug = p_slug AND is_active;

    -- A typo in a slug here would otherwise be a silent no-op that quietly
    -- leaves the rung empty.
    IF v_incident IS NULL THEN
        RAISE EXCEPTION 'no active incident %', p_slug;
    END IF;

    IF v_existing IS NOT NULL THEN
        RETURN;
    END IF;

    -- The composite foreign key to concept_demands refuses a challenge whose
    -- demand the concept does not declare, so a concept without a repair rung
    -- fails here rather than inventing one.
    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, 'practise',
           GREATEST(1, LEAST(4, COALESCE(i.difficulty, 2)))
    FROM concepts c, demands d, bug_hunt_incidents i
    WHERE c.slug = p_concept AND d.slug = 'repair' AND i.id = v_incident
    RETURNING id INTO v_challenge;

    UPDATE bug_hunt_incidents SET challenge_id = v_challenge WHERE id = v_incident;
END;
$$;

SELECT attach_repair_incident('investigate-types-concat',   'type-coercion');
SELECT attach_repair_incident('fix-loop-boundary',          'loop-conditions');
SELECT attach_repair_incident('api-map-no-return',          'return-values');
SELECT attach_repair_incident('payments-retry-scope',       'loop-variable-capture');
SELECT attach_repair_incident('fix-mutates-caller-array',   'array-mutation');
SELECT attach_repair_incident('inventory-sort-mutates',     'sort');
SELECT attach_repair_incident('fix-map-result-discarded',   'map');
SELECT attach_repair_incident('nested-spread-shared',       'object-references');
SELECT attach_repair_incident('auth-foreach-async',         'async-await');
SELECT attach_repair_incident('async-unhandled-rejection',  'error-propagation');
SELECT attach_repair_incident('settimeout-returns-id',      'callbacks');

DROP FUNCTION attach_repair_incident(TEXT, TEXT);

COMMIT;
