/**
 * The motion numbers live in two places at once, and this is what keeps them one
 * number — docs/motion-spec.md §1 and §9.1.
 *
 * `motion/tokens.ts` is the source. The Dashboard's panels are placed and dragged
 * by an inline `style.transform` (board/panelBoard.tsx), so their entrance has to
 * be a CSS animation rather than a framer one; skin §74a is therefore the same
 * tokens written out as custom properties. `cssVariables()` is what that block
 * must say. If either side moves without the other, this fails and names the
 * property that drifted.
 */
import { describe, expect, it } from "vitest";
import postcss, { type Rule, type Declaration } from "postcss";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BEAT, BOARD_RANK_CAP, DUR, EASE, MOTION, OPENING, ROW, STAGGER, cssEase, cssVariables, ms } from "../motion/tokens";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const sheet = postcss.parse(readFileSync(join(SRC, "app-shell-client-desk.css"), "utf8"));

/** The one rule in the sheet that declares the `--bfm-*` block (skin §74a). */
const declaredBlock = (): { selector: string; vars: Record<string, string> } => {
  let found: { selector: string; vars: Record<string, string> } | null = null;
  sheet.walkRules((rule: Rule) => {
    const vars: Record<string, string> = {};
    rule.each((node) => {
      if (node.type === "decl" && (node as Declaration).prop.startsWith("--bfm-")) {
        vars[(node as Declaration).prop] = (node as Declaration).value.trim();
      }
    });
    // §74a declares the whole set; the beats-and-shift rules declare one apiece.
    if (Object.keys(vars).length > 5) found = { selector: rule.selector.replace(/\s+/g, " ").trim(), vars };
  });
  if (!found) throw new Error("no --bfm-* block found in app-shell-client-desk.css");
  return found;
};

describe("the motion tokens the sheet and the code share", () => {
  it("writes skin §74a exactly as motion/tokens.ts says it should", () => {
    const { vars } = declaredBlock();
    expect(vars).toEqual(cssVariables());
  });

  it("hangs that block where the portals can reach it too", () => {
    // Scoped to bf-shell rather than :root: the sheet's whole kill switch is that
    // word, and a token on :root would outlive it. It has to be the BARE class,
    // though, not `.app-shell.hs-shell.bf-shell` — App.tsx puts bf-shell on the
    // body as well, and nine of this program's layers are portals to the body,
    // which are the shell's siblings and inherit nothing from it. A block scoped
    // to the shell element leaves every one of them with an undefined property,
    // an invalid calc() and a silently dropped delay.
    expect(declaredBlock().selector).toBe(".bf-shell");
  });

  it("keeps the spec's own numbers, so a drift here is a deliberate edit to the spec", () => {
    // §1's table, verbatim. tokens.ts may be reorganised; these values may not move
    // without the spec moving first.
    // §1's six durations and four curves, verbatim — these may not move without
    // the spec moving first
    expect({ instant: DUR.instant, fast: DUR.fast, base: DUR.base, slow: DUR.slow, chart: DUR.chart, count: DUR.count }).toEqual({
      instant: 0.12,
      fast: 0.22,
      base: 0.4,
      slow: 0.6,
      chart: 0.9,
      count: 1.4
    });
    expect(EASE.out).toEqual([0.22, 1, 0.36, 1]);
    expect(EASE.soft).toEqual([0.33, 1, 0.68, 1]);
    expect(EASE.inOut).toEqual([0.65, 0, 0.35, 1]);
    expect(EASE.bar).toEqual([0.16, 1, 0.3, 1]);

    // nothing else: §1's table is the whole set
    expect(Object.keys(DUR).filter((k) => !["instant", "fast", "base", "slow", "chart", "count"].includes(k))).toEqual([]);
    expect(Object.keys(EASE).filter((k) => !["out", "soft", "inOut", "bar"].includes(k))).toEqual([]);
    expect(STAGGER).toEqual({ icon: 0.04, char: 0.035, card: 0.09, row: 0.14, bar: 0.055, cell: 0.012 });
    expect(MOTION.rise).toBe(16);
    expect(MOTION.riseL).toBe(24);
    expect(MOTION.blur).toBe(10);
    expect(MOTION.blurT).toBe(6);
    expect(MOTION.scale).toBe(0.97);
    expect(MOTION.frameScale).toBe(0.985);
  });

  it("keeps the opening inside the budget the spec sets", () => {
    // §3: "Reference is ~3.6s. Ship at ~2.4s." The last thing to start is a figure
    // in the last panel of the board; it has DUR.count to run after it lands.
    const lastPanel = BEAT.boardContent + BOARD_RANK_CAP * ROW;
    expect(ms(lastPanel + DUR.count)).toBeLessThanOrEqual(ms(OPENING));
    // and the order the reference deals them in is the order here
    const order = [
      BEAT.frame,
      BEAT.brand,
      BEAT.navPill,
      BEAT.navIcons,
      BEAT.topbarRight,
      BEAT.rail,
      BEAT.title,
      BEAT.controls,
      BEAT.kpi,
      BEAT.kpiCols,
      BEAT.board,
      BEAT.boardContent
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("converts to the units CSS and framer each want", () => {
    expect(ms(DUR.slow)).toBe(600);
    expect(cssEase(EASE.out)).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
  });
});
