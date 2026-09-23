/* The HubSpot-style index pages (Projects, Crews, Equipment, Materials, Field
   Updates — rebuilt 2026-09-04, CSS in src/hs-index.css): a KPI strip, saved-view
   tabs, a search box + quick filters, a checkbox table whose name cell is an
   "Edit <name>" link into the record editor, and a row-action column. These
   replace the quarantined card/hero-era tests in src/App.test.tsx. */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { bootstrapFixture } from "../test/fixture";
import { enterDashboard, installAppHarness, openAppPage, respondToBuildflowApi, state } from "../test/appHarness";

type FetchCall = [RequestInfo | URL, RequestInit | undefined];

/** The JSON body of the first request matching url + method. */
function requestBody(fetchMock: { mock: { calls: unknown[] } }, url: string, method: string) {
  const call = (fetchMock.mock.calls as FetchCall[]).find(([input, init]) => String(input) === url && init?.method === method);
  expect(call, `${method} ${url} was never requested`).toBeDefined();
  return JSON.parse(String(call![1]?.body));
}

/** The index card for a page: the section labelled by its h1 ("Projects", "Crews", ...). */
async function findIndexCard(title: string) {
  const heading = await screen.findByRole("heading", { level: 1, name: new RegExp(`^${title}`) });
  return heading.closest("section") as HTMLElement;
}

describe("BuildFlow index pages", () => {
  installAppHarness();

  // ---------------------------------------------------------------- Projects

  // replaces "shows the project card directory and filters"
  it("lists projects in the index table with saved views, search and quick filters", async () => {
    render(<App />);
    await enterDashboard();
    await openAppPage("Projects");

    const card = await findIndexCard("Projects");
    expect(screen.getByText("Active Projects")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Add project" })).toBeEnabled();

    const views = within(card).getByRole("tablist", { name: "Project views" });
    expect(within(views).getByRole("tab", { name: /^All projects/ })).toHaveAttribute("aria-selected", "true");
    expect(within(views).getByRole("tab", { name: /^Active/ })).toBeInTheDocument();
    expect(within(views).getByRole("tab", { name: /^At risk/ })).toBeInTheDocument();

    const table = within(card).getByRole("table");
    const row = within(table).getByRole("button", { name: "Edit Riverside Office Building" }).closest("tr") as HTMLElement;
    expect(within(row).getByText("In Progress")).toBeInTheDocument();
    expect(within(row).getByText("On Track")).toBeInTheDocument();
    expect(within(row).getByText("62%")).toBeInTheDocument();
    expect(within(row).getByText("Matt Johnson")).toBeInTheDocument();
    expect(within(row).getByRole("checkbox", { name: "Select Riverside Office Building" })).not.toBeChecked();

    // search narrows the table and the empty state distinguishes "nothing matches" from "nothing yet"
    fireEvent.change(within(card).getByLabelText("Search projects"), { target: { value: "forklift" } });
    expect(within(card).getByText("No projects found")).toBeInTheDocument();
    fireEvent.change(within(card).getByLabelText("Search projects"), { target: { value: "riverside" } });
    expect(within(card).getByRole("button", { name: "Edit Riverside Office Building" })).toBeInTheDocument();

    // saved views: the fixture project is In Progress + On Track, so it is Active but not At risk
    fireEvent.click(within(views).getByRole("tab", { name: /^At risk/ }));
    expect(within(card).getByText("No projects found")).toBeInTheDocument();
    fireEvent.click(within(views).getByRole("tab", { name: /^Active/ }));
    expect(within(card).getByRole("button", { name: "Edit Riverside Office Building" })).toBeInTheDocument();

    // quick filters
    fireEvent.change(within(card).getByLabelText("Filter projects by schedule health"), { target: { value: "At Risk" } });
    expect(within(card).getByText("No projects found")).toBeInTheDocument();
    fireEvent.change(within(card).getByLabelText("Filter projects by schedule health"), { target: { value: "all" } });
    fireEvent.change(within(card).getByLabelText("Filter projects by manager"), { target: { value: "u-matt" } });
    expect(within(card).getByRole("button", { name: "Edit Riverside Office Building" })).toBeInTheDocument();
  });

  // replaces "creates a project and reloads bootstrap data"
  it("creates a project from Add project and shows the reloaded row", async () => {
    const newProject = {
      id: "p-south-austin-retail-center-123",
      name: "South Austin Retail Center",
      slug: "south-austin-retail-center",
      location: "South Austin, TX",
      address: "4800 S Congress Ave, Austin, TX 78745",
      type: "Commercial",
      contractType: "Fixed Price",
      managerId: "u-matt",
      targetCompletion: "2026-12-18",
      percentComplete: 0,
      scheduleHealth: "On Track" as const,
      status: "Not Started" as const,
      image: "office-building",
      latitude: 30.2672,
      longitude: -97.7431
    };
    let created = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects" && init?.method === "POST") {
        created = true;
        return new Response(JSON.stringify(newProject), { status: 201 });
      }
      if (url.includes("/api/bootstrap")) {
        return new Response(
          JSON.stringify({
            ...bootstrapFixture,
            projects: created ? [...bootstrapFixture.projects, newProject] : bootstrapFixture.projects
          }),
          { status: 200 }
        );
      }
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();
    await openAppPage("Projects");

    const card = await findIndexCard("Projects");
    fireEvent.click(within(card).getByRole("button", { name: "Add project" }));
    const dialog = screen.getByRole("dialog", { name: "New Project" });
    fireEvent.change(within(dialog).getByLabelText("Project Name"), { target: { value: "South Austin Retail Center" } });
    fireEvent.change(within(dialog).getByLabelText("Location"), { target: { value: "South Austin, TX" } });
    fireEvent.change(within(dialog).getByLabelText("Address"), { target: { value: "4800 S Congress Ave, Austin, TX 78745" } });
    fireEvent.change(within(dialog).getByLabelText("Target Completion"), { target: { value: "2026-12-18" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create Project" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New Project" })).not.toBeInTheDocument());
    expect(requestBody(fetchMock, "/api/projects", "POST")).toMatchObject({
      name: "South Austin Retail Center",
      location: "South Austin, TX",
      address: "4800 S Congress Ave, Austin, TX 78745",
      type: "Commercial",
      contractType: "Fixed Price",
      managerId: "u-matt",
      targetCompletion: "2026-12-18",
      percentComplete: 0,
      status: "Not Started",
      scheduleHealth: "On Track"
    });

    const table = within(card).getByRole("table");
    const row = (await within(table).findByRole("button", { name: "Edit South Austin Retail Center" })).closest("tr") as HTMLElement;
    expect(within(row).getByText("Not Started")).toBeInTheDocument();
    expect(within(row).getByText("0%")).toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "Edit Riverside Office Building" })).toBeInTheDocument();
    expect(within(card).getByText(/^2 projects/)).toBeInTheDocument();
  });

  // replaces "updates a project and reloads bootstrap data"
  it("edits a project from its row link and shows the reloaded values", async () => {
    const updatedProject = {
      ...bootstrapFixture.projects[0],
      name: "Riverside Office Tower",
      percentComplete: 72,
      scheduleHealth: "Monitor" as const
    };
    let updated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/p-riverside" && init?.method === "PATCH") {
        updated = true;
        return new Response(JSON.stringify(updatedProject), { status: 200 });
      }
      if (url.includes("/api/bootstrap")) {
        return new Response(JSON.stringify({ ...bootstrapFixture, projects: updated ? [updatedProject] : bootstrapFixture.projects }), {
          status: 200
        });
      }
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();
    await openAppPage("Projects");

    const card = await findIndexCard("Projects");
    fireEvent.click(within(card).getByRole("button", { name: "Edit Riverside Office Building" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Project" });
    expect(within(dialog).getByLabelText("Project Name")).toHaveValue("Riverside Office Building");
    fireEvent.change(within(dialog).getByLabelText("Project Name"), { target: { value: "Riverside Office Tower" } });
    fireEvent.change(within(dialog).getByLabelText("% Complete"), { target: { value: "72" } });
    fireEvent.change(within(dialog).getByLabelText("Schedule Health"), { target: { value: "Monitor" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit Project" })).not.toBeInTheDocument());
    expect(requestBody(fetchMock, "/api/projects/p-riverside", "PATCH")).toMatchObject({
      name: "Riverside Office Tower",
      percentComplete: 72,
      scheduleHealth: "Monitor"
    });

    const table = within(card).getByRole("table");
    const row = (await within(table).findByRole("button", { name: "Edit Riverside Office Tower" })).closest("tr") as HTMLElement;
    expect(within(row).getByText("72%")).toBeInTheDocument();
    expect(within(row).getByText("Monitor")).toBeInTheDocument();
    expect(within(table).queryByRole("button", { name: "Edit Riverside Office Building" })).not.toBeInTheDocument();
  });

  it("deletes a project from its row action after confirming", async () => {
    let deleted = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/p-riverside" && init?.method === "DELETE") {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      if (url.includes("/api/bootstrap")) {
        return new Response(JSON.stringify({ ...bootstrapFixture, projects: deleted ? [] : bootstrapFixture.projects }), { status: 200 });
      }
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();
    await openAppPage("Projects");

    const card = await findIndexCard("Projects");
    fireEvent.click(within(card).getByRole("button", { name: "Delete Riverside Office Building" }));
    const dialog = screen.getByRole("dialog", { name: "Delete project" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm delete Riverside Office Building" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete project" })).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p-riverside", expect.objectContaining({ method: "DELETE" }));
    expect(await within(card).findByText("No projects added yet")).toBeInTheDocument();
  });

  // The rail's ages used to be the literals "10m ago", "45m ago" and "2h ago", so the column
  // that exists to say how fresh a warning is read the same on every load in every workspace.
  it("ages each project alert from its own record, and shows nothing when the record has no time", async () => {
    // a short material is the one alert source with no moment of its own to count from
    state.bootstrapPayload = {
      ...bootstrapFixture,
      materials: [{ ...bootstrapFixture.materials[0], status: "Waiting on Delivery" }]
    };
    render(<App />);
    await enterDashboard();
    await openAppPage("Projects");

    const panel = (await screen.findByRole("heading", { level: 2, name: "Project Alerts" })).closest("section") as HTMLElement;
    const rowOf = (title: string) => within(panel).getByText(title).closest(".cc-alert") as HTMLElement;

    // the clock is pinned to 2026-06-16 noon and this DelayIQ was reported on the 12th
    expect(within(rowOf("Heavy Rain DelayIQ")).getByText("4d ago")).toBeInTheDocument();
    // the weather warning has not arrived yet, so its row counts forward instead
    expect(within(rowOf("Weather delayIQ expected")).getByText(/^in \d+d$/)).toBeInTheDocument();
    // the material knows only the day its delivery is due, which is not how old the warning is
    expect(rowOf("Material delivery delayIQed").querySelector(".cc-alert-time")).toBeNull();
  });

  // ------------------------------------------------------------------- Crews

  // replaces "edits crews directly from the crew popup"
  it("edits a crew from its row link and shows the reloaded row", async () => {
    const updatedCrew = {
      ...bootstrapFixture.crews[0],
      name: "Concrete Crew Alpha",
      lead: "Morgan Lee",
      size: 9,
      laborMix: [
        { category: "Labor", role: "Finishers", count: 5 },
        { category: "Labor", role: "Laborers", count: 2 },
        { category: "Operator", role: "Pump Operator", count: 1 }
      ]
    };
    let updated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/crews/crew-concrete" && init?.method === "PATCH") {
        updated = true;
        return new Response(JSON.stringify(updatedCrew), { status: 200 });
      }
      if (url.includes("/api/bootstrap")) {
        return new Response(JSON.stringify({ ...bootstrapFixture, crews: updated ? [updatedCrew] : bootstrapFixture.crews }), {
          status: 200
        });
      }
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();
    await openAppPage("Crews");

    const card = await findIndexCard("Crews");
    expect(within(card).getByRole("tablist", { name: "Crew views" })).toBeInTheDocument();
    const row = within(card).getByRole("button", { name: "Edit Concrete Crew 1" }).closest("tr") as HTMLElement;
    expect(within(row).getByText("Mike Johnson")).toBeInTheDocument();
    expect(within(row).getByText("8 workers")).toBeInTheDocument();

    fireEvent.click(within(card).getByRole("button", { name: "Edit Concrete Crew 1" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Crew" });
    fireEvent.change(within(dialog).getByLabelText("Crew Name"), { target: { value: "Concrete Crew Alpha" } });
    fireEvent.change(within(dialog).getByLabelText("Crew lead"), { target: { value: "Morgan Lee" } });
    fireEvent.change(within(dialog).getByLabelText("Count for role 1"), { target: { value: "5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Crew" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit Crew" })).not.toBeInTheDocument());
    expect(requestBody(fetchMock, "/api/crews/crew-concrete", "PATCH")).toMatchObject({
      name: "Concrete Crew Alpha",
      specialty: "Concrete",
      foreman: "Morgan Lee",
      laborMix: [
        { category: "Labor", role: "Finishers", count: 5 },
        { category: "Labor", role: "Laborers", count: 2 },
        { category: "Operator", role: "Pump Operator", count: 1 }
      ]
    });

    const updatedRow = (await within(card).findByRole("button", { name: "Edit Concrete Crew Alpha" })).closest("tr") as HTMLElement;
    expect(within(updatedRow).getByText("Morgan Lee")).toBeInTheDocument();
    expect(within(updatedRow).getByText("9 workers")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Edit Concrete Crew 1" })).not.toBeInTheDocument();
  });

  it("deletes a crew from its row action after confirming", async () => {
    let deleted = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/crews/crew-concrete" && init?.method === "DELETE") {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      if (url.includes("/api/bootstrap")) {
        return new Response(
          JSON.stringify({
            ...bootstrapFixture,
            crews: deleted ? [] : bootstrapFixture.crews,
            assignments: deleted ? [] : bootstrapFixture.assignments
          }),
          { status: 200 }
        );
      }
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();
    await openAppPage("Crews");

    const card = await findIndexCard("Crews");
    fireEvent.click(within(card).getByRole("button", { name: "Delete Concrete Crew 1" }));
    const dialog = screen.getByRole("dialog", { name: /^Delete crew/ });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm delete Concrete Crew 1" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: /^Delete crew/ })).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/crews/crew-concrete", expect.objectContaining({ method: "DELETE" }));
    expect(await within(card).findByText("No crews added yet")).toBeInTheDocument();
  });

  // --------------------------------------------------------------- Equipment

  // replaces "renders equipment with the crew-style directory layout"
  it("lists equipment in the index table with status tabs and search", async () => {
    state.bootstrapPayload = bootstrapFixture;
    render(<App />);
    await enterDashboard();
    await openAppPage("Equipment");

    const card = await findIndexCard("Equipment");
    expect(screen.getByText("Total Equipment")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Add Equipment" })).toBeEnabled();

    const views = within(card).getByRole("tablist", { name: "Equipment views" });
    expect(within(views).getByRole("tab", { name: /^All equipment/ })).toHaveAttribute("aria-selected", "true");

    // the name cell link and the pencil row action share the "Edit <name>" label
    const row = within(card).getAllByRole("button", { name: "Edit Concrete Pump #2" })[0].closest("tr") as HTMLElement;
    expect(within(row).getByText("In Use")).toBeInTheDocument();
    // assigned project + current job (the fixture job is named after its project)
    expect(within(row).getAllByText("Riverside Office Building").length).toBeGreaterThan(0);
    expect(within(row).getByRole("button", { name: "Remove Concrete Pump #2" })).toBeInTheDocument();

    fireEvent.click(within(views).getByRole("tab", { name: /^Maintenance/ }));
    expect(within(card).getByText("No equipment matches that search")).toBeInTheDocument();
    fireEvent.click(within(views).getByRole("tab", { name: /^In use/ }));
    expect(within(card).getAllByRole("button", { name: "Edit Concrete Pump #2" }).length).toBeGreaterThan(0);

    fireEvent.change(within(card).getByLabelText("Search equipment"), { target: { value: "forklift" } });
    expect(within(card).getByText("No equipment matches that search")).toBeInTheDocument();
    fireEvent.change(within(card).getByLabelText("Search equipment"), { target: { value: "pump" } });
    expect(within(card).getAllByRole("button", { name: "Edit Concrete Pump #2" }).length).toBeGreaterThan(0);
  });

  // replaces "creates equipment from the equipment popup and reloads bootstrap data"
  it("creates equipment from Add Equipment and shows the reloaded row", async () => {
    const newEquipment = { id: "eq-forklift-9", name: "Forklift #9", type: "Forklift", status: "In Use", assignedTo: "p-riverside" };
    let created = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/equipment" && init?.method === "POST") {
        created = true;
        return new Response(JSON.stringify(newEquipment), { status: 201 });
      }
      if (url.includes("/api/bootstrap")) {
        return new Response(
          JSON.stringify({
            ...bootstrapFixture,
            equipment: created ? [...bootstrapFixture.equipment, newEquipment] : bootstrapFixture.equipment
          }),
          { status: 200 }
        );
      }
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();
    await openAppPage("Equipment");

    const card = await findIndexCard("Equipment");
    fireEvent.click(within(card).getByRole("button", { name: "Add Equipment" }));
    const dialog = screen.getByRole("dialog", { name: "Add Equipment" });
    fireEvent.change(within(dialog).getByLabelText("Equipment Name"), { target: { value: "Forklift #9" } });
    fireEvent.change(within(dialog).getByLabelText("Equipment Type"), { target: { value: "Forklift" } });
    fireEvent.change(within(dialog).getByLabelText("Status"), { target: { value: "In Use" } });
    fireEvent.change(within(dialog).getByLabelText("Assigned Project"), { target: { value: "p-riverside" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add Equipment" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add Equipment" })).not.toBeInTheDocument());
    expect(requestBody(fetchMock, "/api/equipment", "POST")).toEqual({
      name: "Forklift #9",
      type: "Forklift",
      status: "In Use",
      assignedTo: "p-riverside"
    });

    const row = (await within(card).findAllByRole("button", { name: "Edit Forklift #9" }))[0].closest("tr") as HTMLElement;
    expect(within(row).getByText("In Use")).toBeInTheDocument();
    expect(within(card).getAllByRole("button", { name: "Edit Concrete Pump #2" }).length).toBeGreaterThan(0);
  });

  // replaces "edits and removes equipment from equipment cards"
  it("edits and removes equipment from the index rows", async () => {
    let equipment = [...bootstrapFixture.equipment];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/equipment/eq-pump" && init?.method === "PATCH") {
        const updates = JSON.parse(String(init.body));
        equipment = equipment.map((item) => (item.id === "eq-pump" ? { ...item, ...updates } : item));
        return new Response(JSON.stringify(equipment.find((item) => item.id === "eq-pump")), { status: 200 });
      }
      if (url === "/api/equipment/eq-pump" && init?.method === "DELETE") {
        equipment = equipment.filter((item) => item.id !== "eq-pump");
        return new Response(null, { status: 204 });
      }
      if (url.includes("/api/bootstrap")) {
        return new Response(JSON.stringify({ ...bootstrapFixture, equipment }), { status: 200 });
      }
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();
    await openAppPage("Equipment");

    const card = await findIndexCard("Equipment");
    fireEvent.click(within(card).getAllByRole("button", { name: "Edit Concrete Pump #2" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Edit Equipment" });
    expect(within(dialog).getByLabelText("Equipment Name")).toHaveValue("Concrete Pump #2");
    fireEvent.change(within(dialog).getByLabelText("Equipment Name"), { target: { value: "Concrete Pump #3" } });
    fireEvent.change(within(dialog).getByLabelText("Equipment Type"), { target: { value: "Pump Truck" } });
    fireEvent.change(within(dialog).getByLabelText("Status"), { target: { value: "Maintenance" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Equipment" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit Equipment" })).not.toBeInTheDocument());
    expect(requestBody(fetchMock, "/api/equipment/eq-pump", "PATCH")).toEqual({
      name: "Concrete Pump #3",
      type: "Pump Truck",
      status: "Maintenance",
      assignedTo: "p-riverside"
    });
    const row = (await within(card).findAllByRole("button", { name: "Edit Concrete Pump #3" }))[0].closest("tr") as HTMLElement;
    expect(within(row).getByText("Maintenance")).toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: "Remove Concrete Pump #3" }));
    const confirm = screen.getByRole("dialog", { name: "Remove Equipment" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Remove Equipment" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Remove Equipment" })).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/equipment/eq-pump", expect.objectContaining({ method: "DELETE" }));
    expect(await within(card).findByText("No equipment added yet")).toBeInTheDocument();
  });

  // --------------------------------------------------------------- Materials

  // replaces "renders materials with the crew-style directory layout"
  it("lists materials in the index table with status tabs and search", async () => {
    render(<App />);
    await enterDashboard();
    await openAppPage("Materials");

    const card = await findIndexCard("Materials");
    expect(screen.getByText("Total Materials")).toBeInTheDocument();
    expect(screen.getByText("Ready Now")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Add Material" })).toBeEnabled();

    const views = within(card).getByRole("tablist", { name: "Material views" });
    expect(within(views).getByRole("tab", { name: /^All materials/ })).toHaveAttribute("aria-selected", "true");

    const table = within(card).getByRole("table");
    const row = within(table).getByRole("checkbox", { name: "Select Ready Mix Concrete" }).closest("tr") as HTMLElement;
    expect(within(row).getByText("Ready Mix Concrete")).toBeInTheDocument();
    expect(within(row).getByText("Ready")).toBeInTheDocument();
    expect(within(row).getByText("120 yd3")).toBeInTheDocument();
    // the fixture's job is named after its project, so the Project and Job columns both read the project name
    expect(within(row).getAllByText("Riverside Office Building").length).toBeGreaterThan(0);

    fireEvent.click(within(views).getByRole("tab", { name: /^Ordered/ }));
    expect(within(card).getByText("No materials match that search")).toBeInTheDocument();
    fireEvent.click(within(views).getByRole("tab", { name: /^Ready/ }));
    expect(within(card).getByRole("checkbox", { name: "Select Ready Mix Concrete" })).toBeInTheDocument();

    fireEvent.change(within(card).getByLabelText("Search materials"), { target: { value: "rebar" } });
    expect(within(card).getByText("No materials match that search")).toBeInTheDocument();
    fireEvent.change(within(card).getByLabelText("Search materials"), { target: { value: "" } });
    fireEvent.change(within(card).getByLabelText("Filter materials by status"), { target: { value: "Ready" } });
    expect(within(card).getByRole("checkbox", { name: "Select Ready Mix Concrete" })).toBeInTheDocument();
  });

  // ----------------------------------------------------------- Field Updates

  // replaces "renders Field Updates with the crew-style directory layout"
  it("lists field updates in the index table with reporter rows, tabs and filters", async () => {
    render(<App />);
    await enterDashboard();
    await openAppPage("Field Updates");

    const card = await findIndexCard("Field Updates");
    expect(within(card).getByRole("button", { name: "Add Field Update" })).toBeEnabled();
    const views = within(card).getByRole("tablist", { name: "Field update views" });
    expect(within(views).getByRole("tab", { name: /^All updates/ })).toHaveAttribute("aria-selected", "true");

    const table = within(card).getByRole("table");
    const row = within(table).getByRole("button", { name: "Edit field update from Carlos Ramirez" }).closest("tr") as HTMLElement;
    expect(within(row).getByText("Steel framing installation progressing.")).toBeInTheDocument();
    expect(within(row).getByText("On Site")).toBeInTheDocument();
    expect(within(row).getAllByText("Riverside Office Building").length).toBeGreaterThan(0);
    expect(within(row).getByText("No photos attached")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Correct field update from Carlos Ramirez" })).toBeInTheDocument();

    fireEvent.click(within(views).getByRole("tab", { name: /^Complete/ }));
    expect(within(card).queryByRole("button", { name: "Edit field update from Carlos Ramirez" })).not.toBeInTheDocument();
    fireEvent.click(within(views).getByRole("tab", { name: /^On site/ }));
    expect(within(card).getByRole("button", { name: "Edit field update from Carlos Ramirez" })).toBeInTheDocument();

    fireEvent.change(within(card).getByLabelText("Search field updates"), { target: { value: "plumbing" } });
    expect(within(card).queryByRole("button", { name: "Edit field update from Carlos Ramirez" })).not.toBeInTheDocument();
    fireEvent.change(within(card).getByLabelText("Search field updates"), { target: { value: "framing" } });
    fireEvent.change(within(card).getByLabelText("Filter field updates by reporter"), { target: { value: "u-carlos" } });
    expect(within(card).getByRole("button", { name: "Edit field update from Carlos Ramirez" })).toBeInTheDocument();

    // the inline composer is still on the page
    expect(screen.getByLabelText("Field update project")).toBeInTheDocument();
    expect(screen.getByLabelText("Field update job")).toBeInTheDocument();
  });

  it("corrects a field update from its row link and shows the reloaded row", async () => {
    const updatedUpdate = { ...bootstrapFixture.fieldUpdates[0], message: "Steel framing complete on level 3.", status: "Complete" };
    let updated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/field-updates/fu-1" && init?.method === "PATCH") {
        updated = true;
        return new Response(JSON.stringify({ update: updatedUpdate, variance: null }), { status: 200 });
      }
      if (url.includes("/api/bootstrap")) {
        return new Response(
          JSON.stringify({ ...bootstrapFixture, fieldUpdates: updated ? [updatedUpdate] : bootstrapFixture.fieldUpdates }),
          {
            status: 200
          }
        );
      }
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();
    await openAppPage("Field Updates");

    const card = await findIndexCard("Field Updates");
    fireEvent.click(within(card).getByRole("button", { name: "Edit field update from Carlos Ramirez" }));
    const dialog = screen.getByRole("dialog", { name: /^Correct this report/ });
    expect(within(dialog).getByLabelText("Update")).toHaveValue("Steel framing installation progressing.");
    fireEvent.change(within(dialog).getByLabelText("Status"), { target: { value: "Complete" } });
    fireEvent.change(within(dialog).getByLabelText("Update"), { target: { value: "Steel framing complete on level 3." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: /^Correct this report/ })).not.toBeInTheDocument());
    expect(requestBody(fetchMock, "/api/field-updates/fu-1", "PATCH")).toMatchObject({
      projectId: "p-riverside",
      jobId: "j-riverside-concrete",
      userId: "u-carlos",
      message: "Steel framing complete on level 3.",
      status: "Complete"
    });

    const row = (await within(card).findByText("Steel framing complete on level 3.")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Complete")).toBeInTheDocument();
    expect(within(card).queryByText("Steel framing installation progressing.")).not.toBeInTheDocument();
  });
});
