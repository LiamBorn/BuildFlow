import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  scheduleCalendarFor,
  type Job,
  type PermissionLevel,
  type Project,
  type SiteWeatherForecast,
  type WeatherWindow
} from "@buildflow/shared";
import { createApp } from "../src/app.js";
import { BuildFlowStore } from "../src/database.js";
import { can, ROUTE_POLICY } from "../src/permissions.js";
import { __resetWeatherCaches, nextHour, scoreHour, windowsFromHours, type WeatherHour } from "../src/weather.js";
import { DEFAULT_HOURS, detectConflicts, jobHours, parseClock, rescheduleDates, weatherCheckFor } from "../src/weatherConflicts.js";

/**
 * WeatherIQ reaching the jobs (2026-09-23): the hours the weather crosses a line, the job days that
 * lands in, calling a day off and the reschedule it raises, and the location an Owner or Admin sets.
 * Nothing reaches the network: `fetch` answers the way Open-Meteo does (checked live on 2026-09-23 —
 * with imperial units the hours carry snowfall in inches and visibility in feet).
 */

const pad = (value: number) => String(value).padStart(2, "0");
const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const addDays = (date: string, days: number) => {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};
/** The first weekday (Monday–Friday) after `date`: a working day whatever the workspace's week. */
const nextWeekday = (date: string) => {
  let day = addDays(date, 1);
  while ([0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())) day = addDays(day, 1);
  return day;
};

type HourChange = Partial<{ code: number; temp: number; chance: number; rain: number; snow: number; gust: number; visibility: number }>;

/** Open-Meteo's answer for one place: seven calm days from `first`, hour by hour, with the given hours changed. */
function week(first: string, changes: Record<string, HourChange> = {}) {
  const dates = Array.from({ length: 7 }, (_, index) => addDays(first, index));
  const times = dates.flatMap((date) => Array.from({ length: 24 }, (_, hour) => `${date}T${pad(hour)}:00`));
  const at = <K extends keyof HourChange>(time: string, key: K, fallback: number) => changes[time]?.[key] ?? fallback;
  return {
    latitude: 30.27,
    longitude: -97.75,
    timezone: "America/Chicago",
    daily: {
      time: dates,
      weather_code: dates.map(() => 1),
      temperature_2m_max: dates.map(() => 88),
      temperature_2m_min: dates.map(() => 70),
      precipitation_probability_max: dates.map(() => 10),
      precipitation_sum: dates.map(() => 0),
      wind_gusts_10m_max: dates.map(() => 12)
    },
    hourly: {
      time: times,
      weather_code: times.map((time) => at(time, "code", 1)),
      temperature_2m: times.map((time) => at(time, "temp", 80)),
      precipitation_probability: times.map((time) => at(time, "chance", 5)),
      precipitation: times.map((time) => at(time, "rain", 0)),
      snowfall: times.map((time) => at(time, "snow", 0)),
      wind_gusts_10m: times.map((time) => at(time, "gust", 12)),
      visibility: times.map((time) => at(time, "visibility", 60000))
    }
  };
}

const AUSTIN = { results: [{ name: "Austin", admin1: "Texas", latitude: 30.26715, longitude: -97.74306, feature_code: "PPLA" }] };

/** `fetch` for the geocoder and the forecast; the forecast answers every place it is asked about with `answer()`. */
function stubWeather(answer: () => ReturnType<typeof week>, geocode: (url: URL) => unknown = () => AUSTIN) {
  const calls: URL[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname.endsWith("/v1/search")) return Response.json(geocode(url));
    if (url.pathname.endsWith("/v1/forecast")) {
      const count = url.searchParams.get("latitude")!.split(",").length;
      return Response.json(Array.from({ length: count }, answer));
    }
    throw new Error(`unexpected request: ${url}`);
  });
  return { forecastCalls: () => calls.filter((url) => url.pathname.endsWith("/v1/forecast")) };
}

beforeEach(() => __resetWeatherCaches());
afterEach(() => vi.restoreAllMocks());

/* ---- the hours ---------------------------------------------------------------------------- */

describe("the hours the weather crosses a line", () => {
  const hour = (time: string, fields: Partial<WeatherHour> = {}): WeatherHour => ({
    time,
    code: 1,
    tempF: 80,
    rainChance: 5,
    rainInches: 0,
    snowInches: 0,
    gustMph: 12,
    visibilityFt: 60000,
    ...fields
  });

  it("scores an hour cause by cause: lightning and heavy rain hold, a likely shower is a watch", () => {
    expect(scoreHour(hour("t", { code: 95 }))).toEqual({ lightning: "hold" });
    expect(scoreHour(hour("t", { rainInches: 0.12 }))).toEqual({ rain: "hold" });
    expect(scoreHour(hour("t", { rainChance: 85, rainInches: 0.03 }))).toEqual({ rain: "hold" });
    expect(scoreHour(hour("t", { rainChance: 55 }))).toEqual({ rain: "watch" });
    expect(scoreHour(hour("t", { code: 66 }))).toEqual({ rain: "hold" }); // freezing rain
    expect(scoreHour(hour("t", { gustMph: 28 }))).toEqual({ wind: "watch" });
    expect(scoreHour(hour("t", { gustMph: 36 }))).toEqual({ wind: "hold" });
    expect(scoreHour(hour("t", { tempF: 99 }))).toEqual({});
    expect(scoreHour(hour("t", { tempF: 101 }))).toEqual({ heat: "watch" });
    expect(scoreHour(hour("t", { tempF: 18 }))).toEqual({ cold: "hold" });
    expect(scoreHour(hour("t", { snowInches: 0.3, tempF: 30 }))).toEqual({ snow: "hold", cold: "watch" });
    expect(scoreHour(hour("t", { visibilityFt: 600 }))).toEqual({ fog: "watch" });
    expect(scoreHour(hour("t"))).toEqual({});
  });

  it("joins one cause's hours into windows at their worst, the end exclusive, across midnight", () => {
    const hours = [
      hour("2026-09-25T12:00"),
      hour("2026-09-25T13:00", { code: 95, rainInches: 0.2 }),
      hour("2026-09-25T14:00", { code: 95, rainInches: 0.25 }),
      hour("2026-09-25T15:00", { rainChance: 60 }),
      hour("2026-09-25T16:00"),
      hour("2026-09-25T17:00"),
      hour("2026-09-25T18:00"),
      hour("2026-09-25T19:00"),
      hour("2026-09-25T20:00"),
      hour("2026-09-25T21:00"),
      hour("2026-09-25T22:00"),
      hour("2026-09-25T23:00", { gustMph: 27 }),
      hour("2026-09-26T00:00", { gustMph: 38 })
    ];
    expect(windowsFromHours(hours)).toEqual([
      { cause: "lightning", severity: "hold", start: "2026-09-25T13:00", end: "2026-09-25T15:00", reason: "thunderstorms" },
      { cause: "rain", severity: "hold", start: "2026-09-25T13:00", end: "2026-09-25T16:00", reason: "0.45 in of rain" },
      { cause: "wind", severity: "hold", start: "2026-09-25T23:00", end: "2026-09-26T01:00", reason: "gusts to 38 mph" }
    ]);
    // an hour missing from the series breaks a run into two stretches of weather
    expect(windowsFromHours([hour("2026-09-25T10:00", { gustMph: 30 }), hour("2026-09-25T12:00", { gustMph: 30 })])).toHaveLength(2);
    expect(nextHour("2026-12-31T23:00")).toBe("2027-01-01T00:00");
  });
});

/* ---- the job days ------------------------------------------------------------------------- */

describe("the job days the weather reaches", () => {
  const project = (overrides: Partial<Project> = {}) =>
    ({ id: "p-site", name: "Site", managerId: "u-matt", status: "In Progress", ...overrides }) as Project;
  const job = (overrides: Partial<Job> = {}): Job =>
    ({
      id: "j-pour",
      projectId: "p-site",
      name: "Site",
      phase: "Slab pour",
      startDate: "2026-09-24",
      endDate: "2026-09-26",
      startTime: "7:00 AM",
      endTime: "3:30 PM",
      status: "Confirmed",
      ...overrides
    }) as Job;
  const site = (windows: WeatherWindow[], first = "2026-09-24"): SiteWeatherForecast => ({
    projectId: "p-site",
    place: "Austin, Texas",
    locatedBy: "project",
    timezone: "America/Chicago",
    fetchedAt: "2026-09-24T12:00:00.000Z",
    current: null,
    days: Array.from({ length: 7 }, (_, index) => ({
      date: addDays(first, index),
      code: 1,
      highF: 88,
      lowF: 70,
      rainChance: 10,
      rainInches: 0,
      gustMph: 12
    })),
    windows
  });
  const notSunday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay() !== 0;

  it("reads a job's clock, and falls back to the program's working day when it cannot", () => {
    expect(parseClock("7:00 AM")).toBe("07:00");
    expect(parseClock("3:30 PM")).toBe("15:30");
    expect(parseClock("12:00 PM")).toBe("12:00");
    expect(parseClock("12:15 am")).toBe("00:15");
    expect(parseClock("15:30")).toBe("15:30");
    expect(parseClock("noon")).toBeNull();
    expect(jobHours({ startTime: "8:00 AM", endTime: "4:00 PM" })).toEqual({ start: "08:00", end: "16:00" });
    expect(jobHours({ startTime: "", endTime: "" })).toEqual(DEFAULT_HOURS);
    expect(jobHours({ startTime: "5:00 PM", endTime: "7:00 AM" })).toEqual(DEFAULT_HOURS);
  });

  it("finds a window inside a job's hours, trimmed to them, at the worst of the day, for the project's manager", () => {
    const windows: WeatherWindow[] = [
      { cause: "lightning", severity: "hold", start: "2026-09-25T13:00", end: "2026-09-25T17:00", reason: "thunderstorms" },
      { cause: "rain", severity: "watch", start: "2026-09-25T08:00", end: "2026-09-25T10:00", reason: "60% chance of rain" },
      // the evening before, after the crew has gone home
      { cause: "rain", severity: "hold", start: "2026-09-24T20:00", end: "2026-09-24T23:00", reason: "0.60 in of rain" }
    ];
    expect(
      detectConflicts({ sites: [site(windows)], jobs: [job()], projects: [project()], isWorkingDay: notSunday, today: "2026-09-24" })
    ).toEqual([
      {
        id: "wx-j-pour-2026-09-25",
        jobId: "j-pour",
        projectId: "p-site",
        date: "2026-09-25",
        cause: "lightning",
        severity: "hold",
        start: "2026-09-25T13:00",
        end: "2026-09-25T15:30",
        reason: "thunderstorms",
        assigneeId: "u-matt"
      }
    ]);
  });

  it("leaves out finished jobs, days off, days already behind and days outside the job", () => {
    const storm = (date: string): WeatherWindow => ({
      cause: "lightning",
      severity: "hold",
      start: `${date}T09:00`,
      end: `${date}T11:00`,
      reason: "thunderstorms"
    });
    // 2026-09-27 is a Sunday
    const windows = ["2026-09-24", "2026-09-25", "2026-09-27", "2026-09-28"].map(storm);
    const read = (jobs: Job[]) =>
      detectConflicts({ sites: [site(windows)], jobs, projects: [project()], isWorkingDay: notSunday, today: "2026-09-25" }).map(
        (c) => c.date
      );
    expect(read([job({ endDate: "2026-09-28" })])).toEqual(["2026-09-25", "2026-09-28"]);
    expect(read([job({ endDate: "2026-09-28", status: "Complete" })])).toEqual([]);
    expect(read([job({ startDate: "2026-09-29", endDate: "2026-09-30" })])).toEqual([]);
  });

  it("moves a job whose first day is lost to the next day it can work, and adds a day to one that loses a later day", () => {
    const calendar = scheduleCalendarFor("2026-09-01", { workingDays: [1, 2, 3, 4, 5, 6], holidays: [] });
    const holdOn = (date: string): WeatherWindow => ({
      cause: "rain",
      severity: "hold",
      start: `${date}T06:00`,
      end: `${date}T18:00`,
      reason: "0.80 in of rain"
    });
    // Thursday the 24th is lost and Friday is a hold too: the two-day job starts Saturday and, Sunday off, ends Monday
    expect(
      rescheduleDates({
        job: job({ endDate: "2026-09-25" }),
        lostDate: "2026-09-24",
        calendar,
        windows: [holdOn("2026-09-24"), holdOn("2026-09-25")]
      })
    ).toEqual({ start: "2026-09-26", end: "2026-09-28" });
    // a later day lost: the start stays, the finish goes to the next day it can work
    expect(
      rescheduleDates({
        job: job({ startDate: "2026-09-23", endDate: "2026-09-25" }),
        lostDate: "2026-09-24",
        calendar,
        windows: [holdOn("2026-09-24")]
      })
    ).toEqual({ start: "2026-09-23", end: "2026-09-26" });
    // a watch does not stop a job moving onto a day
    expect(
      rescheduleDates({
        job: job({ endDate: "2026-09-24" }),
        lostDate: "2026-09-24",
        calendar,
        windows: [{ ...holdOn("2026-09-25"), severity: "watch" }]
      })
    ).toEqual({ start: "2026-09-25", end: "2026-09-25" });
  });

  it("says whether the day a reschedule turns on was checked against the forecast", () => {
    const covered = site([]).days.map((day) => day.date); // the 24th to the 30th
    const pour = job({ startDate: "2026-09-24", endDate: "2026-09-25" });
    // the first day lost: the move turns on the new start, which the forecast covers
    expect(
      weatherCheckFor({ job: pour, lostDate: "2026-09-24", dates: { start: "2026-09-29", end: "2026-09-30" }, forecastDays: covered })
    ).toBe("forecast");
    // a later day lost: it turns on the new finish, and the 1st is past the forecast's last day
    expect(
      weatherCheckFor({ job: pour, lostDate: "2026-09-25", dates: { start: "2026-09-24", end: "2026-10-01" }, forecastDays: covered })
    ).toBe("beyond");
    // no forecast to check against at all
    expect(
      weatherCheckFor({ job: pour, lostDate: "2026-09-24", dates: { start: "2026-09-25", end: "2026-09-26" }, forecastDays: null })
    ).toBe("unavailable");
  });
});

/* ---- the store ---------------------------------------------------------------------------- */

describe("what the store keeps", () => {
  it("adds new conflicts open, updates an open one, leaves a decided one, and clears only what the read covered", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-wx-store-"));
    const store = await BuildFlowStore.create(path.join(dir, "wx.sqlite"), true, { seedDemo: false });
    const draft = (id: string, overrides: Record<string, string> = {}) => ({
      id,
      jobId: `j-${id}`,
      projectId: "p1",
      date: "2026-09-25",
      cause: "rain" as const,
      severity: "watch" as const,
      start: "2026-09-25T09:00",
      end: "2026-09-25T10:00",
      reason: "60% chance of rain",
      assigneeId: "u-matt",
      ...overrides
    });
    const covered = { projectIds: ["p1"], from: "2026-09-24", to: "2026-09-30" };
    store.reconcileWeatherConflicts([draft("a"), draft("b"), draft("c"), draft("d", { projectId: "p2" })], {
      ...covered,
      projectIds: ["p1", "p2"]
    });
    store.keepWeatherConflict("b", "u-liam");

    // the next read: a is worse now, b and c are gone from it, d's project was not read at all
    store.reconcileWeatherConflicts([draft("a", { severity: "hold", reason: "0.30 in of rain" })], covered);
    const byId = new Map(store.weatherConflicts({ includeCleared: true }).map((conflict) => [conflict.id, conflict]));
    expect(byId.get("a")).toMatchObject({ status: "open", severity: "hold", reason: "0.30 in of rain" });
    expect(byId.get("b")).toMatchObject({ status: "kept", decidedBy: "u-liam" });
    expect(byId.get("c")?.status).toBe("cleared");
    expect(byId.get("d")?.status).toBe("open");
    // a cleared one is left out unless asked for, and comes back open if the weather does
    expect(
      store
        .weatherConflicts()
        .map((conflict) => conflict.id)
        .sort()
    ).toEqual(["a", "b", "d"]);
    store.reconcileWeatherConflicts([draft("a", { severity: "hold", reason: "0.30 in of rain" }), draft("c")], covered);
    expect(store.weatherConflict("c")?.status).toBe("open");
  });
});

/* ---- the routes --------------------------------------------------------------------------- */

type MainStore = {
  all: <T>(sql: string) => T[];
  refreshInvite: (id: string, orgId: string, ttlMs: number) => { token: string } | undefined;
  setAccountRole: (id: string, role: string) => { role: string } | undefined;
};

async function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-wx-routes-"));
  const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
  const owner = request.agent(app);
  await owner
    .post("/api/auth/signup")
    .send({ email: "dana@asphaltco.com", password: "Roller-Tack-2026", name: "Dana Brooks", orgName: "Asphalt Co", acceptTerms: true })
    .expect(201);
  await owner
    .post("/api/business-profile")
    .send({ businessType: "Asphalt", selectedPlan: "free", selectedProducts: [], seats: 3 })
    .expect(200);
  const orgId = (await owner.get("/api/auth/me").expect(200)).body.org.id as string;
  const main = (app.locals.storeManager as { main: MainStore }).main;
  /** Someone joining at a level, the way permissions.test.ts does it. */
  const join = async (level: PermissionLevel) => {
    const email = `${level}@asphaltco.com`;
    await owner
      .post("/api/team/invites")
      .send({ invites: [{ email, permission: "member" }] })
      .expect(201);
    const row = main
      .all<{ id: string; email: string }>("SELECT id, email FROM invites WHERE acceptedAt IS NULL")
      .find((r) => r.email === email)!;
    const agent = request.agent(app);
    const joined = await agent
      .post("/api/auth/invite/accept")
      .send({
        token: main.refreshInvite(row.id, orgId, 60_000)!.token,
        name: `${level} person`,
        password: "Paver-Screed-2026",
        acceptTerms: true
      })
      .expect(201);
    if (level !== "member") main.setAccountRole(joined.body.account.id, level);
    return agent;
  };
  return { owner, join };
}

/**
 * One job of the starter workspace moved into the coming week, from today to the day after the
 * storm day, with every other job moved a month out so only it can be reached.
 */
async function oneJobThisWeek(owner: request.Agent) {
  const today = localToday();
  const stormDay = nextWeekday(today);
  const boot = (await owner.get("/api/bootstrap").expect(200)).body as {
    jobs: Job[];
    projects: Project[];
    crews: { id: string }[];
    activeUser: { id: string };
  };
  const target = boot.jobs[0];
  for (const other of boot.jobs.slice(1)) {
    await owner
      .patch(`/api/jobs/${other.id}`)
      .send({ startDate: addDays(today, 40), endDate: addDays(today, 41) })
      .expect(200);
  }
  await owner
    .patch(`/api/jobs/${target.id}`)
    .send({ startDate: today, endDate: addDays(stormDay, 1), startTime: "7:00 AM", endTime: "3:30 PM", status: "Confirmed" })
    .expect(200);
  const manager = boot.projects.find((project) => project.id === target.projectId)!.managerId;
  return { today, stormDay, target, boot, manager };
}

const storm = (day: string): Record<string, HourChange> => ({
  [`${day}T13:00`]: { code: 95, rain: 0.2, chance: 90 },
  [`${day}T14:00`]: { code: 95, rain: 0.3, chance: 90 }
});

describe("WeatherIQ's routes", () => {
  it("finds the job days this week's weather reaches, for the project's manager, and clears one when the storm passes", async () => {
    const { owner } = await workspace();
    const { today, stormDay, target, manager } = await oneJobThisWeek(owner);
    let stormy = true;
    stubWeather(() => week(today, stormy ? storm(stormDay) : {}));

    const first = (await owner.get("/api/weather/forecast").expect(200)).body;
    const conflict = first.conflicts.find((item: { jobId: string }) => item.jobId === target.id);
    expect(conflict).toMatchObject({
      id: `wx-${target.id}-${stormDay}`,
      date: stormDay,
      cause: "lightning",
      severity: "hold",
      start: `${stormDay}T13:00`,
      end: `${stormDay}T15:00`,
      reason: "thunderstorms",
      status: "open",
      assigneeId: manager
    });
    // the sites carry their windows, so the panel can say when
    expect(first.sites[0].windows.map((window: WeatherWindow) => window.cause)).toEqual(["lightning", "rain"]);
    // and bootstrap carries the conflict, for the notifications the person in charge reads
    expect((await owner.get("/api/bootstrap").expect(200)).body.weatherConflicts.map((item: { id: string }) => item.id)).toContain(
      conflict.id
    );

    stormy = false;
    __resetWeatherCaches();
    const second = (await owner.get("/api/weather/forecast").expect(200)).body;
    expect(second.conflicts.find((item: { id: string }) => item.id === conflict.id)).toBeUndefined();
  });

  it("calls a day off: releases that day's crews, logs the delay, and raises a reschedule the PM accepts on the variance route", async () => {
    const { owner } = await workspace();
    const { today, stormDay, target, boot } = await oneJobThisWeek(owner);
    stubWeather(() => week(today, storm(stormDay)));
    const booking = (
      await owner.post("/api/schedule/assign").send({ jobId: target.id, crewId: boot.crews[0].id, date: stormDay, force: true }).expect(201)
    ).body;
    const conflict = (await owner.get("/api/weather/forecast").expect(200)).body.conflicts.find(
      (item: { jobId: string }) => item.jobId === target.id
    );

    const called = (await owner.post(`/api/weather/conflicts/${conflict.id}/cancel`).send({}).expect(200)).body;
    expect(called.releasedAssignmentIds).toEqual([booking.id]);
    expect(called.delayIQ).toMatchObject({
      category: "Weather",
      impactDays: 1,
      severity: "High",
      status: "Open",
      title: `Lightning called off ${target.phase}`
    });
    expect(called.delayIQ.description).toMatch(/^Thunderstorms forecast 1:00 PM–3:00 PM on /);
    expect(called.variance).toMatchObject({ kind: "weather", status: "pending", jobId: target.id, fieldUpdateId: conflict.id });
    // the storm day falls inside the job, so it keeps its start and finishes a working day later
    expect(called.variance.proposal.proposedStart).toBe(today);
    expect(called.variance.proposal.proposedEnd > addDays(stormDay, 1)).toBe(true);
    // on a day the forecast covers, checked against it
    expect(called.variance.proposal.weatherCheck).toBe("forecast");
    expect(called.conflict).toMatchObject({
      status: "cancelled",
      decidedBy: boot.activeUser.id,
      varianceId: called.variance.id,
      delayIQId: called.delayIQ.id
    });

    const after = (await owner.get("/api/bootstrap").expect(200)).body;
    expect(after.assignments.find((item: { id: string }) => item.id === booking.id)).toBeUndefined();
    expect(after.delayIQs.map((item: { id: string }) => item.id)).toContain(called.delayIQ.id);
    // the same day cannot be called off twice
    await owner.post(`/api/weather/conflicts/${conflict.id}/cancel`).send({}).expect(404);

    await owner.post(`/api/schedule/variances/${called.variance.id}/accept`).send({ userId: boot.activeUser.id }).expect(200);
    const moved = (await owner.get("/api/bootstrap").expect(200)).body.jobs.find((item: Job) => item.id === target.id);
    expect(moved.endDate).toBe(called.variance.proposal.proposedEnd);
    // a fresh read of the same storm does not reopen a day already called off
    __resetWeatherCaches();
    const again = (await owner.get("/api/weather/forecast").expect(200)).body.conflicts.find(
      (item: { id: string }) => item.id === conflict.id
    );
    expect(again.status).toBe("cancelled");
  });

  it("still calls a day off while the forecast cannot be read, and the reschedule says its dates were never checked", async () => {
    const { owner } = await workspace();
    const { today, stormDay, target } = await oneJobThisWeek(owner);
    stubWeather(() => week(today, storm(stormDay)));
    const conflict = (await owner.get("/api/weather/forecast").expect(200)).body.conflicts.find(
      (item: { jobId: string }) => item.jobId === target.id
    );

    // the provider goes down, and nothing read earlier is left to fall back on
    vi.restoreAllMocks();
    __resetWeatherCaches();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/v1/search")) return Response.json(AUSTIN);
      return new Response("unavailable", { status: 503 });
    });

    const called = (await owner.post(`/api/weather/conflicts/${conflict.id}/cancel`).send({}).expect(200)).body;
    expect(called.conflict.status).toBe("cancelled");
    expect(called.variance).toMatchObject({ kind: "weather", status: "pending" });
    expect(called.variance.proposal.weatherCheck).toBe("unavailable");
    // and it says so wherever the reschedule is read later, not only in this answer
    const stored = (await owner.get("/api/bootstrap").expect(200)).body.variances.find(
      (item: { id: string }) => item.id === called.variance.id
    );
    expect(stored.proposal.weatherCheck).toBe("unavailable");
  });

  it("keeps a day on when the person in charge says so, and a re-read does not ask again", async () => {
    const { owner } = await workspace();
    const { today, stormDay, target, boot } = await oneJobThisWeek(owner);
    stubWeather(() => week(today, storm(stormDay)));
    const conflict = (await owner.get("/api/weather/forecast").expect(200)).body.conflicts.find(
      (item: { jobId: string }) => item.jobId === target.id
    );
    const kept = (await owner.post(`/api/weather/conflicts/${conflict.id}/keep`).send({}).expect(200)).body;
    expect(kept).toMatchObject({ status: "kept", decidedBy: boot.activeUser.id });
    __resetWeatherCaches();
    const again = (await owner.get("/api/weather/forecast").expect(200)).body.conflicts.find(
      (item: { id: string }) => item.id === conflict.id
    );
    expect(again.status).toBe("kept");
    await owner.post(`/api/weather/conflicts/${conflict.id}/keep`).send({}).expect(404);
  });

  it("lets an Owner or Admin set where a project's forecast is read, and put it back to the address", async () => {
    const { owner } = await workspace();
    const today = localToday();
    const stub = stubWeather(
      () => week(today),
      (url) =>
        url.searchParams.get("name") === "Round Rock, TX"
          ? { results: [{ name: "Round Rock", admin1: "Texas", latitude: 30.5083, longitude: -97.6789, feature_code: "PPL" }] }
          : url.searchParams.get("name") === "78701"
            ? AUSTIN
            : { results: [] }
    );
    const projectId = ((await owner.get("/api/bootstrap").expect(200)).body.projects as Project[])[1].id;

    const set = (await owner.put(`/api/weather/locations/${projectId}`).send({ query: "Round Rock, TX" }).expect(200)).body;
    expect(set).toMatchObject({ projectId, query: "Round Rock, TX", place: "Round Rock, Texas", latitude: 30.5083, longitude: -97.6789 });
    const read = (await owner.get("/api/weather/forecast").expect(200)).body;
    expect(read.sites.find((site: SiteWeatherForecast) => site.projectId === projectId)).toMatchObject({
      place: "Round Rock, Texas",
      locatedBy: "custom"
    });
    expect(stub.forecastCalls().at(-1)!.searchParams.get("latitude")).toContain("30.51");

    const missing = await owner.put(`/api/weather/locations/${projectId}`).send({ query: "Nowhereville" }).expect(404);
    expect(missing.body.error).toMatch(/No town or ZIP code matched "Nowhereville"/);
    await owner.put(`/api/weather/locations/${projectId}`).send({ query: "x" }).expect(400);
    await owner.put("/api/weather/locations/p-nowhere").send({ query: "Round Rock, TX" }).expect(404);

    await owner.delete(`/api/weather/locations/${projectId}`).expect(204);
    __resetWeatherCaches();
    const back = (await owner.get("/api/weather/forecast").expect(200)).body.sites.find(
      (site: SiteWeatherForecast) => site.projectId === projectId
    );
    expect(back.locatedBy).toBe("project");
  });

  it("leaves the decisions and the locations to those who can change the schedule", async () => {
    expect(ROUTE_POLICY["GET /api/weather/forecast"]).toBe("schedule.read");
    expect(ROUTE_POLICY["POST /api/weather/conflicts/:id/cancel"]).toBe("assignments.write");
    expect(ROUTE_POLICY["POST /api/weather/conflicts/:id/keep"]).toBe("assignments.write");
    expect(ROUTE_POLICY["PUT /api/weather/locations/:projectId"]).toBe("projects.write");
    expect(ROUTE_POLICY["DELETE /api/weather/locations/:projectId"]).toBe("projects.write");
    for (const capability of ["assignments.write", "projects.write"] as const) {
      expect(can("owner", capability)).toBe(true);
      expect(can("admin", capability)).toBe(true);
      expect(can("member", capability)).toBe(false);
    }

    const { join } = await workspace();
    stubWeather(() => week(localToday()));
    const member = await join("member");
    await member.get("/api/weather/forecast").expect(200);
    expect((await member.post("/api/weather/conflicts/wx-anything/cancel").send({}).expect(403)).body.need).toBe("assignments.write");
    expect((await member.put("/api/weather/locations/p-anything").send({ query: "78701" }).expect(403)).body.need).toBe("projects.write");
    const admin = await join("admin");
    await admin.put("/api/weather/locations/p-anything").send({ query: "78701" }).expect(404);
  });
});
