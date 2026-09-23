/**
 * Schedule area tests — the landing (page "schedule") and the Month calendar
 * (page "month"), rewritten against the 2026-09-08 layout; the Week board's cases
 * moved onto the calendar when the Week, List and Matrix pages left the product
 * on 2026-09-22 (docs/backlog.md). The old board tests in App.test.tsx were
 * quarantined when the views moved to their own pages.
 *
 * What the current UI allows:
 * - the landing lists the unbooked queue with a "Book" per job and opens the
 *   views from its view cards; "View all alerts" opens the alerts dialog;
 * - the Month calendar is a day grid whose chips open the shared job drawer
 *   (NOT the project editor — `onOpenProject` is a no-op on the Month page);
 * - a day's "+" (or the empty part of the day) opens the picker, which POSTs
 *   /api/jobs then /api/schedule/assign.
 * dnd-kit drags need layout, so re-booking by drag is not asserted here.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { enterDashboard, installAppHarness, openSchedule, respondToBuildflowApi, state } from "../test/appHarness";
import { bootstrapFixture } from "../test/fixture";

/** The path of a fetched URL, whatever base api.ts prefixes it with. */
const pathOf = (input: RequestInfo | URL) => new URL(String(input), "http://buildflow.test").pathname;

type ScheduleView = "Month" | "Kanban" | "Gantt Chart";

/** Open a schedule view from the rail: hover the Schedule hub (React listens to
    mouseover), then pick the page from its flyout. The landing's view cards
    work too, but their accessible name runs title + blurb + figure together. */
async function openScheduleView(view: ScheduleView) {
  // the rail's hub: a schedule page also has its own "Schedule" button, back to the landing
  const hubs = await screen.findAllByRole("button", { name: /^Schedule( \(.*\))?$/ });
  const hub = hubs.find((button) => button.classList.contains("hs-rail-btn")) ?? hubs[0];
  fireEvent.mouseOver(hub);
  const flyout = await screen.findByRole("menu", { name: "Schedule menu" });
  fireEvent.click(within(flyout).getByRole("menuitem", { name: new RegExp(`^${view}( New| Beta)?$`) }));
  await screen.findByRole("heading", { level: 1, name: new RegExp(`^${view}`) });
}

async function openMonthCalendar() {
  await openScheduleView("Month");
  await screen.findByRole("region", { name: "Calendar for June 2026" });
}

/** A job's chip on the calendar: the button titled "name · phase". */
const chip = (title: string) => screen.getAllByTitle(title).find((element) => element.tagName === "BUTTON") as HTMLElement;
const RIVERSIDE = "Riverside Office Building · Concrete - Level 3 Slab";

describe("Schedule pages", () => {
  installAppHarness();

  it("opens Settings from the Month page account menu", async () => {
    render(<App />);
    await enterDashboard();
    await openMonthCalendar();

    // The topbar control is avatar-only; the name and role live in the menu it opens.
    fireEvent.click(screen.getByRole("button", { name: / account$/ }));
    const accountMenu = screen.getByRole("menu", { name: "Account menu" });
    // the menu names the signed-in workspace user (the fixture's Matt Johnson, or the owner)
    expect(within(accountMenu).getByText(/^(?:Matt Johnson|Liam Santos)$/)).toBeInTheDocument();
    expect(within(accountMenu).getByText("Workspace Owner")).toBeInTheDocument();
    const settingsItem = within(accountMenu).getByRole("menuitem", { name: "Settings" });
    expect(settingsItem).toHaveAttribute("title", "Settings");

    fireEvent.click(settingsItem);
    expect(await screen.findByLabelText("Settings categories")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Calendar for June 2026" })).not.toBeInTheDocument();
  });

  it("lists the unbooked queue on the Schedule landing and Book opens the Month calendar on the job's month", async () => {
    render(<App />);
    await enterDashboard();
    await openSchedule();

    const queue = screen.getByRole("region", { name: "Unassigned jobs" });
    expect(within(queue).getByText("Downtown Retail Buildout")).toBeInTheDocument();
    /* The note lives in the PANEL's header row, not inside the region: since the landing moved onto
       the panel board (2026-09-15) each section is rendered headless and the panel draws its title
       and note above it. Still asserted, and still asserted to be THIS panel's — a board of a dozen
       panels would otherwise let any one of them satisfy it. */
    const panel = queue.closest(".dash-block");
    expect(panel, "the queue sits in a board panel").not.toBeNull();
    expect(within(panel as HTMLElement).getByText("Book them from the Month calendar")).toBeInTheDocument();
    // the booked job is not waiting for a crew
    expect(within(queue).queryByText("Riverside Office Building")).not.toBeInTheDocument();

    fireEvent.click(within(queue).getByRole("button", { name: "Book" }));
    await screen.findByRole("heading", { level: 1, name: /^Month/ });
    // the job starts on 16 June, so the calendar opens on June with its chip on the day
    expect(screen.getAllByText("June 2026").length).toBeGreaterThan(0);
    expect(chip("Downtown Retail Buildout · Interior Finishes")).toBeInTheDocument();
  });

  it("makes the Month calendar controls interactive", async () => {
    render(<App />);
    await enterDashboard();
    await openMonthCalendar();

    // status filters live behind the shared "Statuses" button
    fireEvent.click(screen.getByRole("button", { name: /^Statuses/ }));
    const statusPanel = screen.getByRole("region", { name: "Job statuses" });
    const delayIQed = within(statusPanel).getByRole("button", { name: "DelayIQed" });
    expect(delayIQed).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(delayIQed);
    expect(delayIQed).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(delayIQed).toHaveAttribute("aria-pressed", "true");

    // month stepper, and "Today" brings it back
    const nav = screen.getByRole("button", { name: "Next month" }).parentElement as HTMLElement;
    expect(screen.getAllByText("June 2026").length).toBeGreaterThan(0);
    expect(within(nav).getByRole("button", { name: "Today" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getAllByText("July 2026").length).toBeGreaterThan(0);
    expect(within(nav).getByRole("button", { name: "Today" })).toBeEnabled();
    fireEvent.click(within(nav).getByRole("button", { name: "Today" }));
    expect(screen.getAllByText("June 2026").length).toBeGreaterThan(0);

    // export is a menu now, not a dialog
    fireEvent.click(screen.getByRole("button", { name: /^Export/ }));
    const exportMenu = screen.getByRole("menu", { name: "Export" });
    expect(within(exportMenu).getByRole("menuitem", { name: /Download CSV/ })).toBeInTheDocument();

    // and the landing is one click away (the rail hub is also named "Schedule", so go by the button's title)
    fireEvent.click(screen.getByTitle("Back to the Schedule overview"));
    await screen.findByRole("heading", { name: "The whole plan, at a glance." });
  });

  it("opens the alerts dialog and the Month view from the Schedule landing", async () => {
    render(<App />);
    await enterDashboard();
    await openSchedule();

    fireEvent.click(screen.getByRole("button", { name: "View all alerts" }));
    expect(screen.getByRole("dialog", { name: "Scheduling Alerts" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close Scheduling Alerts" }));
    expect(screen.queryByRole("dialog", { name: "Scheduling Alerts" })).not.toBeInTheDocument();

    // the view cards: title, blurb and a live figure in one button — three views since 2026-09-22
    const views = screen.getByRole("region", { name: "Schedule views" });
    expect(
      within(views)
        .getAllByRole("button")
        .map((card) => card.querySelector("strong")?.textContent)
    ).toEqual(["Month", "Gantt Chart", "Kanban"]);
    expect(within(views).getByRole("button", { name: /^Month .*2 jobs start in June 2026$/ })).toBeInTheDocument();
    fireEvent.click(within(views).getByRole("button", { name: /^Month / }));
    await screen.findByRole("heading", { level: 1, name: /^Month/ });
    expect(screen.getByRole("region", { name: "Calendar for June 2026" })).toBeInTheDocument();
    expect(chip(RIVERSIDE)).toBeInTheDocument();
  });

  /**
   * A DAY WEATHERIQ CALLED OFF (2026-09-23: "when a job is cancelled within any of the pages within the
   * Schedule category make it a little more noticeable"). Riverside's pour on the 16th — today, on the
   * test clock — was called off for rain; every page that shows the job says so, in the bad tone.
   */
  it("marks a day WeatherIQ called off on the landing, the Month, the job panel, the Kanban and the Gantt", async () => {
    state.bootstrapPayload = {
      ...bootstrapFixture,
      weatherConflicts: [
        {
          id: "wx-j-riverside-concrete-2026-06-16",
          jobId: "j-riverside-concrete",
          projectId: "p-riverside",
          date: "2026-06-16",
          cause: "rain",
          severity: "hold",
          start: "2026-06-16T07:00",
          end: "2026-06-16T15:00",
          reason: "Heavy rain through the pour",
          assigneeId: "",
          status: "cancelled",
          detectedAt: "2026-06-15T12:00:00.000Z",
          updatedAt: "2026-06-15T12:00:00.000Z"
        }
      ]
    };
    render(<App />);
    await enterDashboard();

    // the landing's alerts name it
    await openSchedule();
    expect(await screen.findByText("A job day was called off")).toBeInTheDocument();
    expect(screen.getByText(/Riverside Office Building on Jun 16 · rain/)).toBeInTheDocument();

    // the Month: the job's chip (on its first day) says which day was called off, and why — and is not
    // struck through, since two of its three days are still on
    await openMonthCalendar();
    const calledOff = screen.getByTitle(/Called off Tue, Jun 16 for rain\./);
    expect(calledOff).toHaveClass("sched-act", "is-called-off");
    expect(calledOff).not.toHaveClass("is-all-off");
    expect(calledOff).toHaveTextContent("Called off today · rain");

    // the job panel says it where the eye lands first
    fireEvent.click(calledOff);
    const drawer = screen.getByRole("dialog", { name: "Riverside Office Building" });
    expect(within(drawer).getAllByText("Called off today").length).toBeGreaterThan(0);
    fireEvent.click(within(drawer).getByRole("button", { name: "Close job details" }));

    // the Kanban card takes the tag and the red edge
    await openScheduleView("Kanban");
    const card = screen.getAllByTitle(RIVERSIDE).find((element) => element.classList.contains("sched-kan-card")) as HTMLElement;
    expect(card).toHaveClass("is-called-off");
    expect(within(card).getByText("Called off today")).toBeInTheDocument();

    // the Gantt hatches the day across the bar, and names it beside the bar
    await openScheduleView("Gantt Chart");
    await waitFor(() => expect(document.querySelector(".gantt-offday")).not.toBeNull());
    expect(document.querySelector(".gantt-calledoff")?.textContent).toContain("Called off today");
  });

  it("opens the job drawer from a job's chip on the Month calendar", async () => {
    render(<App />);
    await enterDashboard();
    await openMonthCalendar();

    fireEvent.click(chip(RIVERSIDE));

    const drawer = screen.getByRole("dialog", { name: "Riverside Office Building" });
    expect(within(drawer).getByText(/Concrete - Level 3 Slab/)).toBeInTheDocument();
    expect(within(drawer).getByText("Concrete Crew 1")).toBeInTheDocument();
    expect(within(drawer).getByLabelText("Status")).toHaveValue("Confirmed");
    expect(within(drawer).getByLabelText("Priority")).toHaveValue("High");
    // the panel's own lists: three statuses a person sets by hand, and the priorities by their on-screen names
    const optionsOf = (label: string) =>
      Array.from((within(drawer).getByLabelText(label) as HTMLSelectElement).options, (option) => option.textContent);
    expect(optionsOf("Status")).toEqual(["Planned", "Confirmed", "Complete"]);
    expect(optionsOf("Priority")).toEqual(["Mandatory", "Medium", "Low"]);
    expect((within(drawer).getByLabelText("Priority") as HTMLSelectElement).selectedOptions[0]).toHaveTextContent("Mandatory");
    expect(within(drawer).getByLabelText("Start")).toHaveValue("2026-06-15");
    expect(within(drawer).getByLabelText("Finish")).toHaveValue("2026-06-17");
    expect(within(drawer).getByLabelText("Notes")).toHaveValue("Slab pour.");

    fireEvent.click(within(drawer).getByRole("button", { name: "Close job details" }));
    expect(screen.queryByRole("dialog", { name: "Riverside Office Building" })).not.toBeInTheDocument();
  });

  it("saves a job from the Month calendar drawer with a PATCH", async () => {
    const updatedJob = { ...bootstrapFixture.jobs[0], status: "Complete" as const, notes: "Pump on site at 6." };
    let jobUpdated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      if (pathOf(input) === "/api/jobs/j-riverside-concrete") {
        jobUpdated = true;
        expect(options?.method).toBe("PATCH");
        expect(JSON.parse(String(options?.body))).toMatchObject({ status: "Complete", notes: "Pump on site at 6." });
        return new Response(JSON.stringify(updatedJob), { status: 200 });
      }
      if (pathOf(input) === "/api/bootstrap" && jobUpdated) {
        return new Response(JSON.stringify({ ...bootstrapFixture, jobs: [updatedJob, bootstrapFixture.jobs[1]] }), { status: 200 });
      }
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();
    await openMonthCalendar();

    fireEvent.click(chip(RIVERSIDE));
    const drawer = screen.getByRole("dialog", { name: "Riverside Office Building" });
    fireEvent.change(within(drawer).getByLabelText("Status"), { target: { value: "Complete" } });
    fireEvent.change(within(drawer).getByLabelText("Notes"), { target: { value: "Pump on site at 6." } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(jobUpdated).toBe(true));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Riverside Office Building" })).not.toBeInTheDocument());
    expect(await screen.findByText("Riverside Office Building saved")).toBeInTheDocument();
  });

  it("opens the add-job picker from a day's + and from the empty part of a day that already has work", async () => {
    render(<App />);
    await enterDashboard();
    await openMonthCalendar();

    // a day's "+": the picker opens on that day, on the first crew
    fireEvent.click(screen.getByRole("button", { name: "Add a job on Jun 16" }));
    let dialog = screen.getByRole("dialog", { name: "Add job to schedule" });
    expect(within(dialog).getByText("Concrete Crew 1 · Jun 16")).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Custom job" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Job Name")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Project")).toHaveValue("p-riverside");
    expect(within(dialog).getByLabelText("Crew")).toHaveValue("crew-concrete");
    expect(within(dialog).getByLabelText("Start Date")).toHaveValue("2026-06-16");
    expect(within(dialog).queryByText("Existing jobs")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close Add job to schedule" }));
    expect(screen.queryByRole("dialog", { name: "Add job to schedule" })).not.toBeInTheDocument();

    // a day with a chip on it still opens the form from its empty part
    expect(chip(RIVERSIDE)).toBeInTheDocument();
    fireEvent.click(document.querySelector('.sched-cal-cell[data-date="2026-06-15"]') as HTMLElement);
    dialog = screen.getByRole("dialog", { name: "Add job to schedule" });
    expect(within(dialog).getByText("Concrete Crew 1 · Jun 15")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Start Date")).toHaveValue("2026-06-15");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Add job to schedule" })).not.toBeInTheDocument();
  });

  it("creates and schedules a custom job from the Month calendar picker", async () => {
    const createdJob = {
      id: "job-custom-pour",
      projectId: "p-riverside",
      name: "Custom Concrete Pour",
      phase: "Concrete - Custom Pour",
      location: "Downtown, Austin, TX",
      startDate: "2026-06-16",
      endDate: "2026-06-16",
      startTime: "6:30 AM",
      endTime: "1:30 PM",
      requiredLabor: 7,
      requiredEquipment: "Line Pump",
      materialsStatus: "Ordered" as const,
      status: "Confirmed" as const,
      priority: "High" as const,
      notes: "Created from the Month calendar.",
      percentComplete: 0
    };
    const scheduledAssignment = {
      id: "as-custom",
      jobId: createdJob.id,
      crewId: "crew-concrete",
      date: "2026-06-16",
      status: "Confirmed" as const,
      conflicts: []
    };
    let scheduled = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const path = pathOf(input);
      if (path === "/api/jobs") {
        expect(options?.method).toBe("POST");
        expect(JSON.parse(String(options?.body))).toMatchObject({
          projectId: "p-riverside",
          name: "Custom Concrete Pour",
          phase: "Concrete - Custom Pour",
          startDate: "2026-06-16",
          endDate: "2026-06-16",
          startTime: "6:30 AM",
          endTime: "1:30 PM",
          requiredLabor: 7,
          requiredEquipment: "Line Pump",
          materialsStatus: "Ordered",
          status: "Confirmed",
          priority: "High",
          notes: "Created from the Month calendar."
        });
        return new Response(JSON.stringify(createdJob), { status: 201 });
      }
      if (path === "/api/schedule/assign") {
        scheduled = true;
        expect(options?.method).toBe("POST");
        expect(JSON.parse(String(options?.body))).toMatchObject({ jobId: createdJob.id, crewId: "crew-concrete", date: "2026-06-16" });
        return new Response(JSON.stringify(scheduledAssignment), { status: 201 });
      }
      if (path === "/api/bootstrap" && scheduled) {
        return new Response(
          JSON.stringify({
            ...state.bootstrapPayload,
            jobs: [...bootstrapFixture.jobs, createdJob],
            assignments: [...bootstrapFixture.assignments, scheduledAssignment]
          }),
          { status: 200 }
        );
      }
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();
    await openMonthCalendar();

    fireEvent.click(screen.getByRole("button", { name: "Add a job on Jun 16" }));
    const dialog = screen.getByRole("dialog", { name: "Add job to schedule" });
    const field = (label: string) => within(dialog).getByLabelText(label);
    fireEvent.change(field("Job Name"), { target: { value: "Custom Concrete Pour" } });
    fireEvent.change(field("Phase"), { target: { value: "Concrete - Custom Pour" } });
    fireEvent.change(field("Start Time"), { target: { value: "6:30 AM" } });
    fireEvent.change(field("End Time"), { target: { value: "1:30 PM" } });
    fireEvent.change(field("Labor"), { target: { value: "7" } });
    fireEvent.change(field("Equipment"), { target: { value: "Line Pump" } });
    fireEvent.change(field("Materials"), { target: { value: "Ordered" } });
    fireEvent.change(field("Status"), { target: { value: "Confirmed" } });
    fireEvent.change(field("Priority"), { target: { value: "High" } });
    fireEvent.change(field("Notes"), { target: { value: "Created from the Month calendar." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create & Schedule Job" }));

    await waitFor(() => expect(scheduled).toBe(true));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add job to schedule" })).not.toBeInTheDocument());
    expect(await screen.findByText("Custom Concrete Pour scheduled for Concrete Crew 1 on Jun 16")).toBeInTheDocument();
    // the new job's chip lands on the 16th
    await waitFor(() => expect(chip("Custom Concrete Pour · Concrete - Custom Pour")).toBeInTheDocument());
  });
});

describe("Signed-in links land", () => {
  installAppHarness();

  it("opens a schedule link on a fresh load when a session is live", async () => {
    // a fresh load: the hash is there before the app mounts, and no hashchange fires
    window.history.replaceState(null, "", "/#schedule/month?m=2026-07-01");
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: /^Month/ });
    expect(screen.getAllByText("July 2026").length).toBeGreaterThan(0);
  });

  it("lands a link to a page that has left the product on the Month, on that week's month", async () => {
    // the Week board's links are in sent emails and old bookmarks (it left on 2026-09-22 — docs/backlog.md)
    window.history.replaceState(null, "", "/#schedule/week?w=2026-06-22");
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: /^Month/ });
    expect(screen.getAllByText("June 2026").length).toBeGreaterThan(0);
  });

  it("keeps the landing, and the link, when nobody is signed in", async () => {
    // the first bootstrap has no session; the demo fallback signs in and the landing stays
    let demoSession = false;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (pathOf(input) === "/api/auth/demo") demoSession = true;
      if (pathOf(input) === "/api/bootstrap" && !demoSession) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
      }
      return respondToBuildflowApi(input);
    });
    window.history.replaceState(null, "", "/#schedule/month?m=2026-07-01");
    render(<App />);
    await screen.findByRole("button", { name: /^Login from welcome navigation$/ });
    expect(screen.queryByRole("heading", { level: 1, name: /^Month/ })).toBeNull();
    expect(window.location.hash).toBe("#schedule/month?m=2026-07-01");
  });
});
