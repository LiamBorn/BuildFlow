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
     the wrong half of the fix: both layers are `z-index: 95` against the bar's 40, so they should
     paint OVER it. What actually keeps that row reachable is asserted below — the drawer's body
     is the scroller, and the record's top row is sticky — so the offset was just a band of dead
     page above a modal panel.

     "SHOULD" IS DOING WORK IN THAT SENTENCE, and it used to say "always could", which is what let
     this come back on 2026-09-19. A z-index is only ever read against the siblings in its own
     stacking context: the drawer sat inside `.schedule-page` (z-index 60, `isolation: isolate`)
     inside `.bfm-page` (z-index 1), and the bar is a sibling of those — so 95 was compared with
     nothing that mattered and the whole page, drawer included, painted under the bar. The number
     below is necessary and was never sufficient. What makes it sufficient is that the drawer is
     portalled out of the page entirely, which is job-drawer-overlay.test.tsx's to keep. */
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

  /* Skin §83. Asked for with the scroll: "make it so that the left sidebar will be hidden when
     the job right sidebar gets shown up." */
  it("takes the icon rail out of the way while the drawer is up, and only while it is up", () => {
    const SKIN = "app-shell-client-desk.css";
    /* The portal wrapper must generate NO box: it is a child of the shell's flex column, and a
       zero-height flex item would still take the column's gap. */
    expect(declsIn(SKIN, ".gantt-drawer-portal").display).toBe("contents");

    const hidden = declsIn(SKIN, "body.bf-job-drawer-open .app-shell.hs-shell.bf-shell .sidebar.hs-rail");
    /* TWICE the rail's own width. One width plus a constant left 5.9px of it on screen (measured)
       because the rail is inset from the window's edge as well as being 50.8px wide; its own
       width is the one number certainly larger than that inset. */
    expect(hidden.translate, "the rail no longer steps out").toBe("-200% 0");
    expect(hidden["pointer-events"], "an off-screen rail can still be tabbed into").toBe("none");
    /* NOT `opacity`. `bf-shell-in` is `0% {opacity: 0} 100% {opacity: 1}` with
       `animation-fill-mode: both`, so the shell's arrival holds the rail's opacity for good and an
       animation outranks a declaration like this one — a fade here is simply never applied. */
    expect(hidden.opacity, "an opacity the shell's arrival animation will overrule").toBeUndefined();
    // and no Show tab, since there is nothing to bring the rail back to while the drawer is modal
    expect(
      declsIn(SKIN, "body.bf-job-drawer-open .app-shell.hs-shell.bf-shell .hs-rail-show").display
    ).toBe("none");

    /* The person's OWN Hide choice is a different mechanism and must stay untouched: that one is
       `display: none` from section 45, kept in localStorage by railHidden.ts. */
    expect(declsIn(SKIN, ".app-shell.hs-shell.bf-shell .sidebar.hs-rail.is-hidden").display).toBe("none");
  });

  it("leaves the record panel scrolling as one piece", () => {
    // its three copies live in App.tsx, so this one keeps the shape it had rather than being restructured
    expect(declsIn("hs-contacts.css", ".hs-record")["overflow-y"]).toBe("auto");
  });
});
