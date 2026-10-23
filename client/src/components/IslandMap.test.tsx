import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { MEMORY, gameBySlug } from "../games/catalog.js";
import type { Island } from "../games/islands.js";
import { IslandMap } from "./IslandMap.js";

/** The selected island's panel says where an unfinished run stands. */

const memory = (resume: Island["resume"]): Island => ({
    game: gameBySlug(MEMORY)!,
    state: "resume",
    counts: false,
    status: null,
    resume,
    action: "Resume Memory",
    actionLabel: "Resume Memory"
});

function renderPanel(island: Island) {
    return render(
        <MemoryRouter>
            <IslandMap islands={[island]} />
        </MemoryRouter>
    );
}

afterEach(cleanup);

describe("an unfinished run on the island panel", () => {
    it("names the round it will resume at", () => {
        const { container } = renderPanel(memory({ unitsDone: 1, unitsTotal: 5, score: 40 }));

        expect(container.querySelector(".island-panel-resume")?.textContent).toMatch(/2 of 5 · 40 pts so far/);
    });

    it("says no rounds were played yet, not \"0 of 0\", for a run left before round one", () => {
        const { container } = renderPanel(memory({ unitsDone: 0, unitsTotal: 0, score: 0 }));

        const line = container.querySelector(".island-panel-resume")?.textContent ?? "";
        expect(line).toMatch(/No rounds played yet · 0 pts so far/);
        expect(line).not.toMatch(/0 of 0/);
        expect(screen.getByText("Memory", { selector: "h2" })).toBeTruthy();
    });
});
