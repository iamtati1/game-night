import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/client.js", () => ({
    ApiError: class ApiError extends Error {},
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
