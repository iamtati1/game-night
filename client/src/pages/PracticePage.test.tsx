import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /practise/:concept shows completion only when the server records it.
 *
 * Audit finding: PracticePage swallowed every failure and showed the
 * completion screen anyway ("+25", Continue to the next concept) over a
 * demonstration the server had refused. The practice itself (MissionScene) and
 * the completion screen are stubbed: what is under test is what the page does
 * with the server's answer.
 */

vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {
        status: number;
        constructor(status: number, message: string) {
            super(message);
            this.status = status;
        }
    },
    api: { get: vi.fn(), post: vi.fn() }
}));

vi.mock("../components/MissionScene.js", () => ({
    MissionScene: ({ busy, onFinish }: { busy: boolean; onFinish: (retried: boolean) => void }) => (
        <button disabled={busy} onClick={() => onFinish(true)}>
            Finish practice
        </button>
    )
}));

vi.mock("../components/ConceptComplete.js", () => ({
    ConceptComplete: ({ concept }: { concept: string }) => <h1>Complete: {concept}</h1>
}));

const { ApiError, api } = await import("../api/client.js");
const { PracticePage } = await import("./PracticePage.js");
const { PRACTICES } = await import("../games/practice.js");

const CONCEPT = PRACTICES[0]!.concept;
const ENDPOINT = `/api/curriculum/concepts/${CONCEPT}/demonstrate`;

function openPractice() {
    return render(
        <MemoryRouter initialEntries={[`/practise/${CONCEPT}`]}>
            <Routes>
                <Route path="/practise/:concept" element={<PracticePage />} />
            </Routes>
        </MemoryRouter>
    );
}

const finishPractice = async () => {
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Finish practice" }));
    });
};

beforeEach(() => vi.mocked(api.post).mockReset());
afterEach(cleanup);

describe("practice completion", () => {
    it("shows completion once the server records it", async () => {
        vi.mocked(api.post).mockResolvedValue({ demonstrated: true, concept: CONCEPT });
        openPractice();

        await finishPractice();

        expect(await screen.findByRole("heading", { name: `Complete: ${CONCEPT}` })).toBeTruthy();
        expect(api.post).toHaveBeenCalledTimes(1);
        expect(vi.mocked(api.post).mock.calls[0]![0]).toBe(ENDPOINT);
        expect(vi.mocked(api.post).mock.calls[0]![1]).toMatchObject({ neededRetry: true });
    });

    it("says a refusal plainly, with the way to the practice, and celebrates nothing", async () => {
        vi.mocked(api.post).mockRejectedValueOnce(
            new ApiError(409, "Practise every stop of this concept before it can be demonstrated")
        );
        openPractice();

        await finishPractice();

        expect((await screen.findByRole("alert")).textContent).toMatch(/practise every stop/i);
        expect(screen.getByRole("heading", { name: "Not recorded yet" })).toBeTruthy();
        expect(screen.queryByRole("heading", { name: /^Complete/ })).toBeNull();
        expect(screen.getByRole("link", { name: "Go to the practice" }).getAttribute("href")).toBe(`/concept/${CONCEPT}`);
        // Sending the same thing again would get the same answer.
        expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    });

    it("treats a closed concept the same way", async () => {
        vi.mocked(api.post).mockRejectedValueOnce(new ApiError(403, "That concept is not open yet"));
        openPractice();

        await finishPractice();

        expect((await screen.findByRole("alert")).textContent).toBe("That concept is not open yet");
        expect(screen.queryByRole("heading", { name: /^Complete/ })).toBeNull();
    });

    it("offers to try again when the server cannot be reached, and completes when it can", async () => {
        vi.mocked(api.post)
            .mockRejectedValueOnce(new ApiError(0, "Could not reach the server."))
            .mockResolvedValueOnce({ demonstrated: true, concept: CONCEPT });
        openPractice();

        await finishPractice();

        expect((await screen.findByRole("alert")).textContent).toMatch(/nothing is lost/i);
        expect(screen.queryByRole("heading", { name: /^Complete/ })).toBeNull();

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        });

        expect(await screen.findByRole("heading", { name: `Complete: ${CONCEPT}` })).toBeTruthy();
        // The same record, sent again -- the practice was not redone.
        expect(api.post).toHaveBeenCalledTimes(2);
        expect(vi.mocked(api.post).mock.calls[1]).toEqual(vi.mocked(api.post).mock.calls[0]);
    });

    it("treats a server failure as retryable too", async () => {
        vi.mocked(api.post).mockRejectedValueOnce(new ApiError(503, "Jolt's server is not responding right now."));
        openPractice();

        await finishPractice();

        expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy();
        expect(screen.queryByRole("heading", { name: /^Complete/ })).toBeNull();
    });

    it("sends one record however many times Finish is pressed while it is in flight", async () => {
        let resolve!: (value: unknown) => void;
        vi.mocked(api.post).mockReturnValue(new Promise((r) => (resolve = r)));
        openPractice();

        const finish = screen.getByRole("button", { name: "Finish practice" });
        fireEvent.click(finish);
        fireEvent.click(finish);
        fireEvent.click(finish);

        expect(api.post).toHaveBeenCalledTimes(1);

        await act(async () => resolve({ demonstrated: true, concept: CONCEPT }));
        expect(await screen.findByRole("heading", { name: `Complete: ${CONCEPT}` })).toBeTruthy();
        expect(api.post).toHaveBeenCalledTimes(1);
    });

    it("names itself: its own page title and one top-level heading", async () => {
        openPractice();

        expect(document.title).toBe(`Practice: ${PRACTICES[0]!.title} · Jolt`);
        expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([
            `Practice: ${PRACTICES[0]!.title}`
        ]);
    });
});
