-- Bug Hunt: a real tier one, and a bank big enough for a ten-hunt run.
--
-- Two problems this fixes.
--
-- First, tier one was not easy. The easiest incident in the original bank was
-- `users.find(...)` followed by `user.name` -- which requires knowing that find()
-- returns undefined on a miss. That is a fine second-tier bug and a poor first
-- one: the opening hunt has to be something a player recognises before they have
-- worked out what the game wants from them. Those four incidents move to tier
-- two, and tier one is rebuilt out of typos and wrong operators.
--
-- Second, a run is now ten hunts drawn from a bank of twenty, which is one whole
-- run away from repeating itself. Twelve more incidents take it to thirty-two.
--
-- Every runtime claim was executed in Node before it was written down.
--
-- Safe to re-run: the insert helper skips existing slugs, and the re-tier is
-- idempotent.

BEGIN;

-- ---------------------------------------------------------------- re-tier
-- Moderate bugs that were sitting in tier one and setting the wrong expectation
-- for the first thirty seconds of a run.
UPDATE bug_hunt_incidents
SET difficulty = 2
WHERE slug IN (
    'profile-undefined-name',
    'cart-quantity-string',
    'inventory-count-overflow',
    'login-validator-no-return'
) AND difficulty = 1;

CREATE OR REPLACE FUNCTION seed_bug_hunt_incident(
    p_slug TEXT, p_title TEXT, p_bug_report TEXT, p_error_log TEXT,
    p_theme TEXT, p_bug_category TEXT, p_challenge_type TEXT,
    p_code TEXT, p_hints TEXT[], p_difficulty INTEGER, p_options JSONB
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_id BIGINT;
    v_opt JSONB;
BEGIN
    IF EXISTS (SELECT 1 FROM bug_hunt_incidents WHERE slug = p_slug) THEN
        RETURN;
    END IF;

    INSERT INTO bug_hunt_incidents
        (slug, title, bug_report, error_log, theme, bug_category,
         challenge_type, code, hints, difficulty)
    VALUES
        (p_slug, p_title, p_bug_report, p_error_log, p_theme, p_bug_category,
         p_challenge_type, p_code, p_hints, p_difficulty)
    RETURNING id INTO v_id;

    FOR v_opt IN SELECT * FROM jsonb_array_elements(p_options) LOOP
        INSERT INTO bug_hunt_options
            (incident_id, option_text, line_number, is_correct, explanation)
        VALUES (
            v_id, v_opt->>'text',
            CASE WHEN v_opt->>'line' IS NULL THEN NULL ELSE (v_opt->>'line')::INTEGER END,
            COALESCE((v_opt->>'correct')::BOOLEAN, FALSE),
            v_opt->>'explanation'
        );
    END LOOP;
END;
$$;

-- ======================================================= TIER 1 -- the on-ramp
-- Recognisable at a glance. The point of these is the first "oh, I see it",
-- which is what buys the game permission to get hard later.

SELECT seed_bug_hunt_incident(
    'greet-name-typo', 'Greeting service returning an error',
    'Every welcome email says "Hello undefined" — or fails outright.',
    'ReferenceError: nmae is not defined',
    'messaging', 'return-value', 'find_line',
$code$function greet(name) {
  return "Hello " + nmae;
}$code$,
    ARRAY[
        'Read the two names in this function and compare them.',
        'The parameter is spelled one way. The line below spells it another.',
        'Nothing called nmae was ever declared.'
    ], 1,
$opts$[
  {"text": "return \"Hello \" + nmae;", "line": 2, "correct": true,
   "explanation": "nmae is a typo for name. Nothing by that name exists, so the reference throws. Fixing the spelling fixes the function."},
  {"text": "function greet(name) {", "line": 1, "correct": false,
   "explanation": "The signature is fine — it takes exactly the parameter the function needs. The typo is in the line that uses it."},
  {"text": "}", "line": 3, "correct": false,
   "explanation": "A closing brace cannot cause a ReferenceError. The trace names an identifier, which points at a line that uses one."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'multiply-wrong-operator', 'Order totals far too low',
    'A basket of 3 items at 4 each is charging 7.',
    NULL, 'payments', 'comparison', 'find_line',
$code$function multiply(a, b) {
  return a + b;
}$code$,
    ARRAY[
        'The function name says what it is supposed to do.',
        '3 and 4 came out as 7. What operation gives 7?',
        'It is adding where it should be multiplying.'
    ], 1,
$opts$[
  {"text": "return a + b;", "line": 2, "correct": true,
   "explanation": "The function is called multiply but it adds: 3 + 4 is 7 where 3 * 4 is 12. The operator is the whole bug."},
  {"text": "function multiply(a, b) {", "line": 1, "correct": false,
   "explanation": "Two numbers in is exactly right for a multiply. The name is a correct description of the intent; the body is what fails to match it."},
  {"text": "}", "line": 3, "correct": false,
   "explanation": "Nothing here. The wrong result comes from the arithmetic on the line above."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'can-vote-boundary', 'Eighteen-year-olds refused at signup',
    'Users aged exactly 18 are being told they are too young.',
    NULL, 'auth', 'off-by-one', 'choose_patch',
$code$function canVote(age) {
  return age > 18;
}$code$,
    ARRAY[
        'It works for 19 and it works for 17. One number misbehaves.',
        'Is 18 greater than 18?',
        'The boundary itself needs to be included.'
    ], 1,
$opts$[
  {"text": "return age >= 18;", "correct": true,
   "explanation": "18 > 18 is false, so the boundary case is excluded. >= includes it, which is what \"eighteen or over\" means."},
  {"text": "return age > 17;", "correct": false,
   "explanation": "This happens to accept 18, but it says the rule is \"over 17\" — so it also silently encodes a different rule than the one the product has. Correct output, wrong meaning."},
  {"text": "return age > 18 || age === 18;", "correct": false,
   "explanation": "Behaviourally identical to >= but says it in twice the words. If a reviewer has to check that two conditions cover a boundary, the boundary is not obvious enough."},
  {"text": "return Number(age) > 18;", "correct": false,
   "explanation": "Coercing does not change the comparison — 18 is still not greater than 18. It fixes a type problem this code does not have."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'user-log-typo', 'Admin console shows a blank user',
    'The console logs nothing where the username should be, then errors.',
    'ReferenceError: usre is not defined',
    'profiles', 'return-value', 'find_line',
$code$const user = "Tati";
const label = "Signed in as";
console.log(label, usre);$code$,
    ARRAY[
        'Two lines, two spellings of the same idea.',
        'The trace names something that was never declared.',
        'Compare the name on line 1 with the name on line 2.'
    ], 1,
$opts$[
  {"text": "console.log(label, usre);", "line": 3, "correct": true,
   "explanation": "usre is a transposition of user. The variable declared on line 1 is never actually read, and the misspelling throws."},
  {"text": "const user = \"Tati\";", "line": 1, "correct": false,
   "explanation": "This line is correct — it declares and assigns exactly what the last line is trying to print."},
  {"text": "const label = \"Signed in as\";", "line": 2, "correct": false,
   "explanation": "A plain string assignment, and it is used correctly on the line below. Nothing about it throws."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'array-size-property', 'Cart count always blank',
    'The basket icon shows nothing instead of the number of items.',
    NULL, 'inventory', 'array-access', 'choose_patch',
$code$function itemCount(items) {
  return items.size;
}$code$,
    ARRAY[
        'It returns undefined rather than throwing.',
        'Arrays and Sets do not agree on what this property is called.',
        'Arrays use a different word for how many things they hold.'
    ], 1,
$opts$[
  {"text": "return items.length;", "correct": true,
   "explanation": "Arrays have length, not size. items.size is undefined on an array — which is why the badge renders blank instead of erroring."},
  {"text": "return items.count;", "correct": false,
   "explanation": "Also undefined. count is not a property of arrays either; this swaps one wrong name for another."},
  {"text": "return items.size();", "correct": false,
   "explanation": "Worse: items.size is undefined, so calling it throws \"is not a function\" instead of quietly returning nothing."},
  {"text": "return Object.keys(items).size;", "correct": false,
   "explanation": "Object.keys returns an array, which also has no size — so this is the original bug with two extra steps."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'uppercase-not-called', 'Product codes render as source text',
    'Product codes display as "function toUpperCase() { [native code] }".',
    NULL, 'api', 'return-value', 'find_line',
$code$function normalise(code) {
  return code.toUpperCase;
}$code$,
    ARRAY[
        'The output is the function itself, not its result.',
        'Referencing a method and calling it are different things.',
        'The parentheses are missing.'
    ], 1,
$opts$[
  {"text": "return code.toUpperCase;", "line": 2, "correct": true,
   "explanation": "Without (), this returns the method itself rather than calling it. Rendering a function is what produces the [native code] text."},
  {"text": "function normalise(code) {", "line": 1, "correct": false,
   "explanation": "The signature is fine. The problem is entirely in how the method on the next line is referenced."},
  {"text": "}", "line": 3, "correct": false,
   "explanation": "Nothing here. The wrong value has already been returned by the line above."}
]$opts$
);

-- ============================================== TIER 3-5 -- widening the bank

SELECT seed_bug_hunt_incident(
    'nested-spread-shared', 'Editing a draft changes the published post',
    'Opening a draft and changing its title also rewrites the live version.',
    NULL, 'api', 'mutation', 'choose_patch',
$code$function draftOf(post) {
  const draft = { ...post };
  draft.meta.status = "draft";
  return draft;
}$code$,
    ARRAY[
        'The copy works for the top-level fields and not for the nested one.',
        'How deep does the spread operator actually copy?',
        'draft.meta and post.meta are the same object.'
    ], 3,
$opts$[
  {"text": "const draft = { ...post, meta: { ...post.meta } };", "correct": true,
   "explanation": "Spread is a shallow copy: draft.meta is the same object as post.meta, so writing to it writes through to the original. Copying the nested object too breaks the shared reference."},
  {"text": "const draft = Object.assign({}, post);", "correct": false,
   "explanation": "Object.assign is also shallow — identical behaviour to the spread it replaces. The nested object is still shared."},
  {"text": "const draft = { ...post }; draft.meta.status = \"draft\"; return { ...draft };", "correct": false,
   "explanation": "The damage is already done by the time the second spread runs — post.meta was mutated on the line before. Copying afterwards copies the corruption."},
  {"text": "const draft = post;", "correct": false,
   "explanation": "This removes the copy entirely, so the draft IS the post. Strictly worse than the bug being fixed."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'filter-empty-truthy', 'Out-of-stock warning never appears',
    'The low-stock banner shows for every product, including well-stocked ones.',
    NULL, 'inventory', 'type-coercion', 'find_line',
$code$function hasLowStock(items) {
  const low = items.filter(i => i.qty < 5);
  if (low) {
    return true;
  }
  return false;
}$code$,
    ARRAY[
        'It is not the filter that is wrong — it is what happens to the result.',
        'What does filter return when nothing matches?',
        'An empty array is still an object, and every object is truthy.'
    ], 3,
$opts$[
  {"text": "if (low) {", "line": 3, "correct": true,
   "explanation": "filter always returns an array, and even an empty array is truthy — so this branch is taken every time. It needs to test low.length > 0."},
  {"text": "const low = items.filter(i => i.qty < 5);", "line": 2, "correct": false,
   "explanation": "The filter itself is correct: it collects exactly the items below the threshold. The mistake is treating its result as a boolean."},
  {"text": "return true;", "line": 4, "correct": false,
   "explanation": "Right for the branch it is in. The problem is that the branch is always entered."},
  {"text": "return false;", "line": 6, "correct": false,
   "explanation": "The correct fallback — it is simply unreachable, because the condition above never fails."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'settimeout-returns-id', 'Scheduled digest never sends',
    'The digest job reports a handle instead of the message it was meant to build.',
    NULL, 'messaging', 'async', 'choose_patch',
$code$function scheduleDigest(user) {
  return setTimeout(() => buildDigest(user), 1000);
}$code$,
    ARRAY[
        'Something is returned, but it is not what the caller wants.',
        'What does setTimeout hand back?',
        'The callback runs later — the return value is not its result.'
    ], 4,
$opts$[
  {"text": "return new Promise(resolve => setTimeout(() => resolve(buildDigest(user)), 1000));", "correct": true,
   "explanation": "setTimeout returns a timer handle, not the callback's result — the digest is built a second later and thrown away. Wrapping it in a Promise gives the caller something that resolves to the digest."},
  {"text": "return await setTimeout(() => buildDigest(user), 1000);", "correct": false,
   "explanation": "Awaiting a timer handle resolves immediately to the handle itself. It looks like it waits and does not."},
  {"text": "setTimeout(() => { return buildDigest(user); }, 1000);", "correct": false,
   "explanation": "The inner return hands a value back to the timer, which discards it, and the outer function now returns undefined. Strictly worse."},
  {"text": "return buildDigest(user);", "correct": false,
   "explanation": "This returns the digest but removes the delay entirely, which is the behaviour the function exists to provide."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'object-identity-compare', 'Duplicate addresses accepted at checkout',
    'The same address can be added twice — the duplicate check never matches.',
    NULL, 'payments', 'comparison', 'find_line',
$code$function isDuplicate(saved, incoming) {
  for (const address of saved) {
    if (address === incoming) {
      return true;
    }
  }
  return false;
}$code$,
    ARRAY[
        'The loop is correct. The comparison inside it is not.',
        'These are objects, not strings.',
        'Two objects with identical contents are not === each other.'
    ], 4,
$opts$[
  {"text": "if (address === incoming) {", "line": 3, "correct": true,
   "explanation": "=== on objects compares identity, not contents — two addresses with the same fields are different objects, so this never matches. It has to compare the fields that define a duplicate."},
  {"text": "for (const address of saved) {", "line": 2, "correct": false,
   "explanation": "A straightforward walk over the saved addresses. Nothing about the iteration causes the miss."},
  {"text": "return true;", "line": 4, "correct": false,
   "explanation": "Correct for its branch — it is simply never reached, because the comparison above never succeeds."},
  {"text": "return false;", "line": 7, "correct": false,
   "explanation": "The right fallback for \"no match found\". It is returning the truth about a comparison that was asked wrongly."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'await-inside-map-callback', 'Analytics rollup writes partial totals',
    'The nightly rollup finishes instantly and writes totals that are missing most events.',
    NULL, 'analytics', 'async', 'find_line',
$code$async function rollUp(days) {
  const totals = [];
  days.map(async (day) => {
    totals.push(await totalFor(day));
  });
  return totals;
}$code$,
    ARRAY[
        'It finishes far too quickly for the work it claims to do.',
        'map collects the callbacks'' return values. What does an async callback return?',
        'Nothing here waits for those promises before the array is returned.'
    ], 5,
$opts$[
  {"text": "days.map(async (day) => {", "line": 3, "correct": true,
   "explanation": "map collects the promises each async callback returns and nothing awaits them, so rollUp returns an empty array while every totalFor is still running. It needs await Promise.all(days.map(...)) — or a for...of loop."},
  {"text": "totals.push(await totalFor(day));", "line": 4, "correct": false,
   "explanation": "This line is correct in isolation — it awaits properly and pushes a real number. It just runs after the array has already been returned."},
  {"text": "const totals = [];", "line": 2, "correct": false,
   "explanation": "An accumulator array is a normal way to build this up. It is empty at return time because of when the pushes happen, not because of how it was declared."},
  {"text": "return totals;", "line": 6, "correct": false,
   "explanation": "Returning the accumulator is right. It is returning it too early that is wrong, and that is decided on line 3."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'json-double-parse', 'Webhook handler rejects valid payloads',
    'Every incoming webhook fails to parse, even ones that are valid JSON.',
    'SyntaxError: Unexpected token o in JSON at position 1',
    'api', 'type-coercion', 'find_line',
$code$app.post("/hooks", express.json(), (req, res) => {
  const payload = JSON.parse(req.body);
  res.json({ received: payload.id });
});$code$,
    ARRAY[
        'The trace says it found an object where it expected JSON text.',
        'What has express.json() already done by the time the handler runs?',
        'req.body is parsed before this line ever sees it.'
    ], 5,
$opts$[
  {"text": "const payload = JSON.parse(req.body);", "line": 2, "correct": true,
   "explanation": "express.json() has already parsed the body, so req.body is an object. JSON.parse stringifies it to \"[object Object]\" and chokes on the second character — which is exactly what the trace says. The parse should be removed."},
  {"text": "app.post(\"/hooks\", express.json(), (req, res) => {", "line": 1, "correct": false,
   "explanation": "Mounting the body parser on the route is correct and is what makes req.body usable. The mistake is parsing a second time afterwards."},
  {"text": "res.json({ received: payload.id });", "line": 3, "correct": false,
   "explanation": "The response is well-formed. It never runs, because the line above throws first."}
]$opts$
);

DROP FUNCTION seed_bug_hunt_incident(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], INTEGER, JSONB
);

COMMIT;
