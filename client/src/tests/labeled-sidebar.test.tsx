/**
 * The Labeled sidebar — a Sidebar Style a person can pick (2026-09-27, shell/LabeledSidebar.tsx,
 * shell/labeledSections.ts, skin section 86).
 *
 * Asked for with a screenshot of Linear's sidebar: "Make it so that a user is able to change the
 * left sidebar to look like the image reference." The first half uses it the way a person would:
 * picked in Preferences, back to the rail the same way, every section of the reference in its
 * place, rows that open their pages, groups and a team that fold and remember it, the Inbox, the
 * agent, the Try rows and the What's new card doing what they say. Then the follow-up, asked with a
 * screenshot of Notion's sidebar ("move bigger and smaller width wise … separate the sidebar"): the
 * divider is a handle — dragged it resizes between 200 and 420 and the width is kept, clicked it
 * closes the sidebar, ⌘\ or Ctrl+\ closes and opens it, and as a separator it takes the arrow
 * keys, Home and End. The second half reads section 86 of the skin, because jsdom applies no CSS:
 * it stays on the style, pins no colour of its own, stands as its own section under a top bar that
 * keeps the BuildFlow name (asked next: "Move the left sidebar down a little more from the top, so
 * a user can see the "BuildFlow" name"), and says what less motion means.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import postcss, { type ChildNode, type Declaration, type Rule } from "postcss";
import App from "../App";
import { DEFAULT_PREFERENCES } from "../preferences";
import { bootstrapFixture } from "../test/fixture";
import { enterDashboard, installAppHarness, state } from "../test/appHarness";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

/* TimeCard.tsx is loaded on demand; settle it first, as dashboard-entrance.test.tsx explains. */
beforeAll(async () => {
  await import("../TimeCard");
});

/** This device already chose the Labeled style (the device copy usePreferences reads). */
const chooseLabeledBeforehand = () =>
  localStorage.setItem(`bf:prefs:${bootstrapFixture.activeUser.id}`, JSON.stringify({ ...DEFAULT_PREFERENCES, sidebar: "labeled" }));

const sidebar = () => screen.getByRole("complementary", { name: "Primary navigation" });
const group = (name: string) => within(sidebar()).getByRole("region", { name });
/** A section's rows, by the names a screen reader hears. */
const rowNames = (scope: Element) =>
  [...scope.querySelectorAll<HTMLButtonElement>("button.lbl-item")].map(
    (button) => button.getAttribute("aria-label") ?? button.textContent?.trim()
  );
const shell = () => document.querySelector(".app-shell") as HTMLElement;
const divider = () => within(sidebar()).getByRole("separator", { name: "Resize the sidebar" });
/*
 * A MouseEvent named "pointerdown" rather than a PointerEvent: jsdom has no PointerEvent, and the
 * handle reads `button`, `clientX` and `pointerId` (as board/panelCarry.test.tsx does it).
 */
const pointer = (type: string, clientX: number) =>
  Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 300, button: 0, buttons: 1 }), {
    pointerId: 1
  });
/** Press on the divider at `from`, move to `to`, let go there. */
const dragDivider = (from: number, to: number) => {
  const handle = divider();
  fireEvent(handle, pointer("pointerdown", from));
  fireEvent(handle, pointer("pointermove", to));
  fireEvent(handle, pointer("pointerup", to));
};
const userWidth = () => document.body.style.getPropertyValue("--lbl-user-w");

describe("the Labeled sidebar", () => {
  installAppHarness();

  it("is a Sidebar Style: picked in Preferences it replaces the rail, and picking Sidebar brings the rail back", async () => {
    render(<App />);
    await enterDashboard();
    expect(screen.getByRole("navigation", { name: "Hubs" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Layout preferences" }));
    const panel = screen.getByRole("dialog", { name: "Preferences" });
    const styles = within(panel).getByRole("radiogroup", { name: "Sidebar Style" });
    expect(
      within(styles)
        .getAllByRole("radio")
        .map((radio) => radio.textContent)
    ).toEqual(["Sidebar", "Labeled"]);

    fireEvent.click(within(styles).getByRole("radio", { name: "Labeled" }));
    await waitFor(() => expect(shell().dataset.bfSidebar).toBe("labeled"));
    expect(document.querySelector(".lbl-side")).not.toBeNull();
    expect(screen.queryByRole("navigation", { name: "Hubs" }), "the rail steps aside").toBeNull();
    // the top bar and the page are untouched: only the sidebar changed
    expect(screen.getByLabelText("Search BuildFlow").tagName).toBe("INPUT");
    expect(document.querySelector(".dash-rx.hs-home")).not.toBeNull();

    fireEvent.click(within(styles).getByRole("radio", { name: "Sidebar" }));
    await waitFor(() => expect(shell().dataset.bfSidebar).toBe("sidebar"));
    expect(screen.getByRole("navigation", { name: "Hubs" })).toBeInTheDocument();
    expect(document.querySelector(".lbl-side")).toBeNull();
    // and the width it set for the page beside it goes with it
    expect(userWidth()).toBe("");
  });

  it("lays out the reference's sections: the person's rows, Workspace, the team and its pages, Try, and What's new", async () => {
    chooseLabeledBeforehand();
    render(<App />);
    await enterDashboard();

    // the head: the workspace switcher where the reference names the workspace, a search, compose
    expect(await within(sidebar()).findByRole("button", { name: "Workspace: Asphalt" })).toBeInTheDocument();
    expect(within(sidebar()).getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(within(sidebar()).getByRole("button", { name: "Create" })).toHaveAttribute("aria-haspopup", "menu");

    const pages = within(sidebar()).getByRole("navigation", { name: "Pages" });
    expect(rowNames(pages.querySelector(":scope > .lbl-list") as Element)).toEqual(["Inbox", "My time (add-on)", "Ask BuildFlow AI"]);
    expect(rowNames(group("Workspace"))).toEqual(["Projects", "Crews", "More"]);
    // the team is the workspace itself, holding its home and the Schedule's pages, the + adding a workspace
    const team = group("Your team");
    expect(within(team).getByRole("button", { name: "Asphalt" })).toHaveAttribute("aria-expanded", "true");
    expect(rowNames(team.querySelector(".lbl-team-list") as Element)).toEqual([
      "Home",
      "Schedule",
      "Month (New)",
      "Kanban (New)",
      "Gantt Chart (New)"
    ]);
    expect(within(team).getByRole("button", { name: "Add a workspace" })).toBeInTheDocument();
    expect(rowNames(group("Try"))).toEqual(["Import a schedule", "Invite people", "Connect a calendar"]);
    // the page you are on is the team's Home
    expect(within(team).getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
    // and the foot: What's new, then Settings and the hide arrow
    expect(within(sidebar()).getByRole("button", { name: /^What.s new/ })).toBeInTheDocument();
    expect(within(sidebar()).getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(within(sidebar()).getByRole("button", { name: "Hide the sidebar" })).toBeInTheDocument();
  });

  it("opens a page from its row and marks it, keeps the add-on prompt, and unfolds More", async () => {
    chooseLabeledBeforehand();
    render(<App />);
    await enterDashboard();

    fireEvent.click(within(group("Workspace")).getByRole("button", { name: "Crews" }));
    expect(await screen.findByRole("heading", { name: "Crews" })).toBeInTheDocument();
    expect(within(group("Workspace")).getByRole("button", { name: "Crews" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(within(group("Workspace")).getByRole("button", { name: "More" }));
    expect(rowNames(group("Workspace"))).toEqual([
      "Projects",
      "Crews",
      "Inventory",
      "Field Updates",
      "DelayIQs",
      "Reports",
      "Bookmarks",
      "Less"
    ]);

    // TimeCard is an add-on this workspace does not have: the row offers it, as the rail does
    fireEvent.click(within(sidebar()).getByRole("button", { name: "My time (add-on)" }));
    expect(await screen.findByRole("dialog", { name: "Get Time Cards" })).toBeInTheDocument();
  });

  it("folds a group and the team under their heads, and remembers both", async () => {
    chooseLabeledBeforehand();
    render(<App />);
    await enterDashboard();

    // the team is named for the workspace, which the switcher's list brings a moment after sign-in
    const teamRow = await within(group("Your team")).findByRole("button", { name: "Asphalt" });
    fireEvent.click(teamRow);
    expect(teamRow).toHaveAttribute("aria-expanded", "false");
    expect(within(sidebar()).queryByRole("button", { name: "Gantt Chart (New)" })).toBeNull();

    const tryHead = within(group("Try")).getByRole("button", { name: "Try" });
    fireEvent.click(tryHead);
    expect(tryHead).toHaveAttribute("aria-expanded", "false");
    expect(within(sidebar()).queryByRole("button", { name: "Invite people" })).toBeNull();

    expect(JSON.parse(localStorage.getItem("bf:side:folds") ?? "{}")).toEqual({ "team:workspace-home": false, try: false });
  });

  it("opens the bell's list from Inbox and BuildFlow AI from its row", async () => {
    chooseLabeledBeforehand();
    render(<App />);
    await enterDashboard();

    fireEvent.click(within(sidebar()).getByRole("button", { name: "Inbox" }));
    expect(await screen.findByRole("region", { name: "Recent BuildFlow activity" })).toBeInTheDocument();

    const assistant = () => document.querySelector(".bf-breeze") as HTMLElement;
    expect(assistant()).not.toHaveClass("is-open");
    fireEvent.click(within(sidebar()).getByRole("button", { name: "Ask BuildFlow AI" }));
    await waitFor(() => expect(assistant()).toHaveClass("is-open"));
  });

  it("sends the Try rows to the Settings categories that do them, and opens the newest update from its card", async () => {
    chooseLabeledBeforehand();
    render(<App />);
    await enterDashboard();

    // the update may already be on screen for a first visit: close it, then open it from the card
    const close = screen.queryByRole("button", { name: "Close what's new" });
    if (close) fireEvent.click(close);
    expect(screen.queryByRole("button", { name: "Close what's new" })).toBeNull();
    fireEvent.click(within(sidebar()).getByRole("button", { name: /^What.s new/ }));
    expect(await screen.findByRole("button", { name: "Close what's new" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close what's new" }));

    // (Import, rather than People: the People panel asks the server for the team, which this fake server does not answer)
    fireEvent.click(within(group("Try")).getByRole("button", { name: "Import a schedule" }));
    await waitFor(() => expect(document.getElementById("settings-title")?.textContent).toBe("Import"));
  });

  it("resizes from its divider: a drag sets the width, held between 200 and 420, and this device keeps it", async () => {
    chooseLabeledBeforehand();
    render(<App />);
    await enterDashboard();
    expect(divider()).toHaveAttribute("aria-valuenow", "244");
    expect(userWidth()).toBe("244px");

    dragDivider(300, 400);
    expect(divider()).toHaveAttribute("aria-valuenow", "344");
    expect(userWidth(), "the column, the top bar and BuildFlow AI all read it").toBe("344px");
    expect(localStorage.getItem("bf:side:width")).toBe("344");
    // mid-drag the page takes the resize cursor and the width goes straight onto the variable,
    // re-rendering nothing; let go, and the width is committed and the cursor given back
    fireEvent(divider(), pointer("pointerdown", 300));
    expect(document.body).toHaveClass("bf-side-resizing");
    fireEvent(divider(), pointer("pointermove", 250));
    expect(userWidth()).toBe("294px");
    expect(divider()).toHaveAttribute("aria-valuenow", "344");
    fireEvent(divider(), pointer("pointerup", 250));
    expect(document.body).not.toHaveClass("bf-side-resizing");
    expect(divider()).toHaveAttribute("aria-valuenow", "294");

    // held to its limits even mid-drag, not only once it is let go
    fireEvent(divider(), pointer("pointerdown", 300));
    fireEvent(divider(), pointer("pointermove", 1200));
    expect(userWidth()).toBe("420px");
    fireEvent(divider(), pointer("pointerup", 1200));
    expect(divider()).toHaveAttribute("aria-valuenow", "420");
    dragDivider(300, 0);
    expect(divider()).toHaveAttribute("aria-valuenow", "200");
    expect(localStorage.getItem("bf:side:width")).toBe("200");
    expect(userWidth()).toBe("200px");
  });

  it("opens at the width it was left at, and takes the arrow keys, Home and End on its divider", async () => {
    // a width kept from a wider window is still held to the limits
    localStorage.setItem("bf:side:width", "9000");
    chooseLabeledBeforehand();
    render(<App />);
    await enterDashboard();
    const handle = divider();
    expect(handle).toHaveAttribute("aria-valuenow", "420");
    expect(handle).toHaveAttribute("aria-valuemin", "200");
    expect(handle).toHaveAttribute("aria-valuemax", "420");
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
    expect(handle).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(handle).toHaveAttribute("aria-valuenow", "404");
    fireEvent.keyDown(handle, { key: "ArrowLeft", shiftKey: true });
    expect(handle).toHaveAttribute("aria-valuenow", "356");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle).toHaveAttribute("aria-valuenow", "372");
    fireEvent.keyDown(handle, { key: "Home" });
    expect(handle).toHaveAttribute("aria-valuenow", "200");
    fireEvent.keyDown(handle, { key: "End" });
    expect(handle).toHaveAttribute("aria-valuenow", "420");
    expect(localStorage.getItem("bf:side:width")).toBe("420");
  });

  it("closes from a click on its divider, as the reference's tip says, and ⌘\\ or Ctrl+\\ closes and opens it", async () => {
    chooseLabeledBeforehand();
    render(<App />);
    await enterDashboard();
    expect(divider()).toHaveAttribute("aria-keyshortcuts", "Meta+Backslash Control+Backslash");

    // pressed and let go with a pixel of wobble: a click, not a drag
    fireEvent(divider(), pointer("pointerdown", 300));
    fireEvent(divider(), pointer("pointermove", 301));
    fireEvent(divider(), pointer("pointerup", 301));
    expect(await screen.findByRole("button", { name: "Show the sidebar" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Primary navigation" })).toBeNull();
    expect(localStorage.getItem("bf:side:width"), "a click leaves the width alone").toBeNull();

    fireEvent.keyDown(document.body, { key: "\\", metaKey: true });
    expect(await screen.findByRole("complementary", { name: "Primary navigation" })).toBeInTheDocument();
    expect(divider()).toHaveAttribute("aria-valuenow", "244");
    fireEvent.keyDown(document.body, { key: "\\", ctrlKey: true });
    expect(await screen.findByRole("button", { name: "Show the sidebar" })).toBeInTheDocument();
    // a backslash on its own is only a backslash
    fireEvent.keyDown(document.body, { key: "\\" });
    expect(screen.getByRole("button", { name: "Show the sidebar" })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "\\", ctrlKey: true });
    expect(await screen.findByRole("complementary", { name: "Primary navigation" })).toBeInTheDocument();
  });

  it("gives the Dashboard's own workspace switcher back when the rail is the style again", async () => {
    state.bootstrapPayload = bootstrapFixture;
    render(<App />);
    await enterDashboard();
    // the rail: the Dashboard's header carries the switcher, as it always has
    expect(await screen.findAllByRole("button", { name: "Workspace: Asphalt" })).toHaveLength(1);
    expect(document.querySelector(".dash-rx .hs-home-topline .bfws")).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ the sheet ---- */
const skin = postcss.parse(readFileSync(join(SRC, "app-shell-client-desk.css"), "utf8"));
const section: ChildNode[] = (() => {
  const nodes = skin.nodes;
  const start = nodes.findIndex((n) => n.type === "comment" && n.text.includes("86. THE LABELED SIDEBAR"));
  if (start < 0) throw new Error("skin section 86 is missing");
  const next = nodes.findIndex((n, i) => i > start && n.type === "comment" && /^=+\s*\n\s*(8[7-9]|9\d)\./.test(n.text));
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
const live = rules.filter((r) => !/reduced-motion/.test(r.media ?? ""));
const reduce = rules.filter((r) => /reduced-motion/.test(r.media ?? ""));
const S = '.app-shell.hs-shell.bf-shell[data-bf-sidebar="labeled"]';

describe("the Labeled sidebar's sheet (skin section 86)", () => {
  it("reaches the Labeled style and nothing else", () => {
    expect(rules.length).toBeGreaterThan(60);
    // (the body's drag class is set only by this sidebar's divider, and is read only beside the style)
    const scoped = [S, `body:has(${S}`, `body.bf-side-resizing ${S}`, `body.bf-side-resizing:has(${S}`];
    const strays = rules.flatMap(({ rule }) => rule.selectors.map(norm)).filter((s) => !scoped.some((start) => s.startsWith(start)));
    expect(strays).toEqual([]);
  });

  it("paints only from the program's tokens, so every Colors set and dark mode draw it", () => {
    const pinned: string[] = [];
    for (const { rule } of rules) {
      for (const node of rule.nodes) {
        if (node.type !== "decl") continue;
        // white initials on an identity disc read on its dark gradient in either mode
        if (node.prop === "color" && /^#ffffff$/i.test(node.value)) continue;
        if (/#[0-9a-f]{3,8}\b/i.test(node.value) || /rgba?\(\s*\d/.test(node.value))
          pinned.push(`${norm(rule.selector)} { ${node.prop}: ${node.value} }`);
      }
    }
    expect(pinned).toEqual([]);
  });

  it("holds its own column against the narrow-window rule, at the width the divider was dragged to", () => {
    const open = `${S}:not(.sidebar-collapsed):not(.settings-shell)`;
    const column = live.find(({ rule }) => norm(rule.selector) === `${open} .hs-body`);
    expect(column, "the column rule").toBeTruthy();
    expect(decls(column!.rule)["grid-template-columns"]).toBe("var(--lbl-side-w) minmax(0, 1fr)");
    // it out-ranks the 980px rule (six classes): the attribute is a seventh
    const classes = (selector: string) => (selector.match(/\.[\w-]+|\[[^\]]+\]/g) ?? []).length;
    expect(classes(norm(column!.rule.selector))).toBeGreaterThan(
      classes(".app-shell.hs-shell.bf-shell:not(.sidebar-collapsed):not(.settings-shell) .hs-body")
    );
    // the sidebar is out of the grid (below), so the page is put in the second column by name
    expect(decls(live.find(({ rule }) => norm(rule.selector) === `${open} .hs-body > .main-panel`)!.rule)["grid-column"]).toBe("2");
    // the width is the dragged one, 244px until there is one
    expect(decls(live.find(({ rule, media }) => media === null && norm(rule.selector) === S)!.rule)["--lbl-side-w"]).toBe(
      "var(--lbl-user-w, 244px)"
    );
  });

  it("stands as its own section under the top bar, which keeps the BuildFlow name as it does over the rail", () => {
    const open = `${S}:not(.sidebar-collapsed):not(.settings-shell)`;
    const side = decls(live.find(({ rule, media }) => media === null && norm(rule.selector) === `${S} .lbl-side`)!.rule);
    expect(side).toMatchObject({
      position: "fixed",
      top: "var(--hs-topbar-h)",
      bottom: "0",
      left: "0",
      width: "var(--lbl-side-w)",
      "border-top": "1px solid var(--bf-line-solid)",
      "border-right": "1px solid var(--bf-line-solid)",
      background: "var(--bf-surface)"
    });
    // nothing in the section moves the top bar or hides its wordmark
    const barRules = rules.flatMap(({ rule }) => rule.selectors.map(norm)).filter((selector) => /\.(hs-)?topbar\b/.test(selector));
    expect(barRules).toEqual([]);
    // it stacks where the rail does: over the page, under the top bar, so the bar's menus open over it
    const hubspot = postcss.parse(readFileSync(join(SRC, "app-shell-hubspot.css"), "utf8"));
    const zIndexOf = (selector: string) => {
      const found = hubspot.nodes.find(
        (n): n is Rule => n.type === "rule" && norm(n.selector) === selector && Boolean(decls(n)["z-index"])
      );
      return Number(decls(found!)["z-index"]);
    };
    expect(Number(side["z-index"])).toBe(zIndexOf(".hs-shell .sidebar.hs-rail"));
    expect(Number(side["z-index"])).toBeLessThan(zIndexOf(".hs-shell .topbar.hs-topbar"));
    // BuildFlow AI docks beside it, whatever its width
    const breeze = live.find(({ rule, media }) => media === null && norm(rule.selector) === `body:has(${open}) > .bf-breeze`);
    expect(decls(breeze!.rule).left).toBe("var(--lbl-user-w, 244px)");
  });

  it("makes the divider the handle: the resize cursor, the edge darkening, a tip that waits and never shows mid-drag", () => {
    const handle = decls(live.find(({ rule, media }) => media === null && norm(rule.selector) === `${S} .lbl-resize`)!.rule);
    expect(handle).toMatchObject({ position: "absolute", cursor: "col-resize", "touch-action": "none" });
    const lit = live.find(({ rule }) => rule.selectors.map(norm).includes(`${S} .lbl-resize:hover::after`));
    expect(lit!.rule.selectors.map(norm)).toContain(`body.bf-side-resizing ${S} .lbl-resize::after`);
    expect(decls(lit!.rule).background).toBe("color-mix(in srgb, var(--bf-ink) 22%, transparent)");
    const tipShown = decls(live.find(({ rule }) => norm(rule.selector) === `${S} .lbl-resize:hover .lbl-resize-tip`)!.rule);
    expect(tipShown).toMatchObject({ opacity: "1", "transition-delay": "var(--bfm-dur-base)" });
    const tipDragging = decls(
      live.find(({ rule }) => norm(rule.selector) === `body.bf-side-resizing ${S} .lbl-resize .lbl-resize-tip`)!.rule
    );
    expect(tipDragging.opacity).toBe("0");
    // the app's tooltip, the ink pill, so it reads on either mode
    expect(decls(live.find(({ rule }) => norm(rule.selector) === `${S} .lbl-resize-tip`)!.rule).background).toBe("var(--bf-ink)");
    // the column of glyphs under 900px has one width: no handle there
    const narrow = rules.find(({ rule, media }) => /max-width: 900px/.test(media ?? "") && norm(rule.selector) === `${S} .lbl-resize`);
    expect(decls(narrow!.rule).display).toBe("none");
  });

  it("assembles on the rail's beats and opens its menus out of their buttons", () => {
    const rows = live.find(
      ({ rule }) => rule.selectors.map(norm).includes(`${S}.bfm-open .lbl-side .lbl-row`) && decls(rule)["animation-delay"]
    );
    expect(decls(rows!.rule)["animation-delay"]).toBe(
      "calc(var(--bfm-beat-nav-icons) + min(var(--lbl-i, 0), 12) * var(--bfm-stagger-icon))"
    );
    for (const menu of [`${S} .hs-menu.lbl-create-menu`, `${S} .lbl-side .bfws-menu`]) {
      const found = live.find(({ rule }) => norm(rule.selector) === menu);
      expect(decls(found!.rule).animation, menu).toBe("bfe-goo var(--bf-dur-panel) var(--bf-ease-size) backwards");
    }
  });

  it("gives a reader who asked for less motion none of it", () => {
    const quiet = new Set(reduce.flatMap(({ rule }) => rule.selectors.map(norm)));
    const moving = live.filter(({ rule }) => {
      const d = decls(rule);
      return Boolean(d.animation && d.animation !== "none") || /rotate/.test(d.transition ?? "");
    });
    expect(moving.length).toBeGreaterThan(3);
    for (const { rule } of moving)
      for (const selector of rule.selectors.map(norm))
        expect(quiet.has(selector), `${selector} moves with nothing said about less motion`).toBe(true);
  });
});
