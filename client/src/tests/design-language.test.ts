/**
 * The redesign's non-motion guarantees, as a test: contrast, state legibility and focus.
 *
 * Companion to motion-language.test.ts, and written for the same reason -- jsdom applies
 * no CSS, so nothing in the other 400 tests can see a colour, a specificity tie or a
 * missing focus ring. Every assertion here exists because step 12's verification pass
 * found a real defect that a careful reading of the file had already missed twice:
 *
 *   - the eyebrow role was moved onto the palette's faintest ink, putting every table
 *     column head and every dialog form label at 3.59:1;
 *   - every "this one is active" state was the accent on its own 8% wash, 4.06:1;
 *   - the focus indicator was a 12%-alpha halo measuring 1.17:1, substituted for a real
 *     outline at eleven sites, and silently beaten by an unrelated box-shadow at five;
 *   - a rest-state rule tied `.sorted` and won on source order, so no column head showed
 *     which column the table was sorted by.
 *
 * The arithmetic is WCAG 2.1: 4.5:1 for text, 3:1 for large text and for any non-text
 * indicator that carries meaning.
 */
import { describe, expect, it } from "vitest";
import postcss, { type Declaration, type Rule } from "postcss";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SHEET = "app-shell-daylight.css";
const TOKENS = "design-tokens.css";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/* ---- colour maths, so the numbers in the comments above are re-derived here ------- */
type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const s = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as RGB;
};
const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const luminance = (c: RGB) => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
const contrast = (a: RGB, b: RGB) => {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const composite = (fg: RGB, alpha: number, bg: RGB): RGB => [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)) as RGB;
const round = (n: number) => Math.round(n * 100) / 100;

const CARD: RGB = hex("#ffffff");
const GROUND: RGB = hex("#f5f6fa");
const INK: RGB = hex("#1c1c1a");
const MUTED: RGB = hex("#575550");
const FAINT: RGB = hex("#8a877e");
const ACCENT: RGB = hex("#2f6bff");
const ACCENT_DARK: RGB = hex("#1f57e0");

const sheet = postcss.parse(read(SHEET));
const inReduce = (node: { parent?: unknown } | undefined): boolean => {
  let p = node?.parent as { type?: string; params?: string; parent?: unknown } | undefined;
  while (p) {
    if (p.type === "atrule" && /prefers-reduced-motion/.test(p.params ?? "")) return true;
    p = p.parent as typeof p;
  }
  return false;
};

describe("the ink ladder holds against every ground the design uses", () => {
  it("keeps the faint ink off text, because it fails on all three grounds", () => {
    // #8a877e measures 3.59 on a card, 3.33 on the ground and 3.06 on the 5% wash. It is
    // the palette's third ink and it carries over from the Welcome Page, where it sits on
    // incidental captions beside 96px display type. In-app the same role lands at 11.5px
    // on the densest surfaces in the product, so it is reserved for NON-TEXT: icons and
    // the flyout star, which only need 3:1 and clear it.
    // the whole ladder, so the three rungs are re-derived here rather than quoted
    expect(round(contrast(INK, CARD))).toBeGreaterThanOrEqual(4.5); // 17.07
    expect(round(contrast(MUTED, CARD))).toBeGreaterThanOrEqual(4.5); // 7.45
    expect(round(contrast(FAINT, CARD))).toBeLessThan(4.5); // 3.59 -- the reason for this test
    expect(round(contrast(FAINT, GROUND))).toBeLessThan(4.5); // 3.33
    expect(round(contrast(FAINT, composite(INK, 0.05, CARD)))).toBeLessThan(4.5); // 3.06 on the wash

    const onText: string[] = [];
    sheet.walkRules((rule) => {
      if (inReduce(rule)) return;
      const faintInk = rule.nodes.find((n): n is Declaration => n.type === "decl" && n.prop === "color" && /#8a877e/i.test(n.value));
      if (!faintInk) return;
      // a rule is allowed to use it only if every selector in the list paints an icon or
      // the star button, whose glyph is its own indicator
      const nonText = rule.selectors.every((s) => /\bsvg$/.test(norm(s)) || /\.hs-flyout-star$/.test(norm(s)));
      if (!nonText) onText.push(`${faintInk.source?.start?.line}: ${norm(rule.selector).slice(0, 90)}`);
    });
    expect(onText).toEqual([]);
  });

  it("never puts the plain accent on its own wash, where it drops under 4.5:1", () => {
    // #2f6bff on plain white is exactly 4.50 -- it only ever passed by a hair -- and
    // tinting the ground beneath it by 8% pushes it to 4.06. Accent TEXT on an accent
    // wash therefore uses the darker rung, which is also this sheet's primary-button hover.
    const wash8 = composite(ACCENT, 0.08, CARD);
    const wash10 = composite(ACCENT, 0.1, CARD);
    expect(round(contrast(ACCENT, wash8))).toBeLessThan(4.5);
    expect(round(contrast(ACCENT_DARK, wash8))).toBeGreaterThanOrEqual(4.5);
    expect(round(contrast(ACCENT_DARK, wash10))).toBeGreaterThanOrEqual(4.5);

    /* The accent is a token now, so the scan follows the token. A rule that tints its
       ground with the accent and then writes the PLAIN accent on it is the offence;
       --bf-accent-dark is the rung that clears it. */
    const offenders: string[] = [];
    sheet.walkRules((rule) => {
      if (inReduce(rule)) return;
      const decls = rule.nodes.filter((n): n is Declaration => n.type === "decl");
      const wash = decls.find(
        (d) => /^background(-color)?$/.test(d.prop) && /rgba\(\s*(47,\s*107,\s*255|var\(--bf-accent-rgb\))\s*,\s*0?\.\d+\)/.test(d.value)
      );
      const text = decls.find((d) => d.prop === "color" && /#2f6bff|var\(--bf-accent\)/i.test(d.value));
      if (wash && text) offenders.push(`${text.source?.start?.line}: ${norm(rule.selector).slice(0, 90)}`);
    });
    expect(offenders).toEqual([]);
  });

  it("gives every theme an accent trio that holds its own contrast", () => {
    /* The four themes each re-point the accent, so "the accent is safe" stopped being one
       measurement and became four. Each theme declares three rungs and each has a job:
         --bf-accent       the identity: borders, washes, charts, glows, non-text fills
         --bf-accent-fill  the same surface where light TEXT sits on it
         --bf-accent-dark  accent TEXT sitting on an accent wash
       Two of the four have an accent that cannot carry white text (Brutalist 3.90,
       Tangerine 4.31 against a 4.5 floor), which is exactly why the fill rung exists
       rather than being the accent everywhere. The numbers are recomputed here from the
       stylesheet's own values, so a theme cannot be added or retuned past this. */
    const css = read(SHEET);
    const themes = ["brutalist", "soft-pop", "tangerine"];
    const missing: string[] = [];
    for (const theme of themes) {
      const block = css.match(new RegExp(`\\.bf-shell\\[data-bf-theme="${theme}"\\]\\s*\\{([^}]*)\\}`));
      if (!block) {
        missing.push(`${theme}: no token block`);
        continue;
      }
      const pick = (name: string) => block[1].match(new RegExp(`--bf-${name}:\\s*([^;]+)`))?.[1]?.trim();
      const accent = pick("accent");
      const fill = pick("accent-fill");
      const dark = pick("accent-dark");
      if (!accent || !fill || !dark) {
        missing.push(`${theme}: accent ${accent} fill ${fill} dark ${dark}`);
        continue;
      }
      // light text on the surface that carries it
      expect(round(contrast(hex(fill), CARD)), `${theme}: white text on --bf-accent-fill`).toBeGreaterThanOrEqual(4.5);
      // accent text on its own wash, at both tints this sheet uses
      const own8 = composite(hex(accent), 0.08, CARD);
      const own10 = composite(hex(accent), 0.1, CARD);
      expect(round(contrast(hex(dark), own8)), `${theme}: --bf-accent-dark on its 8% wash`).toBeGreaterThanOrEqual(4.5);
      expect(round(contrast(hex(dark), own10)), `${theme}: --bf-accent-dark on its 10% wash`).toBeGreaterThanOrEqual(4.5);
      // the identity hue still has to be visible as a non-text indicator
      expect(round(contrast(hex(accent), CARD)), `${theme}: --bf-accent as an indicator`).toBeGreaterThanOrEqual(3);
    }
    expect(missing).toEqual([]);
  });

  it("keeps the destructive red and the beta violet, which were measured and do pass", () => {
    // Checked rather than assumed, and both cleared, so neither was touched.
    expect(round(contrast(hex("#c5221f"), composite(hex("#c5221f"), 0.08, CARD)))).toBeGreaterThanOrEqual(4.5);
    expect(round(contrast(hex("#6d28d9"), composite(hex("#6d28d9"), 0.1, CARD)))).toBeGreaterThanOrEqual(4.5);
    expect(read(SHEET)).toContain("#c5221f");
    expect(read(SHEET)).toContain("#6d28d9");
  });
});

describe("a focused control is visibly focused", () => {
  it("never lets the soft halo be the only sign of focus", () => {
    // --bf-focus-ring is 0 0 0 4px rgba(47,107,255,0.12): 1.17:1 on a card, 1.16:1 on the
    // ground, against a 3:1 floor. No alpha below 0.78 reaches it. The token survives as
    // decoration behind a border that also changes; it may not stand alone.
    const tokens = read(TOKENS);
    const ring = tokens.match(/--bf-focus-ring:\s*0 0 0 4px rgba\(47, 107, 255, ([\d.]+)\)/);
    expect(ring, "--bf-focus-ring is declared").not.toBeNull();
    const halo = composite(ACCENT, parseFloat(ring![1]), CARD);
    expect(round(contrast(halo, CARD))).toBeLessThan(3);

    const soleIndicator: string[] = [];
    sheet.walkRules((rule) => {
      if (inReduce(rule)) return;
      if (!rule.selectors.some((s) => /:focus(-visible|-within)?\b/.test(s))) return;
      const decls = rule.nodes.filter((n): n is Declaration => n.type === "decl");
      const usesHalo = decls.some((d) => d.prop === "box-shadow" && /--bf-focus-ring/.test(d.value));
      if (!usesHalo) return;
      // acceptable companions: a real outline, or a border colour change to the accent
      const hasOutline = decls.some((d) => /^outline$/.test(d.prop) && !/^(none|0)$/.test(norm(d.value)));
      /* The accent is a TOKEN now (--bf-accent), because it was a literal in 88 places
         here and a theme can re-point a token but cannot reach a hex. A border that
         changes to the accent is the same companion however it is spelled, so all three
         spellings count. */
      const hasBorder = decls.some(
        (d) => /^border(-\w+)?-color$|^border$/.test(d.prop) && /#2f6bff|--bf-focus-ink|--bf-accent/i.test(d.value)
      );
      if (!hasOutline && !hasBorder) soleIndicator.push(`${rule.source?.start?.line}: ${norm(rule.selector).slice(0, 90)}`);
    });
    expect(soleIndicator).toEqual([]);
  });

  it("uses an outline for the indicator, which a stray box-shadow cannot beat", () => {
    // Five focus rings stopped painting because an unrelated rule set box-shadow on the
    // same element later or more specifically -- `.hs-btn.hs-btn-primary` two lines below
    // `.hs-btn:focus-visible`, `.hs-rail-btn.active`, `.acct-plan.selected`. An outline is
    // immune to that whole class of collision.
    expect(read(TOKENS)).toMatch(/--bf-focus-ink:\s*#2f6bff/);
    expect(round(contrast(ACCENT, CARD))).toBeGreaterThanOrEqual(3);
    expect(round(contrast(ACCENT, GROUND))).toBeGreaterThanOrEqual(3);

    // every rule that suppresses the outline must put one back, in the same rule
    const suppressed: string[] = [];
    sheet.walkRules((rule) => {
      if (inReduce(rule)) return;
      const decls = rule.nodes.filter((n): n is Declaration => n.type === "decl");
      const kills = decls.find((d) => d.prop === "outline" && /^(none|0)$/.test(norm(d.value)));
      if (!kills) return;
      const restores = decls.some((d) => d.prop === "outline" && !/^(none|0)$/.test(norm(d.value)));
      const isInput = rule.selectors.every((s) => /input|select|textarea|:focus-within/.test(s));
      const hasBorder = decls.some((d) => /^border(-\w+)?-color$|^border$/.test(d.prop) && /#2f6bff|--bf-accent/i.test(d.value));
      if (!restores && !(isInput && hasBorder)) {
        suppressed.push(`${kills.source?.start?.line}: ${norm(rule.selector).slice(0, 90)}`);
      }
    });
    expect(suppressed).toEqual([]);
  });
});

describe("a prefixed rest-state rule never silences the state it sits next to", () => {
  it("re-declares every state an earlier sheet expressed one class above its rest state", () => {
    // THE TRAP, stated once. Prefixing `.thead th` with .bf-shell lifts it from (0,2,2) to
    // (0,3,2). Almost every state rule in this repo is written exactly one class above its
    // rest state -- `.thead th.sorted` is also (0,3,2) -- so the prefix lands LEVEL with
    // the state, and a tie goes to whichever sheet loads later. This one does. The state
    // then stops rendering, and neither file looks wrong on its own.
    //
    // Found on: the reveal cascade's own `.in` arrival; `.hs-chip.active` and
    // `.hs-btn-icon.active`, which made an applied filter indistinguishable from an
    // unapplied one on six index pages; and `.sorted`, which is a DATA state and so was
    // missed by an audit that only enumerated interaction states.
    //
    // The guard is narrow on purpose: for the specific states below, if this sheet styles
    // the rest element it must also style the state.
    const text = read(SHEET);
    const MUST_REDECLARE: Array<[string, string]> = [
      [".hs-index .hs-table thead th", ".hs-index .hs-table thead th.sorted"],
      [".hs-index .hs-chip", ".hs-index .hs-chip.active"],
      [".hs-index .hs-btn-icon", ".hs-index .hs-btn-icon.active"],
      [".hs-index .hs-view", ".hs-index .hs-view.active"],
      [".settings-rx .settings-nav-item", ".settings-rx .settings-nav-item.active"],
      [".hs-index .hs-row-action", ".hs-index .hs-row-action.edit:hover"]
    ];
    const missing = MUST_REDECLARE.filter(([rest, state]) => text.includes(rest) && !text.includes(state)).map(([, state]) => state);
    expect(missing).toEqual([]);
  });

  it("gives the sorted column head an ink that differs from an unsorted one", () => {
    const rules: Rule[] = [];
    sheet.walkRules((r) => {
      if (!inReduce(r)) rules.push(r);
    });
    const inkOf = (needle: string) => {
      for (const r of rules) {
        if (!r.selectors.some((s) => norm(s).endsWith(needle))) continue;
        const c = r.nodes.find((n): n is Declaration => n.type === "decl" && n.prop === "color");
        if (c) return norm(c.value);
      }
      return null;
    };
    const unsorted = inkOf(".hs-index .hs-table thead th");
    const sorted = inkOf(".hs-index .hs-table thead th.sorted");
    expect(unsorted, "the rest head sets an ink").not.toBeNull();
    expect(sorted, "the sorted head sets an ink").not.toBeNull();
    expect(sorted).not.toBe(unsorted);
    // and the sorted ink must itself be legible
    expect(round(contrast(hex(sorted!), CARD))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the stylesheet cannot have hidden anything", () => {
  it("uses only the four documented mechanisms that can remove content", () => {
    // A stylesheet cannot delete a label, a column or an action. It can only make one
    // unreachable, and the ways are a closed list. Over 2,900 lines this sheet uses
    // exactly four: one overflow (on the index card, where the table wrap inside it
    // scrolls, verified in a browser -- all 13 Projects columns reachable at 375px), the
    // two halves of one mask (a scroll affordance on the Settings rail, verified: every
    // one of the 14 categories fully visible at some scroll offset), and one display:none
    // on a decorative pointer glow inside a reduced-motion block.
    const found: Record<string, string[]> = {};
    const note = (k: string, v: string) => {
      (found[k] ||= []).push(v);
    };
    sheet.walkDecls((d) => {
      let p = d.parent as { type?: string; name?: string; parent?: unknown } | undefined;
      while (p) {
        if (p.type === "atrule" && p.name === "keyframes") return;
        p = p.parent as typeof p;
      }
      const v = norm(d.value);
      const where = `${d.source?.start?.line}: ${norm((d.parent as Rule)?.selector ?? "?").slice(0, 70)}`;
      if (d.prop === "display" && /^none/.test(v)) note("display:none", where);
      if (d.prop === "visibility" && /^(hidden|collapse)/.test(v)) note("visibility", where);
      if (d.prop === "opacity" && parseFloat(v) === 0) note("opacity:0", where);
      if (d.prop === "content") note("content", where);
      if (/^overflow(-x|-y)?$/.test(d.prop) && /hidden|clip/.test(v)) note("overflow", where);
      if (/^(-webkit-)?mask(-image)?$/.test(d.prop)) note("mask", where);
      if (d.prop === "clip-path") note("clip-path", where);
      if (d.prop === "-webkit-line-clamp" || d.prop === "text-overflow") note("truncation", where);
      if (/^(width|height|max-width|max-height)$/.test(d.prop) && parseFloat(v) === 0) note("zero box", where);
    });
    expect(Object.keys(found).sort()).toEqual(["display:none", "mask", "overflow"]);
    expect(found["overflow"]).toHaveLength(1);
    expect(found["mask"]).toHaveLength(2);
    expect(found["display:none"]).toHaveLength(1);
    // the one display:none is decoration, and only under reduced motion
    expect(found["display:none"][0]).toMatch(/dx-cursor/);
  });
});
