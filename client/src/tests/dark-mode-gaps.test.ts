/**
 * Dark mode, where it had not reached (2026-09-17).
 *
 * Dark mode swaps the semantic --bf-* layer (app-shell-daylight.css §29b). Anything that
 * paints around that layer keeps its light value, and the quiet way to do that is a
 * fallback on a token nothing declares: `var(--brand, #2f6bff)` reads like a default,
 * but with --brand undeclared the literal IS the colour, in every mode. Four of those
 * were found after the Month calendar's weekend days turned out light gray in dark mode:
 * the schedule import dialog's drop zone (twice) and Cancel button, and the Meetings
 * panel's error note. The import dialog also sat on the older white dialog panel, so its
 * first step was a white box with light text in dark mode.
 *
 * jsdom applies no CSS (see node-fs-shim.d.ts), so these read the sheets off disk.
 */
import { describe, expect, it } from "vitest";
import postcss, { type Rule } from "postcss";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");
const files = readdirSync(SRC, { recursive: true }).filter((rel) => !rel.includes("node_modules"));
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** A rule's declarations by exact selector, outside any at-rule; later rules overwrite earlier ones. */
const declsIn = (sheet: string, selector: string): Record<string, string> => {
  const out: Record<string, string> = {};
  postcss.parse(read(sheet)).walkRules((rule: Rule) => {
    if (rule.parent?.type === "atrule") return;
    if (rule.selectors.includes(selector))
      rule.walkDecls((decl) => {
        out[decl.prop] = decl.value;
      });
  });
  return out;
};

describe("dark mode's missing pieces", () => {
  it("never falls back to a colour from a token nothing declares", () => {
    const declared = new Set<string>();
    for (const rel of files.filter((f) => f.endsWith(".css"))) {
      for (const match of stripComments(read(rel)).matchAll(/(--[\w-]+)\s*:/g)) declared.add(match[1]!);
    }
    // custom properties a component writes inline or through setProperty count as declared
    for (const rel of files.filter((f) => /\.tsx?$/.test(f))) {
      for (const match of read(rel).matchAll(/["'](--[\w-]+)["']\s*(?:[:\]),])/g)) declared.add(match[1]!);
    }
    const offenders: string[] = [];
    for (const rel of files.filter((f) => f.endsWith(".css"))) {
      const css = stripComments(read(rel));
      for (const match of css.matchAll(/var\(\s*(--[\w-]+)\s*,\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\)|white|black)\s*\)/gi)) {
        if (!declared.has(match[1]!)) offenders.push(`${rel}: var(${match[1]}, ${match[2]})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("paints the schedule import dialog's first step from the semantic layer", () => {
    const RULES = [
      ".sim-dialog",
      ".sim-dialog .project-dialog-header p",
      ".sim-dialog .project-dialog-header .icon-button",
      ".sim-drop",
      ".sim-drop.dragging",
      ".sim-drop svg",
      ".sim-drop span",
      ".sim-working",
      ".sim-working span",
      ".sim-formats div",
      ".sim-formats span",
      ".sim-error",
      ".sim-error p",
      ".sim-actions",
      ".sim-ghost",
      ".sim-ghost:hover:not(:disabled)"
    ];
    const PAINT = /^(background|color|border|border-(top|color))$/;
    const leaks: string[] = [];
    for (const selector of RULES) {
      const decls = declsIn("schedule.css", selector);
      expect(Object.keys(decls).length, selector).toBeGreaterThan(0);
      for (const [prop, value] of Object.entries(decls)) {
        if (!PAINT.test(prop)) continue;
        // no literal colour and none of styles.css's light-only tokens
        if (/#[0-9a-f]{3,8}\b|rgba?\(|var\(--(line|muted|ink|brand|soft|panel)\b/i.test(value))
          leaks.push(`${selector} { ${prop}: ${value} }`);
      }
    }
    expect(leaks).toEqual([]);
    // the panel itself: styles.css's .project-dialog is #fff in every mode
    expect(declsIn("schedule.css", ".sim-dialog").background).toBe("var(--bf-surface)");
    expect(declsIn("schedule.css", ".sim-ghost").color).toBe("var(--bf-ink)");
    expect(declsIn("schedule.css", ".sim-drop svg").color).toBe("var(--bf-accent)");
  });

  /* THE BODY-PORTAL PANELS stayed light in dark mode: BuildFlow AI (reported 2026-09-17 with two
     screenshots) and, asked for straight after, the Contacts/Companies/Deal record panel. Two
     things had to be true of each and neither was: a portal cannot see
     `.bf-shell[data-bf-mode="dark"]`, where the dark palette is declared — and the skin's whole
     treatment of both (104 rules and 17 more for the proposal card; 125 and 21 for the record) was
     fenced to `:not([data-bf-mode="dark"])`, so dark mode fell through to hs-breeze.css's and
     hs-contacts.css's own light literals. */
  it("paints the panels that live on the body from the mode they are in", () => {
    const skin = read("app-shell-client-desk.css");
    const FENCE = 'body:has(.app-shell.hs-shell.bf-shell:not([data-bf-mode="dark"]):not([data-bf-theme="dark"]))';
    /* A rule that only READS tokens may not be fenced to one mode. What is left fenced is the two
       blocks that exist to DECLARE a light palette — one per portal. */
    const fenced = skin
      .split("\n")
      .filter((line) => line.includes(FENCE) && /\.bf-breeze|\.bfai-|\.hs-record/.test(line))
      .map((line) => line.trim())
      .sort();
    expect(fenced).toEqual([`${FENCE} .bf-breeze {`, `${FENCE} .hs-record-layer {`].sort());
    for (const portal of [".bf-breeze", ".hs-record-layer"]) {
      // the dark palette each portal could not inherit is declared for it, by mode and by system
      for (const mode of ["dark", "system"]) {
        expect(skin, `${portal} @ ${mode}`).toContain(`body:has(.app-shell.hs-shell.bf-shell[data-bf-mode="${mode}"]) ${portal}`);
      }
      const dark = declsIn("app-shell-client-desk.css", `body:has(.app-shell.hs-shell.bf-shell[data-bf-mode="dark"]) ${portal}`);
      // the same values app-shell-daylight.css section 29b decides dark mode with
      expect(dark["--bf-surface"], portal).toBe("#1b1b19");
      expect(dark["--bf-ink"], portal).toBe("#f4f3f0");
      expect(dark["--bf-line-solid"], portal).toBe("#33332f");
      expect(dark["color-scheme"], portal).toBe("dark");
    }
  });

  it("keeps the Meetings panel's error note in the bad tone, past the Dashboard's muted-note rule", () => {
    expect(declsIn("meetings-panel.css", ".bfmt-note.is-error").color).toBe("var(--bf-color-bad)");
    /* On the Dashboard the skin grays every .bfmt-note at five classes; the error note has
       to outrank that, or a failed calendar read reads like a hint. */
    const S = ".app-shell.hs-shell.bf-shell .dash-rx";
    expect(declsIn("app-shell-client-desk.css", `${S} .bfmt-note`).color).toBe("var(--bf-ink-muted)");
    expect(declsIn("app-shell-client-desk.css", `${S} .bfmt-note.is-error`).color).toBe("var(--bf-color-bad)");
  });
});
