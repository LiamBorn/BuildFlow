import { render } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import { canCountUp, useCountUp } from "../../motion/useCountUp";
import { AnimatedFigure } from "./animated-figure";

/* The count-up keeps the pages' own formatting and, where it cannot animate (jsdom has no
   document.fonts), shows the finished figure on the first paint. */
describe("AnimatedFigure", () => {
  it.each([
    ["2", "2"],
    ["49%", "49%"],
    ["$39M", "$39M"],
    ["1,240 hrs", "1,240 hrs"],
    ["7.4", "7.4"],
    ["−25d", "−25d"],
    ["—", "—"],
    [11, "11"]
  ])("renders %p as %p, finished, where it cannot animate", (input, expected) => {
    const { container } = render(<AnimatedFigure text={input} />);
    expect(container.textContent).toBe(expected);
  });
  it("wraps the prefix, the decimals and the unit so the sheet can size and tint them, without changing the text", () => {
    const { container } = render(<AnimatedFigure text="$6,010.29M" />);
    expect(container.textContent).toBe("$6,010.29M");
    expect(container.querySelector("i.af-pre")?.textContent).toBe("$");
    expect(container.querySelector("em.af-frac")?.textContent).toBe(".29");
    expect(container.querySelector("em.af-unit")?.textContent).toBe("M");
    // a plain integer carries none of them
    const plain = render(<AnimatedFigure text="42" />).container;
    expect(plain.querySelector("i, em")).toBeNull();
    expect(plain.textContent).toBe("42");
  });

  /* A page that is still loading shows "—" and the number once it arrives (TimeCard's Team's time,
     2026-09-25). The render that had no number leaves NaN in the roll's state, and the effect that
     starts the roll runs after that render is on screen — so the figure has to start from the start
     of its roll, not from NaN, or "NaN" is painted for a frame. */
  it("starts a figure that arrives late from the start of its roll, never from NaN", () => {
    // a browser that rolls figures: jsdom has no document.fonts, so lend it one for this case
    Object.defineProperty(document, "fonts", { configurable: true, value: {} });
    onTestFinished(() => {
      delete (document as { fonts?: unknown }).fonts;
    });
    expect(canCountUp(), "the case needs the rolling path").toBe(true);
    const seen: number[] = [];
    function Probe({ target }: { target: number }) {
      seen.push(useCountUp(target));
      return null;
    }
    const { rerender, unmount } = render(<Probe target={Number.NaN} />);
    const arrived = seen.length;
    rerender(<Probe target={59} />);
    expect(seen.slice(arrived).length).toBeGreaterThan(0);
    expect(seen.slice(arrived).filter((value) => !Number.isFinite(value))).toEqual([]);
    unmount();
  });
});
