-- GENERATED FILE -- DO NOT EDIT BY HAND.
--
-- Source:    client/src/games/curriculum.ts
-- Generator: server/scripts/generate-curriculum.ts
-- Regenerate: npm run curriculum:generate
--
-- Edits here are lost the next time the curriculum is projected, and
-- generateCurriculum.test.ts fails if this file and the source disagree.
--
-- CONVERGENT, NOT ADDITIVE. Seeds carry no ledger and are re-run every
-- time, so this file has to leave the curriculum tables holding exactly
-- what the source says -- no more. A concept removed from the source
-- disappears from the database rather than lingering as a tag nothing
-- points at.
--
-- Three convergence strategies, for three different reasons:
--   topics, concepts, demands  upsert by slug, then delete what is gone
--   prerequisites              rebuilt outright; nothing references it
--   concept_demands            converged pair by pair, because challenges
--                              holds a composite FK to it ON DELETE
--                              RESTRICT -- see that section
--
-- 16 topics · 100 concepts · 7 demands

BEGIN;

-- Rebuilt outright: an upsert cannot remove a prerequisite the source no
-- longer declares, and nothing holds a foreign key to this table.
DELETE FROM prerequisites;

-- ─────────────────────────────────────────────────────────── demands ──

INSERT INTO demands (slug, display_order, asks)
VALUES ('recall', 1, 'Retrieve what something does from memory, with no instance in front of you.')
ON CONFLICT (slug) DO UPDATE
    SET display_order = EXCLUDED.display_order,
        asks          = EXCLUDED.asks,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO demands (slug, display_order, asks)
VALUES ('recognise', 2, 'Judge a presented instance as correct or not.')
ON CONFLICT (slug) DO UPDATE
    SET display_order = EXCLUDED.display_order,
        asks          = EXCLUDED.asks,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO demands (slug, display_order, asks)
VALUES ('predict', 3, 'Run it in your head and state the result.')
ON CONFLICT (slug) DO UPDATE
    SET display_order = EXCLUDED.display_order,
        asks          = EXCLUDED.asks,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO demands (slug, display_order, asks)
VALUES ('produce', 4, 'Construct or complete code so that it works.')
ON CONFLICT (slug) DO UPDATE
    SET display_order = EXCLUDED.display_order,
        asks          = EXCLUDED.asks,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO demands (slug, display_order, asks)
VALUES ('diagnose', 5, 'Locate the fault in code that runs wrongly.')
ON CONFLICT (slug) DO UPDATE
    SET display_order = EXCLUDED.display_order,
        asks          = EXCLUDED.asks,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO demands (slug, display_order, asks)
VALUES ('repair', 6, 'Produce the correction, not merely its location.')
ON CONFLICT (slug) DO UPDATE
    SET display_order = EXCLUDED.display_order,
        asks          = EXCLUDED.asks,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO demands (slug, display_order, asks)
VALUES ('explain', 7, 'Give the mechanism, not the outcome.')
ON CONFLICT (slug) DO UPDATE
    SET display_order = EXCLUDED.display_order,
        asks          = EXCLUDED.asks,
        updated_at    = CURRENT_TIMESTAMP;

DELETE FROM demands WHERE slug <> ALL (ARRAY['recall', 'recognise', 'predict', 'produce', 'diagnose', 'repair', 'explain']);

-- ──────────────────────────────────────────────────────────── topics ──

INSERT INTO topics (slug, name, tier, display_order, rationale, principle)
VALUES ('values', 'Values and Types', 'beginner', 1,
        'The root of the graph. Every later idea is about moving values around, so a player who cannot name what kind of thing they are holding cannot reason about anything that happens to it.',
        'A program is made of values. Every value has a type, every expression the program runs collapses into a single value, and what a value can do depends on which type it is.')
ON CONFLICT (slug) DO UPDATE
    SET name          = EXCLUDED.name,
        tier          = EXCLUDED.tier,
        display_order = EXCLUDED.display_order,
        rationale     = EXCLUDED.rationale,
        principle     = EXCLUDED.principle,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO topics (slug, name, tier, display_order, rationale, principle)
VALUES ('variables', 'Variables', 'beginner', 2,
        'A variable is a value with a name attached, so it is meaningless before values. Comes before operators only by convention -- the two are near-simultaneous in practice.',
        'Variables give names to values so a program can refer to information again later and replace it as it changes. The name and the value are two separate things.')
ON CONFLICT (slug) DO UPDATE
    SET name          = EXCLUDED.name,
        tier          = EXCLUDED.tier,
        display_order = EXCLUDED.display_order,
        rationale     = EXCLUDED.rationale,
        principle     = EXCLUDED.principle,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO topics (slug, name, tier, display_order, rationale, principle)
VALUES ('operators', 'Operators', 'beginner', 3,
        'Split out of the old `conditionals` topic, which was conflating two things: `5 > 3` is an operator question, `if (x) {}` is a control-flow question. Comparison and logic have to be solid before a branch that depends on them means anything.',
        'Operators combine values into new values. Arithmetic produces numbers, comparison produces booleans, and a boolean is what every decision is ultimately made from.')
ON CONFLICT (slug) DO UPDATE
    SET name          = EXCLUDED.name,
        tier          = EXCLUDED.tier,
        display_order = EXCLUDED.display_order,
        rationale     = EXCLUDED.rationale,
        principle     = EXCLUDED.principle,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO topics (slug, name, tier, display_order, rationale, principle)
VALUES ('control-flow', 'Control Flow', 'beginner', 4,
        'A branch is an operator result acted upon. Teaching `if` before truthiness produces players who can read the syntax and cannot predict which way it goes.',
        'A program chooses which code to run by evaluating a condition down to true or false. Conditions can be combined and nested, and only the branch that wins actually runs.')
ON CONFLICT (slug) DO UPDATE
    SET name          = EXCLUDED.name,
        tier          = EXCLUDED.tier,
        display_order = EXCLUDED.display_order,
        rationale     = EXCLUDED.rationale,
        principle     = EXCLUDED.principle,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO topics (slug, name, tier, display_order, rationale, principle)
VALUES ('strings', 'Strings', 'beginner', 5,
        'Sits off to the side of the main spine: it needs only values, and nothing downstream depends on it. That makes it useful early breadth without blocking anything.',
        'A string is an ordered sequence of characters, counted from zero, that can never be changed in place. Every operation on a string produces a new one and leaves the original alone.')
ON CONFLICT (slug) DO UPDATE
    SET name          = EXCLUDED.name,
        tier          = EXCLUDED.tier,
        display_order = EXCLUDED.display_order,
        rationale     = EXCLUDED.rationale,
        principle     = EXCLUDED.principle,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO topics (slug, name, tier, display_order, rationale, principle)
VALUES ('loops', 'Loops', 'beginner', 6,
        'A loop is a condition plus a changing variable. Both prerequisites are load-bearing: the condition decides whether it runs again, the variable is what changes.',
        '')
ON CONFLICT (slug) DO UPDATE
    SET name          = EXCLUDED.name,
        tier          = EXCLUDED.tier,
        display_order = EXCLUDED.display_order,
        rationale     = EXCLUDED.rationale,
        principle     = EXCLUDED.principle,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO topics (slug, name, tier, display_order, rationale, principle)
VALUES ('functions', 'Functions', 'beginner', 7,
        'The hinge of the whole curriculum. Almost everything intermediate and advanced passes through it -- callbacks, array methods, closures, promises and classes are all functions wearing different hats.',
        '')
ON CONFLICT (slug) DO UPDATE
    SET name          = EXCLUDED.name,
        tier          = EXCLUDED.tier,
        display_order = EXCLUDED.display_order,
        rationale     = EXCLUDED.rationale,
        principle     = EXCLUDED.principle,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO topics (slug, name, tier, display_order, rationale, principle)
VALUES ('scope', 'Scope and Closures', 'intermediate', 8,
        'Marcy teaches this fourth, immediately after functions and BEFORE arrays and objects. That ordering is the single most important correction to Jolt''s earlier draft, which filed scope with the advanced material. Closures, `this` and the event loop all rest on it, so deferring it leaves three advanced topics standing on nothing.',
        '')
ON CONFLICT (slug) DO UPDATE
    SET name          = EXCLUDED.name,
        tier          = EXCLUDED.tier,
        display_order = EXCLUDED.display_order,
        rationale     = EXCLUDED.rationale,
        principle     = EXCLUDED.principle,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO topics (slug, name, tier, display_order, rationale, principle)
VALUES ('arrays', 'Arrays', 'intermediate', 9,
        'Needs loops because iteration is how a beginner first works through a list, and variables because the reference-versus-copy distinction is a variable-level idea before it is an array-level one.',
        '')
ON CONFLICT (slug) DO UPDATE
    SET name          = EXCLUDED.name,
        tier          = EXCLUDED.tier,
        display_order = EXCLUDED.display_order,
        rationale     = EXCLUDED.rationale,
        principle     = EXCLUDED.principle,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO topics (slug, name, tier, display_order, rationale, principle)
VALUES ('array-methods', 'Array Methods', 'intermediate', 10,
        'Two hard prerequisites and both are real. `map` is the point where a learner passes a function to another function for the first time, so a shaky grasp of either side shows up here as confusion about the callback.',
        '')
ON CONFLICT (slug) DO UPDATE
    SET name          = EXCLUDED.name,
        tier          = EXCLUDED.tier,
        display_order = EXCLUDED.display_order,
        rationale     = EXCLUDED.rationale,
        principle     = EXCLUDED.principle,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO topics (slug, name, tier, display_order, rationale, principle)
VALUES ('objects', 'Objects', 'intermediate', 11,
        'After arrays because reference semantics are easier to see in a list than in a nested record, and because real data is arrays of objects rather than either alone.',
        '')
ON CONFLICT (slug) DO UPDATE
    SET name          = EXCLUDED.name,
        tier          = EXCLUDED.tier,
        display_order = EXCLUDED.display_order,
        rationale     = EXCLUDED.rationale,
        principle     = EXCLUDED.principle,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO topics (slug, name, tier, display_order, rationale, principle)
VALUES ('errors', 'Errors and Debugging', 'intermediate', 12,
        'Pulled earlier than Marcy places it. Marcy meets error handling inside async, but Jolt has a whole game about debugging, so the vocabulary of failure -- error types, stack traces, forming a hypothesis -- needs to exist before Bug Hunt can teach with it rather than merely test with it.',
        '')
ON CONFLICT (slug) DO UPDATE
    SET name          = EXCLUDED.name,
        tier          = EXCLUDED.tier,
        display_order = EXCLUDED.display_order,
        rationale     = EXCLUDED.rationale,
        principle     = EXCLUDED.principle,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO topics (slug, name, tier, display_order, rationale, principle)
VALUES ('dom', 'The DOM', 'advanced', 13,
        'Marcy places DOM before async, and Jolt follows -- but only half of it translates. Reasoning about the DOM (what a selector returns, in what order listeners fire) is predictable from source and fits existing games. Manipulating it needs a live document no Jolt game has, and that half is deliberately out of scope.',
        '')
ON CONFLICT (slug) DO UPDATE
    SET name          = EXCLUDED.name,
        tier          = EXCLUDED.tier,
        display_order = EXCLUDED.display_order,
        rationale     = EXCLUDED.rationale,
        principle     = EXCLUDED.principle,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO topics (slug, name, tier, display_order, rationale, principle)
VALUES ('async', 'Asynchronous JavaScript', 'advanced', 14,
        'Depends on errors as much as on functions: a promise chain whose failure path you cannot read is a coin flip, and `.catch` placement is the most common real-world async mistake.',
        '')
ON CONFLICT (slug) DO UPDATE
    SET name          = EXCLUDED.name,
        tier          = EXCLUDED.tier,
        display_order = EXCLUDED.display_order,
        rationale     = EXCLUDED.rationale,
        principle     = EXCLUDED.principle,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO topics (slug, name, tier, display_order, rationale, principle)
VALUES ('this-and-classes', '`this` and Classes', 'advanced', 15,
        '`this` is a scope question wearing an object''s clothes -- it is decided by the call site, which is exactly the kind of reasoning `scope` trains. Teaching classes before scope produces memorised rules rather than understanding.',
        '')
ON CONFLICT (slug) DO UPDATE
    SET name          = EXCLUDED.name,
        tier          = EXCLUDED.tier,
        display_order = EXCLUDED.display_order,
        rationale     = EXCLUDED.rationale,
        principle     = EXCLUDED.principle,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO topics (slug, name, tier, display_order, rationale, principle)
VALUES ('algorithms', 'Algorithms', 'advanced', 16,
        'Last because it is the first topic that is about choosing between correct solutions rather than reaching one. Recursion in particular needs functions and scope to be automatic, or the call stack is invisible.',
        '')
ON CONFLICT (slug) DO UPDATE
    SET name          = EXCLUDED.name,
        tier          = EXCLUDED.tier,
        display_order = EXCLUDED.display_order,
        rationale     = EXCLUDED.rationale,
        principle     = EXCLUDED.principle,
        updated_at    = CURRENT_TIMESTAMP;

DELETE FROM topics WHERE slug <> ALL (ARRAY['values', 'variables', 'operators', 'control-flow', 'strings', 'loops', 'functions', 'scope', 'arrays', 'array-methods', 'objects', 'errors', 'dom', 'async', 'this-and-classes', 'algorithms']);

-- ────────────────────────────────────────────────────────── concepts ──
--
-- POSITIONS ARE PARKED BEFORE ANY CONCEPT IS WRITTEN.
--
-- concepts carries two unique indexes: (slug), which the upserts below
-- target, and (topic_id, display_order), which they cannot. ON CONFLICT
-- handles "this concept exists, move it" and has nothing to say about "a
-- NEW concept wants a position an existing concept still holds" -- a
-- violation of the other index, which it does not cover.
--
-- That is not hypothetical. Adding `console-output` ahead of
-- `primitive-types` shifted every concept in `values` down by one, and the
-- very first INSERT then tried to claim position 1 while primitive-types
-- still sat on it: 23505 on concepts_topic_order_idx. Rows cannot be
-- renumbered one at a time under a unique (parent, position) index, in any
-- order -- so every existing row moves out of the way first, and each
-- upsert below claims its real position against a clear field.
--
-- 1000 is a BOUND, not a guess: a curriculum test caps a topic at nine
-- concepts, so no final display_order can reach it. A shift derived from
-- MAX(display_order) would be wrong -- it has to exceed the largest FINAL
-- position, not the largest current one, and on a database holding a
-- single concept it parks at 2 and collides with the second new concept.
--
-- Anything still parked afterwards is a concept the curriculum no longer
-- declares, and the DELETE at the end of this section removes it.
UPDATE concepts SET display_order = display_order + 1000;

-- Values and Types

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'values'),
    'console-output',
    'Running Code and Reading Output',
    'run a snippet and say what it prints',
    'console.log writes its arguments to the output, one line per call, in the order the lines run',
    'The first thing a learner has to be able to do, and the thing every prediction question in Jolt silently assumes. Someone unsure whether a line prints at all cannot reason about what it prints, and until now the curriculum never claimed to teach it.',
    'load-bearing',
    1
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'values'),
    'expressions-produce-values',
    'Expressions Produce Values',
    'work out the single value a piece of code collapses to',
    'an expression is any code that produces a value, and it is replaced by that value before anything else happens',
    'The idea the whole language rests on, and the one the curriculum never stated. Arguments, conditions, right-hand sides of assignments and array indexes are all expressions; a learner who cannot see that `total + 1` becomes one number before it is used has to relearn evaluation order separately in every one of those places.',
    'load-bearing',
    2
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'values'),
    'primitive-types',
    'Identifying Primitive Types',
    'name what kind of thing a value is',
    'JavaScript has a small set of primitive types, and every literal is one of them',
    'Every later idea is about moving values around, so a learner who cannot name what they are holding cannot reason about what happens to it. It follows the expression idea rather than opening the syllabus, because naming a kind of value only means something once you have watched code produce one.',
    'core',
    3
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'values'),
    'booleans',
    'The Two Boolean Values',
    'say where a true or a false came from',
    'true and false are values in their own right, and every comparison produces one of them',
    'Every condition a learner writes is a boolean underneath, and until now the curriculum only mentioned them in passing. Naming the type before it is used in an `if` is what stops `if (x = 5)` looking reasonable.',
    'core',
    4
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'values'),
    'typeof',
    'Checking Types with `typeof`',
    'check what type a value is at runtime',
    'typeof reports a value''s type as a string',
    'The answer space is a short finite table with one famous lie in it (typeof null), which makes it a genuine recall skill rather than a reasoning one.',
    'light',
    5
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'values'),
    'null-vs-undefined',
    'Telling `null` from `undefined`',
    'tell null and undefined apart and know which one you will get',
    'undefined means nobody set a value; null means somebody set it to nothing',
    'Two ways of saying nothing is a genuine source of confusion, and the difference explains a whole class of comparison surprises later.',
    'core',
    6
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'values'),
    'type-coercion',
    'Predicting Type Coercion',
    'predict what happens when types are mixed in an expression',
    'JavaScript silently converts types to make an operation work',
    'Load-bearing despite sitting in a beginner topic: coercion surprises reappear in equality, truthiness, array joining and JSON for the rest of the curriculum.',
    'load-bearing',
    7
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

-- Variables

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'variables'),
    'variables-name-values',
    'Names Refer to Values',
    'say what a name refers to at a given line',
    'a variable is a name pointing at a value; the name and the value are two separate things',
    'The idea every later variable skill is a special case of. A learner who thinks the name IS the value cannot make sense of reassignment, of two names pointing at one array, or of what const actually protects.',
    'load-bearing',
    1
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'variables'),
    'declaration',
    'Declaring a Variable',
    'bring a name into existence before giving it a value',
    'a declaration creates the name; until something is assigned to it the name holds undefined',
    'Separated from initialization because `let total;` and `let total = 0;` are different statements that beginners read as one. The undefined a bare declaration leaves behind is the source of a whole class of first-month bugs.',
    'core',
    2
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'variables'),
    'initialization',
    'Giving a Variable Its First Value',
    'declare a variable and give it a starting value in one statement',
    'initialization is the first assignment, written on the same line as the declaration',
    'The form almost all real code uses, and worth naming separately so that the declaration-only form reads as the deliberate choice it is rather than as a typo.',
    'core',
    3
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'variables'),
    'assignment',
    'Assigning a Value',
    'work out what gets stored when the right-hand side is an expression',
    'assignment evaluates everything on the right first, then stores that single value under the name on the left',
    'Right-before-left is what makes `count = count + 1` possible at all, and it is not obvious from the symbol. Naming it here means the accumulator pattern in loops is an application of a known rule rather than a new trick.',
    'load-bearing',
    4
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'variables'),
    'reading-variables',
    'Reading a Variable',
    'substitute a variable for its current value when reading an expression',
    'using a name anywhere in an expression fetches whatever value it holds at that moment',
    'The other half of the name-value split. Tracing any program is repeated substitution, and a learner who cannot do it by hand cannot predict output, which is most of what Jolt asks.',
    'load-bearing',
    5
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'variables'),
    'reassignment',
    'Reassigning Variables',
    'follow a variable as its value changes across several lines',
    'assigning again replaces what the name refers to, from that line onward',
    'Where names stop being labels and start being state. The word `onward` is the whole lesson: earlier lines keep the old value, and beginners routinely read a program as if the final value applied throughout.',
    'core',
    6
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'variables'),
    'let-vs-const',
    'Choosing between `let` and `const`',
    'choose between let and const and know what const actually protects',
    'const stops the name being pointed somewhere else; it does not freeze the value',
    'Follows reassignment rather than declaration, because const is defined by what it refuses to allow -- the rule is meaningless to someone who has not yet watched a name be pointed somewhere new.',
    'core',
    7
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'variables'),
    'variable-state',
    'Tracking Variables Through a Program',
    'track several variables at once through a block of code',
    'at any line, every variable in scope holds exactly one value',
    'The skill every prediction question actually tests. Holding three changing values in your head at once is the difference between reading code and guessing at it.',
    'core',
    8
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

-- Operators

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'operators'),
    'arithmetic-operators',
    'Using Arithmetic Operators',
    'evaluate an arithmetic expression without running it',
    'arithmetic operators combine two numbers into a new one',
    'Precedence and integer-vs-float surprises are small, but they sit underneath every accumulator and index calculation later.',
    'core',
    1
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'operators'),
    'assignment-operators',
    'Updating a Value in Place',
    'update a variable using its own current value',
    '`+=` and `++` read the variable, change it, and store the result back under the same name',
    'The shorthand every counter and running total is written with. Without it `total = total + n` stays a piece of magic, and the accumulator pattern in loops is unreadable rather than merely new.',
    'core',
    2
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'operators'),
    'comparison-operators',
    'Using Comparison Operators',
    'work out whether a comparison is true or false',
    'comparison operators ask a question about two values and answer true or false',
    'Every branch and every loop condition is a comparison. Getting these wrong makes control flow unpredictable rather than merely unfamiliar.',
    'core',
    3
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'operators'),
    'equality',
    'Comparing with `==` vs. `===`',
    'choose between == and === and predict what each one says',
    '=== compares value and type; == converts first and then compares',
    'The most consequential two-character decision a beginner makes, and the source of bugs that survive review because both forms look correct.',
    'load-bearing',
    4
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'operators'),
    'logical-operators',
    'Combining Conditions with `&&`, `||` and `!`',
    'combine conditions and predict what the whole expression gives',
    '&& and || return one of their operands, not necessarily a boolean',
    'That they return an operand rather than true or false is what makes default-value idioms work, and what makes them surprising until it is understood.',
    'core',
    5
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'operators'),
    'truthy-falsy',
    'Recognising Truthy and Falsy Values',
    'say whether a non-boolean value will pass a condition',
    'every value is either truthy or falsy, and the falsy list is short and worth memorising',
    'The falsy set is finite and learnable, and knowing it converts a whole class of mysterious branches into obvious ones.',
    'load-bearing',
    6
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

-- Control Flow

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'control-flow'),
    'if-else',
    'Branching with `if` and `else`',
    'say which branch of a condition will run',
    'an if runs its block only when its condition is truthy',
    'The first place a program stops being a straight line. Teaching it before truthiness produces learners who read the syntax and cannot predict the path.',
    'core',
    1
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'control-flow'),
    'else-if-chains',
    'Chaining `else if` Conditions',
    'work out which branch of a long chain wins',
    'an else-if chain runs the first matching branch and skips the rest',
    'Order matters and overlapping conditions are a classic silent bug: the second branch is unreachable and nothing complains.',
    'core',
    2
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'control-flow'),
    'compound-conditions',
    'Combining Conditions in a Decision',
    'predict which parts of a combined condition actually get evaluated',
    '&& stops at the first falsy part and || stops at the first truthy one, so the rest is never run',
    'Short-circuiting is where combined conditions stop being arithmetic on booleans and start mattering: it is why the null check has to come first in `user && user.name`, and why swapping the order breaks a program that looked equivalent.',
    'load-bearing',
    3
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'control-flow'),
    'nested-conditions',
    'Decisions Inside Decisions',
    'work out which branch of a nested decision a given input reaches',
    'an if inside another if only runs when the outer condition was already true',
    'What beginners actually write before they know any alternative, and the shape most conditional bugs live in. Naming it also gives guard clauses something to be an improvement ON, rather than presenting them as arbitrary style.',
    'core',
    4
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'control-flow'),
    'ternary',
    'Choosing Values with the Ternary Operator',
    'read and write a conditional that produces a value',
    'a ternary chooses between two values in a single expression',
    'The bridge from statements that do something to expressions that are something, which matters as soon as callbacks arrive.',
    'core',
    5
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'control-flow'),
    'guard-clauses',
    'Exiting Early with Guard Clauses',
    'leave a function early instead of nesting the happy path',
    'a guard clause handles the exceptional case first and returns',
    'The single habit that most reduces nesting in real code. It follows nesting rather than if/else, because a guard clause is a FIX for nesting -- taught before the problem it solves, it is only a style rule to memorise.',
    'core',
    6
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

-- Strings

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'strings'),
    'string-literals',
    'Writing Text as a Value',
    'tell a string apart from the thing it looks like',
    'quotes turn whatever is between them into text, however numeric or code-like it looks',
    'The topic previously opened at indexing, which assumes a learner already knows what a string IS. `"25"` and `25` look identical on screen and behave nothing alike, and that confusion causes more beginner bugs than any indexing mistake.',
    'core',
    1
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'strings'),
    'string-concatenation',
    'Joining Strings with `+`',
    'predict what + gives you when a string is one of the operands',
    'if either side of + is a string, the other side is converted to text and the two are joined',
    'The first place coercion is visible rather than theoretical, and the reason `1 + 2 + "3"` and `"1" + 2 + 3` differ. Template literals cannot be taught as the better alternative until a learner has met the thing being replaced.',
    'load-bearing',
    2
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'strings'),
    'string-length',
    'Measuring a String',
    'use length to reason about the characters a string holds',
    'length counts every character, so the last index is always one less than it',
    'The off-by-one that indexing and every loop over text depends on. Taught before indexing because `text[text.length - 1]` is otherwise a formula to memorise rather than a consequence of counting from zero.',
    'core',
    3
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'strings'),
    'string-indexing',
    'Accessing Characters by Index',
    'get at a character or a slice by position',
    'a string is an ordered sequence of characters counted from zero',
    'Zero-based counting is easier to meet here, on something visible, than for the first time inside a loop over an array.',
    'core',
    4
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'strings'),
    'string-methods',
    'Transforming Strings with Methods',
    'pick the right method to reshape a piece of text',
    'string methods return a new string and leave the original alone',
    'A finite, frequently used vocabulary. Knowing which method exists is genuinely a recall skill before it is a reasoning one.',
    'core',
    5
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'strings'),
    'template-literals',
    'Building Strings with Template Literals',
    'build a string out of values without clumsy concatenation',
    'backticks let you drop values straight into text with ${}',
    'Ubiquitous in modern code, and the readable alternative to the plus-sign chains that beginners otherwise write.',
    'core',
    6
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'strings'),
    'string-immutability',
    'String Immutability',
    'know that string operations return new text rather than editing it',
    'strings cannot be changed in place; every operation produces a new one',
    'The first encounter with immutability, and a cheap one. Meeting it here makes the array-mutation contrast land much harder later.',
    'core',
    7
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

-- Loops

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'loops'),
    'for-loop-anatomy',
    'Reading a `for` Loop',
    'read a for loop and say how many times it runs',
    'a for loop has a start, a condition checked before each pass, and a step after each',
    'Three clauses doing three different jobs at three different times. Until that is separated out, every loop is guesswork.',
    'load-bearing',
    1
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'loops'),
    'while-loops',
    'Looping with `while`',
    'choose a while loop when the number of passes is not known up front',
    'a while loop repeats as long as its condition stays truthy',
    'Choosing between for and while is a real decision, and while is where infinite loops are learned about the hard way.',
    'core',
    2
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'loops'),
    'loop-conditions',
    'Setting Loop Bounds',
    'write a loop bound that covers every item exactly once',
    'the last valid index is length minus one, so the condition uses less-than',
    'Off-by-one is the most common loop bug there is, and it is a single comparison away from correct.',
    'load-bearing',
    3
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'loops'),
    'accumulators',
    'Building Results with Accumulators',
    'build up a total or a list across the passes of a loop',
    'an accumulator is a variable declared outside the loop and updated inside it',
    'The pattern behind sum, count, join and eventually reduce. Recognising it once makes all of those the same idea.',
    'load-bearing',
    4
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'loops'),
    'break-continue',
    'Interrupting Loops with `break` and `continue`',
    'stop a loop early or skip a single pass',
    'break leaves the loop entirely; continue skips to the next pass',
    'Two words that look similar and do very different things, and confusing them produces a loop that quietly does the wrong amount of work.',
    'core',
    5
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'loops'),
    'nested-loops',
    'Working with Nested Loops',
    'work out how many times the inner body of nested loops runs',
    'the inner loop runs all the way through on every single pass of the outer one',
    'The first place where a small change to code causes a large change in work done, which is the seed of thinking about cost.',
    'core',
    6
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'loops'),
    'for-of-for-in',
    'Choosing `for...of` vs. `for...in`',
    'choose the right loop form for arrays and for objects',
    'for-of walks values, for-in walks keys',
    'Mixing these up is a classic, and the failure is quiet: for-in over an array gives you string indices and nothing throws.',
    'core',
    7
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

-- Functions

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'functions'),
    'function-declaration',
    'Defining and Calling Functions',
    'define a function and call it',
    'defining a function stores instructions; calling it runs them',
    'The gap between defining and calling is the first thing beginners collapse, and every later confusion about callbacks starts there.',
    'load-bearing',
    1
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'functions'),
    'parameters-arguments',
    'Passing Parameters and Arguments',
    'pass values into a function and know what the names inside refer to',
    'parameters are the names in the definition; arguments are the values passed at the call',
    'Position matters, names are local, and missing arguments are undefined rather than an error. All three surprise people.',
    'core',
    2
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'functions'),
    'return-values',
    'Returning Values from Functions',
    'get a value back out of a function and know when you will not',
    'return hands a value back to the caller; a function without one gives undefined',
    'Logging inside a function and returning from it feel the same to a beginner and are completely different. This is the most valuable single distinction in the topic.',
    'load-bearing',
    3
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'functions'),
    'arrow-functions',
    'Writing Arrow Functions',
    'read and write arrow functions, including the implicit return',
    'an arrow function is shorter, and with no braces it returns its expression automatically',
    'Every array method takes one, so this has to be comfortable before array-methods rather than during it.',
    'load-bearing',
    4
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'functions'),
    'functions-as-values',
    'Passing Functions as Values',
    'pass a function to another function without calling it',
    'a function can be stored, passed and returned like any other value',
    'The idea that unlocks callbacks, array methods and closures at once. Calling instead of passing is the single most common beginner slip in the whole curriculum.',
    'load-bearing',
    5
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'functions'),
    'default-rest-params',
    'Using Default and Rest Parameters',
    'give parameters defaults and gather extra arguments',
    'a default fills in a missing argument; rest collects whatever is left into an array',
    'Common in real signatures, and defaults interact with undefined in a way worth seeing deliberately.',
    'light',
    6
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

-- Scope and Closures

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'scope'),
    'block-vs-function-scope',
    'Block and Function Scope',
    'say where a variable is visible and where it is not',
    'let and const live inside the nearest braces; var does not',
    'Scope is the first invisible rule in the language. Every closure and hoisting surprise later is this idea wearing a costume.',
    'load-bearing',
    1
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'scope'),
    'hoisting-tdz',
    'Hoisting & the Temporal Dead Zone',
    'predict what happens when a name is used before its declaration',
    'declarations are known before the code runs, but let and const cannot be touched until their line',
    'Explains a category of errors that otherwise look like the engine misbehaving, and it is unavoidable once function declarations and const coexist.',
    'core',
    2
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'scope'),
    'shadowing',
    'Resolving Variable Shadowing',
    'work out which of two same-named variables a line is using',
    'an inner declaration hides the outer one of the same name for that block',
    'Reading unfamiliar code means resolving names constantly, and a shadowed variable is invisible until you look for it.',
    'core',
    3
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'scope'),
    'closures',
    'Using Closures',
    'use a function that keeps access to the variables it was created with',
    'a function remembers the scope it was defined in, even after that scope has finished',
    'The most powerful idea in the topic and the one that makes counters, private state and most callback patterns make sense rather than seem magical.',
    'load-bearing',
    4
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'scope'),
    'loop-variable-capture',
    'Capturing Variables in Loops',
    'predict what a function created inside a loop will see when it runs',
    'let gives each pass its own variable; var shares one across all of them',
    'The classic interview bug, but more importantly the place where closures and loops collide and both have to be understood at once.',
    'core',
    5
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

-- Arrays

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'arrays'),
    'array-indexing',
    'Accessing Array Items by Index',
    'read an item out of a list by position',
    'array items are numbered from zero, and an index past the end gives undefined',
    'That an out-of-range index returns undefined rather than throwing is the reason so many array bugs surface far from their cause.',
    'core',
    1
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'arrays'),
    'array-length',
    'Using Array `length`',
    'use length correctly, including for the last index',
    'length counts the items, so the last index is always length minus one',
    'Half of all off-by-one errors are this one fact not being automatic yet.',
    'core',
    2
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'arrays'),
    'array-mutation',
    'Mutating Arrays in Place',
    'change a list in place and know which methods do that',
    'push, pop, splice and sort change the original array rather than returning a new one',
    'The mutating-versus-returning split runs through the whole of array-methods, and getting it wrong produces bugs that appear in unrelated code.',
    'load-bearing',
    3
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'arrays'),
    'array-copy-spread',
    'Copying Arrays with Spread',
    'copy an array without accidentally sharing it',
    'spread makes a new array one level deep; nested contents are still shared',
    'Shallow copying is the exact point where most people believe they have made a copy and have not.',
    'load-bearing',
    4
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'arrays'),
    'nested-arrays',
    'Working with Nested Arrays',
    'reach into an array of arrays and get the item you meant',
    'a nested array is just an array whose items are also arrays',
    'Grids, rows of records and matrix-shaped data are everywhere, and the double index needs to stop being a puzzle.',
    'core',
    5
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'arrays'),
    'array-reference-identity',
    'Comparing Arrays by Reference',
    'tell whether two variables point at one array or two',
    'arrays are compared by identity, so two arrays with identical contents are still not equal',
    'Explains why an equality check on two identical-looking arrays is false, and why changing one variable changed another.',
    'core',
    6
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

-- Array Methods

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'array-methods'),
    'map',
    'Transforming Arrays with `map()`',
    'transform every item in an array without mutating the original',
    'creates a new array by transforming each item',
    'The first non-mutating array method and the gateway to declarative list handling, and on to filter and reduce.',
    'load-bearing',
    1
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'array-methods'),
    'for-each',
    'Iterating with `forEach()`',
    'run a side effect for every item and know it returns nothing',
    'runs a function for each item and returns undefined',
    'Choosing between forEach and map is the clearest test of whether the return-value idea has landed.',
    'core',
    2
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'array-methods'),
    'filter',
    'Filtering Arrays with `filter()`',
    'keep only the items that pass a test',
    'keeps items whose test returns true, in a new array',
    'Pairs with map to cover most list work, and the truthiness of the callback result is where it goes wrong.',
    'load-bearing',
    3
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'array-methods'),
    'find-some-every',
    'Searching with `find()`, `some()` and `every()`',
    'pick the right method for finding an item or testing a whole list',
    'find returns an item, some and every return booleans',
    'A small family with a shared shape and different return types. Choosing correctly is a recall skill with a reasoning check attached.',
    'core',
    4
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'array-methods'),
    'reduce',
    'Reducing Arrays with `reduce()`',
    'collapse a list into a single value',
    'carries an accumulator through the list and returns whatever is left at the end',
    'The hardest array method and the one that generalises the rest. Meeting accumulators in loops first is what makes it tractable.',
    'load-bearing',
    5
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'array-methods'),
    'sort',
    'Sorting Arrays with `sort()`',
    'sort a list correctly, including numbers',
    'sorts in place, comparing as text unless you give it a comparator',
    'Two traps in one method: it mutates, and its default order puts 10 before 2. Both bite immediately and silently.',
    'core',
    6
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'array-methods'),
    'flat',
    'Flattening Arrays with `flat()`',
    'flatten nested arrays to the depth you need',
    'flat pulls nested array items up to the level you ask for',
    'Small, but the natural partner to nested arrays and to flatMap once map is comfortable.',
    'light',
    7
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'array-methods'),
    'method-chaining',
    'Chaining Array Methods',
    'chain array methods and follow what flows between them',
    'each method returns a new array, so the next one starts from that result',
    'Where array methods stop being separate tricks and become a way of expressing a whole transformation.',
    'core',
    8
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

-- Objects

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'objects'),
    'object-access',
    'Accessing Object Properties',
    'read a property with dot or bracket notation and know when to use which',
    'dot notation needs a literal name; brackets take any expression',
    'The moment a key is held in a variable, dot notation silently looks for the wrong property. That failure is quiet.',
    'core',
    1
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'objects'),
    'object-mutation',
    'Adding and Removing Properties',
    'add, change and remove properties on an object',
    'properties can be set or deleted at any time, on any object you hold',
    'Objects are mutable by default and shared by reference, so changing one is rarely as local as it looks.',
    'core',
    2
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'objects'),
    'nested-objects',
    'Navigating Nested Objects',
    'navigate a nested structure to the value you want',
    'a property can hold another object, as deep as the data goes',
    'Real data is nested. Reading an API response is mostly this skill and nothing else.',
    'core',
    3
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'objects'),
    'optional-chaining',
    'Safe Access with Optional Chaining',
    'read through a chain that might not exist without throwing',
    '?. stops and gives undefined instead of throwing when something is missing',
    'The modern answer to a very common crash, and it pairs directly with null-vs-undefined.',
    'core',
    4
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'objects'),
    'destructuring',
    'Destructuring Objects and Arrays',
    'pull values out of an object or array into named variables',
    'destructuring copies properties out into variables of the same name',
    'Ubiquitous in modern code, especially in function parameters, so it has to be readable before it is writable.',
    'core',
    5
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'objects'),
    'object-references',
    'Object References',
    'tell whether two names point at the same object',
    'assigning an object copies the reference, not the contents',
    'The single most consequential idea in the topic. Nearly every surprising mutation bug in a codebase comes back to it.',
    'load-bearing',
    6
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'objects'),
    'json-shape',
    'Converting Between Objects and JSON',
    'convert between objects and JSON text and know what does not survive',
    'JSON is text, and it can only carry a subset of what a JavaScript object can hold',
    'Every API boundary is this conversion, and functions, undefined and dates silently disappearing is a real source of confusion.',
    'core',
    7
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'objects'),
    'built-in-collections',
    'Using `Map` and `Set`',
    'choose a Map or a Set when a plain object is the wrong shape',
    'a Set holds unique values; a Map allows keys that are not strings',
    'Knowing these exist prevents a lot of awkward object abuse, even before they are used regularly.',
    'light',
    8
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

-- Errors and Debugging

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'errors'),
    'error-types',
    'Identifying Error Types',
    'tell from the error name what kind of thing went wrong',
    'the error type names the category of failure, before you read anything else',
    'A short finite vocabulary that turns an intimidating red block into a starting point. Genuinely a recall skill.',
    'core',
    1
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'errors'),
    'throwing',
    'Throwing Errors',
    'raise an error deliberately when something is wrong',
    'throw stops the current work immediately and hands an error up to the caller',
    'Errors are not only things that happen to you. Writing one is how a function refuses bad input honestly.',
    'core',
    2
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'errors'),
    'try-catch',
    'Handling Errors with `try` and `catch`',
    'catch a failure and decide what should happen next',
    'try runs risky code; catch receives the error if it fails; finally runs either way',
    'Control flow that jumps rather than falls through, which is genuinely new and has to be traced rather than read.',
    'core',
    3
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'errors'),
    'stack-traces',
    'Reading Stack Traces',
    'read a stack trace and find where to look first',
    'a stack trace lists the calls that were in progress, most recent first',
    'The difference between debugging and guessing. Most beginners never learn to read past the first line.',
    'core',
    4
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'errors'),
    'debugging-strategy',
    'Debugging Systematically',
    'narrow down a failure instead of changing things at random',
    'form a hypothesis, make one change that tests it, and keep what you learn',
    'The only concept in the curriculum that is a method rather than a feature, and the one that compounds most.',
    'load-bearing',
    5
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

-- The DOM

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'dom'),
    'selecting-elements',
    'Selecting DOM Elements',
    'get hold of an element on the page',
    'a selector finds elements in the document the same way CSS does',
    'Nothing else in the topic is reachable without it, and a null result is the first DOM bug everyone meets.',
    'core',
    1
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'dom'),
    'element-properties',
    'Reading and Changing Element Properties',
    'read and change what an element shows',
    'an element is an object whose properties describe and control what is on screen',
    'Makes the page concrete as data rather than as markup, which is the shift the whole topic depends on.',
    'core',
    2
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'dom'),
    'event-listeners',
    'Handling Events with Listeners',
    'run a function when something happens on the page',
    'a listener hands a function to the browser to call later',
    'The first place functions-as-values pays off visibly, and the first place calling instead of passing breaks something you can see.',
    'load-bearing',
    3
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'dom'),
    'event-order',
    'Event Bubbling Order',
    'predict the order handlers run in when elements are nested',
    'an event travels down to the target and then back up through its ancestors',
    'Explains handlers that seem to fire twice or in the wrong order, and it is pure sequencing practice.',
    'core',
    4
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'dom'),
    'dom-as-tree',
    'Navigating the DOM Tree',
    'move between an element and its parents, children and siblings',
    'the document is a tree of nodes, and every element sits somewhere in it',
    'The mental model that makes traversal, delegation and bubbling one idea rather than three.',
    'core',
    5
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

-- Asynchronous JavaScript

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'async'),
    'callbacks',
    'Using Callbacks',
    'pass a function to be run after something finishes',
    'a callback is a function handed over now to be called at some later point',
    'The oldest async pattern and still the one underneath the others. Timers make later visible before promises make it abstract.',
    'load-bearing',
    1
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'async'),
    'promise-states',
    'Promise States',
    'say what state a promise is in and what that means for your code',
    'a promise is pending until it settles, either fulfilled with a value or rejected with a reason',
    'A promise is an object with a lifecycle, not a value. Until that lands, awaiting it looks arbitrary.',
    'load-bearing',
    2
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'async'),
    'event-loop',
    'Ordering Work with the Event Loop',
    'order synchronous and asynchronous output correctly',
    'all synchronous code finishes first, then queued work runs',
    'The single mental model that makes every async surprise predictable rather than mysterious.',
    'load-bearing',
    3
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'async'),
    'async-await',
    'Writing `async`/`await` Code',
    'write asynchronous code that reads like ordinary code',
    'await pauses inside an async function until the promise settles',
    'The form almost all modern async code takes, and forgetting the await is a bug that returns a promise instead of a value.',
    'load-bearing',
    4
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'async'),
    'error-propagation',
    'Handling Async Errors',
    'catch a failure that happens inside asynchronous work',
    'a rejected promise travels until something catches it, and an uncaught one is lost',
    'try-catch around a non-awaited promise catches nothing, which is one of the most confusing silent failures in the language.',
    'load-bearing',
    5
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'async'),
    'promise-all',
    'Running Promises in Parallel',
    'run several asynchronous tasks at once instead of in sequence',
    'Promise.all waits for every promise, and rejects as soon as any one of them does',
    'The difference between awaiting in a loop and awaiting together is the difference between slow and fast code.',
    'core',
    6
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

-- `this` and Classes

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'this-and-classes'),
    'this-binding',
    'What `this` Refers To',
    'say what this refers to at a given call site',
    'this is decided by how a function is called, not where it was written',
    'The most notorious rule in the language, and the reason detached methods lose their object.',
    'load-bearing',
    1
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'this-and-classes'),
    'methods',
    'Writing Object Methods',
    'write a function that belongs to an object and uses its data',
    'a method is a function stored on an object, able to reach the rest of it through this',
    'The bridge from data-only objects to objects that do something, which is where classes start to make sense.',
    'core',
    2
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'this-and-classes'),
    'classes',
    'Defining Classes',
    'define a class and create instances from it',
    'a class describes how to build objects that share the same methods',
    'The standard way to express a type of thing in modern JavaScript, and a requirement for reading almost any real codebase.',
    'core',
    3
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'this-and-classes'),
    'prototypes',
    'Prototypes and Method Lookup',
    'explain where a method actually lives when you call it',
    'objects delegate to a prototype when they do not have a property themselves',
    'Classes are a surface over this. Knowing what is underneath explains shared methods and a whole class of surprising lookups.',
    'core',
    4
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'this-and-classes'),
    'inheritance',
    'Extending Classes with Inheritance',
    'extend a class and override part of it',
    'extends builds one class on another, and super reaches the version above',
    'Common in frameworks and libraries, and the place where prototype delegation becomes visible in ordinary code.',
    'core',
    5
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

-- Algorithms

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'algorithms'),
    'recursion',
    'Writing Recursive Functions',
    'write and follow a function that calls itself',
    'a recursive function solves a smaller version of the same problem until it cannot get smaller',
    'The natural shape for trees and nested data, and following the call stack is the clearest possible test of how functions really work.',
    'core',
    1
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'algorithms'),
    'base-cases',
    'Writing Recursive Base Cases',
    'write the condition that stops a recursion',
    'the base case is the input that returns an answer without recursing again',
    'A missing or wrong base case is the only way recursion fails, so it deserves to be practiced as its own skill.',
    'core',
    2
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'algorithms'),
    'search-strategies',
    'Choosing Search Strategies',
    'choose a search approach that suits the data you have',
    'a sorted list can be searched by halving it repeatedly instead of checking every item',
    'The first clear demonstration that the same result can cost wildly different amounts of work.',
    'core',
    3
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'algorithms'),
    'sorting-basics',
    'How Sorting Algorithms Work',
    'follow a simple sorting algorithm through its passes',
    'sorting repeatedly compares and moves items until nothing is out of order',
    'Makes the built-in sort stop being magic, and is the most traceable multi-pass algorithm there is.',
    'light',
    4
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

INSERT INTO concepts
    (topic_id, slug, name, objective, meaning, why, weight, display_order)
VALUES (
    (SELECT id FROM topics WHERE slug = 'algorithms'),
    'complexity',
    'Estimating Time Complexity',
    'say roughly how the work grows as the input grows',
    'complexity describes how the work scales with input size, not how long it takes',
    'The vocabulary for a judgement good engineers make constantly, and the reason nested loops matter beyond their output.',
    'core',
    5
)
ON CONFLICT (slug) DO UPDATE
    SET topic_id      = EXCLUDED.topic_id,
        name          = EXCLUDED.name,
        objective     = EXCLUDED.objective,
        meaning       = EXCLUDED.meaning,
        why           = EXCLUDED.why,
        weight        = EXCLUDED.weight,
        display_order = EXCLUDED.display_order,
        updated_at    = CURRENT_TIMESTAMP;

DELETE FROM concepts WHERE slug <> ALL (ARRAY['console-output', 'expressions-produce-values', 'primitive-types', 'booleans', 'typeof', 'null-vs-undefined', 'type-coercion', 'variables-name-values', 'declaration', 'initialization', 'assignment', 'reading-variables', 'reassignment', 'let-vs-const', 'variable-state', 'arithmetic-operators', 'assignment-operators', 'comparison-operators', 'equality', 'logical-operators', 'truthy-falsy', 'if-else', 'else-if-chains', 'compound-conditions', 'nested-conditions', 'ternary', 'guard-clauses', 'string-literals', 'string-concatenation', 'string-length', 'string-indexing', 'string-methods', 'template-literals', 'string-immutability', 'for-loop-anatomy', 'while-loops', 'loop-conditions', 'accumulators', 'break-continue', 'nested-loops', 'for-of-for-in', 'function-declaration', 'parameters-arguments', 'return-values', 'arrow-functions', 'functions-as-values', 'default-rest-params', 'block-vs-function-scope', 'hoisting-tdz', 'shadowing', 'closures', 'loop-variable-capture', 'array-indexing', 'array-length', 'array-mutation', 'array-copy-spread', 'nested-arrays', 'array-reference-identity', 'map', 'for-each', 'filter', 'find-some-every', 'reduce', 'sort', 'flat', 'method-chaining', 'object-access', 'object-mutation', 'nested-objects', 'optional-chaining', 'destructuring', 'object-references', 'json-shape', 'built-in-collections', 'error-types', 'throwing', 'try-catch', 'stack-traces', 'debugging-strategy', 'selecting-elements', 'element-properties', 'event-listeners', 'event-order', 'dom-as-tree', 'callbacks', 'promise-states', 'event-loop', 'async-await', 'error-propagation', 'promise-all', 'this-binding', 'methods', 'classes', 'prototypes', 'inheritance', 'recursion', 'base-cases', 'search-strategies', 'sorting-basics', 'complexity']);

-- ───────────────────────────────────────────────────── prerequisites ──

INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'expressions-produce-values'),
        (SELECT id FROM concepts WHERE slug = 'console-output'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'primitive-types'),
        (SELECT id FROM concepts WHERE slug = 'expressions-produce-values'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'booleans'),
        (SELECT id FROM concepts WHERE slug = 'primitive-types'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'typeof'),
        (SELECT id FROM concepts WHERE slug = 'primitive-types'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'null-vs-undefined'),
        (SELECT id FROM concepts WHERE slug = 'primitive-types'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'type-coercion'),
        (SELECT id FROM concepts WHERE slug = 'primitive-types'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'variables-name-values'),
        (SELECT id FROM concepts WHERE slug = 'primitive-types'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'declaration'),
        (SELECT id FROM concepts WHERE slug = 'variables-name-values'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'initialization'),
        (SELECT id FROM concepts WHERE slug = 'declaration'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'assignment'),
        (SELECT id FROM concepts WHERE slug = 'declaration'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'assignment'),
        (SELECT id FROM concepts WHERE slug = 'expressions-produce-values'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'reading-variables'),
        (SELECT id FROM concepts WHERE slug = 'initialization'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'reassignment'),
        (SELECT id FROM concepts WHERE slug = 'assignment'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'reassignment'),
        (SELECT id FROM concepts WHERE slug = 'reading-variables'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'let-vs-const'),
        (SELECT id FROM concepts WHERE slug = 'reassignment'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'variable-state'),
        (SELECT id FROM concepts WHERE slug = 'reassignment'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'arithmetic-operators'),
        (SELECT id FROM concepts WHERE slug = 'primitive-types'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'assignment-operators'),
        (SELECT id FROM concepts WHERE slug = 'reassignment'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'assignment-operators'),
        (SELECT id FROM concepts WHERE slug = 'arithmetic-operators'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'comparison-operators'),
        (SELECT id FROM concepts WHERE slug = 'primitive-types'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'comparison-operators'),
        (SELECT id FROM concepts WHERE slug = 'booleans'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'equality'),
        (SELECT id FROM concepts WHERE slug = 'comparison-operators'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'equality'),
        (SELECT id FROM concepts WHERE slug = 'type-coercion'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'logical-operators'),
        (SELECT id FROM concepts WHERE slug = 'comparison-operators'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'truthy-falsy'),
        (SELECT id FROM concepts WHERE slug = 'type-coercion'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'truthy-falsy'),
        (SELECT id FROM concepts WHERE slug = 'booleans'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'if-else'),
        (SELECT id FROM concepts WHERE slug = 'truthy-falsy'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'if-else'),
        (SELECT id FROM concepts WHERE slug = 'booleans'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'else-if-chains'),
        (SELECT id FROM concepts WHERE slug = 'if-else'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'compound-conditions'),
        (SELECT id FROM concepts WHERE slug = 'if-else'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'compound-conditions'),
        (SELECT id FROM concepts WHERE slug = 'logical-operators'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'nested-conditions'),
        (SELECT id FROM concepts WHERE slug = 'else-if-chains'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'ternary'),
        (SELECT id FROM concepts WHERE slug = 'if-else'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'guard-clauses'),
        (SELECT id FROM concepts WHERE slug = 'nested-conditions'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-literals'),
        (SELECT id FROM concepts WHERE slug = 'primitive-types'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-concatenation'),
        (SELECT id FROM concepts WHERE slug = 'string-literals'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-concatenation'),
        (SELECT id FROM concepts WHERE slug = 'expressions-produce-values'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-length'),
        (SELECT id FROM concepts WHERE slug = 'string-literals'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-indexing'),
        (SELECT id FROM concepts WHERE slug = 'string-length'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-methods'),
        (SELECT id FROM concepts WHERE slug = 'string-indexing'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'template-literals'),
        (SELECT id FROM concepts WHERE slug = 'string-concatenation'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-immutability'),
        (SELECT id FROM concepts WHERE slug = 'string-methods'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'for-loop-anatomy'),
        (SELECT id FROM concepts WHERE slug = 'variable-state'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'for-loop-anatomy'),
        (SELECT id FROM concepts WHERE slug = 'comparison-operators'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'while-loops'),
        (SELECT id FROM concepts WHERE slug = 'for-loop-anatomy'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'loop-conditions'),
        (SELECT id FROM concepts WHERE slug = 'for-loop-anatomy'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'accumulators'),
        (SELECT id FROM concepts WHERE slug = 'for-loop-anatomy'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'accumulators'),
        (SELECT id FROM concepts WHERE slug = 'variable-state'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'accumulators'),
        (SELECT id FROM concepts WHERE slug = 'assignment-operators'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'break-continue'),
        (SELECT id FROM concepts WHERE slug = 'for-loop-anatomy'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'nested-loops'),
        (SELECT id FROM concepts WHERE slug = 'for-loop-anatomy'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'for-of-for-in'),
        (SELECT id FROM concepts WHERE slug = 'for-loop-anatomy'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'function-declaration'),
        (SELECT id FROM concepts WHERE slug = 'variable-state'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'parameters-arguments'),
        (SELECT id FROM concepts WHERE slug = 'function-declaration'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'return-values'),
        (SELECT id FROM concepts WHERE slug = 'function-declaration'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'arrow-functions'),
        (SELECT id FROM concepts WHERE slug = 'return-values'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'functions-as-values'),
        (SELECT id FROM concepts WHERE slug = 'arrow-functions'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'default-rest-params'),
        (SELECT id FROM concepts WHERE slug = 'parameters-arguments'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'block-vs-function-scope'),
        (SELECT id FROM concepts WHERE slug = 'function-declaration'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'hoisting-tdz'),
        (SELECT id FROM concepts WHERE slug = 'block-vs-function-scope'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'shadowing'),
        (SELECT id FROM concepts WHERE slug = 'block-vs-function-scope'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'closures'),
        (SELECT id FROM concepts WHERE slug = 'block-vs-function-scope'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'closures'),
        (SELECT id FROM concepts WHERE slug = 'functions-as-values'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'loop-variable-capture'),
        (SELECT id FROM concepts WHERE slug = 'closures'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'loop-variable-capture'),
        (SELECT id FROM concepts WHERE slug = 'for-loop-anatomy'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'array-indexing'),
        (SELECT id FROM concepts WHERE slug = 'string-indexing'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'array-length'),
        (SELECT id FROM concepts WHERE slug = 'array-indexing'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'array-mutation'),
        (SELECT id FROM concepts WHERE slug = 'array-indexing'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'array-copy-spread'),
        (SELECT id FROM concepts WHERE slug = 'array-mutation'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'nested-arrays'),
        (SELECT id FROM concepts WHERE slug = 'array-indexing'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'array-reference-identity'),
        (SELECT id FROM concepts WHERE slug = 'array-copy-spread'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'map'),
        (SELECT id FROM concepts WHERE slug = 'arrow-functions'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'map'),
        (SELECT id FROM concepts WHERE slug = 'array-indexing'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'for-each'),
        (SELECT id FROM concepts WHERE slug = 'map'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'filter'),
        (SELECT id FROM concepts WHERE slug = 'map'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'filter'),
        (SELECT id FROM concepts WHERE slug = 'truthy-falsy'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'find-some-every'),
        (SELECT id FROM concepts WHERE slug = 'filter'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'reduce'),
        (SELECT id FROM concepts WHERE slug = 'accumulators'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'reduce'),
        (SELECT id FROM concepts WHERE slug = 'filter'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'sort'),
        (SELECT id FROM concepts WHERE slug = 'array-mutation'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'flat'),
        (SELECT id FROM concepts WHERE slug = 'nested-arrays'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'flat'),
        (SELECT id FROM concepts WHERE slug = 'map'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'method-chaining'),
        (SELECT id FROM concepts WHERE slug = 'map'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'method-chaining'),
        (SELECT id FROM concepts WHERE slug = 'filter'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'object-access'),
        (SELECT id FROM concepts WHERE slug = 'array-indexing'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'object-mutation'),
        (SELECT id FROM concepts WHERE slug = 'object-access'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'nested-objects'),
        (SELECT id FROM concepts WHERE slug = 'object-access'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'optional-chaining'),
        (SELECT id FROM concepts WHERE slug = 'nested-objects'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'optional-chaining'),
        (SELECT id FROM concepts WHERE slug = 'null-vs-undefined'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'destructuring'),
        (SELECT id FROM concepts WHERE slug = 'object-access'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'object-references'),
        (SELECT id FROM concepts WHERE slug = 'object-mutation'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'object-references'),
        (SELECT id FROM concepts WHERE slug = 'array-reference-identity'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'json-shape'),
        (SELECT id FROM concepts WHERE slug = 'nested-objects'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'built-in-collections'),
        (SELECT id FROM concepts WHERE slug = 'object-access'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'error-types'),
        (SELECT id FROM concepts WHERE slug = 'function-declaration'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'throwing'),
        (SELECT id FROM concepts WHERE slug = 'error-types'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'throwing'),
        (SELECT id FROM concepts WHERE slug = 'guard-clauses'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'try-catch'),
        (SELECT id FROM concepts WHERE slug = 'throwing'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'stack-traces'),
        (SELECT id FROM concepts WHERE slug = 'error-types'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'debugging-strategy'),
        (SELECT id FROM concepts WHERE slug = 'stack-traces'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'selecting-elements'),
        (SELECT id FROM concepts WHERE slug = 'object-access'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'element-properties'),
        (SELECT id FROM concepts WHERE slug = 'selecting-elements'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'event-listeners'),
        (SELECT id FROM concepts WHERE slug = 'functions-as-values'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'event-listeners'),
        (SELECT id FROM concepts WHERE slug = 'selecting-elements'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'event-order'),
        (SELECT id FROM concepts WHERE slug = 'event-listeners'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'dom-as-tree'),
        (SELECT id FROM concepts WHERE slug = 'selecting-elements'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'dom-as-tree'),
        (SELECT id FROM concepts WHERE slug = 'nested-objects'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'callbacks'),
        (SELECT id FROM concepts WHERE slug = 'functions-as-values'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'promise-states'),
        (SELECT id FROM concepts WHERE slug = 'callbacks'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'event-loop'),
        (SELECT id FROM concepts WHERE slug = 'promise-states'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'async-await'),
        (SELECT id FROM concepts WHERE slug = 'promise-states'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'error-propagation'),
        (SELECT id FROM concepts WHERE slug = 'async-await'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'error-propagation'),
        (SELECT id FROM concepts WHERE slug = 'try-catch'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'promise-all'),
        (SELECT id FROM concepts WHERE slug = 'async-await'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'this-binding'),
        (SELECT id FROM concepts WHERE slug = 'object-access'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'this-binding'),
        (SELECT id FROM concepts WHERE slug = 'functions-as-values'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'methods'),
        (SELECT id FROM concepts WHERE slug = 'this-binding'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'classes'),
        (SELECT id FROM concepts WHERE slug = 'methods'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'prototypes'),
        (SELECT id FROM concepts WHERE slug = 'classes'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'inheritance'),
        (SELECT id FROM concepts WHERE slug = 'prototypes'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'recursion'),
        (SELECT id FROM concepts WHERE slug = 'return-values'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'recursion'),
        (SELECT id FROM concepts WHERE slug = 'nested-arrays'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'base-cases'),
        (SELECT id FROM concepts WHERE slug = 'recursion'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'search-strategies'),
        (SELECT id FROM concepts WHERE slug = 'loop-conditions'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'search-strategies'),
        (SELECT id FROM concepts WHERE slug = 'array-indexing'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'sorting-basics'),
        (SELECT id FROM concepts WHERE slug = 'nested-loops'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'sorting-basics'),
        (SELECT id FROM concepts WHERE slug = 'sort'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'complexity'),
        (SELECT id FROM concepts WHERE slug = 'nested-loops'));
INSERT INTO prerequisites (concept_id, requires_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'complexity'),
        (SELECT id FROM concepts WHERE slug = 'search-strategies'));

-- ─────────────────────────────────────────────────── concept_demands ──
--
-- Converged rather than rebuilt: challenges holds a composite foreign key
-- to (concept_id, demand_id) ON DELETE RESTRICT, so clearing this table
-- would be refused whenever a challenge exists -- even with no curriculum
-- change. Unchanged pairs are therefore left untouched.

INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'console-output'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'console-output'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'expressions-produce-values'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'expressions-produce-values'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'expressions-produce-values'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'primitive-types'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'primitive-types'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'booleans'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'booleans'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'typeof'),
        (SELECT id FROM demands WHERE slug = 'recall'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'typeof'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'null-vs-undefined'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'null-vs-undefined'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'null-vs-undefined'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'type-coercion'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'type-coercion'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'type-coercion'),
        (SELECT id FROM demands WHERE slug = 'repair'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'type-coercion'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'variables-name-values'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'variables-name-values'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'declaration'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'declaration'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'declaration'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'initialization'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'initialization'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'initialization'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'assignment'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'assignment'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'assignment'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'reading-variables'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'reading-variables'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'reassignment'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'reassignment'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'let-vs-const'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'let-vs-const'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'let-vs-const'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'variable-state'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'variable-state'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'arithmetic-operators'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'arithmetic-operators'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'assignment-operators'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'assignment-operators'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'comparison-operators'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'comparison-operators'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'equality'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'equality'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'equality'),
        (SELECT id FROM demands WHERE slug = 'repair'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'equality'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'logical-operators'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'logical-operators'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'truthy-falsy'),
        (SELECT id FROM demands WHERE slug = 'recall'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'truthy-falsy'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'truthy-falsy'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'if-else'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'if-else'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'else-if-chains'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'else-if-chains'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'compound-conditions'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'compound-conditions'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'compound-conditions'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'nested-conditions'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'nested-conditions'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'nested-conditions'),
        (SELECT id FROM demands WHERE slug = 'repair'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'ternary'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'ternary'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'ternary'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'guard-clauses'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'guard-clauses'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'guard-clauses'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-literals'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-literals'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-concatenation'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-concatenation'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-concatenation'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-length'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-length'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-indexing'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-indexing'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-methods'),
        (SELECT id FROM demands WHERE slug = 'recall'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-methods'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-methods'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'template-literals'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'template-literals'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'template-literals'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-immutability'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-immutability'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'string-immutability'),
        (SELECT id FROM demands WHERE slug = 'repair'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'for-loop-anatomy'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'for-loop-anatomy'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'while-loops'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'while-loops'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'while-loops'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'loop-conditions'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'loop-conditions'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'loop-conditions'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'loop-conditions'),
        (SELECT id FROM demands WHERE slug = 'repair'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'accumulators'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'accumulators'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'break-continue'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'break-continue'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'nested-loops'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'nested-loops'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'for-of-for-in'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'for-of-for-in'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'for-of-for-in'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'function-declaration'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'function-declaration'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'function-declaration'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'parameters-arguments'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'parameters-arguments'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'parameters-arguments'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'return-values'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'return-values'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'return-values'),
        (SELECT id FROM demands WHERE slug = 'repair'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'return-values'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'arrow-functions'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'arrow-functions'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'arrow-functions'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'functions-as-values'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'functions-as-values'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'functions-as-values'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'default-rest-params'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'default-rest-params'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'block-vs-function-scope'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'block-vs-function-scope'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'block-vs-function-scope'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'hoisting-tdz'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'hoisting-tdz'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'hoisting-tdz'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'shadowing'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'shadowing'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'closures'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'closures'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'closures'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'closures'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'loop-variable-capture'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'loop-variable-capture'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'loop-variable-capture'),
        (SELECT id FROM demands WHERE slug = 'repair'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'loop-variable-capture'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'array-indexing'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'array-indexing'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'array-length'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'array-length'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'array-mutation'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'array-mutation'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'array-mutation'),
        (SELECT id FROM demands WHERE slug = 'repair'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'array-mutation'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'array-copy-spread'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'array-copy-spread'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'array-copy-spread'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'nested-arrays'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'nested-arrays'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'array-reference-identity'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'array-reference-identity'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'map'),
        (SELECT id FROM demands WHERE slug = 'recall'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'map'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'map'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'map'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'map'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'map'),
        (SELECT id FROM demands WHERE slug = 'repair'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'for-each'),
        (SELECT id FROM demands WHERE slug = 'recall'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'for-each'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'for-each'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'for-each'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'filter'),
        (SELECT id FROM demands WHERE slug = 'recall'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'filter'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'filter'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'filter'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'find-some-every'),
        (SELECT id FROM demands WHERE slug = 'recall'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'find-some-every'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'find-some-every'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'reduce'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'reduce'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'reduce'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'reduce'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'sort'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'sort'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'sort'),
        (SELECT id FROM demands WHERE slug = 'repair'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'sort'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'flat'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'flat'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'method-chaining'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'method-chaining'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'object-access'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'object-access'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'object-mutation'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'object-mutation'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'nested-objects'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'nested-objects'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'optional-chaining'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'optional-chaining'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'optional-chaining'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'destructuring'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'destructuring'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'destructuring'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'object-references'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'object-references'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'object-references'),
        (SELECT id FROM demands WHERE slug = 'repair'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'object-references'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'json-shape'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'json-shape'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'json-shape'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'built-in-collections'),
        (SELECT id FROM demands WHERE slug = 'recall'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'built-in-collections'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'built-in-collections'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'error-types'),
        (SELECT id FROM demands WHERE slug = 'recall'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'error-types'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'throwing'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'throwing'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'try-catch'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'try-catch'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'stack-traces'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'stack-traces'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'stack-traces'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'debugging-strategy'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'debugging-strategy'),
        (SELECT id FROM demands WHERE slug = 'repair'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'debugging-strategy'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'selecting-elements'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'selecting-elements'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'element-properties'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'element-properties'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'event-listeners'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'event-listeners'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'event-listeners'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'event-order'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'event-order'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'dom-as-tree'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'dom-as-tree'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'callbacks'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'callbacks'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'callbacks'),
        (SELECT id FROM demands WHERE slug = 'repair'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'promise-states'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'promise-states'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'promise-states'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'event-loop'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'event-loop'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'event-loop'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'async-await'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'async-await'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'async-await'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'async-await'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'async-await'),
        (SELECT id FROM demands WHERE slug = 'repair'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'async-await'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'error-propagation'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'error-propagation'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'error-propagation'),
        (SELECT id FROM demands WHERE slug = 'repair'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'error-propagation'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'promise-all'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'promise-all'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'promise-all'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'this-binding'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'this-binding'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'this-binding'),
        (SELECT id FROM demands WHERE slug = 'repair'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'this-binding'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'methods'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'methods'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'classes'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'classes'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'classes'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'prototypes'),
        (SELECT id FROM demands WHERE slug = 'recognise'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'prototypes'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'inheritance'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'inheritance'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'recursion'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'recursion'),
        (SELECT id FROM demands WHERE slug = 'produce'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'recursion'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'base-cases'),
        (SELECT id FROM demands WHERE slug = 'diagnose'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'base-cases'),
        (SELECT id FROM demands WHERE slug = 'repair'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'base-cases'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'search-strategies'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'search-strategies'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'sorting-basics'),
        (SELECT id FROM demands WHERE slug = 'predict'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'sorting-basics'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'complexity'),
        (SELECT id FROM demands WHERE slug = 'recall'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;
INSERT INTO concept_demands (concept_id, demand_id)
VALUES ((SELECT id FROM concepts WHERE slug = 'complexity'),
        (SELECT id FROM demands WHERE slug = 'explain'))
ON CONFLICT (concept_id, demand_id) DO NOTHING;

-- Only pairs the curriculum no longer declares. A pair still referenced by
-- a challenge is refused here by challenges_concept_demand_fk, which is
-- the intended failure rather than a bug.
DELETE FROM concept_demands cd
USING concepts c, demands d
WHERE cd.concept_id = c.id
  AND cd.demand_id = d.id
  AND (c.slug, d.slug) NOT IN (
      ('console-output', 'recognise'),
      ('console-output', 'predict'),
      ('expressions-produce-values', 'recognise'),
      ('expressions-produce-values', 'predict'),
      ('expressions-produce-values', 'explain'),
      ('primitive-types', 'recognise'),
      ('primitive-types', 'predict'),
      ('booleans', 'recognise'),
      ('booleans', 'predict'),
      ('typeof', 'recall'),
      ('typeof', 'predict'),
      ('null-vs-undefined', 'recognise'),
      ('null-vs-undefined', 'predict'),
      ('null-vs-undefined', 'explain'),
      ('type-coercion', 'predict'),
      ('type-coercion', 'diagnose'),
      ('type-coercion', 'repair'),
      ('type-coercion', 'explain'),
      ('variables-name-values', 'recognise'),
      ('variables-name-values', 'predict'),
      ('declaration', 'recognise'),
      ('declaration', 'predict'),
      ('declaration', 'produce'),
      ('initialization', 'recognise'),
      ('initialization', 'predict'),
      ('initialization', 'produce'),
      ('assignment', 'predict'),
      ('assignment', 'produce'),
      ('assignment', 'diagnose'),
      ('reading-variables', 'recognise'),
      ('reading-variables', 'predict'),
      ('reassignment', 'predict'),
      ('reassignment', 'diagnose'),
      ('let-vs-const', 'recognise'),
      ('let-vs-const', 'predict'),
      ('let-vs-const', 'explain'),
      ('variable-state', 'predict'),
      ('variable-state', 'produce'),
      ('arithmetic-operators', 'predict'),
      ('arithmetic-operators', 'explain'),
      ('assignment-operators', 'predict'),
      ('assignment-operators', 'produce'),
      ('comparison-operators', 'recognise'),
      ('comparison-operators', 'predict'),
      ('equality', 'predict'),
      ('equality', 'diagnose'),
      ('equality', 'repair'),
      ('equality', 'explain'),
      ('logical-operators', 'predict'),
      ('logical-operators', 'explain'),
      ('truthy-falsy', 'recall'),
      ('truthy-falsy', 'predict'),
      ('truthy-falsy', 'explain'),
      ('if-else', 'recognise'),
      ('if-else', 'predict'),
      ('else-if-chains', 'predict'),
      ('else-if-chains', 'diagnose'),
      ('compound-conditions', 'predict'),
      ('compound-conditions', 'produce'),
      ('compound-conditions', 'diagnose'),
      ('nested-conditions', 'predict'),
      ('nested-conditions', 'diagnose'),
      ('nested-conditions', 'repair'),
      ('ternary', 'recognise'),
      ('ternary', 'predict'),
      ('ternary', 'produce'),
      ('guard-clauses', 'predict'),
      ('guard-clauses', 'produce'),
      ('guard-clauses', 'explain'),
      ('string-literals', 'recognise'),
      ('string-literals', 'predict'),
      ('string-concatenation', 'predict'),
      ('string-concatenation', 'produce'),
      ('string-concatenation', 'diagnose'),
      ('string-length', 'predict'),
      ('string-length', 'diagnose'),
      ('string-indexing', 'recognise'),
      ('string-indexing', 'predict'),
      ('string-methods', 'recall'),
      ('string-methods', 'predict'),
      ('string-methods', 'produce'),
      ('template-literals', 'recognise'),
      ('template-literals', 'predict'),
      ('template-literals', 'produce'),
      ('string-immutability', 'predict'),
      ('string-immutability', 'diagnose'),
      ('string-immutability', 'repair'),
      ('for-loop-anatomy', 'recognise'),
      ('for-loop-anatomy', 'predict'),
      ('while-loops', 'recognise'),
      ('while-loops', 'predict'),
      ('while-loops', 'explain'),
      ('loop-conditions', 'predict'),
      ('loop-conditions', 'produce'),
      ('loop-conditions', 'diagnose'),
      ('loop-conditions', 'repair'),
      ('accumulators', 'predict'),
      ('accumulators', 'produce'),
      ('break-continue', 'predict'),
      ('break-continue', 'explain'),
      ('nested-loops', 'predict'),
      ('nested-loops', 'produce'),
      ('for-of-for-in', 'recognise'),
      ('for-of-for-in', 'predict'),
      ('for-of-for-in', 'diagnose'),
      ('function-declaration', 'recognise'),
      ('function-declaration', 'predict'),
      ('function-declaration', 'produce'),
      ('parameters-arguments', 'recognise'),
      ('parameters-arguments', 'predict'),
      ('parameters-arguments', 'diagnose'),
      ('return-values', 'predict'),
      ('return-values', 'diagnose'),
      ('return-values', 'repair'),
      ('return-values', 'explain'),
      ('arrow-functions', 'recognise'),
      ('arrow-functions', 'predict'),
      ('arrow-functions', 'produce'),
      ('functions-as-values', 'predict'),
      ('functions-as-values', 'diagnose'),
      ('functions-as-values', 'explain'),
      ('default-rest-params', 'predict'),
      ('default-rest-params', 'produce'),
      ('block-vs-function-scope', 'recognise'),
      ('block-vs-function-scope', 'predict'),
      ('block-vs-function-scope', 'explain'),
      ('hoisting-tdz', 'predict'),
      ('hoisting-tdz', 'diagnose'),
      ('hoisting-tdz', 'explain'),
      ('shadowing', 'predict'),
      ('shadowing', 'diagnose'),
      ('closures', 'predict'),
      ('closures', 'produce'),
      ('closures', 'diagnose'),
      ('closures', 'explain'),
      ('loop-variable-capture', 'predict'),
      ('loop-variable-capture', 'diagnose'),
      ('loop-variable-capture', 'repair'),
      ('loop-variable-capture', 'explain'),
      ('array-indexing', 'recognise'),
      ('array-indexing', 'predict'),
      ('array-length', 'predict'),
      ('array-length', 'diagnose'),
      ('array-mutation', 'predict'),
      ('array-mutation', 'diagnose'),
      ('array-mutation', 'repair'),
      ('array-mutation', 'explain'),
      ('array-copy-spread', 'predict'),
      ('array-copy-spread', 'produce'),
      ('array-copy-spread', 'explain'),
      ('nested-arrays', 'recognise'),
      ('nested-arrays', 'predict'),
      ('array-reference-identity', 'predict'),
      ('array-reference-identity', 'explain'),
      ('map', 'recall'),
      ('map', 'recognise'),
      ('map', 'predict'),
      ('map', 'produce'),
      ('map', 'diagnose'),
      ('map', 'repair'),
      ('for-each', 'recall'),
      ('for-each', 'recognise'),
      ('for-each', 'predict'),
      ('for-each', 'explain'),
      ('filter', 'recall'),
      ('filter', 'predict'),
      ('filter', 'produce'),
      ('filter', 'diagnose'),
      ('find-some-every', 'recall'),
      ('find-some-every', 'predict'),
      ('find-some-every', 'explain'),
      ('reduce', 'predict'),
      ('reduce', 'produce'),
      ('reduce', 'diagnose'),
      ('reduce', 'explain'),
      ('sort', 'predict'),
      ('sort', 'diagnose'),
      ('sort', 'repair'),
      ('sort', 'explain'),
      ('flat', 'predict'),
      ('flat', 'explain'),
      ('method-chaining', 'predict'),
      ('method-chaining', 'produce'),
      ('object-access', 'recognise'),
      ('object-access', 'predict'),
      ('object-mutation', 'predict'),
      ('object-mutation', 'diagnose'),
      ('nested-objects', 'recognise'),
      ('nested-objects', 'predict'),
      ('optional-chaining', 'recognise'),
      ('optional-chaining', 'predict'),
      ('optional-chaining', 'explain'),
      ('destructuring', 'recognise'),
      ('destructuring', 'predict'),
      ('destructuring', 'produce'),
      ('object-references', 'predict'),
      ('object-references', 'diagnose'),
      ('object-references', 'repair'),
      ('object-references', 'explain'),
      ('json-shape', 'recognise'),
      ('json-shape', 'predict'),
      ('json-shape', 'produce'),
      ('built-in-collections', 'recall'),
      ('built-in-collections', 'recognise'),
      ('built-in-collections', 'predict'),
      ('error-types', 'recall'),
      ('error-types', 'recognise'),
      ('throwing', 'recognise'),
      ('throwing', 'predict'),
      ('try-catch', 'predict'),
      ('try-catch', 'explain'),
      ('stack-traces', 'recognise'),
      ('stack-traces', 'diagnose'),
      ('stack-traces', 'explain'),
      ('debugging-strategy', 'diagnose'),
      ('debugging-strategy', 'repair'),
      ('debugging-strategy', 'explain'),
      ('selecting-elements', 'recognise'),
      ('selecting-elements', 'predict'),
      ('element-properties', 'predict'),
      ('element-properties', 'explain'),
      ('event-listeners', 'recognise'),
      ('event-listeners', 'predict'),
      ('event-listeners', 'diagnose'),
      ('event-order', 'predict'),
      ('event-order', 'explain'),
      ('dom-as-tree', 'recognise'),
      ('dom-as-tree', 'explain'),
      ('callbacks', 'predict'),
      ('callbacks', 'diagnose'),
      ('callbacks', 'repair'),
      ('promise-states', 'recognise'),
      ('promise-states', 'predict'),
      ('promise-states', 'explain'),
      ('event-loop', 'predict'),
      ('event-loop', 'produce'),
      ('event-loop', 'explain'),
      ('async-await', 'recognise'),
      ('async-await', 'predict'),
      ('async-await', 'produce'),
      ('async-await', 'diagnose'),
      ('async-await', 'repair'),
      ('async-await', 'explain'),
      ('error-propagation', 'predict'),
      ('error-propagation', 'diagnose'),
      ('error-propagation', 'repair'),
      ('error-propagation', 'explain'),
      ('promise-all', 'predict'),
      ('promise-all', 'produce'),
      ('promise-all', 'explain'),
      ('this-binding', 'predict'),
      ('this-binding', 'diagnose'),
      ('this-binding', 'repair'),
      ('this-binding', 'explain'),
      ('methods', 'recognise'),
      ('methods', 'predict'),
      ('classes', 'recognise'),
      ('classes', 'predict'),
      ('classes', 'produce'),
      ('prototypes', 'recognise'),
      ('prototypes', 'explain'),
      ('inheritance', 'predict'),
      ('inheritance', 'explain'),
      ('recursion', 'predict'),
      ('recursion', 'produce'),
      ('recursion', 'diagnose'),
      ('base-cases', 'diagnose'),
      ('base-cases', 'repair'),
      ('base-cases', 'explain'),
      ('search-strategies', 'predict'),
      ('search-strategies', 'explain'),
      ('sorting-basics', 'predict'),
      ('sorting-basics', 'explain'),
      ('complexity', 'recall'),
      ('complexity', 'explain')
  );

COMMIT;
