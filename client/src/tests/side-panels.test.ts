/**
 * The panels that open over a page from the right — and the one thing both of them got wrong
 * (2026-09-17).
 *
 * The Schedule pages' job drawer and the Contacts record panel each ran from the top of the
 * WINDOW, inside a full-viewport fixed layer, and the top bar is opaque and paints over that
 * layer: the job's name and its close button, the record's back button and its name, all sat
 * behind the bar. Worse, when a panel's content happened to fit the window's full height there was
 * no overflow at all, so there was nothing to scroll to reach them — which is exactly how it was
 * reported ("users aren't able to scroll up and down").
 *
 * Both now start where the page starts. The drawer went further, because its markup is its own
 * component: its header keeps its place and a body under it scrolls, which is the notifications
 * drawer's shape. The record panel (three of them, in App.tsx) still scrolls as a whole.
 *
 * jsdom applies no CSS, so these read the sheets off disk.
 */
import { describe, expect, it } from "vitest";
import postcss, { type Rule } from "postcss";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
/** A rule's declarations by exact selector, outside any at-rule; later rules overwrite earlier. */
const declsIn = (sheet: string, selector: string): Record<string, string> => {
  const out: Record<string, string> = {};
  postcss.parse(readFileSync(join(SRC, sheet), "utf8")).walkRules((rule: Rule) => {
    if (rule.parent?.type === "atrule") return;
    if (rule.selectors.includes(selector))
      rule.walkDecls((decl) => {
        out[decl.prop] = decl.value;
      });
  });
  return out;
};

describe("the panels that open from the right", () => {
  /* Each one runs the FULL HEIGHT of the page (2026-09-18, asked so they match the editing
     drawers). They used to start below the top bar, because at `top: 0` a job's name or a
     record's back button sat behind the bar with nothing to scroll to reach them — but that was
     the wrong half of the fix: both layers are `z-index: 95` against the bar's 5, so they paint
     OVER it and always could. What actually keeps that row reachable is asserted below — the
     drawer's body is the scroller, and the record's top row is sticky — so the offset was just a
     band of dead page above a modal panel. */
  it("runs each one the full height of the page, with its header held by something other than an offset", () => {
    for (const [sheet, selector] of [
      ["schedule.css", ".gantt-page .gantt-drawer"],
      ["hs-contacts.css", ".hs-record"]
    ] as const) {
      const panel = declsIn(sheet, selector);
      expect(panel.top, selector).toBe("0");
      // the layer is the whole window, so the panel's own height comes from top + bottom
      expect(panel.bottom, selector).toBe("0");
      expect(panel.position, selector).toBe("absolute");
    }
    // the layers really do sit above the bar; without that, full height would hide both headers
    expect(declsIn("hs-contacts.css", ".hs-record-layer")["z-index"]).toBe("95");
    expect(declsIn("schedule.css", ".gantt-page .gantt-drawer-layer")["z-index"]).toBe("95");
  });

  it("gives the job drawer a header that stays and a body that scrolls", () => {
    const panel = declsIn("schedule.css", ".gantt-page .gantt-drawer");
    expect(panel.display).toBe("flex");
    expect(panel["flex-direction"]).toBe("column");
    expect(panel.overflow).toBe("hidden");
    expect(declsIn("schedule.css", ".gantt-page .gantt-drawer-top").flex).toBe("none");
    const body = declsIn("schedule.css", ".gantt-page .gantt-drawer-body");
    expect(body["overflow-y"]).toBe("auto");
    /* The load-bearing line: a flex child will not shrink below its content without it, and the
       body would never scroll however long the job's notes are. */
    expect(body["min-height"]).toBe("0");
    // a flick at the end of the panel is not the page's business
    expect(body["overscroll-behavior"]).toBe("contain");
  });

  it("leaves the record panel scrolling as one piece", () => {
    // its three copies live in App.tsx, so this one keeps the shape it had rather than being restructured
    expect(declsIn("hs-contacts.css", ".hs-record")["overflow-y"]).toBe("auto");
  });
});
