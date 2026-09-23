/**
 * The Dashboard's WeatherIQ section (weather/WeatherIQPanel.tsx and its two drawers): a job site's
 * week, the job days its weather reaches, calling one off and rescheduling it, keeping one on, and
 * where a site's forecast is read. The rules are tested in weather/weatherIQ.test.ts and the server in
 * server/test/weather.test.ts + weather-conflicts.test.ts; this is the part a person sees and presses.
 */
import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BootstrapPayload,
  Job,
  ScheduleVariance,
  WeatherConflict,
  WeatherForecastDay,
  WeatherForecastPayload,
  WeatherReading,
  WeatherWindow
} from "@buildflow/shared";
import { WeatherIQPanel } from "../weather/WeatherIQPanel";
import { bootstrapFixture } from "../test/fixture";

/** The date the client tests' clock is pinned to (test/setup.ts). */
const TODAY = "2026-06-16";
const TOMORROW = "2026-06-17";
const DATES = ["2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19", "2026-06-20", "2026-06-21", "2026-06-22"];

const week = (): WeatherForecastDay[] =>
  DATES.map((date) => ({ date, code: 1, highF: 88, lowF: 70, rainChance: 10, rainInches: 0, gustMph: 12 }));

const storm = (date: string): WeatherWindow => ({
  cause: "lightning",
  severity: "hold",
  start: `${date}T13:00`,
  end: `${date}T15:00`,
  reason: "thunderstorms"
});

const conflict = (overrides: Partial<WeatherConflict> = {}): WeatherConflict => ({
  id: `wx-j-riverside-concrete-${TOMORROW}`,
  jobId: "j-riverside-concrete",
  projectId: "p-riverside",
  date: TOMORROW,
  cause: "lightning",
  severity: "hold",
  start: `${TOMORROW}T13:00`,
  end: `${TOMORROW}T15:00`,
  reason: "thunderstorms",
  assigneeId: "u-matt",
  status: "open",
  detectedAt: "2026-06-16T12:00:00.000Z",
  updatedAt: "2026-06-16T12:00:00.000Z",
  ...overrides
});

const forecast = (
  sites: Array<{ projectId: string; windows?: WeatherWindow[]; locatedBy?: "project" | "address" | "custom"; current?: WeatherReading }>,
  conflicts: WeatherConflict[] = [],
  unplaced: string[] = []
): WeatherForecastPayload => ({
  source: "open-meteo",
  sites: sites.map((site) => ({
    projectId: site.projectId,
    place: site.projectId === "p-harbor" ? "Houston, Texas" : "Austin, Texas",
    locatedBy: site.locatedBy ?? "address",
    timezone: "America/Chicago",
    fetchedAt: "2026-06-16T13:05:00.000Z",
    current: site.current ?? null,
    days: week(),
    windows: site.windows ?? []
  })),
  unplaced,
  conflicts
});

/** The fixture's one site plus a second with a framing job today. */
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

/** What the reschedule of the slab (a Monday–Wednesday job losing Wednesday) looks like as a variance. */
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
    ripple: [
      {
        jobId: "j-unassigned",
        jobName: "Downtown Retail Buildout",
        currentStart: "2026-06-16",
        currentEnd: "2026-06-17",
        proposedStart: "2026-06-17",
        proposedEnd: "2026-06-18",
        shiftDays: 1,
        critical: true
      }
    ],
    projectSlipDays: 1,
    criticalPath: true,
    totalFloatDays: 0
  }
});

/**
 * A pretend server: what the forecast route answers, and the variances — changed by the decisions
 * the section posts, the way the real one changes them.
 */
function server(initial: {
  forecast: WeatherForecastPayload | { status: number; body: unknown };
  /** What the server says checked the reschedule's dates (the forecast, unless it could not be read). */
  weatherCheck?: ScheduleVariance["proposal"]["weatherCheck"];
}) {
  const state = {
    forecast: initial.forecast,
    variances: [] as ScheduleVariance[],
    posts: [] as Array<{ url: string; method: string; body: unknown }>
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method !== "GET") state.posts.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const setConflict = (next: WeatherConflict) => {
      if ("status" in state.forecast) return;
      const now = state.forecast as WeatherForecastPayload;
      state.forecast = { ...now, conflicts: now.conflicts.map((item) => (item.id === next.id ? next : item)) };
    };
    if (url.includes("/api/weather/forecast")) {
      if ("status" in state.forecast) return new Response(JSON.stringify(state.forecast.body), { status: state.forecast.status });
      return new Response(JSON.stringify(state.forecast), { status: 200 });
    }
    if (/\/api\/weather\/conflicts\/[^/]+\/cancel$/.test(url) && method === "POST") {
      const raised = reschedule();
      const variance = initial.weatherCheck ? { ...raised, proposal: { ...raised.proposal, weatherCheck: initial.weatherCheck } } : raised;
      state.variances = [variance];
      const next = conflict({
        status: "cancelled",
        decidedAt: "2026-06-16T13:10:00.000Z",
        decidedBy: "u-matt",
        varianceId: variance.id,
        delayIQId: "delayIQ-1"
      });
      setConflict(next);
      return new Response(JSON.stringify({ conflict: next, delayIQ: { id: "delayIQ-1" }, variance, releasedAssignmentIds: ["as-1"] }), {
        status: 200
      });
    }
    if (/\/api\/weather\/conflicts\/[^/]+\/keep$/.test(url) && method === "POST") {
      const next = conflict({ status: "kept", decidedAt: "2026-06-16T13:10:00.000Z", decidedBy: "u-matt" });
      setConflict(next);
      return new Response(JSON.stringify(next), { status: 200 });
    }
    if (/\/api\/schedule\/variances\/var-weather-1\/accept$/.test(url)) {
      state.variances = [reschedule("accepted")];
      return new Response(JSON.stringify({ variance: state.variances[0], movedJobIds: ["j-riverside-concrete"] }), { status: 200 });
    }
    if (/\/api\/weather\/locations\//.test(url) && method === "PUT") {
      const query = JSON.parse(String(init?.body)).query as string;
      if (query === "Nowhereville")
        return new Response(JSON.stringify({ error: 'No town or ZIP code matched "Nowhereville".' }), { status: 404 });
      return new Response(JSON.stringify({ projectId: "p-riverside", query, place: "Round Rock, Texas" }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
  return { state, fetchMock };
}

/** The section with the Dashboard's data held the way the Dashboard holds it, so a reload re-renders. */
function Harness({ initial, reloadFrom }: { initial: BootstrapPayload; reloadFrom: () => Partial<BootstrapPayload> }) {
  const [data, setData] = useState(initial);
  return (
    <div className="dash-rx">
      <WeatherIQPanel data={data} today={TODAY} reload={async () => setData((current) => ({ ...current, ...reloadFrom() }))} />
    </div>
  );
}

const show = (data: BootstrapPayload, pretend: ReturnType<typeof server>) => {
  vi.stubGlobal("fetch", pretend.fetchMock);
  return render(<Harness initial={data} reloadFrom={() => ({ variances: pretend.state.variances })} />);
};

const rows = () => Array.from(document.querySelectorAll<HTMLElement>(".wiq-risk"));
const rowText = (row: HTMLElement) => [
  row.querySelector("strong")?.textContent,
  row.querySelector("em")?.textContent,
  row.querySelector(".badge")?.textContent
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the WeatherIQ section", () => {
  it("lists the job days the week's weather reaches, opens on the soonest decision, and tints each day by when it comes", async () => {
    const shower: WeatherWindow = {
      cause: "rain",
      severity: "watch",
      start: `${TOMORROW}T09:00`,
      end: `${TOMORROW}T11:00`,
      reason: "60% chance of rain"
    };
    const pretend = server({
      forecast: forecast(
        [
          { projectId: "p-riverside", windows: [storm(TOMORROW), shower] },
          { projectId: "p-harbor", windows: [storm(TODAY)] }
        ],
        [
          conflict({ severity: "watch", cause: "rain", start: shower.start, end: shower.end, reason: shower.reason }),
          conflict({
            id: `wx-j-harbor-frame-${TODAY}`,
            jobId: "j-harbor-frame",
            projectId: "p-harbor",
            date: TODAY,
            start: `${TODAY}T13:00`,
            end: `${TODAY}T15:00`
          })
        ]
      )
    });
    show(twoSites, pretend);

    // a hold today at Harborview is the soonest thing waiting on a decision
    const site = await screen.findByRole("combobox", { name: "Job site" });
    expect(site).toHaveValue("p-harbor");
    const days = within(screen.getByRole("list", { name: "The week at Harborview Apartments" })).getAllByRole("listitem");
    expect(days).toHaveLength(7);
    expect(days[0]).toHaveClass("is-hold");
    expect(days[0].textContent).toContain("Hold: thunderstorms, 1–3 PM.");
    // the tile's line says when the weather starts; a clear day's says its chance of rain
    expect(days[0].querySelector(".wiq-day-metric")?.textContent).toBe("1 PM");
    expect(days[1].querySelector(".wiq-day-metric")?.textContent).toBe("10%");

    expect(document.querySelector(".wiq-headline")?.textContent).toBe("2 job days at weather risk this week");
    expect(rows().map(rowText)).toEqual([
      ["Framing - Level 2", "Today 1–3 PM · Thunderstorms · Harborview Apartments", "Hold"],
      ["Concrete - Level 3 Slab", "Wed 9–11 AM · 60% chance of rain · Riverside Office Building", "Watch"]
    ]);
    // the Dashboard's own pills: a hold in the High pair, a watch in the Medium one
    expect(rows()[0].querySelector(".badge")).toHaveClass("high");
    expect(rows()[1].querySelector(".badge")).toHaveClass("medium");
    expect(rows()[0].tagName).toBe("BUTTON");

    const credit = screen.getByRole("link", { name: "Open-Meteo" });
    expect(credit).toHaveAttribute("href", "https://open-meteo.com/");
    expect(credit.closest(".wiq-foot")?.textContent).toMatch(/^Forecast by Open-Meteo · updated \d{1,2}:\d{2}\s[AP]M$/);
  });

  it("calls a job day off from its drawer, then reschedules the job — the person in charge acts on both suggestions", async () => {
    const pretend = server({ forecast: forecast([{ projectId: "p-riverside", windows: [storm(TOMORROW)] }], [conflict()]) });
    show(bootstrapFixture, pretend);

    fireEvent.click(await screen.findByRole("button", { name: /Concrete - Level 3 Slab/ }));
    const drawer = screen.getByRole("dialog", { name: "Lightning Wed 1–3 PM" });
    const fact = (term: string) => within(drawer).getByText(term).closest("div")?.querySelector("dd")?.textContent;
    expect(fact("When")).toBe("Tomorrow, Wed, Jun 17 · 1–3 PM");
    expect(fact("Where")).toBe("Riverside Office Building · Austin, Texas");
    expect(fact("Job hours")).toBe("7:00 AM–3:30 PM");
    expect(fact("In charge")).toBe("You (Matt Johnson)");
    expect(within(drawer).getByRole("button", { name: "Keep it on" })).toBeEnabled();

    fireEvent.click(within(drawer).getByRole("button", { name: /Call off Wed/ }));
    await within(drawer).findByText("Suggested reschedule");
    expect(pretend.state.posts[0]).toMatchObject({ url: `/api/weather/conflicts/${conflict().id}/cancel`, method: "POST" });
    const proposal = drawer.querySelector(".wiq-proposal") as HTMLElement;
    expect(within(proposal).getByText("Mon, Jun 15 – Wed, Jun 17")).toBeInTheDocument();
    expect(within(proposal).getByText("Mon, Jun 15 – Thu, Jun 18")).toBeInTheDocument();
    expect(within(proposal).getByText("Also moves 1 later job:")).toBeInTheDocument();
    // the ripple names the work, not the project the job belongs to
    expect(within(proposal).getByText("Interior Finishes")).toBeInTheDocument();
    // dates the forecast checked carry no warning
    expect(proposal.querySelector(".wiq-proposal-line.is-warn")).toBeNull();
    expect(within(proposal).getByText(/^The project's finish moves 1 working day\. Its target completion is /)).toBeInTheDocument();
    // and the section's row now waits on the reschedule
    await waitFor(() => expect(rowText(rows()[0])[2]).toBe("Reschedule?"));

    fireEvent.click(within(drawer).getByRole("button", { name: /Reschedule/ }));
    await within(drawer).findByText("Rescheduled to Mon, Jun 15 – Thu, Jun 18, with 1 later job moved to follow.");
    expect(pretend.state.posts[1]).toMatchObject({ url: "/api/schedule/variances/var-weather-1/accept", body: { userId: "u-matt" } });
    expect(rowText(rows()[0])[2]).toBe("Rescheduled");
  });

  it("says so when the forecast could not check the reschedule's dates, and still offers it", async () => {
    const pretend = server({
      forecast: forecast([{ projectId: "p-riverside", windows: [storm(TOMORROW)] }], [conflict()]),
      weatherCheck: "unavailable"
    });
    show(bootstrapFixture, pretend);
    fireEvent.click(await screen.findByRole("button", { name: /Concrete - Level 3 Slab/ }));
    const drawer = screen.getByRole("dialog", { name: "Lightning Wed 1–3 PM" });
    fireEvent.click(within(drawer).getByRole("button", { name: /Call off Wed/ }));
    await within(drawer).findByText("Suggested reschedule");
    expect(drawer.querySelector(".wiq-proposal-line.is-warn")?.textContent).toBe(
      "The forecast could not be read when this day was called off, so these dates follow the working calendar only. Check the weather before you reschedule."
    );
    // the caveat informs the choice; it does not take it away
    expect(within(drawer).getByRole("button", { name: /Reschedule/ })).toBeEnabled();
  });

  it("keeps a day on when the person in charge says so, and stops asking", async () => {
    const pretend = server({ forecast: forecast([{ projectId: "p-riverside", windows: [storm(TOMORROW)] }], [conflict()]) });
    show(bootstrapFixture, pretend);

    fireEvent.click(await screen.findByRole("button", { name: /Concrete - Level 3 Slab/ }));
    const drawer = screen.getByRole("dialog", { name: "Lightning Wed 1–3 PM" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Keep it on" }));
    await within(drawer).findByText("Kept on on Tue, Jun 16 by you. WeatherIQ will not ask about this day again.");
    expect(pretend.state.posts[0].url).toBe(`/api/weather/conflicts/${conflict().id}/keep`);
    expect(document.querySelector(".wiq-headline")?.textContent).toBe("Nothing waiting on a decision this week");
    expect(rowText(rows()[0])[2]).toBe("Kept on");
  });

  it("shows a Member the suggestion, says who can act on it, and offers no controls", async () => {
    const pretend = server({ forecast: forecast([{ projectId: "p-riverside", windows: [storm(TOMORROW)] }], [conflict()]) });
    const carlos = bootstrapFixture.users.find((user) => user.id === "u-carlos")!;
    show({ ...bootstrapFixture, activeUser: carlos }, pretend);

    fireEvent.click(await screen.findByRole("button", { name: /Concrete - Level 3 Slab/ }));
    const drawer = screen.getByRole("dialog", { name: "Lightning Wed 1–3 PM" });
    expect(
      within(drawer).getByText("Only the Workspace Owner or an Admin can decide this; Matt Johnson is in charge of the job.")
    ).toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: /Call off/ })).toBeNull();
    expect(within(drawer).queryByRole("button", { name: "Keep it on" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Change the forecast location/ })).toBeNull();
  });

  it("lets the Owner set where a site's forecast is read, and says when nothing matches", async () => {
    const pretend = server({ forecast: forecast([{ projectId: "p-riverside" }]) });
    show(bootstrapFixture, pretend);

    fireEvent.click(await screen.findByRole("button", { name: "Change the forecast location for Riverside Office Building" }));
    const drawer = screen.getByRole("dialog", { name: "Forecast location" });
    expect(within(drawer).getByText("Austin, Texas")).toBeInTheDocument();
    expect(within(drawer).getByText("Found from the project's address")).toBeInTheDocument();
    const field = within(drawer).getByLabelText("Address, ZIP code or town");

    fireEvent.change(field, { target: { value: "Nowhereville" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save location" }));
    expect(await within(drawer).findByRole("alert")).toHaveTextContent('No town or ZIP code matched "Nowhereville".');

    fireEvent.change(field, { target: { value: "Round Rock, TX" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save location" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Forecast location" })).toBeNull());
    expect(pretend.state.posts.at(-1)).toMatchObject({
      url: "/api/weather/locations/p-riverside",
      method: "PUT",
      body: { query: "Round Rock, TX" }
    });
  });

  it("names a site it could not find, and offers the Owner a way to set it", async () => {
    show(twoSites, server({ forecast: forecast([{ projectId: "p-riverside" }], [], ["p-harbor"]) }));
    expect(
      await screen.findByText("No forecast for Harborview Apartments: set where the site is, or add a ZIP code to its address.")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Set Harborview Apartments/ }));
    expect(screen.getByRole("dialog", { name: "Forecast location" })).toHaveTextContent("Not found yet");
  });

  it("leads with the weather at the site now, when it was read and where, and names every day's sky", async () => {
    // the reading's time is built from the local clock, so it reads 8:15 AM wherever the tests run
    const current = { at: new Date(2026, 5, 16, 8, 15).toISOString(), tempF: 84, code: 2 };
    show(bootstrapFixture, server({ forecast: forecast([{ projectId: "p-riverside", current }]) }));
    const now = await waitFor(() => {
      const found = document.querySelector<HTMLElement>(".wiq-now");
      expect(found).not.toBeNull();
      return found!;
    });
    expect(now.querySelector(".wiq-now-temp")?.textContent).toBe("84°");
    expect(now.querySelector(".wiq-now-sky")?.textContent).toBe("Partly cloudy");
    expect(now.querySelector(".wiq-now-when")?.textContent).toBe("As of 8:15 AM · Austin, Texas");
    // one sentence for a screen reader; the pieces it is made of are hidden from it
    expect(now.querySelector(".wiq-sr")?.textContent).toBe("Now at Austin, Texas: 84°F, partly cloudy, as of 8:15 AM.");
    expect(now.querySelector(".wiq-now-read")).toHaveAttribute("aria-hidden", "true");
    // the place moved down to the reading, where the top row no longer cuts it short
    expect(document.querySelector(".wiq-top .wiq-where")).toBeNull();
    const days = within(screen.getByRole("list", { name: "The week at Riverside Office Building" })).getAllByRole("listitem");
    expect(days.map((day) => day.querySelector(".wiq-day-sky")?.textContent)).toEqual(Array(7).fill("Mostly clear"));
  });

  it("says the week is clear when no job's working hours meet bad weather", async () => {
    show(bootstrapFixture, server({ forecast: forecast([{ projectId: "p-riverside" }]) }));
    expect(await screen.findByText("Clear to work this week")).toBeInTheDocument();
    // with no reading from the provider there is nothing to lead with, and the place stays up top
    expect(document.querySelector(".wiq-now")).toBeNull();
    expect(document.querySelector(".wiq-top .wiq-where")?.textContent).toBe("Austin, Texas");
    // one site is named, not offered as a choice of one
    expect(screen.queryByRole("combobox", { name: "Job site" })).toBeNull();
    expect(document.querySelector(".wiq-site.is-single")?.textContent).toBe("Riverside Office Building");
  });

  it("says so when the forecast cannot be reached, and shows the job days from its last read", async () => {
    const pretend = server({ forecast: { status: 502, body: { error: "The forecast service could not be reached." } } });
    show({ ...bootstrapFixture, weatherConflicts: [conflict()] }, pretend);
    expect(
      await screen.findByText("The forecast service could not be reached, so these are the job days from its last read.")
    ).toHaveAttribute("role", "status");
    expect(rows().map(rowText)).toEqual([["Concrete - Level 3 Slab", "Wed 1–3 PM · Thunderstorms · Riverside Office Building", "Hold"]]);
  });

  it("reads the saved weather alerts when there is no last read either", async () => {
    const pretend = server({ forecast: { status: 502, body: { error: "The forecast service could not be reached." } } });
    // the fixture's saved alert is heavy rain at Riverside on the 18th; the slab now runs through it
    const throughThe18th: BootstrapPayload = {
      ...bootstrapFixture,
      jobs: bootstrapFixture.jobs.map((item) => (item.id === "j-riverside-concrete" ? { ...item, endDate: "2026-06-18" } : item))
    };
    show(throughThe18th, pretend);
    expect(
      await screen.findByText("The forecast service could not be reached, so this reads your saved weather alerts instead.")
    ).toBeInTheDocument();
    expect(document.querySelector(".wiq-headline")?.textContent).toBe("1 job at weather risk this week");
    expect(rowText(rows()[0])).toEqual(["Concrete - Level 3 Slab", "Thursday · Heavy rain expected · Riverside Office Building", "Watch"]);
    // an alert has no stored conflict behind it, so it is read, not opened
    expect(rows()[0].tagName).toBe("DIV");
  });

  it("takes a reply of another shape for no forecast, not for a week of clear skies", async () => {
    show(bootstrapFixture, server({ forecast: { status: 200, body: bootstrapFixture } }));
    expect(await screen.findByText(/could not be reached/)).toBeInTheDocument();
    expect(screen.queryByText("Clear to work this week")).toBeNull();
    expect(screen.getByText("No weather alerts on scheduled work")).toBeInTheDocument();
  });

  it("says it is reading while the forecast is on its way", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined))
    );
    render(
      <div className="dash-rx">
        <WeatherIQPanel data={bootstrapFixture} today={TODAY} />
      </div>
    );
    expect(screen.getByRole("status")).toHaveTextContent("Reading the forecast for your job sites…");
    expect(document.querySelector(".wiq")).toHaveAttribute("aria-busy", "true");
  });
});
