import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { businessTypeOptions } from "@buildflow/shared";
import { describe, expect, it, vi } from "vitest";
import type { OnboardingProductId } from "@buildflow/shared";
import App, { buildTutorialSteps } from "./App";
import { bootstrapFixture } from "./test/fixture";
import {
  ACCOUNT,
  blankWorkspaceFixture,
  chooseBusinessType,
  chooseProductsAndPlan,
  completeOnboarding,
  enterDashboard,
  installAppHarness,
  newOrgWorkspaceFixture,
  openAppPage,
  openCreateAccount,
  openMapFieldOps,
  openSchedule,
  respondToBuildflowApi,
  signUp,
  state
} from "./test/appHarness";

// The clock is pinned to 2026-06-16 in src/test/setup.ts, inside the week the
// fixtures are dated in — see the comment there for why it has to happen that early.
describe("BuildFlow app", () => {
  installAppHarness();

  it("renders the welcome page first", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: /^Where crews, projects, and schedules move together\.$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Login from welcome navigation$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Login from welcome navigation$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Join the waitlist from welcome navigation$/ })).toBeInTheDocument();
    expect(
      screen.getByText("Coordinate crews, project phases, materials, field updates, and delayIQs from one clean command center.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Preview the live demo$/ })).toBeInTheDocument();
  });

  it("opens the create account page from the landing nav", async () => {
    render(<App />);

    await openCreateAccount();

    expect(await screen.findByRole("heading", { name: "Create your workspace." })).toBeInTheDocument();
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toHaveAttribute("placeholder", "name@company.com");
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
    // social sign-in buttons are gone until OAuth is real — a disabled sign-in button costs trust
    expect(screen.queryByRole("button", { name: "Google" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Microsoft" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Company")).toBeInTheDocument();
    expect(screen.getByLabelText("I agree to the")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pending Approvals" })).not.toBeInTheDocument();
    expect(window.location.hash).toBe("#create-account");
  });

  it("offers Google and Microsoft sign-in only when configured, and needs the terms box to sign up", async () => {
    state.oauthProviders = { google: true, microsoft: false };
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, assign, origin: "http://localhost:5432", search: "", hash: "", pathname: "/", href: "http://localhost:5432/" }
    });
    try {
      render(<App />);
      await openCreateAccount();

      const google = await screen.findByRole("button", { name: "Google" });
      expect(screen.queryByRole("button", { name: "Microsoft" })).not.toBeInTheDocument();

      // signup: the terms box is the gate, exactly like the email form
      fireEvent.click(google);
      expect(await screen.findByRole("alert")).toHaveTextContent("Please agree to the Terms & Conditions and Privacy Policy.");
      expect(assign).not.toHaveBeenCalled();

      fireEvent.click(screen.getByLabelText("I agree to the"));
      fireEvent.click(google);
      expect(assign).toHaveBeenCalledTimes(1);
      // the API base is same-origin in tests, so the start URL is relative
      const url = new URL(String(assign.mock.calls[0][0]), "http://localhost:5432");
      expect(url.pathname).toBe("/api/auth/oauth/google/start");
      expect(url.searchParams.get("mode")).toBe("signup");
      expect(url.searchParams.get("terms")).toBe("1");
      expect(url.searchParams.get("returnTo")).toBe("http://localhost:5432");

      // login: no terms box, straight to the provider
      fireEvent.click(screen.getByRole("button", { name: "Log in" }));
      fireEvent.click(await screen.findByRole("button", { name: "Google" }));
      expect(new URL(String(assign.mock.calls[1][0]), "http://localhost:5432").searchParams.get("mode")).toBe("login");
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });

  it("switches between the signup and login forms", async () => {
    render(<App />);

    await openCreateAccount();
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

    await openCreateAccount();
    fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: ACCOUNT.name } });
    fireEvent.change(screen.getByLabelText("Company"), { target: { value: ACCOUNT.company } });
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: ACCOUNT.email } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    fireEvent.click(screen.getByLabelText("I agree to the"));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Password must be at least 8 characters.");
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/api/auth/signup"))).toBe(false);
  });

  it("prompts for business type after registering a new workspace", async () => {
    render(<App />);

    await signUp();

    expect(await screen.findByRole("heading", { name: "What type of Business do you own" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Business type" })).toBeInTheDocument();
    businessTypeOptions.forEach((businessType) => {
      expect(screen.getByRole("radio", { name: businessType })).toBeInTheDocument();
    });
    expect(window.location.hash).toBe("#business-type");

    fireEvent.click(screen.getByRole("radio", { name: "Roofing" }));
    fireEvent.click(screen.getByRole("button", { name: "Get BuildFlow" }));

    expect(await screen.findByRole("heading", { name: "What additional products do you want to use?" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#additional-products");
  });

  it("requires a plan but not an add-on before entering BuildFlow", async () => {
    render(<App />);

    await signUp();
    await chooseBusinessType("Asphalt");

    expect(await screen.findByText("Map & Field Ops")).toBeInTheDocument();
    expect(screen.getByText("Track vehicles, equipment, and design traffic routes.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Free plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Pro plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Business plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Enterprise plan" })).toBeInTheDocument();

    // a plan is required; add-ons are optional, and the button says so
    const continueButton = screen.getByRole("button", { name: "Continue without add-ons" });
    expect(continueButton).toBeDisabled();
    expect(screen.getByLabelText("Seats")).toHaveValue(5);

    fireEvent.click(screen.getByRole("button", { name: "Select Business plan" }));
    expect(continueButton).toBeEnabled();
    expect(screen.getByText(/\$240 \/ month/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Map & Field Ops/));
    expect(screen.getByRole("button", { name: "Continue to BuildFlow" })).toBeEnabled();
  });

  it("opens a blank workspace after the selected onboarding setup", async () => {
    render(<App />);

    await signUp({ email: "ops@asphalt.test" });
    await chooseBusinessType("Asphalt");
    fireEvent.click(await screen.findByLabelText(/Map & Field Ops/));
    fireEvent.click(screen.getByLabelText(/Equipment Tracking/));
    fireEvent.click(screen.getByRole("button", { name: "Select Business plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to BuildFlow" }));
    // last step: invite the team — skippable
    fireEvent.click(await screen.findByRole("button", { name: "Skip for now" }));

    // Onboarding completes straight into the Dashboard — no HUD launcher in between.
    expect(await screen.findByRole("dialog", { name: "Your BuildFlow workspace is ready" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip Tutorial" }));
    expect(await screen.findByRole("heading", { name: "Pending Approvals" })).toBeInTheDocument();
    expect(screen.getByText("Asphalt workspace")).toBeInTheDocument();
    expect(window.localStorage.getItem("buildflow.businessType")).toBe("Asphalt");
    expect(window.localStorage.getItem("buildflow.selectedPlan")).toBe("business");
    expect(JSON.parse(window.localStorage.getItem("buildflow.selectedProducts") ?? "[]")).toEqual(["map-field-ops", "equipment-tracking"]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/business-profile",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          businessType: "Asphalt",
          selectedPlan: "business",
          selectedProducts: ["map-field-ops", "equipment-tracking"],
          seats: 5
        })
      })
    );
    expect(screen.getAllByText(/Business plan/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Selected products: Map & Field Ops, Equipment Tracking/)).toBeInTheDocument();
    // a blank workspace shows the board's own empty states (the weekly board,
    // job list and project table retired to their pages in Phase 3)
    expect(screen.getByText("No approvals waiting on you")).toBeInTheDocument();
    expect(screen.getByText("No inspections scheduled yet")).toBeInTheDocument();
    expect(screen.getByText("No equipment conflicts yet")).toBeInTheDocument();
    expect(screen.getByText("No materials added yet")).toBeInTheDocument();
    expect(screen.queryByText("I-35 Asphalt Overlay")).not.toBeInTheDocument();
    expect(screen.queryByText("Mainline Milling")).not.toBeInTheDocument();
    expect(screen.queryByText("Paving Crew 2")).not.toBeInTheDocument();
    expect(screen.queryByText("HMA Surface Mix")).not.toBeInTheDocument();

    // (the empty Week board and Crews page assertions moved with those pages — see the quarantined schedule tests)
  });

  it("starts a personalized tutorial after onboarding with selected-product lessons", async () => {
    render(<App />);

    await completeOnboarding({
      email: "ops@asphalt.test",
      businessType: "Asphalt",
      products: ["Map & Field Ops", "Equipment Tracking"],
      plan: "Business"
    });

    expect(await screen.findByRole("dialog", { name: "Your BuildFlow workspace is ready" })).toBeInTheDocument();
    expect(
      screen.getByText(/BuildFlow is set up for Asphalt on the Business plan with Map & Field Ops, Equipment Tracking/)
    ).toBeInTheDocument();

    // the panel counts the steps the two add-ons added
    expect(within(screen.getByRole("dialog")).getByText(/Step 1 of \d+/)).toBeInTheDocument();
  });

  /**
   * The lessons the chosen add-ons add, asked of the builder rather than of the panel.
   *
   * It used to be asked of the panel's strip of lesson chips; the 2026-09-14 redesign
   * follows the reference recording, which shows ONE step at a time, so the strip is gone.
   * Walking the list instead is not an option either — two of its steps are gated on really
   * creating a crew and really scheduling a job. Asking the builder is simpler than either,
   * and it tests the behaviour itself rather than a rendering of it.
   */
  it("adds one lesson per selected product, and none for products not selected", () => {
    const titlesFor = (selectedProductIds: OnboardingProductId[]) =>
      buildTutorialSteps({ selectedBusinessType: "Asphalt", selectedPlanId: "business", selectedProductIds }).map((step) => step.title);

    const core = titlesFor([]);
    const withTwo = titlesFor(["map-field-ops", "equipment-tracking"]);

    expect(withTwo).toContain("Map & Field Ops lesson");
    expect(withTwo).toContain("Equipment Tracking lesson");
    expect(withTwo).not.toContain("Time Cards lesson");
    expect(core).not.toContain("Map & Field Ops lesson");
    expect(withTwo).toHaveLength(core.length + 2);

    // and a product chosen twice still earns one lesson
    expect(titlesFor(["map-field-ops", "map-field-ops"])).toHaveLength(core.length + 1);
  });

  it("restarts the tutorial from the top bar", async () => {
    render(<App />);
    await completeOnboarding();
    fireEvent.click(await screen.findByRole("button", { name: "Skip Tutorial" }));

    fireEvent.click(screen.getByRole("button", { name: "Help and tutorial" }));

    expect(await screen.findByRole("dialog", { name: "Your BuildFlow workspace is ready" })).toBeInTheDocument();
  });

  it("opens the Schedule AI page from the BuildFlow AI direct hash route", async () => {
    window.history.pushState(null, "", "/#buildflow-ai");
    render(<App />);

    // Schedule AI is the Crew Scheduling page shape with Schedule AI's copy.
    expect(await screen.findByRole("heading", { name: "See all features" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Why you should choose BuildFlow." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Let the schedule watch itself." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Slips are caught before they spread." })).toBeInTheDocument();
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
    ["#solutions-field-updates-delayIQs", "Field Updates & DelayIQs", "Cause tracking"],
    ["#solutions-map-field-ops", "Map & Field Ops", "Travel windows"],
    ["#solutions-reports", "Reports", "Schedule variance"]
  ])("opens the %s solution page from the direct hash route", async (hash, heading, feature) => {
    window.history.pushState(null, "", `/${hash}`);
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByText(feature)).toBeInTheDocument();
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
    expect(screen.getByText("basic calendar view for scheduled jobs, work orders, and production dates")).toBeInTheDocument();
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

  it("opens the customer reviews page from the direct hash route", async () => {
    window.history.pushState(null, "", "/#customer-reviews");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Production plans that stay ready." })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Filter customer reviews" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "What is new in production scheduling." })).not.toBeInTheDocument();
  });

  it("opens the help center page from the direct hash route", async () => {
    window.history.pushState(null, "", "/#help-center");
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Help center" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search for anything...")).toBeInTheDocument();
    expect(screen.getByText("Still have questions?")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Customers" })).not.toBeInTheDocument();
  });

  it("returns to the welcome home page when the BuildFlow brand is clicked", async () => {
    window.history.pushState(null, "", "/#updates");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "What is new in production scheduling." })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^BuildFlow$/ }));

    expect(await screen.findByRole("heading", { name: /^Where crews, projects, and schedules move together\.$/ })).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(screen.queryByRole("heading", { name: "Pending Approvals" })).not.toBeInTheDocument();
  });

  // The guided demo player sits on the overview pages now, not the welcome home.
  // The guided demo stage lives on the shared overview layout, and both #overview and
  // #plans-overview were rebuilt as their own Apple-style pages (2026-09-11), so the
  // stage is asserted on Resources overview — one of the three still on that layout.
  it("toggles the guided demo playback on the resources overview", async () => {
    window.history.pushState(null, "", "/#resources-overview");
    render(<App />);

    const pauseButton = await screen.findByRole("button", { name: "Pause demo" });
    fireEvent.click(pauseButton);

    expect(screen.getByRole("button", { name: "Play demo" })).toBeInTheDocument();
  });

  it("switches guided demo scenes manually on the resources overview", async () => {
    window.history.pushState(null, "", "/#resources-overview");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Open Schedule demo" }));

    expect(screen.getByText("Drag work onto the right crew")).toBeInTheDocument();
    expect(screen.getByText("Conflict warning")).toBeInTheDocument();
  });

  it("opens the dashboard from the welcome page", async () => {
    render(<App />);

    await enterDashboard();

    expect(screen.getByText("Today's Jobs")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pending Approvals" })).toBeInTheDocument();
    expect(screen.getAllByText("Riverside Office Building")[0]).toBeInTheDocument();
    expect(screen.getByText("No disruptive weather this week")).toBeInTheDocument();
  });

  it("keeps the workspace the newest refresh fetched when an older one answers last", async () => {
    // A page load asks for the workspace, and so does the sign-in that follows it. Both are in
    // flight at once and the first can answer last — in which case what it fetched before anyone
    // was signed in used to land on the board, over the workspace the sign-in had just painted.
    const anonymous = {
      ...bootstrapFixture,
      users: [{ id: "u-guest", name: "Dana Fox", role: "Project Manager", title: "Project Manager", avatar: "DF" }],
      activeUser: { id: "u-guest", name: "Dana Fox", role: "Project Manager", title: "Project Manager", avatar: "DF" },
      projects: [{ ...bootstrapFixture.projects[0], name: "Somebody else's yard" }]
    };
    const answer: Array<(payload: unknown) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (new URL(String(input), "http://buildflow.test").pathname === "/api/bootstrap") {
          return new Promise((resolve) => {
            answer.push((payload) => resolve(new Response(JSON.stringify(payload), { status: 200 })));
          });
        }
        return respondToBuildflowApi(input);
      })
    );

    render(<App />);
    // the page load's own request, deliberately left unanswered
    await waitFor(() => expect(answer).toHaveLength(1));

    // sign in while it is still open
    fireEvent.click(await screen.findByRole("button", { name: /^Login from welcome navigation$/ }));
    fireEvent.change(await screen.findByLabelText("Email"), { target: { value: ACCOUNT.email } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: ACCOUNT.password } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(answer).toHaveLength(2));

    // the sign-in's workspace answers first and opens the app
    await act(async () => answer[1](bootstrapFixture));
    await screen.findByLabelText("Search BuildFlow");
    expect(screen.getByRole("button", { name: "Matt Johnson account" })).toBeInTheDocument();

    // the page load's answer arrives after it, and is too old to be the board
    await act(async () => answer[0](anonymous));

    expect(screen.getByRole("button", { name: "Matt Johnson account" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dana Fox account" })).not.toBeInTheDocument();
    expect(screen.queryByText("Somebody else's yard")).not.toBeInTheDocument();
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

    expect(screen.queryByText("No disruptive weather this week")).not.toBeInTheDocument();
    expect(screen.getByText(/active job\(s\) may be impacted/)).toBeInTheDocument();
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

  it("opens the dashboard from the welcome page demo link", async () => {
    render(<App />);

    // "Preview the live demo" is the credential-free way into the product; the
    // welcome page's "Login" CTA now opens the login form instead. Every entry
    // point lands on the Dashboard first.
    fireEvent.click(await screen.findByRole("button", { name: /^Preview the live demo$/ }));

    expect(await screen.findByRole("heading", { name: "Pending Approvals" })).toBeInTheDocument();
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
          fieldUpdateCreated ? { ...bootstrapFixture, fieldUpdates: [newUpdate, ...bootstrapFixture.fieldUpdates] } : bootstrapFixture
        ),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();

    await openAppPage("Field Updates");
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

    fireEvent.click(screen.getByRole("button", { name: / account$/ }));

    const accountMenu = screen.getByRole("menu", { name: "Account menu" });
    expect(within(accountMenu).getByRole("menuitem", { name: "Settings" })).toBeInTheDocument();
    expect(within(accountMenu).queryByText("Demo role")).not.toBeInTheDocument();
  });

  it("opens Settings from the reports username button", async () => {
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /^Reporting( \(.*\))?$/i }));
    fireEvent.click(screen.getByRole("button", { name: / account$/ }));

    const accountMenu = screen.getByRole("menu", { name: "Account menu" });
    expect(within(accountMenu).getByRole("menuitem", { name: "Settings" })).toHaveAttribute("title", "Settings");
  });

  it("opens the Settings page from the account menu and closes back to the app", async () => {
    render(<App />);
    await enterDashboard();

    const accountButton = await screen.findByRole("button", { name: / account$/ });
    fireEvent.click(accountButton);
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));

    expect(screen.getByRole("heading", { name: "Preferences" })).toBeInTheDocument();
    expect(
      screen.getByText("Choose how BuildFlow looks and behaves across scheduling, field updates, maps, and reports.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preferences" })).toHaveClass("active");
    expect(screen.queryByRole("button", { name: "BuildFlow Scheduler" })).not.toBeInTheDocument();
    expect(screen.queryByText("Stay on schedule.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));

    expect(await screen.findByRole("heading", { name: "Pending Approvals" })).toBeInTheDocument();
  });

  it("opens the new project modal from the Projects header", async () => {
    render(<App />);
    await enterDashboard();

    await openAppPage("Projects");
    fireEvent.click(screen.getByRole("button", { name: /^Add project$/i }));

    expect(screen.getByRole("dialog", { name: "New Project" })).toBeInTheDocument();
    expect(screen.getByLabelText("Project Name")).toHaveValue("");
    expect(screen.getByLabelText("Type")).toHaveValue("Commercial");
    expect(screen.getByLabelText("Contract Type")).toHaveValue("Fixed Price");
    expect(screen.getByLabelText("% Complete")).toHaveValue(0);
    expect(screen.getByLabelText("Status")).toHaveValue("Not Started");
    expect(screen.getByLabelText("Schedule Health")).toHaveValue("On Track");
    expect(screen.getByRole("button", { name: "Create Project" })).toBeDisabled();
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

    await openAppPage("Projects");
    fireEvent.click(screen.getByRole("button", { name: /^Add project$/i }));
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

    await openAppPage("Projects");
    fireEvent.click(screen.getByRole("button", { name: "Edit Riverside Office Building" }));

    expect(screen.getByRole("dialog", { name: "Edit Project" })).toBeInTheDocument();
    expect(screen.getByLabelText("Project Name")).toHaveValue("Riverside Office Building");
    expect(screen.getByLabelText("Location")).toHaveValue("Downtown, Austin, TX");
    expect(screen.getByLabelText("Address")).toHaveValue("123 Riverfront Blvd, Austin, TX 78701");
    expect(screen.getByLabelText("% Complete")).toHaveValue(62);
    expect(screen.getByLabelText("Status")).toHaveValue("In Progress");
    expect(screen.getByLabelText("Schedule Health")).toHaveValue("On Track");
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

    await openAppPage("Projects");
    fireEvent.click(screen.getByRole("button", { name: "Edit Riverside Office Building" }));
    fireEvent.change(screen.getByLabelText("Project Name"), { target: { value: "Riverside Office Tower" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Project could not be updated.");
    expect(screen.getByRole("dialog", { name: "Edit Project" })).toBeInTheDocument();
  });

  it("renders the add crew form on the crews page", async () => {
    render(<App />);
    await enterDashboard();

    await openAppPage("Crews");

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

  it("opens the add material form on the materials page", async () => {
    render(<App />);
    await enterDashboard();

    await openAppPage("Materials");
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/materials") {
        materialCreated = true;
        return new Response(JSON.stringify(newMaterial), { status: 201 });
      }
      return new Response(
        JSON.stringify(
          materialCreated ? { ...bootstrapFixture, materials: [...bootstrapFixture.materials, newMaterial] } : bootstrapFixture
        ),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();

    await openAppPage("Materials");
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

  it("updates crew size when labor and operator counts change", async () => {
    render(<App />);
    await enterDashboard();

    await openAppPage("Crews");
    fireEvent.click(await screen.findByRole("button", { name: "Add Crew" }));
    fireEvent.change(await screen.findByLabelText("Count for role 1"), { target: { value: "3" } });

    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("adds and removes labor mix rows", async () => {
    render(<App />);
    await enterDashboard();

    await openAppPage("Crews");
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _options?: RequestInit) => {
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

    await openAppPage("Crews");
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

    await openAppPage("Crews");
    fireEvent.click(await screen.findByRole("button", { name: "Edit Concrete Crew 1" }));

    expect(screen.getByRole("dialog", { name: "Edit Crew" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Concrete Crew 1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Concrete")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Mike Johnson")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Crew" })).toBeEnabled();
  });

  it("cancels crew edits without saving", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _options?: RequestInit) => new Response(JSON.stringify(bootstrapFixture), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();

    await openAppPage("Crews");
    fireEvent.click(await screen.findByRole("button", { name: "Edit Concrete Crew 1" }));
    fireEvent.change(await screen.findByLabelText("Crew Name"), { target: { value: "Concrete Crew Alpha" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog", { name: "Edit Crew" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/crews/crew-concrete")).toBe(false);
  });
  // ---- Dashboard, Phase 1: the board shows real data, nothing typed in ------
  const pendingVariance = {
    id: "v-1",
    projectId: "p-riverside",
    jobId: "j-riverside-concrete",
    fieldUpdateId: "fu-1",
    kind: "slip" as const,
    severity: "High" as const,
    status: "pending" as const,
    reportedPercent: 40,
    plannedPercent: 65,
    varianceDays: 3,
    detectedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    proposal: {
      currentStart: "2026-06-15",
      currentEnd: "2026-06-19",
      proposedStart: "2026-06-15",
      proposedEnd: "2026-06-24",
      ripple: [],
      projectSlipDays: 3,
      criticalPath: true,
      totalFloatDays: 0
    }
  };
  const earlyWarningPayload = {
    asOf: "2026-09-09",
    risks: [
      {
        jobId: "j-riverside-concrete",
        jobName: "Drywall",
        trade: "Drywall",
        projectId: "p-riverside",
        kind: "behind_pace",
        currentEnd: "2026-09-12",
        forecastEnd: "2026-09-16",
        varianceDays: 3,
        percentComplete: 40,
        plannedPercent: 70,
        severity: "High",
        onCriticalPath: true,
        projectSlipDays: 3,
        downstream: [
          {
            jobId: "j-paint",
            jobName: "Paint",
            trade: "Paint",
            currentEnd: "2026-09-18",
            pushedEnd: "2026-09-21",
            shiftDays: 3,
            critical: true
          }
        ],
        affectedTrades: ["Paint"]
      }
    ]
  };

  it("shows real field variances as Pending Approvals and none of the invented dashboard copy", async () => {
    const fixture = { ...bootstrapFixture, variances: [pendingVariance] };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/delayiq/early-warning") return new Response(JSON.stringify(earlyWarningPayload), { status: 200 });
        return new Response(JSON.stringify(fixture), { status: 200 });
      })
    );

    render(<App />);
    await enterDashboard();

    // the variance, from the job's phase, with its real drift and severity. The panel is bounded
    // by its .dash-block: since 2026-09-15 every board panel's heading is drawn by DashSection,
    // above the body, so the heading's nearest <section> is the whole board, not the panel.
    const approvals = within((await screen.findByRole("heading", { name: "Pending Approvals" })).closest(".dash-block") as HTMLElement);
    expect(await approvals.findByText("Concrete - Level 3 Slab")).toBeInTheDocument();
    expect(approvals.getByText("+3 working days")).toBeInTheDocument();
    expect(approvals.getByText(/Riverside Office Building · High severity · critical path/)).toBeInTheDocument();
    expect(approvals.getByRole("button", { name: "Approve the Concrete - Level 3 Slab variance" })).toBeInTheDocument();

    // the early warning, with what it pushes
    expect(await screen.findByText("Drywall — Riverside Office Building")).toBeInTheDocument();
    expect(screen.getByText(/3 working days behind pace · pushes Paint/)).toBeInTheDocument();

    // nothing typed into the source survives
    for (const invented of [
      /Change Order #CO-129/,
      /Timecard Exception/,
      /Re-sequence drywall/,
      /Add 1 carpentry crew/,
      /Lookahead Risk Scan/,
      /Active AI Workflows/,
      /Cost Performance/,
      /vs last 7 days/,
      /Production Trend \(Backlog\)/
    ]) {
      const hit = screen.queryByText(invented);
      expect(hit ? `${String(invented)} matched: "${hit.textContent?.slice(0, 80)}"` : null).toBeNull();
    }
  });

  it("approves a variance on the server and drops it from the open list", async () => {
    let accepted = false;
    const fixture = () => ({
      ...bootstrapFixture,
      variances: [accepted ? { ...pendingVariance, status: "accepted" as const, resolvedAt: new Date().toISOString() } : pendingVariance]
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/delayiq/early-warning") return new Response(JSON.stringify({ asOf: "2026-09-09", risks: [] }), { status: 200 });
      if (url === "/api/schedule/variances/v-1/accept") {
        expect(options?.method).toBe("POST");
        accepted = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify(fixture()), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "Approve the Concrete - Level 3 Slab variance" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/schedule/variances/v-1/accept")).toBe(true));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Approve the Concrete - Level 3 Slab variance" })).not.toBeInTheDocument()
    );
    expect(screen.getByText("No approvals waiting on you")).toBeInTheDocument();

    // and it now sits on the Resolved side with its status
    const approvals = within(screen.getByRole("heading", { name: "Pending Approvals" }).closest(".dash-block") as HTMLElement);
    fireEvent.click(approvals.getByRole("button", { name: "Resolved" }));
    expect(await approvals.findByText("Concrete - Level 3 Slab")).toBeInTheDocument();
    expect(approvals.getByText("accepted")).toBeInTheDocument();
  });

  it("says so when no jobs are trending behind instead of inventing a recommendation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/delayiq/early-warning") return new Response(JSON.stringify({ asOf: "2026-09-09", risks: [] }), { status: 200 });
        return new Response(JSON.stringify(bootstrapFixture), { status: 200 });
      })
    );

    render(<App />);
    await enterDashboard();

    expect(await screen.findByText("No jobs are trending behind. Nothing to recommend today.")).toBeInTheDocument();
    expect(screen.getByText("No approvals waiting on you")).toBeInTheDocument();
  });
  // ---- Dashboard, Phase 2: every control does what it says ----------------
  it("rides out a transient API failure instead of dead-ending on the error screen", async () => {
    let bootstrapCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/bootstrap") {
          bootstrapCalls += 1;
          // the first two answers are a cold API; the third is the workspace
          if (bootstrapCalls <= 2)
            return new Response(JSON.stringify({ error: "BuildFlow API is starting or unavailable." }), { status: 503 });
        }
        if (url === "/api/delayiq/early-warning") return new Response(JSON.stringify({ asOf: "2026-09-09", risks: [] }), { status: 200 });
        return new Response(JSON.stringify(bootstrapFixture), { status: 200 });
      })
    );

    render(<App />);
    await enterDashboard();

    expect(screen.queryByText(/starting or unavailable/)).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Pending Approvals" })).toBeInTheDocument();
    expect(bootstrapCalls).toBeGreaterThanOrEqual(3);
  }, 15000);

  it("shows the Dashboard's shape while the workspace loads", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/bootstrap") await gate;
        if (url === "/api/delayiq/early-warning") return new Response(JSON.stringify({ asOf: "2026-09-09", risks: [] }), { status: 200 });
        return new Response(JSON.stringify(bootstrapFixture), { status: 200 });
      })
    );

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /^Preview the live demo$/ }));

    expect(await screen.findByRole("status", { name: "Loading your dashboard" })).toBeInTheDocument();
    release();
    expect(await screen.findByRole("heading", { name: "Pending Approvals" })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading your dashboard" })).not.toBeInTheDocument();
  });

  it("says so and offers Retry when the schedule status cannot load", async () => {
    let statusCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/schedule/status") {
          statusCalls += 1;
          if (statusCalls === 1) return new Response(JSON.stringify({ error: "nope" }), { status: 500 });
        }
        if (url === "/api/delayiq/early-warning") return new Response(JSON.stringify({ asOf: "2026-09-09", risks: [] }), { status: 200 });
        return new Response(JSON.stringify(bootstrapFixture), { status: 200 });
      })
    );

    render(<App />);
    await enterDashboard();

    expect(await screen.findByText("Schedule status couldn't load.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(statusCalls).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(screen.queryByText("Schedule status couldn't load.")).not.toBeInTheDocument());
  });

  it("hides Reset layout when the board is stacked for a phone", async () => {
    const original = window.matchMedia;
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: /max-width: 900px/.test(query),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false
      }))
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/delayiq/early-warning")
          return new Response(JSON.stringify({ asOf: "2026-09-09", risks: [] }), { status: 200 });
        return new Response(JSON.stringify(bootstrapFixture), { status: 200 });
      })
    );

    try {
      render(<App />);
      await enterDashboard();
      expect(await screen.findByRole("heading", { name: "Pending Approvals" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Reset layout/ })).not.toBeInTheDocument();
    } finally {
      vi.stubGlobal("matchMedia", original);
    }
  });

  it("takes each legacy panel's View all somewhere", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/delayiq/early-warning")
          return new Response(JSON.stringify({ asOf: "2026-09-09", risks: [] }), { status: 200 });
        return new Response(JSON.stringify(bootstrapFixture), { status: 200 });
      })
    );

    render(<App />);
    await enterDashboard();

    const block = (title: string) => within(screen.getByRole("heading", { name: title }).closest(".dash-block") as HTMLElement);
    fireEvent.click(block("Material Readiness").getByRole("button", { name: "View all materials" }));
    expect(await screen.findByRole("heading", { level: 1, name: /material/i })).toBeInTheDocument();
  });
  // ---- Dashboard, Phase 3: the content sits above the fold ----------------
  it("keeps the legacy panels that carry unique data as board panels and retires the rest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/delayiq/early-warning")
          return new Response(JSON.stringify({ asOf: "2026-09-09", risks: [] }), { status: 200 });
        return new Response(JSON.stringify(bootstrapFixture), { status: 200 });
      })
    );
    render(<App />);
    await enterDashboard();

    for (const promoted of ["Material Readiness", "Weather Impact", "Equipment Conflicts", "Upcoming Inspections"]) {
      const heading = await screen.findByRole("heading", { name: promoted });
      expect(heading.closest(".dash-block")).not.toBeNull();
    }
    for (const retired of ["Weekly Production Schedule", "Jobs Scheduled This Week", "Active Projects", "This week"]) {
      expect(screen.queryByText(retired)).not.toBeInTheDocument();
    }
    // the trade line folded into the greeting keeps its tutorial anchor
    const meta = document.querySelector('[data-tutorial-id="dashboard-setup-banner"]');
    expect(meta).not.toBeNull();
    expect(meta?.textContent).toMatch(/workspace/);
    // and the old banner section is gone
    expect(document.querySelector(".business-context-banner")).toBeNull();
  });

  it("stacks the board phone-first: quick actions and KPIs before the lists", async () => {
    const original = window.matchMedia;
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: /max-width: 900px/.test(query),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false
      }))
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/delayiq/early-warning")
          return new Response(JSON.stringify({ asOf: "2026-09-09", risks: [] }), { status: 200 });
        return new Response(JSON.stringify(bootstrapFixture), { status: 200 });
      })
    );
    try {
      render(<App />);
      await enterDashboard();
      await screen.findByRole("heading", { name: "Pending Approvals" });
      const order = [...document.querySelectorAll(".dash-block h2")].map((h) => h.textContent?.trim());
      expect(order.indexOf("Quick Actions")).toBeLessThan(order.indexOf("Pending Approvals"));
      expect(order.indexOf("Operational KPIs")).toBeLessThan(order.indexOf("Pending Approvals"));
    } finally {
      vi.stubGlobal("matchMedia", original);
    }
  });

  it("moves the email confirmation to the top bar and shows at most one notice above the board", async () => {
    const unverified = {
      ...bootstrapFixture,
      account: { ...(bootstrapFixture.account ?? {}), email: "liam@example.com", emailVerifiedAt: null }
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/delayiq/early-warning")
          return new Response(JSON.stringify({ asOf: "2026-09-09", risks: [] }), { status: 200 });
        return new Response(JSON.stringify(unverified), { status: 200 });
      })
    );
    render(<App />);
    await enterDashboard();
    await screen.findByRole("heading", { name: "Pending Approvals" });

    expect(screen.getByRole("button", { name: /Confirm liam@example.com/ })).toBeInTheDocument();
    expect(document.querySelector(".business-context-verify")).toBeNull();
    const notices = document.querySelectorAll(".hs-home-promo, .business-context-verify, .business-context-banner");
    expect(notices.length).toBeLessThanOrEqual(1);
  });
  // ---- Dashboard, Phase 4: reachable by everyone, guarded by tests ---------
  const dashboardFetch = (overrides: Partial<typeof bootstrapFixture> = {}, risks: unknown[] = []) =>
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/delayiq/early-warning")
        return new Response(JSON.stringify({ asOf: "2026-06-16", risks }), { status: 200 });
      return new Response(JSON.stringify({ ...bootstrapFixture, ...overrides }), { status: 200 });
    });
  const panelOf = (title: string) => within(screen.getByRole("heading", { name: title }).closest(".dash-block") as HTMLElement);

  it("shows each panel's figure from the workspace data, not from the source", async () => {
    vi.stubGlobal("fetch", dashboardFetch());
    render(<App />);
    await enterDashboard();
    await screen.findByRole("heading", { name: "Pending Approvals" });

    // Operational KPIs: two jobs span the pinned day, one of two machines is in use, one project is delayed
    const kpis = panelOf("Operational KPIs");
    expect(kpis.getByText("Today's Jobs").closest(".kpi-card")?.textContent).toMatch(/2/);
    expect(kpis.getByText("Equipment In Use").closest(".kpi-card")?.textContent).toMatch(/1/);
    // Performance: the one project is on track → 100%, 1 of 1; the one crew runs at 80%
    const perf = panelOf("Performance");
    expect(perf.getByText("Schedule Performance").closest(".cc-stat")?.textContent).toMatch(/100%/);
    expect(perf.getByText("Projects On Track").closest(".cc-stat")?.textContent).toMatch(/1\s*of 1/);
    expect(perf.getByText("Labor Utilization").closest(".cc-stat")?.textContent).toMatch(/80%/);
    // Project Alerts carries the real delay with a real timestamp element
    const blockOf = (title: string) => screen.getByRole("heading", { name: title }).closest(".dash-block") as HTMLElement;
    const alerts = panelOf("Project Alerts");
    expect(alerts.getByText("Heavy Rain DelayIQ")).toBeInTheDocument();
    expect(blockOf("Project Alerts").querySelectorAll("time[datetime]").length).toBeGreaterThan(0);
    // the promoted panels read the same data
    expect(panelOf("Upcoming Inspections").getByText("Foundation Inspection")).toBeInTheDocument();
    expect(blockOf("Equipment Conflicts").textContent).not.toMatch(/No equipment conflicts yet/);
  });

  it("gives every board link and action a handler and a name that says where it goes", async () => {
    vi.stubGlobal("fetch", dashboardFetch({ variances: [pendingVariance] }, earlyWarningPayload.risks));
    render(<App />);
    await enterDashboard();
    await screen.findByRole("heading", { name: "Pending Approvals" });

    const reactOnClick = (el: Element) => {
      const key = Object.keys(el).find((k) => k.startsWith("__reactProps"));
      return key ? (el as unknown as Record<string, { onClick?: unknown }>)[key]?.onClick : undefined;
    };
    const links = [...document.querySelectorAll(".dash-board .cc-link, .dash-board .cc-rec-btn, .dash-board .cc-btn")];
    expect(links.length).toBeGreaterThan(6);
    for (const link of links) expect(reactOnClick(link), `${link.textContent} has no handler`).toBeTypeOf("function");
    // no two "View all" buttons share a name — a screen reader hears where each one goes
    expect(screen.queryAllByRole("button", { name: /^View all$/ })).toHaveLength(0);
    const names = screen.getAllByRole("button", { name: /^View all / }).map((b) => b.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(names.length);
    // Approve / Reject / Review carry their item's name
    expect(screen.getByRole("button", { name: "Reject the Concrete - Level 3 Slab variance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Review Drywall/ })).toBeInTheDocument();
  });

  it("rejects a variance on the server and keeps nothing waiting", async () => {
    let rejected = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/delayiq/early-warning") return new Response(JSON.stringify({ asOf: "2026-06-16", risks: [] }), { status: 200 });
      if (url === "/api/schedule/variances/v-1/reject") {
        expect(options?.method).toBe("POST");
        rejected = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      const variances = rejected
        ? [{ ...pendingVariance, status: "rejected" as const, resolvedAt: new Date().toISOString() }]
        : [pendingVariance];
      return new Response(JSON.stringify({ ...bootstrapFixture, variances }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "Reject the Concrete - Level 3 Slab variance" }));
    await waitFor(() => expect(rejected).toBe(true));
    expect(await screen.findByText("No approvals waiting on you")).toBeInTheDocument();
    const approvals = panelOf("Pending Approvals");
    fireEvent.click(approvals.getByRole("button", { name: "Resolved" }));
    expect(await approvals.findByText("rejected")).toBeInTheDocument();
  });

  it("makes a panel body that overflows reachable by keyboard, and leaves a fitted one out of the tab order", async () => {
    // jsdom has no layout: give the Project Alerts body more content than height
    const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
    const client = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    const overflowing = (el: HTMLElement) =>
      el.classList.contains("dash-block-body") && !!el.closest(".dash-block")?.querySelector("h2")?.textContent?.includes("Project Alerts");
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return overflowing(this as HTMLElement) ? 600 : 0;
      }
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return overflowing(this as HTMLElement) ? 200 : 0;
      }
    });
    try {
      vi.stubGlobal("fetch", dashboardFetch());
      render(<App />);
      await enterDashboard();
      await screen.findByRole("heading", { name: "Pending Approvals" });

      const alertsBody = screen.getByRole("region", { name: "Project Alerts contents" });
      await waitFor(() => expect(alertsBody).toHaveAttribute("tabindex", "0"));
      expect(alertsBody).toHaveClass("is-scrollable");
      const quickBody = screen.getByRole("region", { name: "Quick Actions contents" });
      expect(quickBody).toHaveAttribute("tabindex", "-1");
    } finally {
      if (scroll) Object.defineProperty(HTMLElement.prototype, "scrollHeight", scroll);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
      if (client) Object.defineProperty(HTMLElement.prototype, "clientHeight", client);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
    }
  });
  // ---- ADD-3: Today's plan ---------------------------------------------------
  it("groups today's jobs by crew with start time and site, from the assignments", async () => {
    const seeded = {
      ...bootstrapFixture,
      assignments: [
        ...bootstrapFixture.assignments,
        {
          id: "as-today",
          jobId: "j-riverside-concrete",
          crewId: "crew-concrete",
          date: "2026-06-16",
          status: "Confirmed" as const,
          conflicts: []
        }
      ]
    };
    vi.stubGlobal("fetch", dashboardFetch(seeded));
    render(<App />);
    await enterDashboard();

    const today = panelOf("Today's plan");
    const crewGroup = within(await today.findByRole("region", { name: /Concrete Crew 1 today/ }));
    expect(crewGroup.getByText("Concrete - Level 3 Slab")).toBeInTheDocument();
    expect(crewGroup.getByText("7:00 AM")).toBeInTheDocument();
    expect(crewGroup.getByText(/Riverside Office Building · Downtown, Austin/)).toBeInTheDocument();
    // the crew's lead reads beside its name
    expect(crewGroup.getByRole("heading", { level: 3 }).textContent).toMatch(/Concrete Crew 1 · /);
    // and the day leads the board
    const heads = [...document.querySelectorAll(".dash-block h2")].map((h) => h.textContent?.trim());
    expect(heads[0]).toBe("Today's plan");
    expect(today.getByRole("button", { name: "Open the Week board" })).toBeInTheDocument();
  });

  it("lists active jobs with no crew under Unassigned today instead of hiding them", async () => {
    vi.stubGlobal("fetch", dashboardFetch());
    render(<App />);
    await enterDashboard();

    const today = panelOf("Today's plan");
    const unassigned = within(await today.findByRole("region", { name: "Unassigned today" }));
    expect(unassigned.getByRole("heading", { level: 3 }).textContent).toMatch(/2 active jobs with no crew/);
    expect(unassigned.getAllByRole("listitem")).toHaveLength(2);
    expect(today.queryByText("Nothing on the board today")).not.toBeInTheDocument();
  });

  // ---- Phase 5: the board follows the person, panels can be hidden, tiles trend on real weeks ----
  const settingsWrites = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls
      .filter(([url, init]) => (init as RequestInit | undefined)?.method === "PUT" && String(url).startsWith("/api/me/settings/"))
      .map(([url, init]) => ({
        url: decodeURIComponent(String(url)),
        value: JSON.parse(String((init as RequestInit).body)).value as string
      }));
  const statusFetch = (history: unknown[]) =>
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/delayiq/early-warning") return new Response(JSON.stringify({ asOf: "2026-06-16", risks: [] }), { status: 200 });
      if (url === "/api/schedule/status")
        return new Response(
          JSON.stringify({
            asOf: "2026-06-16",
            weekOf: "2026-06-15",
            portfolio: {
              daysAhead: 0,
              percentComplete: 10,
              projects: 1,
              behindProjects: 0,
              reportingJobs: 1,
              totalJobs: 2,
              daysAheadDelta: null,
              percentDelta: null
            },
            projects: [],
            history
          }),
          { status: 200 }
        );
      return new Response(JSON.stringify(bootstrapFixture), { status: 200 });
    });
  const reading = (weekOf: string, onTrackProjects: number | null, crewUtilization: number | null) => ({
    weekOf,
    daysAhead: 0,
    percentComplete: 10,
    onTrackProjects,
    projects: 1,
    crewUtilization
  });
  const tileEl = (panel: ReturnType<typeof panelOf>, label: string) => panel.getByText(label).closest(".cc-stat") as HTMLElement;
  const tileOf = (panel: ReturnType<typeof panelOf>, label: string) => within(tileEl(panel, label));

  it("brings the board saved on the account down to this device, hidden panels included, and Reset clears it there too", async () => {
    const key = `bf:dash:layout:${bootstrapFixture.activeUser.id}`;
    localStorage.removeItem(key);
    const account = JSON.stringify({ items: [{ id: "today", x: 0, y: 0, w: 6, h: 4 }], hidden: ["weather", "apps"] });
    const fetchMock = dashboardFetch({ userSettings: { "dash:layout": account } });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await enterDashboard();
    await screen.findByRole("heading", { name: "Today's plan" });
    expect(screen.queryByRole("heading", { name: "Weather Impact" })).not.toBeInTheDocument();
    expect(screen.queryByText("Schedule Intelligence")).not.toBeInTheDocument();
    // hydrated into the device key the board reads when the API is slow, and counted as customized
    expect(localStorage.getItem(key)).toBe(account);
    expect(settingsWrites(fetchMock)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /Reset layout/ }));
    expect(await screen.findByRole("heading", { name: "Weather Impact" })).toBeInTheDocument();
    expect(screen.getByText("Schedule Intelligence")).toBeInTheDocument();
    expect(localStorage.getItem(key)).toBeNull();
    await waitFor(() => expect(settingsWrites(fetchMock)).toEqual([{ url: "/api/me/settings/dash:layout", value: "" }]), { timeout: 3000 });
  });

  /**
   * The board offers no rearrange mode. "Customize" was removed from the Dashboard header on
   * 2026-09-14 at the user's request, and it was the only door into that mode, so the drag
   * handles, the per-panel hide control and the Hidden panels chips went with it. This replaces
   * the round-trip test that used to drive them, and it exists so the button cannot creep back
   * without someone deciding to put it back.
   *
   * A board that was already customized is still recoverable: the test above this one loads an
   * account layout with two hidden panels and puts them back with Reset layout.
   */
  it("offers no way to rearrange or hide a panel", async () => {
    vi.stubGlobal("fetch", dashboardFetch());
    render(<App />);
    await enterDashboard();
    await screen.findByRole("heading", { name: "Weather Impact" });

    expect(screen.queryByRole("button", { name: /^Customize$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Done$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hide Weather Impact" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Hidden panels" })).not.toBeInTheDocument();
    // and every panel is still on the board, which is the point of taking the mode away
    for (const title of ["Weather Impact", "Today's plan", "Material Readiness", "Upcoming Inspections"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });

  it("draws each Performance tile's delta and line from the weekly readings, and a missing week ends the line", async () => {
    // last week read 0 of 1 on track at 70% utilization; the week before that is missing, the one before it is not
    vi.stubGlobal("fetch", statusFetch([reading("2026-05-25", 1, 50), reading("2026-06-08", 0, 70), reading("2026-06-15", 1, 80)]));
    render(<App />);
    await enterDashboard();
    const perf = panelOf("Performance");
    await tileOf(perf, "Schedule Performance").findByText("+100 pts vs last week");
    expect(tileOf(perf, "Projects On Track").getByText("+1 vs last week")).toBeInTheDocument();
    expect(tileOf(perf, "Labor Utilization").getByText("+10 pts vs last week")).toBeInTheDocument();
    // the line is last week plus today — the missing 1 June week is not bridged to 25 May
    const line = tileEl(perf, "Schedule Performance").querySelector(".cc-spark-line")?.getAttribute("d") ?? "";
    expect(line.split(" L")).toHaveLength(2);
  });

  it("says when a tile held steady, and shows no trend for a measure last week never held", async () => {
    vi.stubGlobal("fetch", statusFetch([reading("2026-06-01", 0, 60), reading("2026-06-08", null, 80), reading("2026-06-15", 1, 80)]));
    render(<App />);
    await enterDashboard();
    const perf = panelOf("Performance");
    const held = await tileOf(perf, "Labor Utilization").findByText("Held vs last week");
    expect(held.closest(".cc-trend")).toHaveClass("flat");
    expect(tileOf(perf, "Schedule Performance").queryByText(/vs last week/)).not.toBeInTheDocument();
    expect(tileOf(perf, "Projects On Track").queryByText(/vs last week/)).not.toBeInTheDocument();
    expect(tileEl(perf, "Schedule Performance").querySelector(".cc-spark")).toBeNull();
  });
});
