import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/client.js", () => ({
    api: { post: vi.fn(async () => ({ paused: true })) }
}));

const { api } = await import("../api/client.js");
const { usePauseOnLeave } = await import("./usePauseOnLeave.js");

function Game({ live }: { live: boolean }) {
    usePauseOnLeave("flush", live);
    return null;
}

afterEach(() => {
    cleanup();
    vi.mocked(api.post).mockClear();
});

describe("leaving a game page", () => {
    it("pauses the run when a round is in play", () => {
        const { unmount } = render(<Game live={false} />);
        // The round starts after the page mounted -- the usual order.
        const view = render(<Game live />);
        unmount();
        expect(api.post).not.toHaveBeenCalled();

        view.unmount();
        expect(api.post).toHaveBeenCalledTimes(1);
        expect(api.post).toHaveBeenCalledWith("/api/me/sessions/flush/pause");
    });

    it("tracks the latest state: a run that finished or paused is left alone", () => {
        const view = render(<Game live />);
        view.rerender(<Game live={false} />);
        view.unmount();

        expect(api.post).not.toHaveBeenCalled();
    });

    it("does nothing on an intro or results screen", () => {
        render(<Game live={false} />).unmount();
        expect(api.post).not.toHaveBeenCalled();
    });
});
