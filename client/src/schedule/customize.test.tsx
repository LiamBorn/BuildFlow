/**
 * The Schedule page's sections on the Dashboard's panel board (2026-09-15): "the customize
 * feature for the Schedule page, the same way as the Dashboard" — the same moving, the same
 * "+", the same removing, every section full width by default, the same spacing. The engine
 * is the Dashboard's own (board/panelBoard.tsx); these prove the Schedule page stands on it
 * the way the Dashboard does, and that its sections arrive as one-heading panels.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import postcss, { type Rule } from "postcss";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import App from "../App";
import { bootstrapFixture } from "../test/fixture";
import { enterDashboard, installAppHarness, openSchedule, respondToBuildflowApi } from "../test/appHarness";
import { DASH_GAP } from "../dashGrid";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const sheet = postcss.parse(readFileSync(join(SRC, "schedule-board.css"), "utf8"));
const declsOf = (selector: string): Record<string, string> => {
  const out: Record<string, string> = {};
  sheet.walkRules((rule: Rule) => {
    if (rule.selector.split(",").map((part) => part.trim()).includes(selector)) rule.walkDecls((decl) => {
        out[decl.prop] = decl.value;
      });
  });
  return out;
};

/* The fixture workspace is set up and booked, so the first-run section stays away: the frame's three
   blocks, then the page's own, then the rail's three — the order the page read in. */
const SECTION_ORDER = ["kpis", "filters", "savedViews", "views", "digest", "variances", "queue", "alerts", "crews", "milestones"];
const KEY = `bf:schedule:layout:schedule:${bootstrapFixture.activeUser.id}`;
const panels = () => [...document.querySelectorAll<HTMLElement>(".sched-board-host .dash-block")];
const settingsWrites = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.calls
    .filter(([url]) => String(url).includes("/api/me/settings/"))
    .map(([url, init]) => ({ url: decodeURIComponent(String(url)), value: JSON.parse(String((init as RequestInit | undefined)?.body)).value as string }));
const settingsFetch = () =>
  vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/api/me/settings/")) return new Response(JSON.stringify({ ok: true }), { status: 200 });
    return respondToBuildflowApi(input);
  });

describe("the Schedule page's board", () => {
  installAppHarness();

  it("lays every section out as a panel with the Dashboard's one header, in reading order", async () => {
    render(<App />);
    await enterDashboard();
    await openSchedule();

    expect(panels().map((panel) => panel.dataset.dashDragId)).toEqual(SECTION_ORDER);
    for (const panel of panels()) {
      const id = panel.dataset.dashDragId;
      expect(panel.querySelectorAll(":scope > .hs-widget-head").length, id).toBe(1);
      expect(panel.querySelector(":scope > .hs-widget-head h2")?.textContent?.trim(), id).not.toBe("");
      // the section's own title row is gone — the panel's is the one
      expect(panel.querySelector(".sched-home-section > header, .sched-rail-head, .sv-drawer-head"), id).toBeNull();
    }
    // the status band is not a panel: it stays above the board, as on the Dashboard
    expect(document.querySelector(".sched-board-host .dash-block [data-tutorial-id='schedule-status-band']")).toBeNull();
    expect(document.querySelector(".sched-board-host [data-tutorial-id='schedule-status-band']")).not.toBeNull();
    // nothing to move, size or remove outside Customize
    expect(screen.queryByRole("button", { name: /^Move / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reset layout/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a section" })).toBeInTheDocument();
  });

  it("moves, sizes and removes a section only in Customize; a removed one waits in + and Hidden panels; the board follows the account", async () => {
    const fetchMock = settingsFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await enterDashboard();
    await openSchedule();

    fireEvent.click(screen.getByRole("button", { name: /^Customize$/ }));
    expect(screen.getByRole("button", { name: /^Done$/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Move What changed this week/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resize What changed this week" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove What changed this week" }));
    expect(screen.queryByRole("heading", { name: "What changed this week" })).not.toBeInTheDocument();
    const hidden = screen.getByRole("group", { name: "Hidden panels" });
    expect(within(hidden).getByRole("button", { name: "Show What changed this week" })).toBeInTheDocument();

    // saved to this device — and the board it started from was every section full width, one under the next
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as { items: Array<{ id: string; x: number; w: number }>; hidden: string[] };
    expect(saved.hidden).toEqual(["digest"]);
    expect(saved.items.map((item) => item.id)).toEqual(SECTION_ORDER.filter((id) => id !== "digest"));
    expect(saved.items.every((item) => item.x === 0 && item.w === 6)).toBe(true);
    // … and to the account, under the page's own key
    await waitFor(() => expect(settingsWrites(fetchMock).length).toBeGreaterThan(0), { timeout: 3000 });
    expect(settingsWrites(fetchMock).at(-1)?.url).toBe("/api/me/settings/schedule:layout:schedule");

    // "+" lists it, off the board, and brings it back
    fireEvent.click(screen.getByRole("button", { name: "Add a section" }));
    const drawer = screen.getByRole("dialog", { name: /Add a section/ });
    fireEvent.click(within(drawer).getByRole("button", { name: "Add What changed this week" }));
    // back on the board (the drawer's own card names it too, so the board is asked, not the page)
    const board = document.querySelector(".sched-board-host .dash-board") as HTMLElement;
    expect(await within(board).findByRole("heading", { name: "What changed this week" })).toBeInTheDocument();

    // Done leaves the mode, and the handles go with it
    fireEvent.click(screen.getByRole("button", { name: /^Done$/ }));
    expect(screen.queryByRole("button", { name: /^Move / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
  });

  it("Reset layout lays every section out full width, brings back the removed ones, and saves it for the next visit", async () => {
    const fetchMock = settingsFetch();
    vi.stubGlobal("fetch", fetchMock);
    // a board this person had customized: two half-width sections and one removed
    localStorage.setItem(
      KEY,
      JSON.stringify({ items: [{ id: "kpis", x: 0, y: 0, w: 3, h: 4 }, { id: "views", x: 3, y: 0, w: 3, h: 5 }], hidden: ["digest"] })
    );
    render(<App />);
    await enterDashboard();
    await openSchedule();
    expect(screen.queryByRole("heading", { name: "What changed this week" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reset layout/ }));
    expect(await screen.findByRole("heading", { name: "What changed this week" })).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as { items: Array<{ id: string; x: number; w: number }>; hidden: string[]; fit?: boolean };
    expect(saved.hidden).toEqual([]);
    expect(saved.fit).toBe(true);
    expect(saved.items.map((item) => item.id)).toEqual(SECTION_ORDER);
    expect(saved.items.every((item) => item.x === 0 && item.w === 6)).toBe(true);
    expect(panels().map((panel) => panel.dataset.dashDragId)).toEqual(SECTION_ORDER);
    await waitFor(() => expect(settingsWrites(fetchMock).length).toBeGreaterThan(0), { timeout: 3000 });
    expect(JSON.parse(settingsWrites(fetchMock).at(-1)?.value ?? "{}").fit).toBe(true);
  });

  it("keeps the Dashboard's spacing, and takes the page-root duties back from the board's scope", () => {
    /* The board's own gap between panels is DASH_GAP (dashGrid.ts). The host stacks the title row,
       the band, the controls and the board at that same gap, and the page stack around it steps up
       to it too — one distance everywhere, as on the Dashboard. */
    const host = declsOf(".bf-shell .sched-rx .sched-board-host");
    expect(host.gap).toBe(`${DASH_GAP}px`);
    expect(declsOf(".bf-shell .sched-rx.page-stack.has-board").gap).toBe(`${DASH_GAP}px`);
    // `.dash-rx.hs-home` is a page root on the Dashboard: padding, a viewport height, a ground. Not here.
    expect(host.padding).toBe("0");
    expect(host["min-height"]).toBe("0");
    expect(host.background).toBe("transparent");
    // a section inside a panel hands its card to the panel
    const headless = declsOf(".bf-shell .sched-rx .sched-board-host .dash-block .is-headless");
    expect(headless.border).toBe("0");
    expect(headless.padding).toBe("0");
  });
});
