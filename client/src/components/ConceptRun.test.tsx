import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { EncounterRung } from "../api/encounter.js";
import { ConceptRun } from "./ConceptRun.js";

/**
 * Browser QA: a concept with a single playable rung was introduced as
 * "1 stops on this concept."
 */
afterEach(cleanup);

const rung = (demandSlug: string, cleared = false) =>
    ({ demandSlug, cleared, options: [{ id: "x" }] }) as unknown as EncounterRung;

describe("the concept's route caption", () => {
    it("counts one stop as one stop", () => {
        render(<ConceptRun rungs={[rung("recognise")]} />);
        expect(screen.getByText("Clear 1 stop to finish this concept.")).toBeTruthy();
    });

    it("still counts several as stops", () => {
        render(<ConceptRun rungs={[rung("recognise"), rung("produce"), rung("debug")]} />);
        // And says that clearing them is what finishes the concept.
        expect(screen.getByText("Clear all 3 stops to finish this concept.")).toBeTruthy();
    });
});
