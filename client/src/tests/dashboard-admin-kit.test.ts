/**
 * The Dashboard's admin-kit skin, as a test.
 *
 * jsdom applies no CSS, so nothing in the other 430 tests can see a colour or a
 * token that shadows another one. Every assertion here exists because writing
 * this skin produced the defect it describes:
 *
 *   - the light token block sits on `.dash-rx`, a DESCENDANT of the shell the
 *     dark palette is declared on, so it won for the subtree whatever the
 *     specificity said and the Dashboard alone stayed black-on-black in dark
 *     mode. Nothing rendered wrong anywhere else, which is what made it easy to
 *     miss;
 *   - the same shadowing would have flattened two of the five Theme Presets,
 *     because Dark pins dark surfaces and Green (Earth) pins a cream page;
 *   - two of the reference's five chart colours fail the 3:1 floor a legend-read
 *     slice carries: #e8c468 is 1.68 on white and #274754 is 2.00 on the
 *     reference's own dark card.
 *
 * The arithmetic is WCAG 2.1: 3:1 for a non-text indicator, 4.5:1 for text.
 */
import { describe, expect, it } from "vitest";
import postcss, { type Declaration, type Rule } from "postcss";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");
const SHEET = "dashboard-admin-kit.css";
const sheet = postcss.parse(read(SHEET));

/* ---- colour maths, so every number in the comments is re-derived here ----- */
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
const contrast = (a: string, b: string) => {
  const l1 = luminance(hex(a));
  const l2 = luminance(hex(b));
  return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
};

/** The two cards a Dashboard slice is actually read against. */
const LIGHT_CARD = "#ffffff";
/** The Dark theme / dark mode surface, from section 29b of app-shell-daylight.css. */
const DARK_CARD = "#1b1b19";

/** Every `--token: value` this sheet declares, by the selector that declares it. */
const declarations = () => {
  const out: Array<{ sel: string; prop: string; value: string; media: string | null }> = [];
  sheet.walkDecls((d) => {
    if (!d.prop.startsWith("--")) return;
    let media: string | null = null;
    let p = d.parent as { type?: string; params?: string; parent?: unknown } | undefined;
    while (p) {
      if (p.type === "atrule" && /prefers-color-scheme/.test(p.params ?? "")) media = String(p.params);
      p = p.parent as typeof p;
    }
    for (const sel of (d.parent as Rule).selectors ?? []) out.push({ sel: sel.trim(), prop: d.prop, value: d.value.trim(), media });
  });
  return out;
};

describe("the Dashboard skin cannot shadow the palette it sits inside", () => {
  /**
   * The bug this file was written for. A custom property declared on a DESCENDANT
   * beats the same property on an ancestor for that descendant's subtree, whatever
   * either selector's specificity. So any ink or line this sheet pins for light has
   * to be pinned again for dark, and the dark side needs all three of the gestures
   * section 29b uses: an explicit Dark mode, the Dark THEME (dark whatever the mode
   * says) and System when the OS asks.
   */
  it("re-declares every ink and line token on all three dark selectors", () => {
    const decls = declarations();
    const inkAndLine = (d: { prop: string }) => /^--bf-(ink|line)/.test(d.prop);
    const light = decls.filter((d) => inkAndLine(d) && !d.media && /^\.bf-shell \.dash-rx$/.test(d.sel));
    expect(light.length).toBeGreaterThan(0); // the sheet does pin them, or this question is empty

    const covered = (match: (d: { sel: string; media: string | null }) => boolean) =>
      new Set(decls.filter((d) => inkAndLine(d) && match(d)).map((d) => d.prop));

    const explicitDark = covered((d) => !d.media && d.sel.includes('[data-bf-mode="dark"]'));
    const darkTheme = covered((d) => !d.media && d.sel.includes('[data-bf-theme="dark"]'));
    const systemDark = covered((d) => Boolean(d.media) && d.sel.includes('[data-bf-mode="system"]'));

    for (const { prop } of light) {
      expect(explicitDark, `${prop} is pinned for light but not for an explicit dark mode`).toContain(prop);
      expect(darkTheme, `${prop} is pinned for light but not for the Dark theme`).toContain(prop);
      expect(systemDark, `${prop} is pinned for light but not for System + a dark OS`).toContain(prop);
    }
  });

  /**
   * And the surfaces are the Theme Presets' to decide. Pinning --bf-surface here
   * would have made a Green (Earth) Dashboard white and a Dark-theme one light,
   * for the same descendant reason — so the skin takes the reference's radius,
   * hairline, shadow and ink, and leaves what "white" means to the theme.
   */
  it("never pins a surface the five themes own", () => {
    const pinned = declarations()
      .filter((d) => /^--bf-(surface|ground|hover)/.test(d.prop))
      .map((d) => `${d.sel} { ${d.prop}: ${d.value} }`);
    expect(pinned).toEqual([]);
  });

  it("keeps its ink above the text floor on every ground this page paints", () => {
    const tok = (prop: string, dark = false) => {
      const hit = declarations().find(
        (d) => d.prop === prop && !d.media && (dark ? d.sel.includes('[data-bf-mode="dark"]') : /^\.bf-shell \.dash-rx$/.test(d.sel))
      );
      return hit?.value ?? "";
    };
    // light: the card, the default theme's ground, and the reference's own muted surface
    for (const ground of [LIGHT_CARD, "#f5f6fa", "#f5f5f5"]) {
      expect(contrast(tok("--bf-ink"), ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tok("--bf-ink-muted"), ground), `muted ink on ${ground}`).toBeGreaterThanOrEqual(4.5);
    }
    // and the faint rung is the muted rung, which is what took 107 nodes off 3.59
    expect(tok("--bf-ink-faint")).toBe(tok("--bf-ink-muted"));
    for (const ground of [DARK_CARD, "#121211"]) {
      expect(contrast(tok("--bf-ink", true), ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tok("--bf-ink-muted", true), ground), `dark muted ink on ${ground}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  /**
   * The hairline is what this language uses instead of a shadow, so what has to
   * survive is the STEP between card and edge — the reference measures 1.26 light
   * and 1.34 dark against its own #09090b card. Its #27272a on BuildFlow's lighter
   * #1b1b19 is only 1.16, which is why the dark rung is not the reference's hex.
   */
  it("keeps the hairline visible against the card it edges", () => {
    const line = (dark: boolean) =>
      declarations().find(
        (d) =>
          d.prop === "--bf-line-solid" &&
          !d.media &&
          (dark ? d.sel.includes('[data-bf-mode="dark"]') : /^\.bf-shell \.dash-rx$/.test(d.sel))
      )!.value;
    expect(contrast(line(false), LIGHT_CARD)).toBeGreaterThanOrEqual(1.2);
    expect(contrast(line(true), DARK_CARD)).toBeGreaterThanOrEqual(1.3);
  });
});

describe("the Material Readiness slices are legible in both modes", () => {
  /** The four hexes App.tsx hands the chart AND its legend dots. */
  const sliceColours = () => {
    const block = read("App.tsx").match(/const statusColors = \{([\s\S]*?)\};/);
    expect(block, "statusColors not found in App.tsx").toBeTruthy();
    return [...block![1].matchAll(/"(#[0-9a-f]{6})"/g)].map((m) => m[1]);
  };

  it("draws four of them", () => {
    expect(sliceColours()).toHaveLength(4);
  });

  /**
   * A slice is named by a legend, so its colour IS the information and it carries
   * the 3:1 floor for a non-text indicator. Asked of both cards, which is what
   * caught the reference's own chart-3: 9.93 on white, 2.00 on a dark card.
   */
  it("clears the indicator floor on the light card and the dark one", () => {
    for (const colour of sliceColours()) {
      expect(contrast(colour, LIGHT_CARD), `${colour} on the light card`).toBeGreaterThanOrEqual(3);
      expect(contrast(colour, DARK_CARD), `${colour} on the dark card`).toBeGreaterThanOrEqual(3);
    }
  });

  /**
   * And apart from EACH OTHER, because four slices on one ring are compared to a
   * legend. 1.15 is not a round number picked for comfort: holding 3:1 against
   * both a white card and a dark one confines each of the reference's hues to a
   * band about twelve lightness steps wide, and a search over those bands puts
   * the best achievable weakest-pair at 1.19. So 1.15 sits just under the ceiling
   * and well over the 1.10 of the green/blue/amber/red set that shipped here
   * before. A stricter bar is not reachable without giving up one of the floors.
   */
  it("keeps the four apart from each other, so the legend can be read off the ring", () => {
    const colours = sliceColours();
    for (let i = 0; i < colours.length; i += 1) {
      for (let j = i + 1; j < colours.length; j += 1) {
        expect(contrast(colours[i], colours[j]), `${colours[i]} vs ${colours[j]}`).toBeGreaterThanOrEqual(1.15);
      }
    }
  });
});

describe("the skin moves no box and stops at this page", () => {
  /**
   * The board is a stored layout: DASH_COLS 6 × DASH_ROW_UNIT 40 with DASH_GAP 16,
   * and every account has its own saved x/y/w/h. Radius, colour and shadow change
   * no box's size; padding, width, height, gap and the grid do. The one exception
   * is the header border this skin removes, which can only give a scrolling panel
   * body 1px more room than it had.
   */
  it("declares no property that could resize a panel", () => {
    const forbidden = /^(padding|margin|width|height|gap|grid|inset|top|left|right|bottom|font-size|line-height|flex|column)/;
    const offenders: string[] = [];
    sheet.walkDecls((d: Declaration) => {
      if (!forbidden.test(d.prop)) return;
      const sel = ((d.parent as Rule).selector ?? "").replace(/\s+/g, " ");
      // the beam's ring thickness, which paints inside a pseudo-element that has no layout
      if (/::after/.test(sel) && /^(padding|inset)/.test(d.prop)) return;
      offenders.push(`${d.source?.start?.line}: ${sel} { ${d.prop}: ${d.value} }`);
    });
    expect(offenders).toEqual([]);
  });

  it("scopes every rule to the Dashboard", () => {
    const stray: string[] = [];
    sheet.walkRules((rule) => {
      let p = rule.parent as { type?: string; name?: string } | undefined;
      if (p?.type === "atrule" && p.name === "keyframes") return;
      if (p?.type === "atrule" && p.name === "property") return;
      for (const sel of rule.selectors) if (!sel.includes(".dash-rx")) stray.push(sel);
    });
    expect(stray).toEqual([]);
  });

  /** Every animation here is paired with a rule that stops it (RULE R). */
  it("pairs every animation with a reduced-motion rule", () => {
    const inReduce = (node: postcss.Node) => {
      let p = node.parent as { type?: string; params?: string; parent?: unknown } | undefined;
      while (p) {
        if (p.type === "atrule" && /prefers-reduced-motion/.test(p.params ?? "")) return true;
        p = p.parent as typeof p;
      }
      return false;
    };
    const moving = new Set<string>();
    const stopped = new Set<string>();
    sheet.walkDecls((d) => {
      if (!/^animation(-name)?$/.test(d.prop)) return;
      const base = (d.parent as Rule).selectors
        .map((s) => s.replace(/:nth-child\([^)]*\)/g, "").replace(/\s+/g, " ").trim())
        .filter(Boolean);
      for (const sel of base) (inReduce(d) && /^none\b/.test(d.value) ? stopped : moving).add(sel);
    });
    expect(moving.size).toBeGreaterThan(0);
    for (const sel of moving) expect([...stopped], `${sel} animates with no reduced-motion pairing`).toContain(sel);
  });
});
