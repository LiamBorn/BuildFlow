/**
 * Schedule area tests — the landing (page "schedule") and the Week board
 * (page "week"), rewritten against the 2026-09-08 layout. The old board tests
 * in App.test.tsx were quarantined when the six views moved to their own pages.
 *
 * What the current UI allows:
 * - the landing lists the unbooked queue with a "Book" per job and opens the
 *   views from its view cards; "View all alerts" opens the alerts dialog;
 * - the Week board is a crew × day grid whose cards open the shared job drawer
 *   (NOT the project editor — `onOpenProject` is a no-op on the Week page);
 * - "Add job" opens the picker, which POSTs /api/jobs then /api/schedule/assign.
 * dnd-kit drags need layout, so re-booking by drag is not asserted here.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { enterDashboard, installAppHarness, openSchedule, respondToBuildflowApi, state } from "../test/appHarness";
import { bootstrapFixture } from "../test/fixture";

/** The path of a fetched URL, whatever base api.ts prefixes it with. */
const pathOf = (input: RequestInfo | URL) => new URL(String(input), "http://buildflow.test").pathname;

type ScheduleView = "Month" | "Week" | "List" | "Kanban" | "Matrix" | "Gantt Chart";

/** Open a schedule view from the rail: hover the Schedule hub (React listens to
    mouseover), then pick the page from its flyout. The landing's view cards
    work too, but their accessible name runs title + blurb + figure together. */
async function openScheduleView(view: ScheduleView) {
  const hub = await screen.findByRole("button", { name: /^Schedule( \(.*\))?$/ });
  fireEvent.mouseOver(hub);
  const flyout = await screen.findByRole("menu", { name: "Schedule menu" });
  fireEvent.click(within(flyout).getByRole("menuitem", { name: new RegExp(`^${view}( New| Beta)?$`) }));
  await screen.findByRole("heading", { level: 1, name: new RegExp(`^${view}`) });
}

async function openWeekBoard() {
  await openScheduleView("Week");
  await screen.findByRole("region", { name: "Crew schedule for the week" });
}

describe("Schedule pages", () => {
  installAppHarness();

  it("opens Settings from the Week page account menu", async () => {
    render(<App />);
    await enterDashboard();
    await openWeekBoard();

    // The topbar control is avatar-only; the name and role live in the menu it opens.
    fireEvent.click(screen.getByRole("button", { name: / account$/ }));
    const accountMenu = screen.getByRole("menu", { name: "Account menu" });
    // the menu names the signed-in workspace user (the fixture's Matt Johnson, or the owner)
    expect(within(accountMenu).getByText(/^(?:Matt Johnson|Liam Santos)$/)).toBeInTheDocument();
    expect(within(accountMenu).getByText("Project Manager")).toBeInTheDocument();
    const settingsItem = within(accountMenu).getByRole("menuitem", { name: "Settings" });
    expect(settingsItem).toHaveAttribute("title", "Settings");

    fireEvent.click(settingsItem);
    expect(await screen.findByLabelText("Settings categories")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Crew schedule for the week" })).not.toBeInTheDocument();
  });

  it("lists the unbooked queue on the Schedule landing and Book opens the Week board", async () => {
    render(<App />);
    await enterDashboard();
    await openSchedule();

    const queue = screen.getByRole("region", { name: "Unassigned jobs" });
    expect(within(queue).getByText("Downtown Retail Buildout")).toBeInTheDocument();
    expect(within(queue).getByText("Book them on the Week board")).toBeInTheDocument();
    // the booked job is not waiting for a crew
    expect(within(queue).queryByText("Riverside Office Building")).not.toBeInTheDocument();

    fireEvent.click(within(queue).getByRole("button", { name: "Book" }));
    await screen.findByRole("heading", { level: 1, name: /^Week/ });
    expect(screen.getByLabelText("Selected week Jun 15 - Jun 21, 2026")).toBeInTheDocument();
  });

  it("shows the unassigned drag queue beside the Week board", async () => {
    render(<App />);
    await enterDashboard();
    await openWeekBoard();

    expect(screen.getByRole("heading", { name: "Unassigned Jobs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Downtown Retail Buildout — drag onto the board to book it" })).toBeInTheDocument();
    expect(screen.getByText("Drag a job onto a crew's day to book it.")).toBeInTheDocument();
    // the booked job sits in its crew's cell, not in the queue
    const board = screen.getByRole("region", { name: "Crew schedule for the week" });
    expect(within(board).getByRole("button", { name: "Open Riverside Office Building project" })).toBeInTheDocument();
    expect(within(board).getByText("Concrete Crew 1")).toBeInTheDocument();
  });

  it("makes the Week board controls interactive", async () => {
    render(<App />);
    await enterDashboard();
    await openWeekBoard();

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

    // week stepper, and "This week" brings it back
    expect(screen.getByLabelText("Selected week Jun 15 - Jun 21, 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "This week" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByLabelText("Selected week Jun 22 - Jun 28, 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "This week" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "This week" }));
    expect(screen.getByLabelText("Selected week Jun 15 - Jun 21, 2026")).toBeInTheDocument();

    // export is a menu now, not a dialog
    fireEvent.click(screen.getByRole("button", { name: /^Export/ }));
    const exportMenu = screen.getByRole("menu", { name: "Export" });
    expect(within(exportMenu).getByRole("menuitem", { name: /Download CSV/ })).toBeInTheDocument();

    // and the landing is one click away (the rail hub is also named "Schedule", so go by the button's title)
    fireEvent.click(screen.getByTitle("Back to the Schedule overview"));
    await screen.findByRole("heading", { name: "The whole plan, at a glance." });
  });

  it("opens the alerts dialog and the List view from the Schedule landing", async () => {
    render(<App />);
    await enterDashboard();
    await openSchedule();

    fireEvent.click(screen.getByRole("button", { name: "View all alerts" }));
    expect(screen.getByRole("dialog", { name: "Scheduling Alerts" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close Scheduling Alerts" }));
    expect(screen.queryByRole("dialog", { name: "Scheduling Alerts" })).not.toBeInTheDocument();

    // the view cards: title, blurb and a live figure in one button
    const views = screen.getByRole("region", { name: "Schedule views" });
    expect(within(views).getByRole("button", { name: /^Week .*1 booking · 1 crew$/ })).toBeInTheDocument();
    fireEvent.click(within(views).getByRole("button", { name: /^List / }));
    await screen.findByRole("heading", { level: 1, name: /^List/ });
    expect(screen.getByRole("region", { name: "Bookings this week" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Riverside Office Building for Concrete Crew 1" })).toBeInTheDocument();
  });

  it("opens the job drawer from a scheduled job card on the Week board", async () => {
    render(<App />);
    await enterDashboard();
    await openWeekBoard();

    fireEvent.click(screen.getByRole("button", { name: "Open Riverside Office Building project" }));

    const drawer = screen.getByRole("dialog", { name: "Riverside Office Building" });
    expect(within(drawer).getByText(/Concrete - Level 3 Slab/)).toBeInTheDocument();
    expect(within(drawer).getByText("Concrete Crew 1")).toBeInTheDocument();
    expect(within(drawer).getByLabelText("Status")).toHaveValue("Confirmed");
    expect(within(drawer).getByLabelText("Priority")).toHaveValue("High");
    expect(within(drawer).getByLabelText("Start")).toHaveValue("2026-06-15");
    expect(within(drawer).getByLabelText("Finish")).toHaveValue("2026-06-17");
    expect(within(drawer).getByLabelText("Notes")).toHaveValue("Slab pour.");

    fireEvent.click(within(drawer).getByRole("button", { name: "Close job details" }));
    expect(screen.queryByRole("dialog", { name: "Riverside Office Building" })).not.toBeInTheDocument();
  });

  it("saves a job from the Week board drawer with a PATCH", async () => {
    const updatedJob = { ...bootstrapFixture.jobs[0], status: "In Progress" as const, notes: "Pump on site at 6." };
    let jobUpdated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      if (pathOf(input) === "/api/jobs/j-riverside-concrete") {
        jobUpdated = true;
        expect(options?.method).toBe("PATCH");
        expect(JSON.parse(String(options?.body))).toMatchObject({ status: "In Progress", notes: "Pump on site at 6." });
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
    await openWeekBoard();

    fireEvent.click(screen.getByRole("button", { name: "Open Riverside Office Building project" }));
    const drawer = screen.getByRole("dialog", { name: "Riverside Office Building" });
    fireEvent.change(within(drawer).getByLabelText("Status"), { target: { value: "In Progress" } });
    fireEvent.change(within(drawer).getByLabelText("Notes"), { target: { value: "Pump on site at 6." } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(jobUpdated).toBe(true));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Riverside Office Building" })).not.toBeInTheDocument());
    expect(await screen.findByText("Riverside Office Building saved")).toBeInTheDocument();
  });

  it("opens the add-job picker from an empty cell and from a cell that already has work", async () => {
    render(<App />);
    await enterDashboard();
    await openWeekBoard();

    // an empty cell: Tuesday has no booking for the concrete crew
    fireEvent.click(screen.getByRole("button", { name: "Add job to Concrete Crew 1 on Jun 16" }));
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

    // a cell with a card in it keeps a compact "Add job" of its own
    expect(screen.getByRole("button", { name: "Open Riverside Office Building project" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add job to Concrete Crew 1 on Jun 15" }));
    dialog = screen.getByRole("dialog", { name: "Add job to schedule" });
    expect(within(dialog).getByText("Concrete Crew 1 · Jun 15")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Start Date")).toHaveValue("2026-06-15");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Add job to schedule" })).not.toBeInTheDocument();
  });

  it("creates and schedules a custom job from the Week board picker", async () => {
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
      notes: "Created from the Week board.",
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
          notes: "Created from the Week board."
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
    await openWeekBoard();

    fireEvent.click(screen.getByRole("button", { name: "Add job to Concrete Crew 1 on Jun 16" }));
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
    fireEvent.change(field("Notes"), { target: { value: "Created from the Week board." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create & Schedule Job" }));

    await waitFor(() => expect(scheduled).toBe(true));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add job to schedule" })).not.toBeInTheDocument());
    expect(await screen.findByText("Custom Concrete Pour scheduled for Concrete Crew 1 on Jun 16")).toBeInTheDocument();
    // the new booking lands in Tuesday's cell
    expect(await screen.findByRole("button", { name: "Open Custom Concrete Pour project" })).toBeInTheDocument();
  });
});

describe("Signed-in links land", () => {
  installAppHarness();

  it("opens a schedule link on a fresh load when a session is live", async () => {
    // a fresh load: the hash is there before the app mounts, and no hashchange fires
    window.history.replaceState(null, "", "/#schedule/week?w=2026-06-22");
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: /^Week/ });
    expect(screen.getByLabelText("Selected week Jun 22 - Jun 28, 2026")).toBeInTheDocument();
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
    window.history.replaceState(null, "", "/#schedule/week?w=2026-06-22");
    render(<App />);
    await screen.findByRole("button", { name: /^Login from welcome navigation$/ });
    expect(screen.queryByRole("heading", { level: 1, name: /^Week/ })).toBeNull();
    expect(window.location.hash).toBe("#schedule/week?w=2026-06-22");
  });
});
