-- The two prompts 060 could not reach.
--
-- 060 only handled three-block prompts. `parameters-arguments/diagnose` and
-- `return-values/diagnose` are written in FOUR -- a complaint, a function, the
-- call, and then the question -- because the snippet itself has a blank line
-- in it. The rule here is the general one: the first block asks, the LAST
-- block is the question if it is prose, and everything between is the snippet,
-- blank lines and all.

BEGIN;

CREATE OR REPLACE FUNCTION diagnose_prompt_any_shape()
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
    v_row RECORD;
    v_blocks TEXT[];
    v_n INT;
    v_fixed INT := 0;
BEGIN
    FOR v_row IN
        SELECT q.id, q.prompt FROM questions q
        JOIN challenges ch ON ch.id = q.challenge_id
        WHERE q.is_active AND ch.role = 'practise'
          AND q.prompt LIKE '%' || chr(10) || chr(10) || '%'
    LOOP
        v_blocks := string_to_array(v_row.prompt, E'\n\n');
        v_n := array_length(v_blocks, 1);

        -- Needs at least head, body and a trailing prose question.
        CONTINUE WHEN v_n < 3;
        CONTINUE WHEN v_blocks[v_n] NOT LIKE '%?';
        CONTINUE WHEN v_blocks[v_n] LIKE '%' || chr(10) || '%';

        UPDATE questions
        SET prompt = v_blocks[1] || ' ' || v_blocks[v_n] || E'\n\n'
                  || array_to_string(v_blocks[2:v_n - 1], E'\n\n')
        WHERE id = v_row.id;

        v_fixed := v_fixed + 1;
    END LOOP;

    RETURN v_fixed;
END;
$$;

SELECT diagnose_prompt_any_shape() AS prompts_reshaped;

DROP FUNCTION diagnose_prompt_any_shape();

COMMIT;
