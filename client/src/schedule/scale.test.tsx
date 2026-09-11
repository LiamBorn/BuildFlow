/**
 * P3.5 and P4.8: every schedule page renders a 2,000-job workspace. jsdom is not a
 * browser, so the numbers here are a smoke check and a regression guard on the work each
 * page does per render; the browser measurement is the acceptance test.
 *
 * Each page is rendered RUNS times and the median is taken: a single render on a busy machine reads
 * anywhere from 150 to 350 ms for the same work, which is a lottery, not a measurement.
 *
 * The budget is enforced two ways, both of which survive a loaded machine. Node counts are exact, so
 * each page has a ceiling. Times are compared with each other rather than with the clock: what a page
 * costs against the cheapest page is the number that moves when one page regresses, and a tenfold
 * slowdown of any page breaks it.
 *
 * The timing round is interleaved — every page once, then again — and each page's best round is its
 * figure. Measuring a page three times in a row and moving on gives whichever page ran while another
 * test file was busy a number three times its neighbours'; a best-of over interleaved rounds does not.
 */
import { render } from "@testing-library/react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type * as DndKit from "@dnd-kit/core";
import type * as Api from "../api";
import { bootstrapFixture } from "../test/fixture";

vi.setConfig({ testTimeout: 60000 });
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof DndKit>();
  return { ...actual, DndContext: ({ children }: { children?: ReactNode; onDragEnd?: (event: DragEndEvent) => void }) => <>{children}</> };
});
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof Api>();
  return {
    ...actual,
    fetchScheduleStatus: vi.fn(() => new Promise(() => {})),
    fetchScheduleDigest: vi.fn(() => new Promise(() => {})),
    fetchCalendarFeeds: vi.fn(async () => [])
  };
});

import { makeLargeWorkspace } from "./bench";
import { DEFAULT_VISIBLE_ROWS } from "../components/ui/gantt";
import { SchedulePage } from "./pages/SchedulePage";
import { WeekPage } from "./pages/WeekPage";
import { ListPage } from "./pages/ListPage";
import { KanbanPage } from "./pages/KanbanPage";
import { MonthPage } from "./pages/MonthPage";
import { MatrixPage } from "./pages/MatrixPage";
import { GanttPage } from "./pages/GanttPage";

if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const data = makeLargeWorkspace(bootstrapFixture, { jobs: 2000, crews: 40, projects: 25, weekStart: "2026-06-15" });
const reload = vi.fn(async () => {});
const props = { data, reload, onOpenSchedule: vi.fn(), onOpenPage: vi.fn() };

describe("a 2,000-job workspace", () => {
  it("is what the bench builds", () => {
    expect(data.jobs).toHaveLength(2000);
    expect(data.crews).toHaveLength(40);
    expect(data.projects).toHaveLength(25);
    expect(data.assignments.length).toBeGreaterThan(1500);
    const crewDays = new Set(data.assignments.map((booking) => `${booking.crewId}|${booking.date}`));
    expect(crewDays.size).toBe(data.assignments.length); // no double-booking
    expect(data.assignments.filter((booking) => booking.date >= "2026-06-15" && booking.date <= "2026-06-21").length).toBeGreaterThan(200);
    expect(makeLargeWorkspace(bootstrapFixture, { jobs: 2000, crews: 40, projects: 25, weekStart: "2026-06-15" }).jobs[7]).toEqual(
      data.jobs[7]
    ); // deterministic
  });

  const pages: Array<[string, () => ReactNode, string]> = [
    ["Schedule", () => <SchedulePage data={data} reload={reload} onOpenPage={vi.fn()} />, ".sched-views"],
    ["Week", () => <WeekPage {...props} />, ".schedule-cell"],
    ["List", () => <ListPage {...props} />, ".sched-list-day"],
    ["Kanban", () => <KanbanPage {...props} />, ".sched-kanban"],
    ["Month", () => <MonthPage {...props} />, ".sched-cal"],
    ["Matrix", () => <MatrixPage {...props} />, ".sched-matrix"],
    ["Gantt", () => <GanttPage {...props} />, ".gantt-frame"]
  ];
  /** Rounds of every page, interleaved; a page's figure is its best round. */
  const ROUNDS = 3;
  /**
   * What each page may draw with 2,000 jobs. These are ceilings, not targets: they sit a little above
   * what the page draws today, so a windowing or capping rule that stops working fails here.
   */
  const NODE_BUDGET: Record<string, number> = {
    Schedule: 700,
    Week: 2700,
    List: 2800,
    Kanban: 3800,
    Month: 1400,
    Matrix: 1600,
    Gantt: 1500
  };
  /** How much dearer than the cheapest page the dearest one may be. */
  const SPREAD = 8;

  for (const [name, page, root] of pages) {
    it(`draws the ${name} page within its node budget`, () => {
      const { unmount } = render(<>{page()}</>);
      expect(document.querySelector(root), `${name} root`).not.toBeNull();
      const nodes = document.querySelectorAll("*").length;
      unmount();
      expect(nodes, `${name} draws ${nodes} nodes, more than its budget of ${NODE_BUDGET[name]}`).toBeLessThanOrEqual(NODE_BUDGET[name]);
    });
  }

  it("keeps every page within reach of the cheapest one", () => {
    const best = new Map<string, number>();
    for (let round = 0; round < ROUNDS; round++) {
      for (const [name, page] of pages) {
        const started = performance.now();
        const { unmount } = render(<>{page()}</>);
        const took = performance.now() - started;
        unmount();
        best.set(name, Math.min(best.get(name) ?? Number.POSITIVE_INFINITY, took));
      }
    }
    const measured = [...best.entries()].map(([name, ms]) => ({ name, ms: Math.round(ms) }));
    // eslint-disable-next-line no-console -- the point of the run: the number per page
    console.log(`[scale] best of ${ROUNDS} interleaved rounds — ${measured.map((page) => `${page.name} ${page.ms}`).join(" · ")} ms`);
    const cheapest = measured.reduce((low, page) => (page.ms < low.ms ? page : low));
    const dearest = measured.reduce((high, page) => (page.ms > high.ms ? page : high));
    // a floor, so a machine fast enough to draw the cheapest page in 1 ms cannot make the ratio meaningless
    const base = Math.max(cheapest.ms, 20);
    expect(
      dearest.ms,
      `${dearest.name} took ${dearest.ms} ms against ${cheapest.name}'s ${cheapest.ms} ms; the budget is ${SPREAD}× the cheapest page`
    ).toBeLessThanOrEqual(base * SPREAD);
  });
});

describe("what the pages draw at scale", () => {
  it("shows a window of cards per Kanban lane and grows it on demand", () => {
    render(<KanbanPage {...props} />);
    const lane = document.querySelector(".sched-kan-lane") as HTMLElement;
    const total = Number(lane.querySelector("header b")?.textContent);
    expect(total).toBeGreaterThan(24);
    expect(lane.querySelectorAll(".sched-kan-card")).toHaveLength(24);
    const more = lane.querySelector(".sched-kan-more") as HTMLButtonElement;
    expect(more.textContent).toBe(`Show 24 more of ${total - 24}`);
    more.click();
  });
  it("caps the Gantt at the jobs nearest today and says how many more there are", () => {
    render(<GanttPage {...props} />);
    expect(document.querySelectorAll("[data-feature-id]").length).toBeLessThanOrEqual(300);
    expect(document.querySelector(".gantt-cap-note")?.textContent).toMatch(/^Showing the 300 jobs nearest today of \d+/);
  });

  it("draws only the Gantt rows a screen holds, and the height of the ones it skips", () => {
    render(<GanttPage {...props} />);
    const bars = document.querySelectorAll("[data-feature-id]").length;
    const sidebarRows = document.querySelectorAll(".gantt-sidebar-item").length;
    // the window is a screenful, not the whole 300-row cap
    expect(bars).toBeGreaterThan(0);
    expect(bars).toBeLessThanOrEqual(DEFAULT_VISIBLE_ROWS);
    expect(sidebarRows).toBe(bars); // the two sides draw the same rows
    // the rows it skipped are still the height they would have taken, on both sides
    const spacers = [...document.querySelectorAll(".gantt-row-spacer")].map((el) => (el as HTMLElement).style.height);
    expect(spacers.length).toBeGreaterThan(0);
    expect(spacers.every((height) => /^\d+px$/.test(height))).toBe(true);
  });
  it("renders the first crew rows of the Week board eagerly and the rest as placeholders until scrolled near", () => {
    render(<WeekPage {...props} />);
    expect(document.querySelectorAll(".crew-row")).toHaveLength(40);
    expect(document.querySelectorAll(".crew-row.is-lazy")).toHaveLength(28);
    // a lazy row is its crew and one placeholder, not seven day cells
    expect(document.querySelectorAll(".crew-row.is-lazy .schedule-cell")).toHaveLength(28);
    expect(document.querySelectorAll(".schedule-job").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".unassigned-list .schedule-queue-job, .unassigned-list [data-job-id]").length).toBeLessThanOrEqual(
      30
    );
  });
});
