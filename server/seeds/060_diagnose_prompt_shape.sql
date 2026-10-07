-- The second half of the same bug, on `diagnose` prompts.
--
-- 059 put the repair prompts the right way round. These are wrong in a milder
-- way: they are written in THREE blocks -- a complaint, the code, and then
-- "Which line is the cause?" -- and `splitPrompt` puts everything after the
-- first blank line into the code box. So the question rendered in monospace,
-- underneath the snippet, as though it were part of the program.
--
-- The fix is to ask the question in the opening block, where the renderer
-- expects it, leaving the snippet alone in the box. The words are unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION diagnose_prompt_two_blocks()
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
    v_row RECORD;
    v_head TEXT;
    v_rest TEXT;
    v_tail TEXT;
    v_code TEXT;
    v_fixed INT := 0;
BEGIN
    FOR v_row IN
        SELECT q.id, q.prompt FROM questions q
        JOIN challenges ch ON ch.id = q.challenge_id
        WHERE q.is_active AND ch.role = 'practise'
          AND q.prompt LIKE '%' || chr(10) || chr(10) || '%'
    LOOP
        v_head := split_part(v_row.prompt, E'\n\n', 1);
        v_rest := substr(v_row.prompt, length(v_head) + 3);

        -- Only three-block prompts whose LAST block is a prose question.
        CONTINUE WHEN position(E'\n\n' IN v_rest) = 0;

        v_code := substr(v_rest, 1, position(E'\n\n' IN v_rest) - 1);
        v_tail := substr(v_rest, position(E'\n\n' IN v_rest) + 2);

        CONTINUE WHEN v_tail NOT LIKE '%?' OR position(E'\n\n' IN v_tail) > 0;

        UPDATE questions
        SET prompt = v_head || ' ' || v_tail || E'\n\n' || v_code
        WHERE id = v_row.id;

        v_fixed := v_fixed + 1;
    END LOOP;

    RETURN v_fixed;
END;
$$;

SELECT diagnose_prompt_two_blocks() AS prompts_reshaped;

DROP FUNCTION diagnose_prompt_two_blocks();

COMMIT;
