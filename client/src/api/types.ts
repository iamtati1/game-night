// Mirrors the server's JSON contracts. Hand-maintained for now: a shared types
// package is deliberately deferred until there is a second consumer.

export interface PublicUser {
    id: string;
    username: string;
    email: string;
    createdAt: string;
}

export interface QuestionOption {
    id: string;
    text: string;
}

export interface ServedQuestion {
    sessionQuestionId: string;
    /** Curriculum unit, so the client can name what is being practiced. */
    topic: string | null;
    /**
     * Set by the SERVER when this beat is practice for the concept the learner
     * is currently on. Null otherwise. The client never works this out -- what
     * a learner is learning is not the browser's to decide.
     */
    practisingNow: { conceptSlug: string; conceptName: string; demandSlug: string } | null;
    /** Which mechanic answers it: pick one option, or assemble tokens into a gap. */
    challengeType: string;
    questionNumber: number;
    totalQuestions: number;
    prompt: string;
    options: QuestionOption[];
    servedAt: string;
    /** Null when this beat has no clock -- the opening of a Code Blitz round. */
    deadlineAt: string | null;
    msRemaining: number | null;
}

export interface SessionQuestionResult {
    displayOrder: number;
    prompt: string;
    /** Curriculum unit, for the topic breakdown on the results screen. */
    topic: string | null;
    /** Why the answer is what it is. The teaching, carried into the review. */
    explanation: string | null;
    status: "pending" | "answered" | "timed_out";
    selectedOption: string | null;
    correctOption: string | null;
    isCorrect: boolean | null;
    responseTimeMs: number | null;
    pointsAwarded: number;
}

export interface RunMetrics {
    /** Longest unbroken run of successes within this game. */
    bestStreak: number;
    /** Share of units got right, 0-1. Timeouts count against it. */
    successRate?: number | null;
    /** Typical time per answered unit. Absent where it would not represent
     *  performance -- see the Flush summary. */
    averageResponseMs?: number | null;
}

export interface SessionSummary extends RunMetrics {
    id: string;
    status: string;
    score: number;
    xpEarned: number;
    startedAt: string;
    completedAt: string | null;
    totalQuestions: number;
    correctCount: number;
    incorrectCount: number;
    timedOutCount: number;
    questions: SessionQuestionResult[];
}

export interface StartSessionResponse {
    resumed: boolean;
    sessionId?: string;
    /** Server-computed points banked so far. The client never tallies its own. */
    scoreSoFar?: number;
    question?: ServedQuestion | null;
    session?: SessionSummary;
    /**
     * Set INSTEAD of a session when the learner has not met enough of the
     * curriculum for a round to be dealt yet.
     *
     * Practice is withheld until its concept has been encountered, so an early
     * learner's pool is genuinely empty -- not broken. The server answers with
     * the concept to meet next rather than an error, in the same shape GET
     * /api/curriculum/introduction uses, and the page shows that Learn Beat
     * before trying again. `sessionId` and `question` are absent here.
     */
    introduction?: Introduction;
}

export interface CurrentQuestionResponse {
    complete: boolean;
    sessionId?: string;
    scoreSoFar?: number;
    question?: ServedQuestion;
    session?: SessionSummary;
}

export interface AnswerResponse {
    outcome: "correct" | "incorrect" | "timed_out";
    pointsAwarded: number;
    scoreSoFar: number;
    responseTimeMs?: number;
    correctOption: string;
    /** One line on why. Null for questions written before explanations existed. */
    explanation: string | null;
    complete: boolean;
    question: ServedQuestion | null;
    session: SessionSummary | null;
}

export interface FieldError {
    field: string;
    message: string;
}

export interface GameRef {
    slug: string;
    name: string;
}

/** Game-agnostic round summary: Code Blitz counts questions, Flush counts rounds. */
export interface Progress {
    total: number;
    correct: number;
    incorrect: number;
    timedOut: number;
}

export interface HistorySession {
    id: string;
    game: GameRef;
    /** "paused" has been possible since the pause lifecycle landed; it was
     *  missing here, so a paused row fell through to the in-progress branch by
     *  luck rather than by intent. */
    status: "completed" | "abandoned" | "in_progress" | "paused";
    /** Stored value. 0 for abandoned/in-progress games, which the UI shows as "—". */
    score: number;
    xpEarned: number;
    startedAt: string;
    endedAt: string | null;
    progress: Progress;
}

export interface HistoryResponse {
    sessions: HistorySession[];
    pagination: {
        limit: number;
        offset: number;
        total: number;
        hasMore: boolean;
    };
}

// ---------------------------------------------------------------- Flush ----
// Note what is absent from FlushTile: `position`. Position IS the answer, so the
// server withholds it until a round ends. The client cannot derive it either.

export interface FlushTile {
    id: string;
    text: string;
}

export interface FlushRound {
    /** This round's window, which scales with its output count. */
    limitMs?: number;
    roundId: string;
    roundNumber: number;
    totalRounds: number;
    prompt: string;
    tiles: FlushTile[];
    /** Tiles already placed this round, in the order they were placed. */
    placed: { outputId: string; text: string }[];
    totalOutputs: number;
    pointsBanked: number;
    servedAt: string;
    deadlineAt: string;
    msRemaining: number;
}

export interface FlushRoundResult {
    roundNumber: number;
    prompt: string;
    status: "pending" | "completed" | "failed" | "timed_out";
    correctPlacements: number;
    totalOutputs: number;
    pointsAwarded: number;
}

export interface FlushSessionSummary extends RunMetrics {
    id: string;
    status: string;
    score: number;
    xpEarned: number;
    startedAt: string;
    completedAt: string | null;
    totalRounds: number;
    completedRounds: number;
    failedRounds: number;
    timedOutRounds: number;
    rounds: FlushRoundResult[];
}

export interface FlushStartResponse {
    resumed: boolean;
    sessionId?: string;
    scoreSoFar?: number;
    round?: FlushRound | null;
    session?: FlushSessionSummary;
}

export interface FlushCurrentResponse {
    complete: boolean;
    sessionId?: string;
    scoreSoFar?: number;
    round?: FlushRound;
    session?: FlushSessionSummary;
}

export interface FlushPlacementResponse {
    outcome: "correct" | "wrong" | "round_complete" | "timed_out";
    roundEnded: boolean;
    pointsBanked: number;
    /** What the round is finally worth. null while the round is still live. */
    roundScore: number | null;
    scoreSoFar: number;
    /** Both revealed only once the round has ended. */
    correctSequence: string[] | null;
    yourSequence: string[] | null;
    /**
     * Why the outputs land in that order. Null for a snippet with no authored
     * reason, and while the round is still live.
     *
     * The sequences above say WHAT the order was; only this says why -- which
     * is the difference between a reveal that teaches and one that only
     * confirms what a learner already knew.
     */
    explanation: string | null;
    /**
     * True when this round cleared a curriculum rung.
     *
     * Flush is playable by everyone, but only credits a rung once the learner
     * has actually reached the concept -- so this is false for most players
     * most of the time, and that is correct rather than a failure.
     */
    credited: boolean;
    complete: boolean;
    round: FlushRound | null;
    session: FlushSessionSummary | null;
}

/** The 409 body both games return when another game is already running. */
export interface ActiveGameConflictBody {
    activeGame?: { slug: string; name: string };
}

export interface AbandonResponse {
    abandoned: boolean;
    sessionId?: string;
    game?: { slug: string; name: string };
    /** Which status it was quit from, so the caller can word the outcome. */
    previousStatus?: "in_progress" | "paused";
}

/** Pulls activeGame out of a 409 body, or null if this was a different error. */
export function activeGameFrom(body: unknown): { slug: string; name: string } | null {
    const candidate = (body as ActiveGameConflictBody | null)?.activeGame;

    return candidate && typeof candidate.slug === "string" ? candidate : null;
}

/** One unfinished run, from GET /api/me/sessions/resumable. */
export interface ResumableSession {
    id: string;
    game: GameRef;
    status: "in_progress" | "paused";
    score: number;
    unitsDone: number;
    unitsTotal: number;
    pauseCount: number;
    startedAt: string;
    pausedAt: string | null;
}

export interface ResumableResponse {
    sessions: ResumableSession[];
}

/** One metric's recent form against the form before it, from the stats endpoint. */
export interface MetricTrend {
    previous: number | null;
    recent: number | null;
    changePercent: number | null;
}

export interface GameImprovement {
    bestStreak: number;
    averageMs: number | null;
    trend: { successRate: MetricTrend; speed: MetricTrend } | null;
}

export interface GameStatsEntry {
    game: GameRef;
    gamesCompleted: number;
    bestScore: number | null;
    accuracy: number | null;
    improvement: GameImprovement | null;
}

export interface UserStatsResponse {
    totals: { gamesCompleted: number; totalXp: number; totalScore: number };
    perGame: GameStatsEntry[];
}

/* ---------------------------------------------------------------- reaction -- */

export interface ReactionTier {
    key: "lightning" | "incredible" | "fast" | "solid" | "sharp";
    label: string;
}

export interface ReactionRoundRef {
    roundId: string;
    roundNumber: number;
    totalRounds: number;
}

export interface ReactionRoundResult {
    roundNumber: number;
    status: "pending" | "reacted" | "false_start";
    reactionMs: number | null;
    tier: ReactionTier | null;
    pointsAwarded: number;
}

export interface ReactionSessionSummary extends RunMetrics {
    id: string;
    status: string;
    score: number;
    xpEarned: number;
    startedAt: string;
    completedAt: string | null;
    totalRounds: number;
    reactedRounds: number;
    falseStarts: number;
    bestReactionMs: number | null;
    averageReactionMs: number | null;
    tier: ReactionTier | null;
    rounds: ReactionRoundResult[];
}

export interface ReactionStartResponse {
    resumed: boolean;
    sessionId?: string;
    scoreSoFar?: number;
    round?: ReactionRoundRef | null;
    session?: ReactionSessionSummary;
}

export interface ReactionRoundResponse {
    outcome: "reacted" | "false_start";
    reactionMs: number | null;
    tier: ReactionTier | null;
    pointsAwarded: number;
    scoreSoFar: number;
    complete: boolean;
    round: ReactionRoundRef | null;
    session: ReactionSessionSummary | null;
}

/* ------------------------------------------------------------------ memory -- */

export interface MemoryRoundRef {
    roundId: string;
    roundNumber: number;
    totalRounds: number;
    /** The sequence to hold. Sent because showing it is the game. */
    sequence: string[];
    displayMs: number;
}

export interface MemoryRoundResult {
    roundNumber: number;
    status: "pending" | "answered";
    length: number;
    /** Null until the round is answered. */
    sequence: string[] | null;
    submitted: string[] | null;
    correct: number | null;
    perfect: boolean;
    pointsAwarded: number;
}

export interface MemorySessionSummary {
    id: string;
    status: string;
    score: number;
    xpEarned: number;
    startedAt: string;
    completedAt: string | null;
    totalRounds: number;
    perfectRounds: number;
    bestStreak: number;
    recallAccuracy: number | null;
    bestSequenceLength: number | null;
    symbolsRemembered: number;
    symbolsShown: number;
    rounds: MemoryRoundResult[];
}

export interface MemoryStartResponse {
    resumed: boolean;
    sessionId?: string;
    scoreSoFar?: number;
    round?: MemoryRoundRef | null;
    session?: MemorySessionSummary;
}

export interface MemorySubmitResponse {
    correct: number;
    perfect: boolean;
    length: number;
    sequence: string[];
    submitted: string[];
    pointsAwarded: number;
    scoreSoFar: number;
    complete: boolean;
    round: MemoryRoundRef | null;
    session: MemorySessionSummary | null;
}

/* ---------------------------------------------------------------- Bug Hunt */

export interface BugHuntOption {
    id: string;
    text: string;
    /** Set for find_line incidents, null for choose_patch. Which one it is
     *  decides how the incident is played, so it drives the renderer. */
    lineNumber: number | null;
}

export type BugHuntChallengeType = "find_line" | "choose_patch";

export interface IncidentConcept {
    slug: string;
    name: string;
    /** The one-line rule, authored once in the curriculum. */
    meaning: string;
    objective: string;
    demand: string;
}

export interface BugHuntIncident {
    roundId: string;
    incidentNumber: number;
    totalIncidents: number;
    isBoss: boolean;
    title: string;
    theme: string;
    bugReport: string;
    errorLog: string | null;
    challengeType: string;
    code: string;
    codeLanguage: string;
    difficulty: number;
    /**
     * What the curriculum says this incident teaches, or null for a legacy
     * incident with no challenge attached.
     *
     * Its presence is what switches the page to the beginner layout: the code
     * carries the problem, and one line of expectation replaces the theme,
     * severity, title and incident report.
     */
    concept: IncidentConcept | null;
    options: BugHuntOption[];
    /** Null on an untimed opening hunt. */
    timeLimitMs: number | null;
    /** What is actually left, from the server's own clock. A refresh or a resume
     *  picks up here rather than restarting the countdown. */
    remainingMs: number | null;
    attemptsRemaining: number;
    hintsUsed: number;
    /** A count. The text arrives one rung at a time, from the server. */
    hintsAvailable: number;
}

export interface BugHuntLiveResponse {
    resumed?: boolean;
    complete: false;
    sessionId: string;
    scoreSoFar: number;
    systemIntegrity: number;
    /** The streak carried into this hunt, so a refresh does not appear to lose it. */
    streak: number;
    incident: BugHuntIncident;
}

export interface BugHuntCompleteResponse {
    resumed?: boolean;
    complete: true;
    session: BugHuntSessionSummary;
}

export type BugHuntCurrentResponse = BugHuntLiveResponse | BugHuntCompleteResponse;

export interface BugHuntHintResponse {
    action: "reveal-hint";
    hint: { order: number; text: string };
    hintsUsed: number;
    hintsRemaining: number;
    systemIntegrity: number;
}

export interface BugHuntDiagnosisResponse {
    action: "diagnose";
    outcome: "resolved" | "retry" | "failed";
    correct: boolean;
    explanation: string;
    attemptsRemaining: number;
    pointsAwarded: number;
    streak: number;
    scoreSoFar: number;
    systemIntegrity: number;
    complete: boolean;
    session: BugHuntSessionSummary | null;
}

export interface BugHuntIncidentResult {
    incidentNumber: number;
    isBoss: boolean;
    title: string;
    theme: string;
    bugCategory: string;
    difficulty: number;
    status: "pending" | "resolved" | "failed";
    attempts: number;
    hintsUsed: number;
    resolutionMs: number | null;
    code: string;
    codeLanguage: string;
    bugReport: string;
    correctOption: string | null;
    explanation: string | null;
    selectedOption: string | null;
    pointsAwarded: number;
}

export interface BugHuntSessionSummary {
    id: string;
    status: string;
    score: number;
    xpEarned: number;
    startedAt: string;
    completedAt: string | null;
    totalIncidents: number;
    incidentsResolved: number;
    firstTryFixes: number;
    hintsUsed: number;
    bestStreak: number;
    averageResolutionMs: number | null;
    systemIntegrity: number;
    incidents: BugHuntIncidentResult[];
    byCategory: { category: string; seen: number; resolved: number }[];
}

/**
 * A curriculum concept the learner has not been introduced to yet.
 *
 * Chosen entirely by the server: an active `introduce` challenge whose
 * prerequisites are satisfied and which this learner has not completed. The
 * client renders it and reports the acknowledgement back; it never decides
 * whether a concept is reachable or due.
 */
export interface Introduction {
    challengeId: string;
    conceptSlug: string;
    conceptName: string;
    /** Completes "I know how to ___". */
    objective: string;
    /** The one-line rule, authored in the curriculum. */
    meaning: string;
    topicSlug: string;
}

export interface IntroductionResponse {
    /** Null when the learner has met everything currently reachable. */
    introduction: Introduction | null;
}

/** Where the learner stands on one concept of the topic they are working on. */
export interface ConceptStanding {
    slug: string;
    name: string;
    objective: string;
    status: "done" | "current" | "upcoming";
}

export interface TopicStandingResponse {
    topic: string;
    concepts: ConceptStanding[];
    /** The one they are on now, or null once the topic is complete. */
    current: ConceptStanding | null;
}

/** One concept on the JavaScript Journey. */
export interface JourneyConcept {
    slug: string;
    name: string;
    objective: string;
    state: "demonstrated" | "current" | "locked";
    neededRetry: boolean;
    /**
     * How much of this concept is done, derived server-side from the same
     * evidence that clears a rung anywhere else. `playable` counts only rungs
     * something actually fills, so 0 means there is nothing to do here yet.
     */
    rungs: { cleared: number; playable: number };
}

export interface JourneyTopic {
    slug: string;
    name: string;
    /** The JavaScript idea the topic establishes. Empty until authored. */
    principle: string;
    order: number;
    state: "complete" | "current" | "locked";
    concepts: JourneyConcept[];
    /** The cumulative checkpoint, or null for a topic with none authored. */
    challenge: { state: "demonstrated" | "current" | "locked" } | null;
}

export interface JourneyPathResponse {
    topics: JourneyTopic[];
    /** The one concept the learner is on, or null once everything is done. */
    current: (JourneyConcept & { topic: string }) | null;
    /** Earned by demonstrating understanding. Derived, so it cannot be farmed. */
    points: { total: number; concepts: number; challenges: number };
}
