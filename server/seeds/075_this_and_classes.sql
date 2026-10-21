-- `this` and Classes: the last topic, and what takes the curriculum to 100/100.
--
-- WHAT THIS FILE IS. Five concepts were declared in 014_curriculum with their
-- rungs and prerequisites, and nothing filled them: thirteen declared rungs and
-- zero challenges. The interpreter could not run `this` or `class` either, so
-- the content could not have been honest even if it had been written. littleJs
-- now executes all of it -- `this` bound at the call site, method shorthand,
-- class/constructor/new, prototype lookup, extends and super -- so every
-- snippet below is a claim a learner can check in Experiment.
--
-- THE THIRTEEN RUNGS, exactly as concept_demands declares them:
--
--   this-binding  predict, diagnose, repair, explain   (4)
--   methods       recognise, predict                   (2)
--   classes       recognise, predict, produce          (3)
--   prototypes    recognise, explain                   (2)
--   inheritance   predict, explain                     (2)
--
-- Twelve are questions, seeded here. The thirteenth -- classes/produce -- is a
-- MOVEMENT, because "define a class and create instances from it" is something
-- a learner does or does not do and cannot be asked as four options. It is
-- authored in client/src/games/practice.ts and addressed by (concept, demand);
-- this file records only that a movement realises the rung, which is what
-- challenges.activity is for.
--
-- INTRODUCTIONS ARE NOT OPTIONAL HERE. roleEligible withholds `practise`
-- content until its concept has been encountered, so a concept with no
-- `introduce` challenge has unreachable practice. All five get one.

BEGIN;

-- The topic's one-line principle, which every other topic has and this one did
-- not -- it renders on the map and the world page.
UPDATE topics
SET principle = 'Objects can carry behaviour as well as data. `this` is how a '
             || 'method reaches the object it was called on, and a class is a '
             || 'way of writing that behaviour once for every object built from it.'
WHERE slug = 'this-and-classes' AND (principle IS NULL OR TRIM(principle) = '');

-- An introduction per concept, so its practice becomes reachable. Guarded, so a
-- re-run adds nothing.
INSERT INTO challenges (concept_id, demand_id, role, difficulty)
SELECT c.id, d.id, 'introduce', 2
FROM concepts c
JOIN concept_demands cd ON cd.concept_id = c.id
JOIN demands d ON d.id = cd.demand_id
WHERE c.slug IN ('this-binding', 'methods', 'classes', 'prototypes', 'inheritance')
  AND d.slug = (
      SELECT d2.slug FROM concept_demands cd2
      JOIN demands d2 ON d2.id = cd2.demand_id
      WHERE cd2.concept_id = c.id
      ORDER BY d2.display_order LIMIT 1
  )
  AND NOT EXISTS (
      SELECT 1 FROM challenges ch
      WHERE ch.concept_id = c.id AND ch.role = 'introduce' AND ch.is_active
  );

CREATE OR REPLACE FUNCTION seed_tac(
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
    WHERE source = 'jolt-this-and-classes' AND external_ref = p_ref;

    IF v_question IS NOT NULL THEN RETURN; END IF;

    /*
     * ADOPTION, for rows seeded before names existed. They carry the right
     * content and no name, so the first run after this change gives them one
     * rather than inserting beside them. Restricted to rows that have no name
     * yet, so it can never steal a question that already belongs to another.
     */
    SELECT id INTO v_question
    FROM questions
    WHERE prompt = p_prompt AND source = 'jolt-this-and-classes' AND external_ref IS NULL
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
    VALUES (p_prompt, 3, 'this-and-classes', v_type, v_challenge, 'jolt-this-and-classes', p_why, p_ref)
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

/* ── 1 · this-binding ───────────────────────────────────────────────────── */

SELECT seed_tac(
    'this-binding-predict-01',
    'this-binding', 'predict',
    E'What does this log?\n\nconst dog = {\n  name: "Rex",\n  bark() { console.log(this.name); }\n};\n\ndog.bark();',
    'Rex', ARRAY['undefined', 'name', 'this.name'],
    'The call was `dog.bark()`, so `this` is `dog` and `this.name` is "Rex". What decided it was the object in front of the dot, not where the function was written.');

SELECT seed_tac(
    'this-binding-diagnose-01',
    'this-binding', 'diagnose',
    E'Which line is the cause?\n\nconst timer = {\n  label: "tick",\n  show() { console.log(this.label); }\n};\n\nconst run = timer.show;\nrun();',
    'const run = timer.show;',
    ARRAY['show() { console.log(this.label); }', 'label: "tick",', 'run();'],
    'Taking the method off the object left a function with no object to be `this`. The method itself is fine -- `timer.show()` works. The line that broke the connection is the one that stored it somewhere else.');

SELECT seed_tac(
    'this-binding-repair-01',
    'this-binding', 'repair',
    E'The last two lines print nothing useful. What fixes it?\n\nconst timer = {\n  label: "tick",\n  show() { console.log(this.label); }\n};\n\nconst run = timer.show;\nrun();',
    'replace both lines with `timer.show();`',
    ARRAY['change `this.label` to `label`', 'wrap the call: `console.log(run())`', 'give `show` a parameter and pass the label in'],
    'Calling it through the object is what gives `this` something to be. `label` on its own is not a variable anywhere, and passing the label in would work but sidesteps the thing methods exist for.');

SELECT seed_tac(
    'this-binding-explain-01',
    'this-binding', 'explain',
    E'One function, stored on two objects. Why do the two calls print different names?\n\nfunction who() { console.log(this.name); }\n\nconst a = { name: "Ada", who };\nconst b = { name: "Bo", who };\n\na.who();\nb.who();',
    'whichever object was in front of the dot at that call',
    ARRAY['each object was given its own copy of the function', 'the function remembers the object it was added to first', 'a method always uses the object it was written beside'],
    'There is one function and both names point at it. Nothing about it changed between the calls -- only who called it did, and that is what `this` reads.');

/* ── 2 · methods ────────────────────────────────────────────────────────── */

SELECT seed_tac(
    'methods-recognise-01',
    'methods', 'recognise',
    E'Which of these is a method?',
    'a function stored on an object',
    ARRAY['a variable holding a piece of text', 'any function written with the word `function`', 'a function that takes an object as its argument'],
    'A method is a function that belongs to an object, which is what lets it reach the rest of that object through `this`. A function that merely receives an object is an ordinary function.');

SELECT seed_tac(
    'methods-predict-01',
    'methods', 'predict',
    E'What does this log?\n\nconst cart = {\n  total: 10,\n  addFee(fee) { return this.total + fee; }\n};\n\nconsole.log(cart.addFee(5));',
    '15', ARRAY['10', '5', 'undefined'],
    'A method can take arguments like any function and reach its own object at the same time: `this.total` is 10, the 5 came in as `fee`, and the method returns their sum.');

/* ── 3 · classes ────────────────────────────────────────────────────────── */

SELECT seed_tac(
    'classes-recognise-01',
    'classes', 'recognise',
    E'Which line actually builds a dog?\n\nclass Dog {\n  constructor(name) { this.name = name; }\n}',
    'const d = new Dog("Rex");',
    ARRAY['class Dog { ... }', 'constructor(name) { ... }', 'Dog("Rex");'],
    'The class is a description of how to build dogs; it is not a dog. `new` is what builds one, and the constructor runs during that building rather than starting it.');

SELECT seed_tac(
    'classes-predict-01',
    'classes', 'predict',
    E'What does this log?\n\nclass Counter {\n  constructor() { this.n = 0; }\n  add() { this.n = this.n + 1; }\n}\n\nconst a = new Counter();\nconst b = new Counter();\na.add();\na.add();\nb.add();\n\nconsole.log(a.n + " and " + b.n);',
    '2 and 1', ARRAY['3 and 3', '1 and 1', '0 and 0'],
    'Each `new Counter()` builds a separate object with its own `n`. They share the `add` method and nothing else -- if they shared the data too, a class would be no better than a single object.');

/* ── 4 · prototypes ─────────────────────────────────────────────────────── */

SELECT seed_tac(
    'prototypes-recognise-01',
    'prototypes', 'recognise',
    E'Where does `speak` actually live?\n\nclass Dog {\n  constructor(name) { this.name = name; }\n  speak() { return "woof"; }\n}\nconst rex = new Dog("Rex");',
    'on the class, shared by every dog',
    ARRAY['on `rex`, copied in when it was built', 'in both places, kept in step automatically', 'nowhere until the moment it is called'],
    'The constructor put `name` on the dog itself, one per dog. `speak` was stored once on the class, and `rex.speak()` finds it by looking at the dog first and the class second.');

SELECT seed_tac(
    'prototypes-explain-01',
    'prototypes', 'explain',
    E'Why does this log `own` rather than `method`?\n\nclass Tag {\n  constructor() { this.label = "own"; }\n  label() { return "method"; }\n}\n\nconsole.log(new Tag().label);',
    'the object''s own property is found first',
    ARRAY['a constructor always takes priority over a method', 'two things cannot share a name, so the method was dropped', 'properties are searched in alphabetical order'],
    'The search goes outward and stops at the first match: the object itself, then its class, then that class''s parent. `label` was found on the object, so the one on the class was never reached.');

/* ── 5 · inheritance ────────────────────────────────────────────────────── */

SELECT seed_tac(
    'inheritance-predict-01',
    'inheritance', 'predict',
    E'What does this log?\n\nclass Animal {\n  speak() { return "some sound"; }\n}\nclass Dog extends Animal {\n  speak() { return "woof"; }\n}\n\nconsole.log(new Dog().speak());',
    'woof', ARRAY['some sound', 'some sound woof', 'an error, because speak is defined twice'],
    'The same outward search as always: Dog is looked at before Animal, and Dog has its own `speak`. Defining a method a parent already has is allowed, and is called overriding.');

SELECT seed_tac(
    'inheritance-explain-01',
    'inheritance', 'explain',
    E'Why use `super.speak()` here rather than writing the sentence out again?\n\nclass Dog extends Animal {\n  speak() { return super.speak() + " -- a bark"; }\n}',
    'it runs the parent''s version before adding to it',
    ARRAY['it is required in every method a subclass defines', 'it makes the same method run twice over', 'it copies the parent''s method onto Dog'],
    'Without it the parent''s work is simply gone. With it, two methods run once each -- Animal''s, then the rest of Dog''s -- so a change to Animal still reaches every subclass that builds on it.');

DROP FUNCTION seed_tac(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

-- The thirteenth rung: realised by a movement rather than a content row.
-- No identifier is stored -- a movement is addressed by (concept, demand) and
-- already carries both. See migration 030.
INSERT INTO challenges (concept_id, demand_id, role, difficulty, activity)
SELECT c.id, d.id, 'practise', 3, 'mission'
FROM concepts c, demands d
WHERE c.slug = 'classes' AND d.slug = 'produce'
  AND NOT EXISTS (
      SELECT 1 FROM challenges ch
      WHERE ch.concept_id = c.id AND ch.demand_id = d.id AND ch.activity = 'mission'
  );

COMMIT;
