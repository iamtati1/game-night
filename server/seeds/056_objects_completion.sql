-- Completing Objects: twenty-three question rungs across nine concepts.
--
-- Tenth topic built to the Values template. The remaining two rungs --
-- destructuring / produce and json-shape / produce -- are code-writing
-- movements registered by 057.
--
-- THE WIDEST INTERPRETER EXTENSION SO FAR. Nine separate pieces of syntax had
-- to exist before a single question could be written: object literals,
-- dot and bracket access, property assignment, `delete`, `for...of` and
-- `for...in`, `?.`, destructuring, object spread, `JSON`, and `new Map()` /
-- `new Set()`. `new` left the refused list here, as `var` did at Scope.
--
-- `{` IS TOLD FROM A BLOCK BY POSITION, exactly as JavaScript does it: a
-- statement that begins with `{` is a block, and an object literal is only
-- ever reached from expression position.
--
-- OBJECTS ARE HELD IN A MAP, NOT A PLAIN OBJECT, so `person.constructor` is
-- `undefined` rather than a real JavaScript function. That is the same lesson
-- this codebase learned once before, at the string method table.
--
-- EVERY SNIPPET BELOW HAS BEEN RUN. The claimed output is the output.
--
-- THE DISTINCTION THE TOPIC KEEPS RETURNING TO: a name holds a REFERENCE to an
-- object, so two names can be one object, and copying has to be asked for.

BEGIN;

CREATE OR REPLACE FUNCTION seed_obj(
    p_concept TEXT, p_demand TEXT, p_prompt TEXT,
    p_correct TEXT, p_wrong TEXT[], p_why TEXT
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_question BIGINT; v_challenge BIGINT; v_wrong TEXT; v_order INT := 1; v_type TEXT;
BEGIN
    SELECT id INTO v_question FROM questions WHERE prompt = p_prompt;
    IF v_question IS NOT NULL THEN RETURN; END IF;

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
        (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation)
    VALUES (p_prompt, 3, 'objects', v_type, v_challenge, 'jolt-objects-completion', p_why)
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

/* ── 1 · object-access ──────────────────────────────────────────────────── */

SELECT seed_obj('object-access', 'recognise',
    E'Which one reads the city when the key is held in a variable?\n\nlet u = { city: "Brooklyn" };\nlet k = "city";',
    'u[k]', ARRAY['u.k', 'u."city"', 'u(k)'],
    'A dot takes the name written after it literally, so `u.k` looks for a property actually called "k" and finds nothing. Brackets work out what is inside them first, which is the only way to use a key decided while the program runs.');

SELECT seed_obj('object-access', 'predict',
    E'What does this log?\n\nlet p = { a: 1 };\nconsole.log(p.b);',
    'undefined', ARRAY['an error', 'null', 'b'],
    'Reading a property that is not there is allowed, and gives `undefined`. That quietness is why a mistyped property name usually shows up much later, somewhere else.');

/* ── 2 · object-mutation ────────────────────────────────────────────────── */

SELECT seed_obj('object-mutation', 'predict',
    E'What does this log?\n\nlet p = { a: 1 };\np.b = 2;\ndelete p.a;\nconsole.log(p);',
    '{ b: 2 }', ARRAY['{ a: 1, b: 2 }', '{ a: undefined, b: 2 }', '{}'],
    'Properties can be added and removed at any time. `p.b = 2` made a new one, and `delete p.a` took the old one away entirely — key and all.');

-- Shown by PRINTING the object rather than by walking its keys: `for...in` is
-- two concepts later, and `{ a: 1, b: undefined }` makes the surviving key just
-- as visible without reaching forward for it.
SELECT seed_obj('object-mutation', 'diagnose',
    E'This should remove the property, and it is still there.\n\nlet p = { a: 1, b: 2 };\np.b = undefined;\nconsole.log(p);\n\nWhich line is the cause?',
    'p.b = undefined;',
    ARRAY['let p = { a: 1, b: 2 };', 'console.log(p);', 'nothing — it works'],
    'Setting a property to `undefined` leaves the key exactly where it was; only its value changed, so the object still prints it. `delete p.b` removes the key as well. Reading either one gives `undefined`, which is what hides the difference.');

/* ── 3 · nested-objects ─────────────────────────────────────────────────── */

SELECT seed_obj('nested-objects', 'recognise',
    E'Which one reaches the city?\n\nlet u = { home: { city: "Brooklyn" } };',
    'u.home.city', ARRAY['u.city', 'u[home][city]', 'u.home[city]'],
    'One step per level. `u.city` looks for a city on the outer object and finds nothing, and the bracket forms here use `home` and `city` as variable names rather than as keys.');

SELECT seed_obj('nested-objects', 'predict',
    E'What does this log?\n\nlet u = { home: { city: "Brooklyn" } };\nconsole.log(u.work.city);',
    'an error', ARRAY['undefined', 'Brooklyn', 'null'],
    '`u.work` is `undefined`, and reading `.city` from nothing is where it stops. One missing property is quiet; reaching THROUGH one is not.');

/* ── 4 · for-of-for-in ──────────────────────────────────────────────────── */

SELECT seed_obj('for-of-for-in', 'recognise',
    E'Which loop prints the VALUES of a list?\n\nlet nums = [10, 20];',
    'for (const n of nums)', ARRAY['for (const n in nums)', 'for (const n = nums)', 'for (n of nums)'],
    '`of` walks the values. `in` walks the keys, which for a list are its positions — the single commonest mix-up between the two forms.');

SELECT seed_obj('for-of-for-in', 'predict',
    E'What does this log?\n\nfor (const i in ["a", "b"]) {\n  console.log(i);\n}',
    '0 then 1', ARRAY['a then b', 'the whole list', 'nothing'],
    '`for...in` walks keys, and a list''s keys are its positions — handed over as text, not numbers. `for...of` is the one that gives "a" and then "b".');

SELECT seed_obj('for-of-for-in', 'diagnose',
    E'This should print each name and prints numbers instead.\n\nlet names = ["Tati", "Sam"];\nfor (const n in names) {\n  console.log(n);\n}\n\nWhich line is the cause?',
    'for (const n in names) {',
    ARRAY['let names = ["Tati", "Sam"];', 'console.log(n);', 'nothing — it works'],
    'One word. `in` asked for the keys and got the positions; `of` asks for the values. Everything else about the loop is right.');

/* ── 5 · optional-chaining ──────────────────────────────────────────────── */

SELECT seed_obj('optional-chaining', 'recognise',
    E'`home` may be missing. Which one gives undefined instead of failing?\n\nlet u = { name: "Tati" };',
    'u.home?.city', ARRAY['u.home.city', 'u?.home.city', 'u.home.city?'],
    'The `?.` has to sit where the gap is. `u?.home.city` guards `u`, which is present, and then still falls over on `.city` — guarding the wrong step is the same as not guarding at all.');

SELECT seed_obj('optional-chaining', 'predict',
    E'What does this log?\n\nlet u = { name: "Tati" };\nconsole.log(u.home?.city);',
    'undefined', ARRAY['an error', 'null', 'Tati'],
    '`u.home` is missing, so `?.` stops there and the whole expression is `undefined`. Without the question mark this would have failed.');

SELECT seed_obj('optional-chaining', 'explain',
    E'Why does `a?.b.c` not fail at `.c` when `a` is missing?',
    'The ?. stops the whole rest of the chain, rather than only the step it is written on',
    ARRAY['Because .c is only reached when .b succeeds, by coincidence',
          'Because undefined quietly answers any property with undefined',
          'Because the chain is read from right to left'],
    'The mechanism is short-circuiting. The moment `?.` meets nothing, everything after it is abandoned and the answer is `undefined` — so one question mark can guard a long chain, as long as it sits at the step that might be missing.');

/* ── 6 · destructuring ──────────────────────────────────────────────────── */

SELECT seed_obj('destructuring', 'recognise',
    E'Which one pulls `name` out into its own variable?\n\nlet p = { name: "Tati", age: 3 };',
    'const { name } = p;', ARRAY['const name = { p };', 'const [name] = p;', 'const { p } = name;'],
    'The braces on the LEFT say which properties to take out, and the variable takes the property''s own name. Square brackets would pull from a list by position instead.');

SELECT seed_obj('destructuring', 'predict',
    E'What does this log?\n\nconst { missing } = { a: 1 };\nconsole.log(missing);',
    'undefined', ARRAY['an error', 'null', '{ a: 1 }'],
    'Destructuring is reading properties, so a name the object has not got behaves exactly as `obj.missing` would — `undefined`, quietly.');

/* ── 7 · object-references ──────────────────────────────────────────────── */

SELECT seed_obj('object-references', 'predict',
    E'What does this log?\n\nlet a = { x: 1 };\nlet b = a;\nb.x = 9;\nconsole.log(a.x);',
    '9', ARRAY['1', 'undefined', 'an error'],
    '`let b = a` did not copy anything — it gave the same object a second name. Changing it through either name changes the one object they both hold.');

SELECT seed_obj('object-references', 'diagnose',
    E'This should leave the original alone and changes it.\n\nlet settings = { theme: "dark" };\nlet copy = settings;\ncopy.theme = "light";\nconsole.log(settings.theme);\n\nWhich line is the cause?',
    'let copy = settings;',
    ARRAY['copy.theme = "light";', 'console.log(settings.theme);', 'let settings = { theme: "dark" };'],
    'The name says copy and the line does not make one. Everything below it would be correct the moment there were genuinely two objects.');

SELECT seed_obj('object-references', 'repair',
    E'let settings = { theme: "dark" };\nlet copy = settings;\ncopy.theme = "light";\nconsole.log(settings.theme);\n\nThis prints light and should print dark. Which change fixes it?',
    'Change `let copy = settings;` to `let copy = { ...settings };`',
    ARRAY['Declare `settings` with `const` instead of `let`',
          'Move the assignment above the copy',
          'Use `copy.theme == "light"` instead'],
    'Spread builds a new object with the same properties, so there are two. `const` would not help: it fixes which object the name points at, not what is inside it — the same trap as with lists.');

SELECT seed_obj('object-references', 'explain',
    E'Why does assigning an object to a second name not copy it?',
    'The name holds a reference to the object, and assigning copies the reference rather than the contents',
    ARRAY['Because objects are too large to copy automatically',
          'Because only arrays are copied when assigned',
          'Because the copy happens later, when a property is first changed'],
    'The mechanism is what a name holds. For a number the value itself is stored, so a second name gets its own; for an object the name holds a way to REACH it, and copying that still leads to the one object.');

/* ── 8 · json-shape ─────────────────────────────────────────────────────── */

SELECT seed_obj('json-shape', 'recognise',
    E'Which one turns an object into text that can be sent or saved?',
    'JSON.stringify(p)', ARRAY['JSON.parse(p)', 'p.toText()', 'JSON.write(p)'],
    '`stringify` goes from an object to text and `parse` comes back the other way. The names are worth getting the right way round early, because mixing them up usually fails somewhere far from the mistake.');

SELECT seed_obj('json-shape', 'predict',
    E'What does this log?\n\nlet p = { a: 1, f: () => 1 };\nconsole.log(JSON.stringify(p));',
    '{"a":1}', ARRAY['{"a":1,"f":null}', '{"a":1,"f":"() => 1"}', 'an error'],
    'JSON carries data, not behaviour, so the function was dropped without complaint. `undefined` goes the same way — which is why a round trip can quietly give back less than you put in.');

/* ── 9 · built-in-collections ───────────────────────────────────────────── */

SELECT seed_obj('built-in-collections', 'recall',
    E'Which one holds each value only once, however many times it is added?',
    'a Set', ARRAY['a Map', 'a plain object', 'an array'],
    'A Set is defined by uniqueness — adding a value it already holds does nothing. A Map keeps pairs, and an array keeps everything in order including repeats.');

SELECT seed_obj('built-in-collections', 'recognise',
    E'Which one counts how many DIFFERENT numbers are in the list?\n\nlet nums = [1, 1, 2];',
    'new Set(nums).size', ARRAY['nums.length', 'nums.size', 'new Map(nums).size'],
    'Building a Set from the list drops the repeats, and `.size` counts what is left. `nums.length` counts every entry, repeats and all.');

SELECT seed_obj('built-in-collections', 'predict',
    E'What does this log?\n\nlet s = new Set([1, 1, 2, 2, 3]);\nconsole.log(s.size);',
    '3', ARRAY['5', '2', '1'],
    'Five values went in and three distinct ones stayed. A Set never has to be told to remove duplicates; it simply never holds one twice.');

DROP FUNCTION seed_obj(TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

COMMIT;
