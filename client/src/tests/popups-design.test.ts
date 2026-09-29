/**
 * The pop-ups and dialogs on the Dashboard's design (2026-09-28, skin section 92).
 *
 * Asked for once every page wore the design: "Redesign the pop-up panels and dialogs too". Nothing
 * about what opens or where changes, so this reads section 92 off disk (jsdom applies no CSS). The
 * point of the section is where its tokens are written: most of these open as portals to <body>,
 * and the top row's menus sit outside every page, so the palette the pages pin on themselves never
 * reached them. Each pop-up's own root carries it — every portal the dark palette is written for
 * included — and the accent's older names are resolved there again. Past that: it reaches the
 * pop-ups and nothing else, keeps its colours to light mode and its periwinkle to the Default
 * Colors set, writes each light rule again for System on a light OS, dims the page to navy, gives
 * the primary action the banner's button, rings a field with focus in the periwinkle, and fills
 * every choice the monochrome pass filled with ink with the periwinkle.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import postcss, { type ChildNode, type Declaration, type Rule } from "postcss";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const skin = postcss.parse(readFileSync(join(SRC, "app-shell-client-desk.css"), "utf8"));
const section: ChildNode[] = (() => {
  const nodes = skin.nodes;
  const start = nodes.findIndex((n) => n.type === "comment" && n.text.includes("92. THE POP-UPS AND DIALOGS ON THE DASHBOARD'S DESIGN"));
  if (start < 0) throw new Error("skin section 92 is missing");
  const next = nodes.findIndex((n, i) => i > start && n.type === "comment" && /^=+\s*\n\s*(\d+)\./.test(n.text));
  return nodes.slice(start + 1, next < 0 ? undefined : next);
})();
type Found = { rule: Rule; media: string | null };
const rules: Found[] = [];
for (const node of section) {
  if (node.type === "rule") rules.push({ rule: node, media: null });
  if (node.type === "atrule" && node.name === "media") node.walkRules((r) => void rules.push({ rule: r, media: node.params }));
}
/** One space for any run of whitespace, and none just inside a bracket (the formatter breaks long :is() lists). */
const norm = (s: string) => s.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
const selectorsOf = ({ rule }: Found) => rule.selectors.map(norm);
const decls = (rule: Rule) =>
  Object.fromEntries(rule.nodes.filter((n): n is Declaration => n.type === "decl").map((d) => [d.prop, norm(d.value)]));
/** Every declaration the section makes for one selector, as the cascade would stack them. */
const declsAt = (selector: string, media: RegExp | null = null): Record<string, string> => {
  const found = rules.filter((f) => selectorsOf(f).includes(selector) && (media ? media.test(f.media ?? "") : f.media === null));
  if (found.length === 0) throw new Error(`no rule for ${selector.slice(-90)}`);
  return Object.assign({}, ...found.map((f) => decls(f.rule)));
};
const S = ".app-shell.hs-shell.bf-shell";
const B = `body:has(${S})`;
const LIGHT = '[data-bf-mode="light"]';
const SYSTEM = '[data-bf-mode="system"]';
const DEFAULT_SET = ':is([data-bf-colors="default"], :not([data-bf-colors]))';
/** The pop-ups' own classes: every selector in the section names one of them. */
const POPUP_CLASS =
  /\.(pdx|schedule-dialog|schedule-job-picker|hs-upd|bfsp|bf-breeze|bfai|bfsel|bfdate|gantt-menu|gantt-drawer|bfnt|cmdk|pref-|user-settings-menu|hs-menu|hs-flyout|bfws|sim-dialog|bftu|hc-assistant-fab|bffb)/;
/** A colour written out; what an SVG says inside url() is a picture or a shape, not a colour. */
const literal = (value: string) => /#[0-9a-f]{3,8}\b|rgba?\(\s*\d/i.test(value.replace(/url\([^)]*\)/g, ""));
const lightFenced = ({ rule, media }: Found) =>
  rule.selectors.every((one) => one.includes(LIGHT) || (one.includes(SYSTEM) && /prefers-color-scheme: light/.test(media ?? "")));
/** The roots the palette is written on: the list inside `:is(...)` of the section's first rule. */
const ROOTS = (() => {
  const first = rules[0]!;
  const list = selectorsOf(first)[0]!.match(/:is\(([^)]*)\)\s*$/)?.[1] ?? "";
  return list.split(",").map((one) => one.trim());
})();

describe("the pop-ups' sheet (skin section 92)", () => {
  it("reaches the pop-ups and nothing else", () => {
    expect(rules.length).toBeGreaterThan(20);
    expect(rules.flatMap(selectorsOf).filter((one) => !POPUP_CLASS.test(one))).toEqual([]);
  });

  it("writes the palette on every pop-up's own root, every portal that has a dark palette of its own included", () => {
    expect(ROOTS.length).toBeGreaterThanOrEqual(12);
    // the portals section 71 writes the dark palette for: a portal cannot see the shell's mode
    const dark = skin.nodes.find((n): n is Rule => n.type === "rule" && n.selector.includes(`body:has(${S}[data-bf-mode="dark"]) .pdx,`));
    const portals = dark!.selectors.map(norm).map((one) => one.replace(`body:has(${S}[data-bf-mode="dark"]) `, ""));
    expect(portals.filter((one) => one.startsWith(".") && !one.includes(" ")).filter((one) => !ROOTS.includes(one))).toEqual([]);
    // the three palette rules share the one list, so no root gets a part of it
    const on = (prefix: string) => rules.find((f) => f.media === null && selectorsOf(f)[0]!.startsWith(prefix));
    for (const prefix of [`${B} :is(`, `body:has(${S}${LIGHT}) :is(`, `body:has(${S}${LIGHT}${DEFAULT_SET}) :is(`]) {
      expect(selectorsOf(on(prefix)!)[0], prefix).toBe(`${prefix}${ROOTS.join(", ")})`);
    }
  });

  it("resolves the accent's older names again on each root, where the portal's own set is", () => {
    const tokens = decls(rules[0]!.rule);
    expect(tokens).toMatchObject({
      "--bf-accent": "var(--bf-color-accent)",
      "--bf-accent-fill": "var(--bf-color-accent-fill)",
      "--bf-on-accent": "var(--bf-color-on-accent)",
      "--edl-cta": "var(--bf-color-accent-fill)"
    });
  });

  it("keeps its colours to light mode: dark mode draws the same shapes from its own palette", () => {
    const unfenced = rules
      .filter((f) => !lightFenced(f))
      .flatMap(({ rule }) =>
        rule.nodes
          .filter((n): n is Declaration => n.type === "decl" && literal(n.value))
          .map((d) => `${norm(rule.selector).slice(0, 70)} { ${d.prop}: ${d.value.slice(0, 40)} }`)
      );
    expect(unfenced).toEqual([]);
  });

  it("gives the periwinkle to the Default Colors set only", () => {
    const ACCENTED = /^--(bf-color-(accent|on-accent|selection)|bf-focus-ink|edl-(cta|hero|bar|promo))/;
    const outside = rules.flatMap(({ rule }) =>
      rule.nodes
        .filter((n): n is Declaration => n.type === "decl" && ACCENTED.test(n.prop) && literal(n.value))
        .filter(() => !rule.selectors.every((one) => one.includes(DEFAULT_SET)))
        .map((d) => `${d.prop} in ${norm(rule.selector).slice(0, 60)}`)
    );
    expect(outside).toEqual([]);
  });

  it("writes every light rule again for System on a light OS, word for word", () => {
    const light = rules.filter((f) => f.media === null && selectorsOf(f).some((one) => one.includes(LIGHT)));
    expect(light.length).toBeGreaterThanOrEqual(5);
    for (const found of light) {
      const system = selectorsOf(found).map((one) => one.replace(LIGHT, SYSTEM));
      const twin = rules.find((f) => /prefers-color-scheme: light/.test(f.media ?? "") && selectorsOf(f).join("|") === system.join("|"));
      expect(twin, selectorsOf(found)[0]!.slice(0, 80)).toBeTruthy();
      expect(decls(twin!.rule)).toEqual(decls(found.rule));
    }
  });

  it("dims the page under a dialog to navy, and gives the Ask AI button the banner's button on every page", () => {
    const scrim = `body:has(${S}${LIGHT}) :is(.pdx, .schedule-dialog-backdrop, .hs-upd-backdrop, .gantt-drawer-backdrop, .bfsp-scrim, .cmdk-backdrop)`;
    expect(declsAt(scrim).background).toBe("rgba(27, 33, 80, 0.26)");
    expect(declsAt(`${S}${LIGHT} :is(.hc-assistant-fab, .bffb-tab)`).background).toBe("var(--edl-cta)");
  });

  it("gives the primary action the banner's button and rings a field with focus in the periwinkle", () => {
    for (const primary of [
      `${B} .pdx .pdx-actions .pdx-save:not(.pdx-danger)`,
      `${B} .pdx .pdx-actions .primary-button`,
      `${B} .hs-upd-backdrop .hs-upd-btn-primary`,
      `${B} .pref-menu .pref-full`,
      `${B} .bf-breeze .bf-breeze-send`,
      `${B} :is(.schedule-dialog-backdrop, .gantt-drawer-layer) .primary-button`
    ]) {
      expect(declsAt(primary).background, primary).toBe("var(--edl-cta)");
    }
    expect(declsAt(`${B} .pdx .pdx-form input:focus`)["box-shadow"]).toBe("var(--edl-focus)");
    expect(decls(rules[0]!.rule)["--edl-focus"]).toBe("0 0 0 2px var(--bf-color-accent-fill), 0 0 0 5px var(--bf-color-accent-wash)");
  });

  it("fills every choice the monochrome pass filled with ink with the periwinkle", () => {
    for (const chosen of [
      `${B} .pdx .bffb-kind[aria-checked="true"]`,
      `${B} .bfdate .bfdate-day.is-chosen`,
      `${B} .bfnt .bfnt-tab.is-active`,
      `${B} .bf-breeze .bf-breeze-msg.user .bf-breeze-msg-body`
    ]) {
      expect(declsAt(chosen).background, chosen).toBe("var(--bf-color-accent-fill)");
    }
    for (const group of [`${B} .pref-menu .pref-segmented`, `${B} .bfnt .bfnt-tabs`, `${B} .bf-breeze .bf-breeze-nav`]) {
      expect(declsAt(group)["--bfm-pill-fill"], group).toBe("var(--bf-color-accent-fill)");
    }
    expect(declsAt(`${B} .bfsel .bfsel-item[aria-selected="true"]`).background).toBe("var(--bf-color-accent-wash)");
  });
});
