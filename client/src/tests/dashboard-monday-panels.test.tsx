/**
 * The Dashboard's boxes on monday.com's card, as a test.
 *
 * Two halves. The DOM half renders the board and asks the thing the user asked for — that
 * every box carries the SAME header, and that nothing the four self-headed panels used to
 * offer (View all ×3, Manage, the Open/Resolved switch) was lost in moving their heading
 * into the shared one. The CSS half reads the sheet off disk, because jsdom applies none of
 * it, and pins the numbers measured off the live monday page — with the dark-mode pins the
 * admin-kit guard already showed are the easy thing to forget.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import postcss, { type Rule } from "postcss";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import App from "../App";
import { enterDashboard, installAppHarness } from "../test/appHarness";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const sheet = postcss.parse(readFileSync(join(SRC, "dashboard-monday-panels.css"), "utf8"));

const declsOf = (selector: string): Record<string, string> => {
  const out: Record<string, string> = {};
  sheet.walkRules((rule: Rule) => {
    if (
      rule.selector
        .split(",")
        .map((part) => part.trim())
        .includes(selector)
    ) {
      rule.walkDecls((decl) => {
        out[decl.prop] = decl.value;
      });
    }
  });
  return out;
};

describe("every Dashboard box", () => {
  installAppHarness();

  it("renders the same header: one title row with a glyph, on all thirteen panels", async () => {
    render(<App />);
    await enterDashboard();

    const panels = [...document.querySelectorAll<HTMLElement>(".dash-block")];
    expect(panels.length).toBe(13);
    for (const panel of panels) {
      const heads = panel.querySelectorAll(":scope > .hs-widget-head");
      expect(heads.length, panel.dataset.dashDragId).toBe(1);
      const title = heads[0].querySelector("h2");
      expect(title?.textContent?.trim(), panel.dataset.dashDragId).not.toBe("");
      expect(title?.querySelector("svg"), `${panel.dataset.dashDragId} has a glyph`).not.toBeNull();
      // and no panel still draws a second heading row of its own inside the body
      expect(panel.querySelector(".cc-panel-head, .cc-sec-head"), panel.dataset.dashDragId).toBeNull();
    }
  });

  it("kept the four panels' own controls, now in the shared header's slot", async () => {
    render(<App />);
    await enterDashboard();

    const inHeader = (el: HTMLElement | null) => el?.closest(".hs-widget-head .hs-widget-actions") !== null;
    expect(inHeader(screen.getByRole("button", { name: "View all project alerts" }))).toBe(true);
    expect(inHeader(screen.getByRole("button", { name: "View all early warnings" }))).toBe(true);
    expect(inHeader(screen.getByRole("button", { name: "View all approvals on the schedule page" }))).toBe(true);
    expect(inHeader(screen.getByRole("button", { name: "Manage" }))).toBe(true);
    expect(inHeader(screen.getByRole("group", { name: "Approval view" }))).toBe(true);
  });
});

describe("the monday card sheet", () => {
  it("pins the reference's card: 16px radius, 16px padding, its hairline and its soft shadow", () => {
    const tokens = declsOf(".bf-shell .dash-rx");
    expect(tokens["--bf-radius-card"]).toBe("16px");
    expect(tokens["--bf-line-solid"]).toBe("#d0d4e4");
    expect(tokens["--bf-shadow-card"]).toMatch(/0 10px 23px rgba\(222, 222, 222, 0\.1\)/);
    expect(declsOf(".bf-shell .dash-rx.hs-home .dash-block").padding).toBe("16px");
  });

  it("pins the reference's title row: 18px/500 beside a 20px glyph, 16px above the content", () => {
    const title = declsOf(".bf-shell .dash-rx.hs-home .dash-block > .hs-widget-head h2");
    expect(title["font-size"]).toBe("18px");
    expect(title["font-weight"]).toBe("500");
    const glyph = declsOf(".bf-shell .dash-rx.hs-home .dash-block > .hs-widget-head h2 svg");
    expect(glyph.width).toBe("20px");
    expect(glyph.height).toBe("20px");
    expect(declsOf(".bf-shell .dash-rx.hs-home .dash-block > .hs-widget-head").margin).toBe("0 0 16px");
  });

  /**
   * The light tokens sit on .dash-rx, a descendant of the shell dark mode re-declares tokens
   * on, so they win for this subtree whatever the shell says — the trap admin-kit's own guard
   * exists for. Every token the light block pins must be pinned on all three dark selectors.
   */
  it("pins its dark tokens on all three dark selectors, so dark mode and the Dark theme still decide", () => {
    const light = declsOf(".bf-shell .dash-rx");
    const darkPinned = Object.keys(light).filter((token) => token !== "--bf-radius-card"); // a radius has no dark value
    for (const selector of [
      '.bf-shell[data-bf-mode="dark"] .dash-rx',
      '.bf-shell[data-bf-theme="dark"] .dash-rx',
      '.bf-shell[data-bf-mode="system"] .dash-rx'
    ]) {
      const dark = declsOf(selector);
      for (const token of darkPinned) expect(dark[token], `${token} on ${selector}`).toBeDefined();
      // and a grey shadow on a dark card is a smudge: the dark shadow is black-based
      expect(dark["--bf-shadow-card"]).toMatch(/rgba\(0, 0, 0,/);
    }
  });

  /**
   * The remove control shows on hover, and ONLY hover. It once also showed on focus-within (any
   * click inside a section) and, through a width-keyed media rule, on every section at once in a
   * window under 1024px — the user's own. Width says nothing about a pointer; `hover: none` does.
   */
  it("shows the remove control only on hover, and forces it only where nothing can hover", () => {
    // at rest: the top-level rule only, not the media blocks that share its selector
    let restOpacity = "";
    sheet.walkRules((rule: Rule) => {
      if (rule.parent?.type === "atrule") return;
      if (rule.selector === ".bf-shell .dash-rx.hs-home .dash-board .dash-block > .dash-hide") {
        rule.walkDecls("opacity", (decl) => {
          restOpacity = decl.value;
        });
      }
    });
    expect(restOpacity).toBe("0");
    let selectorsShowingIt = "";
    sheet.walkRules((rule: Rule) => {
      const decls: Record<string, string> = {};
      rule.walkDecls((decl) => {
        decls[decl.prop] = decl.value;
      });
      if (rule.selector.includes(".dash-hide") && decls.opacity === "1") selectorsShowingIt += rule.selector + "\n";
    });
    expect(selectorsShowingIt).toContain(".dash-block:hover > .dash-hide");
    expect(selectorsShowingIt).not.toContain("focus-within");
    // the forced-visible block is keyed on the pointer, never on the width
    const forcing: string[] = [];
    sheet.walkAtRules("media", (at) => {
      at.walkRules((rule: Rule) => {
        if (rule.selector.includes(".dash-hide") && rule.toString().includes("opacity: 1")) forcing.push(at.params);
      });
    });
    expect(forcing).toEqual(["(hover: none)"]);
  });

  /** In Customize, sections are dashed at rest and the one under the pointer goes solid. */
  it("turns the hovered section's dashed outline solid while customizing", () => {
    const hovered = declsOf(".bf-shell .dash-rx.hs-home.is-customizing .dash-board .dash-block:hover");
    expect(hovered["outline-style"]).toBe("solid");
    expect(hovered["outline-color"]).toContain("--bf-accent");
    // and the rest of the mode's sections are left on hs-home's dashed outline: no rule here
    // makes an un-hovered section solid
    let restSolid = false;
    sheet.walkRules((rule: Rule) => {
      if (
        rule.selector.includes("is-customizing") &&
        rule.selector.includes(".dash-block") &&
        !/:hover|:focus-within|is-dragging/.test(rule.selector)
      ) {
        rule.walkDecls("outline-style", (decl) => {
          if (decl.value === "solid") restSolid = true;
        });
      }
    });
    expect(restSolid).toBe(false);
  });

  /**
   * A carried panel rides the pointer through an inline transform. Two things can stop it:
   * an entrance animation that keeps filling forwards (a filled animation outranks an inline
   * style, so `both` held `transform: none` over the drag), and a transition on transform while
   * dragging, which would make the follow lag the hand. And on the drop, `transform` must be in
   * the resting transition or the panel snaps back to its old cell before sliding.
   */
  it("lets a carried panel ride the pointer and settle in one path", () => {
    const adminKit = readFileSync(join(SRC, "dashboard-admin-kit.css"), "utf8");
    const entrance = adminKit.match(/animation:\s*bfak-rise[^;]*;/);
    expect(entrance?.[0]).toBeDefined();
    expect(entrance![0]).not.toMatch(/\b(both|forwards)\b/);
    // the resting rule at the top level, not the reduced-motion block that shares its selector
    let restingTransition = "";
    sheet.walkRules((rule: Rule) => {
      if (rule.parent?.type === "atrule") return;
      if (rule.selector === ".bf-shell .dash-rx.hs-home .dash-board .dash-block") {
        rule.walkDecls("transition", (decl) => {
          restingTransition = decl.value;
        });
      }
    });
    expect(restingTransition).toMatch(/(^|,)\s*transform 0\.26s/);
    const carried = declsOf(".bf-shell .dash-rx.hs-home .dash-board .dash-block.is-dragging");
    expect(carried.transition).toBe("none");
  });

  it("seats the layout controls beside the lede, top-aligned, at the right edge", () => {
    /* Asked for on 2026-09-15: the stack moved down off the date line. App.test.tsx proves the
       markup puts the lede and the stack in one row; this proves the row IS a row — without
       display: flex the stack would simply fall under the lede — and that the stack keeps the
       right edge on its own (margin-left: auto), whatever the row wraps to. */
    const row = declsOf(".bf-shell .dash-rx.hs-home .hs-home-subline");
    expect(row.display).toBe("flex");
    expect(row["align-items"]).toBe("flex-start");
    const stack = declsOf(".bf-shell .dash-rx.hs-home .hs-home-topline-actions");
    expect(stack["flex-direction"]).toBe("column");
    expect(stack["margin-left"]).toBe("auto");
  });

  it("never pins a surface, which belongs to the Theme Presets", () => {
    const all = sheet.toString();
    for (const token of ["--bf-surface", "--bf-ground", "--bf-hover"]) expect(all).not.toContain(`${token}:`);
  });
});
