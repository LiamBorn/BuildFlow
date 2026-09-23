/**
 * The Dashboard's WeatherIQ section (weather/WeatherIQPanel.tsx): a job site's week, the scheduled
 * jobs its weather reaches, and what it says when the forecast cannot be had. The thresholds are
 * tested in weather/weatherIQ.test.ts and the forecast route in server/test/weather.test.ts; this
 * is the part a person sees.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BootstrapPayload, Job, WeatherForecastDay, WeatherForecastPayload } from "@buildflow/shared";
import { WeatherIQPanel } from "../weather/WeatherIQPanel";
import { bootstrapFixture } from "../test/fixture";

/** The date the client tests' clock is pinned to (test/setup.ts). */
const TODAY = "2026-06-16";
const DATES = ["2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19", "2026-06-20", "2026-06-21", "2026-06-22"];

const week = (changes: Record<string, Partial<WeatherForecastDay>> = {}): WeatherForecastDay[] =>
  DATES.map((date) => ({ date, code: 1, highF: 88, lowF: 70, rainChance: 10, rainInches: 0, gustMph: 12, ...changes[date] }));

const forecast = (sites: Array<{ projectId: string; days: WeatherForecastDay[] }>, unplaced: string[] = []): WeatherForecastPayload => ({
  source: "open-meteo",
  sites: sites.map((site) => ({
    place: site.projectId === "p-harbor" ? "Houston, Texas" : "Austin, Texas",
    timezone: "America/Chicago",
    fetchedAt: "2026-06-16T13:05:00.000Z",
    ...site
  })),
  unplaced
});

/** The fixture's one site plus a second one with a framing job today. */
const twoSites: BootstrapPayload = {
  ...bootstrapFixture,
  projects: [
    ...bootstrapFixture.projects,
    { ...bootstrapFixture.projects[0], id: "p-harbor", name: "Harborview Apartments", slug: "harborview" }
  ],
  jobs: [
    ...bootstrapFixture.jobs,
    {
      ...bootstrapFixture.jobs[0],
      id: "j-harbor-frame",
      projectId: "p-harbor",
      phase: "Framing - Level 2",
      startDate: TODAY,
      endDate: TODAY
    } as Job
  ]
};

/** Answers the one call the section makes, and nothing else. */
function forecastApi(answer: { status: number; body: unknown } | Promise<never>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    if (!String(input).includes("/api/weather/forecast")) return new Response("{}", { status: 404 });
    const settled = await answer;
    return new Response(JSON.stringify(settled.body), { status: settled.status });
  });
}

const show = (data: BootstrapPayload) =>
  render(
    <div className="dash-rx">
      <WeatherIQPanel data={data} today={TODAY} />
    </div>
  );

const rows = () => Array.from(document.querySelectorAll<HTMLElement>(".wiq-risk"));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the WeatherIQ section", () => {
  it("opens on the job site with the soonest trouble and names every job the week's weather reaches", async () => {
    vi.stubGlobal(
      "fetch",
      forecastApi({
        status: 200,
        body: forecast([
          { projectId: "p-riverside", days: week({ "2026-06-17": { code: 63, rainChance: 90, rainInches: 0.4 } }) },
          { projectId: "p-harbor", days: week({ "2026-06-16": { gustMph: 30 } }) }
        ])
      })
    );
    show(twoSites);

    // the framing job meets the gusts TODAY, which is sooner than tomorrow's rain at Riverside
    const site = await screen.findByRole("combobox", { name: "Job site" });
    expect(site).toHaveValue("p-harbor");
    expect(screen.getByText("Houston, Texas")).toBeInTheDocument();
    const days = within(screen.getByRole("list", { name: "The week at Harborview Apartments" })).getAllByRole("listitem");
    expect(days).toHaveLength(7);
    expect(days[0]).toHaveClass("is-watch");
    expect(days[0].textContent).toContain(
      "Today: mostly clear, high 88°F, low 70°F, 10% chance of rain, gusts to 30 mph. Watch: gusts to 30 mph."
    );
    // a windy tile says the gusts, a calm one the chance of rain
    expect(days[0].querySelector(".wiq-day-metric")?.textContent).toBe("30 mph");
    expect(days[1].querySelector(".wiq-day-metric")?.textContent).toBe("10%");

    expect(document.querySelector(".wiq-headline")?.textContent).toBe("3 jobs at weather risk this week");
    expect(
      rows().map((row) => [
        row.querySelector("strong")?.textContent,
        row.querySelector("em")?.textContent,
        row.querySelector(".badge")?.textContent
      ])
    ).toEqual([
      ["Framing - Level 2", "Today · gusts to 30 mph · Harborview Apartments", "Watch"],
      ["Concrete - Level 3 Slab", "Tomorrow · 90% chance of rain, 0.40 in · Riverside Office Building", "Hold"],
      ["Interior Finishes", "Tomorrow · 90% chance of rain, 0.40 in · Riverside Office Building", "Hold"]
    ]);
    // the Dashboard's own pills: a hold in the High pair, a watch in the Medium one
    expect(rows()[0].querySelector(".badge")).toHaveClass("medium");
    expect(rows()[1].querySelector(".badge")).toHaveClass("high");

    // Open-Meteo's data is CC BY 4.0: it is credited, with when it was read
    const credit = screen.getByRole("link", { name: "Open-Meteo" });
    expect(credit).toHaveAttribute("href", "https://open-meteo.com/");
    expect(credit.closest(".wiq-foot")?.textContent).toMatch(/^Forecast by Open-Meteo · updated \d{1,2}:\d{2}\s[AP]M$/);
  });

  it("shows another site's week when it is picked", async () => {
    vi.stubGlobal(
      "fetch",
      forecastApi({
        status: 200,
        body: forecast([
          { projectId: "p-riverside", days: week({ "2026-06-17": { rainChance: 90 } }) },
          { projectId: "p-harbor", days: week() }
        ])
      })
    );
    show(twoSites);

    const site = await screen.findByRole("combobox", { name: "Job site" });
    expect(site).toHaveValue("p-riverside");
    fireEvent.change(site, { target: { value: "p-harbor" } });
    expect(await screen.findByRole("list", { name: "The week at Harborview Apartments" })).toBeInTheDocument();
    expect(document.querySelectorAll(".wiq-day.is-hold")).toHaveLength(0);
    // the read still covers every site, whichever one is on show
    expect(document.querySelector(".wiq-headline")?.textContent).toBe("2 jobs at weather risk this week");
  });

  it("says the week is clear when no scheduled job meets bad weather", async () => {
    vi.stubGlobal("fetch", forecastApi({ status: 200, body: forecast([{ projectId: "p-riverside", days: week() }]) }));
    show(bootstrapFixture);

    expect(await screen.findByText("Clear to work this week")).toBeInTheDocument();
    // one site is named, not offered as a choice of one
    expect(screen.queryByRole("combobox", { name: "Job site" })).toBeNull();
    expect(document.querySelector(".wiq-site.is-single")?.textContent).toBe("Riverside Office Building");
  });

  it("names a site it could not find rather than forecasting it somewhere else", async () => {
    vi.stubGlobal("fetch", forecastApi({ status: 200, body: forecast([{ projectId: "p-riverside", days: week() }], ["p-harbor"]) }));
    show(twoSites);

    expect(
      await screen.findByText("No forecast for Harborview Apartments: add a ZIP code to its address so it can be found.")
    ).toBeInTheDocument();
  });

  it("says so when the forecast cannot be reached, and reads the saved weather alerts instead", async () => {
    vi.stubGlobal("fetch", forecastApi({ status: 502, body: { error: "The forecast service could not be reached." } }));
    // the fixture's saved alert is heavy rain at Riverside on the 18th; the slab now runs through it
    const throughThe18th: BootstrapPayload = {
      ...bootstrapFixture,
      jobs: bootstrapFixture.jobs.map((item) => (item.id === "j-riverside-concrete" ? { ...item, endDate: "2026-06-18" } : item))
    };
    show(throughThe18th);

    expect(
      await screen.findByText("The forecast service could not be reached, so this reads your saved weather alerts instead.")
    ).toHaveAttribute("role", "status");
    expect(screen.queryByRole("combobox", { name: "Job site" })).toBeNull();
    expect(document.querySelector(".wiq-headline")?.textContent).toBe("1 job at weather risk this week");
    expect(rows()[0].querySelector("em")?.textContent).toBe("Thursday · Heavy rain expected · Riverside Office Building");
  });

  it("takes a reply of another shape for no forecast, not for a week of clear skies", async () => {
    // what every test's blanket fetch mock returns — and what a proxy's error page would be
    vi.stubGlobal("fetch", forecastApi({ status: 200, body: bootstrapFixture }));
    show(bootstrapFixture);

    expect(await screen.findByText(/could not be reached/)).toBeInTheDocument();
    expect(screen.queryByText("Clear to work this week")).toBeNull();
    // the saved alert falls the day after the slab ends, so there is nothing to flag
    expect(screen.getByText("No weather alerts on scheduled work")).toBeInTheDocument();
  });

  it("says it is reading while the forecast is on its way", async () => {
    vi.stubGlobal("fetch", forecastApi(new Promise<never>(() => undefined)));
    show(bootstrapFixture);
    expect(screen.getByRole("status")).toHaveTextContent("Reading the forecast for your job sites…");
    await waitFor(() => expect(document.querySelector(".wiq")).toHaveAttribute("aria-busy", "true"));
  });
});
