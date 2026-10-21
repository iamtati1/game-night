import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { play, resetSoundForTests, setSoundEnabled, soundEnabled } from "./sound.js";

/**
 * Jolt's sound effects: optional, remembered, never doubled, never an error.
 *
 * A fake AudioContext counts the oscillators each cue starts, so these tests
 * can say "this played once", "this stayed silent" without real audio.
 */
let started = 0;
let resumed = 0;
let ctorCalls = 0;

class FakeContext {
    state: "suspended" | "running" = "running";
    currentTime = 0;
    destination = {};
    constructor() {
        ctorCalls += 1;
    }
    resume() {
        resumed += 1;
        this.state = "running";
        return Promise.resolve();
    }
    createGain() {
        return { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n: unknown) => n };
    }
    createOscillator() {
        return {
            type: "sine",
            frequency: { value: 0 },
            connect: (n: unknown) => n,
            start: () => {
                started += 1;
            },
            stop() {}
        };
    }
}

function reducedMotion(on: boolean) {
    window.matchMedia = vi.fn().mockReturnValue({ matches: on }) as never;
}

beforeEach(() => {
    started = 0;
    resumed = 0;
    ctorCalls = 0;
    window.localStorage.clear();
    reducedMotion(false);
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
    resetSoundForTests();
});

afterEach(() => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe("the sound preference", () => {
    it("is on by default", () => {
        expect(soundEnabled()).toBe(true);
    });

    it("defaults to off when the system asks for reduced motion", () => {
        reducedMotion(true);
        resetSoundForTests();
        expect(soundEnabled()).toBe(false);
    });

    it("is remembered across visits, in either direction", () => {
        setSoundEnabled(false);
        expect(window.localStorage.getItem("jolt.sound")).toBe("off");
        resetSoundForTests();
        expect(soundEnabled()).toBe(false);

        setSoundEnabled(true);
        resetSoundForTests();
        expect(soundEnabled()).toBe(true);
    });

    it("lets an explicit choice win over reduced motion", () => {
        reducedMotion(true);
        window.localStorage.setItem("jolt.sound", "on");
        resetSoundForTests();
        expect(soundEnabled()).toBe(true);
    });
});

describe("playing a cue", () => {
    it("starts notes when sound is on", () => {
        play("correct");
        expect(started).toBeGreaterThan(0);
    });

    it("creates nothing at all while muted", () => {
        setSoundEnabled(false);
        play("correct");
        play("complete");
        expect(ctorCalls).toBe(0);
        expect(started).toBe(0);
    });

    it("never plays the same event twice, however often it is asked", () => {
        play("correct", "question-1");
        const once = started;
        play("correct", "question-1");
        play("correct", "question-1");
        expect(started).toBe(once);

        play("correct", "question-2");
        expect(started).toBe(once * 2);
    });

    it("collapses an identical cue fired twice in the same instant", () => {
        play("hint");
        const once = started;
        play("hint");
        expect(started).toBe(once);
    });

    it("stays silent, without throwing, until a gesture has woken the audio", () => {
        class Suspended extends FakeContext {
            state: "suspended" | "running" = "suspended";
        }
        (window as unknown as { AudioContext: unknown }).AudioContext = Suspended;
        resetSoundForTests();

        expect(() => play("correct", "a")).not.toThrow();
        expect(started).toBe(0);

        window.dispatchEvent(new Event("pointerdown"));
        expect(resumed).toBe(1);
    });

    it("is silent, never an error, in a browser without Web Audio", () => {
        delete (window as unknown as { AudioContext?: unknown }).AudioContext;
        resetSoundForTests();
        expect(() => play("complete")).not.toThrow();
        expect(started).toBe(0);
    });

    it("is silent, never an error, when the browser refuses a context", () => {
        (window as unknown as { AudioContext: unknown }).AudioContext = class {
            constructor() {
                throw new Error("NotAllowedError");
            }
        };
        resetSoundForTests();
        expect(() => play("signal")).not.toThrow();
        expect(() => play("signal", "again")).not.toThrow();
    });
});
