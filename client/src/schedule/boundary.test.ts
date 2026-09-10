/**
 * The schedule folder's boundary — "one implementation per view, in schedule/, none
 * of it in App.tsx" as a test. It reads the client's sources (Vite's raw glob), so a
 * board or drawer creeping back into App.tsx, a page reaching into a sibling page, or
 * a schedule module left at the client root fails the suite.
 */
import { describe, expect, it } from "vitest";
import { SCHEDULE_PAGES } from "./useScheduleContext";

const sources = import.meta.glob("/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const read = (rel: string) => {
  const text = sources[`/src/${rel}`];
  if (text === undefined) throw new Error(`${rel} is not in client/src`);
  return text;
};
const app = read("App.tsx");
const pageComponent = (id: string) => `${id.charAt(0).toUpperCase()}${id.slice(1)}Page`;

describe("schedule folder boundary", () => {
  it("has exactly one page module per schedule page, and App.tsx only routes to it", () => {
    for (const id of SCHEDULE_PAGES) {
      const name = pageComponent(id);
      const file = `schedule/pages/${name}.tsx`;
      expect(read(file), `${file} exports ${name}`).toMatch(new RegExp(`^export function ${name}\\(`, "m"));
      expect(app.match(new RegExp(`<${name}\\b`, "g"))?.length, `${name} rendered once in App.tsx`).toBe(1);
      expect(app, `App.tsx routes page "${id}"`).toContain(`page === "${id}" && `);
    }
  });

  it("defines no schedule view, board, cell or drawer in App.tsx", () => {
    expect(app).not.toMatch(/sched-/);
    expect(app).not.toMatch(/className=[^\n]*gantt-/);
    expect(app).not.toMatch(
      /^(export )?function (Schedule|Sched|Week|Month|Kanban|Matrix|Gantt|Job|Booking)[A-Za-z]*(Page|Board|View|Cell|Card|Drawer|Row|Lane|Chip)\b/m
    );
    expect(app, "App.tsx reads shared parts through the barrel only").not.toMatch(/from "\.\/schedule\/parts\//);
  });

  it("has a page test for every schedule page", () => {
    const tests = read("schedule/pages.test.tsx");
    for (const id of SCHEDULE_PAGES) {
      const name = id === "schedule" ? "Schedule landing" : `${pageComponent(id).replace(/Page$/, "")} page`;
      expect(tests, `pages.test.tsx describes "${name}"`).toContain(`describe("${name}"`);
    }
  });

  it("reads holidays and working days from the workspace calendar only", () => {
    for (const [file, text] of Object.entries(sources)) {
      if (!file.startsWith("/src/schedule/")) continue;
      expect(text, `${file} reads the built-in holiday map`).not.toMatch(/scheduleHolidays|from "\.\.?\/holidays"/);
    }
    for (const id of SCHEDULE_PAGES) {
      expect(read(`schedule/pages/${pageComponent(id)}.tsx`), `${id} reads the workspace calendar`).toMatch(/useSchedulePage\(/);
    }
  });

  it("stands every page on the one page hook, and derives nothing the hook already derives", () => {
    // the workspace, the context, the live feed, the view keys, the calendar, the KPIs, the alerts, the notice, the conflict ask and the save
    const hookOnly =
      /useBenchData\(|useScheduleContext\(|useScheduleLive\(|useScheduleViewKeys\(|workCalendarOf\(|computeScheduleKpis\(|deriveScheduleAlerts\(|useScheduleNotice\(|useConflictAsk\(|useJobSave\(|buildScheduleCpm\(|getUnassignedJobs\(|createJob\(|assignJob\(|setScheduleBaseline\(|createDependency\(|deleteDependency\(/;
    for (const id of SCHEDULE_PAGES) {
      const text = read(`schedule/pages/${pageComponent(id)}.tsx`);
      expect(text, `${id} stands on useSchedulePage`).toMatch(/const page = useSchedulePage\(/);
      expect(text, `${id} derives what the hook derives`).not.toMatch(hookOnly);
      // the Gantt keeps the index pages' card chrome; the six others stand in the shared frame
      if (id !== "gantt") expect(text, `${id} stands in the page frame`).toMatch(/<SchedulePageFrame/);
    }
  });

  it("offers the one export menu on every schedule page", () => {
    for (const id of SCHEDULE_PAGES) {
      expect(read(`schedule/pages/${pageComponent(id)}.tsx`), `${id} renders ScheduleExportMenu`).toContain("<ScheduleExportMenu");
    }
  });

  it("keeps every schedule module inside schedule/", () => {
    const strays = Object.keys(sources).filter((file) => /^\/src\/[^/]+$/.test(file) && /sched/i.test(file));
    expect(strays).toEqual([]);
  });

  it("lets no page reach into a sibling page, and nothing but App.tsx import the pages", () => {
    for (const [file, text] of Object.entries(sources)) {
      if (!file.startsWith("/src/schedule/pages/")) continue;
      expect(text, file).not.toMatch(/from "\.\/(Schedule|Week|List|Kanban|Month|Matrix|Gantt)Page"/);
    }
    const importers = Object.entries(sources)
      .filter(([file, text]) => !file.startsWith("/src/schedule/") && /schedule\/pages\//.test(text))
      .map(([file]) => file);
    expect(importers).toEqual(["/src/App.tsx"]);
  });
});
