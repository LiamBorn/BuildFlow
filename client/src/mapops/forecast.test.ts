/**
 * ForecastIQ's read of the weather.
 *
 * What is recorded here: the thresholds a block is scored on; that a job is at risk only at ITS
 * site and only on the days it runs; that the headline counts jobs, not blocks; that a site's
 * hours fold into six-hour blocks the way a superintendent would add them up; and that the
 * workspace's own alerts become the same shape when the forecast cannot be reached.
 */
import { describe, expect, it, vi } from "vitest";
import type { Job, Project, WeatherAlert } from "@buildflow/shared";
import { blockStarts, blocksFromHourly, columnLabel, fetchSiteForecasts, forecastsFromAlerts, readForecast, scoreBlock, type ForecastBlock } from "./forecast";

const NOW = new Date(2026, 8, 22, 9, 30); // Tue 22 Sep 2026, 09:30 local

const project = (id: string, name: string): Project => ({
  id,
  name,
  slug: id,
  location: "Austin, TX",
  address: `${name}, Austin, TX`,
  type: "Commercial",
  contractType: "GMP",
  managerId: "u-matt",
  targetCompletion: "2026-12-01",
  percentComplete: 20,
  scheduleHealth: "On Track",
  status: "In Progress",
  image: "office-building",
  latitude: 30.2672,
  longitude: -97.7431
});
const job = (id: string, projectId: string, startDate: string, endDate = startDate, status: Job["status"] = "Confirmed"): Job => ({
  id,
  projectId,
  name: id,
  phase: "Pour",
  location: "Austin",
  startDate,
  endDate,
  startTime: "7:00 AM",
  endTime: "3:30 PM",
  requiredLabor: 4,
  requiredEquipment: "Pump",
  materialsStatus: "Delivered",
  status,
  priority: "Normal",
  notes: "",
  percentComplete: 0
});
const block = (at: Date, over: Partial<ForecastBlock> = {}): ForecastBlock => ({ at, rainInches: 0, rainChance: 10, gustMph: 8, highF: 80, lowF: 62, ...over });

const riverside = project("p-riverside", "Riverside Office Building");
const pinecrest = project("p-pinecrest", "Pinecrest Medical Center");

describe("scoring a six-hour block", () => {
  it("is clear on an ordinary day, and a watch or a hold on the stated thresholds", () => {
    expect(scoreBlock(block(NOW))).toEqual({ risk: "clear", cause: null });
    expect(scoreBlock(block(NOW, { rainInches: 0.12 }))).toEqual({ risk: "watch", cause: "rain" });
    expect(scoreBlock(block(NOW, { rainInches: 0.3 }))).toEqual({ risk: "hold", cause: "rain" });
    expect(scoreBlock(block(NOW, { rainChance: 90 }))).toEqual({ risk: "hold", cause: "rain" });
    expect(scoreBlock(block(NOW, { gustMph: 28 }))).toEqual({ risk: "watch", cause: "wind" });
    expect(scoreBlock(block(NOW, { gustMph: 40 }))).toEqual({ risk: "hold", cause: "wind" });
    expect(scoreBlock(block(NOW, { highF: 97 }))).toEqual({ risk: "watch", cause: "heat" });
    expect(scoreBlock(block(NOW, { lowF: 30 }))).toEqual({ risk: "watch", cause: "cold" });
    expect(scoreBlock(block(NOW, { lowF: 15 }))).toEqual({ risk: "hold", cause: "cold" });
  });

  it("reports the worst thing in the block, and a hold over any watch", () => {
    expect(scoreBlock(block(NOW, { rainInches: 0.12, gustMph: 40 }))).toEqual({ risk: "hold", cause: "wind" });
  });
});

describe("laying the schedule over the forecast", () => {
  const starts = blockStarts(NOW);

  it("starts its blocks at the top of this hour and runs two days", () => {
    expect(starts).toHaveLength(8);
    expect(starts[0]).toEqual(new Date(2026, 8, 22, 9, 0));
    expect(starts[7]).toEqual(new Date(2026, 8, 24, 3, 0));
  });

  it("puts a job at risk only at its own site, on the days it runs, and counts each job once", () => {
    // rain at Riverside tomorrow morning; Pinecrest stays dry
    const forecasts = [
      { projectId: "p-riverside", blocks: starts.map((at) => block(at, at.getDate() === 23 && at.getHours() < 12 ? { rainInches: 0.4 } : {})) },
      { projectId: "p-pinecrest", blocks: starts.map((at) => block(at)) }
    ];
    const read = readForecast(
      [riverside, pinecrest],
      forecasts,
      [
        job("j-pour", "p-riverside", "2026-09-23"), // in the rain
        job("j-pinecrest", "p-pinecrest", "2026-09-23"), // dry site
        job("j-later", "p-riverside", "2026-09-30"), // not tomorrow
        job("j-done", "p-riverside", "2026-09-23", "2026-09-23", "Complete") // finished
      ],
      NOW
    );
    expect(read.jobsAtRisk.map((item) => item.job.id)).toEqual(["j-pour"]);
    expect(read.jobsAtRisk[0]).toMatchObject({ risk: "hold", cause: "rain" });
    expect(read.counts).toEqual({ rain: 1, wind: 0, heat: 0, cold: 0 });
    // the matrix: one row per site, one cell per block, Riverside's early-Wednesday cells on hold
    expect(read.rows).toHaveLength(2);
    expect(read.rows[0].cells.map((cell) => cell.risk)).toEqual(["clear", "clear", "clear", "hold", "hold", "clear", "clear", "clear"]);
    expect(read.rows[1].cells.every((cell) => cell.risk === "clear")).toBe(true);
  });

  it("keeps the worse of two blocks for a job that runs through both", () => {
    const forecasts = [
      { projectId: "p-riverside", blocks: starts.map((at, index) => block(at, index === 1 ? { rainInches: 0.12 } : index === 2 ? { gustMph: 40 } : {})) }
    ];
    const read = readForecast([riverside], forecasts, [job("j-pour", "p-riverside", "2026-09-22", "2026-09-23")], NOW);
    expect(read.jobsAtRisk[0]).toMatchObject({ risk: "hold", cause: "wind" });
  });
});

describe("the two sources", () => {
  it("folds Open-Meteo's hours into blocks: rain adds up, gusts and chance take their worst, temperature its range", () => {
    const hourly = {
      time: Array.from({ length: 12 }, (_, hour) => `2026-09-22T${String(9 + hour).padStart(2, "0")}:00`),
      temperature_2m: [70, 72, 75, 78, 80, 82, 84, 85, 85, 84, 82, 80],
      precipitation: [0, 0, 0.05, 0.05, 0.02, 0, 0, 0.3, 0, 0, 0, 0],
      precipitation_probability: [10, 20, 55, 60, 40, 10, 10, 85, 30, 10, 5, 5],
      wind_gusts_10m: [8, 10, 22, 26, 18, 12, 14, 38, 20, 12, 10, 9]
    };
    const blocks = blocksFromHourly(hourly, NOW);
    expect(blocks[0]).toMatchObject({ rainInches: 0.12, rainChance: 60, gustMph: 26, highF: 82, lowF: 70 });
    expect(blocks[1]).toMatchObject({ rainInches: 0.3, rainChance: 85, gustMph: 38, highF: 85, lowF: 80 });
    // a block past the hours we have is quiet, not missing
    expect(blocks[2]).toMatchObject({ rainInches: 0, gustMph: 0 });
  });

  it("asks Open-Meteo for every site in one request, in the units the page shows", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return new Response(JSON.stringify([{ hourly: { time: [] } }, { hourly: { time: [] } }]), { status: 200 });
      })
    );
    try {
      const forecasts = await fetchSiteForecasts([riverside, pinecrest], NOW);
      expect(forecasts.map((forecast) => forecast.projectId)).toEqual(["p-riverside", "p-pinecrest"]);
      expect(calls).toHaveLength(1);
      const url = new URL(calls[0]);
      expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
      expect(url.searchParams.get("latitude")).toBe("30.2672,30.2672");
      expect(url.searchParams.get("temperature_unit")).toBe("fahrenheit");
      expect(url.searchParams.get("precipitation_unit")).toBe("inch");
      expect(url.searchParams.get("wind_speed_unit")).toBe("mph");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refuses a bad answer rather than reading a blank forecast as clear skies", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    try {
      await expect(fetchSiteForecasts([riverside], NOW)).rejects.toThrow(/503/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refuses a 200 that is not a forecast, which is what a stub or a captive page answers", async () => {
    // the test harness answers every unknown URL with a 200 and the bootstrap payload; read as a
    // forecast that would be clear skies everywhere, with the band claiming a live source
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ projects: [], jobs: [] }), { status: 200 })));
    try {
      await expect(fetchSiteForecasts([riverside, pinecrest], NOW)).rejects.toThrow(/without hourly data/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("turns the workspace's own alerts into a day of weather at the site they name", () => {
    const alerts: WeatherAlert[] = [
      { id: "wa-1", projectId: "p-riverside", title: "Heavy rain expected", details: "1.25-2.00 in with gusts to 30 mph.", severity: "High", startsAt: new Date(2026, 8, 23, 6, 0).toISOString() },
      { id: "wa-2", title: "Wind advisory", details: "Gusts to 40 mph across the county.", severity: "Medium", startsAt: new Date(2026, 8, 22, 12, 0).toISOString() }
    ];
    const forecasts = forecastsFromAlerts([riverside, pinecrest], alerts, NOW);
    const read = readForecast([riverside, pinecrest], forecasts, [job("j-a", "p-riverside", "2026-09-23"), job("j-b", "p-pinecrest", "2026-09-22")], NOW);
    // the county-wide wind reaches both sites from noon (the 9–3 block already overlaps it) through
    // tomorrow morning; the rain only Riverside, tomorrow
    expect(read.rows[1].cells.map((cell) => cell.cause)).toEqual(["wind", "wind", "wind", "wind", "wind", null, null, null]);
    expect(read.rows[0].cells.filter((cell) => cell.risk === "hold").map((cell) => cell.cause)).toContain("rain");
    expect(read.jobsAtRisk.map((item) => `${item.job.id}:${item.risk}:${item.cause}`)).toEqual(["j-b:watch:wind", "j-a:hold:rain"]);
  });
});

describe("column heads", () => {
  it("names the day only when it changes", () => {
    const [first, second, , , fifth] = blockStarts(NOW);
    expect(columnLabel(first, null)).toBe("Tue 9 AM");
    expect(columnLabel(second, first)).toBe("3 PM");
    expect(columnLabel(fifth, blockStarts(NOW)[3])).toBe("9 AM");
    expect(columnLabel(blockStarts(NOW)[3], blockStarts(NOW)[2])).toBe("Wed 3 AM");
  });
});
