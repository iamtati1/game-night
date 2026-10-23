import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {
        status: number;
        constructor(status: number, message: string) {
            super(message);
            this.status = status;
        }
    },
    api: { get: vi.fn(), post: vi.fn().mockResolvedValue({}) }
}));

const { api } = await import("../api/client.js");
const { LessonPage } = await import("./LessonPage.js");

afterEach(() => {
    cleanup();
    // api.post is asserted by CALL COUNT, so it has to start each test empty.
    vi.clearAllMocks();
});

function openChallenge(topic: string) {
    return render(
        <MemoryRouter initialEntries={[`/challenge/${topic}`]}>
            <Routes>
                <Route path="/challenge/:topic" element={<LessonPage />} />
            </Routes>
        </MemoryRouter>
    );
}

/** Answers every quiz step correctly, however many there are. */
async function clearTheQuiz(container: HTMLElement) {
    for (let guard = 0; guard < 12; guard += 1) {
        const choices = [...container.querySelectorAll<HTMLButtonElement>(".lesson-choice")];

        if (choices.length === 0) return;

        // The authored correct answer is the first choice in every challenge
        // step, which the lessons tests already pin.
        fireEvent.click(choices[0]!);

        const onward = [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
            /Next|Finish|Done|Continue/i.test(b.textContent ?? "")
        );

        if (!onward) return;

        fireEvent.click(onward);
        await waitFor(() => undefined);
    }
}

describe("a topic with a mission is closed by both halves", () => {
    it("hands over to the launch check instead of completing on the quiz", async () => {
        const { container } = openChallenge("variables");

        await clearTheQuiz(container);

        // The mission is on screen…
        await waitFor(() => expect(screen.getByText(/Declare a name for the fuel/)).toBeTruthy());

        // …and nothing has been recorded yet. Passing the quiz is half the
        // evidence, and half the evidence is not the capability.
        expect(api.post).not.toHaveBeenCalled();
    });

    it("records the topic only once the mission is finished too", async () => {
        const { container } = openChallenge("variables");

        await clearTheQuiz(container);
        await waitFor(() => screen.getByText(/Declare a name for the fuel/));

        const editor = () => container.querySelector("textarea")!;
        const run = () => {
            fireEvent.click(
                [...container.querySelectorAll("button")].find((b) => /Run/.test(b.textContent ?? ""))!
            );
        };
        const onward = () =>
            fireEvent.click(
                [...container.querySelectorAll("button")].find((b) =>
                    /Next|Finish/.test(b.textContent ?? "")
                )!
            );

        for (const source of [
            "let fuel = 100;",
            'let fuel = 100;\nconsole.log("Fuel: " + fuel);',
            'let fuel = 50;\nconsole.log("Fuel: " + fuel);',
            'let fuel = 50;\nlet crew = 3;\nconsole.log("Fuel: " + fuel);\nconsole.log("Crew: " + crew);'
        ]) {
            fireEvent.change(editor(), { target: { value: source } });
            run();
            await waitFor(() =>
                expect(
                    [...container.querySelectorAll("button")].some((b) =>
                        /Next|Finish/.test(b.textContent ?? "")
                    )
                ).toBe(true)
            );
            onward();
        }

        // One record, against the existing topic-challenge endpoint.
        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.post).mock.calls[0]![0]).toBe(
            "/api/curriculum/topics/variables/challenge"
        );
        // The quiz half travels with it, for the server to judge.
        expect(vi.mocked(api.post).mock.calls[0]![1]).toEqual({
            neededRetry: false,
            answers: [{ choice: "10" }, { choice: "20" }, { choice: "8" }]
        });
    });
});

describe("a topic with no mission is unchanged", () => {
    it("completes on the quiz alone, as it always did", async () => {
        const { container } = openChallenge("values");

        await clearTheQuiz(container);

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.post).mock.calls[0]![0]).toBe("/api/curriculum/topics/values/challenge");
    });
});

/* ------------------------------------------------ the server judges the pass */

/** Picks the choice with this text, then presses the button that moves on. */
async function answer(container: HTMLElement, text: string) {
    const choice = [...container.querySelectorAll<HTMLButtonElement>(".lesson-choice")].find(
        (b) => b.textContent === text
    );
    expect(choice, `a choice reading ${text}`).toBeDefined();
    fireEvent.click(choice!);

    const onward = [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
        /Next|Finish|Try a similar one/i.test(b.textContent ?? "")
    )!;
    fireEvent.click(onward);
    await waitFor(() => undefined);
}

describe("a checkpoint sends its answers for the server to judge", () => {
    it("sends every answer with the pass", async () => {
        const { container } = openChallenge("values");

        await answer(container, "string");
        await answer(container, "number");
        await answer(container, "false");

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.post).mock.calls[0]![1]).toEqual({
            neededRetry: false,
            answers: [{ choice: "string" }, { choice: "number" }, { choice: "false" }]
        });
    });

    it("sends a retry's answer alongside the wrong first one", async () => {
        const { container } = openChallenge("values");

        await answer(container, "string");
        await answer(container, "number");
        await answer(container, "true"); // wrong; this step offers a retry
        await answer(container, "false"); // the retry, right

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.post).mock.calls[0]![1]).toEqual({
            neededRetry: true,
            answers: [{ choice: "string" }, { choice: "number" }, { choice: "true", retry: "false" }]
        });
    });
});

describe("a checkpoint with a wrong answer is not passed", () => {
    it("says so without recording anything, and offers it again", async () => {
        const { container } = openChallenge("values");

        await answer(container, "number"); // wrong, and no retry on this step
        await answer(container, "number");
        await answer(container, "false");

        expect(await screen.findByRole("heading", { name: "Not quite there yet" })).toBeTruthy();
        expect(screen.getByText(/nothing was recorded/i)).toBeTruthy();
        expect(api.post).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "Try the checkpoint again" }));
        expect(await screen.findByText("1 / 3")).toBeTruthy();

        // Taken again, right this time: one pass, carrying only this attempt.
        await answer(container, "string");
        await answer(container, "number");
        await answer(container, "false");

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.post).mock.calls[0]![1]).toEqual({
            neededRetry: false,
            answers: [{ choice: "string" }, { choice: "number" }, { choice: "false" }]
        });
    });

    it("fails on a wrong retry too", async () => {
        const { container } = openChallenge("values");

        await answer(container, "string");
        await answer(container, "number");
        await answer(container, "true");
        await answer(container, "true"); // the retry, wrong as well

        expect(await screen.findByRole("heading", { name: "Not quite there yet" })).toBeTruthy();
        expect(api.post).not.toHaveBeenCalled();
    });

    it("does not hand over to the mission when the quiz half was not passed", async () => {
        const { container } = openChallenge("variables");

        await answer(container, "20"); // wrong, no retry
        await answer(container, "20");
        await answer(container, "8");

        expect(await screen.findByRole("heading", { name: "Not quite there yet" })).toBeTruthy();
        expect(screen.queryByText(/Declare a name for the fuel/)).toBeNull();
        expect(api.post).not.toHaveBeenCalled();
    });
});

describe("a pass the server refuses", () => {
    it("is shown as refused, with the checkpoint one tap away", async () => {
        const { ApiError } = await import("../api/client.js");
        vi.mocked(api.post).mockRejectedValueOnce(
            new ApiError(422, "Not every checkpoint answer was right. Try the checkpoint again.")
        );
        const { container } = openChallenge("values");

        await answer(container, "string");
        await answer(container, "number");
        await answer(container, "false");

        expect((await screen.findByRole("alert")).textContent).toMatch(/not every checkpoint answer was right/i);
        // Nothing celebrated over a refusal.
        expect(screen.queryByText(/complete/i)).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Try the checkpoint again" }));
        expect(await screen.findByText("1 / 3")).toBeTruthy();
    });
});

describe("a checkpoint's question screen", () => {
    it("has one top-level heading naming the checkpoint", () => {
        openChallenge("values");

        expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["Values challenge"]);
    });
});
