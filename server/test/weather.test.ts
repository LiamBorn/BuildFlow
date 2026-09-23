import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job, Project } from "@buildflow/shared";
import { createApp } from "../src/app.js";
import {
  __resetWeatherCaches,
  activeSites,
  forecastForSites,
  forecastUrl,
  geocodeUrl,
  hasRealPoint,
  MAX_SITES,
  PLACEHOLDER_POINT,
  readDays,
  siteQueries,
  WeatherUnavailableError
} from "../src/weather.js";

/**
 * WeatherIQ's forecast (server/src/weather.ts). Nothing here reaches the network: `fetch` is
 * stubbed with answers shaped like Open-Meteo's own, which were read off the live API on
 * 2026-09-23 (a list of places answers a list; each place carries `timezone` and a `daily` block).
 */

const DATES = ["2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29"];

/** One place's answer, as Open-Meteo gives it. */
function place(overrides: Record<string, unknown[]> = {}) {
  return {
    latitude: 30.27,
    longitude: -97.75,
    timezone: "America/Chicago",
    daily: {
      time: DATES,
      weather_code: [3, 61, 95, 0, 1, 2, 80],
      temperature_2m_max: [96.8, 88.2, 79.6, 91, 93.4, 95.1, 90],
      temperature_2m_min: [77.4, 70.1, 64.9, 68, 70, 72.5, 71],
      precipitation_probability_max: [9, 70, 96, 0, 5, 12, 64],
      precipitation_sum: [0, 0.18, 0.912, 0, 0, 0.01, 0.12],
      wind_gusts_10m_max: [19, 22.4, 38.6, 12, 14, 16, 24],
      ...overrides
    }
  };
}

type Stub = { calls: URL[]; forecastCalls: () => URL[]; geocodeCalls: () => URL[] };

/**
 * `fetch`, answering the geocoder and the forecast the way Open-Meteo does. `forecast` gets the
 * number of places asked about, so a batch of three is answered with three.
 */
function stubWeather({
  geocode = () => ({ results: [{ name: "Austin", admin1: "Texas", latitude: 30.26715, longitude: -97.74306, feature_code: "PPLA" }] }),
  forecast = (count: number) => Response.json(count === 1 ? place() : Array.from({ length: count }, () => place()))
}: {
  geocode?: (url: URL) => unknown;
  forecast?: (count: number, url: URL) => Response | Promise<Response>;
} = {}): Stub {
  const calls: URL[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname.endsWith("/v1/search")) return Response.json(geocode(url));
    if (url.pathname.endsWith("/v1/forecast")) return forecast(url.searchParams.get("latitude")!.split(",").length, url);
    throw new Error(`unexpected request: ${url}`);
  });
  return {
    calls,
    forecastCalls: () => calls.filter((url) => url.pathname.endsWith("/v1/forecast")),
    geocodeCalls: () => calls.filter((url) => url.pathname.endsWith("/v1/search"))
  };
}

const project = (overrides: Partial<Project>): Project => ({
  id: "p-site",
  name: "Site",
  slug: "site",
  location: "Harbor District, Austin, TX",
  address: "2100 E 5th St, Austin, TX 78702",
  type: "Commercial",
  contractType: "Fixed Price",
  managerId: "u-matt",
  targetCompletion: "2026-12-01",
  percentComplete: 10,
  scheduleHealth: "On Track",
  status: "In Progress",
  image: "office-building",
  latitude: 30.2633,
  longitude: -97.7167,
  ...overrides
});

beforeEach(() => __resetWeatherCaches());
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.OPEN_METEO_API_KEY;
});

describe("where a job site is", () => {
  it("asks for the ZIP first, then the town and state, then the location as written", () => {
    expect(siteQueries({ address: "123 Riverfront Blvd, Austin, TX 78701", location: "Downtown, Austin, TX" })).toEqual([
      "78701",
      "Austin, TX",
      "Downtown, Austin, TX"
    ]);
    expect(siteQueries({ address: "", location: "Kyle, TX" })).toEqual(["Kyle, TX"]);
    // a spelled-out state is left to the geocoder, which reads "City, State" itself
    expect(siteQueries({ address: "", location: "Boston, Massachusetts" })).toEqual(["Boston, Massachusetts"]);
    expect(siteQueries({ address: "", location: "" })).toEqual([]);
  });

  it("never takes a house number for a ZIP", () => {
    expect(siteQueries({ address: "12345 Research Blvd, Round Rock, TX", location: "" })).toEqual(["Round Rock, TX"]);
  });

  it("trusts a stored point only when it is a real place and not the placeholder every new project gets", () => {
    expect(hasRealPoint({ latitude: 30.4011, longitude: -97.7479 })).toBe(true);
    expect(hasRealPoint(PLACEHOLDER_POINT)).toBe(false);
    expect(hasRealPoint({ latitude: 0, longitude: 0 })).toBe(false);
    expect(hasRealPoint({ latitude: Number.NaN, longitude: -97 })).toBe(false);
    expect(hasRealPoint({ latitude: 130, longitude: -97 })).toBe(false);
  });
});

describe("reading the forecast", () => {
  it("rounds to what a jobsite reads and drops a day without both temperatures", () => {
    const days = readDays({
      time: ["2026-09-23", "2026-09-24"],
      weather_code: [61, 3],
      temperature_2m_max: [88.6, null],
      temperature_2m_min: [70.2, 60],
      precipitation_probability_max: [104, 5],
      precipitation_sum: [0.4567, 0],
      wind_gusts_10m_max: [22.4, 10]
    });
    expect(days).toEqual([{ date: "2026-09-23", code: 61, highF: 89, lowF: 70, rainChance: 100, rainInches: 0.46, gustMph: 22 }]);
    expect(readDays(undefined)).toEqual([]);
  });

  it("forecasts the busiest sites first and leaves out finished projects", () => {
    const quiet = project({ id: "p-quiet", name: "Alpha" });
    const busy = project({ id: "p-busy", name: "Zulu" });
    const done = project({ id: "p-done", name: "Beta", status: "Complete" });
    const jobs = [{ id: "j", projectId: "p-busy", status: "Confirmed", startDate: "2026-09-25", endDate: "2026-09-26" } as Job];
    expect(activeSites([quiet, busy, done], jobs, "2026-09-23").map((site) => site.id)).toEqual(["p-busy", "p-quiet"]);
    const many = Array.from({ length: MAX_SITES + 5 }, (_, index) => project({ id: `p-${index}`, name: `Site ${index}` }));
    expect(activeSites(many, [], "2026-09-23")).toHaveLength(MAX_SITES);
  });

  it("reads every site in one request, finds the placeholder ones from their address, and remembers both", async () => {
    const stub = stubWeather();
    const sites = [
      project({ id: "p-riverside", ...PLACEHOLDER_POINT, address: "123 Riverfront Blvd, Austin, TX 78701" }),
      project({ id: "p-pinecrest", latitude: 30.4011, longitude: -97.7479, location: "North Austin, TX" })
    ];
    const now = Date.parse("2026-09-23T13:00:00Z");
    const first = await forecastForSites(sites, now);

    expect(first.source).toBe("open-meteo");
    expect(first.unplaced).toEqual([]);
    expect(first.sites.map((site) => [site.projectId, site.place])).toEqual([
      ["p-riverside", "Austin, Texas"],
      ["p-pinecrest", "North Austin, TX"]
    ]);
    expect(first.sites[0]).toMatchObject({ timezone: "America/Chicago", fetchedAt: "2026-09-23T13:00:00.000Z" });
    expect(first.sites[0].days[2]).toEqual({
      date: "2026-09-25",
      code: 95,
      highF: 80,
      lowF: 65,
      rainChance: 96,
      rainInches: 0.91,
      gustMph: 39
    });
    expect(first.sites[0].days).toHaveLength(7);

    // the placeholder site was looked up by its ZIP, in the US; the other was never looked up
    expect(stub.geocodeCalls().map((url) => [url.searchParams.get("name"), url.searchParams.get("countryCode")])).toEqual([
      ["78701", "US"]
    ]);
    const [read] = stub.forecastCalls();
    expect(stub.forecastCalls()).toHaveLength(1);
    expect(read.searchParams.get("latitude")).toBe("30.27,30.40");
    expect(read.searchParams.get("temperature_unit")).toBe("fahrenheit");
    expect(read.searchParams.get("forecast_days")).toBe("7");

    // inside half an hour nothing is asked again
    await forecastForSites(sites, now + 29 * 60_000);
    expect(stub.calls).toHaveLength(2);
    // past it, the forecast is re-read and the point is not
    await forecastForSites(sites, now + 31 * 60_000);
    expect(stub.forecastCalls()).toHaveLength(2);
    expect(stub.geocodeCalls()).toHaveLength(1);
  });

  it("reports a site it cannot find as unplaced instead of forecasting it somewhere else", async () => {
    stubWeather({
      geocode: () => ({ results: [{ name: "North Austin Optimist Field", latitude: 30.3, longitude: -97.7, feature_code: "PRK" }] })
    });
    const lost = project({ id: "p-lost", ...PLACEHOLDER_POINT, address: "", location: "North Austin, TX" });
    const known = project({ id: "p-known" });
    const answer = await forecastForSites([lost, known], Date.parse("2026-09-23T13:00:00Z"));
    // a ball field is a place, not a town
    expect(answer.unplaced).toEqual(["p-lost"]);
    expect(answer.sites.map((site) => site.projectId)).toEqual(["p-known"]);
  });

  it("serves a forecast up to six hours old while the service is down, and says it is unavailable after that", async () => {
    const now = Date.parse("2026-09-23T13:00:00Z");
    const sites = [project({})];
    stubWeather();
    await forecastForSites(sites, now);
    vi.restoreAllMocks();

    stubWeather({ forecast: () => new Response("upstream down", { status: 503 }) });
    const stale = await forecastForSites(sites, now + 2 * 60 * 60_000);
    expect(stale.sites[0].fetchedAt).toBe("2026-09-23T13:00:00.000Z");
    await expect(forecastForSites(sites, now + 7 * 60 * 60_000)).rejects.toBeInstanceOf(WeatherUnavailableError);
  });

  it("does not take a 200 that is not a forecast for a week of clear skies", async () => {
    stubWeather({ forecast: () => Response.json({ reason: "a proxy page", daily: { time: [] } }) });
    await expect(forecastForSites([project({})])).rejects.toBeInstanceOf(WeatherUnavailableError);
  });

  it("treats an unreachable geocoder as unavailable, not as an address that does not exist", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    const placeholder = project({ id: "p-new", ...PLACEHOLDER_POINT });
    await expect(forecastForSites([placeholder])).rejects.toBeInstanceOf(WeatherUnavailableError);
  });

  it("sends a commercial key to the customer hosts when one is set", async () => {
    expect(forecastUrl()).toBe("https://api.open-meteo.com/v1/forecast");
    process.env.OPEN_METEO_API_KEY = "test-key";
    expect(forecastUrl()).toBe("https://customer-api.open-meteo.com/v1/forecast");
    expect(geocodeUrl()).toBe("https://customer-geocoding-api.open-meteo.com/v1/search");
    const stub = stubWeather();
    await forecastForSites([project({ ...PLACEHOLDER_POINT })]);
    expect(stub.calls.map((url) => [url.host, url.searchParams.get("apikey")])).toEqual([
      ["customer-geocoding-api.open-meteo.com", "test-key"],
      ["customer-api.open-meteo.com", "test-key"]
    ]);
  });
});

describe("GET /api/weather/forecast", () => {
  async function signedUp() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-weather-"));
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
    return { app, owner };
  }

  it("forecasts the caller's own job sites, behind the session", async () => {
    const { app, owner } = await signedUp();
    stubWeather();
    await request(app).get("/api/weather/forecast").expect(401);

    const answer = (await owner.get("/api/weather/forecast").expect(200)).body;
    const projects = (await owner.get("/api/bootstrap").expect(200)).body.projects as Project[];
    // the asphalt starter workspace's three sites, each with a week
    expect(answer.sites.map((site: { projectId: string }) => site.projectId).sort()).toEqual(projects.map((p) => p.id).sort());
    expect(answer.sites.every((site: { days: unknown[] }) => site.days.length === 7)).toBe(true);
    expect(answer.unplaced).toEqual([]);
  });

  it("answers 502 when the forecast cannot be had, so the panel can say so", async () => {
    const { owner } = await signedUp();
    stubWeather({ forecast: () => new Response("down", { status: 500 }) });
    const answer = await owner.get("/api/weather/forecast").expect(502);
    expect(answer.body.error).toBe("The forecast service could not be reached.");
  });
});
