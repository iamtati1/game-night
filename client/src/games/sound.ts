import { useSyncExternalStore } from "react";

/**
 * Jolt's sound effects: a handful of short cues, generated, never required.
 *
 * GENERATED, NOT FILES. Every cue is two or three notes from a Web Audio
 * oscillator with a soft envelope. There are no audio assets to load, license
 * or cache, nothing remote, and no library -- and nothing at all happens until
 * a cue is actually played.
 *
 * NEVER THE ONLY SIGNAL. Every cue accompanies feedback that is already on
 * screen in words (Correct, Not quite, the hint text, the results). Muted, or
 * in a browser without audio, the game is exactly the same game.
 *
 * NO AUTOPLAY. The AudioContext is created on the learner's first click or key
 * press after sound is on (browsers refuse audio before a gesture), and every
 * call is wrapped: a missing API, a refused context or an interrupted note is
 * silence, never an error.
 *
 * DEDUPED. A cue can carry a key (a question or round id); the same key never
 * plays twice, so a re-render or a repeated event cannot double a sound. Two
 * identical unkeyed cues inside 80ms collapse into one.
 *
 * The preference is a per-device convenience in localStorage under
 * "jolt.sound", like the relaxed/timed pace. It is not account state.
 */
export type Cue =
    /** A deliberate commitment, e.g. starting a run. Used sparingly. */
    | "select"
    | "correct"
    /** Gentle and low: a nudge, not a buzzer. */
    | "incorrect"
    | "hint"
    /** A game or lesson finished. */
    | "complete"
    /** Something new opened: a concept demonstrated, a stop cleared. */
    | "milestone"
    /** Reaction: the signal to hit now. Crisp and immediate. */
    | "signal"
    /** Reaction: moved before the signal. */
    | "early"
    /** Flush: one output tile placed in the right order. Lighter than correct. */
    | "place";

const KEY = "jolt.sound";

type Note = { f: number; at: number; dur: number; type?: OscillatorType; gain?: number };

/* Pitches in Hz. Kept in one pentatonic family so the cues sound related. */
const CUES: Record<Cue, Note[]> = {
    select: [{ f: 660, at: 0, dur: 0.05, gain: 0.35 }],
    // A chime: two quick rising notes, the second with a quiet octave shimmer.
    correct: [
        { f: 784, at: 0, dur: 0.1 },
        { f: 1175, at: 0.075, dur: 0.22 },
        { f: 2349, at: 0.075, dur: 0.18, gain: 0.12 }
    ],
    // Soft and low, falling a step: "not that one", never a buzzer.
    incorrect: [
        { f: 392, at: 0, dur: 0.12, type: "triangle", gain: 0.6 },
        { f: 330, at: 0.1, dur: 0.2, type: "triangle", gain: 0.5 }
    ],
    // A light two-note confirmation when a hint is revealed.
    hint: [
        { f: 880, at: 0, dur: 0.07, gain: 0.45 },
        { f: 1047, at: 0.06, dur: 0.1, gain: 0.4 }
    ],
    // Finishing: an arpeggio that lands on a held chord.
    complete: [
        { f: 523, at: 0, dur: 0.12 },
        { f: 659, at: 0.1, dur: 0.12 },
        { f: 784, at: 0.2, dur: 0.12 },
        { f: 1047, at: 0.3, dur: 0.45, gain: 0.7 },
        { f: 659, at: 0.3, dur: 0.45, gain: 0.35 },
        { f: 784, at: 0.3, dur: 0.45, gain: 0.35 }
    ],
    // Something opened: brighter and a little longer than finishing.
    milestone: [
        { f: 659, at: 0, dur: 0.1 },
        { f: 784, at: 0.09, dur: 0.1 },
        { f: 988, at: 0.18, dur: 0.1 },
        { f: 1319, at: 0.27, dur: 0.5, gain: 0.7 },
        { f: 988, at: 0.27, dur: 0.5, gain: 0.3 },
        { f: 2637, at: 0.27, dur: 0.35, gain: 0.08 }
    ],
    // Reaction's timing cue: crisp, short, immediate.
    signal: [{ f: 1047, at: 0, dur: 0.08, type: "square", gain: 0.3 }],
    early: [{ f: 196, at: 0, dur: 0.16, type: "triangle", gain: 0.6 }],
    // Flush: a quiet tick per tile, rising with the position placed.
    place: [{ f: 988, at: 0, dur: 0.06, gain: 0.35 }]
};

/** Master level. Quiet on purpose: effects sit under the learner's attention. */
const VOLUME = 0.14;

/* ---------------------------------------------------------- preference */

function prefersReducedMotion(): boolean {
    try {
        return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    } catch {
        return false;
    }
}

function readEnabled(): boolean {
    try {
        const stored = window.localStorage.getItem(KEY);
        if (stored === "on") return true;
        if (stored === "off") return false;
    } catch {
        // Storage unavailable: fall through to the default.
    }
    // No choice yet: on, unless the system asks for less distraction.
    return !prefersReducedMotion();
}

let enabled = typeof window === "undefined" ? false : readEnabled();
const listeners = new Set<() => void>();

export function soundEnabled(): boolean {
    return enabled;
}

export function setSoundEnabled(next: boolean): void {
    enabled = next;
    try {
        window.localStorage.setItem(KEY, next ? "on" : "off");
    } catch {
        // The choice still applies to this visit.
    }
    if (next) unlock();
    listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** The preference as React state, shared by every component that reads it. */
export function useSoundEnabled(): boolean {
    return useSyncExternalStore(subscribe, soundEnabled, () => false);
}

/* ------------------------------------------------------------- engine */

let ctx: AudioContext | null = null;
let failed = false;

function context(): AudioContext | null {
    if (ctx || failed) return ctx;
    try {
        const Ctor =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) {
            failed = true;
            return null;
        }
        ctx = new Ctor();
    } catch {
        failed = true;
        ctx = null;
    }
    return ctx;
}

/** Creates or wakes the context. Only ever called from a user gesture. */
function unlock(): void {
    if (!enabled) return;
    const c = context();
    if (c && c.state === "suspended") void c.resume().catch(() => undefined);
}

if (typeof window !== "undefined") {
    // Capture phase, so the context exists before the click's own handler
    // plays the first cue. Cheap after the first call: it returns at once.
    const onGesture = () => unlock();
    window.addEventListener("pointerdown", onGesture, true);
    window.addEventListener("keydown", onGesture, true);
}

let lastKey: string | null = null;
const lastAt = new Map<Cue, number>();

/**
 * Plays a cue if sound is on. `key` names the event (a question, a round):
 * the same key is never played twice, which is what stops a re-render or a
 * repeated response from doubling a sound. Use it where an effect could run
 * again; a cue fired once from an event handler or timer needs no key -- and
 * must not have one when the same id can legitimately come round again (a
 * Reaction round re-dealt after an interruption keeps its id).
 */
export function play(cue: Cue, key?: string): void {
    if (!enabled) return;
    if (key !== undefined) {
        const k = `${cue}:${key}`;
        if (k === lastKey) return;
        lastKey = k;
    }

    // An unkeyed cue has no identity to dedupe on, so two identical ones in
    // the same instant (a double-fired handler) collapse into one.
    if (key === undefined) {
        const now = Date.now();
        if (now - (lastAt.get(cue) ?? 0) < 80) return;
        lastAt.set(cue, now);
    }

    const c = context();
    // Not yet allowed (no gesture) or not available: stay silent.
    if (!c || c.state !== "running") return;

    try {
        const out = c.createGain();
        out.gain.value = VOLUME;
        out.connect(c.destination);
        const t0 = c.currentTime + 0.005;

        for (const n of CUES[cue]) {
            const osc = c.createOscillator();
            const env = c.createGain();
            osc.type = n.type ?? "sine";
            osc.frequency.value = n.f;
            const start = t0 + n.at;
            const peak = n.gain ?? 1;
            env.gain.setValueAtTime(0.0001, start);
            env.gain.exponentialRampToValueAtTime(peak, start + 0.012);
            env.gain.exponentialRampToValueAtTime(0.0001, start + n.dur);
            osc.connect(env).connect(out);
            osc.start(start);
            osc.stop(start + n.dur + 0.02);
        }
    } catch {
        // An interrupted or refused note is silence, never an error.
    }
}

/** Test seam: forget the engine and the dedupe memory. */
export function resetSoundForTests(): void {
    ctx = null;
    failed = false;
    lastKey = null;
    lastAt.clear();
    enabled = readEnabled();
    listeners.forEach((l) => l());
}
