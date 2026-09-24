/**
 * What the Gantt's redesign rests on, as arithmetic.
 *
 * The chart was rebuilt on 2026-09-14 to the reference Gantt's language, and the two
 * decisions that make it work are colour decisions jsdom cannot see:
 *
 *   - the bars became SOLID. That is only legible because every status colour in the
 *     palette clears the 3:1 a non-text indicator carries against the white card. The
 *     pale `fill` tint the old bars used does not, which is why the fill moved to `color`;
 *   - each group's dot and summary rule report the project's schedule health, so those
 *     four colours carry the same floor.
 *
 * The cascade half of the redesign — the bar not clipping, so the label can sit outside
 * it — is asked in scripts/check-css.mjs, which resolves this sheet the way a browser does.
 *
 * It lives in this folder rather than src/tests/ because boundary.test.ts keeps the schedule
 * folder self-contained: nothing outside it may import from it except App.tsx. A test about
 * the Gantt is not an exception to that rule.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { STATUS_PALETTE } from "./statusPalette";

const HERE = dirname(fileURLToPath(import.meta.url));

/* The palette carries the Colors set's hint tokens (`var(--bf-color-ok)`), not literals, so
   the numbers below come from resolving each token against the skin's Default set — the first
   declaration of a token in app-shell-client-desk.css is the light Default value. */
const SKIN = readFileSync(join(HERE, "..", "app-shell-client-desk.css"), "utf8");
const TOKENS: Record<string, string> = {};
for (const match of SKIN.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
  if (!(match[1] in TOKENS)) TOKENS[match[1]] = match[2].toLowerCase();
}
const resolve = (value: string): string => {
  let out = value.trim();
  for (let hops = 0; hops < 8; hops += 1) {
    const ref = out.match(/^var\(--([a-z0-9-]+)\)$/);
    if (!ref) break;
    const next = TOKENS[ref[1]];
    if (!next) throw new Error(`no Default value for --${ref[1]} in the skin`);
    out = next;
  }
  return out;
};

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
  const l1 = luminance(hex(resolve(a)));
  const l2 = luminance(hex(resolve(b)));
  return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
};

/** The card the chart is drawn on. */
const CARD = "#ffffff";
/** WCAG 2.1 for a non-text indicator that carries meaning. */
const INDICATOR_FLOOR = 3;

describe("a solid Gantt bar is legible in every status", () => {
  it("clears the indicator floor for each status the palette can put on the chart", () => {
    const statuses = Object.values(STATUS_PALETTE);
    expect(statuses.length).toBeGreaterThan(5);
    for (const status of statuses) {
      expect(contrast(status.color, CARD), `${status.name} bar (${status.color}) on the card`).toBeGreaterThanOrEqual(INDICATOR_FLOOR);
    }
  });

  /**
   * And the reason the bars are filled with `color` rather than `fill`: the tints are 8-to-
   * 10-percent washes built to sit UNDER dark text, so as a bar on a white card they say
   * nothing. This is the measurement that moved the fill, kept so nobody moves it back.
   */
  it("shows why the pale tint could not be the fill", () => {
    const failing = Object.values(STATUS_PALETTE).filter((status) => contrast(status.fill ?? status.color, CARD) < INDICATOR_FLOOR);
    expect(failing.length).toBeGreaterThan(0);
  });
});

describe("a group's dot and rule report its project's health", () => {
  /** Read off the page so the test cannot drift from the map it is about. */
  const healthColours = () => {
    const block = readFileSync(join(HERE, "pages/GanttPage.tsx"), "utf8").match(
      /const GROUP_HEALTH_COLOUR: Record<string, string> = \{([\s\S]*?)\};/
    );
    expect(block, "GROUP_HEALTH_COLOUR not found in GanttPage.tsx").toBeTruthy();
    return Object.fromEntries(
      [...block![1].matchAll(/"?([A-Za-z ]+)"?:\s*"(var\(--[a-z0-9-]+\)|#[0-9a-f]{6})"/g)].map((m) => [m[1].trim(), m[2]])
    );
  };

  it("covers all four values the shared Project type can hold", () => {
    // shared/src/index.ts: scheduleHealth: "On Track" | "Monitor" | "At Risk" | "Complete"
    expect(Object.keys(healthColours()).sort()).toEqual(["At Risk", "Complete", "Monitor", "On Track"]);
  });

  it("clears the indicator floor on the card for each of them", () => {
    for (const [health, colour] of Object.entries(healthColours())) {
      expect(contrast(colour, CARD), `${health} (${colour}) on the card`).toBeGreaterThanOrEqual(INDICATOR_FLOOR);
    }
  });

  it("keeps the four apart, so a dot says which health it means", () => {
    const colours = Object.values(healthColours()).map(resolve);
    expect(new Set(colours).size).toBe(colours.length);
  });
});
