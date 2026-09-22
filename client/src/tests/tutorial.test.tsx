import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { bootstrapFixture } from "../test/fixture";
import {
  blankWorkspaceFixture,
  completeOnboarding,
  enterDashboard,
  installAppHarness,
  respondToBuildflowApi,
  state
} from "../test/appHarness";

/* Onboarding tutorial + notifications bell. Replaces the App.test.tsx tests
   quarantined 2026-09-09:
   - "stores skipped tutorials by setup and does not auto-repeat the same setup"
   - "keeps the crew tutorial gate locked until a crew is created"
   - "keeps the schedule job tutorial gate locked until a job is created and assigned"
   - "opens recent BuildFlow activity from the notifications bell"
   Since 2026-09-09 a skipped/completed tutorial is remembered per USER on the
   server (`userSettings` in bootstrap) with localStorage as the local mirror.
   Since 2026-09-15 the record is per PERSON, not per setup — PUT
   /api/me/settings/tutorial:seen, written the moment the tutorial is shown —
   because the tutorial is now a one-time thing: seen once, never shown again,
   and the top bar's restart button is gone. The old per-setup record
   (tutorial:<setupKey>) is still honoured for people who saw it before. */

// Mirrors App.tsx's createTutorialSetupKey: slug parts joined by "--", products sorted and "+"-joined.
const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "none";
const setupKeyFor = (trade: string, plan: string, productIds: string[]) =>
  [slug(trade), slug(plan), [...productIds].sort().map(slug).join("+") || "core"].join("--");

const ASPHALT_SETUP = {
  email: "ops@asphalt.test",
  businessType: "Asphalt",
  products: ["Map & Field Ops", "Equipment Tracking"],
  plan: "Business" as const
};
const ASPHALT_KEY = setupKeyFor("asphalt", "business", ["map-field-ops", "equipment-tracking"]);
const TUTORIAL_TITLE = "Your BuildFlow workspace is ready";
/** The device copy of the person-level record, keyed by the signed-in user so a shared
    browser cannot hand one person's tour to the next. */
const seenKey = () => `buildflow.tutorial.status:seen:${state.bootstrapPayload.activeUser.id}`;

/** The tutorial overlay: a labelled region wrapping the step dialog. Both the
    landing's gallery rail and the tutorial render a "Next" button, so every
    tutorial query is scoped here. */
const tutorial = () => within(screen.getByRole("region", { name: "BuildFlow tutorial" }));
/**
 * The tutorial's primary action. Its LABEL varies by step — the redesign of 2026-09-14 put
 * "Start working" on the first step and "Finish" on the last, the way the reference does —
 * so this matches the action rather than one of its names. The gates these tests are about
 * are unchanged: the button is disabled until the step is satisfied either way.
 */
const tutorialNext = () => tutorial().getByRole("button", { name: /^(Next|Start working|Finish)$/ });

/** Intercept the per-user settings writes; everything else goes to the fake BuildFlow API. */
function stubSettingsWrites() {
  const writes: Array<{ url: string; method?: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/me/settings/")) {
        writes.push({ url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return respondToBuildflowApi(input);
    })
  );
  return writes;
}

const tutorialCrew = {
  ...bootstrapFixture.crews[0],
  id: "crew-tutorial-1",
  name: "Tutorial Crew 1",
  specialty: "Training",
  lead: "Jordan Lee",
  laborMix: [
    { category: "Labor" as const, role: "Laborers", count: 1 },
    { category: "Operator" as const, role: "Operators", count: 1 }
  ]
};

/** Walk the tutorial from the intro to "Save the new crew" and create the crew.
    Returns once the crew gate has opened (the crew is in bootstrap and Next is enabled). */
async function createCrewThroughTutorial() {
  expect(await screen.findByRole("dialog", { name: TUTORIAL_TITLE })).toBeInTheDocument();
  fireEvent.click(tutorialNext());
  expect(await tutorial().findByRole("heading", { name: "Read your workspace context" })).toBeInTheDocument();
  fireEvent.click(tutorialNext());

  // The step routes to Crews and waits for the Add Crew form to open.
  expect(await tutorial().findByRole("heading", { name: "Create a crew" })).toBeInTheDocument();
  expect(tutorialNext()).toBeDisabled();
  expect(tutorial().getByRole("status")).toHaveTextContent("Open the Add Crew form to continue.");

  fireEvent.click(await screen.findByRole("button", { name: "Add Crew" }));
  const crewDialog = await screen.findByRole("dialog", { name: "Add Crew" });
  await waitFor(() => expect(tutorialNext()).toBeEnabled());
  fireEvent.click(tutorialNext());

  // Now it waits for a crew to actually be saved.
  expect(await tutorial().findByRole("heading", { name: "Save the new crew" })).toBeInTheDocument();
  expect(tutorialNext()).toBeDisabled();
  expect(tutorial().getByRole("status")).toHaveTextContent("Create a crew to unlock the next step.");

  fireEvent.change(within(crewDialog).getByLabelText("Crew Name"), { target: { value: tutorialCrew.name } });
  fireEvent.change(within(crewDialog).getByLabelText("Specialty/Type"), { target: { value: tutorialCrew.specialty } });
  fireEvent.change(within(crewDialog).getByLabelText("Crew lead"), { target: { value: tutorialCrew.lead } });
  fireEvent.click(within(crewDialog).getByRole("button", { name: "Add Crew" }));

  await waitFor(() => expect(tutorialNext()).toBeEnabled());
  return crewDialog;
}

describe("BuildFlow onboarding tutorial", () => {
  installAppHarness();

  it("records the tutorial as seen for this PERSON the moment it shows, and never repeats it — not even for another setup", async () => {
    const writes = stubSettingsWrites();
    const view = render(<App />);

    await completeOnboarding(ASPHALT_SETUP);
    const dialog = await screen.findByRole("dialog", { name: TUTORIAL_TITLE });
    // showing it is what records it: the first write lands before anyone clicks
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(decodeURIComponent(writes[0].url)).toBe("/api/me/settings/tutorial:seen");
    expect(writes[0].method).toBe("PUT");
    expect(writes[0].body).toEqual({ value: "started" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Skip Tutorial" }));
    expect(screen.queryByRole("dialog", { name: TUTORIAL_TITLE })).not.toBeInTheDocument();
    // local mirror …
    expect(window.localStorage.getItem(seenKey())).toBe("skipped");
    // … and the per-user server copy, upgraded on the way out
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(decodeURIComponent(writes[1].url)).toBe("/api/me/settings/tutorial:seen");
    expect(writes[1].body).toEqual({ value: "skipped" });
    // nothing is filed under the setup any more
    expect(window.localStorage.getItem(`buildflow.tutorial.status:${ASPHALT_KEY}`)).toBeNull();

    // The same person setting up a different product mix is not asked twice: seen is seen.
    view.unmount();
    render(<App />);
    await completeOnboarding({ ...ASPHALT_SETUP, products: ["Map & Field Ops"] });
    expect(screen.queryByRole("dialog", { name: TUTORIAL_TITLE })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "BuildFlow tutorial" })).not.toBeInTheDocument();
  });

  it("keeps one person's tour from counting for the next person on the same browser", async () => {
    // What a device-wide record would look like — and what someone else's looks like.
    window.localStorage.setItem("buildflow.tutorial.status:seen", "completed");
    window.localStorage.setItem("buildflow.tutorial.status:seen:u-someone-else", "completed");
    render(<App />);

    await completeOnboarding(ASPHALT_SETUP);

    expect(await screen.findByRole("dialog", { name: TUTORIAL_TITLE })).toBeInTheDocument();
  });

  const SERVER_RECORDS: Array<[string, Record<string, string>]> = [
    ["the person-level record", { "tutorial:seen": "completed" }],
    ["the setup-level record it replaced", { [`tutorial:${ASPHALT_KEY}`]: "skipped" }]
  ];
  it.each(SERVER_RECORDS)(
    "does not auto-start a tutorial the server holds under %s, and offers no way to restart it",
    async (_label, userSettings) => {
      // Another device: nothing in localStorage, but bootstrap carries the user's settings.
      state.businessProfilePayload = { ...blankWorkspaceFixture, userSettings };
      render(<App />);

      await completeOnboarding(ASPHALT_SETUP);

      expect(window.localStorage.getItem(seenKey())).toBeNull();
      expect(screen.queryByRole("dialog", { name: TUTORIAL_TITLE })).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "BuildFlow tutorial" })).not.toBeInTheDocument();
      // The top bar's Help-and-tutorial button went with the one-time rule (2026-09-15).
      expect(screen.queryByRole("button", { name: "Help and tutorial" })).not.toBeInTheDocument();
      expect(document.querySelector(".topbar-help-button")).toBeNull();
    }
  );

  it("keeps the crew tutorial gate locked until a crew is created", async () => {
    let crewCreated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/crews" && init?.method === "POST") {
        crewCreated = true;
        return new Response(JSON.stringify(tutorialCrew), { status: 201 });
      }
      if (url.includes("/api/bootstrap") && crewCreated) {
        return new Response(JSON.stringify({ ...state.bootstrapPayload, crews: [...state.bootstrapPayload.crews, tutorialCrew] }), {
          status: 200
        });
      }
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await completeOnboarding();

    await createCrewThroughTutorial();

    expect(fetchMock).toHaveBeenCalledWith("/api/crews", expect.objectContaining({ method: "POST" }));
    // The saved crew is a real workspace record, listed on the Crews index behind the tutorial.
    expect(screen.getAllByText("Tutorial Crew 1").length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog", { name: "Add Crew" })).not.toBeInTheDocument();
  });

  it("keeps the schedule job tutorial gate locked until a job is created and assigned", async () => {
    const createdJob = {
      id: "job-tutorial-schedule",
      projectId: "p-riverside",
      name: "Tutorial Schedule Job",
      phase: "Training Phase",
      location: "Downtown, Austin, TX",
      startDate: "2026-06-16",
      endDate: "2026-06-16",
      startTime: "7:00 AM",
      endTime: "3:00 PM",
      requiredLabor: 4,
      requiredEquipment: "General tools",
      materialsStatus: "Delivered" as const,
      status: "Planned" as const,
      priority: "Normal" as const,
      notes: "Created during the tutorial."
    };
    const scheduledAssignment = {
      id: "as-tutorial-schedule",
      jobId: createdJob.id,
      crewId: tutorialCrew.id,
      date: "2026-06-16",
      status: "Planned" as const,
      conflicts: []
    };
    let crewCreated = false;
    let jobCreated = false;
    let assignmentCreated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/crews" && init?.method === "POST") {
        crewCreated = true;
        return new Response(JSON.stringify(tutorialCrew), { status: 201 });
      }
      if (url === "/api/jobs" && init?.method === "POST") {
        jobCreated = true;
        return new Response(JSON.stringify(createdJob), { status: 201 });
      }
      if (url === "/api/schedule/assign" && init?.method === "POST") {
        assignmentCreated = true;
        return new Response(JSON.stringify(scheduledAssignment), { status: 201 });
      }
      if (url.includes("/api/bootstrap")) {
        return new Response(
          JSON.stringify({
            ...state.bootstrapPayload,
            crews: crewCreated ? [...state.bootstrapPayload.crews, tutorialCrew] : state.bootstrapPayload.crews,
            jobs: jobCreated ? [...state.bootstrapPayload.jobs, createdJob] : state.bootstrapPayload.jobs,
            assignments: assignmentCreated
              ? [...state.bootstrapPayload.assignments, scheduledAssignment]
              : state.bootstrapPayload.assignments
          }),
          { status: 200 }
        );
      }
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);
    // A job belongs to a project (and takes its location), so the provisioned
    // workspace needs one; the crew and the job are still the tutorial's to create.
    state.businessProfilePayload = { ...blankWorkspaceFixture, projects: bootstrapFixture.projects };

    render(<App />);
    await completeOnboarding();
    await createCrewThroughTutorial();
    fireEvent.click(tutorialNext());

    // The Week board step is informational …
    expect(await tutorial().findByRole("heading", { name: "Read the Week board" })).toBeInTheDocument();
    expect(tutorialNext()).toBeEnabled();
    fireEvent.click(tutorialNext());

    // … then the gate waits for the Add job form on the crew just created.
    expect(await tutorial().findByRole("heading", { name: "Add a job to the schedule" })).toBeInTheDocument();
    expect(tutorialNext()).toBeDisabled();
    expect(tutorial().getByRole("status")).toHaveTextContent("Open the Add job to schedule form to continue.");
    fireEvent.click(await screen.findByRole("button", { name: "Add job to Tutorial Crew 1 on Jun 16" }));
    const jobDialog = await screen.findByRole("dialog", { name: "Add job to schedule" });
    await waitFor(() => expect(tutorialNext()).toBeEnabled());
    fireEvent.click(tutorialNext());

    // The last gate opens only once the job is both created and assigned.
    expect(await tutorial().findByRole("heading", { name: "Create and schedule the job" })).toBeInTheDocument();
    expect(tutorialNext()).toBeDisabled();
    expect(tutorial().getByRole("status")).toHaveTextContent("Create and schedule a job to continue.");
    fireEvent.change(within(jobDialog).getByLabelText("Job Name"), { target: { value: createdJob.name } });
    fireEvent.change(within(jobDialog).getByLabelText("Phase"), { target: { value: createdJob.phase } });
    fireEvent.change(within(jobDialog).getByLabelText("Labor"), { target: { value: "4" } });
    fireEvent.change(within(jobDialog).getByLabelText("Notes"), { target: { value: createdJob.notes } });
    fireEvent.click(within(jobDialog).getByRole("button", { name: "Create & Schedule Job" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/jobs", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/schedule/assign", expect.objectContaining({ method: "POST" })));
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url]) => url === "/api/schedule/assign")?.[1]?.body))).toMatchObject({
      jobId: createdJob.id,
      crewId: tutorialCrew.id,
      date: "2026-06-16"
    });
    await waitFor(() => expect(tutorialNext()).toBeEnabled());
    expect((await screen.findAllByText("Tutorial Schedule Job")).length).toBeGreaterThan(0);
  });

  it("opens recent BuildFlow activity from the notifications bell", async () => {
    render(<App />);
    await enterDashboard();

    const notificationsButton = screen.getByRole("button", { name: "Notifications" });
    const accountButton = screen.getByRole("button", { name: /account$/ });
    // Top bar order: the bell sits before the account control.
    expect(notificationsButton.compareDocumentPosition(accountButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notificationsButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Recent BuildFlow activity" })).not.toBeInTheDocument();

    fireEvent.click(notificationsButton);

    expect(notificationsButton).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("region", { name: "Recent BuildFlow activity" });
    // The dashboard shows the same field update, so every check is scoped to the panel.
    expect(within(panel).getByText("Field update posted")).toBeInTheDocument();
    expect(within(panel).getByText(/Steel framing installation progressing/)).toBeInTheDocument();
    expect(within(panel).getByText("Weather alert added")).toBeInTheDocument();
    expect(within(panel).getByText("Schedule assignment updated")).toBeInTheDocument();

    fireEvent.click(notificationsButton);
    expect(screen.queryByRole("region", { name: "Recent BuildFlow activity" })).not.toBeInTheDocument();
  });
});
