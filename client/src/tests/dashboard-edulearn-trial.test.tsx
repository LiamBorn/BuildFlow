/**
 * The Dashboard on the EduLearn reference — a trial (2026-09-28: skin section 87,
 * dashboard/DashboardHeroArt.tsx, public/dashboard/hero-site.svg).
 *
 * Asked for with a screenshot of an e-learning dashboard: "Redesign the dashboard as a test".
 * The first half uses the page: the greeting's banner holds the reference's button, still life
 * and quote, and the button opens the Schedule. The second half reads section 87 off disk,
 * because jsdom applies no CSS: it reaches the Dashboard and nothing else, keeps its colours to
 * light mode and its periwinkle to the Default Colors set, mirrors each light rule for System on a
 * light OS, puts the button's colours where the top row can read them, lays the banner out, and
 * says what less motion means.
 *
 * Then the trial's second step (skin section 88), asked for next: "use it to redesign the top bar,
 * and sidebar". The chrome is the program's, so it reaches every page: a white top row with the
 * person's name and level beside the portrait, and the Labeled sidebar running the window's height
 * with BuildFlow's mark and name at its head, the news card under the pages, and you at its foot.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import postcss, { type ChildNode, type Declaration, type Rule } from "postcss";
import App from "../App";
import { DEFAULT_PREFERENCES } from "../preferences";
import { bootstrapFixture } from "../test/fixture";
import { enterDashboard, installAppHarness } from "../test/appHarness";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(SRC, "..", "public");

/* TimeCard.tsx is loaded on demand; settle it first, as dashboard-entrance.test.tsx explains. */
beforeAll(async () => {
  await import("../TimeCard");
});

describe("the Dashboard's banner (the EduLearn trial)", () => {
  installAppHarness();

  it("holds the reference's button, still life and quote, and the button opens the Schedule", async () => {
    render(<App />);
    await enterDashboard();
    const header = document.querySelector(".hs-home-head") as HTMLElement;
    expect(header).not.toBeNull();

    const button = within(header).getByRole("button", { name: "Open the Schedule" });
    // the still life is decoration: no name for a screen reader to read out
    const art = header.querySelector("img.hs-home-art") as HTMLImageElement;
    expect(art.getAttribute("src")).toBe("/dashboard/hero-site.svg");
    expect(art).toHaveAttribute("alt", "");
    expect(header.querySelector(".hs-home-quote blockquote")?.textContent).toBe("“Plan the work, then work the plan.”");
    // the banner reads greeting, lede, plan line, then the button — in the document as on screen
    const order = [...header.querySelectorAll(".hs-home-greeting, .hs-home-sub, .hs-home-meta, .hs-home-cta")].map(
      (node) => node.className.split(" ")[0]
    );
    expect(order).toEqual(["hs-home-greeting", "hs-home-sub", "hs-home-meta", "hs-home-cta"]);

    fireEvent.click(button);
    expect(await screen.findByRole("heading", { name: /The whole plan/ })).toBeInTheDocument();
  });

  it("serves the still life from public/, drawn to the size the page reserves for it", () => {
    const file = join(PUBLIC, "dashboard", "hero-site.svg");
    expect(existsSync(file)).toBe(true);
    const svg = readFileSync(file, "utf8");
    expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 360 210"/);
    const component = readFileSync(join(SRC, "dashboard", "DashboardHeroArt.tsx"), "utf8");
    expect(component).toMatch(/width=\{360\} height=\{210\}/);
  });
});

/* ------------------------------------------------------------------ the sheet ---- */
const skin = postcss.parse(readFileSync(join(SRC, "app-shell-client-desk.css"), "utf8"));
const section: ChildNode[] = (() => {
  const nodes = skin.nodes;
  const start = nodes.findIndex((n) => n.type === "comment" && n.text.includes("87. THE DASHBOARD ON THE EDULEARN REFERENCE"));
  if (start < 0) throw new Error("skin section 87 is missing");
  const next = nodes.findIndex((n, i) => i > start && n.type === "comment" && /^=+\s*\n\s*(8[8-9]|9\d)\./.test(n.text));
  return nodes.slice(start + 1, next < 0 ? undefined : next);
})();
type Found = { rule: Rule; media: string | null };
const rules: Found[] = [];
for (const node of section) {
  if (node.type === "rule") rules.push({ rule: node, media: null });
  if (node.type === "atrule" && node.name === "media") node.walkRules((r) => void rules.push({ rule: r, media: node.params }));
}
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const decls = (rule: Rule) =>
  Object.fromEntries(rule.nodes.filter((n): n is Declaration => n.type === "decl").map((d) => [d.prop, norm(d.value)]));
const S = ".app-shell.hs-shell.bf-shell";
const DASH = ".dash-rx.hs-home:not(.sched-board-host)";
const LIGHT = '[data-bf-mode="light"]';
const SYSTEM = '[data-bf-mode="system"]';
const DEFAULT_SET = ':is([data-bf-colors="default"], :not([data-bf-colors]))';
/** A colour written out, not read from a token; what an SVG mask says inside url() is a shape, not a colour. */
const literal = (value: string) => /#[0-9a-f]{3,8}\b|rgba?\(\s*\d/i.test(value.replace(/url\([^)]*\)/g, ""));
const lightFenced = ({ rule, media }: Found) =>
  rule.selectors.every((one) => one.includes(LIGHT) || (one.includes(SYSTEM) && /prefers-color-scheme: light/.test(media ?? "")));
/** A rule's selectors, each on one line. */
const selectorsOf = ({ rule }: Found) => rule.selectors.map(norm);
const find = (selector: string, media: RegExp | null = null) =>
  rules.find((f) => selectorsOf(f).includes(selector) && (media ? media.test(f.media ?? "") : f.media === null));

describe("the EduLearn trial's sheet (skin section 87)", () => {
  it("reaches the Dashboard and nothing else: the Schedule page shares the board, not the look", () => {
    expect(rules.length).toBeGreaterThan(100);
    const strays = rules.flatMap(selectorsOf).filter((one) => !one.includes(DASH));
    expect(strays).toEqual([]);
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

  it("gives the periwinkle to the Default Colors set only: another set keeps its own accent", () => {
    const ACCENTED =
      /^--(bf-color-accent|bf-rail|bf-focus-ink)|^--edl-(cta(-hover|-ink|-shadow)?|hero(-shadow)?|bar(-2)?|promo(-line)?|link)$/;
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

  it("puts the button's colours on the shell, where the top row's buttons outside the page can read them", () => {
    // declared on the Dashboard's own element they never reached the top row, and its Upgrade drew as a clear box
    const COLOURS = /^--edl-(cta(-hover|-ink|-shadow)?|hero(-shadow)?|bar(-2)?|promo(-line)?|link)$/;
    const onPage = rules.filter(({ rule }) => rule.nodes.some((n) => n.type === "decl" && COLOURS.test(n.prop)));
    for (const found of onPage) for (const one of selectorsOf(found)) expect(one, one).toMatch(/:has\(/);
    const shell = find(`${S}:has(${DASH})`);
    expect(decls(shell!.rule)["--edl-cta"]).toBe("var(--bf-color-accent-fill)");
    const upgrade = rules.find((f) => selectorsOf(f).some((one) => one.endsWith(".topbar.hs-topbar .hs-upgrade-btn:not(.is-urgent)")));
    expect(decls(upgrade!.rule).background).toBe("var(--edl-cta)");
  });

  it("draws the banner behind the greeting's rows only, with the button, still life and quote in it", () => {
    const wide = /min-width: 701px\)$/;
    const banner = decls(find(`${S} ${DASH} .hs-home-head::before`, wide)!.rule);
    expect(banner).toMatchObject({ "grid-column": "1 / -1", "grid-row": "2 / 8", background: "var(--edl-hero)" });
    expect(decls(find(`${S} ${DASH} .hs-home-head > .hs-home-cta`, wide)!.rule)).toMatchObject({ "grid-column": "2", "grid-row": "6" });
    expect(decls(find(`${S} ${DASH} .hs-home-head > .hs-home-art`, wide)!.rule)["grid-row"]).toBe("2 / 8");
    expect(decls(find(`${S} ${DASH} .hs-home-head > .hs-home-quote`, wide)!.rule)["grid-column"]).toBe("4");
    // the announcement and the customizing notes run under the banner, not in it
    const rest = rules.find((f) => wide.test(f.media ?? "") && selectorsOf(f).some((one) => one.includes(".hs-home-head > :not(")));
    expect(decls(rest!.rule)["grid-column"]).toBe("1 / -1");
    // and a phone keeps it as the header's own ground
    expect(decls(find(`${S} ${DASH} .hs-home-head`, /max-width: 700px/)!.rule).background).toBe("var(--edl-hero)");
  });

  it("sets the reference's face only where nobody chose a face of their own", () => {
    const face = rules.find((f) => selectorsOf(f).some((one) => one.includes('[data-bf-font="inter"]')));
    expect(selectorsOf(face!).every((one) => one.includes(':is([data-bf-font="inter"], :not([data-bf-font]))'))).toBe(true);
    expect(decls(face!.rule)["--bf-font-active"]).toMatch(/^"Plus Jakarta Sans"/);
    const head = readFileSync(join(SRC, "..", "index.html"), "utf8");
    expect(head).toMatch(/family=Plus\+Jakarta\+Sans:wght@[\d;]+/);
  });

  it("gives a reader who asked for less motion none of it", () => {
    const quiet = new Set(
      rules.filter((f) => /reduced-motion/.test(f.media ?? "")).flatMap((f) => (decls(f.rule).animation === "none" ? selectorsOf(f) : []))
    );
    const moving = rules.filter(
      (f) => !/reduced-motion/.test(f.media ?? "") && decls(f.rule).animation && decls(f.rule).animation !== "none"
    );
    expect(moving.length).toBeGreaterThanOrEqual(2);
    for (const found of moving)
      for (const one of selectorsOf(found)) expect(quiet.has(one), `${one} moves with nothing said about less motion`).toBe(true);
  });
});

/* ------------------------------------------------ the trial's second step: the chrome ---- */
describe("the top bar and the Labeled sidebar (the EduLearn trial's second step)", () => {
  installAppHarness();
  /** This device already chose the Labeled style (the device copy usePreferences reads). */
  const chooseLabeled = () =>
    localStorage.setItem(`bf:prefs:${bootstrapFixture.activeUser.id}`, JSON.stringify({ ...DEFAULT_PREFERENCES, sidebar: "labeled" }));
  const sidebar = () => screen.getByRole("complementary", { name: "Primary navigation" });

  it("sets BuildFlow's mark and name at the column's head and the person at its foot, beside Settings", async () => {
    chooseLabeled();
    render(<App />);
    await enterDashboard();
    const side = sidebar();

    const brand = side.querySelector(".lbl-brandmark") as HTMLElement;
    expect(brand.querySelector("img")?.getAttribute("src")).toBe("/buildflow-logo.png");
    expect(brand.querySelector("img")).toHaveAttribute("alt", "");
    expect(within(brand).getByText("BuildFlow")).toBeInTheDocument();
    expect(within(brand).getByText("Plan. Build. Deliver.")).toBeInTheDocument();
    // it heads the column, above the workspace's own head
    expect(brand.compareDocumentPosition(side.querySelector(".lbl-head")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const person = side.querySelector(".lbl-foot .lbl-profile") as HTMLElement;
    expect(within(person).getByText(bootstrapFixture.activeUser.name)).toBeInTheDocument();
    expect(within(person).getByText("Workspace Owner")).toBeInTheDocument();
    // Settings stays at the foot, a gear beside the person now
    fireEvent.click(within(side).getByRole("button", { name: "Settings" }));
    await waitFor(() => expect(document.getElementById("settings-title")).not.toBeNull());
  });

  it("scrolls the news with the pages, so a short window gives its height to the rows", async () => {
    chooseLabeled();
    render(<App />);
    await enterDashboard();
    const side = sidebar();
    const news = within(side).getByRole("button", { name: /^What.s new/ });
    expect(news.parentElement?.classList.contains("lbl-scroll")).toBe(true);
    expect(news.previousElementSibling?.matches("nav.lbl-nav")).toBe(true);
    expect(side.querySelector(".lbl-foot .lbl-news")).toBeNull();
  });

  it("gives the top row's account button the name and level it draws beside the portrait", async () => {
    render(<App />);
    await enterDashboard();
    const me = bootstrapFixture.activeUser;
    const button = screen.getByRole("button", { name: `${me.name} account` });
    expect(button.dataset.name).toBe(me.name);
    expect(button.dataset.role).toBe("Workspace Owner");
    // drawn, not written: the button's name is still the one a screen reader has always heard
    expect(button).not.toHaveTextContent(me.name);
  });
});

const chrome: Found[] = (() => {
  const nodes = skin.nodes;
  const start = nodes.findIndex(
    (n) => n.type === "comment" && n.text.includes("88. THE TOP BAR AND THE SIDEBAR ON THE EDULEARN REFERENCE")
  );
  if (start < 0) throw new Error("skin section 88 is missing");
  const next = nodes.findIndex((n, i) => i > start && n.type === "comment" && /^=+\s*\n\s*(89|9\d)\./.test(n.text));
  const found: Found[] = [];
  for (const node of nodes.slice(start + 1, next < 0 ? undefined : next)) {
    if (node.type === "rule") found.push({ rule: node, media: null });
    if (node.type === "atrule" && node.name === "media") node.walkRules((r) => void found.push({ rule: r, media: node.params }));
  }
  return found;
})();
const chromeFind = (selector: string, media: RegExp | null = null) =>
  chrome.find((f) => selectorsOf(f).includes(selector) && (media ? media.test(f.media ?? "") : f.media === null));
const LABELED = '[data-bf-sidebar="labeled"]';

describe("the chrome's sheet (skin section 88)", () => {
  it("keeps its colours to light mode, but for white words on a filled disc", () => {
    expect(chrome.length).toBeGreaterThan(50);
    const unfenced = chrome
      .filter((f) => !lightFenced(f))
      .flatMap(({ rule }) =>
        rule.nodes
          .filter((n): n is Declaration => n.type === "decl" && literal(n.value) && !(n.prop === "color" && /^#ffffff$/i.test(n.value)))
          .map((d) => `${norm(rule.selector).slice(0, 70)} { ${d.prop}: ${d.value.slice(0, 40)} }`)
      );
    expect(unfenced).toEqual([]);
  });

  it("gives the periwinkle to the Default Colors set only", () => {
    const ACCENTED = /^--(edlc-(active|active-wash|tag|tag-ink|cta|cta-hover|cta-shadow|promo|promo-line|avatar)|bf-rail-(fill|rgb))$/;
    const outside = chrome.flatMap(({ rule }) =>
      rule.nodes
        .filter((n): n is Declaration => n.type === "decl" && ACCENTED.test(n.prop) && literal(n.value))
        .filter(() => !rule.selectors.every((one) => one.includes(DEFAULT_SET)))
        .map((d) => `${d.prop} in ${norm(rule.selector).slice(0, 60)}`)
    );
    expect(outside).toEqual([]);
  });

  it("writes every light rule again for System on a light OS, word for word", () => {
    const light = chrome.filter((f) => f.media === null && selectorsOf(f).some((one) => one.includes(LIGHT)));
    expect(light.length).toBeGreaterThanOrEqual(2);
    for (const found of light) {
      const system = selectorsOf(found).map((one) => one.replace(LIGHT, SYSTEM));
      const twin = chrome.find((f) => /prefers-color-scheme: light/.test(f.media ?? "") && selectorsOf(f).join("|") === system.join("|"));
      expect(twin, selectorsOf(found)[0]!.slice(0, 80)).toBeTruthy();
      expect(decls(twin!.rule)).toEqual(decls(found.rule));
    }
  });

  it("runs the Labeled sidebar the window's height, the top row from its edge, and hides the wordmark only there", () => {
    expect(decls(chromeFind(`${S}${LABELED} .lbl-side`)!.rule)).toMatchObject({ top: "0", "border-top": "0" });
    const open = `${S}${LABELED}:not(.sidebar-collapsed):not(.settings-shell)`;
    expect(decls(chromeFind(`${open} .topbar.hs-topbar`)!.rule)["margin-left"]).toBe("var(--lbl-side-w)");
    // the rail, the hidden column and Settings keep the top row's wordmark
    const hiders = chrome.filter((f) => selectorsOf(f).some((one) => one.includes(".hs-topbar-brand")) && decls(f.rule).display === "none");
    expect(hiders.length).toBe(1);
    for (const one of selectorsOf(hiders[0]!)) expect(one.startsWith(open), one).toBe(true);
  });

  it("paints the top row white on a hairline, and draws the person's name and level from the button's own data", () => {
    const bar = decls(chromeFind(`${S} .topbar.hs-topbar`)!.rule);
    expect(bar).toMatchObject({ background: "var(--edlc-bar)", "box-shadow": "0 1px 0 var(--edlc-line)" });
    const light = chrome.find((f) => selectorsOf(f).join("|") === `${S}${LIGHT}`);
    expect(decls(light!.rule)["--edlc-bar"]).toBe("#ffffff");
    expect(decls(chromeFind(`${S} .topbar.hs-topbar .reports-user-button::before`)!.rule).content).toBe("attr(data-name)");
    expect(decls(chromeFind(`${S} .topbar.hs-topbar .reports-user-button::after`)!.rule).content).toBe("attr(data-role)");
    const narrow = chrome.find((f) => /max-width: 1100px/.test(f.media ?? "") && selectorsOf(f).some((one) => one.endsWith("::before")));
    expect(decls(narrow!.rule).display).toBe("none");
  });

  it("gives the news card the reference's picture and button, the picture served from public/", () => {
    const card = decls(chromeFind(`${S}${LABELED} .lbl-side .lbl-news`)!.rule);
    expect(card.background).toContain('url("/dashboard/whats-new.svg")');
    expect(existsSync(join(PUBLIC, "dashboard", "whats-new.svg"))).toBe(true);
    expect(decls(chromeFind(`${S}${LABELED} .lbl-side .lbl-news::after`)!.rule).content).toMatch(/^"See what/);
  });

  it("gives a reader who asked for less motion none of it", () => {
    const quiet = new Set(chrome.filter((f) => /reduced-motion/.test(f.media ?? "")).flatMap(selectorsOf));
    const moving = chrome.filter(
      (f) => !/reduced-motion/.test(f.media ?? "") && decls(f.rule).animation && decls(f.rule).animation !== "none"
    );
    expect(moving.length).toBeGreaterThanOrEqual(1);
    for (const found of moving)
      for (const one of selectorsOf(found)) expect(quiet.has(one), `${one} moves with nothing said about less motion`).toBe(true);
    for (const found of chrome.filter((f) => /reduced-motion/.test(f.media ?? "")))
      expect(decls(found.rule).animation).toMatch(/^none$|--bfm-reduced/);
  });
});
