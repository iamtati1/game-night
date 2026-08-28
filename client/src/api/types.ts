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
    questionNumber: number;
    totalQuestions: number;
    prompt: string;
    options: QuestionOption[];
    servedAt: string;
    deadlineAt: string;
    msRemaining: number;
}

export interface SessionQuestionResult {
    displayOrder: number;
    prompt: string;
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
