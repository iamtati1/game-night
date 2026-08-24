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

export interface SessionSummary {
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
    status: "completed" | "abandoned" | "in_progress";
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

export interface FlushSessionSummary {
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
