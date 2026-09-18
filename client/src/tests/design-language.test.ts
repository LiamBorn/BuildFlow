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
/** The hue in degrees, so "could this colour be mistaken for that one" is answerable. */
const hue = (c: RGB): number => {
  const [r, g, b] = c.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const raw = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round(raw * 60 + 360) % 360;
};
const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
/** Saturation, which is how a muted trade colour is told from a saturated status tone. */
const sat = (c: RGB): number => {
  const [r, g, b] = c.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const l = (max + min) / 2;
  return Math.round(((max - min) / (l > 0.5 ? 2 - max - min : max + min)) * 100) / 100;
};

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
/**
 * The sheet's surfaces and inks are tokens now, so a colour read out of a rule can be
 * `var(--bf-ink)`. This resolves one level of that against design-tokens.css rather than
 * hard-coding the light values here, so the guard follows the palette instead of a copy
 * of it. Dark mode redefines the same names in section 29; the LIGHT value is what the
 * assertions below are about, which is why it reads the `:root` block.
 */
const TOKEN_VALUES: Record<string, string> = Object.fromEntries(
  [...read(TOKENS).matchAll(/(--bf-[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)].map((m) => [m[1], m[2]])
);
const resolveColour = (value: string): string => {
  const token = value.match(/var\(\s*(--bf-[\w-]+)/);
  return token ? (TOKEN_VALUES[token[1]] ?? value) : value;
};

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

  it("gives every Colors set an accent trio and four tones that hold their own contrast", () => {
    /* The five whole-palette themes this used to measure were removed on 2026-09-16: the
       Preferences panel offers COLOUR SETS now, which supply only the hints (skin §47), so
       the same questions are asked of each set. Default is monochrome and Blue overrides
       only the hints that are black in Default, so a set is read as the base plus its
       override — exactly how the cascade resolves it. */
    expect(read(SHEET)).not.toMatch(/data-bf-theme="(red|purple|green)"/);
    const skin = read("app-shell-client-desk.css");
    const blockWith = (selector: string, marker: string) => {
      let from = 0;
      for (;;) {
        const i = skin.indexOf(selector, from);
        expect(i, `${selector} carrying ${marker}`).toBeGreaterThan(-1);
        const open = skin.indexOf("{", i);
        const body = skin.slice(open + 1, skin.indexOf("}", open));
        if (body.includes(marker)) return body;
        from = i + 1;
      }
    };
    const base = blockWith("body:has(.app-shell.hs-shell.bf-shell)", "--bf-color-accent:");
    const blue = blockWith('body:has(.app-shell.hs-shell.bf-shell[data-bf-colors="blue"])', "--bf-color-accent:");
    const pick = (block: string, name: string) => block.match(new RegExp(`--bf-color-${name}:\\s*([^;]+)`))?.[1]?.trim();
    const sets: Array<[string, string]> = [
      ["Default", ""],
      ["Blue", blue]
    ];
    for (const [name, override] of sets) {
      const tok = (key: string) => pick(override, key) ?? pick(base, key);
      const accent = tok("accent")!;
      const fill = tok("accent-fill")!;
      const onAccent = tok("on-accent")!;
      const wash = tok("accent-wash")!;
      expect([accent, fill, onAccent, wash].every(Boolean), `${name}: the accent trio is declared`).toBe(true);
      // its label on the fill that carries it
      expect(round(contrast(hex(onAccent), hex(fill))), `${name}: --bf-color-on-accent on the fill`).toBeGreaterThanOrEqual(4.5);
      // the accent as text on its own wash
      expect(round(contrast(hex(accent), hex(wash))), `${name}: the accent on its own wash`).toBeGreaterThanOrEqual(4.5);
      // and as a non-text indicator on the white card
      expect(round(contrast(hex(accent), CARD)), `${name}: the accent on the card`).toBeGreaterThanOrEqual(3);
      // each of the four tones reads on the wash it is paired with
      for (const tone of ["info", "ok", "warn", "bad"]) {
        const ink = tok(tone)!;
        const toneWash = tok(`${tone}-wash`)!;
        expect(round(contrast(hex(ink), hex(toneWash))), `${name}: the ${tone} tone on its wash`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("gives a chart's two series their own colours, which no status tone could be mistaken for", () => {
    /* Colour pass phase two (2026-09-17). Both series were gray, so planned and actual were
       told apart only by position; and five charts had borrowed a STATUS tone for a plain
       comparison, which after phase one meant a planned-versus-actual bar chart read as
       "gray versus warning". The rule this case holds: a series is drawn in a series
       colour, a status tone is only for status, and the two families cannot be confused. */
    const skin = read("app-shell-client-desk.css");
    const blockWith = (selector: string, marker: string) => {
      let from = 0;
      for (;;) {
        const i = skin.indexOf(selector, from);
        expect(i, `${selector} carrying ${marker}`).toBeGreaterThan(-1);
        const open = skin.indexOf("{", i);
        const body = skin.slice(open + 1, skin.indexOf("}", open));
        if (body.includes(marker)) return body;
        from = i + 1;
      }
    };
    const pick = (block: string, name: string) => block.match(new RegExp(`--bf-color-${name}:\\s*([^;]+)`))?.[1]?.trim();
    const READINGS: Array<[string, string, RGB]> = [
      ["light", "body:has(.app-shell.hs-shell.bf-shell)", CARD],
      ["dark", 'body:has(.app-shell.hs-shell.bf-shell[data-bf-mode="dark"])', hex("#1b1b19")]
    ];
    for (const [mode, selector, card] of READINGS) {
      const block = blockWith(selector, "--bf-color-series-1:");
      const one = pick(block, "series-1")!;
      const two = pick(block, "series-2")!;
      // each series is legible as a bar or a line on the card it is drawn on
      expect(round(contrast(hex(one), card)), `${mode}: series-1 on the card`).toBeGreaterThanOrEqual(3);
      expect(round(contrast(hex(two), card)), `${mode}: series-2 on the card`).toBeGreaterThanOrEqual(3);
      // and from each other, which is what a legend asks of them
      expect(round(contrast(hex(one), hex(two))), `${mode}: the two series against each other`).toBeGreaterThanOrEqual(1.15);
      // the second series carries a hue no status tone is near, so it cannot read as one
      const [r, g, b] = hex(two);
      expect(Math.max(r, g, b) - Math.min(r, g, b), `${mode}: series-2 is a colour, not a gray`).toBeGreaterThan(40);
      for (const tone of ["ok", "warn", "bad", "info"]) {
        const value = pick(block, tone)!;
        expect(
          apart(hue(hex(two)), hue(hex(value))),
          `${mode}: series-2 sits ${apart(hue(hex(two)), hue(hex(value)))}deg from the ${tone} tone`
        ).toBeGreaterThanOrEqual(25);
      }
    }

    /* And the derivation that found the five: every charted series in the sources reads a
       series token, unless the tone IS the thing being charted. */
    const ALLOWED_STATUS_SERIES = [
      ["App.tsx", "days", "bad"], // days of delay: the tone is the news
      ["TimeCard.tsx", "value", "ok"] // the efficiency bar, filled per point against its threshold
    ];
    const borrowed: string[] = [];
    for (const file of ["App.tsx", "TimeCard.tsx"]) {
      const source = read(file);
      for (const match of source.matchAll(/<(Bar|Line|Area)\b([\s\S]{0,400}?)\/?>/g)) {
        const element = match[2];
        const token = element.match(/(?:fill|stroke)="var\(--bf-color-([a-z0-9-]+)\)"/)?.[1];
        if (!token || token.startsWith("series-")) continue;
        const key = element.match(/dataKey="([^"]+)"/)?.[1] ?? "(no dataKey)";
        if (ALLOWED_STATUS_SERIES.some(([f, k, t]) => f === file && k === key && token.startsWith(t))) continue;
        borrowed.push(`${file}: <${match[1]} dataKey="${key}"> draws with the ${token} tone`);
      }
    }
    expect(borrowed, "a chart series may not borrow a status tone").toEqual([]);

    /* The other half of the same rule, and the one that made phase two look like it had
       done nothing: the skin PAINTS chart geometry from CSS (that is how the monochrome
       pass reached a chart), and an SVG `fill` written on the element is a presentation
       attribute — the lowest priority there is — so those rules silently beat the series
       token the chart asks for. Any rule that paints geometry has to name a series token;
       the furniture (grid, text, the hover band) is neutral and exempt. */
    const GEOMETRY = ["-bar-rectangle path", "-line-curve", "-line-dot", "-line .recharts-dot", "-active-dot"];
    const painted: string[] = [];
    for (const match of skin.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1].trim().split("\n").at(-1)!.trim();
      const body = match[2];
      if (!GEOMETRY.some((part) => selector.includes(part))) continue;
      for (const decl of body.matchAll(/(fill|stroke):\s*([^;]+)/g)) {
        const value = decl[2].trim();
        // a dot's ring is drawn in the card's own colour so the line reads through it
        if (decl[1] === "stroke" && value.includes("--bf-surface")) continue;
        if (!value.includes("--bf-color-series-")) painted.push(`${selector.slice(-54)} { ${decl[1]}: ${value} }`);
      }
    }
    expect(painted, "a rule that paints chart geometry must name a series token").toEqual([]);
  });

  it("gives each trade its own muted identity, which no status tone could be mistaken for", () => {
    /* Colour pass phase three (2026-09-17). A Month card, a Kanban lane, a milestone
       diamond and the load grid all take their tone from the job's trade (`--sc-tone`,
       from tradeColorVar), and while the eight trade tokens were grays a board could not
       be read by trade at all. The rule: a trade is MUTED and a status tone is SATURATED,
       which is what keeps a trade chip from reading as a warning — hue tells the trades
       apart from each other, saturation tells the two families apart. */
    const skin = read("app-shell-client-desk.css");
    const blockWith = (selector: string, marker: string) => {
      let from = 0;
      for (;;) {
        const i = skin.indexOf(selector, from);
        expect(i, `${selector} carrying ${marker}`).toBeGreaterThan(-1);
        const open = skin.indexOf("{", i);
        const body = skin.slice(open + 1, skin.indexOf("}", open));
        if (body.includes(marker)) return body;
        from = i + 1;
      }
    };
    const pick = (block: string, name: string) => block.match(new RegExp(`--bf-color-${name}:\\s*([^;]+)`))?.[1]?.trim();
    const TRADES = ["concrete", "framing", "mep", "finishes", "sitework", "inspections"];
    const MUTED_CAP = 0.42;
    for (const [mode, selector, card] of [
      ["light", "body:has(.app-shell.hs-shell.bf-shell)", CARD],
      ["dark", 'body:has(.app-shell.hs-shell.bf-shell[data-bf-mode="dark"])', hex("#1b1b19")]
    ] as Array<[string, string, RGB]>) {
      const block = blockWith(selector, "--bf-color-trade-concrete:");
      const values = TRADES.map((trade) => [trade, pick(block, `trade-${trade}`)!] as const);
      for (const [trade, value] of values) {
        // a chip, a dot and a lane rail are all drawn solid, so the indicator floor applies
        expect(round(contrast(hex(value), card)), `${mode}: the ${trade} chip on the card`).toBeGreaterThanOrEqual(3);
        expect(sat(hex(value)), `${mode}: the ${trade} tone is muted`).toBeLessThanOrEqual(MUTED_CAP);
        const h = hue(hex(value));
        expect(h < 190 || h > 262 || sat(hex(value)) < 0.3, `${mode}: ${trade} is out of the blue band`).toBe(true);
      }
      /* The anti-confusion rule, PER PAIR. Five trades cannot all avoid four status hues in
         a circle that also bans the blues, so a trade may share a status's neighbourhood
         only by being markedly less saturated than it. Written this way because the first
         attempt put MEP on a violet at the information tone's own hue (274 against 274) at
         nearly its saturation, which this rule caught. */
      for (const [trade, value] of values) {
        for (const tone of ["ok", "warn", "bad", "info"]) {
          const status = pick(block, tone)!;
          const gap = apart(hue(hex(value)), hue(hex(status)));
          if (gap >= 30) continue;
          expect(
            sat(hex(value)),
            `${mode}: ${trade} sits ${gap}deg from the ${tone} tone, so it has to be far less saturated`
          ).toBeLessThanOrEqual(round(sat(hex(status)) * 0.6));
        }
      }
      // and the trades that carry a hue are far enough apart to be read off a legend
      const hued = values.filter(([, value]) => sat(hex(value)) >= 0.08);
      expect(hued.length, `${mode}: five trades carry a hue`).toBeGreaterThanOrEqual(5);
      for (let i = 0; i < hued.length; i += 1) {
        for (let j = i + 1; j < hued.length; j += 1) {
          const [a, b] = [hued[i], hued[j]];
          expect(apart(hue(hex(a[1])), hue(hex(b[1]))), `${mode}: ${a[0]} and ${b[0]} are too close in hue`).toBeGreaterThanOrEqual(30);
        }
      }
      /* The two calendar marks are not trades: a milestone is the schedule's own marker
         and a holiday is an absence, so both stay neutral. */
      for (const mark of ["milestone", "holiday"]) {
        const [r, g, b] = hex(pick(block, `trade-${mark}`)!);
        expect(r === g && g === b, `${mode}: the ${mark} mark stays neutral`).toBe(true);
      }
    }
  });

  it("gives every identity disc a colour of its own, with initials that hold their contrast", () => {
    /* Colour pass phase four (2026-09-17). Every identity disc in the program — the top
       row's avatar, the Settings member rows, a contact's record, the project marks, the
       workspace tiles, the map's avatar stacks — wears one of four gradients, cycled by
       position or mapped by project type. As gray gradients a list of people or projects
       had nothing to tell them apart by. There are FIVE because one project type used to
       borrow the accent gradient for want of a fifth, which made that mark follow the
       brand instead of standing for the project.

       A disc is a different kind of mark from a status pill or a trade dot: it is a big
       area of colour with WHITE INITIALS in it, so its rule is legibility, not saturation.
       This case also holds the defect phase four fixed — the dark set's faces used to be
       light grays while every avatar rule hard-codes `color: #ffffff`, putting the initials
       between 1.45 and 2.52 in dark mode. */
    const skin = read("app-shell-client-desk.css");
    const blockWith = (selector: string, marker: string) => {
      let from = 0;
      for (;;) {
        const i = skin.indexOf(selector, from);
        expect(i, `${selector} carrying ${marker}`).toBeGreaterThan(-1);
        const open = skin.indexOf("{", i);
        const body = skin.slice(open + 1, skin.indexOf("}", open));
        if (body.includes(marker)) return body;
        from = i + 1;
      }
    };
    const WHITE: RGB = [255, 255, 255];
    for (const [mode, selector] of [
      ["light", "body:has(.app-shell.hs-shell.bf-shell)"],
      ["dark", 'body:has(.app-shell.hs-shell.bf-shell[data-bf-mode="dark"])']
    ] as Array<[string, string]>) {
      const block = blockWith(selector, "--bf-color-face-1:");
      const faces = [1, 2, 3, 4, 5].map((n) => {
        const value = block.match(new RegExp(`--bf-color-face-${n}:\\s*([^;]+)`))?.[1]?.trim();
        expect(value, `${mode}: face ${n} is declared`).toBeTruthy();
        const stops = value!.match(/#[0-9a-f]{6}/gi) ?? [];
        expect(stops.length, `${mode}: face ${n} is a two-stop gradient`).toBe(2);
        const [lighter, darker] = stops as [string, string];
        return { n, lighter, darker };
      });
      for (const { n, lighter, darker } of faces) {
        // the initials sit across the whole disc, so BOTH stops have to hold them
        for (const stop of [lighter, darker]) {
          expect(round(contrast(WHITE, hex(stop))), `${mode}: white initials on face ${n} (${stop})`).toBeGreaterThanOrEqual(4.5);
        }
        const h = hue(hex(lighter));
        expect(h < 190 || h > 262 || sat(hex(lighter)) < 0.3, `${mode}: face ${n} is out of the blue band`).toBe(true);
        // a disc is a big area, so it stays calm rather than shouting
        expect(sat(hex(lighter)), `${mode}: face ${n} stays calm`).toBeLessThanOrEqual(0.5);
      }
      // five identities, far enough apart in hue to be told apart down a list
      const hues = faces.map(({ lighter }) => hue(hex(lighter)));
      for (let i = 0; i < hues.length; i += 1) {
        for (let j = i + 1; j < hues.length; j += 1) {
          expect(apart(hues[i], hues[j]), `${mode}: faces ${i + 1} and ${j + 1} are too close in hue`).toBeGreaterThanOrEqual(30);
        }
      }
    }
  });

  it("says what a KPI's disc and a panel's glyph mean, in one place each", () => {
    /* Colour pass phase five (2026-09-17). Two surfaces, one rule each.

       THE DISC. Every KPI and stat tile already declares its tone in App.tsx
       (`tone: "red"`, `tone: "amber"`, …), but the disc under the glyph was drawn three
       different ways depending on the page: a white disc on a card shadow on the Schedule,
       the tone's own wash on two of the Dashboard's, the neutral wash on the index pages.
       Twelve per-page rules were deleted so section 59 is the only thing that paints one,
       and this case holds that: the disc is its tone's wash, the glyph is the tone, and the
       glyph clears the 3:1 an icon needs on the wash it sits on.

       THE GLYPH. A panel header is structure, not information, so the colour goes on the
       20px glyph and only where the panel's body has one dominant tone. The rest keep a
       quiet ink, and no header names a colour that is not one of the semantic tones. */
    const skin = read("app-shell-client-desk.css");
    const CARD_TONES = ["ok", "bad", "warn", "info", "accent"] as const;

    /* One place paints a toned disc. Any rule outside section 59 that fills a KPI disc
       from a tone is what this catches — that was the defect. */
    const painters: string[] = [];
    for (const match of skin.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1].trim().split("\n").at(-1)!.trim();
      const body = match[2];
      if (!/\.(kpi-icon|cc-stat-ico|hs-kpi-ico|tc-dash-icon)\b/.test(selector)) continue;
      if (!/background:\s*var\(--bf-color-/.test(body)) continue;
      if (selector.includes(":is(.kpi-icon, .cc-stat-ico, .hs-kpi-ico, .tc-dash-icon)")) continue;
      painters.push(selector.slice(-60));
    }
    expect(painters, "only section 59 may fill a toned KPI disc").toEqual([]);

    /* And what it fills them with: a tone's wash under that tone's glyph, legible. */
    const discRules = [...skin.matchAll(/([^{}]*:is\(\.kpi-icon, \.cc-stat-ico, \.hs-kpi-ico, \.tc-dash-icon\)[^{}]*)\{([^{}]*)\}/g)];
    expect(discRules.length, "the disc rule covers every tone a tile can declare").toBeGreaterThanOrEqual(5);
    const base = (() => {
      let from = 0;
      for (;;) {
        const i = skin.indexOf("body:has(.app-shell.hs-shell.bf-shell)", from);
        expect(i).toBeGreaterThan(-1);
        const open = skin.indexOf("{", i);
        const body = skin.slice(open + 1, skin.indexOf("}", open));
        if (body.includes("--bf-color-ok:")) return body;
        from = i + 1;
      }
    })();
    const token = (name: string) => base.match(new RegExp(`--bf-color-${name}:\\s*([^;]+)`))?.[1]?.trim();
    for (const [, selector, body] of discRules) {
      const wash = body.match(/background: var\(--bf-color-([a-z-]+)-wash\)/)?.[1];
      const glyph = body.match(/color: var\(--bf-color-([a-z-]+)\)/)?.[1];
      expect(wash, `${selector.slice(-40)}: the disc is a tone's wash`).toBeTruthy();
      expect(glyph, `${selector.slice(-40)}: the glyph is a tone`).toBe(wash);
      expect(CARD_TONES).toContain(wash as (typeof CARD_TONES)[number]);
      // an icon is a non-text indicator, so 3:1 on the disc it is drawn on
      expect(
        round(contrast(hex(token(glyph!)!), hex(token(`${wash}-wash`)!))),
        `the ${glyph} glyph on its own wash`
      ).toBeGreaterThanOrEqual(3);
    }

    /* The panel glyphs: a quiet ink by default, a semantic tone where the panel has one. */
    const headGlyph = />\s*\.hs-widget-head h2 svg \{([^}]*)\}/g;
    /* The same selector also carries the glyph's SIZE, so only the rules that name a
       colour are the ones this rule is about. */
    const glyphColours = [...skin.matchAll(headGlyph)]
      .map(([, body]) => body.match(/color:\s*([^;]+)/)?.[1]?.trim())
      .filter((colour): colour is string => Boolean(colour));
    expect(glyphColours.length, "the header glyph is coloured in one place plus its panels").toBeGreaterThanOrEqual(2);
    expect(glyphColours).toContain("var(--bf-ink-muted)");
    for (const colour of glyphColours) {
      const named = colour.match(/var\(--bf-(?:color-)?([a-z-]+)\)/)?.[1];
      expect(
        named === "ink-muted" || CARD_TONES.includes(named as (typeof CARD_TONES)[number]),
        `a panel header may only carry a semantic tone, not ${colour}`
      ).toBe(true);
    }
  });

  it("lets OffCanvas win the three contests it has to win", () => {
    /* OffCanvas parks the rail off the side and brings it back on hover or focus. Three
       other rules had a claim on the same properties, and it lost all three before this:

       SIDEBAR STYLE. Floating's `margin: 14px 12px` survived into off-canvas, so the strip
       you aim at was 24px wide and started 14px lower than in the other styles — a moving
       target that depended on an unrelated setting. Measured; margins are zeroed here.

       NAVBAR BEHAVIOR. This rule's `top: var(--hs-topbar-h)` beat the navbar rule on source
       order, so with the bar set to scroll away the rail stayed pinned 56px down for ever.
       It now sits at `top: 0` with the full height and a z-index UNDER the bar's 40, so the
       opaque bar covers its top strip at rest and the rail owns the whole side once the bar
       leaves. One rule, right in both navbar modes, no specificity contest to lose.

       AND THE GUARD ITSELF, which is the one worth keeping. The parked strip needs a visible
       marker, and the obvious build — a ::before with `content`, faded out on hover — needs
       three mechanisms that can remove content for one decorative line. It is an inset
       shadow on the rail instead, which the hover state REPLACES with the lift, so nothing
       is ever hidden. That is the second time this sheet's content rule has produced a
       simpler design than the one I reached for. */
    const css = read(SHEET);
    const rule = css.match(/\.bf-shell\[data-bf-collapse="offcanvas"\]\s+\.sidebar\.hs-rail\s*\{([^}]*)\}/);
    expect(rule, "OffCanvas repositions the rail").not.toBeNull();
    const body = norm(rule![1]);

    expect(body, "a Sidebar Style margin must not change the strip").toMatch(/margin:\s*0/);
    expect(body, "the rail must not hang below a bar that has scrolled away").toMatch(/top:\s*0/);
    expect(body).toMatch(/height:\s*100vh/);
    expect(body, "the parked strip carries its own marker").toMatch(/box-shadow:\s*inset/);

    // under the bar, so the bar hides the rail's top strip instead of the rail covering it
    const railZ = Number(body.match(/z-index:\s*(\d+)/)?.[1]);
    const barRule = css.match(/\.hs-shell\.bf-shell\s+\.topbar\.hs-topbar\s*\{([^}]*)\}/);
    const barZ = Number(norm(barRule?.[1] ?? "").match(/z-index:\s*(\d+)/)?.[1] ?? 40);
    expect(railZ, "the off-canvas rail sits under the top bar").toBeLessThan(barZ || 40);

    // and the strip's width is one token, so the column and the translate cannot disagree
    const column = css.match(/\.bf-shell\[data-bf-collapse="offcanvas"\]\s+\.hs-body\s*\{([^}]*)\}/);
    expect(norm(column![1])).toContain("var(--bf-rail-sliver)");
    expect(body).toContain("var(--bf-rail-sliver)");
  });

  it("widens the rail's own grid column for every style that insets it", () => {
    /* `.hs-body`'s first column is `var(--hs-rail-w)` -- 56px, exactly the rail -- so a
       margin on the rail moves it right and pushes its far edge INTO the page. Measured
       before the fix: Inset put the rail's right edge 10px over the content, Floating 12px.
       Both non-default styles were overlapping the thing the rail sits beside.

       Each inset style therefore has to widen its own column, and the margin has to be
       symmetric so the rail is centred in the space it was given. Measured after: gutters
       10/10 and 12/12, overlap 0 in all three styles. */
    const css = read(SHEET);
    for (const [style, gutter] of [
      ["inset", 20],
      ["floating", 24]
    ] as Array<[string, number]>) {
      const column = css.match(new RegExp(`\\.bf-shell\\[data-bf-sidebar="${style}"\\]\\s+\\.hs-body\\s*\\{([^}]*)\\}`));
      expect(column, `${style} widens the rail's column`).not.toBeNull();
      // the column is the rail plus its own gutters, expressed off the rail token so the
      // two cannot drift apart
      expect(norm(column![1])).toContain("var(--hs-rail-w)");
      expect(norm(column![1])).toContain(`${gutter}px`);

      const rule = css.match(new RegExp(`\\.bf-shell\\[data-bf-sidebar="${style}"\\]\\s+\\.sidebar\\.hs-rail\\s*\\{([^}]*)\\}`));
      expect(rule, `${style} restyles the rail`).not.toBeNull();
      const margin =
        norm(rule![1])
          .match(/margin:\s*([^;]+)/)?.[1]
          ?.trim()
          .split(/\s+/) ?? [];
      // one or two values only: either is symmetric left-to-right, three or four is not
      expect(margin.length, `${style}'s margin is symmetric`).toBeLessThanOrEqual(2);
    }
  });

  it("makes Scroll mode move the rail as well as the bar, and keep the bar's stacking", () => {
    /* Two halves, and the second is the one that made Scroll mode look broken. The rail
       sticks at `top: var(--hs-topbar-h)` because a sticky bar occupies that strip, so with
       the bar scrolling away the rail held a 56px empty gap at the top and sat 56px short of
       the viewport. Measured at a 600px scroll before the fix: bar at -600, rail still
       starting at 56.

       And the bar must be `relative`, not `static`: both scroll away, but an unpositioned box
       ignores z-index, and the bar carries three dropdowns that have to paint above the rail's
       z-index 30. Verified in a browser by hit-testing the open panel, which lands inside it. */
    const css = read(SHEET);
    const bar = css.match(/\.bf-shell\[data-bf-navbar="scroll"\]\s+\.topbar\.hs-topbar\s*\{([^}]*)\}/);
    expect(bar, "Scroll mode repositions the bar").not.toBeNull();
    expect(norm(bar![1]), "static would drop the bar's z-index").toMatch(/position:\s*relative/);
    expect(norm(bar![1])).not.toMatch(/position:\s*static/);

    const rail = css.match(/\.bf-shell\[data-bf-navbar="scroll"\]\s+\.sidebar\.hs-rail\s*\{([^}]*)\}/);
    expect(rail, "Scroll mode moves the rail up with the bar").not.toBeNull();
    expect(norm(rail![1])).toMatch(/top:\s*0/);
    expect(norm(rail![1])).toMatch(/height:\s*100vh/);
  });

  it("makes Full Width release both the measure and the gutter", () => {
    /* Releasing only the 880px cap made the two Page Layout states differ by the window's
       width minus 880 -- dramatic on a wide screen, about ten pixels at the width the
       Preferences panel is usually opened at, which reads as a control that does nothing.
       Full Width therefore releases the page's side padding as well, so it gains room at
       any width. Measured at a 1180px viewport: 880px with 122px gutters becomes 1088px
       with 18px, a gain of 208px. This asserts both halves are present, because dropping
       either one silently returns the control to imperceptible. */
    const css = read(SHEET);
    const full = css.match(/\.bf-shell\[data-bf-layout="full"\]\s+\.dash-rx\s+\.dx-inner\s*\{([^}]*)\}/);
    expect(full, "Full Width releases the measure").not.toBeNull();
    expect(norm(full![1])).toMatch(/max-width:\s*none/);

    const gutter = css.match(/\.bf-shell\[data-bf-layout="full"\]\s+\.dash-rx\s*\{([^}]*)\}/);
    expect(gutter, "Full Width releases the gutter").not.toBeNull();
    const fullPad = Number(norm(gutter![1]).match(/padding-left:\s*(\d+)px/)?.[1]);

    const centered = css.match(/\.bf-shell\[data-bf-layout="centered"\]\s+\.dash-rx\s*\{([^}]*)\}/);
    expect(centered, "Centered states its gutter rather than relying on a missing rule").not.toBeNull();
    const centredPad = Number(norm(centered![1]).match(/padding-left:\s*(\d+)px/)?.[1]);

    expect(fullPad).toBeLessThan(centredPad);
  });

  it("gives the dark palette an ink ladder and an accent that hold their own contrast", () => {
    /* Dark mode is a redefinition of the semantic layer, so "the ladder is legible" stopped
       being one measurement and became two. These are re-derived from section 29's own
       values rather than copied, so retuning the palette cannot slip past.

       The accent is the part that had to change and the reason this test exists: measured on
       the dark surface the shipped accents FAIL -- #2f6bff is 3.83, Tangerine's 4.00,
       Brutalist's 4.42, and Soft Pop's indigo is 2.34, under even the 3:1 floor for a
       non-text indicator. Each theme therefore carries a lighter rung for dark. */
    const css = read(SHEET);
    const darkBlock = css.match(/\.bf-shell\[data-bf-mode="dark"\]\s*\{([^}]*)\}/);
    expect(darkBlock, "section 29 declares a dark palette").not.toBeNull();
    const pick = (name: string) => darkBlock![1].match(new RegExp(`--bf-${name}:\\s*([^;]+)`))?.[1]?.trim();

    const surface = hex(pick("surface")!);
    const raised = hex(pick("surface-raised")!);
    const ground = hex(pick("ground")!);
    // the ink ladder, against all three dark grounds
    for (const [name, floor] of [
      ["ink", 4.5],
      ["ink-muted", 4.5],
      ["ink-faint", 3]
    ] as Array<[string, number]>) {
      const ink = hex(pick(name)!);
      for (const [where, bg] of [
        ["surface", surface],
        ["raised", raised],
        ["ground", ground]
      ] as Array<[string, RGB]>) {
        expect(round(contrast(ink, bg)), `dark --bf-${name} on the ${where}`).toBeGreaterThanOrEqual(floor);
      }
    }

    /* Each Colors set lightens its accent for the dark ground (skin §47's dark twins); the
       per-theme dark accents this used to read went with the themes. */
    const skin = read("app-shell-client-desk.css");
    for (const [name, selector] of [
      ["Default", 'body:has(.app-shell.hs-shell.bf-shell[data-bf-mode="dark"])'],
      ["Blue", 'body:has(.app-shell.hs-shell.bf-shell[data-bf-colors="blue"][data-bf-mode="dark"])']
    ] as Array<[string, string]>) {
      const i = skin.indexOf(selector);
      expect(i, `${name} has a dark reading`).toBeGreaterThan(-1);
      const open = skin.indexOf("{", i);
      const block = skin.slice(open + 1, skin.indexOf("}", open));
      const accent = block.match(/--bf-color-accent:\s*([^;]+)/)?.[1]?.trim();
      expect(accent, `${name} lightens its accent for dark`).toBeTruthy();
      expect(round(contrast(hex(accent!), surface)), `${name}'s dark accent on the dark surface`).toBeGreaterThanOrEqual(4.5);
    }
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
    expect(round(contrast(hex(resolveColour(sorted!)), CARD))).toBeGreaterThanOrEqual(4.5);
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
