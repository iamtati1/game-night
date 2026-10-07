-- Putting every `repair` prompt the right way round.
--
-- THE BUG: `splitPrompt` documents the shape every curriculum prompt is
-- written in -- a line of prose, a blank line, then the snippet -- and splits
-- on that. Every repair question was authored the other way round, with the
-- code first and the question after it, so the encounter rendered the CODE as
-- the question and the QUESTION inside the code box. Backwards, in a
-- monospace box, on all ten of them.
--
-- Found by playing a repair rung in the browser rather than by any test, which
-- is why the contract test added alongside this seed now asserts the shape.
--
-- All ten are affected, across nine topics: operators, control-flow, strings,
-- loops, functions, scope, arrays, array-methods and objects. Nothing about
-- the content changes -- the same words, in the order the renderer expects.

BEGIN;

/*
 * Swaps the two halves of a prompt: everything after the first blank line
 * comes first, and the code follows it. Matched on the question mark, so a
 * prompt that is already the right way round is left alone.
 */
CREATE OR REPLACE FUNCTION repair_prompt_the_right_way_round()
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
    v_row RECORD;
    v_code TEXT;
    v_ask TEXT;
    v_fixed INT := 0;
BEGIN
    FOR v_row IN
        SELECT q.id, q.prompt
        FROM questions q
        JOIN challenges ch ON ch.id = q.challenge_id
        JOIN demands d     ON d.id  = ch.demand_id
        WHERE d.slug = 'repair' AND q.is_active
    LOOP
        v_code := split_part(v_row.prompt, E'\n\n', 1);
        v_ask  := substr(v_row.prompt, length(v_code) + 3);

        -- Already prose-first: the first block ends in a question mark.
        CONTINUE WHEN v_ask = '' OR v_code LIKE '%?';

        UPDATE questions
        SET prompt = v_ask || E'\n\n' || v_code
        WHERE id = v_row.id;

        v_fixed := v_fixed + 1;
    END LOOP;

    RETURN v_fixed;
END;
$$;

SELECT repair_prompt_the_right_way_round() AS prompts_reordered;

DROP FUNCTION repair_prompt_the_right_way_round();

COMMIT;
