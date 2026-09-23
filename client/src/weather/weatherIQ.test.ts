import { describe, expect, it } from "vitest";
import type { Job, WeatherAlert, WeatherForecastDay, WeatherForecastPayload } from "@buildflow/shared";
import {
  alertRisks,
  causeIn,
  conditionOf,
  dayName,
  daySpoken,
  focusSite,
  jobsAtRisk,
  nameList,
  readForecast,
  scoreDay,
  THRESHOLDS
} from "./weatherIQ";

const calm: WeatherForecastDay = { date: "2026-06-16", code: 1, highF: 88, lowF: 70, rainChance: 10, rainInches: 0, gustMph: 12 };
const day = (date: string, overrides: Partial<WeatherForecastDay> = {}): WeatherForecastDay => ({ ...calm, date, ...overrides });

const job = (id: string, projectId: string, startDate: string, endDate: string, overrides: Partial<Job> = {}) =>
  ({ id, projectId, name: projectId, phase: `Phase ${id}`, startDate, endDate, status: "Confirmed", ...overrides }) as Job;

const forecast = (sites: Array<{ projectId: string; days: WeatherForecastDay[] }>): WeatherForecastPayload => ({
  source: "open-meteo",
  sites: sites.map((site) => ({ place: "Austin, Texas", timezone: "America/Chicago", fetchedAt: "2026-06-16T13:00:00Z", ...site })),
  unplaced: []
});

describe("scoring a day", () => {
  it("reads calm weather as clear", () => {
    expect(scoreDay(calm)).toEqual({ risk: "clear", cause: null, reason: "" });
  });

  it("watches rain from a 60% chance or a tenth of an inch, and holds from 85% or a quarter inch", () => {
    expect(scoreDay({ ...calm, rainChance: 60 })).toMatchObject({ risk: "watch", cause: "rain", reason: "60% chance of rain" });
    expect(scoreDay({ ...calm, rainChance: 30, rainInches: 0.1 })).toMatchObject({ risk: "watch", reason: "30% chance of rain, 0.10 in" });
    expect(scoreDay({ ...calm, rainChance: 85 })).toMatchObject({ risk: "hold", cause: "rain" });
    expect(scoreDay({ ...calm, rainChance: 70, rainInches: 0.25 })).toMatchObject({ risk: "hold", reason: "70% chance of rain, 0.25 in" });
  });

  it("watches gusts from 25 mph and holds from 35, the gust a lift is grounded at", () => {
    expect(scoreDay({ ...calm, gustMph: 25 })).toMatchObject({ risk: "watch", cause: "wind", reason: "gusts to 25 mph" });
    expect(scoreDay({ ...calm, gustMph: 35 })).toMatchObject({ risk: "hold", cause: "wind" });
  });

  it("watches a freeze and holds a hard one; heat only from 100°F, so a Texas September is not flagged every day", () => {
    expect(scoreDay({ ...calm, lowF: 32 })).toMatchObject({ risk: "watch", cause: "cold", reason: "a low of 32°F" });
    expect(scoreDay({ ...calm, lowF: 20 })).toMatchObject({ risk: "hold", cause: "cold" });
    expect(scoreDay({ ...calm, highF: 99 }).risk).toBe("clear");
    expect(scoreDay({ ...calm, highF: THRESHOLDS.heat.watchF })).toMatchObject({ risk: "watch", cause: "heat", reason: "a high of 100°F" });
    expect(scoreDay({ ...calm, highF: 105 })).toMatchObject({ risk: "hold", cause: "heat" });
  });

  it("takes the worst of several, a hold over a watch", () => {
    expect(scoreDay({ ...calm, rainChance: 65, gustMph: 40 })).toMatchObject({ risk: "hold", cause: "wind" });
  });
});

describe("naming the weather and the day", () => {
  it("turns a WMO code into what the sky is doing", () => {
    expect(conditionOf(0)).toEqual({ kind: "clear", label: "Clear" });
    expect(conditionOf(2).kind).toBe("partly");
    expect(conditionOf(45).kind).toBe("fog");
    expect(conditionOf(63)).toEqual({ kind: "rain", label: "Rain" });
    expect(conditionOf(81)).toEqual({ kind: "rain", label: "Showers" });
    expect(conditionOf(75).kind).toBe("snow");
    expect(conditionOf(95)).toEqual({ kind: "storm", label: "Thunderstorms" });
  });

  it("names today, tomorrow and the weekdays after", () => {
    expect(dayName("2026-06-16", "2026-06-16")).toBe("Today");
    expect(dayName("2026-06-18", "2026-06-16")).toBe("Thu");
    expect(daySpoken("2026-06-17", "2026-06-16")).toBe("tomorrow");
    expect(daySpoken("2026-06-19", "2026-06-16")).toBe("Friday");
  });

  it("lists names the way a sentence does", () => {
    expect(nameList(["Pier 9"])).toBe("Pier 9");
    expect(nameList(["Harbor Tower", "Pier 9"])).toBe("Harbor Tower and Pier 9");
    expect(nameList(["A", "B", "C", "D", "E"])).toBe("A, B and 3 more");
  });
});

describe("the jobs the week's weather reaches", () => {
  const week = forecast([
    {
      projectId: "p-river",
      days: [day("2026-06-16"), day("2026-06-17", { rainChance: 70 }), day("2026-06-18", { rainChance: 95, rainInches: 0.6 })]
    },
    { projectId: "p-harbor", days: [day("2026-06-16", { gustMph: 30 }), day("2026-06-17"), day("2026-06-18")] }
  ]);

  it("flags each open job once, at its worst day, soonest first", () => {
    const jobs = [
      job("slab", "p-river", "2026-06-17", "2026-06-18"), // a watch on the 17th, a hold on the 18th: the hold wins
      job("frame", "p-harbor", "2026-06-15", "2026-06-16"), // gusts today
      job("done", "p-river", "2026-06-17", "2026-06-18", { status: "Complete" }), // finished work is not at risk
      job("later", "p-river", "2026-06-20", "2026-06-21"), // not in the forecast
      job("calm", "p-harbor", "2026-06-17", "2026-06-18") // two calm days
    ];
    const risks = jobsAtRisk(week, jobs, "2026-06-16");
    expect(risks.map((risk) => [risk.job.id, risk.date, risk.risk, risk.cause])).toEqual([
      ["frame", "2026-06-16", "watch", "wind"],
      ["slab", "2026-06-18", "hold", "rain"]
    ]);
    expect(risks[1].reason).toBe("95% chance of rain, 0.60 in");
  });

  it("ignores the days already behind", () => {
    expect(jobsAtRisk(week, [job("slab", "p-river", "2026-06-17", "2026-06-18")], "2026-06-19")).toEqual([]);
  });

  it("opens on the site of the soonest trouble, else the busiest site, else the first", () => {
    const jobs = [job("slab", "p-river", "2026-06-18", "2026-06-18"), job("a", "p-harbor", "2026-06-17", "2026-06-17")];
    expect(focusSite(week, jobsAtRisk(week, jobs, "2026-06-16"), jobs, "2026-06-16")).toBe("p-river");
    const quiet = forecast([
      { projectId: "p-river", days: [day("2026-06-16")] },
      { projectId: "p-harbor", days: [day("2026-06-16")] }
    ]);
    const harborWork = [job("a", "p-harbor", "2026-06-16", "2026-06-16"), job("b", "p-harbor", "2026-06-16", "2026-06-16")];
    expect(focusSite(quiet, [], harborWork, "2026-06-16")).toBe("p-harbor");
    expect(focusSite(quiet, [], [], "2026-06-16")).toBe("p-river");
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
    const ending = job("slab", "p-river", "2026-06-15", "2026-06-17");
    expect(alertRisks([alert({})], [ending], "2026-06-16")).toEqual([]);
    const through = job("slab", "p-river", "2026-06-15", "2026-06-18");
    expect(alertRisks([alert({})], [through], "2026-06-16")).toMatchObject([
      { date: "2026-06-18", risk: "watch", cause: "rain", reason: "Heavy rain expected" }
    ]);
  });

  it("holds on a High alert, reaches every site when it names none, and skips a mild one", () => {
    const jobs = [job("a", "p-river", "2026-06-18", "2026-06-18"), job("b", "p-harbor", "2026-06-18", "2026-06-18")];
    const everywhere = alertRisks([alert({ projectId: undefined, title: "Hard freeze", severity: "High" })], jobs, "2026-06-16");
    expect(everywhere.map((risk) => [risk.job.id, risk.risk, risk.cause])).toEqual([
      ["a", "hold", "cold"],
      ["b", "hold", "cold"]
    ]);
    expect(alertRisks([alert({ title: "Pleasant afternoon", details: "Light breeze.", severity: "Low" })], jobs, "2026-06-16")).toEqual([]);
  });

  it("reads the weather in a word without catching it inside another word", () => {
    expect(causeIn("icy bridges at dawn")).toBe("cold");
    expect(causeIn("unload at the site office")).toBeNull();
    expect(causeIn("hot afternoon")).toBe("heat");
    expect(causeIn("gusty winds")).toBe("wind");
  });
});

describe("what came back from the server", () => {
  it("keeps a forecast and drops the parts that are not one", () => {
    const read = readForecast({
      source: "open-meteo",
      sites: [
        { projectId: "p-river", place: "Austin, Texas", timezone: "America/Chicago", fetchedAt: "x", days: [calm, { date: "2026-06-17" }] },
        { projectId: "p-empty", days: [] },
        { nothing: true }
      ],
      unplaced: ["p-lost", 7]
    });
    expect(read?.sites.map((site) => [site.projectId, site.days.length])).toEqual([["p-river", 1]]);
    expect(read?.unplaced).toEqual(["p-lost"]);
  });

  it("is no forecast at all when the reply is something else — a test's bootstrap, a proxy's page", () => {
    expect(readForecast({ projects: [], jobs: [] })).toBeNull();
    expect(readForecast(null)).toBeNull();
    expect(readForecast("<html>")).toBeNull();
  });
});
