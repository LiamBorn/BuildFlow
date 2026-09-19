/**
 * The title effect — docs/motion-spec.md §2.4, and the one place this program
 * differs from the reference on purpose.
 *
 * The reference's title is the word "Overview". This program's is a greeting with
 * a person's NAME in it, so its length is whoever is logged in. At a flat 35ms a
 * character, "Good afternoon, Alexander" would still be writing itself while the
 * board landed, so the step shrinks to fit CHAR_BUDGET and the title always leads.
 */
import { cleanup, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextReveal, charStep } from "./TextReveal";
import { __resetOpeningGate } from "./AppFrame";
import { BEAT, CHAR_BUDGET, STAGGER } from "./tokens";

/**
 * What the component ACTUALLY used, read back off the DOM — not the formula
 * recomputed here, which would pass however the component behaved.
 */
const step = (text: string) => {
  const { container } = render(<TextReveal text={text} />);
  const shown = container.querySelector<HTMLElement>("[aria-label]")!.style.getPropertyValue("--bfm-char-step");
  cleanup();
  expect(shown, "the component publishes the step it used").not.toBe("");
  expect(parseFloat(shown)).toBeCloseTo(charStep(text), 6);
  return parseFloat(shown);
};

describe("TextReveal", () => {
  it("reads as one line to a screen reader and hides every character from it", () => {
    const { container } = render(<TextReveal text="Good morning, Matt" />);
    const wrapper = container.querySelector<HTMLElement>("[aria-label]")!;
    expect(wrapper.getAttribute("aria-label")).toBe("Good morning, Matt");
    const chars = [...wrapper.children] as HTMLElement[];
    expect(chars).toHaveLength("Good morning, Matt".length);
    expect(chars.every((c) => c.getAttribute("aria-hidden") === "true")).toBe(true);
    // and the text on the page is unchanged
    expect(container.textContent).toBe("Good morning, Matt");
  });

  it("keeps the spaces, so the words do not run together", () => {
    const { container } = render(<TextReveal text="a b" />);
    expect(container.textContent).toBe("a b");
    const space = [...container.querySelector("[aria-label]")!.children][1] as HTMLElement;
    // a space cannot be inline-block and keep its width
    expect(space.style.display).toBe("inline");
    expect(space.style.whiteSpace).toBe("pre");
  });

  it("runs a short title at the full step, as the reference does", () => {
    // "Overview" — eight characters, 7 gaps, 245ms: inside the budget, so nothing shrinks
    expect(step("Overview")).toBe(STAGGER.char);
  });

  it("shrinks the step for a long name rather than running past the rest of the page", () => {
    const long = "Good afternoon, Alexander";
    expect(long.length).toBeGreaterThan(20);
    expect(step(long)).toBeLessThan(STAGGER.char);
    // whatever the name, the whole title is staggered inside the budget
    for (const text of ["Hi, Al", "Good morning, Matt", long, "Good evening, Bartholomew-Kensington"]) {
      expect((text.length - 1) * step(text)).toBeLessThanOrEqual(CHAR_BUDGET + 1e-9);
    }
  });

  it("holds a nested title back to its own card, which is when there is something to read it against", () => {
    // Eleven index pages put the h1 in the head of the card that holds the table.
    // A title timed to LEAD the page wrote itself out completely behind a card
    // still at opacity 0, so the effect was never once seen. Nested titles write
    // with the rest of the card's contents instead.
    expect(BEAT.boardContent).toBeGreaterThan(BEAT.title);
    const at = (nested: boolean) => {
      const { container } = render(<TextReveal text="Projects" nested={nested} />);
      const shown = container.querySelector<HTMLElement>("[aria-label]")!.style.getPropertyValue("--bfm-char-at");
      cleanup();
      expect(shown, "the component publishes the beat it started on").not.toBe("");
      return parseFloat(shown);
    };
    // read off the DOM, not recomputed here, in BOTH of the gate's states
    window.sessionStorage.clear();
    __resetOpeningGate();
    expect(at(false), "first open: the title waits out the chrome").toBeCloseTo(BEAT.title, 6);
    expect(at(true), "and a nested one waits for its card").toBeCloseTo(BEAT.boardContent, 6);

    window.sessionStorage.setItem("bf:shell-opened", "1");
    __resetOpeningGate();
    expect(at(false), "later: nothing left to wait for").toBe(0);
    expect(at(true), "but the card is still ahead of it").toBeCloseTo(BEAT.boardContent - BEAT.title, 6);

    // whichever state, a nested title never leads its own card
    expect(at(true)).toBeGreaterThan(at(false));
  });

  it("never divides by zero on a one-character title", () => {
    expect(Number.isFinite(charStep("A"))).toBe(true);
    expect(() => render(<TextReveal text="A" />)).not.toThrow();
  });
});
