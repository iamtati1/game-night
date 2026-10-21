-- Completing the DOM: eleven question rungs across five concepts.
--
-- Twelfth topic built to the Values template. Like Errors, it declares no
-- `produce` rung, so there are no code-writing movements.
--
-- THE ONLY TOPIC THAT NEEDED HOST OBJECTS. littleJs has deliberately had no
-- `document` for twelve topics, because a sandbox without host objects is a
-- sandbox with far less to go wrong. The DOM cannot be taught honestly without
-- one: `event-order` is defined as an event travelling down to the target and
-- back up through its ancestors, and that is exactly the kind of claim careful
-- reasoning gets wrong. So there is now a small real tree and a real dispatch,
-- and every snippet below was run against it.
--
-- A PAGE HAS TO BE HANDED IN. Without one `document` is still a
-- ReferenceError, which is what every other topic sees.
--
-- DELIBERATELY ABSENT: `innerHTML`, which turns text into live markup and is
-- the one DOM feature that would put a hole in a sandbox built on not having
-- one. `classList` too -- `className` says the same thing with less surface.
--
-- THE DISTINCTION THE TOPIC KEEPS RETURNING TO: the element you are holding IS
-- the page, not a copy of it, and an event is a journey rather than an instant.

BEGIN;

CREATE OR REPLACE FUNCTION seed_dom(
    p_ref TEXT, p_concept TEXT, p_demand TEXT, p_prompt TEXT,
    p_correct TEXT, p_wrong TEXT[], p_why TEXT
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_question BIGINT; v_challenge BIGINT; v_wrong TEXT; v_order INT := 1; v_type TEXT;
BEGIN
    /*
     * IDENTITY FIRST, WORDING SECOND.
     *
     * p_ref is this question's name: authored once, never derived from its
     * content, and never edited afterwards. It is namespaced by `source`, and
     * questions_external_ref_idx -- UNIQUE on (source, external_ref) -- is what
     * actually enforces one row per name. The guard below is the fast path, not
     * the protection.
     *
     * THE DEFECT THIS REPLACES. This used to read `WHERE prompt = p_prompt`.
     * Five later seeds rewrite prompts -- 059 and 060 reorder the blocks, 029
     * rewrites wording outright -- so the stored text stopped matching the
     * authored text, the guard stopped matching anything, and EVERY subsequent
     * `npm run seed` inserted another copy. 41 questions had reached three
     * copies each. A name cannot drift that way; wording can.
     */
    SELECT id INTO v_question
    FROM questions
    WHERE source = 'jolt-dom-completion' AND external_ref = p_ref;

    IF v_question IS NOT NULL THEN RETURN; END IF;

    /*
     * ADOPTION, for rows seeded before names existed. They carry the right
     * content and no name, so the first run after this change gives them one
     * rather than inserting beside them. Restricted to rows that have no name
     * yet, so it can never steal a question that already belongs to another.
     */
    SELECT id INTO v_question
    FROM questions
    WHERE prompt = p_prompt AND source = 'jolt-dom-completion' AND external_ref IS NULL
    ORDER BY id  -- the oldest copy: the one learners have answered
    LIMIT 1;

    IF v_question IS NOT NULL THEN
        UPDATE questions SET external_ref = p_ref WHERE id = v_question;
        RETURN;
    END IF;

    v_type := CASE WHEN p_demand IN ('recognise', 'recall', 'explain')
                   THEN 'match-concept' ELSE 'predict-output' END;

    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, 'practise',
           CASE WHEN d.display_order >= (SELECT display_order FROM demands WHERE slug='produce')
                THEN 3 ELSE 2 END
    FROM concepts c, demands d
    WHERE c.slug = p_concept AND d.slug = p_demand
    RETURNING id INTO v_challenge;

    INSERT INTO questions
        (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation, external_ref)
    VALUES (p_prompt, 3, 'dom', v_type, v_challenge, 'jolt-dom-completion', p_why, p_ref)
    RETURNING id INTO v_question;

    INSERT INTO question_options (question_id, option_text, display_order, is_correct)
    VALUES (v_question, p_correct, v_order, TRUE);

    FOREACH v_wrong IN ARRAY p_wrong LOOP
        v_order := v_order + 1;
        INSERT INTO question_options (question_id, option_text, display_order, is_correct)
        VALUES (v_question, v_wrong, v_order, FALSE);
    END LOOP;
END;
$$;

/* ── 1 · selecting-elements ─────────────────────────────────────────────── */

SELECT seed_dom(
    'selecting-elements-recognise-01',
    'selecting-elements', 'recognise',
    E'Which one finds EVERY item in the list?\n\n<ul id="list">\n  <li class="item">A</li>\n  <li class="item done">B</li>\n</ul>',
    'document.querySelectorAll(".item")',
    ARRAY['document.querySelector(".item")',
          'document.querySelectorAll("#item")',
          'document.querySelectorAll("item")'],
    '`querySelectorAll` gives every match; `querySelector` stops at the first one it finds. A `#` looks for an id and a bare word looks for a tag, and this page has neither called item.');

SELECT seed_dom(
    'selecting-elements-predict-01',
    'selecting-elements', 'predict',
    E'What does this log?\n\n<ul id="list">\n  <li class="item">A</li>\n  <li class="item done">B</li>\n</ul>\n\nconsole.log(document.querySelectorAll(".item").length);\nconsole.log(document.querySelector("#nope"));',
    '2 then null', ARRAY['2 then undefined', '2 then an error', '1 then null'],
    'Two elements carry that class. Asking for one that is not there gives `null` rather than failing — which is why a selector typo usually shows up on the NEXT line, as "cannot read property of null".');

/* ── 2 · element-properties ─────────────────────────────────────────────── */

SELECT seed_dom(
    'element-properties-predict-01',
    'element-properties', 'predict',
    E'What does this log?\n\n<div id="panel"><h2 class="title">Scores</h2></div>\n\nlet t = document.querySelector(".title");\nt.textContent = "Totals";\nconsole.log(t.textContent);\nconsole.log(t.tagName);',
    'Totals then H2', ARRAY['Scores then H2', 'Totals then h2', 'Totals then title'],
    'Setting `textContent` changed the page, and reading it back gives the new text. `tagName` is the element''s tag in capitals — a detail worth knowing before you compare it to anything.');

SELECT seed_dom(
    'element-properties-explain-01',
    'element-properties', 'explain',
    E'Why does setting `textContent` change what is on screen straight away?',
    'The element you are holding is the page itself, not a copy of it',
    ARRAY['Because the browser re-reads the HTML file after every change',
          'Because textContent is written back to the HTML automatically',
          'Because querySelector returns a copy that is kept in step'],
    'The mechanism is identity. `querySelector` hands back the live element, so the object in your variable and the thing being displayed are one and the same — there is no copying, and so nothing to keep in step.');

/* ── 3 · event-listeners ────────────────────────────────────────────────── */

SELECT seed_dom(
    'event-listeners-recognise-01',
    'event-listeners', 'recognise',
    E'Which line runs `handle` when the button is clicked?',
    'button.addEventListener("click", handle);',
    ARRAY['button.addEventListener("click", handle());',
          'button.addEventListener(handle, "click");',
          'button.click(handle);'],
    'The function is handed over WITHOUT brackets, for the browser to call later. `handle()` calls it now and hands over whatever it returned, which is the commonest way a listener ends up doing nothing.');

SELECT seed_dom(
    'event-listeners-predict-01',
    'event-listeners', 'predict',
    E'What does this log?\n\n<div id="panel"><h2 class="title">Scores</h2></div>\n\nlet t = document.querySelector(".title");\nt.addEventListener("click", () => {\n  console.log("clicked");\n});\nconsole.log("set up");\nt.click();',
    'set up then clicked', ARRAY['clicked then set up', 'set up only', 'clicked only'],
    'Adding a listener does not run it. The function was handed to the browser and sat there until the click, which is why "set up" printed first even though its line comes second.');

SELECT seed_dom(
    'event-listeners-diagnose-01',
    'event-listeners', 'diagnose',
    E'This should log when clicked, and logs once immediately and then fails. Which line is the cause?\n\nlet t = document.querySelector(".title");\nfunction handle() {\n  console.log("clicked");\n}\nt.addEventListener("click", handle());\nt.click();',
    't.addEventListener("click", handle());',
    ARRAY['function handle() {', 't.click();', 'let t = document.querySelector(".title");'],
    'The brackets called `handle` on the spot — which is why it logged immediately — and then registered its return value, `undefined`, as the listener. Dropping the brackets hands over the function instead of its result.');

/* ── 4 · event-order ────────────────────────────────────────────────────── */

SELECT seed_dom(
    'event-order-predict-01',
    'event-order', 'predict',
    E'What does this log when the title is clicked?\n\n<div id="panel"><h2 class="title">Scores</h2></div>\n\nlet outer = document.querySelector("#panel");\nlet inner = document.querySelector(".title");\nouter.addEventListener("click", () => { console.log("outer"); });\ninner.addEventListener("click", () => { console.log("inner"); });\ninner.click();',
    'inner then outer', ARRAY['outer then inner', 'inner only', 'outer only'],
    'The event reached the title first and then travelled back up through everything containing it. Both listeners ran, in that order — which is why a click on a child can set off a handler you put on the parent.');

SELECT seed_dom(
    'event-order-explain-01',
    'event-order', 'explain',
    E'Why does clicking a child element also run a listener on its parent?',
    'The event travels back up through the ancestors after it has reached the target',
    ARRAY['Because the parent''s listener is copied onto each of its children',
          'Because clicking a child counts as clicking the parent as well',
          'Because listeners always run in the order they were added'],
    'The mechanism is the journey. An event goes down to the target and then back up through everything containing it, running listeners as it passes — so one handler on a container can serve every element inside it.');

/* ── 5 · dom-as-tree ────────────────────────────────────────────────────── */

SELECT seed_dom(
    'dom-as-tree-recognise-01',
    'dom-as-tree', 'recognise',
    E'Which one reaches the element that CONTAINS the title?\n\n<div id="panel"><h2 class="title">Scores</h2></div>',
    'title.parentElement', ARRAY['title.parent', 'title.children[0]', 'document.parentElement'],
    '`parentElement` goes one step up. `children` goes down, and `parent` on its own is not a property an element has — the full name is the one to remember.');

SELECT seed_dom(
    'dom-as-tree-explain-01',
    'dom-as-tree', 'explain',
    E'Why can the whole page be reached from any single element?',
    'Every element knows its parent and its children, so the tree can be walked either way from anywhere',
    ARRAY['Because each element holds a list of every other element',
          'Because document.querySelector can be called on any element',
          'Because the elements are really stored in one flat list'],
    'The mechanism is the links. Each element points up to one parent and down to its children, and those links join into a tree — so from any starting point you can climb to the top and walk down to anything else.');

DROP FUNCTION seed_dom(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

COMMIT;
