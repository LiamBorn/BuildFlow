import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
