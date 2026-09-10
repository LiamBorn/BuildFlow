/**
 * P3.5 and P4.8: every schedule page renders a 2,000-job workspace. jsdom is not a
 * browser, so the numbers here are a smoke check and a regression guard on the work each
 * page does per render; the browser measurement is the acceptance test.
 *
 * Each page is rendered RUNS times and the median is reported: a single render on a busy
 * machine reads anywhere from 150 to 350 ms for the same work, which is a lottery, not a
 * measurement. The node count is the steadier number and the one the pages are judged on.
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
  /** Renders per page; the middle one is the number, so a warm-up or a busy moment cannot be it. */
  const RUNS = 3;
  for (const [name, page, root] of pages) {
    it(`renders the ${name} page`, () => {
      const runs: number[] = [];
      let nodes = 0;
      for (let run = 0; run < RUNS; run++) {
        const started = performance.now();
        const { unmount } = render(<>{page()}</>);
        runs.push(performance.now() - started);
        expect(document.querySelector(root), `${name} root`).not.toBeNull();
        nodes = document.querySelectorAll("*").length;
        unmount();
      }
      const sorted = [...runs].sort((a, b) => a - b);
      const median = Math.round(sorted[Math.floor(sorted.length / 2)]);
      // eslint-disable-next-line no-console -- the point of the run: the number per page
      console.log(`[scale] ${name}: ${median} ms (of ${sorted.map((ms) => Math.round(ms)).join("/")}), ${nodes} nodes`);
    });
  }
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
