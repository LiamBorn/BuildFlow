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
    if (rule.selector.split(",").map((part) => part.trim()).includes(selector)) {
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

  it("never pins a surface, which belongs to the Theme Presets", () => {
    const all = sheet.toString();
    for (const token of ["--bf-surface", "--bf-ground", "--bf-hover"]) expect(all).not.toContain(`${token}:`);
  });
});
