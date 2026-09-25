/**
 * The Jolt JavaScript curriculum.
 *
 * THE SOURCE OF TRUTH for what Jolt teaches, in what order, and why. It is
 * authored here rather than in PostgreSQL because a syllabus is a set of design
 * decisions that should be reviewable in a pull request, not reconstructed from
 * INSERT statements. Phase 4 projects it into tables so that challenges can hold
 * foreign keys into it; a content test then asserts the two never drift.
 *
 * WHAT THIS MODULE MUST NEVER CONTAIN. No game names, no game capabilities, no
 * response formats, no speed or presentation settings, no authored difficulty
 * numbers, no learner state. The curriculum describes the subject. Games declare
 * separately what they can render; difficulty is derived; learner state belongs
 * to a person, not to content.
 *
 * ORDERING. The sequence is aligned to The Marcy Lab School's Software
 * Engineering curriculum -- Unit 2 (Types & Operators -> Variables & Control
 * Flow -> Functions -> Scope -> Arrays -> Objects) and the module arc (Core
 * JavaScript -> DOM -> Async -> OOP -> DS&A). That ordering is used as a
 * structural reference only. Every concept name, progression, rationale and
 * challenge in Jolt is original; no exercises, explanations or question text are
 * taken from Marcy or from any other curriculum.
 *
 * The single most consequential thing Marcy's ordering settled: `scope` belongs
 * immediately after `functions`, before arrays and objects. Jolt's earlier draft
 * had it filed with the advanced material, which would have left closures, `this`
 * and the event loop all resting on a step the player had not taken.
 *
 * DEFERRED: ES MODULES. There is deliberately no `modules` topic. A seventeenth
 * topic would put a node on the skill map that is essentially empty, and modules
 * are a project-structure concern rather than the runtime reasoning Jolt's games
 * exercise -- you cannot predict, order or debug an import the way you can a
 * closure. If modules ever earn a topic, live bindings is the concept worth
 * starting from.
 */

/* ---------------------------------------------------------------- demands */

/**
 * The seven cognitive demands, in order of what they ask of a learner.
 *
 * ONE AXIS, NOT TWO. An earlier draft carried a separate "challenge type" enum
 * alongside a "stage" ladder, and the two turned out to describe the same thing
 * at different resolutions -- `trace-value` is `predict` probed mid-run,
 * `compare-snippets` is `recognise` with two alternatives instead of four.
 * Modelling them apart permitted meaningless combinations, so they are one list.
 *
 * What is NOT here, deliberately: response format (single-choice, binary,
 * ordering, assembly, matching) belongs to a game's content, because the content
 * must actually support it; speed belongs to a game's manifest, because the same
 * fact is not "rapid" in one game and leisurely in another. The test before
 * adding a rung: would a learner who could do this be able to do something they
 * otherwise could not? If they would merely be doing the same thing faster, or
 * with fewer options, it is presentation.
 */
export const DEMANDS = [
    "recall",
    "recognise",
    "predict",
    // Between predict and produce: applying an idea to a case in front of you is
    // more than saying what it will do and less than writing one yourself. It is
    // the rung under "change this and run it again", which is the most common
    // interaction in Jolt and had no way to be described before.
    "apply",
    "produce",
    "diagnose",
    "repair",
    "explain"
] as const;

export type Demand = (typeof DEMANDS)[number];

export interface DemandSpec {
    demand: Demand;
    /** What this asks of the learner, independent of subject matter. */
    asks: string;
}

export const DEMAND_SPECS: Readonly<Record<Demand, DemandSpec>> = {
    recall: {
        demand: "recall",
        asks: "Retrieve what something does from memory, with no instance in front of you."
    },
    recognise: {
        demand: "recognise",
        asks: "Judge a presented instance as correct or not."
    },
    apply: {
        demand: "apply",
        asks: "Change a specific part of a working example and produce the intended result."
    },
    predict: {
        demand: "predict",
        asks: "Run it in your head and state the result."
    },
    produce: {
        demand: "produce",
        asks: "Construct or complete code so that it works."
    },
    diagnose: {
        demand: "diagnose",
        asks: "Locate the fault in code that runs wrongly."
    },
    repair: {
        demand: "repair",
        asks: "Produce the correction, not merely its location."
    },
    explain: {
        demand: "explain",
        asks: "Give the mechanism, not the outcome."
    }
};

/** Position on the ladder, 1-based. Feeds the difficulty derivation below. */
export function demandOrder(demand: Demand): number {
    return DEMANDS.indexOf(demand) + 1;
}

/* ------------------------------------------------------------------ tiers */

/** How hard an idea is intrinsically. A property of the topic, never of a learner. */
export type Tier = "beginner" | "intermediate" | "advanced";

/** Matches `questions.difficulty` (1-4). Derived, never authored. */
export type Difficulty = 1 | 2 | 3 | 4;

/**
 * Difficulty, derived from tier and demand -- never written by hand.
 *
 * This is the structural fix for a bank that drifted advanced-heavy. When every
 * question carried a hand-assigned 1-4, nothing constrained the number, and the
 * dealer faithfully surfaced whatever landed at 4. Here a tier-4 challenge can
 * only mean "an advanced topic at a demanding rung", which is a claim that can
 * be checked.
 *
 * The consequence worth stating: because a concept declares only the demands
 * appropriate to it, its reachable difficulty is CAPPED by its deepest declared
 * demand. A beginner concept that stops at `produce` can never generate a
 * tier-3 challenge -- not by discipline, but because the row cannot exist.
 */
export function difficultyFor(tier: Tier, demand: Demand): Difficulty {
    const deep = demandOrder(demand) >= demandOrder("produce");

    if (tier === "beginner") return deep ? 2 : 1;
    if (tier === "intermediate") return deep ? 3 : 2;

    return deep ? 4 : 3;
}

/* ----------------------------------------------------------------- topics */

export const TOPIC_IDS = [
    "values",
    "variables",
    "operators",
    "control-flow",
    "strings",
    "loops",
    "functions",
    "scope",
    "arrays",
    "array-methods",
    "objects",
    "errors",
    "dom",
    "async",
    "this-and-classes",
    "algorithms"
] as const;

export type TopicId = (typeof TOPIC_IDS)[number];

export interface Topic {
    id: TopicId;
    /** What the player sees. Never the internal id. */
    label: string;
    tier: Tier;
    /** Topics whose concepts should be underway before this one opens. */
    prerequisites: readonly TopicId[];
    /** The Marcy unit or module this position is aligned to. */
    marcyAnchor: string;
    /** Why it sits here. The argument, not the citation. */
    rationale: string;
    /**
     * The JavaScript idea the learner should come away holding.
     *
     * Distinct from `rationale`, which argues about curriculum placement and is
     * addressed to whoever reviews the syllabus. This is addressed to the
     * learner and teaches something: "comparisons produce booleans, which is
     * what decisions are made from", never "comparisons come after values".
     *
     * Optional while the first pass covers the five foundational topics. A topic
     * without one projects an empty string, which reads as unwritten rather than
     * as absent by design.
     */
    principle?: string;
    /** What the learner can do once its concepts are solid. */
    unlocks: string;
}

export const TOPICS: readonly Topic[] = [
    {
        id: "values",
        label: "Values and Types",
        tier: "beginner",
        prerequisites: [],
        marcyAnchor: "Unit 2 · Lesson 1 — Types, Values, Operators",
        rationale:
            "The root of the graph. Every later idea is about moving values around, so a player who cannot name what kind of thing they are holding cannot reason about anything that happens to it.",
        principle:
            "A program is made of values. Every value has a type, every expression the program runs collapses into a single value, and what a value can do depends on which type it is.",
        unlocks: "Name what kind of thing a value is, and predict what an operator does to two of them."
    },
    {
        id: "variables",
        label: "Variables",
        tier: "beginner",
        prerequisites: ["values"],
        marcyAnchor: "Unit 2 · Lesson 2 — Variables & Control Flow",
        rationale:
            "A variable is a value with a name attached, so it is meaningless before values. Comes before operators only by convention -- the two are near-simultaneous in practice.",
        principle:
            "Variables give names to values so a program can refer to information again later and replace it as it changes. The name and the value are two separate things.",
        unlocks: "Follow one value as it changes across several lines."
    },
    {
        id: "operators",
        label: "Operators",
        tier: "beginner",
        prerequisites: ["values"],
        marcyAnchor: "Unit 2 · Lesson 1 — Types, Values, Operators",
        rationale:
            "Split out of the old `conditionals` topic, which was conflating two things: `5 > 3` is an operator question, `if (x) {}` is a control-flow question. Comparison and logic have to be solid before a branch that depends on them means anything.",
        principle:
            "Operators combine values into new values. Arithmetic produces numbers, comparison produces booleans, and a boolean is what every decision is ultimately made from.",
        unlocks: "Evaluate an expression without running it."
    },
    {
        id: "control-flow",
        label: "Control Flow",
        tier: "beginner",
        prerequisites: ["operators"],
        marcyAnchor: "Unit 2 · Lesson 2 — Variables & Control Flow",
        rationale:
            "A branch is an operator result acted upon. Teaching `if` before truthiness produces players who can read the syntax and cannot predict which way it goes.",
        principle:
            "A program chooses which code to run by evaluating a condition down to true or false. Conditions can be combined and nested, and only the branch that wins actually runs.",
        unlocks: "Say which branch runs, and why the others do not."
    },
    {
        id: "strings",
        label: "Strings",
        tier: "beginner",
        prerequisites: ["values"],
        marcyAnchor: "Unit 2 · Lesson 1 — Values",
        rationale:
            "Sits off to the side of the main spine: it needs only values, and nothing downstream depends on it. That makes it useful early breadth without blocking anything.",
        principle:
            "A string is an ordered sequence of characters, counted from zero, that can never be changed in place. Every operation on a string produces a new one and leaves the original alone.",
        unlocks: "Transform text without expecting the original to change."
    },
    {
        id: "loops",
        label: "Loops",
        tier: "beginner",
        prerequisites: ["control-flow", "variables"],
        marcyAnchor: "Unit 2 · Lesson 2 — Control Flow",
        rationale:
            "A loop is a condition plus a changing variable. Both prerequisites are load-bearing: the condition decides whether it runs again, the variable is what changes.",
        unlocks: "Trace a counter through every iteration."
    },
    {
        id: "functions",
        label: "Functions",
        tier: "beginner",
        prerequisites: ["control-flow"],
        marcyAnchor: "Unit 2 · Lesson 3 — Introduction to Functions",
        rationale:
            "The hinge of the whole curriculum. Almost everything intermediate and advanced passes through it -- callbacks, array methods, closures, promises and classes are all functions wearing different hats.",
        unlocks: "Reason about a function from its signature and its return."
    },
    {
        id: "scope",
        label: "Scope and Closures",
        tier: "intermediate",
        prerequisites: ["functions"],
        marcyAnchor: "Unit 2 · Lesson 4 — Scope",
        rationale:
            "Marcy teaches this fourth, immediately after functions and BEFORE arrays and objects. That ordering is the single most important correction to Jolt's earlier draft, which filed scope with the advanced material. Closures, `this` and the event loop all rest on it, so deferring it leaves three advanced topics standing on nothing.",
        unlocks: "Say where a value lives and how long it survives."
    },
    {
        id: "arrays",
        label: "Arrays",
        tier: "intermediate",
        prerequisites: ["loops", "variables"],
        marcyAnchor: "Unit 2 · Lesson 5 — Arrays",
        rationale:
            "Needs loops because iteration is how a beginner first works through a list, and variables because the reference-versus-copy distinction is a variable-level idea before it is an array-level one.",
        unlocks: "Tell a copy from an alias, and predict what mutation breaks."
    },
    {
        id: "array-methods",
        label: "Array Methods",
        tier: "intermediate",
        prerequisites: ["arrays", "functions"],
        marcyAnchor: "Unit 2 · Lesson 5 — Arrays",
        rationale:
            "Two hard prerequisites and both are real. `map` is the point where a learner passes a function to another function for the first time, so a shaky grasp of either side shows up here as confusion about the callback.",
        unlocks: "Choose a method from the shape of the answer needed."
    },
    {
        id: "objects",
        label: "Objects",
        tier: "intermediate",
        prerequisites: ["arrays"],
        marcyAnchor: "Unit 2 · Lesson 6 — Objects",
        rationale:
            "After arrays because reference semantics are easier to see in a list than in a nested record, and because real data is arrays of objects rather than either alone.",
        unlocks: "Navigate and reshape nested data without breaking the original."
    },
    {
        id: "errors",
        label: "Errors and Debugging",
        tier: "intermediate",
        prerequisites: ["functions", "control-flow"],
        marcyAnchor: "Module 3 · Asynchronous JavaScript — error handling",
        rationale:
            "Pulled earlier than Marcy places it. Marcy meets error handling inside async, but Jolt has a whole game about debugging, so the vocabulary of failure -- error types, stack traces, forming a hypothesis -- needs to exist before Bug Hunt can teach with it rather than merely test with it.",
        unlocks: "Read a failure and form a hypothesis about its cause."
    },
    {
        id: "dom",
        label: "The DOM",
        tier: "advanced",
        prerequisites: ["objects", "functions"],
        marcyAnchor: "Module 2 · HTML, CSS and DOM Manipulation",
        rationale:
            "Marcy places DOM before async, and Jolt follows -- but only half of it translates. Reasoning about the DOM (what a selector returns, in what order listeners fire) is predictable from source and fits existing games. Manipulating it needs a live document no Jolt game has, and that half is deliberately out of scope.",
        unlocks: "Predict what a listener logs, and in what order."
    },
    {
        id: "async",
        label: "Asynchronous JavaScript",
        tier: "advanced",
        prerequisites: ["functions", "errors"],
        marcyAnchor: "Module 3 · Asynchronous JavaScript",
        rationale:
            "Depends on errors as much as on functions: a promise chain whose failure path you cannot read is a coin flip, and `.catch` placement is the most common real-world async mistake.",
        unlocks: "Order the output of interleaved synchronous and asynchronous work."
    },
    {
        id: "this-and-classes",
        label: "`this` and Classes",
        tier: "advanced",
        prerequisites: ["objects", "scope"],
        marcyAnchor: "Module 5 · Object Oriented Programming",
        rationale:
            "`this` is a scope question wearing an object's clothes -- it is decided by the call site, which is exactly the kind of reasoning `scope` trains. Teaching classes before scope produces memorised rules rather than understanding.",
        unlocks: "Say what `this` refers to at any call site."
    },
    {
        id: "algorithms",
        label: "Algorithms",
        tier: "advanced",
        prerequisites: ["loops", "functions", "arrays"],
        marcyAnchor: "Module 6 · Data Structures & Algorithms",
        rationale:
            "Last because it is the first topic that is about choosing between correct solutions rather than reaching one. Recursion in particular needs functions and scope to be automatic, or the call stack is invisible.",
        unlocks: "Choose an approach and justify what it costs."
    }
];

/* --------------------------------------------------------------- concepts */

export const CONCEPT_IDS = [
    // values
    "console-output", "expressions-produce-values", "primitive-types", "booleans", "typeof",
    "null-vs-undefined", "type-coercion",
    // variables
    "variables-name-values", "declaration", "initialization", "assignment",
    "reading-variables", "reassignment", "let-vs-const", "variable-state",
    // operators
    "arithmetic-operators", "assignment-operators", "comparison-operators", "equality",
    "logical-operators", "truthy-falsy",
    // control-flow
    "if-else", "compound-conditions", "else-if-chains", "nested-conditions",
    "ternary", "guard-clauses",
    // strings
    "string-literals", "string-concatenation", "string-length", "string-indexing",
    "string-methods", "template-literals", "string-immutability",
    // loops
    "for-loop-anatomy", "while-loops", "loop-conditions", "accumulators", "break-continue",
    "nested-loops", "for-of-for-in",
    // functions
    "function-declaration", "parameters-arguments", "return-values", "arrow-functions",
    "functions-as-values", "default-rest-params",
    // scope
    "block-vs-function-scope", "hoisting-tdz", "shadowing", "closures", "loop-variable-capture",
    // arrays
    "array-indexing", "array-length", "array-mutation", "array-copy-spread", "nested-arrays",
    "array-reference-identity",
    // array-methods
    "map", "for-each", "filter", "find-some-every", "reduce", "sort", "flat", "method-chaining",
    // objects
    "object-access", "object-mutation", "nested-objects", "optional-chaining",
    "destructuring", "object-references", "json-shape", "built-in-collections",
    // errors
    "error-types", "throwing", "try-catch", "stack-traces", "debugging-strategy",
    // dom
    "selecting-elements", "element-properties", "event-listeners", "event-order", "dom-as-tree",
    // async
    "callbacks", "promise-states", "event-loop", "async-await", "error-propagation", "promise-all",
    // this-and-classes
    "this-binding", "methods", "classes", "prototypes", "inheritance",
    // algorithms
    "recursion", "base-cases", "search-strategies", "sorting-basics", "complexity"
] as const;

export type ConceptId = (typeof CONCEPT_IDS)[number];

/**
 * How much of the curriculum rests on a concept.
 *
 * Drives how much practice it earns -- a gate that a dozen later concepts depend
 * on deserves far more than a finite fact does.
 */
export type Weight = "light" | "core" | "load-bearing";

/**
 * One meaningful, teachable skill.
 *
 * GRANULARITY RULE. Every concept must complete the sentence "I know how to
 * ___". If it cannot, it is a syntax fragment rather than a skill and does not
 * belong on the Skill Map. `transforming with map()` passes; `the arity of the
 * map callback` does not.
 */
export interface Concept {
    id: ConceptId;
    topic: TopicId;
    /** What the player sees. */
    label: string;
    /** Completes "I know how to ___". The claim the Skill Map will show. */
    objective: string;
    /**
     * The one-line definition.
     *
     * Serves twice over: it is the rule line a Learn Beat prints under its worked
     * example, and it is the right-hand face of a Memory pair. Authored here so
     * it is never written twice and never drifts between the two.
     */
    meaning: string;
    /** Why this skill is in the syllabus at all. */
    why: string;
    /** Concepts, not topics. Finer-grained than the topic graph and may cross it. */
    prerequisites: readonly ConceptId[];
    weight: Weight;
    /**
     * The demands this concept can meaningfully be practised at.
     *
     * NEVER all seven by default. A concept that affords no honest `explain`
     * question does not list it, and the Skill Map will not show an unfilled cell
     * and call it a gap. This list is also the cap on the concept's reachable
     * difficulty -- see difficultyFor.
     */
    demands: readonly Demand[];
}

export const CONCEPTS: readonly Concept[] = [
    /* ---------------------------------------------------------- values */
    {
        id: "console-output", topic: "values", label: "Running Code and Reading Output",
        objective: "run a snippet and say what it prints",
        meaning: "console.log writes its arguments to the output, one line per call, in the order the lines run",
        why: "The first thing a learner has to be able to do, and the thing every prediction question in Jolt silently assumes. Someone unsure whether a line prints at all cannot reason about what it prints, and until now the curriculum never claimed to teach it.",
        prerequisites: [], weight: "load-bearing",
        demands: ["recognise", "predict"]
    },
    {
        id: "expressions-produce-values", topic: "values", label: "Expressions Produce Values",
        objective: "work out the single value a piece of code collapses to",
        meaning: "an expression is any code that produces a value, and it is replaced by that value before anything else happens",
        why: "The idea the whole language rests on, and the one the curriculum never stated. Arguments, conditions, right-hand sides of assignments and array indexes are all expressions; a learner who cannot see that `total + 1` becomes one number before it is used has to relearn evaluation order separately in every one of those places.",
        prerequisites: ["console-output"], weight: "load-bearing",
        demands: ["recognise", "predict", "explain"]
    },
    {
        id: "primitive-types", topic: "values", label: "Identifying Primitive Types",
        objective: "name what kind of thing a value is",
        meaning: "JavaScript has a small set of primitive types, and every literal is one of them",
        why: "Every later idea is about moving values around, so a learner who cannot name what they are holding cannot reason about what happens to it. It follows the expression idea rather than opening the syllabus, because naming a kind of value only means something once you have watched code produce one.",
        prerequisites: ["expressions-produce-values"], weight: "core",
        demands: ["recognise", "predict"]
    },
    {
        id: "booleans", topic: "values", label: "The Two Boolean Values",
        objective: "say where a true or a false came from",
        meaning: "true and false are values in their own right, and every comparison produces one of them",
        why: "Every condition a learner writes is a boolean underneath, and until now the curriculum only mentioned them in passing. Naming the type before it is used in an `if` is what stops `if (x = 5)` looking reasonable.",
        prerequisites: ["primitive-types"], weight: "core",
        demands: ["recognise", "predict"]
    },
    {
        id: "typeof", topic: "values", label: "Checking Types with `typeof`",
        objective: "check what type a value is at runtime",
        meaning: "typeof reports a value's type as a string",
        why: "The answer space is a short finite table with one famous lie in it (typeof null), which makes it a genuine recall skill rather than a reasoning one.",
        prerequisites: ["primitive-types"], weight: "light",
        demands: ["recall", "predict"]
    },
    {
        id: "null-vs-undefined", topic: "values", label: "Telling `null` from `undefined`",
        objective: "tell null and undefined apart and know which one you will get",
        meaning: "undefined means nobody set a value; null means somebody set it to nothing",
        why: "Two ways of saying nothing is a genuine source of confusion, and the difference explains a whole class of comparison surprises later.",
        prerequisites: ["primitive-types"], weight: "core",
        demands: ["recognise", "predict", "explain"]
    },
    {
        id: "type-coercion", topic: "values", label: "Predicting Type Coercion",
        objective: "predict what happens when types are mixed in an expression",
        meaning: "JavaScript silently converts types to make an operation work",
        why: "Load-bearing despite sitting in a beginner topic: coercion surprises reappear in equality, truthiness, array joining and JSON for the rest of the curriculum.",
        prerequisites: ["primitive-types"], weight: "load-bearing",
        demands: ["predict", "diagnose", "repair", "explain"]
    },

    /* ------------------------------------------------------- variables */
    {
        id: "variables-name-values", topic: "variables", label: "Names Refer to Values",
        objective: "say what a name refers to at a given line",
        meaning: "a variable is a name pointing at a value; the name and the value are two separate things",
        why: "The idea every later variable skill is a special case of. A learner who thinks the name IS the value cannot make sense of reassignment, of two names pointing at one array, or of what const actually protects.",
        prerequisites: ["primitive-types"], weight: "load-bearing",
        demands: ["recognise", "predict"]
    },
    {
        id: "declaration", topic: "variables", label: "Declaring a Variable",
        objective: "bring a name into existence before giving it a value",
        meaning: "a declaration creates the name; until something is assigned to it the name holds undefined",
        why: "Separated from initialization because `let total;` and `let total = 0;` are different statements that beginners read as one. The undefined a bare declaration leaves behind is the source of a whole class of first-month bugs.",
        prerequisites: ["variables-name-values"], weight: "core",
        demands: ["recognise", "predict", "produce"]
    },
    {
        id: "initialization", topic: "variables", label: "Giving a Variable Its First Value",
        objective: "declare a variable and give it a starting value in one statement",
        meaning: "initialization is the first assignment, written on the same line as the declaration",
        why: "The form almost all real code uses, and worth naming separately so that the declaration-only form reads as the deliberate choice it is rather than as a typo.",
        prerequisites: ["declaration"], weight: "core",
        demands: ["recognise", "predict", "produce"]
    },
    {
        id: "assignment", topic: "variables", label: "Assigning a Value",
        objective: "work out what gets stored when the right-hand side is an expression",
        meaning: "assignment evaluates everything on the right first, then stores that single value under the name on the left",
        why: "Right-before-left is what makes `count = count + 1` possible at all, and it is not obvious from the symbol. Naming it here means the accumulator pattern in loops is an application of a known rule rather than a new trick.",
        prerequisites: ["declaration", "expressions-produce-values"], weight: "load-bearing",
        demands: ["predict", "produce", "diagnose"]
    },
    {
        id: "reading-variables", topic: "variables", label: "Reading a Variable",
        objective: "substitute a variable for its current value when reading an expression",
        meaning: "using a name anywhere in an expression fetches whatever value it holds at that moment",
        why: "The other half of the name-value split. Tracing any program is repeated substitution, and a learner who cannot do it by hand cannot predict output, which is most of what Jolt asks.",
        prerequisites: ["initialization"], weight: "load-bearing",
        demands: ["recognise", "predict", "apply"]
    },
    {
        id: "reassignment", topic: "variables", label: "Reassigning Variables",
        objective: "follow a variable as its value changes across several lines",
        meaning: "assigning again replaces what the name refers to, from that line onward",
        why: "Where names stop being labels and start being state. The word `onward` is the whole lesson: earlier lines keep the old value, and beginners routinely read a program as if the final value applied throughout.",
        prerequisites: ["assignment", "reading-variables"], weight: "core",
        demands: ["predict", "apply", "diagnose"]
    },
    {
        id: "let-vs-const", topic: "variables", label: "Choosing between `let` and `const`",
        objective: "choose between let and const and know what const actually protects",
        meaning: "const stops the name being pointed somewhere else; it does not freeze the value",
        why: "Follows reassignment rather than declaration, because const is defined by what it refuses to allow -- the rule is meaningless to someone who has not yet watched a name be pointed somewhere new.",
        prerequisites: ["reassignment"], weight: "core",
        demands: ["recognise", "predict", "explain"]
    },
    {
        id: "variable-state", topic: "variables", label: "Tracking Variables Through a Program",
        objective: "track several variables at once through a block of code",
        meaning: "at any line, every variable in scope holds exactly one value",
        why: "The skill every prediction question actually tests. Holding three changing values in your head at once is the difference between reading code and guessing at it.",
        prerequisites: ["reassignment"], weight: "core",
        demands: ["predict", "produce"]
    },

    /* ------------------------------------------------------- operators */
    {
        id: "arithmetic-operators", topic: "operators", label: "Using Arithmetic Operators",
        objective: "evaluate an arithmetic expression without running it",
        meaning: "arithmetic operators combine two numbers into a new one",
        why: "Precedence and integer-vs-float surprises are small, but they sit underneath every accumulator and index calculation later.",
        prerequisites: ["primitive-types"], weight: "core",
        demands: ["predict", "explain"]
    },
    {
        id: "assignment-operators", topic: "operators", label: "Updating a Value in Place",
        objective: "update a variable using its own current value",
        meaning: "`+=` and `++` read the variable, change it, and store the result back under the same name",
        why: "The shorthand every counter and running total is written with. Without it `total = total + n` stays a piece of magic, and the accumulator pattern in loops is unreadable rather than merely new.",
        prerequisites: ["reassignment", "arithmetic-operators"], weight: "core",
        demands: ["predict", "produce"]
    },
    {
        id: "comparison-operators", topic: "operators", label: "Using Comparison Operators",
        objective: "work out whether a comparison is true or false",
        meaning: "comparison operators ask a question about two values and answer true or false",
        why: "Every branch and every loop condition is a comparison. Getting these wrong makes control flow unpredictable rather than merely unfamiliar.",
        prerequisites: ["primitive-types", "booleans"], weight: "core",
        demands: ["recognise", "predict"]
    },
    {
        id: "equality", topic: "operators", label: "Comparing with `==` vs. `===`",
        objective: "choose between == and === and predict what each one says",
        meaning: "=== compares value and type; == converts first and then compares",
        why: "The most consequential two-character decision a beginner makes, and the source of bugs that survive review because both forms look correct.",
        prerequisites: ["comparison-operators", "type-coercion"], weight: "load-bearing",
        demands: ["predict", "diagnose", "repair", "explain"]
    },
    {
        id: "logical-operators", topic: "operators", label: "Combining Conditions with `&&`, `||` and `!`",
        objective: "combine conditions and predict what the whole expression gives",
        meaning: "&& and || return one of their operands, not necessarily a boolean",
        why: "That they return an operand rather than true or false is what makes default-value idioms work, and what makes them surprising until it is understood.",
        prerequisites: ["comparison-operators"], weight: "core",
        demands: ["predict", "explain"]
    },
    {
        id: "truthy-falsy", topic: "operators", label: "Recognising Truthy and Falsy Values",
        objective: "say whether a non-boolean value will pass a condition",
        meaning: "every value is either truthy or falsy, and the falsy list is short and worth memorising",
        why: "The falsy set is finite and learnable, and knowing it converts a whole class of mysterious branches into obvious ones.",
        prerequisites: ["type-coercion", "booleans"], weight: "load-bearing",
        demands: ["recall", "predict", "explain"]
    },

    /* ---------------------------------------------------- control-flow */
    {
        id: "if-else", topic: "control-flow", label: "Branching with `if` and `else`",
        objective: "say which branch of a condition will run",
        meaning: "an if runs its block only when its condition is truthy",
        why: "The first place a program stops being a straight line. Teaching it before truthiness produces learners who read the syntax and cannot predict the path.",
        prerequisites: ["truthy-falsy", "booleans"], weight: "core",
        demands: ["recognise", "predict"]
    },
    {
        id: "else-if-chains", topic: "control-flow", label: "Chaining `else if` Conditions",
        objective: "work out which branch of a long chain wins",
        meaning: "an else-if chain runs the first matching branch and skips the rest",
        why: "Order matters and overlapping conditions are a classic silent bug: the second branch is unreachable and nothing complains.",
        prerequisites: ["if-else"], weight: "core",
        demands: ["predict", "diagnose"]
    },
    {
        id: "compound-conditions", topic: "control-flow", label: "Combining Conditions in a Decision",
        objective: "predict which parts of a combined condition actually get evaluated",
        meaning: "&& stops at the first falsy part and || stops at the first truthy one, so the rest is never run",
        why: "Short-circuiting is where combined conditions stop being arithmetic on booleans and start mattering: it is why the null check has to come first in `user && user.name`, and why swapping the order breaks a program that looked equivalent.",
        prerequisites: ["if-else", "logical-operators"], weight: "load-bearing",
        demands: ["predict", "produce", "diagnose"]
    },
    {
        id: "nested-conditions", topic: "control-flow", label: "Decisions Inside Decisions",
        objective: "work out which branch of a nested decision a given input reaches",
        meaning: "an if inside another if only runs when the outer condition was already true",
        why: "What beginners actually write before they know any alternative, and the shape most conditional bugs live in. Naming it also gives guard clauses something to be an improvement ON, rather than presenting them as arbitrary style.",
        prerequisites: ["else-if-chains"], weight: "core",
        demands: ["predict", "diagnose", "repair"]
    },
    {
        id: "ternary", topic: "control-flow", label: "Choosing Values with the Ternary Operator",
        objective: "read and write a conditional that produces a value",
        meaning: "a ternary chooses between two values in a single expression",
        why: "The bridge from statements that do something to expressions that are something, which matters as soon as callbacks arrive.",
        prerequisites: ["if-else"], weight: "core",
        demands: ["recognise", "predict", "produce"]
    },
    {
        id: "guard-clauses", topic: "control-flow", label: "Exiting Early with Guard Clauses",
        objective: "leave a function early instead of nesting the happy path",
        meaning: "a guard clause handles the exceptional case first and returns",
        why: "The single habit that most reduces nesting in real code. It follows nesting rather than if/else, because a guard clause is a FIX for nesting -- taught before the problem it solves, it is only a style rule to memorise.",
        prerequisites: ["nested-conditions"], weight: "core",
        demands: ["predict", "produce", "explain"]
    },

    /* --------------------------------------------------------- strings */
    {
        id: "string-literals", topic: "strings", label: "Writing Text as a Value",
        objective: "tell a string apart from the thing it looks like",
        meaning: "quotes turn whatever is between them into text, however numeric or code-like it looks",
        why: "The topic previously opened at indexing, which assumes a learner already knows what a string IS. `\"25\"` and `25` look identical on screen and behave nothing alike, and that confusion causes more beginner bugs than any indexing mistake.",
        prerequisites: ["primitive-types"], weight: "core",
        demands: ["recognise", "predict"]
    },
    {
        id: "string-concatenation", topic: "strings", label: "Joining Strings with `+`",
        objective: "predict what + gives you when a string is one of the operands",
        meaning: "if either side of + is a string, the other side is converted to text and the two are joined",
        why: "The first place coercion is visible rather than theoretical, and the reason `1 + 2 + \"3\"` and `\"1\" + 2 + 3` differ. Template literals cannot be taught as the better alternative until a learner has met the thing being replaced.",
        prerequisites: ["string-literals", "expressions-produce-values"], weight: "load-bearing",
        demands: ["predict", "produce", "diagnose"]
    },
    {
        id: "string-length", topic: "strings", label: "Measuring a String",
        objective: "use length to reason about the characters a string holds",
        meaning: "length counts every character, so the last index is always one less than it",
        why: "The off-by-one that indexing and every loop over text depends on. Taught before indexing because `text[text.length - 1]` is otherwise a formula to memorise rather than a consequence of counting from zero.",
        prerequisites: ["string-literals"], weight: "core",
        demands: ["predict", "diagnose"]
    },
    {
        id: "string-indexing", topic: "strings", label: "Accessing Characters by Index",
        objective: "get at a character or a slice by position",
        meaning: "a string is an ordered sequence of characters counted from zero",
        why: "Zero-based counting is easier to meet here, on something visible, than for the first time inside a loop over an array.",
        prerequisites: ["string-length"], weight: "core",
        demands: ["recognise", "predict"]
    },
    {
        id: "string-methods", topic: "strings", label: "Transforming Strings with Methods",
        objective: "pick the right method to reshape a piece of text",
        meaning: "string methods return a new string and leave the original alone",
        why: "A finite, frequently used vocabulary. Knowing which method exists is genuinely a recall skill before it is a reasoning one.",
        prerequisites: ["string-indexing"], weight: "core",
        demands: ["recall", "predict", "produce"]
    },
    {
        id: "template-literals", topic: "strings", label: "Building Strings with Template Literals",
        objective: "build a string out of values without clumsy concatenation",
        meaning: "backticks let you drop values straight into text with ${}",
        why: "Ubiquitous in modern code, and the readable alternative to the plus-sign chains that beginners otherwise write.",
        prerequisites: ["string-concatenation"], weight: "core",
        demands: ["recognise", "predict", "produce"]
    },
    {
        id: "string-immutability", topic: "strings", label: "String Immutability",
        objective: "know that string operations return new text rather than editing it",
        meaning: "strings cannot be changed in place; every operation produces a new one",
        why: "The first encounter with immutability, and a cheap one. Meeting it here makes the array-mutation contrast land much harder later.",
        prerequisites: ["string-methods"], weight: "core",
        demands: ["predict", "diagnose", "repair"]
    },

    /* ----------------------------------------------------------- loops */
    {
        id: "for-loop-anatomy", topic: "loops", label: "Reading a `for` Loop",
        objective: "read a for loop and say how many times it runs",
        meaning: "a for loop has a start, a condition checked before each pass, and a step after each",
        why: "Three clauses doing three different jobs at three different times. Until that is separated out, every loop is guesswork.",
        prerequisites: ["variable-state", "comparison-operators"], weight: "load-bearing",
        demands: ["recognise", "predict"]
    },
    {
        id: "while-loops", topic: "loops", label: "Looping with `while`",
        objective: "choose a while loop when the number of passes is not known up front",
        meaning: "a while loop repeats as long as its condition stays truthy",
        why: "Choosing between for and while is a real decision, and while is where infinite loops are learned about the hard way.",
        prerequisites: ["for-loop-anatomy"], weight: "core",
        demands: ["recognise", "predict", "explain"]
    },
    {
        id: "loop-conditions", topic: "loops", label: "Setting Loop Bounds",
        objective: "write a loop bound that covers every item exactly once",
        meaning: "the last valid index is length minus one, so the condition uses less-than",
        why: "Off-by-one is the most common loop bug there is, and it is a single comparison away from correct.",
        prerequisites: ["for-loop-anatomy"], weight: "load-bearing",
        demands: ["predict", "produce", "diagnose", "repair"]
    },
    {
        id: "accumulators", topic: "loops", label: "Building Results with Accumulators",
        objective: "build up a total or a list across the passes of a loop",
        meaning: "an accumulator is a variable declared outside the loop and updated inside it",
        why: "The pattern behind sum, count, join and eventually reduce. Recognising it once makes all of those the same idea.",
        prerequisites: ["for-loop-anatomy", "variable-state", "assignment-operators"], weight: "load-bearing",
        demands: ["predict", "produce"]
    },
    {
        id: "break-continue", topic: "loops", label: "Interrupting Loops with `break` and `continue`",
        objective: "stop a loop early or skip a single pass",
        meaning: "break leaves the loop entirely; continue skips to the next pass",
        why: "Two words that look similar and do very different things, and confusing them produces a loop that quietly does the wrong amount of work.",
        prerequisites: ["for-loop-anatomy"], weight: "core",
        demands: ["predict", "explain"]
    },
    {
        id: "nested-loops", topic: "loops", label: "Working with Nested Loops",
        objective: "work out how many times the inner body of nested loops runs",
        meaning: "the inner loop runs all the way through on every single pass of the outer one",
        why: "The first place where a small change to code causes a large change in work done, which is the seed of thinking about cost.",
        prerequisites: ["for-loop-anatomy"], weight: "core",
        demands: ["predict", "produce"]
    },
    {
        id: "for-of-for-in", topic: "loops", label: "Choosing `for...of` vs. `for...in`",
        objective: "choose the right loop form for arrays and for objects",
        meaning: "for-of walks values, for-in walks keys",
        why: "Mixing these up is a classic, and the failure is quiet: for-in over an array gives you string indices and nothing throws.",
        prerequisites: ["for-loop-anatomy"], weight: "core",
        demands: ["recognise", "predict", "diagnose"]
    },

    /* ------------------------------------------------------- functions */
    {
        id: "function-declaration", topic: "functions", label: "Defining and Calling Functions",
        objective: "define a function and call it",
        meaning: "defining a function stores instructions; calling it runs them",
        why: "The gap between defining and calling is the first thing beginners collapse, and every later confusion about callbacks starts there.",
        prerequisites: ["variable-state"], weight: "load-bearing",
        demands: ["recognise", "predict", "produce"]
    },
    {
        id: "parameters-arguments", topic: "functions", label: "Passing Parameters and Arguments",
        objective: "pass values into a function and know what the names inside refer to",
        meaning: "parameters are the names in the definition; arguments are the values passed at the call",
        why: "Position matters, names are local, and missing arguments are undefined rather than an error. All three surprise people.",
        prerequisites: ["function-declaration"], weight: "core",
        demands: ["recognise", "predict", "diagnose"]
    },
    {
        id: "return-values", topic: "functions", label: "Returning Values from Functions",
        objective: "get a value back out of a function and know when you will not",
        meaning: "return hands a value back to the caller; a function without one gives undefined",
        why: "Logging inside a function and returning from it feel the same to a beginner and are completely different. This is the most valuable single distinction in the topic.",
        prerequisites: ["function-declaration"], weight: "load-bearing",
        demands: ["predict", "diagnose", "repair", "explain"]
    },
    {
        id: "arrow-functions", topic: "functions", label: "Writing Arrow Functions",
        objective: "read and write arrow functions, including the implicit return",
        meaning: "an arrow function is shorter, and with no braces it returns its expression automatically",
        why: "Every array method takes one, so this has to be comfortable before array-methods rather than during it.",
        prerequisites: ["return-values"], weight: "load-bearing",
        demands: ["recognise", "predict", "produce"]
    },
    {
        id: "functions-as-values", topic: "functions", label: "Passing Functions as Values",
        objective: "pass a function to another function without calling it",
        meaning: "a function can be stored, passed and returned like any other value",
        why: "The idea that unlocks callbacks, array methods and closures at once. Calling instead of passing is the single most common beginner slip in the whole curriculum.",
        prerequisites: ["arrow-functions"], weight: "load-bearing",
        demands: ["predict", "diagnose", "explain"]
    },
    {
        id: "default-rest-params", topic: "functions", label: "Using Default and Rest Parameters",
        objective: "give parameters defaults and gather extra arguments",
        meaning: "a default fills in a missing argument; rest collects whatever is left into an array",
        why: "Common in real signatures, and defaults interact with undefined in a way worth seeing deliberately.",
        prerequisites: ["parameters-arguments"], weight: "light",
        demands: ["predict", "produce"]
    },

    /* ----------------------------------------------------------- scope */
    {
        id: "block-vs-function-scope", topic: "scope", label: "Block and Function Scope",
        objective: "say where a variable is visible and where it is not",
        meaning: "let and const live inside the nearest braces; var does not",
        why: "Scope is the first invisible rule in the language. Every closure and hoisting surprise later is this idea wearing a costume.",
        prerequisites: ["function-declaration"], weight: "load-bearing",
        demands: ["recognise", "predict", "explain"]
    },
    {
        id: "hoisting-tdz", topic: "scope", label: "Hoisting & the Temporal Dead Zone",
        objective: "predict what happens when a name is used before its declaration",
        meaning: "declarations are known before the code runs, but let and const cannot be touched until their line",
        why: "Explains a category of errors that otherwise look like the engine misbehaving, and it is unavoidable once function declarations and const coexist.",
        prerequisites: ["block-vs-function-scope"], weight: "core",
        demands: ["predict", "diagnose", "explain"]
    },
    {
        id: "shadowing", topic: "scope", label: "Resolving Variable Shadowing",
        objective: "work out which of two same-named variables a line is using",
        meaning: "an inner declaration hides the outer one of the same name for that block",
        why: "Reading unfamiliar code means resolving names constantly, and a shadowed variable is invisible until you look for it.",
        prerequisites: ["block-vs-function-scope"], weight: "core",
        demands: ["predict", "diagnose"]
    },
    {
        id: "closures", topic: "scope", label: "Using Closures",
        objective: "use a function that keeps access to the variables it was created with",
        meaning: "a function remembers the scope it was defined in, even after that scope has finished",
        why: "The most powerful idea in the topic and the one that makes counters, private state and most callback patterns make sense rather than seem magical.",
        prerequisites: ["block-vs-function-scope", "functions-as-values"], weight: "load-bearing",
        demands: ["predict", "produce", "diagnose", "explain"]
    },
    {
        id: "loop-variable-capture", topic: "scope", label: "Capturing Variables in Loops",
        objective: "predict what a function created inside a loop will see when it runs",
        meaning: "let gives each pass its own variable; var shares one across all of them",
        why: "The classic interview bug, but more importantly the place where closures and loops collide and both have to be understood at once.",
        prerequisites: ["closures", "for-loop-anatomy"], weight: "core",
        demands: ["predict", "diagnose", "repair", "explain"]
    },

    /* ---------------------------------------------------------- arrays */
    {
        id: "array-indexing", topic: "arrays", label: "Accessing Array Items by Index",
        objective: "read an item out of a list by position",
        meaning: "array items are numbered from zero, and an index past the end gives undefined",
        why: "That an out-of-range index returns undefined rather than throwing is the reason so many array bugs surface far from their cause.",
        prerequisites: ["string-indexing"], weight: "core",
        demands: ["recognise", "predict"]
    },
    {
        id: "array-length", topic: "arrays", label: "Using Array `length`",
        objective: "use length correctly, including for the last index",
        meaning: "length counts the items, so the last index is always length minus one",
        why: "Half of all off-by-one errors are this one fact not being automatic yet.",
        prerequisites: ["array-indexing"], weight: "core",
        demands: ["predict", "diagnose"]
    },
    {
        id: "array-mutation", topic: "arrays", label: "Mutating Arrays in Place",
        objective: "change a list in place and know which methods do that",
        meaning: "push, pop, splice and sort change the original array rather than returning a new one",
        why: "The mutating-versus-returning split runs through the whole of array-methods, and getting it wrong produces bugs that appear in unrelated code.",
        prerequisites: ["array-indexing"], weight: "load-bearing",
        demands: ["predict", "diagnose", "repair", "explain"]
    },
    {
        id: "array-copy-spread", topic: "arrays", label: "Copying Arrays with Spread",
        objective: "copy an array without accidentally sharing it",
        meaning: "spread makes a new array one level deep; nested contents are still shared",
        why: "Shallow copying is the exact point where most people believe they have made a copy and have not.",
        prerequisites: ["array-mutation"], weight: "load-bearing",
        demands: ["predict", "produce", "explain"]
    },
    {
        id: "nested-arrays", topic: "arrays", label: "Working with Nested Arrays",
        objective: "reach into an array of arrays and get the item you meant",
        meaning: "a nested array is just an array whose items are also arrays",
        why: "Grids, rows of records and matrix-shaped data are everywhere, and the double index needs to stop being a puzzle.",
        prerequisites: ["array-indexing"], weight: "core",
        demands: ["recognise", "predict"]
    },
    {
        id: "array-reference-identity", topic: "arrays", label: "Comparing Arrays by Reference",
        objective: "tell whether two variables point at one array or two",
        meaning: "arrays are compared by identity, so two arrays with identical contents are still not equal",
        why: "Explains why an equality check on two identical-looking arrays is false, and why changing one variable changed another.",
        prerequisites: ["array-copy-spread"], weight: "core",
        demands: ["predict", "explain"]
    },

    /* --------------------------------------------------- array-methods */
    {
        id: "map", topic: "array-methods", label: "Transforming Arrays with `map()`",
        objective: "transform every item in an array without mutating the original",
        meaning: "creates a new array by transforming each item",
        why: "The first non-mutating array method and the gateway to declarative list handling, and on to filter and reduce.",
        prerequisites: ["arrow-functions", "array-indexing"], weight: "load-bearing",
        demands: ["recall", "recognise", "predict", "produce", "diagnose", "repair"]
    },
    {
        id: "for-each", topic: "array-methods", label: "Iterating with `forEach()`",
        objective: "run a side effect for every item and know it returns nothing",
        meaning: "runs a function for each item and returns undefined",
        why: "Choosing between forEach and map is the clearest test of whether the return-value idea has landed.",
        prerequisites: ["map"], weight: "core",
        demands: ["recall", "recognise", "predict", "explain"]
    },
    {
        id: "filter", topic: "array-methods", label: "Filtering Arrays with `filter()`",
        objective: "keep only the items that pass a test",
        meaning: "keeps items whose test returns true, in a new array",
        why: "Pairs with map to cover most list work, and the truthiness of the callback result is where it goes wrong.",
        prerequisites: ["map", "truthy-falsy"], weight: "load-bearing",
        demands: ["recall", "predict", "produce", "diagnose"]
    },
    {
        id: "find-some-every", topic: "array-methods", label: "Searching with `find()`, `some()` and `every()`",
        objective: "pick the right method for finding an item or testing a whole list",
        meaning: "find returns an item, some and every return booleans",
        why: "A small family with a shared shape and different return types. Choosing correctly is a recall skill with a reasoning check attached.",
        prerequisites: ["filter"], weight: "core",
        demands: ["recall", "predict", "explain"]
    },
    {
        id: "reduce", topic: "array-methods", label: "Reducing Arrays with `reduce()`",
        objective: "collapse a list into a single value",
        meaning: "carries an accumulator through the list and returns whatever is left at the end",
        why: "The hardest array method and the one that generalises the rest. Meeting accumulators in loops first is what makes it tractable.",
        prerequisites: ["accumulators", "filter"], weight: "load-bearing",
        demands: ["predict", "produce", "diagnose", "explain"]
    },
    {
        id: "sort", topic: "array-methods", label: "Sorting Arrays with `sort()`",
        objective: "sort a list correctly, including numbers",
        meaning: "sorts in place, comparing as text unless you give it a comparator",
        why: "Two traps in one method: it mutates, and its default order puts 10 before 2. Both bite immediately and silently.",
        prerequisites: ["array-mutation"], weight: "core",
        demands: ["predict", "diagnose", "repair", "explain"]
    },
    {
        id: "flat", topic: "array-methods", label: "Flattening Arrays with `flat()`",
        objective: "flatten nested arrays to the depth you need",
        meaning: "flat pulls nested array items up to the level you ask for",
        why: "Small, but the natural partner to nested arrays and to flatMap once map is comfortable.",
        prerequisites: ["nested-arrays", "map"], weight: "light",
        demands: ["predict", "explain"]
    },
    {
        id: "method-chaining", topic: "array-methods", label: "Chaining Array Methods",
        objective: "chain array methods and follow what flows between them",
        meaning: "each method returns a new array, so the next one starts from that result",
        why: "Where array methods stop being separate tricks and become a way of expressing a whole transformation.",
        prerequisites: ["map", "filter"], weight: "core",
        demands: ["predict", "produce"]
    },

    /* --------------------------------------------------------- objects */
    {
        id: "object-access", topic: "objects", label: "Accessing Object Properties",
        objective: "read a property with dot or bracket notation and know when to use which",
        meaning: "dot notation needs a literal name; brackets take any expression",
        why: "The moment a key is held in a variable, dot notation silently looks for the wrong property. That failure is quiet.",
        prerequisites: ["array-indexing"], weight: "core",
        demands: ["recognise", "predict"]
    },
    {
        id: "object-mutation", topic: "objects", label: "Adding and Removing Properties",
        objective: "add, change and remove properties on an object",
        meaning: "properties can be set or deleted at any time, on any object you hold",
        why: "Objects are mutable by default and shared by reference, so changing one is rarely as local as it looks.",
        prerequisites: ["object-access"], weight: "core",
        demands: ["predict", "diagnose"]
    },
    {
        id: "nested-objects", topic: "objects", label: "Navigating Nested Objects",
        objective: "navigate a nested structure to the value you want",
        meaning: "a property can hold another object, as deep as the data goes",
        why: "Real data is nested. Reading an API response is mostly this skill and nothing else.",
        prerequisites: ["object-access"], weight: "core",
        demands: ["recognise", "predict"]
    },
    {
        id: "optional-chaining", topic: "objects", label: "Safe Access with Optional Chaining",
        objective: "read through a chain that might not exist without throwing",
        meaning: "?. stops and gives undefined instead of throwing when something is missing",
        why: "The modern answer to a very common crash, and it pairs directly with null-vs-undefined.",
        prerequisites: ["nested-objects", "null-vs-undefined"], weight: "core",
        demands: ["recognise", "predict", "explain"]
    },
    {
        id: "destructuring", topic: "objects", label: "Destructuring Objects and Arrays",
        objective: "pull values out of an object or array into named variables",
        meaning: "destructuring copies properties out into variables of the same name",
        why: "Ubiquitous in modern code, especially in function parameters, so it has to be readable before it is writable.",
        prerequisites: ["object-access"], weight: "core",
        demands: ["recognise", "predict", "produce"]
    },
    {
        id: "object-references", topic: "objects", label: "Object References",
        objective: "tell whether two names point at the same object",
        meaning: "assigning an object copies the reference, not the contents",
        why: "The single most consequential idea in the topic. Nearly every surprising mutation bug in a codebase comes back to it.",
        prerequisites: ["object-mutation", "array-reference-identity"], weight: "load-bearing",
        demands: ["predict", "diagnose", "repair", "explain"]
    },
    {
        id: "json-shape", topic: "objects", label: "Converting Between Objects and JSON",
        objective: "convert between objects and JSON text and know what does not survive",
        meaning: "JSON is text, and it can only carry a subset of what a JavaScript object can hold",
        why: "Every API boundary is this conversion, and functions, undefined and dates silently disappearing is a real source of confusion.",
        prerequisites: ["nested-objects"], weight: "core",
        demands: ["recognise", "predict", "produce"]
    },
    {
        id: "built-in-collections", topic: "objects", label: "Using `Map` and `Set`",
        objective: "choose a Map or a Set when a plain object is the wrong shape",
        meaning: "a Set holds unique values; a Map allows keys that are not strings",
        why: "Knowing these exist prevents a lot of awkward object abuse, even before they are used regularly.",
        prerequisites: ["object-access"], weight: "light",
        demands: ["recall", "recognise", "predict"]
    },

    /* ---------------------------------------------------------- errors */
    {
        id: "error-types", topic: "errors", label: "Identifying Error Types",
        objective: "tell from the error name what kind of thing went wrong",
        meaning: "the error type names the category of failure, before you read anything else",
        why: "A short finite vocabulary that turns an intimidating red block into a starting point. Genuinely a recall skill.",
        prerequisites: ["function-declaration"], weight: "core",
        demands: ["recall", "recognise"]
    },
    {
        id: "throwing", topic: "errors", label: "Throwing Errors",
        objective: "raise an error deliberately when something is wrong",
        meaning: "throw stops the current work immediately and hands an error up to the caller",
        why: "Errors are not only things that happen to you. Writing one is how a function refuses bad input honestly.",
        prerequisites: ["error-types", "guard-clauses"], weight: "core",
        demands: ["recognise", "predict"]
    },
    {
        id: "try-catch", topic: "errors", label: "Handling Errors with `try` and `catch`",
        objective: "catch a failure and decide what should happen next",
        meaning: "try runs risky code; catch receives the error if it fails; finally runs either way",
        why: "Control flow that jumps rather than falls through, which is genuinely new and has to be traced rather than read.",
        prerequisites: ["throwing"], weight: "core",
        demands: ["predict", "explain"]
    },
    {
        id: "stack-traces", topic: "errors", label: "Reading Stack Traces",
        objective: "read a stack trace and find where to look first",
        meaning: "a stack trace lists the calls that were in progress, most recent first",
        why: "The difference between debugging and guessing. Most beginners never learn to read past the first line.",
        prerequisites: ["error-types"], weight: "core",
        demands: ["recognise", "diagnose", "explain"]
    },
    {
        id: "debugging-strategy", topic: "errors", label: "Debugging Systematically",
        objective: "narrow down a failure instead of changing things at random",
        meaning: "form a hypothesis, make one change that tests it, and keep what you learn",
        why: "The only concept in the curriculum that is a method rather than a feature, and the one that compounds most.",
        prerequisites: ["stack-traces"], weight: "load-bearing",
        demands: ["diagnose", "repair", "explain"]
    },

    /* ------------------------------------------------------------- dom */
    {
        id: "selecting-elements", topic: "dom", label: "Selecting DOM Elements",
        objective: "get hold of an element on the page",
        meaning: "a selector finds elements in the document the same way CSS does",
        why: "Nothing else in the topic is reachable without it, and a null result is the first DOM bug everyone meets.",
        prerequisites: ["object-access"], weight: "core",
        demands: ["recognise", "predict"]
    },
    {
        id: "element-properties", topic: "dom", label: "Reading and Changing Element Properties",
        objective: "read and change what an element shows",
        meaning: "an element is an object whose properties describe and control what is on screen",
        why: "Makes the page concrete as data rather than as markup, which is the shift the whole topic depends on.",
        prerequisites: ["selecting-elements"], weight: "core",
        demands: ["predict", "explain"]
    },
    {
        id: "event-listeners", topic: "dom", label: "Handling Events with Listeners",
        objective: "run a function when something happens on the page",
        meaning: "a listener hands a function to the browser to call later",
        why: "The first place functions-as-values pays off visibly, and the first place calling instead of passing breaks something you can see.",
        prerequisites: ["functions-as-values", "selecting-elements"], weight: "load-bearing",
        demands: ["recognise", "predict", "diagnose"]
    },
    {
        id: "event-order", topic: "dom", label: "Event Bubbling Order",
        objective: "predict the order handlers run in when elements are nested",
        meaning: "an event travels down to the target and then back up through its ancestors",
        why: "Explains handlers that seem to fire twice or in the wrong order, and it is pure sequencing practice.",
        prerequisites: ["event-listeners"], weight: "core",
        demands: ["predict", "explain"]
    },
    {
        id: "dom-as-tree", topic: "dom", label: "Navigating the DOM Tree",
        objective: "move between an element and its parents, children and siblings",
        meaning: "the document is a tree of nodes, and every element sits somewhere in it",
        why: "The mental model that makes traversal, delegation and bubbling one idea rather than three.",
        prerequisites: ["selecting-elements", "nested-objects"], weight: "core",
        demands: ["recognise", "explain"]
    },

    /* ----------------------------------------------------------- async */
    {
        id: "callbacks", topic: "async", label: "Using Callbacks",
        objective: "pass a function to be run after something finishes",
        meaning: "a callback is a function handed over now to be called at some later point",
        why: "The oldest async pattern and still the one underneath the others. Timers make later visible before promises make it abstract.",
        prerequisites: ["functions-as-values"], weight: "load-bearing",
        demands: ["predict", "diagnose", "repair"]
    },
    {
        id: "promise-states", topic: "async", label: "Promise States",
        objective: "say what state a promise is in and what that means for your code",
        meaning: "a promise is pending until it settles, either fulfilled with a value or rejected with a reason",
        why: "A promise is an object with a lifecycle, not a value. Until that lands, awaiting it looks arbitrary.",
        prerequisites: ["callbacks"], weight: "load-bearing",
        demands: ["recognise", "predict", "explain"]
    },
    {
        id: "event-loop", topic: "async", label: "Ordering Work with the Event Loop",
        objective: "order synchronous and asynchronous output correctly",
        meaning: "all synchronous code finishes first, then queued work runs",
        why: "The single mental model that makes every async surprise predictable rather than mysterious.",
        prerequisites: ["promise-states"], weight: "load-bearing",
        demands: ["predict", "produce", "explain"]
    },
    {
        id: "async-await", topic: "async", label: "Writing `async`/`await` Code",
        objective: "write asynchronous code that reads like ordinary code",
        meaning: "await pauses inside an async function until the promise settles",
        why: "The form almost all modern async code takes, and forgetting the await is a bug that returns a promise instead of a value.",
        prerequisites: ["promise-states"], weight: "load-bearing",
        demands: ["recognise", "predict", "produce", "diagnose", "repair", "explain"]
    },
    {
        id: "error-propagation", topic: "async", label: "Handling Async Errors",
        objective: "catch a failure that happens inside asynchronous work",
        meaning: "a rejected promise travels until something catches it, and an uncaught one is lost",
        why: "try-catch around a non-awaited promise catches nothing, which is one of the most confusing silent failures in the language.",
        prerequisites: ["async-await", "try-catch"], weight: "load-bearing",
        demands: ["predict", "diagnose", "repair", "explain"]
    },
    {
        id: "promise-all", topic: "async", label: "Running Promises in Parallel",
        objective: "run several asynchronous tasks at once instead of in sequence",
        meaning: "Promise.all waits for every promise, and rejects as soon as any one of them does",
        why: "The difference between awaiting in a loop and awaiting together is the difference between slow and fast code.",
        prerequisites: ["async-await"], weight: "core",
        demands: ["predict", "produce", "explain"]
    },

    /* ------------------------------------------------ this-and-classes */
    {
        id: "this-binding", topic: "this-and-classes", label: "What `this` Refers To",
        objective: "say what this refers to at a given call site",
        meaning: "this is decided by how a function is called, not where it was written",
        why: "The most notorious rule in the language, and the reason detached methods lose their object.",
        prerequisites: ["object-access", "functions-as-values"], weight: "load-bearing",
        demands: ["predict", "diagnose", "repair", "explain"]
    },
    {
        id: "methods", topic: "this-and-classes", label: "Writing Object Methods",
        objective: "write a function that belongs to an object and uses its data",
        meaning: "a method is a function stored on an object, able to reach the rest of it through this",
        why: "The bridge from data-only objects to objects that do something, which is where classes start to make sense.",
        prerequisites: ["this-binding"], weight: "core",
        demands: ["recognise", "predict"]
    },
    {
        id: "classes", topic: "this-and-classes", label: "Defining Classes",
        objective: "define a class and create instances from it",
        meaning: "a class describes how to build objects that share the same methods",
        why: "The standard way to express a type of thing in modern JavaScript, and a requirement for reading almost any real codebase.",
        prerequisites: ["methods"], weight: "core",
        demands: ["recognise", "predict", "produce"]
    },
    {
        id: "prototypes", topic: "this-and-classes", label: "Prototypes and Method Lookup",
        objective: "explain where a method actually lives when you call it",
        meaning: "objects delegate to a prototype when they do not have a property themselves",
        why: "Classes are a surface over this. Knowing what is underneath explains shared methods and a whole class of surprising lookups.",
        prerequisites: ["classes"], weight: "core",
        demands: ["recognise", "explain"]
    },
    {
        id: "inheritance", topic: "this-and-classes", label: "Extending Classes with Inheritance",
        objective: "extend a class and override part of it",
        meaning: "extends builds one class on another, and super reaches the version above",
        why: "Common in frameworks and libraries, and the place where prototype delegation becomes visible in ordinary code.",
        prerequisites: ["prototypes"], weight: "core",
        demands: ["predict", "explain"]
    },

    /* ------------------------------------------------------ algorithms */
    {
        id: "recursion", topic: "algorithms", label: "Writing Recursive Functions",
        objective: "write and follow a function that calls itself",
        meaning: "a recursive function solves a smaller version of the same problem until it cannot get smaller",
        why: "The natural shape for trees and nested data, and following the call stack is the clearest possible test of how functions really work.",
        prerequisites: ["return-values", "nested-arrays"], weight: "core",
        demands: ["predict", "produce", "diagnose"]
    },
    {
        id: "base-cases", topic: "algorithms", label: "Writing Recursive Base Cases",
        objective: "write the condition that stops a recursion",
        meaning: "the base case is the input that returns an answer without recursing again",
        why: "A missing or wrong base case is the only way recursion fails, so it deserves to be practiced as its own skill.",
        prerequisites: ["recursion"], weight: "core",
        demands: ["diagnose", "repair", "explain"]
    },
    {
        id: "search-strategies", topic: "algorithms", label: "Choosing Search Strategies",
        objective: "choose a search approach that suits the data you have",
        meaning: "a sorted list can be searched by halving it repeatedly instead of checking every item",
        why: "The first clear demonstration that the same result can cost wildly different amounts of work.",
        prerequisites: ["loop-conditions", "array-indexing"], weight: "core",
        demands: ["predict", "explain"]
    },
    {
        id: "sorting-basics", topic: "algorithms", label: "How Sorting Algorithms Work",
        objective: "follow a simple sorting algorithm through its passes",
        meaning: "sorting repeatedly compares and moves items until nothing is out of order",
        why: "Makes the built-in sort stop being magic, and is the most traceable multi-pass algorithm there is.",
        prerequisites: ["nested-loops", "sort"], weight: "light",
        demands: ["predict", "explain"]
    },
    {
        id: "complexity", topic: "algorithms", label: "Estimating Time Complexity",
        objective: "say roughly how the work grows as the input grows",
        meaning: "complexity describes how the work scales with input size, not how long it takes",
        why: "The vocabulary for a judgement good engineers make constantly, and the reason nested loops matter beyond their output.",
        prerequisites: ["nested-loops", "search-strategies"], weight: "core",
        demands: ["recall", "explain"]
    }
];

/* --------------------------------------------------------------- lookups */

const CONCEPTS_BY_ID = new Map(CONCEPTS.map((c) => [c.id, c]));
const TOPICS_BY_ID = new Map(TOPICS.map((t) => [t.id, t]));

export function conceptById(id: ConceptId): Concept | null {
    return CONCEPTS_BY_ID.get(id) ?? null;
}

export function topicById(id: TopicId): Topic | null {
    return TOPICS_BY_ID.get(id) ?? null;
}

export function conceptsInTopic(id: TopicId): readonly Concept[] {
    return CONCEPTS.filter((c) => c.topic === id);
}

/** The tier a concept inherits from its topic. Concepts never carry their own. */
export function tierOf(concept: Concept): Tier {
    return TOPICS_BY_ID.get(concept.topic)!.tier;
}

/**
 * The difficulty a challenge would get at this demand.
 *
 * Throws rather than guessing when the concept does not declare the demand: a
 * challenge at an undeclared demand is a content error, and returning a number
 * for it would let one through.
 */
export function difficultyOf(concept: Concept, demand: Demand): Difficulty {
    if (!concept.demands.includes(demand)) {
        throw new Error(`${concept.id} does not declare the demand "${demand}"`);
    }

    return difficultyFor(tierOf(concept), demand);
}

/** The hardest challenge this concept can ever produce. Its declared cap. */
export function maxDifficultyOf(concept: Concept): Difficulty {
    return concept.demands
        .map((d) => difficultyFor(tierOf(concept), d))
        .reduce((a, b) => (b > a ? b : a), 1 as Difficulty);
}

/** Topics in teaching order: prerequisites first, then declaration order. */
export function topicOrder(): readonly Topic[] {
    const done = new Set<TopicId>();
    const out: Topic[] = [];

    while (out.length < TOPICS.length) {
        const next = TOPICS.filter(
            (t) => !done.has(t.id) && t.prerequisites.every((p) => done.has(p))
        );

        if (next.length === 0) {
            throw new Error("topic prerequisites contain a cycle");
        }

        for (const t of next) {
            done.add(t.id);
            out.push(t);
        }
    }

    return out;
}
