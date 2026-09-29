/**
 * The Bookmarks page on the Dashboard's design (2026-09-28, skin section 90).
 *
 * Asked for after the Schedule category took the design: "Change the "Bookmark" page to the new
 * style". The page's markup is the same but for one attribute: each category's section says its
 * hub (`data-hub`), so a page wears its category's hue in both cards. The first half uses the page:
 * every section says a hub the rail has, every hue the sheet names is one the page shows, and the
 * saved Schedule views take the Schedule's. The second half reads section 90 off disk (jsdom
 * applies no CSS): it reaches the Bookmarks page and nothing else, keeps its colours to light mode
 * and its periwinkle to the Default Colors set, writes each light rule again for System on a light
 * OS, heads the page with the banner and its picture, stands what the first card holds on white
 * cards of their own, never gives neighbouring categories one hue, and fits a phone.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import postcss, { type ChildNode, type Declaration, type Rule } from "postcss";
import App from "../App";
import { ScheduleLinkTiles } from "../schedule/LinkBookmarkViews";
import { enterDashboard, installAppHarness } from "../test/appHarness";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const skin = postcss.parse(readFileSync(join(SRC, "app-shell-client-desk.css"), "utf8"));
const section: ChildNode[] = (() => {
  const nodes = skin.nodes;
  const start = nodes.findIndex((n) => n.type === "comment" && n.text.includes("90. THE BOOKMARKS PAGE ON THE DASHBOARD'S DESIGN"));
  if (start < 0) throw new Error("skin section 90 is missing");
  const next = nodes.findIndex((n, i) => i > start && n.type === "comment" && /^=+\s*\n\s*(\d+)\./.test(n.text));
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
const matching = (selector: string, media: RegExp | null = null) =>
  rules.filter((f) => selectorsOf(f).includes(selector) && (media ? media.test(f.media ?? "") : f.media === null));
/** Every declaration the section makes for one selector, as the cascade would stack them. */
const declsAt = (selector: string, media: RegExp | null = null): Record<string, string> => {
  const found = matching(selector, media);
  if (found.length === 0) throw new Error(`no rule for ${selector.slice(-80)}`);
  return Object.assign({}, ...found.map((f) => decls(f.rule)));
};
const S = ".app-shell.hs-shell.bf-shell";
const LIGHT = '[data-bf-mode="light"]';
const SYSTEM = '[data-bf-mode="system"]';
const DEFAULT_SET = ':is([data-bf-colors="default"], :not([data-bf-colors]))';
const FIRST = `${S} .bookmarks-page .hs-index-main > .hs-index-card:first-child`;
const SECOND = `${S} .bookmarks-page .hs-index-main > .hs-index-card + .hs-index-card`;
const GROUP = `${S} .bookmarks-page section.bm-group`;
/** A colour written out; what an SVG says inside url() is a picture or a shape, not a colour. */
const literal = (value: string) => /#[0-9a-f]{3,8}\b|rgba?\(\s*\d/i.test(value.replace(/url\([^)]*\)/g, ""));
const lightFenced = ({ rule, media }: Found) =>
  rule.selectors.every((one) => one.includes(LIGHT) || (one.includes(SYSTEM) && /prefers-color-scheme: light/.test(media ?? "")));

/** The rail's hubs, in its order (App.tsx navHubs): the page lists them the same way. */
const HUBS = (() => {
  const app = readFileSync(join(SRC, "App.tsx"), "utf8");
  const list = app.match(/const navHubs[^=]*=\s*\[([\s\S]*?)\n\];/)?.[1] ?? "";
  return [...list.matchAll(/\{ id: "([^"]+)"/g)].map((match) => match[1]!);
})();
/** The hubs the sheet gives a hue of their own (the rest take the section's blue). */
const NAMED = [...new Set(rules.flatMap(selectorsOf).flatMap((one) => [...one.matchAll(/\[data-hub="([^"]+)"\]/g)].map((m) => m[1]!)))];

/* TimeCard.tsx is loaded on demand; settle it first, as dashboard-entrance.test.tsx explains. */
beforeAll(async () => {
  await import("../TimeCard");
});

describe("the Bookmarks page's categories (the Dashboard's design)", () => {
  installAppHarness();

  it("says each category's hub on its section, and every hue the sheet names is a hub the page shows", async () => {
    render(<App />);
    await enterDashboard();
    // the top bar's quick-access star is also named Bookmarks: take the rail's hub button
    const rail = within(screen.getByRole("navigation", { name: "Hubs" }));
    fireEvent.click(rail.getByRole("button", { name: /^Bookmarks( \(.*\))?$/ }));
    await screen.findByRole("heading", { name: /^Bookmarks$/ });

    const shown = [...document.querySelectorAll<HTMLElement>(".bookmarks-page section.bm-group")].map((group) => group.dataset.hub);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.filter((hub) => !hub || !HUBS.includes(hub))).toEqual([]);
    // a renamed hub would lose its disc without a word: every hue the sheet names has its section
    expect(NAMED.length).toBeGreaterThanOrEqual(4);
    expect(NAMED.filter((hub) => !shown.includes(hub))).toEqual([]);

    // the banner is the first card's head, and what the card holds stands under it (section 90h)
    const first = document.querySelector(".bookmarks-page .hs-index-main > .hs-index-card") as HTMLElement;
    expect([...first.children].map((child) => child.className)).toEqual(["hs-index-head", "bm-empty"]);
    const head = first.querySelector(".hs-index-head") as HTMLElement;
    expect(within(head).getByRole("heading", { level: 1 })).toHaveTextContent("Bookmarks");
    expect(head.querySelector(".bm-count")).toHaveTextContent("0 pages starred");
  });

  it("gives the saved Schedule views the Schedule's hub", () => {
    render(
      <ScheduleLinkTiles
        links={[{ page: "month", hash: "#schedule/month", label: "Month", detail: "September 2026" }]}
        onOpen={() => {}}
        onRemove={() => {}}
      />
    );
    expect(document.querySelector("section.bm-group")?.getAttribute("data-hub")).toBe("schedule");
  });
});

describe("the Bookmarks page's sheet (skin section 90)", () => {
  it("reaches the Bookmarks page and nothing else", () => {
    expect(rules.length).toBeGreaterThan(30);
    expect(rules.flatMap(selectorsOf).filter((one) => !one.includes(".bookmarks-page"))).toEqual([]);
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

  it("heads the page with the Dashboard's banner and the Bookmarks' picture, served from public/", () => {
    // the first card lets go of its own ground, so its head can be the page's banner
    expect(declsAt(FIRST)).toMatchObject({ background: "none", "box-shadow": "none", padding: "0" });
    const banner = declsAt(`${FIRST} > .hs-index-head`);
    expect(banner.background).toContain('url("/dashboard/bookmarks-art.svg")');
    expect(banner.background).toContain("var(--edl-hero)");
    expect(banner["border-radius"]).toBe("var(--edl-hero-radius)");
    expect(existsSync(join(SRC, "..", "public", "dashboard", "bookmarks-art.svg"))).toBe(true);
    // a narrow window keeps the words and lets the picture go
    expect(declsAt(`${FIRST} > .hs-index-head`, /max-width: 760px/).background).toBe("var(--edl-hero)");
  });

  it("stands what the first card holds, and the second card, on white cards on a hairline", () => {
    const cards = rules.find((f) => f.media === null && selectorsOf(f).includes(`${FIRST} > :is(.bm-groups, .bm-empty)`));
    expect(selectorsOf(cards!)).toContain(SECOND);
    expect(decls(cards!.rule)).toMatchObject({ background: "var(--bf-surface)", "border-radius": "var(--edl-card-radius)" });
    expect(decls(cards!.rule)["box-shadow"]).toContain("0 0 0 1px var(--bf-line-solid)");
  });

  it("gives each category a pastel disc, the page's icon the same one, and neighbours never one hue", () => {
    const hue = (hub: string) => (NAMED.includes(hub) ? declsAt(`${GROUP}[data-hub="${hub}"]`) : declsAt(GROUP));
    for (const hub of [...NAMED, "home"]) {
      const { "--edl-disc": disc, "--edl-disc-ink": ink } = hue(hub);
      // a wash and its own ink: var(--edl-green-wash) with var(--edl-green)
      expect(disc, hub).toBe(ink!.replace(/\)$/, "-wash)"));
    }
    expect(declsAt(`${S} .bookmarks-page .bm-tile-icon`).background).toBe("var(--edl-disc)");
    expect(declsAt(`${GROUP} > h2 svg`).background).toBe("var(--edl-disc)");
    // the page lists the rail's hubs in its order, less Bookmarks itself (its one page is this one)
    const listed = HUBS.filter((hub) => hub !== "bookmarks");
    expect(listed.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < listed.length; i += 1) {
      expect(hue(listed[i]!)["--edl-disc-ink"], `${listed[i - 1]} beside ${listed[i]}`).not.toBe(hue(listed[i - 1]!)["--edl-disc-ink"]);
    }
  });

  it("marks a starred page with the periwinkle star, and lets every grid shrink to a phone", () => {
    const on = rules.find((f) => selectorsOf(f).includes(`${S} .bookmarks-page .bm-tile-star.is-on`));
    expect(selectorsOf(on!)).toContain(`${S} .bookmarks-page .bm-tile-star.is-on:hover`);
    expect(decls(on!.rule)).toMatchObject({ background: "var(--bf-color-accent-fill)", color: "var(--bf-color-on-accent)" });
    // a column's floor above the card's width would push the card's contents past its edge
    expect(declsAt(FIRST)["grid-template-columns"]).toBe("minmax(0, 1fr)");
    expect(declsAt(`${GROUP} > .bm-tiles`)["grid-template-columns"]).toContain("min(232px, 100%)");
    expect(declsAt(`${FIRST} > .bm-groups`)["grid-template-columns"]).toContain("min(250px, 100%)");
  });
});
