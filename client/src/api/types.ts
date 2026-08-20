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

export interface HistorySession {
    id: string;
    status: "completed" | "abandoned" | "in_progress";
    /** Stored value. 0 for abandoned/in-progress games, which the UI shows as "—". */
    score: number;
    xpEarned: number;
    startedAt: string;
    endedAt: string | null;
    totalQuestions: number;
    correctCount: number;
    incorrectCount: number;
    timedOutCount: number;
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
