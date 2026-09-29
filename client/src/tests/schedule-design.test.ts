/**
 * The Schedule category on the Dashboard's design (2026-09-28, skin section 89).
 *
 * Asked for once the Dashboard's EduLearn design was kept: "lets keep this design and move on to
 * redesigning the pages within the "Schedule" category". The pages' markup is unchanged, so this
 * reads section 89 off disk (jsdom applies no CSS): it reaches the Schedule pages and nothing
 * else, keeps its colours to light mode and its periwinkle to the Default Colors set, writes each
 * light rule again for System on a light OS, pins the landing's board as well as the page (the
 * admin-kit sheet pins ink on every `.dash-rx`), heads every page with the banner and its picture,
 * and marks today and the Gantt's range in the accent.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import postcss, { type ChildNode, type Declaration, type Rule } from "postcss";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const skin = postcss.parse(readFileSync(join(SRC, "app-shell-client-desk.css"), "utf8"));
const section: ChildNode[] = (() => {
  const nodes = skin.nodes;
  const start = nodes.findIndex((n) => n.type === "comment" && n.text.includes("89. THE SCHEDULE CATEGORY ON THE DASHBOARD'S DESIGN"));
  if (start < 0) throw new Error("skin section 89 is missing");
  const next = nodes.findIndex((n, i) => i > start && n.type === "comment" && /^=+\s*\n\s*(9\d)\./.test(n.text));
  return nodes.slice(start + 1, next < 0 ? undefined : next);
})();
type Found = { rule: Rule; media: string | null };
const rules: Found[] = [];
for (const node of section) {
  if (node.type === "rule") rules.push({ rule: node, media: null });
  if (node.type === "atrule" && node.name === "media") node.walkRules((r) => void rules.push({ rule: r, media: node.params }));
}
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const selectorsOf = ({ rule }: Found) => rule.selectors.map(norm);
const decls = (rule: Rule) =>
  Object.fromEntries(rule.nodes.filter((n): n is Declaration => n.type === "decl").map((d) => [d.prop, norm(d.value)]));
const find = (selector: string, media: RegExp | null = null) =>
  rules.find((f) => selectorsOf(f).includes(selector) && (media ? media.test(f.media ?? "") : f.media === null));
const S = ".app-shell.hs-shell.bf-shell";
const LIGHT = '[data-bf-mode="light"]';
const SYSTEM = '[data-bf-mode="system"]';
const DEFAULT_SET = ':is([data-bf-colors="default"], :not([data-bf-colors]))';
/** A colour written out; what an SVG says inside url() is a picture or a shape, not a colour. */
const literal = (value: string) => /#[0-9a-f]{3,8}\b|rgba?\(\s*\d/i.test(value.replace(/url\([^)]*\)/g, ""));
const lightFenced = ({ rule, media }: Found) =>
  rule.selectors.every((one) => one.includes(LIGHT) || (one.includes(SYSTEM) && /prefers-color-scheme: light/.test(media ?? "")));

describe("the Schedule category's sheet (skin section 89)", () => {
  it("reaches the Schedule pages and nothing else", () => {
    expect(rules.length).toBeGreaterThan(80);
    expect(rules.flatMap(selectorsOf).filter((one) => !one.includes(".sched-rx"))).toEqual([]);
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
    expect(light.length).toBeGreaterThanOrEqual(4);
    for (const found of light) {
      const system = selectorsOf(found).map((one) => one.replace(LIGHT, SYSTEM));
      const twin = rules.find((f) => /prefers-color-scheme: light/.test(f.media ?? "") && selectorsOf(f).join("|") === system.join("|"));
      expect(twin, selectorsOf(found)[0]!.slice(0, 80)).toBeTruthy();
      expect(decls(twin!.rule)).toEqual(decls(found.rule));
    }
  });

  it("pins the landing's board as well as the page, and the Gantt's own set on the chart", () => {
    // the admin-kit sheet pins ink and line on every .dash-rx, so a value on the page alone would stop there
    const neutrals = rules.find((f) => f.media === null && selectorsOf(f).includes(`${S}${LIGHT} .sched-rx`));
    expect(selectorsOf(neutrals!)).toContain(`${S}${LIGHT} .sched-rx .dash-rx.hs-home.sched-board-host`);
    expect(decls(neutrals!.rule)["--bf-ink"]).toBe("#1b2150");
    expect(decls(find(`${S}${LIGHT} .sched-rx .gantt`)!.rule)["--hsx-mut"]).toBe("#5f6687");
  });

  it("heads every page with the Dashboard's banner and the Schedule's picture, served from public/", () => {
    const banner = decls(find(`${S} .sched-rx .schedule-title-row.dx-hero`)!.rule);
    expect(banner.background).toContain('url("/dashboard/schedule-art.svg")');
    expect(banner.background).toContain("var(--edl-hero)");
    // the older sheets' 40-44ch hero measure would squeeze it into a column
    expect(banner).toMatchObject({ "max-width": "none", flex: "none" });
    expect(existsSync(join(SRC, "..", "public", "dashboard", "schedule-art.svg"))).toBe(true);
    // a narrow window keeps the words and lets the picture go
    expect(decls(find(`${S} .sched-rx .schedule-title-row.dx-hero`, /max-width: 760px/)!.rule).background).toBe("var(--edl-hero)");
  });

  it("marks today and the Gantt's range in the accent, and gives the one primary action the banner's button", () => {
    const today = decls(find(`${S} .sched-rx .sched-cal-cell.is-today`)!.rule);
    expect(today["box-shadow"]).toContain("var(--bf-color-accent-fill)");
    expect(decls(find(`${S} .sched-rx .sched-cal-cell.is-today .sched-cal-daynum`)!.rule).background).toBe("var(--bf-color-accent-fill)");
    expect(decls(find(`${S} .sched-rx.gantt-page.gantt-chart .gantt-seg`)!.rule)["--bfm-pill-fill"]).toBe("var(--bf-color-accent-fill)");
    expect(decls(find(`${S} .sched-rx .sched-new-activity`)!.rule).background).toBe("var(--edl-cta)");
    expect(decls(find(`${S} .sched-rx .gantt .gantt-marker.is-today .gantt-marker-pill`)!.rule).background).toBe("var(--edl-cta)");
  });
});
