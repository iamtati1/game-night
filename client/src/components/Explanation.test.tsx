import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Explanation } from "./Explanation.js";

afterEach(cleanup);

const LONG =
    "`+=` adds to what fuel already holds, so fuel is 8. `-=` then takes 1 from that 8. Each line changes the value the next line sees: 4 would mean every line started again from 5.";

describe("an answer's explanation", () => {
    it("leads with the rule, emphasised, and keeps the reason in view", () => {
        const { container } = render(<Explanation className="feedback-why" text={LONG} />);

        const lead = container.querySelector(".explain-lead")!;
        expect(lead.textContent).toBe("+= adds to what fuel already holds, so fuel is 8.");
        // Code stays code.
        expect(lead.querySelector("code")?.textContent).toBe("+=");
        expect(screen.getByText(/then takes 1 from that 8\./)).toBeTruthy();
        expect(container.firstElementChild!.className).toBe("explain feedback-why");
    });

    it("offers the rest as optional detail that opens by keyboard and loses no words", () => {
        const { container } = render(<Explanation className="feedback-why" text={LONG} />);

        const details = container.querySelector("details")!;
        const summary = screen.getByText("More on why");
        expect(summary.tagName).toBe("SUMMARY");
        expect(details.open).toBe(false);

        // A native <summary> toggles on Enter and Space in a browser; jsdom
        // implements the click that those keys dispatch.
        fireEvent.click(summary);
        expect(details.open).toBe(true);

        // Every sentence is still on the page.
        expect(details.textContent).toContain("Each line changes the value the next line sees: 4 would mean every line started again from 5.");
    });

    it("has no disclosure for a two-sentence explanation", () => {
        const { container } = render(<Explanation className="reveal-why" text="Lines run from the top of the file to the bottom. Each one prints in turn." />);

        expect(container.querySelector("details")).toBeNull();
        expect([...container.querySelectorAll("p")].map((p) => p.textContent)).toEqual([
            "Lines run from the top of the file to the bottom.",
            "Each one prints in turn."
        ]);
    });

    it("shows each question's own explanation, never another's", () => {
        const { container } = render(
            <>
                <Explanation className="review-why" text="The first question's rule is stated here. Its reason follows." />
                <Explanation className="review-why" text="The second question's rule is different. So is its reason." />
            </>
        );

        const [a, b] = [...container.querySelectorAll(".explain")];
        expect(a!.querySelector(".explain-lead")!.textContent).toBe("The first question's rule is stated here.");
        expect(a!.textContent).not.toContain("second");
        expect(b!.querySelector(".explain-lead")!.textContent).toBe("The second question's rule is different.");
        expect(b!.textContent).not.toContain("first");
    });
});
