import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { businessTypeOptions } from "@buildflow/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { bootstrapFixture } from "./test/fixture";

// The workspace a business profile provisions: real people, no production data yet.
const blankWorkspaceFixture: typeof bootstrapFixture = {
  ...bootstrapFixture,
  projects: [],
  phases: [],
  jobs: [],
  crews: [],
  equipment: [],
  materials: [],
  assignments: [],
  fieldUpdates: [],
  delayIQs: [],
  readiness: [],
  inspections: [],
  weatherAlerts: []
};

// A brand-new org before onboarding provisions it — no users at all. `enterAfterAuth`
// branches on `users.length === 0` to send a fresh signup to the business-type
// question instead of the dashboard, so the onboarding tests need /api/bootstrap to
// answer with this rather than the populated fixture.
const newOrgWorkspaceFixture: typeof bootstrapFixture = { ...blankWorkspaceFixture, users: [] };

// The /api/bootstrap response for the test in flight. `signUp()` points this at the
// new-org payload; `beforeEach` resets it to the populated workspace.
let bootstrapPayload: typeof bootstrapFixture = bootstrapFixture;

// What applying a business profile provisions. Blank by default — that's the point of
// onboarding — but the map/routing tests need real jobs and crews to plan across.
let businessProfilePayload: typeof bootstrapFixture = blankWorkspaceFixture;

const ACCOUNT = { name: "Jordan Reyes", email: "ops@buildflow.test", password: "password123" };

// The HUD/topbar greet whoever `accountDisplayName` says is signed in, which is
// currently a hardcoded constant rather than the name the signup form collected.
const GREETING = "Good afternoon, Liam";

/** The default BuildFlow API responder. Tests that stub fetch to intercept a
    third-party API (routing, geocoding) must delegate everything else here rather
    than answering bootstrap themselves — otherwise `bootstrapPayload` is ignored
    and signup never reaches the onboarding questions. */
function respondToBuildflowApi(input: RequestInfo | URL) {
  const url = String(input);
  if (url.includes("/api/business-profile")) {
    return new Response(JSON.stringify(businessProfilePayload), { status: 200 });
  }
  if (url.includes("/api/bootstrap")) {
    return new Response(JSON.stringify(bootstrapPayload), { status: 200 });
  }
  // Everything else (auth, creates, patches) just needs a 200 with a plausible body.
  return new Response(JSON.stringify(bootstrapFixture), { status: 200 });
}

// The clock is pinned to 2026-06-16 in src/test/setup.ts, inside the week the
// fixtures are dated in — see the comment there for why it has to happen that early.
describe("BuildFlow app", () => {
  beforeEach(() => {
    bootstrapPayload = bootstrapFixture;
    businessProfilePayload = blankWorkspaceFixture;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => respondToBuildflowApi(input)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    window.history.pushState(null, "", "/");
  });

  /** Sign in through the real login form. The workspace has users, so this lands
      straight on the dashboard. */
  async function enterDashboard() {
    fireEvent.click(await screen.findByRole("button", { name: /^Login from welcome navigation$/ }));
    fireEvent.change(await screen.findByLabelText("Work email"), { target: { value: ACCOUNT.email } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: ACCOUNT.password } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Weekly Production Schedule");
  }

  /** Open the Schedule page from the app sidebar. The board opens on Month, so the
      crew-by-day grid, its queue, and the week controls need an explicit view. */
  async function openSchedule(view?: "Month" | "Week" | "List" | "Gantt" | "Kanban" | "Matrix") {
    fireEvent.click(await screen.findByRole("button", { name: /^Schedule$/i }));
    await screen.findByRole("heading", { name: "Assign the week, in minutes." });
    if (view) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${view}$`) }));
    }
  }

  /** Register through the real signup form as a brand-new org, which lands on the
      first onboarding question. Leaves the caller on #business-type. */
  async function signUp({ email = ACCOUNT.email }: { email?: string } = {}) {
    bootstrapPayload = newOrgWorkspaceFixture;
    fireEvent.click(await screen.findByRole("button", { name: /^Get BuildFlow$/ }));
    fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: ACCOUNT.name } });
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: email } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: ACCOUNT.password } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByRole("heading", { name: "What type of Business do you own" });
  }

  /** Answer the business-type question, landing on #additional-products. */
  async function chooseBusinessType(businessType: string) {
    fireEvent.change(await screen.findByLabelText("Business type"), { target: { value: businessType } });
    fireEvent.click(screen.getByRole("button", { name: "Get BuildFlow" }));
    await screen.findByRole("heading", { name: "What additional products do you want to use?" });
  }

  /** Pick products and a plan, then continue — landing on the program HUD. */
  async function chooseProductsAndPlan(products: string[], plan: string) {
    for (const product of products) {
      const productCheckbox = await screen.findByLabelText(new RegExp(product));
      if (!(productCheckbox as HTMLInputElement).checked) {
        fireEvent.click(productCheckbox);
      }
    }
    fireEvent.click(screen.getByRole("button", { name: `Select ${plan} plan` }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to BuildFlow" }));
  }

  async function completeOnboarding({
    email = ACCOUNT.email,
    businessType = "Concrete",
    products = ["Map & Field Ops"],
    plan = "Pro"
  }: {
    email?: string;
    businessType?: string;
    products?: string[];
    plan?: "Free" | "Pro" | "Business" | "Enterprise";
  } = {}) {
    await signUp({ email });
    await chooseBusinessType(businessType);
    await chooseProductsAndPlan(products, plan);
    await screen.findByRole("heading", { name: GREETING });
    // Applying the business profile provisions the workspace, so bootstrap answers
    // with it from here on rather than with the pre-onboarding new-org payload.
    bootstrapPayload = businessProfilePayload;
    fireEvent.click(screen.getByRole("button", { name: "Open BuildFlow Dashboard" }));
    await screen.findByText("Weekly Production Schedule");
  }

  async function openMapFieldOps() {
    await signUp({ email: "route@buildflow.test" });
    await chooseBusinessType("Asphalt");
    await chooseProductsAndPlan(["Map & Field Ops"], "Business");
    fireEvent.click(await screen.findByRole("button", { name: "Open Map & Field Ops" }));
    fireEvent.click(await screen.findByRole("button", { name: "Skip Tutorial" }));
    await screen.findByRole("heading", { name: "Map & Field Ops" });
  }

  it("renders the welcome page first", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /^Where crews, projects, and schedules move together\.$/ })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Get BuildFlow$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Login from welcome navigation$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Join the waitlist from welcome navigation$/ })).toBeInTheDocument();
    expect(screen.getByText("See how BuildFlow works — a live product tour")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Preview the live demo$/ })).toBeInTheDocument();
  });

  it("opens the create account page from Get BuildFlow", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /^Get BuildFlow$/ }));

    expect(await screen.findByRole("heading", { name: "Create your workspace." })).toBeInTheDocument();
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toHaveAttribute("placeholder", "name@company.com");
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Microsoft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
    expect(screen.queryByText("Weekly Production Schedule")).not.toBeInTheDocument();
    expect(window.location.hash).toBe("#create-account");
  });

  it("switches between the signup and login forms", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /^Get BuildFlow$/ }));
    expect(await screen.findByRole("heading", { name: "Create your workspace." })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("heading", { name: "Welcome back." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    // Login only needs credentials — the signup-only fields are gone.
    expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create an account" }));

    expect(await screen.findByRole("heading", { name: "Create your workspace." })).toBeInTheDocument();
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
  });

  it("requires a password of at least 8 characters to create an account", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /^Get BuildFlow$/ }));
    fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: ACCOUNT.name } });
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: ACCOUNT.email } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Password must be at least 8 characters.");
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/api/auth/signup"))).toBe(false);
  });

  it("prompts for business type after registering a new workspace", async () => {
    render(<App />);

    await signUp();

    expect(await screen.findByRole("heading", { name: "What type of Business do you own" })).toBeInTheDocument();
    expect(screen.getByLabelText("Business type")).toBeInTheDocument();
    businessTypeOptions.forEach((businessType) => {
      expect(screen.getByRole("option", { name: businessType })).toBeInTheDocument();
    });
    expect(window.location.hash).toBe("#business-type");

    fireEvent.change(screen.getByLabelText("Business type"), { target: { value: "Roofing" } });
    fireEvent.click(screen.getByRole("button", { name: "Get BuildFlow" }));

    expect(await screen.findByRole("heading", { name: "What additional products do you want to use?" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#additional-products");
  });

  it("requires a plan and at least one additional product before entering BuildFlow", async () => {
    render(<App />);

    await signUp();
    await chooseBusinessType("Asphalt");

    expect(await screen.findByText("Map & Field Ops")).toBeInTheDocument();
    expect(screen.getByText("Track vehicles, equipment, and design traffic routes.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Free plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Pro plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Business plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Enterprise plan" })).toBeInTheDocument();

    const continueButton = screen.getByRole("button", { name: "Continue to BuildFlow" });
    expect(continueButton).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/Map & Field Ops/));
    expect(continueButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Select Business plan" }));
    expect(continueButton).toBeEnabled();
  });

  it("opens the selected programs HUD before applying the blank workspace", async () => {
    render(<App />);

    await signUp({ email: "ops@asphalt.test" });
    await chooseBusinessType("Asphalt");
    fireEvent.click(await screen.findByLabelText(/Map & Field Ops/));
    fireEvent.click(screen.getByLabelText(/Production Reports/));
    fireEvent.click(screen.getByRole("button", { name: "Select Business plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to BuildFlow" }));

    expect(await screen.findByRole("heading", { name: GREETING })).toBeInTheDocument();
    expect(window.location.hash).toBe("#program-hud");
    expect(screen.getByText("Asphalt workspace")).toBeInTheDocument();
    expect(screen.getByText("Business plan")).toBeInTheDocument();
    expect(screen.getByText("2 selected programs")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Product" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Solutions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resources" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Company" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AI" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open BuildFlow Schedule" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Dashboard app" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Map & Field Ops" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Production Reports" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Materials Readiness" })).not.toBeInTheDocument();
    expect(
      vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/api/business-profile"))
    ).toBe(false);
    expect(window.localStorage.getItem("buildflow.selectedPlan")).toBeNull();
    expect(window.localStorage.getItem("buildflow.selectedProducts")).toBeNull();
  });

  it("shows Map & Field Ops as a permanent HUD app even when it was not selected", async () => {
    render(<App />);

    await signUp({ email: "ops@asphalt.test" });
    await chooseBusinessType("Asphalt");
    fireEvent.click(await screen.findByLabelText(/Production Reports/));
    fireEvent.click(screen.getByRole("button", { name: "Select Business plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to BuildFlow" }));

    expect(await screen.findByRole("heading", { name: GREETING })).toBeInTheDocument();
    expect(screen.getByText("1 selected program")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open BuildFlow Schedule" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Map & Field Ops" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Production Reports" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Map & Field Ops" }));
    expect(await screen.findByRole("dialog", { name: "Your BuildFlow workspace is ready" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip Tutorial" }));

    expect(await screen.findByRole("heading", { name: "Map & Field Ops" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: /category sidebar/i })).not.toBeInTheDocument();
    expect(screen.getByText("No map routes yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open live map" })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("buildflow.selectedProducts") ?? "[]")).toEqual(["production-reports"]);
  });

  it("opens a blank workspace after the selected onboarding setup", async () => {
    render(<App />);

    await signUp({ email: "ops@asphalt.test" });
    await chooseBusinessType("Asphalt");
    fireEvent.click(await screen.findByLabelText(/Map & Field Ops/));
    fireEvent.click(screen.getByLabelText(/Production Reports/));
    fireEvent.click(screen.getByRole("button", { name: "Select Business plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to BuildFlow" }));
    expect(await screen.findByRole("heading", { name: GREETING })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open BuildFlow Dashboard" }));

    expect(await screen.findByRole("dialog", { name: "Your BuildFlow workspace is ready" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip Tutorial" }));
    expect(await screen.findByText("Weekly Production Schedule")).toBeInTheDocument();
    expect(screen.getByText("Asphalt workspace")).toBeInTheDocument();
    expect(window.localStorage.getItem("buildflow.businessType")).toBe("Asphalt");
    expect(window.localStorage.getItem("buildflow.selectedPlan")).toBe("business");
    expect(JSON.parse(window.localStorage.getItem("buildflow.selectedProducts") ?? "[]")).toEqual([
      "map-field-ops",
      "production-reports"
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/business-profile",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ businessType: "Asphalt" })
      })
    );
    expect(screen.getAllByText(/Business plan/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Selected products: Map & Field Ops, Production Reports/)).toBeInTheDocument();
    expect(screen.getByText("No jobs scheduled yet")).toBeInTheDocument();
    expect(screen.getByText("No jobs added yet")).toBeInTheDocument();
    expect(screen.getByText("No projects added yet")).toBeInTheDocument();
    expect(screen.queryByText("I-35 Asphalt Overlay")).not.toBeInTheDocument();
    expect(screen.queryByText("Mainline Milling")).not.toBeInTheDocument();
    expect(screen.queryByText("Paving Crew 2")).not.toBeInTheDocument();
    expect(screen.queryByText("HMA Surface Mix")).not.toBeInTheDocument();

    await openSchedule("Week");
    // Both the crew grid and the availability card report the empty workspace.
    expect((await screen.findAllByText("No crews created yet.")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Concrete Pump #2")).not.toBeInTheDocument();
    expect(screen.queryByText("Double-booked crew")).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /^Crews$/i }));
    expect(await screen.findByText("No crews added yet")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /^Materials$/i }));
    expect(await screen.findByText("No materials added yet")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: /^Map & Field Ops$/i })).not.toBeInTheDocument();
  });

  it("launches Map & Field Ops from the HUD into its dedicated program page", async () => {
    render(<App />);

    await signUp({ email: "ops@asphalt.test" });
    await chooseBusinessType("Asphalt");
    fireEvent.click(await screen.findByLabelText(/Map & Field Ops/));
    fireEvent.click(screen.getByRole("button", { name: "Select Business plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to BuildFlow" }));

    expect(await screen.findByRole("heading", { name: GREETING })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open BuildFlow Schedule" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Map & Field Ops" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Production Reports" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Map & Field Ops" }));

    expect(await screen.findByRole("dialog", { name: "Your BuildFlow workspace is ready" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip Tutorial" }));
    expect(await screen.findByRole("heading", { name: "Map & Field Ops" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: /category sidebar/i })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("buildflow.businessType")).toBe("Asphalt");
    expect(window.localStorage.getItem("buildflow.selectedPlan")).toBe("business");
    expect(JSON.parse(window.localStorage.getItem("buildflow.selectedProducts") ?? "[]")).toEqual(["map-field-ops"]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/business-profile",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ businessType: "Asphalt" })
      })
    );
    expect(screen.getByText("No map routes yet")).toBeInTheDocument();
    expect(screen.getByText("No active jobs on map")).toBeInTheDocument();
    expect(screen.getByText("No route data yet")).toBeInTheDocument();
    expect(screen.getByText("No fuel data yet")).toBeInTheDocument();
    expect(screen.queryByText("32.4 mi")).not.toBeInTheDocument();
    expect(screen.queryByText("18.6 gal")).not.toBeInTheDocument();
  });

  it("keeps the optimized plan and a truck route from clobbering each other", async () => {
    // Populate the workspace (business-profile returns data) and answer the
    // trucker geocode + routing lookups so the full flow can run offline.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("nominatim.openstreetmap.org")) {
          return new Response(
            JSON.stringify([
              { display_name: "500 Congress Ave, Austin, TX 78701", name: "500 Congress Ave", lat: "30.2685", lon: "-97.7420" }
            ]),
            { status: 200 }
          );
        }
        if (url.includes("router.project-osrm.org")) {
          return new Response(
            JSON.stringify({
              routes: [
                {
                  distance: 8046.7,
                  duration: 900,
                  geometry: { coordinates: [[-97.7431, 30.2672], [-97.742, 30.2685]] }
                }
              ]
            }),
            { status: 200 }
          );
        }
        return respondToBuildflowApi(input);
      })
    );
    // The router has nothing to plan across on a blank workspace.
    businessProfilePayload = bootstrapFixture;

    render(<App />);

    await openMapFieldOps();

    // Stats are derived from the real geometry, not placeholders.
    expect(screen.queryByText("No route data yet")).not.toBeInTheDocument();
    const driveTimeLabel = screen.getByText("Estimated total drive time");
    const readDriveTime = () => driveTimeLabel.parentElement?.querySelector("strong")?.textContent ?? "";
    const fastestTime = readDriveTime();
    expect(fastestTime).toMatch(/\d/);
    expect(screen.getByText(/drive time vs current routes/)).toBeInTheDocument();

    // The optimization goal actually moves the numbers.
    fireEvent.click(screen.getByRole("button", { name: "Least Fuel" }));
    expect(await screen.findByText(/fuel burn vs current routes/)).toBeInTheDocument();
    expect(readDriveTime()).not.toEqual(fastestTime);

    // Persist the optimized plan.
    fireEvent.click(screen.getByRole("button", { name: "Optimize Routes" }));
    expect(await screen.findByRole("button", { name: "Optimized" })).toBeInTheDocument();

    // A truck route must coexist with the plan, not replace it.
    fireEvent.change(screen.getByLabelText("Trucker destination address"), {
      target: { value: "500 Congress Ave, Austin, TX" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Traffic Route" }));

    expect(await screen.findByText("Fastest truck route")).toBeInTheDocument();
    // This note only renders when the optimized plan survived alongside the truck route.
    expect(
      screen.getByText("Your optimized plan is saved underneath — clear this route to return to it.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Optimized" })).toBeInTheDocument();

    // Clearing the truck route drops it back to the preserved plan.
    fireEvent.click(screen.getByRole("button", { name: /Clear/ }));
    await waitFor(() => expect(screen.queryByText("Fastest truck route")).not.toBeInTheDocument());
    expect(
      screen.queryByText("Your optimized plan is saved underneath — clear this route to return to it.")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Optimized" })).toBeInTheDocument();
  });

  it("suggests trucker destination addresses as the user types", async () => {
    let nominatimCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("nominatim.openstreetmap.org")) {
          nominatimCalls += 1;
          return new Response(
            JSON.stringify([
              {
                display_name: "1 Old Ferry Road, Bristol, Rhode Island, 02809, United States",
                lat: "41.6712",
                lon: "-71.2662",
                address: { house_number: "1", road: "Old Ferry Road", city: "Bristol", state: "Rhode Island", postcode: "02809", country: "United States" }
              },
              {
                display_name: "1 Old Farm Road, Berkley, Massachusetts, 02779, United States",
                lat: "41.8501",
                lon: "-71.0851",
                address: { house_number: "1", road: "Old Farm Road", town: "Berkley", state: "Massachusetts", postcode: "02779", country: "United States" }
              }
            ]),
            { status: 200 }
          );
        }
        return respondToBuildflowApi(input);
      })
    );

    render(<App />);
    await openMapFieldOps();

    const input = screen.getByLabelText("Trucker destination address") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1 old" } });

    // The debounced autocomplete surfaces matching addresses with a two-line label.
    expect(await screen.findByText("1 Old Ferry Road")).toBeInTheDocument();
    expect(screen.getByText("Bristol, Rhode Island")).toBeInTheDocument();
    expect(screen.getByText("1 Old Farm Road")).toBeInTheDocument();
    expect(nominatimCalls).toBeGreaterThan(0);

    // Choosing a suggestion fills the field and dismisses the list.
    fireEvent.click(screen.getByText("1 Old Ferry Road"));
    expect(input.value).toContain("1 Old Ferry Road");
    await waitFor(() => expect(screen.queryByText("1 Old Farm Road")).not.toBeInTheDocument());
  });

  it("routes to a picked suggestion without re-geocoding it", async () => {
    let addressSearchCalls = 0;
    let routingCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("nominatim.openstreetmap.org")) {
          addressSearchCalls += 1;
          return new Response(
            JSON.stringify([
              {
                display_name: "1 Old Ferry Road, Bristol, Rhode Island, 02809, United States",
                lat: "41.6712",
                lon: "-71.2662",
                address: { house_number: "1", road: "Old Ferry Road", city: "Bristol", state: "Rhode Island" }
              }
            ]),
            { status: 200 }
          );
        }
        if (url.includes("router.project-osrm.org")) {
          routingCalls += 1;
          return new Response(
            JSON.stringify({
              routes: [
                { distance: 8046.7, duration: 900, geometry: { coordinates: [[-97.7431, 30.2672], [-71.2662, 41.6712]] } }
              ]
            }),
            { status: 200 }
          );
        }
        return respondToBuildflowApi(input);
      })
    );

    render(<App />);
    await openMapFieldOps();

    const input = screen.getByLabelText("Trucker destination address") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1 Old Ferry" } });
    fireEvent.click(await screen.findByText("1 Old Ferry Road"));
    const searchesAfterPick = addressSearchCalls;

    fireEvent.click(screen.getByRole("button", { name: "Create Traffic Route" }));

    const card = (await screen.findByText("Fastest truck route")).closest("article") as HTMLElement;
    expect(card).not.toBeNull();
    expect(within(card).getByText("1 Old Ferry Road")).toBeInTheDocument();
    // The picked coordinates are reused, so no extra geocode lookup fires — only routing.
    expect(addressSearchCalls).toEqual(searchesAfterPick);
    expect(routingCalls).toBeGreaterThan(0);
  });

  it("labels map pins by role (jobsite, crew, and fleet)", async () => {
    // Crew and fleet pins only exist where there are crews and equipment to pin.
    businessProfilePayload = bootstrapFixture;

    render(<App />);
    await openMapFieldOps();

    // Jobsite pins carry a role chip — one per site on the map.
    expect(screen.getAllByText("Jobsite").length).toBeGreaterThan(0);

    // Crew pin shows the crew name alongside a "Crew" tag.
    const crewPin = screen.getByRole("button", { name: "Filter to Concrete Crew 1" });
    expect(within(crewPin).getByText("Crew")).toBeInTheDocument();
    expect(within(crewPin).getByText("Concrete Crew 1")).toBeInTheDocument();

    // Fleet/vehicle pin is labelled too.
    const fleetPin = screen.getByRole("button", { name: "Show fleet vehicle tracking" });
    expect(within(fleetPin).getByText("Truck")).toBeInTheDocument();
    expect(within(fleetPin).getByText("Fleet")).toBeInTheDocument();
  });

  it("shows related actions for the Field Updates & DelayIQs program landing", async () => {
    render(<App />);

    await signUp({ email: "field@asphalt.test" });
    await chooseBusinessType("Asphalt");
    fireEvent.click(await screen.findByLabelText(/Field Updates & DelayIQs/));
    fireEvent.click(screen.getByRole("button", { name: "Select Business plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to BuildFlow" }));

    expect(await screen.findByRole("heading", { name: GREETING })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Field Updates & DelayIQs" }));
    expect(await screen.findByRole("dialog", { name: "Your BuildFlow workspace is ready" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip Tutorial" }));

    expect(await screen.findByRole("heading", { name: "Field Updates & DelayIQs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open field updates" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open DelayIQ Management" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open DelayIQ Management" }));
    expect(await screen.findByRole("heading", { name: "Stay ahead of the slip." })).toBeInTheDocument();
  });

  it("shows related actions for the Equipment Tracking program landing", async () => {
    render(<App />);

    await signUp({ email: "equipment@asphalt.test" });
    await chooseBusinessType("Asphalt");
    fireEvent.click(await screen.findByLabelText(/Equipment Tracking/));
    fireEvent.click(screen.getByRole("button", { name: "Select Business plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to BuildFlow" }));

    expect(await screen.findByRole("heading", { name: GREETING })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Equipment Tracking" }));
    expect(await screen.findByRole("dialog", { name: "Your BuildFlow workspace is ready" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip Tutorial" }));

    expect(await screen.findByRole("heading", { name: "Equipment Tracking" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open equipment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Map & Field Ops" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Map & Field Ops" }));
    expect(await screen.findByText("No map routes yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open live map" })).not.toBeInTheDocument();
  });

  it("returns from a program landing page to the HUD icon page", async () => {
    render(<App />);

    await signUp({ email: "hud@asphalt.test" });
    await chooseBusinessType("Asphalt");
    fireEvent.click(await screen.findByLabelText(/Map & Field Ops/));
    fireEvent.click(screen.getByRole("button", { name: "Select Business plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to BuildFlow" }));

    expect(await screen.findByRole("heading", { name: GREETING })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Map & Field Ops" }));
    expect(await screen.findByRole("dialog", { name: "Your BuildFlow workspace is ready" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip Tutorial" }));
    expect(await screen.findByRole("heading", { name: "Map & Field Ops" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open HUD" }));

    expect(await screen.findByRole("heading", { name: GREETING })).toBeInTheDocument();
    expect(window.location.hash).toBe("#program-hud");
    expect(screen.getByRole("button", { name: "Open BuildFlow Schedule" })).toBeInTheDocument();
  });

  it("shows HUD recovery when setup selections are missing", async () => {
    window.history.pushState(null, "", "/#program-hud");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Finish setup first" })).toBeInTheDocument();
    expect(screen.getByText("Your BuildFlow HUD")).toBeInTheDocument();
    expect(screen.getByText("Select a business type, plan, and at least one program before opening BuildFlow.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return to additional products" })).toBeInTheDocument();
    expect(
      vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/api/business-profile"))
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Return to additional products" }));
    expect(await screen.findByRole("heading", { name: "What additional products do you want to use?" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#additional-products");
  });

  it("starts a personalized tutorial after onboarding with selected-product lessons", async () => {
    render(<App />);

    await completeOnboarding({
      email: "ops@asphalt.test",
      businessType: "Asphalt",
      products: ["Map & Field Ops", "Production Reports"],
      plan: "Business"
    });

    expect(await screen.findByRole("dialog", { name: "Your BuildFlow workspace is ready" })).toBeInTheDocument();
    expect(screen.getByText(/BuildFlow is set up for Asphalt on the Business plan with Map & Field Ops, Production Reports/)).toBeInTheDocument();
    expect(screen.getByText("Map & Field Ops lesson")).toBeInTheDocument();
    expect(screen.getByText("Production Reports lesson")).toBeInTheDocument();
    expect(screen.queryByText("Materials Readiness lesson")).not.toBeInTheDocument();
  });

  it("stores skipped tutorials by setup and does not auto-repeat the same setup", async () => {
    const view = render(<App />);

    await completeOnboarding({
      email: "ops@asphalt.test",
      businessType: "Asphalt",
      products: ["Map & Field Ops", "Production Reports"],
      plan: "Business"
    });
    fireEvent.click(await screen.findByRole("button", { name: "Skip Tutorial" }));

    expect(window.localStorage.getItem("buildflow.tutorial.status:asphalt--business--map-field-ops+production-reports")).toBe("skipped");
    expect(screen.queryByRole("dialog", { name: "Your BuildFlow workspace is ready" })).not.toBeInTheDocument();

    view.unmount();
    render(<App />);
    await completeOnboarding({
      email: "ops@asphalt.test",
      businessType: "Asphalt",
      products: ["Map & Field Ops", "Production Reports"],
      plan: "Business"
    });

    expect(screen.queryByRole("dialog", { name: "Your BuildFlow workspace is ready" })).not.toBeInTheDocument();
  });

  it("restarts the tutorial from the top bar", async () => {
    render(<App />);
    await completeOnboarding();
    fireEvent.click(await screen.findByRole("button", { name: "Skip Tutorial" }));

    fireEvent.click(screen.getByRole("button", { name: "Help and tutorial" }));

    expect(await screen.findByRole("dialog", { name: "Your BuildFlow workspace is ready" })).toBeInTheDocument();
  });

  it("keeps the crew tutorial gate locked until a crew is created", async () => {
    const newCrew = {
      ...bootstrapFixture.crews[0],
      id: "crew-tutorial-1",
      name: "Tutorial Crew 1",
      specialty: "Training",
      lead: "Jordan Lee",
      laborMix: [
        { category: "Labor" as const, role: "Laborers", count: 2 },
        { category: "Operator" as const, role: "Dozer Operator", count: 1 }
      ]
    };
    let crewCreated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/crews") {
        crewCreated = true;
        expect(options?.method).toBe("POST");
        return new Response(JSON.stringify(newCrew), { status: 201 });
      }
      if (crewCreated && url.includes("/api/bootstrap")) {
        return new Response(JSON.stringify({ ...bootstrapPayload, crews: [...bootstrapPayload.crews, newCrew] }), { status: 200 });
      }
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await completeOnboarding();

    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: "Create a crew" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    fireEvent.click(await screen.findByRole("button", { name: "Add Crew" }));
    expect(await screen.findByRole("dialog", { name: "Add Crew" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("heading", { name: "Save the new crew" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.change(await screen.findByLabelText("Crew Name"), { target: { value: "Tutorial Crew 1" } });
    fireEvent.change(screen.getByLabelText("Specialty/Type"), { target: { value: "Training" } });
    fireEvent.change(screen.getByLabelText("Foreman"), { target: { value: "Jordan Lee" } });
    fireEvent.change(screen.getByLabelText("Count for role 1"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Role for role 2"), { target: { value: "Dozer Operator" } });
    const addCrewButtons = screen.getAllByRole("button", { name: "Add Crew" });
    fireEvent.click(addCrewButtons[addCrewButtons.length - 1]);

    expect(await screen.findByText("Tutorial Crew 1")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
  });

  it("keeps the schedule job tutorial gate locked until a job is created and assigned", async () => {
    const newCrew = {
      ...bootstrapFixture.crews[0],
      id: "crew-tutorial-1",
      name: "Tutorial Crew 1",
      specialty: "Training",
      lead: "Jordan Lee"
    };
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
      // The tutorial schedules onto the crew it just created — the only one in a
      // freshly provisioned workspace.
      crewId: newCrew.id,
      date: "2026-06-16",
      status: "Planned" as const,
      conflicts: []
    };
    let crewCreated = false;
    let jobCreated = false;
    let assignmentCreated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/crews") {
        crewCreated = true;
        return new Response(JSON.stringify(newCrew), { status: 201 });
      }
      if (url === "/api/jobs") {
        jobCreated = true;
        expect(options?.method).toBe("POST");
        return new Response(JSON.stringify(createdJob), { status: 201 });
      }
      if (url === "/api/schedule/assign") {
        assignmentCreated = true;
        expect(options?.method).toBe("POST");
        return new Response(JSON.stringify(scheduledAssignment), { status: 201 });
      }
      if (url.includes("/api/bootstrap")) {
        return new Response(
          JSON.stringify({
            ...bootstrapPayload,
            crews: crewCreated ? [...bootstrapPayload.crews, newCrew] : bootstrapPayload.crews,
            jobs: jobCreated ? [...bootstrapPayload.jobs, createdJob] : bootstrapPayload.jobs,
            assignments: assignmentCreated ? [...bootstrapPayload.assignments, scheduledAssignment] : bootstrapPayload.assignments
          }),
          { status: 200 }
        );
      }
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);
    // A job has to belong to a project, and its location defaults from one, so this
    // tutorial needs a workspace that was provisioned with a project — the crew and
    // job are still the tutorial's to create.
    businessProfilePayload = { ...blankWorkspaceFixture, projects: bootstrapFixture.projects };

    render(<App />);
    await completeOnboarding();

    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Crew" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(await screen.findByLabelText("Crew Name"), { target: { value: "Tutorial Crew 1" } });
    fireEvent.change(screen.getByLabelText("Specialty/Type"), { target: { value: "Training" } });
    fireEvent.change(screen.getByLabelText("Foreman"), { target: { value: "Jordan Lee" } });
    const addCrewButtons = screen.getAllByRole("button", { name: "Add Crew" });
    fireEvent.click(addCrewButtons[addCrewButtons.length - 1]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: "Read the schedule board" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("heading", { name: "Add a job to the schedule" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    // The tutorial lands on the schedule but not on a particular view; the per-cell
    // Add job buttons it points at only exist on the Week board.
    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    // Onboarding provisions an empty workspace, so the crew made above is the only one.
    fireEvent.click(await screen.findByRole("button", { name: "Add job to Tutorial Crew 1 on Jun 16" }));
    expect(await screen.findByRole("dialog", { name: "Add job to schedule" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("heading", { name: "Create and schedule the job" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Job Name"), { target: { value: "Tutorial Schedule Job" } });
    fireEvent.change(screen.getByLabelText("Phase"), { target: { value: "Training Phase" } });
    fireEvent.change(screen.getByLabelText("Labor"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Created during the tutorial." } });
    fireEvent.click(screen.getByRole("button", { name: "Create & Schedule Job" }));

    // The gate opens only once the job is both created and assigned.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/jobs", expect.objectContaining({ method: "POST" })));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/schedule/assign", expect.objectContaining({ method: "POST" }))
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
    expect((await screen.findAllByText("Tutorial Schedule Job")).length).toBeGreaterThan(0);
  });

  it("opens the welcome category dropdowns", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Product" }));

    expect(screen.getByRole("menu", { name: "Product menu" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Crew Scheduling" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Map & Field Ops" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Production Reports" })).toBeInTheDocument();

    // The plans live in their own menu, not under Product.
    fireEvent.click(screen.getByRole("button", { name: "Plans" }));

    expect(screen.getByRole("menu", { name: "Plans menu" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Free" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Pro" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Business" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Enterprise" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Company" }));

    expect(screen.getByRole("menu", { name: "Company menu" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "About BuildFlow" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Contact Sales" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "AI" }));

    expect(screen.getByRole("menu", { name: "AI menu" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /BuildFlow AI/ })).toBeInTheDocument();
    expect(screen.getByText("AI tools for work")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Schedule AI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Readiness AI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Field AI" })).not.toBeInTheDocument();
    expect(screen.getByText("Weather Integration")).toBeInTheDocument();
    expect(screen.getByText("Schedule Suggestions")).toBeInTheDocument();
    expect(screen.getByText("Route Optimization")).toBeInTheDocument();
  });

  it("opens the Free plan page from the plans menu", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Plans" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Free" }));

    expect(await screen.findByRole("heading", { name: "Try BuildFlow for free." })).toBeInTheDocument();
    expect(
      screen.getByText("Experience BuildFlow without a subscription — a 14-day demo of crews, jobs, materials, and exports.")
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("#free-plan");
  });

  it("opens the Schedule AI page from the BuildFlow AI menu item", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "AI" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /BuildFlow AI/ }));

    expect(await screen.findByRole("heading", { level: 1, name: "Schedule AI that thinks a day ahead." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Everything Schedule AI should do." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Spot conflicts before they cost a day" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rank ready work automatically" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Draft recovery plans in seconds" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#buildflow-ai");
  });

  it("opens the Schedule AI page from the BuildFlow AI direct hash route", async () => {
    window.history.pushState(null, "", "/#buildflow-ai");
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Schedule AI that thinks a day ahead." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "An always-on planning assistant." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AI that protects the day, with humans in charge." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Keep humans in control" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Let Schedule AI prep the next plan." })).toBeInTheDocument();
  });

  it.each([
    [
      "Field Updates & DelayIQs",
      "#solutions-field-updates-delayIQs",
      "A clean field log for progress, photos, delayIQ causes, and recovery steps.",
      "Bring field notes in, then turn delayIQs into accountable recovery work."
    ],
    [
      "Map & Field Ops",
      "#solutions-map-field-ops",
      "A clean field map for routes, crew proximity, site access, and dispatch decisions.",
      "Bring locations in, then plan routes from one live workspace."
    ],
    [
      "Reports",
      "#solutions-reports",
      "A clean reporting workspace for schedule variance, bottlenecks, backlog, and crew demand.",
      "Bring schedule history in, then publish reporting from one live workspace."
    ]
  ])("opens the %s solution page from the direct hash route", async (pageTitle, hash, featureHeading, migrationHeading) => {
    window.history.pushState(null, "", `/${hash}`);
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: pageTitle })).toBeInTheDocument();
    expect(screen.getByText(featureHeading)).toBeInTheDocument();
    expect(screen.getByText(migrationHeading)).toBeInTheDocument();
    expect(window.location.hash).toBe(hash);
  });

  it("opens the Schedule solution page from the direct hash route", async () => {
    window.history.pushState(null, "", "/#solutions-schedule");
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Schedule" })).toBeInTheDocument();
    expect(screen.getByText("A clean production board for crews, jobs, blockers, and handoffs.")).toBeInTheDocument();
    expect(screen.getByText("Weekly Production Schedule")).toBeInTheDocument();
    expect(screen.getByText("Bring the old schedule in, then plan from one live workspace.")).toBeInTheDocument();
  });

  it("opens the Startups business size page from the direct hash route", async () => {
    window.history.pushState(null, "", "/#solutions-startups");
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "One workspace. Every startup tool." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Move faster, cut scheduling costs." })).toBeInTheDocument();
    expect(screen.getByText("The tool of choice for startups.")).toBeInTheDocument();
    expect(screen.getByText("Join our partner network alongside top VCs and accelerators.")).toBeInTheDocument();
    expect(screen.getByText("Questions & answers")).toBeInTheDocument();
  });

  it.each([
    [
      "#solutions-small-businesses",
      "One workspace. Every small business tool.",
      "The tool of choice for small businesses.",
      "Run with the same structure growing contractors use.",
      "Build and run your small business with one workspace.",
      "QuickBooks"
    ],
    [
      "#solutions-enterprise",
      "One workspace. Every enterprise tool.",
      "The tool of choice for enterprise teams.",
      "Connect enterprise planning with trusted operating systems.",
      "Scale enterprise operations with one workspace.",
      "Microsoft"
    ]
  ])(
    "opens the %s business size page from the direct hash route",
    async (hash, heading, choiceHeading, partnerHeading, useCasesHeading, partnerLogo) => {
      window.history.pushState(null, "", `/${hash}`);
      render(<App />);

      expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: choiceHeading })).toBeInTheDocument();
      expect(screen.getByText(partnerHeading)).toBeInTheDocument();
      expect(screen.getByText(useCasesHeading)).toBeInTheDocument();
      expect(screen.getByText(partnerLogo)).toBeInTheDocument();
      expect(screen.getByText("Questions & answers")).toBeInTheDocument();
    }
  );

  it("updates the Startups savings totals when calculator tools are toggled", async () => {
    window.history.pushState(null, "", "/#solutions-startups");
    render(<App />);

    const crewScheduling = await screen.findByLabelText(/Crew scheduling/);

    expect(crewScheduling).toBeChecked();
    expect(screen.getByText("$2,470")).toBeInTheDocument();
    expect(screen.getByText("$29,640")).toBeInTheDocument();

    fireEvent.click(crewScheduling);

    expect(crewScheduling).not.toBeChecked();
    expect(screen.queryByText("$2,470")).not.toBeInTheDocument();
    expect(screen.getByText("$2,080")).toBeInTheDocument();
    expect(screen.getByText("$24,960")).toBeInTheDocument();

    fireEvent.click(crewScheduling);

    expect(crewScheduling).toBeChecked();
    expect(screen.getByText("$2,470")).toBeInTheDocument();
    expect(screen.getByText("$29,640")).toBeInTheDocument();
  });

  it.each([
    [
      "#solutions-field-updates-delayIQs",
      "Field Updates & DelayIQs",
      "Cause tracking"
    ],
    [
      "#solutions-map-field-ops",
      "Map & Field Ops",
      "Travel windows"
    ],
    [
      "#solutions-reports",
      "Reports",
      "Schedule variance"
    ]
  ])("opens the %s solution page from the direct hash route", async (hash, heading, feature) => {
    window.history.pushState(null, "", `/${hash}`);
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByText(feature)).toBeInTheDocument();
  });

  it.each([
    ["Pro", "#pro-plan", "Run BuildFlow Pro."],
    ["Business", "#business-plan", "Scale with BuildFlow Business."],
    ["Enterprise", "#enterprise-plan", "Customize BuildFlow Enterprise."]
  ])("opens the %s plan page from the plans menu", async (planName, hash, heading) => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Plans" }));
    fireEvent.click(screen.getByRole("menuitem", { name: planName }));

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(window.location.hash).toBe(hash);
  });

  it("routes the product hash to the Free plan page", async () => {
    window.history.pushState(null, "", "/#product");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Try BuildFlow for free." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Free" })).toBeInTheDocument();
  });

  it.each([
    ["Pro", "#pro-plan", "Run BuildFlow Pro."],
    ["Business", "#business-plan", "Scale with BuildFlow Business."],
    ["Enterprise", "#enterprise-plan", "Customize BuildFlow Enterprise."]
  ])("opens the %s plan page from the direct hash route", async (_planName, hash, heading) => {
    window.history.pushState(null, "", `/${hash}`);
    render(<App />);

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("lists the plan's features on the Free plan page", async () => {
    window.history.pushState(null, "", "/#free-plan");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Try BuildFlow for free." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Plan includes" })).toBeInTheDocument();

    // Each "Label: detail" feature renders as a label/detail pair, not one string.
    expect(screen.getByText("Production Calendar")).toBeInTheDocument();
    expect(
      screen.getByText("basic calendar view for scheduled jobs, work orders, and production dates")
    ).toBeInTheDocument();
    expect(screen.getByText("Limited Users")).toBeInTheDocument();
    expect(screen.getByText("5 users included")).toBeInTheDocument();
    expect(screen.getByText("Trial Limits")).toBeInTheDocument();
    expect(screen.getByText("limited number of jobs, users, resources, and historical data")).toBeInTheDocument();
  });

  it.each([
    ["#free-plan", /^Start free demo/],
    ["#pro-plan", /^Start Pro demo/],
    ["#business-plan", /^Start Business demo/],
    ["#enterprise-plan", /^Start Enterprise demo/]
  ])("starts registration from the %s page", async (hash, buttonName) => {
    window.history.pushState(null, "", `/${hash}`);
    render(<App />);

    fireEvent.click((await screen.findAllByRole("button", { name: buttonName }))[0]);

    // The plan CTAs register first — the workspace is created after signup, not before.
    expect(await screen.findByRole("heading", { name: "Create your workspace." })).toBeInTheDocument();
    expect(window.location.hash).toBe("#create-account");
  });

  it("opens the updates page from the resources menu", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Resources" }));
    expect(screen.queryByRole("menuitem", { name: "Schedule Templates" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Updates" }));

    expect(await screen.findByRole("heading", { name: "What is new in production scheduling." })).toBeInTheDocument();
    // The release version is its own tag now, not a prefix on the title.
    expect(screen.getByRole("heading", { name: "Readiness rules now shape the weekly board" })).toBeInTheDocument();
    // Every published update is credited to the same author.
    expect(screen.getAllByText("Liam Santos")).toHaveLength(6);
    expect(screen.getAllByText("CEO")).toHaveLength(6);
    expect(screen.queryByText("Field Guides")).not.toBeInTheDocument();
  });

  it("opens the customer reviews page from the resources menu", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Resources" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Customer Reviews" }));

    expect(await screen.findByRole("heading", { name: "Production plans that stay ready." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Teams that build on BuildFlow." })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Riverside runs its concrete weeks from one BuildFlow schedule" })
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("#customer-reviews");
  });

  it("opens the customer reviews page from the direct hash route", async () => {
    window.history.pushState(null, "", "/#customer-reviews");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Production plans that stay ready." })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Filter customer reviews" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "What is new in production scheduling." })).not.toBeInTheDocument();
  });

  it("opens the help center page from the resources menu", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Resources" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Help Center" }));

    expect(await screen.findByRole("heading", { name: "Hi, how can we help you?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Popular topics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "BuildFlow Academy" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#help-center");
  });

  it("opens the help center page from the direct hash route", async () => {
    window.history.pushState(null, "", "/#help-center");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Hi, how can we help you?" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search for anything...")).toBeInTheDocument();
    expect(screen.getByText("Still have questions?")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Customers" })).not.toBeInTheDocument();
  });

  it("returns to the welcome home page when the BuildFlow brand is clicked", async () => {
    window.history.pushState(null, "", "/#updates");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "What is new in production scheduling." })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^BuildFlow$/ }));

    expect(
      await screen.findByRole("heading", { name: /^Where crews, projects, and schedules move together\.$/ })
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(screen.queryByText("Weekly Production Schedule")).not.toBeInTheDocument();
  });


  // The guided demo player sits on the overview pages now, not the welcome home.
  it("toggles the guided demo playback on the product overview", async () => {
    window.history.pushState(null, "", "/#overview");
    render(<App />);

    const pauseButton = await screen.findByRole("button", { name: "Pause demo" });
    fireEvent.click(pauseButton);

    expect(screen.getByRole("button", { name: "Play demo" })).toBeInTheDocument();
  });

  it("switches guided demo scenes manually on the product overview", async () => {
    window.history.pushState(null, "", "/#overview");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Open Schedule demo" }));

    expect(screen.getByText("Drag work onto the right crew")).toBeInTheDocument();
    expect(screen.getByText("Conflict warning")).toBeInTheDocument();
  });

  it("opens the dashboard from the welcome page", async () => {
    render(<App />);

    await enterDashboard();

    expect(screen.getByText("Today's Jobs")).toBeInTheDocument();
    expect(screen.getByText("Weekly Production Schedule")).toBeInTheDocument();
    expect(screen.getAllByText("Riverside Office Building")[0]).toBeInTheDocument();
    expect(screen.queryByText("Weather Impact Alerts")).not.toBeInTheDocument();
  });

  it("shows weather impact alerts only when disruptive weather overlaps an active job", async () => {
    const weatherImpactedFixture = {
      ...bootstrapFixture,
      jobs: bootstrapFixture.jobs.map((job) =>
        job.id === "j-riverside-concrete"
          ? {
              ...job,
              endDate: "2026-06-18"
            }
          : job
      )
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(weatherImpactedFixture), { status: 200 }))
    );
    render(<App />);

    await enterDashboard();

    expect(screen.getByText("Weather Impact Alerts")).toBeInTheDocument();
    expect(screen.getByText("Heavy rain expected")).toBeInTheDocument();
    expect(screen.getByText("1 active job(s) may be impacted")).toBeInTheDocument();
  });


  it("opens live feed panels from the dashboard KPI cards", async () => {
    render(<App />);

    await enterDashboard();

    const todaysJobsCard = screen.getByRole("button", { name: /Today's Jobs/ });
    expect(todaysJobsCard).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(todaysJobsCard);

    expect(todaysJobsCard).toHaveAttribute("aria-expanded", "true");
    const jobsFeed = screen.getByRole("region", { name: "Today's Jobs live feed" });
    expect(within(jobsFeed).getByRole("heading", { name: "Today's Jobs" })).toBeInTheDocument();
    expect(within(jobsFeed).getByText("Riverside Office Building")).toBeInTheDocument();
    expect(within(jobsFeed).getByText("Downtown Retail Buildout")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Equipment In Use/ }));

    const equipmentFeed = screen.getByRole("region", { name: "Equipment In Use live feed" });
    expect(within(equipmentFeed).getByRole("heading", { name: "Equipment In Use" })).toBeInTheDocument();
    expect(within(equipmentFeed).getByText("Concrete Pump #2")).toBeInTheDocument();
    expect(within(equipmentFeed).getByText("Pump · Riverside Office Building · Concrete - Level 3 Slab")).toBeInTheDocument();
  });

  it("opens recent BuildFlow activity from the notifications bell", async () => {
    render(<App />);

    await enterDashboard();

    const accountButton = screen.getByRole("button", { name: "liam santos account" });
    const notificationsButton = screen.getByRole("button", { name: "Notifications" });
    const hudButton = screen.getByRole("button", { name: "Open HUD" });

    // Topbar order: HUD, then notifications, then the account control.
    expect(hudButton.compareDocumentPosition(notificationsButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notificationsButton.compareDocumentPosition(accountButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(notificationsButton);

    expect(screen.getByRole("region", { name: "Recent BuildFlow activity" })).toBeInTheDocument();
    expect(screen.getByText("Field update posted")).toBeInTheDocument();
    expect(screen.getByText(/Steel framing installation progressing/)).toBeInTheDocument();
    expect(screen.getByText("Weather alert added")).toBeInTheDocument();
    expect(screen.getByText("Schedule assignment updated")).toBeInTheDocument();
  });

  it("opens the HUD page from the topbar icon", async () => {
    render(<App />);

    await enterDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Open HUD" }));

    // Signing in doesn't pick programs, so the HUD opens on its setup-recovery screen.
    expect(await screen.findByRole("heading", { name: "Finish setup first" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#program-hud");
  });

  it("opens the schedule from the welcome page demo link", async () => {
    render(<App />);

    // "Preview the live demo" is the credential-free way into the product; the
    // welcome page's "Login" CTA now opens the login form instead.
    fireEvent.click(await screen.findByRole("button", { name: /^Preview the live demo$/ }));

    expect(await screen.findByRole("heading", { name: "Assign the week, in minutes." })).toBeInTheDocument();
    expect(screen.getByText("Downtown Retail Buildout")).toBeInTheDocument();
  });

  it("renders Field Updates with the crew-style directory layout", async () => {
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Field Updates$/i }));

    expect(await screen.findByRole("heading", { name: "From the field, in real time." })).toBeInTheDocument();
    expect(screen.getByText("Total Updates")).toBeInTheDocument();
    expect(screen.getAllByText("On Site").length).toBeGreaterThan(0);
    expect(screen.getByText("With Photos")).toBeInTheDocument();
    expect(screen.getByLabelText("Search field updates")).toBeInTheDocument();
    expect(screen.getByText("Steel framing installation progressing.")).toBeInTheDocument();
    expect(screen.getAllByText("Riverside Office Building").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Add Field Update" })[0]).toBeEnabled();
    expect(screen.getByLabelText("Field update project")).toBeInTheDocument();
    expect(screen.getByLabelText("Field update job")).toBeInTheDocument();
  });

  it("creates a field update from the Field Updates form", async () => {
    const newUpdate = {
      id: "fu-new",
      projectId: "p-riverside",
      jobId: "j-riverside-concrete",
      userId: "u-matt",
      message: "Crew poured west stair landing and uploaded notes.",
      status: "On Site",
      createdAt: "2026-06-25T14:30:00.000Z",
      photos: []
    };
    let fieldUpdateCreated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/field-updates") {
        fieldUpdateCreated = true;
        expect(options?.method).toBe("POST");
        expect(JSON.parse(String(options?.body))).toMatchObject({
          projectId: "p-riverside",
          jobId: "j-riverside-concrete",
          userId: "u-matt",
          message: "Crew poured west stair landing and uploaded notes.",
          status: "On Site"
        });
        return new Response(JSON.stringify(newUpdate), { status: 201 });
      }
      return new Response(
        JSON.stringify(
          fieldUpdateCreated
            ? { ...bootstrapFixture, fieldUpdates: [newUpdate, ...bootstrapFixture.fieldUpdates] }
            : bootstrapFixture
        ),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Field Updates$/i }));
    fireEvent.change(screen.getByLabelText("Field update project"), { target: { value: "p-riverside" } });
    fireEvent.change(screen.getByLabelText("Field update job"), { target: { value: "j-riverside-concrete" } });
    fireEvent.change(screen.getByLabelText("Update"), {
      target: { value: "Crew poured west stair landing and uploaded notes." }
    });
    const addFieldUpdateButtons = screen.getAllByRole("button", { name: "Add Field Update" });
    fireEvent.click(addFieldUpdateButtons[addFieldUpdateButtons.length - 1]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/field-updates", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText("Crew poured west stair landing and uploaded notes.")).toBeInTheDocument();
  });

  it("does not show Demo role in the account menu", async () => {
    render(<App />);
    await enterDashboard();

    fireEvent.click(screen.getByRole("button", { name: "liam santos account" }));

    const accountMenu = screen.getByRole("menu", { name: "Account menu" });
    expect(within(accountMenu).getByRole("menuitem", { name: "Settings" })).toBeInTheDocument();
    expect(within(accountMenu).queryByText("Demo role")).not.toBeInTheDocument();
  });

  it("opens Settings from the reports username button", async () => {
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Reports$/i }));
    fireEvent.click(screen.getByRole("button", { name: "liam santos account" }));

    const accountMenu = screen.getByRole("menu", { name: "Account menu" });
    expect(within(accountMenu).getByRole("menuitem", { name: "Settings" })).toHaveAttribute("title", "Settings");
  });

  it("opens Settings from the schedule username button", async () => {
    render(<App />);
    await enterDashboard();

    await openSchedule("Week");

    // The topbar control is avatar-only; the name and role live in the menu it opens.
    fireEvent.click(screen.getByRole("button", { name: "liam santos account" }));

    const accountMenu = screen.getByRole("menu", { name: "Account menu" });
    expect(within(accountMenu).getByText("liam santos")).toBeInTheDocument();
    expect(within(accountMenu).getByText("Project Manager")).toBeInTheDocument();
    expect(within(accountMenu).getByRole("menuitem", { name: "Settings" })).toHaveAttribute("title", "Settings");
  });

  it("shows the same account settings button on every app category", async () => {
    render(<App />);
    await enterDashboard();

    const categoryLabels = [
      "Dashboard",
      "Schedule",
      "Projects",
      "Crews",
      "Equipment",
      "Materials",
      "Field Updates",
      "DelayIQs",
      "Reports"
    ];

    expect(screen.queryByRole("button", { name: "Map & Field Ops" })).not.toBeInTheDocument();

    for (const label of categoryLabels) {
      fireEvent.click(screen.getByRole("button", { name: label }));

      const accountButton = await screen.findByRole("button", { name: "liam santos account" });
      fireEvent.click(accountButton);

      const accountMenu = screen.getByRole("menu", { name: "Account menu" });
      expect(within(accountMenu).getByText("liam santos")).toBeInTheDocument();
      expect(within(accountMenu).getByText("Project Manager")).toBeInTheDocument();
      expect(within(accountMenu).getByRole("menuitem", { name: "Settings" })).toHaveAttribute("title", "Settings");
      expect(within(accountMenu).queryByText("Demo role")).not.toBeInTheDocument();

      fireEvent.click(accountButton);
      await waitFor(() => expect(screen.queryByRole("menu", { name: "Account menu" })).not.toBeInTheDocument());
    }
  });

  it("opens the Settings page from the account menu and closes back to the app", async () => {
    render(<App />);
    await enterDashboard();

    const accountButton = await screen.findByRole("button", { name: "liam santos account" });
    fireEvent.click(accountButton);
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));

    expect(screen.getByRole("heading", { name: "Preferences" })).toBeInTheDocument();
    expect(screen.getByText("Choose how BuildFlow looks and behaves across scheduling, field updates, maps, and reports.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preferences" })).toHaveClass("active");
    expect(screen.queryByRole("button", { name: "BuildFlow Scheduler" })).not.toBeInTheDocument();
    expect(screen.queryByText("Stay on schedule.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));

    expect(await screen.findByText("Weekly Production Schedule")).toBeInTheDocument();
  });

  it("switches between every Settings category from the category rail", async () => {
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "liam santos account" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));

    const settingsRail = screen.getByLabelText("Settings categories");
    const settingsCategories = [
      ["Liam", "Profile"],
      ["Preferences", "Appearance"],
      ["Notifications", "Alerts"],
      ["Mail & Calendar", "Calendar"],
      ["General", "Workspace defaults"],
      ["People", "Workspace & team"],
      ["Import", "Import tools"],
      ["BuildFlow AI", "AI assistance"],
      ["Connections", "Connected apps"],
      ["Public schedules", "Sharing"],
      ["Teams", "Team setup"],
      ["Security", "Protection"],
      ["Billing", "Plan"]
    ] as const;

    for (const [categoryName, sectionName] of settingsCategories) {
      const categoryButton = within(settingsRail).getAllByRole("button", { name: categoryName })[0];

      fireEvent.click(categoryButton);

      expect(screen.getByRole("heading", { name: categoryName })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: sectionName })).toBeInTheDocument();
      expect(categoryButton).toHaveAttribute("aria-current", "page");
    }
  });

  it("lets a workspace owner invite people and change member roles", async () => {
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "liam santos account" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    fireEvent.click(within(screen.getByLabelText("Settings categories")).getByRole("button", { name: "People" }));

    expect(screen.getByRole("heading", { name: "Workspace & team" })).toBeInTheDocument();
    expect(screen.getAllByText("Workspace Owner").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Invite email address"), {
      target: { value: "sam.rivera@buildflow.test" }
    });
    fireEvent.change(screen.getByLabelText("Invite role"), { target: { value: "Crew Lead" } });
    fireEvent.click(screen.getByRole("button", { name: "Create invite" }));

    expect(screen.getByText("sam.rivera@buildflow.test - Invite pending")).toBeInTheDocument();
    expect(screen.getByText("Invite created for sam.rivera@buildflow.test.")).toBeInTheDocument();

    const invitedRoleSelect = screen.getByLabelText("Role for Sam Rivera");
    expect(invitedRoleSelect).toHaveValue("Crew Lead");

    fireEvent.change(invitedRoleSelect, { target: { value: "Viewer" } });

    expect(invitedRoleSelect).toHaveValue("Viewer");
  });

  it("shows the project card directory and filters", async () => {
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Projects$/i }));

    expect(screen.getByRole("heading", { name: "Every build, in view." })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search projects...")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter projects by status")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter projects by manager")).toBeInTheDocument();
    expect(screen.getByText("In Progress", { selector: ".badge" })).toBeInTheDocument();
    expect(screen.getByText("62% Complete")).toBeInTheDocument();
  });

  it("opens the new project modal from the Projects header", async () => {
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Projects$/i }));
    fireEvent.click(screen.getByRole("button", { name: "New Project" }));

    expect(screen.getByRole("dialog", { name: "New Project" })).toBeInTheDocument();
    expect(screen.getByLabelText("Project Name")).toHaveValue("");
    expect(screen.getByLabelText("Type")).toHaveValue("Commercial");
    expect(screen.getByLabelText("Contract Type")).toHaveValue("Fixed Price");
    expect(screen.getByLabelText("% Complete")).toHaveValue(0);
    expect(screen.getByLabelText("Status")).toHaveValue("Not Started");
    expect(screen.getByLabelText("Schedule Health")).toHaveValue("On Track");
    expect(screen.getByRole("button", { name: "Create Project" })).toBeDisabled();
  });

  it("creates a project and reloads bootstrap data", async () => {
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
    let projectCreated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects") {
        projectCreated = true;
        expect(options?.method).toBe("POST");
        expect(JSON.parse(String(options?.body))).toMatchObject({
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
        return new Response(JSON.stringify(newProject), { status: 201 });
      }
      return new Response(
        JSON.stringify(projectCreated ? { ...bootstrapFixture, projects: [...bootstrapFixture.projects, newProject] } : bootstrapFixture),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Projects$/i }));
    fireEvent.click(screen.getByRole("button", { name: "New Project" }));
    fireEvent.change(screen.getByLabelText("Project Name"), { target: { value: "South Austin Retail Center" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "South Austin, TX" } });
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "4800 S Congress Ave, Austin, TX 78745" } });
    fireEvent.change(screen.getByLabelText("Target Completion"), { target: { value: "2026-12-18" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Project" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New Project" })).not.toBeInTheDocument());
    const newProjectCard = screen.getByRole("button", { name: /South Austin Retail Center/ });
    expect(newProjectCard).toBeInTheDocument();
    expect(within(newProjectCard).getByText("0% Complete")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("keeps the new project modal open when creation fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/projects") {
        return new Response(JSON.stringify({ error: "Project could not be created." }), { status: 500 });
      }
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Projects$/i }));
    fireEvent.click(screen.getByRole("button", { name: "New Project" }));
    fireEvent.change(screen.getByLabelText("Project Name"), { target: { value: "South Austin Retail Center" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "South Austin, TX" } });
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "4800 S Congress Ave, Austin, TX 78745" } });
    fireEvent.change(screen.getByLabelText("Target Completion"), { target: { value: "2026-12-18" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Project" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Project could not be created.");
    expect(screen.getByRole("dialog", { name: "New Project" })).toBeInTheDocument();
  });

  it("opens the edit project modal with prefilled project fields", async () => {
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Projects$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Riverside Office Building/ }));

    expect(screen.getByRole("dialog", { name: "Edit Project" })).toBeInTheDocument();
    expect(screen.getByLabelText("Project Name")).toHaveValue("Riverside Office Building");
    expect(screen.getByLabelText("Location")).toHaveValue("Downtown, Austin, TX");
    expect(screen.getByLabelText("Address")).toHaveValue("123 Riverfront Blvd, Austin, TX 78701");
    expect(screen.getByLabelText("% Complete")).toHaveValue(62);
    expect(screen.getByLabelText("Status")).toHaveValue("In Progress");
    expect(screen.getByLabelText("Schedule Health")).toHaveValue("On Track");
  });

  it("updates a project and reloads bootstrap data", async () => {
    const updatedProject = {
      ...bootstrapFixture.projects[0],
      name: "Riverside Office Tower",
      percentComplete: 72,
      scheduleHealth: "Monitor" as const
    };
    let projectUpdated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/p-riverside") {
        projectUpdated = true;
        expect(options?.method).toBe("PATCH");
        expect(JSON.parse(String(options?.body))).toMatchObject({
          name: "Riverside Office Tower",
          percentComplete: 72,
          scheduleHealth: "Monitor"
        });
        return new Response(JSON.stringify(updatedProject), { status: 200 });
      }
      return new Response(
        JSON.stringify(projectUpdated ? { ...bootstrapFixture, projects: [updatedProject] } : bootstrapFixture),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Projects$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Riverside Office Building/ }));
    fireEvent.change(screen.getByLabelText("Project Name"), { target: { value: "Riverside Office Tower" } });
    fireEvent.change(screen.getByLabelText("% Complete"), { target: { value: "72" } });
    fireEvent.change(screen.getByLabelText("Schedule Health"), { target: { value: "Monitor" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit Project" })).not.toBeInTheDocument());
    expect(screen.getByText("72% Complete")).toBeInTheDocument();
    expect(screen.getByText("Monitor")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/p-riverside",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("keeps the edit project modal open when saving fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/projects/p-riverside") {
        return new Response(JSON.stringify({ error: "Project could not be updated." }), { status: 500 });
      }
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Projects$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Riverside Office Building/ }));
    fireEvent.change(screen.getByLabelText("Project Name"), { target: { value: "Riverside Office Tower" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Project could not be updated.");
    expect(screen.getByRole("dialog", { name: "Edit Project" })).toBeInTheDocument();
  });

  it("shows the unassigned drag queue on the schedule page", async () => {
    render(<App />);
    await enterDashboard();

    await openSchedule("Week");

    expect(screen.getByText("Downtown Retail Buildout")).toBeInTheDocument();
    expect(screen.getByText("Drag a job onto the schedule to assign")).toBeInTheDocument();
  });

  it("makes schedule controls interactive", async () => {
    render(<App />);
    await enterDashboard();

    await openSchedule("Week");

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByLabelText("Schedule filters")).toBeInTheDocument();

    const delayIQedFilter = screen.getByRole("button", { name: "DelayIQed" });
    expect(delayIQedFilter).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(delayIQedFilter);
    expect(delayIQedFilter).toHaveAttribute("aria-pressed", "false");

    // The view is a button group now, not a select.
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByText("Time")).toBeInTheDocument();
    expect(screen.getByText("Crew")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Riverside Office Building project from list view" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByLabelText("Selected week Jun 22 - Jun 28, 2026")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Advanced Board" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View all alerts" }));
    expect(screen.getByRole("dialog", { name: "Scheduling Alerts" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close Scheduling Alerts" }));

    fireEvent.click(screen.getByRole("button", { name: "Export Schedule" }));
    expect(screen.getByRole("dialog", { name: "Schedule Exported" })).toBeInTheDocument();
  });

  it("opens the linked project editor from a scheduled job card", async () => {
    render(<App />);
    await enterDashboard();

    await openSchedule("Week");
    fireEvent.click(await screen.findByRole("button", { name: "Open Riverside Office Building project" }));

    expect(screen.getByRole("dialog", { name: "Edit Project" })).toBeInTheDocument();
    expect(screen.getByLabelText("Project Name")).toHaveValue("Riverside Office Building");
    expect(screen.getByLabelText("Location")).toHaveValue("Downtown, Austin, TX");
    expect(screen.getByLabelText("Address")).toHaveValue("123 Riverfront Blvd, Austin, TX 78701");
    expect(screen.getByLabelText("% Complete")).toHaveValue(62);
  });

  it("updates a linked project from the schedule page editor", async () => {
    const updatedProject = {
      ...bootstrapFixture.projects[0],
      name: "Riverside Office Tower",
      percentComplete: 74
    };
    let projectUpdated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/p-riverside") {
        projectUpdated = true;
        expect(options?.method).toBe("PATCH");
        expect(JSON.parse(String(options?.body))).toMatchObject({
          name: "Riverside Office Tower",
          percentComplete: 74
        });
        return new Response(JSON.stringify(updatedProject), { status: 200 });
      }
      return new Response(
        JSON.stringify(projectUpdated ? { ...bootstrapFixture, projects: [updatedProject] } : bootstrapFixture),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();

    await openSchedule("Week");
    fireEvent.click(await screen.findByRole("button", { name: "Open Riverside Office Building project" }));
    fireEvent.change(screen.getByLabelText("Project Name"), { target: { value: "Riverside Office Tower" } });
    fireEvent.change(screen.getByLabelText("% Complete"), { target: { value: "74" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit Project" })).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/p-riverside",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("opens the linked project editor from a schedule queue card", async () => {
    render(<App />);
    await enterDashboard();

    await openSchedule("Week");
    fireEvent.click(await screen.findByRole("button", { name: "Open Downtown Retail Buildout project" }));

    expect(screen.getByRole("dialog", { name: "Edit Project" })).toBeInTheDocument();
    expect(screen.getByLabelText("Project Name")).toHaveValue("Riverside Office Building");
    expect(screen.getByLabelText("Target Completion")).toHaveValue("2026-09-04");
  });

  it("opens a custom add job prompt from an empty schedule cell", async () => {
    render(<App />);
    await enterDashboard();

    await openSchedule("Week");
    fireEvent.click(await screen.findByRole("button", { name: "Add job to Concrete Crew 1 on Jun 16" }));

    expect(screen.getByRole("dialog", { name: "Add job to schedule" })).toBeInTheDocument();
    expect(screen.getByText("Concrete Crew 1 - Jun 16")).toBeInTheDocument();
    expect(screen.getByText("Custom job")).toBeInTheDocument();
    expect(screen.getByLabelText("Job Name")).toBeInTheDocument();
    expect(screen.queryByText("Existing jobs")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Schedule Downtown Retail Buildout on Jun 16 with Concrete Crew 1" })).not.toBeInTheDocument();
  });

  it("opens a custom add job prompt from a schedule cell that already has work", async () => {
    render(<App />);
    await enterDashboard();

    await openSchedule("Week");
    expect(screen.getByRole("button", { name: "Open Riverside Office Building project" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add job to Concrete Crew 1 on Jun 15" }));
    expect(screen.getByRole("dialog", { name: "Add job to schedule" })).toBeInTheDocument();
    expect(screen.getByText("Concrete Crew 1 - Jun 15")).toBeInTheDocument();
    expect(screen.getByText("Custom job")).toBeInTheDocument();
    expect(screen.getByLabelText("Job Name")).toBeInTheDocument();
    expect(screen.queryByText("Existing jobs")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Schedule Downtown Retail Buildout on Jun 15 with Concrete Crew 1" })).not.toBeInTheDocument();
  });

  it("creates and schedules a custom job from the schedule add prompt", async () => {
    const createdJob = {
      id: "job-custom-pour",
      projectId: "p-riverside",
      name: "Custom Concrete Pour",
      phase: "Concrete - Custom Pour",
      location: "Downtown, Austin",
      startDate: "2026-06-16",
      endDate: "2026-06-16",
      startTime: "6:30 AM",
      endTime: "1:30 PM",
      requiredLabor: 7,
      requiredEquipment: "Line Pump",
      materialsStatus: "Ordered" as const,
      status: "Confirmed" as const,
      priority: "High" as const,
      notes: "Created from schedule prompt."
    };
    const scheduledAssignment = {
      id: "as-custom",
      jobId: createdJob.id,
      crewId: "crew-concrete",
      date: "2026-06-16",
      status: "Confirmed" as const,
      conflicts: []
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/jobs") {
        expect(options?.method).toBe("POST");
        expect(JSON.parse(String(options?.body))).toMatchObject({
          name: "Custom Concrete Pour",
          phase: "Concrete - Custom Pour",
          requiredLabor: 7,
          requiredEquipment: "Line Pump",
          materialsStatus: "Ordered",
          status: "Confirmed",
          priority: "High"
        });
        return new Response(JSON.stringify(createdJob), { status: 201 });
      }
      if (url === "/api/schedule/assign") {
        expect(options?.method).toBe("POST");
        expect(JSON.parse(String(options?.body))).toMatchObject({
          jobId: createdJob.id,
          crewId: "crew-concrete",
          date: "2026-06-16",
          status: "Confirmed"
        });
        return new Response(JSON.stringify(scheduledAssignment), { status: 201 });
      }
      return new Response(
        JSON.stringify({
          ...bootstrapFixture,
          jobs: [...bootstrapFixture.jobs, createdJob],
          assignments: [...bootstrapFixture.assignments, scheduledAssignment]
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();

    await openSchedule("Week");
    fireEvent.click(await screen.findByRole("button", { name: "Add job to Concrete Crew 1 on Jun 16" }));

    fireEvent.change(screen.getByLabelText("Job Name"), { target: { value: "Custom Concrete Pour" } });
    fireEvent.change(screen.getByLabelText("Phase"), { target: { value: "Concrete - Custom Pour" } });
    fireEvent.change(screen.getByLabelText("Start Time"), { target: { value: "6:30 AM" } });
    fireEvent.change(screen.getByLabelText("End Time"), { target: { value: "1:30 PM" } });
    fireEvent.change(screen.getByLabelText("Labor"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Equipment"), { target: { value: "Line Pump" } });
    fireEvent.change(screen.getByLabelText("Materials"), { target: { value: "Ordered" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "Confirmed" } });
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "High" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Created from schedule prompt." } });
    fireEvent.click(screen.getByRole("button", { name: "Create & Schedule Job" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/jobs",
      expect.objectContaining({ method: "POST" })
    ));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/schedule/assign",
      expect.objectContaining({ method: "POST" })
    ));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add job to schedule" })).not.toBeInTheDocument());
  });

  it("renders the add crew form on the crews page", async () => {
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Crews$/i }));

    expect(await screen.findByRole("heading", { name: "Crews" })).toBeInTheDocument();
    expect(screen.getByText("Total Crews")).toBeInTheDocument();
    expect(screen.getByLabelText("Search crews")).toBeInTheDocument();
    const crewLegend = screen.getByLabelText("Crew statuses");
    expect(within(crewLegend).getByText("Available")).toBeInTheDocument();
    expect(within(crewLegend).getByText("On Job")).toBeInTheDocument();
    expect(within(crewLegend).getByText("Overbooked")).toBeInTheDocument();
    expect(within(crewLegend).getByText("In Progress")).toBeInTheDocument();
    expect(within(crewLegend).getByText("Unavailable")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add Crew" }));

    expect(screen.getByRole("dialog", { name: "Add Crew" })).toBeInTheDocument();
    expect(screen.getByLabelText("Crew Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Specialty/Type")).toBeInTheDocument();
    expect(screen.getByLabelText("Foreman")).toBeInTheDocument();
    expect(screen.getByText("Labors & Operators")).toBeInTheDocument();
  });

  it("renders materials with the crew-style directory layout", async () => {
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Materials$/i }));

    expect(await screen.findByRole("heading", { name: "Every material, on time." })).toBeInTheDocument();
    expect(screen.getByText("Total Materials")).toBeInTheDocument();
    expect(screen.getByText("Ready Now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Material" })).toBeInTheDocument();
    expect(screen.getByLabelText("Search materials")).toBeInTheDocument();
    expect(screen.getAllByText("Ready Mix Concrete").length).toBeGreaterThan(0);
    expect(screen.getByText("Schedule Impact")).toBeInTheDocument();
    expect(screen.getByText("Ready for schedule")).toBeInTheDocument();
  });

  it("opens the add material form on the materials page", async () => {
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Materials$/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Material" }));

    expect(screen.getByRole("dialog", { name: "Add Material" })).toBeInTheDocument();
    expect(screen.getByLabelText("Material Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Project")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
    expect(screen.getByLabelText("Delivery Date")).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity")).toBeInTheDocument();
  });

  it("creates a material and reloads bootstrap data", async () => {
    const newMaterial = {
      id: "mat-structural-steel-beams",
      projectId: "p-riverside",
      name: "Structural Steel Beams",
      status: "Ordered",
      deliveryDate: "2026-06-28",
      quantity: "24 bundles"
    };
    let materialCreated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/materials") {
        materialCreated = true;
        return new Response(JSON.stringify(newMaterial), { status: 201 });
      }
      return new Response(
        JSON.stringify(
          materialCreated
            ? { ...bootstrapFixture, materials: [...bootstrapFixture.materials, newMaterial] }
            : bootstrapFixture
        ),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Materials$/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Material" }));
    fireEvent.change(await screen.findByLabelText("Material Name"), { target: { value: "Structural Steel Beams" } });
    fireEvent.change(screen.getByLabelText("Delivery Date"), { target: { value: "2026-06-28" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "24 bundles" } });
    const addMaterialButtons = screen.getAllByRole("button", { name: "Add Material" });
    fireEvent.click(addMaterialButtons[addMaterialButtons.length - 1]);

    expect(await screen.findByText("Structural Steel Beams")).toBeInTheDocument();
    const materialPost = fetchMock.mock.calls.find(([url]) => url === "/api/materials");
    expect(materialPost).toBeDefined();
    expect(JSON.parse(materialPost?.[1]?.body as string)).toEqual({
      projectId: "p-riverside",
      name: "Structural Steel Beams",
      status: "Ordered",
      deliveryDate: "2026-06-28",
      quantity: "24 bundles"
    });
  });

  it("renders equipment with the crew-style directory layout", async () => {
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Equipment$/i }));

    expect(await screen.findByRole("heading", { name: "The whole fleet, at the ready." })).toBeInTheDocument();
    expect(screen.getByText("Total Equipment")).toBeInTheDocument();
    expect(screen.getByText("Available Now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Equipment" })).toBeInTheDocument();
    expect(screen.getByLabelText("Search equipment")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Concrete Pump #2" })).toBeInTheDocument();
    expect(screen.getByText("Current Job")).toBeInTheDocument();
    expect(screen.getByText("Committed today")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search equipment"), { target: { value: "forklift" } });

    expect(screen.getByText("No equipment matches that search")).toBeInTheDocument();
  });

  it("creates equipment from the equipment popup and reloads bootstrap data", async () => {
    const newEquipment = {
      id: "eq-forklift-9",
      name: "Forklift #9",
      type: "Forklift",
      status: "In Use",
      assignedTo: "p-riverside"
    };
    let equipmentCreated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/equipment") {
        equipmentCreated = true;
        return new Response(JSON.stringify(newEquipment), { status: 201 });
      }
      return new Response(
        JSON.stringify(
          equipmentCreated
            ? { ...bootstrapFixture, equipment: [...bootstrapFixture.equipment, newEquipment] }
            : bootstrapFixture
        ),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Equipment$/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Equipment" }));

    expect(screen.getByRole("dialog", { name: "Add Equipment" })).toBeInTheDocument();
    expect(screen.getByLabelText("Equipment Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Equipment Type")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
    expect(screen.getByLabelText("Assigned Project")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Equipment Name"), { target: { value: "Forklift #9" } });
    fireEvent.change(screen.getByLabelText("Equipment Type"), { target: { value: "Forklift" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "In Use" } });
    fireEvent.change(screen.getByLabelText("Assigned Project"), { target: { value: "p-riverside" } });

    const addEquipmentButtons = screen.getAllByRole("button", { name: "Add Equipment" });
    fireEvent.click(addEquipmentButtons[addEquipmentButtons.length - 1]);

    expect(await screen.findByRole("heading", { name: "Forklift #9" })).toBeInTheDocument();
    const equipmentPost = fetchMock.mock.calls.find(([url]) => url === "/api/equipment");
    expect(equipmentPost).toBeDefined();
    expect(JSON.parse(equipmentPost?.[1]?.body as string)).toEqual({
      name: "Forklift #9",
      type: "Forklift",
      status: "In Use",
      assignedTo: "p-riverside"
    });
  });

  it("edits and removes equipment from equipment cards", async () => {
    let equipment = [...bootstrapFixture.equipment];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/equipment/eq-pump" && options?.method === "PATCH") {
        const updates = JSON.parse(options.body as string);
        equipment = equipment.map((item) => (item.id === "eq-pump" ? { ...item, ...updates } : item));
        return new Response(JSON.stringify(equipment.find((item) => item.id === "eq-pump")), { status: 200 });
      }
      if (url === "/api/equipment/eq-pump" && options?.method === "DELETE") {
        equipment = equipment.filter((item) => item.id !== "eq-pump");
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({ ...bootstrapFixture, equipment }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Equipment$/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Concrete Pump #2" }));

    expect(screen.getByRole("dialog", { name: "Edit Equipment" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Equipment Name"), { target: { value: "Concrete Pump #3" } });
    fireEvent.change(screen.getByLabelText("Equipment Type"), { target: { value: "Pump Truck" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "Maintenance" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Equipment" }));

    expect(await screen.findByRole("heading", { name: "Concrete Pump #3" })).toBeInTheDocument();
    const equipmentPatch = fetchMock.mock.calls.find(([url, options]) => url === "/api/equipment/eq-pump" && options?.method === "PATCH");
    expect(equipmentPatch).toBeDefined();
    expect(JSON.parse(equipmentPatch?.[1]?.body as string)).toEqual({
      name: "Concrete Pump #3",
      type: "Pump Truck",
      status: "Maintenance",
      assignedTo: "p-riverside"
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove Concrete Pump #3" }));
    expect(screen.getByRole("dialog", { name: "Remove Equipment" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Equipment" }));

    expect(await screen.findByText("No equipment added yet")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url, options]) => url === "/api/equipment/eq-pump" && options?.method === "DELETE")).toBe(true);
  });

  it("updates crew size when labor and operator counts change", async () => {
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Crews$/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Crew" }));
    fireEvent.change(await screen.findByLabelText("Count for role 1"), { target: { value: "3" } });

    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("adds and removes labor mix rows", async () => {
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Crews$/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Crew" }));
    fireEvent.click(screen.getByRole("button", { name: "Add role" }));

    expect(screen.getByLabelText("Count for role 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove role 3" }));

    expect(screen.queryByLabelText("Count for role 3")).not.toBeInTheDocument();
  });

  it("creates a crew and reloads bootstrap data", async () => {
    const newCrew = {
      id: "crew-site-prep-crew-5",
      name: "Site Prep Crew 5",
      specialty: "Site Prep",
      lead: "Dana Brooks",
      size: 4,
      capacity: 40,
      utilization: 0,
      icon: "users",
      status: "Available",
      laborMix: [
        { category: "Labor", role: "Laborers", count: 2 },
        { category: "Operator", role: "Dozer Operator", count: 1 }
      ]
    };
    let crewCreated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/crews") {
        crewCreated = true;
        return new Response(JSON.stringify(newCrew), { status: 201 });
      }
      return new Response(
        JSON.stringify(crewCreated ? { ...bootstrapFixture, crews: [...bootstrapFixture.crews, newCrew] } : bootstrapFixture),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Crews$/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Crew" }));
    fireEvent.change(await screen.findByLabelText("Crew Name"), { target: { value: "Site Prep Crew 5" } });
    fireEvent.change(screen.getByLabelText("Specialty/Type"), { target: { value: "Site Prep" } });
    fireEvent.change(screen.getByLabelText("Foreman"), { target: { value: "Dana Brooks" } });
    fireEvent.change(screen.getByLabelText("Count for role 1"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Role for role 2"), { target: { value: "Dozer Operator" } });
    const addCrewButtons = screen.getAllByRole("button", { name: "Add Crew" });
    fireEvent.click(addCrewButtons[addCrewButtons.length - 1]);

    expect(await screen.findByText("Site Prep Crew 5")).toBeInTheDocument();
    const crewPost = fetchMock.mock.calls.find(([url]) => url === "/api/crews");
    expect(crewPost).toBeDefined();
    expect(JSON.parse(crewPost?.[1]?.body as string)).toEqual({
      name: "Site Prep Crew 5",
      specialty: "Site Prep",
      foreman: "Dana Brooks",
      laborMix: [
        { category: "Labor", role: "Laborers", count: 2 },
        { category: "Operator", role: "Dozer Operator", count: 1 }
      ]
    });
  });

  it("opens a crew card for editing with prefilled values", async () => {
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Crews$/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Concrete Crew 1" }));

    expect(screen.getByRole("dialog", { name: "Edit Crew" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Concrete Crew 1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Concrete")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Mike Johnson")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Crew" })).toBeEnabled();
  });

  it("edits crews directly from the crew popup", async () => {
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
    let crewUpdated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/crews/crew-concrete") {
        crewUpdated = true;
        return new Response(JSON.stringify(updatedCrew), { status: 200 });
      }
      return new Response(
        JSON.stringify(
          crewUpdated
            ? { ...bootstrapFixture, crews: bootstrapFixture.crews.map((crew) => (crew.id === updatedCrew.id ? updatedCrew : crew)) }
            : bootstrapFixture
        ),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Crews$/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Concrete Crew 1" }));
    fireEvent.change(await screen.findByLabelText("Crew Name"), { target: { value: "Concrete Crew Alpha" } });
    fireEvent.change(screen.getByLabelText("Foreman"), { target: { value: "Morgan Lee" } });
    fireEvent.change(screen.getByLabelText("Count for role 1"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Crew" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => url === "/api/crews/crew-concrete")).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit Crew" })).not.toBeInTheDocument();
    });
    expect(await screen.findByRole("heading", { name: "Concrete Crew Alpha" })).toBeInTheDocument();
    const crewPatch = fetchMock.mock.calls.find(([url]) => url === "/api/crews/crew-concrete");
    expect(crewPatch).toBeDefined();
    expect(JSON.parse(crewPatch?.[1]?.body as string)).toEqual({
      name: "Concrete Crew Alpha",
      specialty: "Concrete",
      foreman: "Morgan Lee",
      laborMix: [
        { category: "Labor", role: "Finishers", count: 5 },
        { category: "Labor", role: "Laborers", count: 2 },
        { category: "Operator", role: "Pump Operator", count: 1 }
      ]
    });
  });

  it("cancels crew edits without saving", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => new Response(JSON.stringify(bootstrapFixture), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Crews$/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Concrete Crew 1" }));
    fireEvent.change(await screen.findByLabelText("Crew Name"), { target: { value: "Concrete Crew Alpha" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog", { name: "Edit Crew" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/crews/crew-concrete")).toBe(false);
  });

  it("removes a crew from the crew card confirmation dialog", async () => {
    let crewDeleted = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/crews/crew-concrete" && options?.method === "DELETE") {
        crewDeleted = true;
        return new Response(null, { status: 204 });
      }
      return new Response(
        JSON.stringify(
          crewDeleted
            ? { ...bootstrapFixture, crews: bootstrapFixture.crews.filter((crew) => crew.id !== "crew-concrete") }
            : bootstrapFixture
        ),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Crews$/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove Concrete Crew 1" }));

    expect(screen.getByRole("dialog", { name: "Remove Crew" })).toBeInTheDocument();
    expect(screen.getByText("Foreman Mike Johnson, 8 workers.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove Crew" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, options]) => url === "/api/crews/crew-concrete" && options?.method === "DELETE")).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Remove Crew" })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Edit Concrete Crew 1" })).not.toBeInTheDocument();
  });
});
