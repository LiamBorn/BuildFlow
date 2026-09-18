/**
 * Carrying a card while the window scale is on. Everything dnd-kit measures comes back in SCREEN
 * pixels, and everything it then writes is a length inside the zoomed shell, where the browser
 * multiplies it by the zoom again. Three places divide it back: the pointer translation, the box a
 * DragOverlay is placed in, and the distance of its drop flight. Where the browser reports no zoom
 * (jsdom does not) each one is the identity.
 */
import { afterEach, describe, expect, it } from "vitest";
import { unzoomDrag } from "./hooks";
import { unzoomDropFlight, unzoomOverlay } from "../dragZoom";

const args = (x: number, y: number) => ({ transform: { x, y, scaleX: 1, scaleY: 1 } }) as unknown as Parameters<typeof unzoomDrag>[0];

describe("unzoomDrag", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is the identity when the shell reports no zoom", () => {
    document.body.innerHTML = '<div class="app-shell"></div>';
    expect(unzoomDrag(args(100, 40))).toEqual({ x: 100, y: 40, scaleX: 1, scaleY: 1 });
  });

  it("divides the translation by the shell's zoom so the card renders under the pointer", () => {
    document.body.innerHTML = '<div class="app-shell"></div>';
    const shell = document.querySelector(".app-shell") as Element & { currentCSSZoom?: number };
    shell.currentCSSZoom = 0.8;
    expect(unzoomDrag(args(80, -40))).toEqual({ x: 100, y: -50, scaleX: 1, scaleY: 1 });
  });

  it("leaves a zoom of 1 or a missing shell alone", () => {
    expect(unzoomDrag(args(12, 7))).toEqual({ x: 12, y: 7, scaleX: 1, scaleY: 1 });
  });
});

const rect = { top: 300, left: 200, width: 120, height: 40, bottom: 340, right: 320 };
const zoomed = (zoom: number) => {
  document.body.innerHTML = '<div class="app-shell"></div>';
  (document.querySelector(".app-shell") as Element & { currentCSSZoom?: number }).currentCSSZoom = zoom;
};

describe("unzoomOverlay", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("divides the box the card is placed in, so it starts on the chip it was lifted from", () => {
    zoomed(0.8);
    // at 0.8 the browser renders `top: 375px` as 300 screen pixels, which is where the chip is
    expect(unzoomOverlay(rect)).toEqual({ top: 375, left: 250, width: 150, height: 50 });
  });

  it("leaves the placement to dnd-kit at a zoom of 1, and has nothing to say without a box", () => {
    zoomed(1);
    expect(unzoomOverlay(rect)).toBeUndefined();
    zoomed(0.8);
    expect(unzoomOverlay(null)).toBeUndefined();
  });
});

describe("unzoomDropFlight", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const flight = (initial: { x: number; y: number }, final: { x: number; y: number }) =>
    unzoomDropFlight({
      transform: {
        initial: { ...initial, scaleX: 1, scaleY: 1 },
        final: { ...final, scaleX: 1, scaleY: 1 }
      }
    } as unknown as Parameters<typeof unzoomDropFlight>[0]);

  it("divides the distance flown, so the card lands on the chip and not short of it", () => {
    zoomed(0.8);
    // dnd-kit measured 40 screen pixels of travel; inside the shell that is 50 of its own
    expect(flight({ x: 100, y: 60 }, { x: 60, y: 40 })).toEqual([
      { transform: "translate3d(100px, 60px, 0) scaleX(1) scaleY(1)" },
      { transform: "translate3d(50px, 35px, 0) scaleX(1) scaleY(1)" }
    ]);
  });

  it("flies dnd-kit's own distance at a zoom of 1", () => {
    zoomed(1);
    expect(flight({ x: 100, y: 60 }, { x: 60, y: 40 })[1]).toEqual({ transform: "translate3d(60px, 40px, 0) scaleX(1) scaleY(1)" });
  });
});
