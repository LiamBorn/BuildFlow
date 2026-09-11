/**
 * The schedule folder's boundary — "one implementation per view, in schedule/, none of it in App.tsx"
 * as a test.
 *
 * Two kinds of check live here, and the difference matters. What a module *does* is asserted by doing
 * it: a page module is imported and its component called, so renaming an export or a class prefix
 * changes nothing here. What a module *reaches for* — which file imports which — cannot be seen from
 * the outside, so those are read from the source: a board creeping back into App.tsx, a page reaching
 * into a sibling page, or a schedule module left at the client root still fails the suite.
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
  it("has exactly one page module per schedule page, and App.tsx only routes to it", async () => {
    for (const id of SCHEDULE_PAGES) {
      const name = pageComponent(id);
      // the module is imported, not read: how the component is declared is its own business
      const module = (await import(`./pages/${name}.tsx`)) as Record<string, unknown>;
      expect(typeof module[name], `${name} is a component`).toBe("function");
      expect(app.match(new RegExp(`<${name}\\b`, "g"))?.length, `${name} rendered once in App.tsx`).toBe(1);
      expect(app, `App.tsx routes page "${id}"`).toContain(`page === "${id}" && `);
    }
  });

  it("defines no schedule view, board, cell or drawer in App.tsx", () => {
    // what App.tsx declares and what it imports — the two things a rename cannot make true again
    expect(app).not.toMatch(
      /^(export )?(function|const) (Schedule|Sched|Week|Month|Kanban|Matrix|Gantt|Job|Booking)[A-Za-z]*(Page|Board|View|Cell|Card|Drawer|Row|Lane|Chip)\b/m
    );
    expect(app, "App.tsx reads shared parts through the barrel only").not.toMatch(/from "\.\/schedule\/parts\//);
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
