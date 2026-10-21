import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LearningBridge } from "./LearningBridge.js";

/** Browser QA: the Code Blitz entrance read "THIS GAME PRACTISES". Jolt's copy
 *  uses American spelling ("practice", "practicing") throughout. */
afterEach(cleanup);

describe("the bridge into a game", () => {
    it("names the concept and what to watch for, in American spelling", () => {
        render(
            <LearningBridge
                concept={{ slug: "expressions-produce-values", name: "Expressions Produce Values", objective: "work out the single value" } as never}
            />
        );

        expect(screen.getByText("Expressions Produce Values")).toBeTruthy();
        expect(screen.getByText("Watch for: work out the single value")).toBeTruthy();
        expect(screen.queryByText(/practises/i)).toBeNull();
    });
});
