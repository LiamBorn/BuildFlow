/**
 * WeatherIQ in the schedule's job panel (weather/ScheduleWeather.tsx, 2026-09-23): the job's days as
 * the forecast has them, and the call-off WeatherIQ suggests — offered only where it suggests one.
 * The decisions are the Dashboard drawer's (tests/weather-iq.test.tsx); this is the panel a planner
 * has open on the Month, Kanban or Gantt page.
 */
import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BootstrapPayload, ScheduleVariance, WeatherConflict, WeatherForecastPayload, WeatherWindow } from "@buildflow/shared";
import { JobDrawer } from "../schedule/parts/JobDrawer";
import { JobWeather } from "../weather/ScheduleWeather";
import { __forgetForecast } from "../weather/useForecast";
import { bootstrapFixture } from "../test/fixture";

/** The client tests' pinned day (test/setup.ts), and the slab's last day. */
const TODAY = "2026-06-16";
const WEDNESDAY = "2026-06-17";
const DATES = ["2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19", "2026-06-20", "2026-06-21", "2026-06-22"];

const storm: WeatherWindow = {
  cause: "lightning",
  severity: "hold",
  start: `${WEDNESDAY}T13:00`,
  end: `${WEDNESDAY}T15:00`,
  reason: "thunderstorms"
};

const conflict = (overrides: Partial<WeatherConflict> = {}): WeatherConflict => ({
  id: `wx-j-riverside-concrete-${WEDNESDAY}`,
  jobId: "j-riverside-concrete",
  projectId: "p-riverside",
  date: WEDNESDAY,
  cause: "lightning",
  severity: "hold",
  start: storm.start,
  end: storm.end,
  reason: "thunderstorms",
  assigneeId: "u-matt",
  status: "open",
  detectedAt: "2026-06-16T12:00:00.000Z",
  updatedAt: "2026-06-16T12:00:00.000Z",
  ...overrides
});

const forecast = (windows: WeatherWindow[], conflicts: WeatherConflict[]): WeatherForecastPayload => ({
  source: "open-meteo",
  sites: [
    {
      projectId: "p-riverside",
      place: "Austin, Texas",
      locatedBy: "address",
      timezone: "America/Chicago",
      fetchedAt: "2026-06-16T13:05:00.000Z",
      current: null,
      days: DATES.map((date) => ({
        date,
        code: date === WEDNESDAY ? 95 : 1,
        highF: 88,
        lowF: 70,
        rainChance: 10,
        rainInches: 0,
        gustMph: 12
      })),
      windows
    }
  ],
  unplaced: [],
  conflicts
});

/** The slab losing Wednesday: it keeps its Monday start and finishes Thursday. */
const reschedule = (status: ScheduleVariance["status"] = "pending"): ScheduleVariance => ({
  id: "var-weather-1",
  projectId: "p-riverside",
  jobId: "j-riverside-concrete",
  fieldUpdateId: conflict().id,
  kind: "weather",
  severity: "Medium",
  status,
  reportedPercent: 40,
  plannedPercent: 40,
  varianceDays: 1,
  detectedAt: "2026-06-16T13:10:00.000Z",
  proposal: {
    currentStart: "2026-06-15",
    currentEnd: "2026-06-17",
    proposedStart: "2026-06-15",
    proposedEnd: "2026-06-18",
    ripple: [],
    projectSlipDays: 1,
    criticalPath: true,
    totalFloatDays: 0,
    weatherCheck: "forecast"
  }
});

/** A pretend server: the forecast route, and the call-off and reschedule the panel posts. */
function server(answer: WeatherForecastPayload | { status: number }) {
  const state = { forecast: answer, variances: [] as ScheduleVariance[], posts: [] as string[] };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method && init.method !== "GET") state.posts.push(url);
    if (url.includes("/api/weather/forecast")) {
      if ("status" in state.forecast) return new Response("{}", { status: state.forecast.status });
      return new Response(JSON.stringify(state.forecast), { status: 200 });
    }
    if (/\/api\/weather\/conflicts\/[^/]+\/cancel$/.test(url)) {
      const variance = reschedule();
      state.variances = [variance];
      const next = conflict({ status: "cancelled", decidedAt: "2026-06-16T13:10:00.000Z", decidedBy: "u-matt", varianceId: variance.id });
      if (!("status" in state.forecast)) state.forecast = { ...state.forecast, conflicts: [next] };
      return new Response(JSON.stringify({ conflict: next, delayIQ: { id: "d-1" }, variance, releasedAssignmentIds: [] }), { status: 200 });
    }
    if (/\/api\/schedule\/variances\/var-weather-1\/accept$/.test(url)) {
      state.variances = [reschedule("accepted")];
      return new Response(JSON.stringify({ variance: state.variances[0], movedJobIds: [] }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
  return { state, fetchMock };
}

/** The panel as a schedule page renders it, with the page's data held so a reload re-renders. */
function Panel({ initial, pretend }: { initial: BootstrapPayload; pretend: ReturnType<typeof server> }) {
  const [data, setData] = useState(initial);
  const job = data.jobs.find((item) => item.id === "j-riverside-concrete")!;
  return (
    <div className="app-shell">
      <JobDrawer
        job={job}
        projectName="Riverside Office Building"
        crews="Concrete Crew 1"
        onClose={() => undefined}
        onOpenSchedule={() => undefined}
        onSave={async () => undefined}
        weather={
          <JobWeather
            job={job}
            data={data}
            today={TODAY}
            reload={async () => setData((current) => ({ ...current, variances: pretend.state.variances }))}
          />
        }
      />
    </div>
  );
}

const show = (data: BootstrapPayload, pretend: ReturnType<typeof server>) => {
  vi.stubGlobal("fetch", pretend.fetchMock);
  render(<Panel initial={data} pretend={pretend} />);
  return screen.getByRole("region", { name: "WeatherIQ" });
};

afterEach(() => {
  vi.unstubAllGlobals();
  __forgetForecast();
});

describe("WeatherIQ in the job panel", () => {
  it("shows the job's days, and calls off the day WeatherIQ flagged, then reschedules the job", async () => {
    const pretend = server(forecast([storm], [conflict()]));
    const card = show(bootstrapFixture, pretend);

    // the slab runs Monday to Wednesday; the forecast starts today, so it has Tuesday and Wednesday
    const days = await within(card).findAllByRole("listitem");
    expect(days.map((day) => day.querySelector(".gantt-drawer-weather-name")?.textContent)).toEqual(["Today", "Wed"]);
    // tinted by the weather in the JOB's hours (7:00 AM–3:30 PM): the storm at 1 PM lands in them
    expect(days[1]).toHaveClass("is-hold");
    expect(days[1].querySelector(".gantt-drawer-weather-sky")?.textContent).toBe("Storms");
    expect(within(card).getByText("Austin, Texas")).toBeInTheDocument();

    // WeatherIQ's suggestion, addressed to the person in charge
    expect(within(card).getByText("Lightning · Wed 1–3 PM")).toBeInTheDocument();
    expect(
      within(card).getByText(/^Thunderstorms forecast inside the job.s hours\. WeatherIQ suggests calling tomorrow off/)
    ).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Call off Wed" }));

    await within(card).findByRole("button", { name: /Reschedule/ });
    expect(pretend.state.posts[0]).toBe(`/api/weather/conflicts/${conflict().id}/cancel`);
    expect(card.textContent).toContain("WeatherIQ suggests moving the job to Mon, Jun 15 – Thu, Jun 18");
    expect(card.textContent).toContain("the project's finish moves 1 working day.");

    fireEvent.click(within(card).getByRole("button", { name: /Reschedule/ }));
    await within(card).findByText("Rescheduled to Mon, Jun 15 – Thu, Jun 18.");
    expect(pretend.state.posts[1]).toBe("/api/schedule/variances/var-weather-1/accept");
  });

  it("offers no call-off where WeatherIQ suggests none, and says the job's hours are clear", async () => {
    const card = show(bootstrapFixture, server(forecast([], [])));
    expect(
      await within(card).findByText("Clear to work: no lightning, rain, wind, snow, heat, freeze or fog in the job's hours (7 AM–3:30 PM).")
    ).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /Call off/ })).toBeNull();
  });

  it("shows a Member the suggestion and who can act on it, and no controls", async () => {
    const member: BootstrapPayload = { ...bootstrapFixture, activeUser: { ...bootstrapFixture.activeUser, permission: "member" } };
    const card = show(member, server(forecast([storm], [conflict()])));
    expect(
      await within(card).findByText("Only the Workspace Owner or an Admin can decide this; Matt Johnson is in charge of the job.")
    ).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /Call off/ })).toBeNull();
    expect(within(card).queryByRole("button", { name: "Keep it on" })).toBeNull();
  });

  it("says so when the forecast cannot be reached, and still offers the day from its last read", async () => {
    const card = show({ ...bootstrapFixture, weatherConflicts: [conflict()] }, server({ status: 502 }));
    expect(
      await within(card).findByText("The forecast service could not be reached, so these are the days from its last read.")
    ).toBeInTheDocument();
    // calling a day off works while the forecast is down; the reschedule then says its dates were not checked
    await waitFor(() => expect(within(card).getByRole("button", { name: "Call off Wed" })).toBeEnabled());
  });
});
