import { describe, expect, it } from "vitest";
import type { Job, ScheduleVariance, SiteWeatherForecast, WeatherAlert, WeatherConflict, WeatherWindow } from "@buildflow/shared";
import {
  alertRows,
  badgeFor,
  causeIn,
  clockWords,
  conditionOf,
  conflictRows,
  dateWords,
  dayName,
  daySpoken,
  daytimeWindows,
  focusSite,
  nameList,
  readConflict,
  readForecast,
  rowState,
  spanWords,
  timeRange,
  windowsDuring
} from "./weatherIQ";

const job = (id: string, projectId: string, startDate: string, endDate: string, overrides: Partial<Job> = {}) =>
  ({ id, projectId, name: projectId, phase: `Phase ${id}`, startDate, endDate, status: "Confirmed", ...overrides }) as Job;

const window = (start: string, end: string, overrides: Partial<WeatherWindow> = {}): WeatherWindow => ({
  cause: "lightning",
  severity: "hold",
  start,
  end,
  reason: "thunderstorms",
  ...overrides
});

const conflict = (id: string, overrides: Partial<WeatherConflict> = {}): WeatherConflict => ({
  id,
  jobId: "j-slab",
  projectId: "p-river",
  date: "2026-06-17",
  cause: "lightning",
  severity: "hold",
  start: "2026-06-17T13:00",
  end: "2026-06-17T15:00",
  reason: "thunderstorms",
  assigneeId: "u-matt",
  status: "open",
  detectedAt: "2026-06-16T12:00:00Z",
  updatedAt: "2026-06-16T12:00:00Z",
  ...overrides
});

describe("the words WeatherIQ says", () => {
  it("names the weather, the day and the time the way a person does", () => {
    expect(conditionOf(0)).toEqual({ kind: "clear", label: "Clear" });
    expect(conditionOf(63)).toEqual({ kind: "rain", label: "Rain" });
    expect(conditionOf(95)).toEqual({ kind: "storm", label: "Thunderstorms" });
    expect(dayName("2026-06-16", "2026-06-16")).toBe("Today");
    expect(dayName("2026-06-18", "2026-06-16")).toBe("Thu");
    expect(daySpoken("2026-06-17", "2026-06-16")).toBe("tomorrow");
    expect(daySpoken("2026-06-19", "2026-06-16")).toBe("Friday");
    expect(dateWords("2026-06-18")).toBe("Thu, Jun 18");
    expect(spanWords("2026-06-18", "2026-06-18")).toBe("Thu, Jun 18");
    expect(spanWords("2026-06-18", "2026-06-22")).toBe("Thu, Jun 18 – Mon, Jun 22");
    expect(clockWords("2026-06-18T13:00")).toBe("1 PM");
    expect(clockWords("2026-06-18T15:30")).toBe("3:30 PM");
    expect(timeRange("2026-06-18T13:00", "2026-06-18T15:00")).toBe("1–3 PM");
    expect(timeRange("2026-06-18T11:00", "2026-06-18T13:00")).toBe("11 AM–1 PM");
    expect(timeRange("2026-06-18T07:00", "2026-06-18T09:30")).toBe("7–9:30 AM");
    expect(nameList(["Harbor Tower", "Pier 9"])).toBe("Harbor Tower and Pier 9");
    expect(nameList(["A", "B", "C", "D", "E"])).toBe("A, B and 3 more");
  });
});

describe("a day's weather", () => {
  it("keeps the windows a crew could meet, between 6 AM and 7 PM, worst first", () => {
    const site = {
      windows: [
        window("2026-06-17T02:00", "2026-06-17T04:00", { cause: "rain", severity: "hold", reason: "0.40 in of rain" }),
        window("2026-06-17T09:00", "2026-06-17T11:00", { cause: "wind", severity: "watch", reason: "gusts to 28 mph" }),
        window("2026-06-17T14:00", "2026-06-17T16:00"),
        window("2026-06-18T13:00", "2026-06-18T14:00")
      ]
    } as SiteWeatherForecast;
    expect(daytimeWindows(site, "2026-06-17").map((item) => item.cause)).toEqual(["lightning", "wind"]);
    expect(windowsDuring(site.windows, "2026-06-17T00:00", "2026-06-17T05:00").map((item) => item.reason)).toEqual(["0.40 in of rain"]);
  });
});

describe("what came back from the server", () => {
  it("keeps a forecast's days, windows, placement and conflicts, and drops what is not one", () => {
    const read = readForecast({
      source: "open-meteo",
      sites: [
        {
          projectId: "p-river",
          place: "Austin, Texas",
          locatedBy: "custom",
          timezone: "America/Chicago",
          fetchedAt: "x",
          days: [{ date: "2026-06-16", code: 1, highF: 88, lowF: 70, rainChance: 10, rainInches: 0, gustMph: 12 }, { date: "2026-06-17" }],
          windows: [window("2026-06-17T13:00", "2026-06-17T15:00"), { cause: "hail", severity: "hold" }]
        },
        { projectId: "p-empty", days: [] }
      ],
      unplaced: ["p-lost", 7],
      conflicts: [conflict("wx-1"), { id: "broken" }]
    });
    expect(read?.sites.map((site) => [site.projectId, site.days.length, site.windows.length, site.locatedBy])).toEqual([
      ["p-river", 1, 1, "custom"]
    ]);
    expect(read?.unplaced).toEqual(["p-lost"]);
    expect(read?.conflicts.map((item) => item.id)).toEqual(["wx-1"]);
  });

  it("is no forecast at all when the reply is something else — a test's bootstrap, a proxy's page", () => {
    expect(readForecast({ projects: [], jobs: [] })).toBeNull();
    expect(readForecast("<html>")).toBeNull();
    expect(readConflict({ ...conflict("wx-1"), status: "maybe" })).toBeNull();
  });
});

describe("the job days, as rows", () => {
  const variance = (id: string, status: ScheduleVariance["status"]) => ({ id, status }) as ScheduleVariance;

  it("reads where a job day stands: open, a reschedule waiting, rescheduled, called off, or kept", () => {
    expect(rowState(conflict("a"), [])).toBe("open");
    expect(rowState(conflict("a", { status: "cancelled", varianceId: "v1" }), [variance("v1", "pending")])).toBe("reschedule");
    expect(rowState(conflict("a", { status: "cancelled", varianceId: "v1" }), [variance("v1", "accepted")])).toBe("rescheduled");
    expect(rowState(conflict("a", { status: "cancelled", varianceId: "v1" }), [variance("v1", "rejected")])).toBe("called-off");
    expect(rowState(conflict("a", { status: "kept" }), [])).toBe("kept");
    // the pills the Dashboard already paints: a hold in the High pair, a watch in the Medium one
    expect(badgeFor({ state: "open", severity: "hold" })).toEqual({ text: "Hold", tone: "high" });
    expect(badgeFor({ state: "open", severity: "watch" })).toEqual({ text: "Watch", tone: "medium" });
    expect(badgeFor({ state: "reschedule", severity: "hold" })).toEqual({ text: "Reschedule?", tone: "medium" });
  });

  it("lists what needs a decision first, a hold before a watch, then what waits on a reschedule, then what was decided", () => {
    const jobs = [job("j-slab", "p-river", "2026-06-15", "2026-06-19")];
    const rows = conflictRows(
      [
        conflict("kept", { status: "kept", date: "2026-06-17" }),
        conflict("watch", { severity: "watch", cause: "wind", reason: "gusts to 28 mph", date: "2026-06-17" }),
        conflict("off", { status: "cancelled", varianceId: "v1", date: "2026-06-16" }),
        conflict("hold", { date: "2026-06-18", start: "2026-06-18T13:00", end: "2026-06-18T15:00" }),
        conflict("gone", { jobId: "j-deleted" }),
        conflict("past", { date: "2026-06-15" }),
        conflict("clear", { status: "cleared" })
      ],
      jobs,
      [variance("v1", "pending")],
      "2026-06-16"
    );
    expect(rows.map((row) => [row.key, row.state])).toEqual([
      ["hold", "open"],
      ["watch", "open"],
      ["off", "reschedule"],
      ["kept", "kept"]
    ]);
    expect(rows[0].when).toBe("Thu 1–3 PM");
  });

  it("opens on the site of the soonest decision, else the busiest site, else the first", () => {
    const forecast = {
      source: "open-meteo" as const,
      unplaced: [],
      conflicts: [],
      sites: [
        { projectId: "p-river", days: [] },
        { projectId: "p-harbor", days: [] }
      ]
    } as never;
    const jobs = [
      job("j-slab", "p-river", "2026-06-16", "2026-06-18"),
      job("a", "p-harbor", "2026-06-16", "2026-06-16"),
      job("b", "p-harbor", "2026-06-16", "2026-06-16")
    ];
    const rows = conflictRows([conflict("hold", { jobId: "a", projectId: "p-harbor", date: "2026-06-16" })], jobs, [], "2026-06-16");
    expect(focusSite(forecast, rows, jobs, "2026-06-16")).toBe("p-harbor");
    expect(focusSite(forecast, [], jobs, "2026-06-16")).toBe("p-harbor");
    expect(focusSite(forecast, [], [], "2026-06-16")).toBe("p-river");
  });
});

describe("the saved alerts, when the forecast cannot be had", () => {
  const alert = (overrides: Partial<WeatherAlert>): WeatherAlert => ({
    id: "wa",
    projectId: "p-river",
    title: "Heavy rain expected",
    details: "Rain and gusts.",
    severity: "Medium",
    startsAt: "2026-06-18T12:00:00.000Z",
    ...overrides
  });

  it("reaches a job scheduled at that site on that day — and not one that ends the day before", () => {
    expect(alertRows([alert({})], [job("slab", "p-river", "2026-06-15", "2026-06-17")], "2026-06-16")).toEqual([]);
    expect(alertRows([alert({})], [job("slab", "p-river", "2026-06-15", "2026-06-18")], "2026-06-16")).toMatchObject([
      {
        date: "2026-06-18",
        severity: "watch",
        cause: "rain",
        reason: "Heavy rain expected",
        when: "Thursday",
        state: "open",
        conflict: null
      }
    ]);
  });

  it("holds on a High alert, reaches every site when it names none, and skips a mild one", () => {
    const jobs = [job("a", "p-river", "2026-06-18", "2026-06-18"), job("b", "p-harbor", "2026-06-18", "2026-06-18")];
    const everywhere = alertRows([alert({ projectId: undefined, title: "Hard freeze", severity: "High" })], jobs, "2026-06-16");
    expect(everywhere.map((row) => [row.job.id, row.severity, row.cause])).toEqual([
      ["a", "hold", "cold"],
      ["b", "hold", "cold"]
    ]);
    expect(alertRows([alert({ title: "Pleasant afternoon", details: "Light breeze.", severity: "Low" })], jobs, "2026-06-16")).toEqual([]);
  });

  it("reads the weather in a word without catching it inside another word", () => {
    expect(causeIn("icy bridges at dawn")).toBe("cold");
    expect(causeIn("unload at the site office")).toBeNull();
    expect(causeIn("hot afternoon")).toBe("heat");
    expect(causeIn("gusty winds")).toBe("wind");
  });
});
