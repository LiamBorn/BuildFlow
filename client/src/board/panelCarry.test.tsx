/**
 * Carrying a Dashboard panel — the gesture the Schedule's boards use (2026-09-20).
 *
 * Asked for with a clip of the Month calendar: "use the same animation/tween effect from
 * the jobs within the schedule … wherever the job is going it will slowly tween that
 * direction." So it IS the same function — `scheduleCarryLean` — and what these cases pin
 * is the wiring the Dashboard needed around it, which is where a second copy of the
 * gesture would otherwise have grown:
 *
 *   - the panel's POSITION moved off `transform` onto the individual `translate` property,
 *     because the lean writes `transform` every frame and two writers on one property at
 *     pointer rate clobber each other;
 *   - the lean runs on its OWN frame loop rather than off the pointer, because it has to
 *     keep easing back to square after the hand stops, and a hand that has stopped sends
 *     no pointer events.
 *
 * Nothing here stubs a box, and that is the point: the loop reads the drag's OWN offset
 * rather than measuring the panel, so jsdom laying nothing out does not matter. It used
 * to call `getBoundingClientRect` on an element React had just written a style to, which
 * forces a synchronous layout every frame for a number that was already to hand. What the
 * lean then DRAWS is schedule/carryLean.test.ts's, and is not repeated here.
 */
import { act, render, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayoutGrid } from "lucide-react";
import { DashBoard } from "./panelBoard";

const LAYOUT = [
  { id: "a", x: 0, y: 0, w: 3, h: 4 },
  { id: "b", x: 3, y: 0, w: 3, h: 4 }
];
const PANELS = {
  a: { id: "a", title: "Panel A", icon: LayoutGrid, body: <p>A</p> },
  b: { id: "b", title: "Panel B", icon: LayoutGrid, body: <p>B</p> }
} as never;

const board = () =>
  render(
    <DashBoard layout={LAYOUT} panels={PANELS} onChange={() => {}} onEditingChange={() => {}} limits={() => ({ minW: 1, minH: 1 })} />
  );

const panelFor = (id: string) => document.querySelector<HTMLElement>(`[data-dash-drag-id="${id}"]`)!;
const gripFor = (id: string) => panelFor(id).querySelector<HTMLElement>(".dash-drag-handle")!;

/*
 * A MouseEvent named "pointerdown" rather than a PointerEvent: jsdom has no
 * PointerEvent at all, and the handlers read `button`, `clientX` and `clientY`,
 * which a MouseEvent carries. Same reason tests/date-menu.test.tsx does it.
 */
const pointer = (type: string, x: number, y: number) =>
  new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 });

/** Run the pending animation frames, which is where the lean is written. */
const frames = async (n: number) => {
  for (let i = 0; i < n; i += 1) {
    await act(async () => {
      vi.advanceTimersByTime(16);
    });
  }
};

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("a Dashboard panel is carried the way a Schedule job is", () => {
  it("puts the panel's position on `translate`, leaving `transform` for the lean", () => {
    board();
    const grip = gripFor("a");
    act(() => {
      grip.dispatchEvent(pointer("pointerdown", 100, 100));
    });
    act(() => {
      window.dispatchEvent(pointer("pointermove", 160, 140));
    });

    const panel = panelFor("a");
    expect(panel.classList.contains("is-dragging"), "it is in the air").toBe(true);
    // the offset is on `translate`; a `transform` here would be overwritten by the lean's
    // next frame, and the panel would stutter between the two writers at pointer rate
    expect(panel.style.translate, "position").toBeTruthy();
    expect(panel.style.translate).toMatch(/^-?[\d.]+px -?[\d.]+px$/);
    act(() => {
      window.dispatchEvent(pointer("pointerup", 160, 140));
    });
  });

  it("leans the way the hand is going, and lets go of the lean when the drag ends", async () => {
    vi.useFakeTimers();
    board();
    const grip = gripFor("a");
    act(() => {
      grip.dispatchEvent(pointer("pointerdown", 100, 100));
    });
    // the hand goes right, and the panel's box goes with it
    for (let i = 1; i <= 8; i += 1) {
      act(() => {
        window.dispatchEvent(pointer("pointermove", 100 + i * 40, 100));
      });
      await frames(1);
    }

    const panel = panelFor("a");
    const bank = Number(/rotate\((-?[\d.]+)deg\)/.exec(panel.style.transform)?.[1]);
    expect(Number.isFinite(bank), "the lean is written to `transform`").toBe(true);
    expect(bank, "going right, it banks right").toBeGreaterThan(0);

    act(() => {
      window.dispatchEvent(pointer("pointerup", 420, 100));
    });
    // handed back to the sheet, so the panel lands square and `is-landing` plays over it
    expect(panel.style.transform, "the lean is let go of").toBe("");
  });

  it("keeps easing back to square while the hand is still — which is why it is its own loop", async () => {
    vi.useFakeTimers();
    board();
    const grip = gripFor("a");
    act(() => {
      grip.dispatchEvent(pointer("pointerdown", 100, 100));
    });
    for (let i = 1; i <= 8; i += 1) {
      act(() => {
        window.dispatchEvent(pointer("pointermove", 100 + i * 60, 100));
      });
      await frames(1);
    }
    const panel = panelFor("a");
    const leaning = Math.abs(Number(/rotate\((-?[\d.]+)deg\)/.exec(panel.style.transform)?.[1]));
    expect(leaning).toBeGreaterThan(0.5);

    // the hand stops. NO pointer events from here — the loop is the only thing running,
    // and if the lean were driven off the pointer it would simply freeze at `leaning`.
    await frames(40);
    const settled = Math.abs(Number(/rotate\((-?[\d.]+)deg\)/.exec(panel.style.transform)?.[1]));
    expect(settled, "it comes back to square on its own").toBeLessThan(leaning / 4);

    act(() => {
      window.dispatchEvent(pointer("pointerup", 580, 100));
    });
  });

  it("follows the hand between cell changes, which is the whole point of the loop", async () => {
    // The board only re-renders when the panel reaches another cell. Everything in
    // between is the carry loop's, so a pointer move too small to change the cell must
    // STILL move the panel — this is what breaks if the loop ever returns early.
    vi.useFakeTimers();
    board();
    const grip = gripFor("a");
    act(() => {
      grip.dispatchEvent(pointer("pointerdown", 100, 100));
    });
    act(() => {
      window.dispatchEvent(pointer("pointermove", 103, 102));
    });
    await frames(2);
    const panel = panelFor("a");
    const tiny = panel.style.translate;
    expect(tiny, "a few pixels still move it").toBe("3px 2px");

    act(() => {
      window.dispatchEvent(pointer("pointermove", 111, 107));
    });
    await frames(2);
    expect(panel.style.translate, "and so do the next few").toBe("11px 7px");
    act(() => {
      window.dispatchEvent(pointer("pointerup", 111, 107));
    });
  });

  it("still follows the hand when less motion is asked for — only the lean goes", async () => {
    vi.useFakeTimers();
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: /reduced-motion/.test(q),
      media: q,
      addEventListener() {},
      removeEventListener() {}
    })) as unknown as typeof window.matchMedia;
    board();
    const grip = gripFor("a");
    act(() => {
      grip.dispatchEvent(pointer("pointerdown", 100, 100));
    });
    // the FIRST move always renders (there is no preview to compare against yet), so it
    // proves nothing about the loop. The second is the one the loop has to carry.
    act(() => {
      window.dispatchEvent(pointer("pointermove", 107, 104));
    });
    await frames(2);
    act(() => {
      window.dispatchEvent(pointer("pointermove", 113, 109));
    });
    await frames(2);
    const panel = panelFor("a");
    // it moves…
    expect(panel.style.translate, "less motion is not less dragging").toBe("13px 9px");
    // …and it does not lean
    expect(panel.style.transform).toBe("");
    act(() => {
      window.dispatchEvent(pointer("pointerup", 113, 109));
    });
    window.matchMedia = real;
  });

  it("re-renders the board when the panel reaches another cell, not on every frame", async () => {
    /*
     * The optimisation, as a test. `title` is read once per DashSection render, so
     * counting the reads counts the renders — and a drag that never leaves its cell
     * should cost one, not one per pointer move. This is what a Dashboard with real
     * panels feels: eight sections, their frame and a 114-cell grid, laid out again to
     * put one of them a few pixels along.
     */
    vi.useFakeTimers();
    // `icon` is read exactly once per DashSection render (`const Icon = panel.icon`),
    // which makes it a render counter. `title` is read four times, and counting THOSE
    // is how this test first read two renders as eight.
    let renders = 0;
    const counted = {
      a: {
        id: "a",
        title: "Panel A",
        get icon() {
          renders += 1;
          return LayoutGrid;
        },
        body: <p>A</p>
      },
      b: { id: "b", title: "Panel B", icon: LayoutGrid, body: <p>B</p> }
    } as never;
    render(
      <DashBoard layout={LAYOUT} panels={counted} onChange={() => {}} onEditingChange={() => {}} limits={() => ({ minW: 1, minH: 1 })} />
    );

    const grip = gripFor("a");
    act(() => {
      grip.dispatchEvent(pointer("pointerdown", 100, 100));
    });
    renders = 0;

    // eight moves, all well inside the same cell
    for (let i = 1; i <= 8; i += 1) {
      act(() => {
        window.dispatchEvent(pointer("pointermove", 100 + i * 2, 100 + i));
      });
      await frames(1);
    }
    const panel = panelFor("a");
    expect(panel.style.translate, "it followed the hand the whole way").toBe("16px 8px");
    /* Two renders for eight moves: the first, which has no preview to compare against,
       and the one where the panel finally reached the next cell. The six in between
       changed nothing the board could see — and each of them used to lay out both
       panels, the placeholder and the whole cell grid again. */
    expect(renders, "two renders for eight moves").toBeLessThanOrEqual(2);

    act(() => {
      window.dispatchEvent(pointer("pointerup", 116, 108));
    });
  });

  it("carries the panel square when less motion is asked for", async () => {
    vi.useFakeTimers();
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: /reduced-motion/.test(q),
      media: q,
      addEventListener() {},
      removeEventListener() {}
    })) as unknown as typeof window.matchMedia;
    board();
    const grip = gripFor("a");
    act(() => {
      grip.dispatchEvent(pointer("pointerdown", 100, 100));
    });
    for (let i = 1; i <= 6; i += 1) {
      act(() => {
        window.dispatchEvent(pointer("pointermove", 100 + i * 60, 100));
      });
      await frames(1);
    }
    const panel = panelFor("a");
    expect(panel.style.transform, "no lean at all").toBe("");
    // …and it still MOVES: the position is on `translate`, which is not motion
    expect(panel.style.translate).toBeTruthy();
    act(() => {
      window.dispatchEvent(pointer("pointerup", 460, 100));
    });
    window.matchMedia = real;
  });
});
