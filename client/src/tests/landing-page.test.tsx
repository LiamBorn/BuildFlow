/**
 * The landing page (2026-09-27): linear.app/homepage, rebuilt for BuildFlow in light mode.
 *
 * App.test.tsx covers it inside the app (it renders first, its navigation opens pages and its
 * drawer, a Features entry opens its sheet). This file covers the page's own rules, mounted on its
 * own — including the Top Drawer Navigation's states (landing/drawerNav.ts).
 *
 * The first block is the one that matters most. A link to a hash the router does not answer is
 * invisible in this app: the URL changes, the page stays, and nothing fails. The landing lost one
 * that way before ("Learn more" pointed at `#learn`, see aria-references.test.ts), and its links
 * live in data here, where that test's `href="#…"` scan cannot see them — so every one of them
 * is checked against App.tsx's `welcomeRoutes` directly.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { businessTypeOptions, tradeProfiles } from "@buildflow/shared";
import LandingPage, { type LandingPageProps, type LandingUpdate } from "../landing/LandingPage";
import { CTA, CUSTOMERS, DRAWER_CATEGORIES, FEATURE_SECTIONS, FOOTER_COLUMNS, HERO, LANDING_MEDIA, LEGAL_LINKS, DOWNLOAD, PLATFORM } from "../landing/content";

const UPDATES: LandingUpdate[] = [
  { anchor: "update-2026-09-08", title: "Month and Kanban", summary: "Each view on its own page.", dateTime: "2026-09-08" },
  { anchor: "update-2026-09-06", title: "Gantt Chart", summary: "The whole schedule on one wall.", dateTime: "2026-09-06" },
  { anchor: "update-2026-06-16", title: "Readiness rules", summary: "They shape the weekly board.", dateTime: "2026-06-16" },
  { anchor: "update-2026-05-26", title: "Field updates", summary: "More for field teams.", dateTime: "2026-05-26" }
];

function mount(overrides: Partial<LandingPageProps> = {}) {
  const props = {
    logo: <span>BuildFlow</span>,
    onLogin: vi.fn(),
    onNavigate: vi.fn(),
    onOpenUpdate: vi.fn(),
    updates: UPDATES,
    ...overrides
  };
  const view = render(<LandingPage {...props} />);
  return { ...props, unmount: view.unmount };
}

const nav = () => document.querySelector<HTMLElement>("[data-drawer-nav]")!;
/** A category's button in the bar (the phone list has one of the same name). */
const barButton = (id: string) => document.querySelector<HTMLButtonElement>(`.nav-item[data-menu="${id}"]`)!;
const panel = (id: string) => document.querySelector<HTMLElement>(`[data-panel="${id}"]`)!;
const toggle = () => document.querySelector<HTMLButtonElement>("[data-toggle]")!;
/**
 * Whether an element is inert. The script sets the `inert` property, which a browser reflects to
 * the attribute; jsdom has no such property, so an element the script has not touched yet only
 * has the attribute React rendered.
 */
const isInert = (element: HTMLElement) => (element.inert as boolean | undefined) ?? element.hasAttribute("inert");

/** matchMedia as a phone answers it: under 833px, no hover. */
function asPhone() {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("max-width: 833px"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

const ORIGINAL_MEDIA = { ...LANDING_MEDIA };

/**
 * An IntersectionObserver the test drives: `fire(target, entry)` tells the observer watching
 * `target` that it crossed. The page runs more than one (the hero video, the Platform list), so
 * each call reaches only the one that observes that element.
 */
function fakeIntersectionObserver() {
  const original = globalThis.IntersectionObserver;
  const watching = new Map<Element, { callback: IntersectionObserverCallback; observer: IntersectionObserver }>();
  globalThis.IntersectionObserver = class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) {
      watching.set(target, { callback: this.callback, observer: this as unknown as IntersectionObserver });
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
  return {
    fire(target: Element, entry: Partial<IntersectionObserverEntry>) {
      const watcher = watching.get(target);
      if (!watcher) throw new Error("nothing observes that element");
      act(() => watcher.callback([{ target, ...entry } as IntersectionObserverEntry], watcher.observer));
    },
    restore() {
      globalThis.IntersectionObserver = original;
    }
  };
}

afterEach(() => {
  // a modified click is left to the browser, and jsdom follows it to the hash
  window.history.replaceState(null, "", "/");
  document.documentElement.style.overflow = "";
  for (const slot of Object.keys(LANDING_MEDIA)) delete LANDING_MEDIA[slot];
  Object.assign(LANDING_MEDIA, ORIGINAL_MEDIA);
});

describe("every link on the landing page goes somewhere", () => {
  const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "App.tsx"), "utf8");
  const table = app.slice(app.indexOf("const welcomeRoutes: Record<string, WelcomeView> = {"));
  const routes = new Set([...table.slice(0, table.indexOf("\n};")).matchAll(/"(#[^"]+)"/g)].map((m) => m[1]));

  const links = [
    ...DRAWER_CATEGORIES.flatMap((category) => category.columns.flatMap((column) => column.links)),
    DOWNLOAD,
    HERO.news,
    ...FEATURE_SECTIONS.flatMap((section) => [section.link, ...section.features.map((feature) => feature.link)]),
    CUSTOMERS.link,
    CTA.primary,
    CTA.secondary,
    ...FOOTER_COLUMNS.flatMap((column) => column.links),
    ...LEGAL_LINKS
  ];

  it("reads the route table and the page's links", () => {
    expect(routes.size).toBeGreaterThan(40);
    expect(links.length).toBeGreaterThan(60);
  });

  it("names a route in App.tsx's welcomeRoutes with every hash in its content", () => {
    expect(links.filter((link) => !routes.has(link.hash)).map((link) => `${link.label} → ${link.hash}`)).toEqual([]);
  });

  it("renders no #anchor that goes nowhere", () => {
    mount();
    const hrefs = Array.from(document.querySelectorAll("a[href^='#']"), (a) => a.getAttribute("href")!);
    expect(hrefs.length).toBeGreaterThan(50);
    // #lp-main is the skip link's target, on the page itself
    expect(hrefs.filter((href) => !routes.has(href) && href !== "#lp-main")).toEqual([]);
  });
});

describe("pictures", () => {
  it("plays the video of the program in the hero, muted and looping, from its first frame", () => {
    mount();
    const hero = document.querySelector<HTMLVideoElement>('[data-slot="hero"]')!;
    expect(hero.tagName).toBe("VIDEO");
    expect(hero).toHaveAttribute("src", "/landing/hero-demo.mp4");
    expect(hero).toHaveAttribute("poster", "/landing/hero-demo-poster.jpg");
    expect(hero.muted).toBe(true);
    expect(hero.loop).toBe(true);
    expect(hero).toHaveAttribute("aria-label", expect.stringMatching(/^A walk through BuildFlow/));
  });

  it("starts the hero video only once it is reached, and stops it when it has gone", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const observers = fakeIntersectionObserver();
    try {
      mount();
      const hero = document.querySelector('[data-slot="hero"]')!;
      expect(play).not.toHaveBeenCalled();
      // a sliver on screen is not enough
      observers.fire(hero, { intersectionRatio: 0.1, isIntersecting: true });
      expect(play).not.toHaveBeenCalled();
      // most of it: it plays, from where it stands (its first frame)
      observers.fire(hero, { intersectionRatio: 0.5, isIntersecting: true });
      expect(play).toHaveBeenCalledTimes(1);
      // scrolled right off: it stops
      observers.fire(hero, { intersectionRatio: 0, isIntersecting: false });
      expect(pause).toHaveBeenCalled();
    } finally {
      observers.restore();
      play.mockRestore();
      pause.mockRestore();
    }
  });

  it("lets the hero video be paused and played again", () => {
    mount();
    const toggle = screen.getByRole("button", { name: "Pause the video" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("draws a blank white placeholder for every slot no file is named for yet", () => {
    mount();
    const slots = Array.from(document.querySelectorAll("[data-slot]")).filter((el) => !LANDING_MEDIA[el.getAttribute("data-slot")!]);
    expect(slots.length).toBeGreaterThan(8);
    for (const slot of slots) {
      expect(slot.tagName, slot.getAttribute("data-slot")!).toBe("DIV");
      expect(slot).toHaveClass("lp-media", "is-blank");
      expect(slot).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("shows the file once its slot names one, as a video for .mp4 and .webm", () => {
    LANDING_MEDIA.hero = "/landing/hero.png";
    LANDING_MEDIA["scheduling-board"] = "/landing/reel.mp4";
    mount();
    expect(document.querySelector('[data-slot="hero"]')?.tagName).toBe("IMG");
    expect(document.querySelector('[data-slot="scheduling-board"]')?.tagName).toBe("VIDEO");
    expect(document.querySelector('[data-slot="scheduling-thread"]')).toHaveClass("is-blank");
  });

  it("names only files that are there", () => {
    const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public");
    const missing = Object.entries(ORIGINAL_MEDIA).filter(([, path]) => !existsSync(join(publicDir, path!)));
    expect(missing).toEqual([]);
  });
});

describe("the platform section", () => {
  const section = () => screen.getByRole("region", { name: /^One schedule for the office and the field\./ });
  const list = () => within(section()).getByRole("navigation", { name: "Platform categories" });

  it("shows every category and every feature: a clip of each category in use, a picture of each feature's screen", () => {
    mount();
    const categories = PLATFORM.categories;
    expect(categories).toHaveLength(6);
    expect(within(list()).getAllByRole("button").map((button) => button.textContent)).toEqual(categories.map((category) => category.nav));
    for (const category of categories) {
      const region = within(section()).getByRole("region", { name: new RegExp(`^${category.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) });
      // the clip: loaded only once it is reached, on its first frame until then, named for what it shows
      const clip = region.querySelector<HTMLVideoElement>(`[data-slot="platform-${category.id}"]`)!;
      expect(clip.tagName).toBe("VIDEO");
      expect(clip).toHaveAttribute("src", `/landing/platform/platform-${category.id}.mp4`);
      expect(clip).toHaveAttribute("poster", `/landing/platform/platform-${category.id}-poster.jpg`);
      expect(clip).toHaveAttribute("preload", "none");
      expect(clip.muted).toBe(true);
      expect(clip).toHaveAttribute("aria-label", category.clip);
      expect(within(region).getByRole("button", { name: `Pause the video: ${category.nav}` })).toBeInTheDocument();
      const features = within(region).getAllByRole("article");
      expect(features).toHaveLength(category.features.length);
      category.features.forEach((feature, index) => {
        expect(within(features[index]).getByRole("heading", { level: 4 })).toHaveTextContent(feature.title);
        // the caption says what the picture shows, so the picture itself is decoration
        const picture = features[index].querySelector(`[data-slot="platform-${category.id}-${index + 1}"]`)!;
        expect(picture.tagName).toBe("IMG");
        expect(picture).toHaveAttribute("src", `/landing/platform/platform-${category.id}-${index + 1}.webp`);
        expect(picture).toHaveAttribute("alt", "");
        expect(picture).toHaveAttribute("loading", "lazy");
      });
    }
  });

  it("plays a category's clip only once it is reached, and lets it be paused", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const observers = fakeIntersectionObserver();
    try {
      mount();
      const clip = document.querySelector('[data-slot="platform-ai"]')!;
      expect(play).not.toHaveBeenCalled();
      observers.fire(clip, { intersectionRatio: 0.2, isIntersecting: true });
      expect(play).not.toHaveBeenCalled();
      observers.fire(clip, { intersectionRatio: 0.6, isIntersecting: true });
      expect(play).toHaveBeenCalledTimes(1);
      const toggle = screen.getByRole("button", { name: "Pause the video: Work with AI" });
      fireEvent.click(toggle);
      expect(pause).toHaveBeenCalled();
      expect(toggle).toHaveAttribute("aria-pressed", "true");
    } finally {
      observers.restore();
      play.mockRestore();
      pause.mockRestore();
    }
  });

  it("marks the first category to begin with, and then whichever one crosses the middle of the screen", () => {
    const observers = fakeIntersectionObserver();
    try {
      mount();
      const current = () => within(list()).getAllByRole("button").filter((button) => button.getAttribute("aria-current") === "true");
      expect(current().map((button) => button.textContent)).toEqual([PLATFORM.categories[0].nav]);
      const ai = PLATFORM.categories.find((category) => category.id === "ai")!;
      observers.fire(document.getElementById("lp-plat-ai")!, { isIntersecting: true });
      expect(current().map((button) => button.textContent)).toEqual([ai.nav]);
      // leaving the band is not a reason to change: the next category entering it is
      observers.fire(document.getElementById("lp-plat-ai")!, { isIntersecting: false });
      expect(current().map((button) => button.textContent)).toEqual([ai.nav]);
    } finally {
      observers.restore();
    }
  });

  it("jumps to a category from the list, taking focus to its statement", () => {
    // jsdom has no scrollIntoView
    const original = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      mount();
      const warn = PLATFORM.categories.find((category) => category.id === "warn")!;
      fireEvent.click(within(list()).getByRole("button", { name: warn.nav }));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById("lp-plat-warn"));
      expect(document.activeElement).toBe(document.getElementById("lp-plat-warn-title"));
      expect(within(list()).getByRole("button", { name: warn.nav })).toHaveAttribute("aria-current", "true");
    } finally {
      if (original) Object.defineProperty(Element.prototype, "scrollIntoView", original);
      else delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
});

describe("links", () => {
  it("leads with BuildFlow's own headline", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("The construction scheduling system for crews and the field");
  });

  it("navigates in place on a plain click", () => {
    const props = mount();
    fireEvent.click(within(panel("product")).getByRole("link", { name: "Compare plans" }));
    expect(props.onNavigate).toHaveBeenCalledWith("#compare-plans");
  });

  it("leaves a click with a modifier to the browser, for a new tab or window", () => {
    const props = mount();
    const pricing = within(panel("product")).getByRole("link", { name: "Compare plans" });
    fireEvent.click(pricing, { metaKey: true });
    fireEvent.click(pricing, { ctrlKey: true });
    fireEvent.click(pricing, { shiftKey: true });
    expect(props.onNavigate).not.toHaveBeenCalled();
  });

  it("logs in from the bar", () => {
    const props = mount();
    fireEvent.click(screen.getByRole("button", { name: /^Login from welcome navigation$/ }));
    expect(props.onLogin).toHaveBeenCalledTimes(1);
  });
});

describe("the companies it is made for", () => {
  it("lists every kind of company BuildFlow's signup offers, under the caption's heading", () => {
    mount();
    const list = screen.getByRole("list", { name: "Kinds of companies BuildFlow is made for" });
    const names = within(list)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(names).toEqual(businessTypeOptions.map((id) => tradeProfiles[id].label));
    expect(names).toHaveLength(14);
    expect(screen.getByText("Made for general contractors, specialty trades and field crews")).toBeInTheDocument();
  });

  it("draws the list a second time for the loop, hidden from assistive technology", () => {
    mount();
    const copies = document.querySelectorAll(".lp-marquee-track > .lp-marquee-list");
    expect(copies).toHaveLength(2);
    expect(copies[0]).not.toHaveAttribute("aria-hidden");
    expect(copies[1]).toHaveAttribute("aria-hidden", "true");
    expect(copies[1].textContent).toBe(copies[0].textContent);
    // only one list is announced
    expect(screen.getAllByRole("list", { name: "Kinds of companies BuildFlow is made for" })).toHaveLength(1);
  });

  it("can be paused and started again from the button beside the caption", () => {
    mount();
    const marquee = document.querySelector(".lp-marquee")!;
    const toggle = screen.getByRole("button", { name: "Pause the company carousel" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(marquee).not.toHaveAttribute("data-paused");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(marquee).toHaveAttribute("data-paused");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(marquee).not.toHaveAttribute("data-paused");
  });
});

describe("the top drawer navigation", () => {
  it("draws a bar button, a phone-list button and a panel for every category, wired to each other", () => {
    mount();
    for (const category of DRAWER_CATEGORIES) {
      const buttons = document.querySelectorAll(`[data-menu="${category.id}"]`);
      expect(buttons).toHaveLength(2);
      for (const button of buttons) {
        expect(button).toHaveAttribute("aria-controls", `drawer-${category.id}`);
        expect(button).toHaveAttribute("aria-expanded", "false");
      }
      expect(panel(category.id)).toHaveAttribute("id", `drawer-${category.id}`);
      expect(panel(category.id)).toHaveAttribute("inert");
      // each column's heading names its section
      for (const section of panel(category.id).querySelectorAll("section.group")) {
        expect(section.querySelector("h2")?.id).toBe(section.getAttribute("aria-labelledby"));
      }
    }
    expect(nav()).not.toHaveAttribute("data-open");
  });

  it("gives every row the stagger indices the stylesheet reads", () => {
    mount();
    const groups = panel("product").querySelectorAll<HTMLElement>("section.group");
    const first = groups[0];
    const links = DRAWER_CATEGORIES[0].columns[0].links.length;
    expect(first.style.getPropertyValue("--group-step")).toBe("0");
    expect(groups[1].style.getPropertyValue("--group-step")).toBe("1");
    expect(groups[2].style.getPropertyValue("--group-step")).toBe("1.5");
    const heading = first.querySelector("h2")!;
    expect(heading.style.getPropertyValue("--row")).toBe("0");
    expect(heading.style.getPropertyValue("--reverse-row")).toBe(String(links));
    const rows = [...first.querySelectorAll("li")];
    expect(rows[0].style.getPropertyValue("--row")).toBe("2");
    expect(rows[0].style.getPropertyValue("--reverse-row")).toBe(String(links - 1));
    expect(rows.at(-1)!.style.getPropertyValue("--reverse-row")).toBe("0");
  });

  it("opens a category from its button, and Escape closes it back onto the button", async () => {
    mount();
    fireEvent.click(barButton("product"));

    expect(nav()).toHaveAttribute("data-open");
    expect(nav().dataset.motion).toBe("reveal");
    expect(barButton("product")).toHaveAttribute("aria-expanded", "true");
    expect(panel("product")).toHaveClass("is-active");
    expect(isInert(panel("product"))).toBe(false);
    expect(isInert(panel("ai"))).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(nav()).not.toHaveAttribute("data-open");
    expect(barButton("product")).toHaveAttribute("aria-expanded", "false");
    expect(barButton("product")).toHaveFocus();
    await waitFor(() => expect(nav().dataset.motion).toBe("closed"));
    expect(panel("product")).not.toHaveClass("is-active");
  });

  it("crossfades to another category in place", async () => {
    mount();
    fireEvent.click(barButton("product"));
    fireEvent.click(barButton("ai"));

    expect(nav().dataset.motion).toBe("swap");
    expect(panel("ai")).toHaveClass("is-active");
    expect(panel("product")).toHaveClass("is-leaving");
    expect(isInert(panel("product"))).toBe(true);
    await waitFor(() => expect(panel("product")).not.toHaveClass("is-leaving"));
  });

  it("closes when the open category's button is clicked again, and when one of its links is followed", () => {
    const props = mount();
    fireEvent.click(barButton("company"));
    fireEvent.click(barButton("company"));
    expect(nav()).not.toHaveAttribute("data-open");

    fireEvent.click(barButton("company"));
    fireEvent.click(within(panel("company")).getByRole("link", { name: "Careers" }));
    expect(props.onNavigate).toHaveBeenCalledWith("#careers");
    expect(nav()).not.toHaveAttribute("data-open");
  });

  it("opens the focused category on Arrow Down and moves focus into its panel", async () => {
    mount();
    barButton("resources").focus();
    fireEvent.keyDown(barButton("resources"), { key: "ArrowDown" });
    expect(panel("resources")).toHaveClass("is-active");
    await waitFor(() => expect(within(panel("resources")).getAllByRole("link")[0]).toHaveFocus());
  });

  it("on a phone: Menu opens the category list, a category its submenu, Back the list again, Close ends it", async () => {
    const restore = asPhone();
    try {
      mount();
      fireEvent.click(toggle());
      expect(panel("menu")).toHaveClass("is-active");
      expect(toggle()).toHaveAttribute("aria-expanded", "true");
      expect(toggle()).toHaveAccessibleName("Close menu");
      expect(toggle()).toHaveTextContent("Close");
      // the page underneath is locked, and the navigation is a modal dialog while open
      expect(document.documentElement.style.overflow).toBe("hidden");
      expect(nav()).toHaveAttribute("role", "dialog");

      fireEvent.click(within(panel("menu")).getByRole("button", { name: "AI" }));
      expect(panel("ai")).toHaveClass("is-active");
      expect(nav()).toHaveAttribute("data-submenu");
      const back = screen.getByRole("button", { name: "Back to main menu" });
      expect(isInert(back)).toBe(false);

      fireEvent.click(back);
      expect(panel("menu")).toHaveClass("is-active");
      expect(nav()).not.toHaveAttribute("data-submenu");
      await waitFor(() => expect(within(panel("menu")).getByRole("button", { name: "AI" })).toHaveFocus());

      fireEvent.click(toggle());
      expect(nav()).not.toHaveAttribute("data-open");
      expect(toggle()).toHaveFocus();
      await waitFor(() => expect(document.documentElement.style.overflow).toBe(""));
      expect(nav()).not.toHaveAttribute("role");
    } finally {
      restore();
    }
  });

  it("logs in from the phone list", () => {
    const props = mount();
    fireEvent.click(within(panel("menu")).getByRole("button", { name: "Log in" }));
    expect(props.onLogin).toHaveBeenCalledTimes(1);
  });

  it("tears itself down on unmount, unlocking the page", () => {
    const restore = asPhone();
    try {
      const { unmount } = mount();
      fireEvent.click(toggle());
      expect(document.documentElement.style.overflow).toBe("hidden");
      unmount();
      expect(document.documentElement.style.overflow).toBe("");
    } finally {
      restore();
    }
  });
});

describe("the feature sheet", () => {
  it("opens from a Features entry, keeps focus inside, and closes on Escape back to the entry", async () => {
    mount();
    const entry = screen.getByRole("button", { name: "WeatherIQ" });
    fireEvent.click(entry);

    const sheet = screen.getByRole("dialog", { name: "WeatherIQ" });
    const close = within(sheet).getByRole("button", { name: "Close" });
    expect(close).toHaveFocus();
    expect(within(sheet).getByText("Weather call-offs on every schedule view")).toBeInTheDocument();

    // Shift+Tab from the first control wraps round to the last
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(within(sheet).getByRole("link", { name: /^Learn more about Weather Integration/ })).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "WeatherIQ" })).not.toBeInTheDocument());
    expect(entry).toHaveFocus();
  });

  it("follows its Learn more link to the feature's page, closing on the way", async () => {
    const props = mount();
    fireEvent.click(screen.getByRole("button", { name: "Time Cards" }));
    fireEvent.click(screen.getByRole("link", { name: /^Learn more about Plans/ }));
    expect(props.onNavigate).toHaveBeenCalledWith("#compare-plans");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Time Cards" })).not.toBeInTheDocument());
  });
});

describe("the changelog", () => {
  it("shows the four newest updates and opens each one where it lives", () => {
    const props = mount();
    const log = screen.getByRole("region", { name: "Changelog" });
    const items = within(log).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(within(items[0]).getByText("Sep 8, 2026")).toHaveAttribute("dateTime", "2026-09-08");

    fireEvent.click(within(items[1]).getByRole("link"));
    expect(props.onOpenUpdate).toHaveBeenCalledWith("update-2026-09-06");

    fireEvent.click(within(log).getByRole("link", { name: /^View all/ }));
    expect(props.onOpenUpdate).toHaveBeenLastCalledWith();
  });

  it("is left out when there are no updates to show", () => {
    mount({ updates: [] });
    expect(screen.queryByRole("region", { name: "Changelog" })).not.toBeInTheDocument();
  });
});
