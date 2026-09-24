/**
 * The landing a notification makes, as a test.
 *
 * jsdom applies no CSS, so none of the behavioural tests around this can see whether the
 * highlight actually paints — they only see the class arrive. Each assertion here exists
 * because writing this stylesheet produced the defect it describes, and each was confirmed
 * against the running app rather than reasoned about:
 *
 *   - the panel ring was first written as `animation` on `.dash-block`, and never played.
 *     dashboard-admin-kit.css animates the same element through
 *     `.bf-shell .dash-rx.hs-home .dash-board .dash-block` — five classes — so a two-class
 *     rule here loses whatever the source order, and `animationName` resolved to `bfak-rise`
 *     in the browser. The ring moved to `::after`, which nothing else competes for;
 *   - the row tint has to go on the CELLS. `tr.is-selected` and `tr:hover` both paint the
 *     row's own background, and a row-level tint here ties with the first and loses to
 *     nothing useful; a cell background covers whatever the row behind it paints;
 *   - a keyframe that names a property at one stop and not the other interpolates it across
 *     the whole gap. That is what made an earlier animation in this app drift out of step,
 *     so every property these keyframes animate is restated at every stop.
 */
import { describe, expect, it } from "vitest";
import postcss, { type AtRule, type Rule } from "postcss";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const sheet = postcss.parse(readFileSync(join(SRC, "record-focus.css"), "utf8"));

const rules = (): Rule[] => {
  const found: Rule[] = [];
  sheet.walkRules((rule) => {
    // keyframe stops are Rules too, and are asked about separately below
    if (rule.parent?.type === "atrule" && (rule.parent as AtRule).name.endsWith("keyframes")) return;
    found.push(rule);
  });
  return found;
};
const declaring = (property: string) => rules().filter((rule) => rule.nodes.some((node) => node.type === "decl" && node.prop === property));
const keyframes = (name: string) => {
  let found: AtRule | undefined;
  sheet.walkAtRules(/keyframes$/, (at) => {
    if (at.params === name) found = at;
  });
  if (!found) throw new Error(`no @keyframes ${name}`);
  return found;
};

describe("the notification landing stylesheet", () => {
  it("never animates .dash-block itself, which a five-class rule elsewhere already owns", () => {
    const panelRules = declaring("animation").filter((rule) => rule.selector.includes("dash-block"));
    expect(panelRules.length).toBeGreaterThan(0);
    for (const rule of panelRules) {
      // the ring must hang off a pseudo-element, or dashboard-admin-kit.css wins and it never plays
      expect(rule.selector).toContain("::after");
    }
  });

  it("tints the cells, not the row, so is-selected and hover cannot cover it", () => {
    const rowRules = rules().filter((rule) => rule.selector.includes("is-bf-focused") && rule.selector.includes("tr"));
    expect(rowRules.length).toBeGreaterThan(0);
    for (const rule of rowRules) expect(rule.selector).toMatch(/>\s*td/);
  });

  /**
   * The interpolation trap. A stop that omits a property the other stop sets does not hold
   * it — it is interpolated across the gap, so the highlight would start fading the instant
   * it appeared instead of holding and then leaving.
   */
  it("restates every animated property at every keyframe stop", () => {
    for (const name of ["bf-focus-cell", "bf-focus-cell-edge", "bf-focus-panel"]) {
      const at = keyframes(name);
      const stops: Array<{ at: string; props: string[] }> = [];
      at.walkRules((stop) => {
        stops.push({
          at: stop.selector,
          props: stop.nodes.filter((node) => node.type === "decl").map((node) => (node as { prop: string }).prop)
        });
      });
      expect(stops.length).toBeGreaterThan(1);
      const every = [...new Set(stops.flatMap((stop) => stop.props))].sort();
      for (const stop of stops) expect([...stop.props].sort(), `${name} at ${stop.at}`).toEqual(every);
    }
  });

  it("ends at nothing, so pulling the class leaves no step", () => {
    for (const name of ["bf-focus-cell", "bf-focus-cell-edge", "bf-focus-panel"]) {
      const at = keyframes(name);
      let last = "";
      at.walkRules((stop) => {
        if (stop.selector.includes("100%")) last = stop.toString();
      });
      // every colour at the final stop is fully transparent. The alpha is the LAST argument,
      // and the first is `var(--bf-accent-rgb)` — whose own bracket a lazy [^)]* cannot cross.
      expect(last).not.toBe("");
      const alphas = [...last.matchAll(/rgba\(var\(--bf-accent-rgb\),\s*([\d.]+)\)/g)].map((match) => Number(match[1]));
      expect(alphas.length).toBeGreaterThan(0);
      for (const alpha of alphas) expect(alpha).toBe(0);
    }
  });

  it("holds the highlight flat for anyone who asked for less motion", () => {
    let reduce: AtRule | undefined;
    sheet.walkAtRules("media", (at) => {
      if (at.params.includes("prefers-reduced-motion")) reduce = at;
    });
    expect(reduce).toBeDefined();
    const inside = reduce!.toString();
    expect(inside).toContain("animation: none");
    // and it still says WHICH one: a tint for the row, a ring for the panel
    expect(inside).toMatch(/background:\s*rgba\(var\(--bf-accent-rgb\)/);
    expect(inside).toMatch(/box-shadow:\s*0 0 0 2px rgba\(var\(--bf-accent-rgb\)/);
  });

  it("takes its colour from the theme token, so the flash follows the active preset", () => {
    const literals = sheet.toString().match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(literals).toEqual([]);
  });
});
