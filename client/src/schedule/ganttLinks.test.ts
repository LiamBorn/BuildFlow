import { describe, expect, it } from "vitest";
import { linkAnchors, linkPath } from "./ganttLinks";

const a = { left: 100, right: 200, y: 18 };
const b = { left: 260, right: 340, y: 54 };

describe("gantt dependency arrows", () => {
  it("leaves and enters the bars on the edges the link type names", () => {
    expect(linkAnchors("FS", a, b)).toEqual({ from: { x: 200, y: 18 }, to: { x: 260, y: 54 } });
    expect(linkAnchors("SS", a, b)).toEqual({ from: { x: 100, y: 18 }, to: { x: 260, y: 54 } });
    expect(linkAnchors("FF", a, b)).toEqual({ from: { x: 200, y: 18 }, to: { x: 340, y: 54 } });
    expect(linkAnchors("SF", a, b)).toEqual({ from: { x: 100, y: 18 }, to: { x: 340, y: 54 } });
  });

  it("draws a plain elbow when the successor is to the right, and a loop when it is not", () => {
    expect(linkPath({ x: 200, y: 18 }, { x: 260, y: 54 })).toBe("M200 18 H212 V54 H260");
    // back to back on the next row: still one elbow, with a short hook at the end
    expect(linkPath({ x: 200, y: 18 }, { x: 200, y: 54 })).toBe("M200 18 H212 V54 H200");
    expect(linkPath({ x: 200, y: 18 }, { x: 150, y: 54 })).toBe("M200 18 H212 V36 H138 V54 H150");
    expect(linkPath({ x: 200, y: 18 }, { x: 150, y: 18 })).toBe("M200 18 H212 V36 H138 V18 H150");
  });
});
