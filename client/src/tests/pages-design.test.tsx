/**
 * The rest of the program on the Dashboard's design (2026-09-28, skin section 91).
 *
 * Asked for after Bookmarks: "Please continue with the redesign for all the other pages within the
 * BuildFlow Program." Projects, Crews, the Inventory, Field Updates, DelayIQs, Reports, TimeCard and
 * Settings take the Dashboard's EduLearn language. The one change in markup is on the five index
 * pages: the title ⌄ and its actions moved out of the index card to open the page, so they can be its
 * banner above the KPI strip. The first half uses the pages for that; the second reads section 91
 * off disk (jsdom applies no CSS): it reaches the eight pages and nothing else, keeps its colours to
 * light mode and its periwinkle to the Default Colors set, writes each light rule again for System on
 * a light OS, heads every page with the banner and its category's still life, sets the stat tiles on
 * pastel discs, and gives the one primary action the banner's button and every other ink fill the
 * periwinkle.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import postcss, { type ChildNode, type Declaration, type Rule } from "postcss";
import App from "../App";
import { enterDashboard, installAppHarness } from "../test/appHarness";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const skin = postcss.parse(readFileSync(join(SRC, "app-shell-client-desk.css"), "utf8"));
const section: ChildNode[] = (() => {
  const nodes = skin.nodes;
  const start = nodes.findIndex((n) => n.type === "comment" && n.text.includes("91. THE REST OF THE PROGRAM ON THE DASHBOARD'S DESIGN"));
  if (start < 0) throw new Error("skin section 91 is missing");
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
const matching = (selector: string, media: RegExp | null = null) =>
  rules.filter((f) => selectorsOf(f).includes(selector) && (media ? media.test(f.media ?? "") : f.media === null));
/** Every declaration the section makes for one selector, as the cascade would stack them. */
const declsAt = (selector: string, media: RegExp | null = null): Record<string, string> => {
  const found = matching(selector, media);
  if (found.length === 0) throw new Error(`no rule for ${selector.slice(-90)}`);
  return Object.assign({}, ...found.map((f) => decls(f.rule)));
};
const S = ".app-shell.hs-shell.bf-shell";
const LIGHT = '[data-bf-mode="light"]';
const SYSTEM = '[data-bf-mode="system"]';
const DEFAULT_SET = ':is([data-bf-colors="default"], :not([data-bf-colors]))';
const ALL = ":is(.proj-rx, .crew-rx, .inv-rx, .field-rx, .delayIQ-rx, .tc-rx, .reports-page, .settings-rx)";
const INDEX = ":is(.proj-rx, .crew-rx, .inv-rx, .field-rx, .delayIQ-rx, .tc-rx)";
const BANNERS = [
  `${S} :is(.proj-rx, .crew-rx, .inv-rx, .field-rx, .delayIQ-rx) > .hs-index-head`,
  `${S} .tc-rx > .tc-hero`,
  `${S} .reports-page > .page-title`,
  `${S} .settings-rx .settings-page-header`
];
/** A colour written out; what an SVG says inside url() is a picture or a shape, not a colour. */
const literal = (value: string) => /#[0-9a-f]{3,8}\b|rgba?\(\s*\d/i.test(value.replace(/url\([^)]*\)/g, ""));
const lightFenced = ({ rule, media }: Found) =>
  rule.selectors.every((one) => one.includes(LIGHT) || (one.includes(SYSTEM) && /prefers-color-scheme: light/.test(media ?? "")));

/* TimeCard.tsx is loaded on demand; settle it first, as dashboard-entrance.test.tsx explains. */
beforeAll(async () => {
  await import("../TimeCard");
});

describe("the index pages' banner (the Dashboard's design)", () => {
  installAppHarness();

  it("opens each index page with its title and actions, above the KPI strip and out of the index card", async () => {
    render(<App />);
    await enterDashboard();
    const viaFlyout = async (hub: RegExp, entry: RegExp) => {
      fireEvent.mouseEnter(screen.getByRole("button", { name: hub }).parentElement as HTMLElement);
      fireEvent.click(await screen.findByRole("menuitem", { name: entry }));
    };
    const viaRail = async (hub: string | RegExp) => {
      fireEvent.click(screen.getByRole("button", { name: hub }));
    };
    const pages: Array<[string, RegExp, () => Promise<void>]> = [
      [".projects-page", /^Projects$/, () => viaRail("Operations")],
      [".crews-page", /^Crews$/, () => viaFlyout(/^Operations/, /^Crews/)],
      [".inventory-page", /^Inventory/, () => viaRail(/^Resources( \(.*\))?$/)],
      [".field-updates-page", /^Field Updates/, () => viaFlyout(/^Field( \(.*\))?$/, /^Field Updates/)],
      [".delayIQ-rx", /^DelayIQs/, () => viaFlyout(/^Field( \(.*\))?$/, /^DelayIQs/)]
    ];
    for (const [root, name, open] of pages) {
      await open();
      const title = await screen.findByRole("heading", { level: 1, name });
      const page = document.querySelector(root) as HTMLElement;
      const head = title.closest(".hs-index-head") as HTMLElement;
      // the head is the page's own child, before the KPI strip...
      expect(head.parentElement, root).toBe(page);
      const kpis = page.querySelector(":scope > .hs-kpis") as HTMLElement;
      expect(head.compareDocumentPosition(kpis) & Node.DOCUMENT_POSITION_FOLLOWING, root).toBeTruthy();
      // ...holding the actions, and the card it left is still named by its title
      expect(head.querySelector(".hs-index-actions"), root).not.toBeNull();
      const card = page.querySelector(".hs-index-card") as HTMLElement;
      expect(card.querySelector(".hs-index-head"), root).toBeNull();
      expect(card.getAttribute("aria-labelledby"), root).toBe(title.id);
    }
  });
});

describe("the rest of the program's sheet (skin section 91)", () => {
  it("reaches the eight pages and nothing else", () => {
    expect(rules.length).toBeGreaterThan(60);
    const outside = rules
      .flatMap(selectorsOf)
      .filter((one) => !/\.(proj-rx|crew-rx|inv-rx|field-rx|delayIQ-rx|tc-rx|reports-page|settings-rx)\b/.test(one));
    expect(outside).toEqual([]);
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
    expect(light.length).toBeGreaterThanOrEqual(3);
    for (const found of light) {
      const system = selectorsOf(found).map((one) => one.replace(LIGHT, SYSTEM));
      const twin = rules.find((f) => /prefers-color-scheme: light/.test(f.media ?? "") && selectorsOf(f).join("|") === system.join("|"));
      expect(twin, selectorsOf(found)[0]!.slice(0, 80)).toBeTruthy();
      expect(decls(twin!.rule)).toEqual(decls(found.rule));
    }
  });

  it("heads every page with the Dashboard's banner and its category's still life, served from public/", () => {
    // one rule draws all four heads, the picture named per page
    const banner = rules.find((f) => f.media === null && BANNERS.every((one) => selectorsOf(f).includes(one)));
    expect(banner, "the four heads share the banner").toBeTruthy();
    expect(decls(banner!.rule).background).toBe("var(--edl-art, none) right 26px bottom 4px / auto 168px no-repeat, var(--edl-hero)");
    expect(decls(banner!.rule)["border-radius"]).toBe("var(--edl-hero-radius)");
    const pictures: Record<string, string> = {
      ":is(.proj-rx, .crew-rx)": "operations",
      ".inv-rx": "resources",
      ":is(.field-rx, .delayIQ-rx)": "field",
      ".reports-page": "reports",
      ".tc-rx": "timecard",
      ".settings-rx": "settings"
    };
    for (const [root, name] of Object.entries(pictures)) {
      expect(declsAt(`${S} ${root}`)["--edl-art"], root).toBe(`url("/dashboard/${name}-art.svg")`);
      expect(existsSync(join(SRC, "..", "public", "dashboard", `${name}-art.svg`)), name).toBe(true);
    }
    // a narrow window keeps the words and lets the pictures go
    for (const one of BANNERS) expect(declsAt(one, /max-width: 760px/).background, one).toBe("var(--edl-hero)");
    // and the titles are the greeting's: bold and navy
    const title = declsAt(`${S} :is(.proj-rx, .crew-rx, .inv-rx, .field-rx, .delayIQ-rx) > .hs-index-head .hs-index-title`);
    expect(title).toMatchObject({ color: "var(--edl-title)", "font-weight": "800", "font-size": "clamp(26px, 2.5vw, 34px)" });
  });

  it("sets each stat on a pastel disc of its tone: a wash and its own ink", () => {
    expect(declsAt(`${S} ${INDEX} .hs-kpi`)["grid-template-columns"]).toBe("44px minmax(0, 1fr)");
    expect(declsAt(`${S} ${INDEX} .hs-kpi-ico`)).toMatchObject({
      "border-radius": "50%",
      background: "var(--edl-disc)",
      color: "var(--edl-disc-ink)"
    });
    for (const tone of ["blue", "green", "amber", "orange", "red"]) {
      const disc = declsAt(`${S} ${INDEX} .hs-kpi-ico.tone-${tone}`);
      expect(disc["--edl-disc"], tone).toBe(`var(--edl-${tone}-wash)`);
      expect(disc["--edl-disc-ink"], tone).toBe(`var(--edl-${tone})`);
    }
  });

  it("gives the one primary action the banner's button, and what the old look filled with ink the periwinkle", () => {
    expect(declsAt(`${S} ${ALL} :is(.hs-btn-primary, .primary-button)`).background).toBe("var(--edl-cta)");
    expect(declsAt(`${S} .reports-page > .page-title .reports-actions button`).background).toBe("var(--edl-cta)");
    expect(declsAt(`${S} .field-rx .field-entry-body .primary-button`).background).toBe("var(--edl-cta)");
    // the tabs' travelling pill, and Settings' categories and TimeCard's views, move in the periwinkle
    for (const group of [`${S} ${INDEX} .hs-views`, `${S} .tc-rx .tc-seg`, `${S} .settings-rx .settings-rail`]) {
      expect(declsAt(group)["--bfm-pill-fill"], group).toBe("var(--bf-color-accent-fill)");
    }
    for (const filled of [
      `${S} ${INDEX} :is(.hs-btn-icon.active, .hs-chip.active)`,
      `${S} ${INDEX} .hs-progress-track i`,
      `${S} .settings-rx .settings-row .settings-toggle.active`,
      `${S} .settings-rx .sx-seg-ind`,
      `${S} .tc-rx .tc-day.is-picked`,
      `${S} .field-rx .fp-progress-slider::-webkit-slider-thumb`
    ]) {
      expect(declsAt(filled).background, filled).toBe("var(--bf-color-accent-fill)");
    }
  });
});
