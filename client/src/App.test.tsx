import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { businessTypeOptions } from "@buildflow/shared";
import { describe, expect, it, vi } from "vitest";
import type { OnboardingProductId } from "@buildflow/shared";
import App, { buildTutorialSteps } from "./App";
import { bootstrapFixture } from "./test/fixture";
import {
  ACCOUNT,
  chooseBusinessType,
  chooseSizeAndPlan,
  completeOnboarding,
  enterDashboard,
  installAppHarness,
  openAppPage,
  openCreateAccount,
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

    // The Frost landing (2026-09-16): heavy + thin headline, the five category
    // names, the waitlist pill and Login in the nav, and the email capture pill.
    expect(await screen.findByRole("heading", { name: /^Precision by Default\.\s*Clarity in Everything\.$/ })).toBeInTheDocument();
    for (const category of ["Product", "Plans", "Resources", "Company", "AI"]) {
      expect(screen.getByText(category)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /^Login from welcome navigation$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Join the waitlist from welcome navigation$/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveAttribute("placeholder", "Enter your email");
    expect(screen.getByText("4,900+ people already on the waitlist")).toBeInTheDocument();
    // The old landing's menus and pages are gone.
    expect(screen.queryByRole("button", { name: /^Preview the live demo$/ })).not.toBeInTheDocument();
    // The names open dropdowns now rather than routing to pages.
    expect(screen.getByRole("button", { name: /^Product$/ })).toHaveAttribute("aria-haspopup", "true");
    expect(screen.queryByRole("region", { name: "Product menu" })).not.toBeInTheDocument();
  });

  it("joins the waitlist from the landing page's email pill", async () => {
    render(<App />);

    fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: "foreman@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /^Join the Waitlist$/ }));

    expect(await screen.findByRole("status")).toHaveTextContent("You’re on the list");
    // The harness stubs fetch with a vi.fn per test; the pill must post the address.
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as Array<[RequestInfo | URL, RequestInit?]>;
    const call = calls.find(([url]) => String(url) === "/api/waitlist");
    expect(call).toBeDefined();
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ email: "foreman@example.com" });
  });

  it("folds the categories into a side drawer behind the Menu pill on narrow windows", async () => {
    render(<App />);

    // The pill is only shown by CSS under 720px; in the DOM it is always there.
    fireEvent.click(await screen.findByRole("button", { name: "Open menu" }));

    const drawer = await screen.findByRole("dialog", { name: "Menu" });
    for (const category of ["Product", "Plans", "Resources", "Company", "AI"]) {
      expect(within(drawer).getByRole("button", { name: category })).toBeInTheDocument();
    }
    expect(within(drawer).getByRole("button", { name: "Join the Waitlist" })).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Log in" })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
    // The page steps back into its black frame while the drawer is open.
    expect(screen.getByTestId("frost-stage")).toHaveClass("is-open");

    fireEvent.click(within(drawer).getByRole("button", { name: "Close menu" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByTestId("frost-stage")).not.toHaveClass("is-open");
  });

  it("opens the full-width category band under the bar on click or hover, and closes it on Escape", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: /^Precision by Default\./ });

    fireEvent.click(screen.getByRole("button", { name: /^Product$/ }));
    const menu = await screen.findByRole("region", { name: "Product menu" });
    for (const item of ["Crew Scheduling", "Schedule AI", "Map & Field Ops", "Production Reports"]) {
      expect(within(menu).getByRole("button", { name: item })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /^Product$/ })).toHaveAttribute("aria-expanded", "true");
    // The page steps into the drawer's black frame while the band is open.
    expect(screen.getByTestId("frost-stage")).toHaveClass("is-open");

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Product menu" })).not.toBeInTheDocument());
    expect(screen.getByTestId("frost-stage")).not.toHaveClass("is-open");

    // Hovering a different name opens that one.
    fireEvent.mouseEnter(screen.getByRole("button", { name: /^Company$/ }));
    const companyMenu = await screen.findByRole("region", { name: "Company menu" });
    expect(within(companyMenu).getByRole("button", { name: "Contact Sales" })).toBeInTheDocument();
    // The band belongs to the whole bar: leaving the bar closes it.
    fireEvent.mouseLeave(screen.getByRole("navigation", { name: "Welcome" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Company menu" })).not.toBeInTheDocument());
  });

  it("slides the drawer out when the pointer rests on the right edge, and back when it leaves", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: /^Precision by Default\./ });
    expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByTestId("frost-edge-zone"));
    const drawer = await screen.findByRole("dialog", { name: "Menu" });
    expect(within(drawer).getByRole("button", { name: "Product" })).toBeInTheDocument();

    fireEvent.mouseEnter(drawer);
    fireEvent.mouseLeave(drawer);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument());
  });

  it("does not open the drawer for a pointer that only passes the edge", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: /^Precision by Default\./ });
    const zone = screen.getByTestId("frost-edge-zone");
    fireEvent.mouseEnter(zone);
    fireEvent.mouseLeave(zone);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();
  });

  it("lands a marketing hash on its own page (the routing came back on 2026-09-23)", async () => {
    // the marketing pages fell through to the landing hero from the Frost rebuild (2026-09-16) until
    // getWelcomeViewFromHash became a route table; tests/welcome-routes.test.ts guards the table itself
    window.history.pushState(null, "", "/#help-center");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Help center" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Precision by Default\./ })).not.toBeInTheDocument();
  });

  it("opens the create account page from the landing nav", async () => {
    render(<App />);

    await openCreateAccount();

    // the first of the five onboarding steps (2026-09-22): the person; the business is asked next
    expect(await screen.findByRole("heading", { name: "Let's start with you." })).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
    expect(screen.getByLabelText("First name")).toBeInTheDocument();
    expect(screen.getByLabelText("Last name")).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toHaveAttribute("placeholder", "name@company.com");
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    // social sign-in buttons are gone until OAuth is real — a disabled sign-in button costs trust
    expect(screen.queryByRole("button", { name: "Google" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Microsoft" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Company")).not.toBeInTheDocument();
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
    expect(await screen.findByRole("heading", { name: "Let's start with you." })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("heading", { name: "Welcome back." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    // Login only needs credentials — the signup-only fields are gone.
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create an account" }));

    expect(await screen.findByRole("heading", { name: "Let's start with you." })).toBeInTheDocument();
    expect(screen.getByLabelText("First name")).toBeInTheDocument();
  });

  it("requires a password of at least 8 characters to create an account", async () => {
    render(<App />);

    await openCreateAccount();
    fireEvent.change(await screen.findByLabelText("First name"), { target: { value: "Jordan" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Reyes" } });
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: ACCOUNT.email } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    fireEvent.click(screen.getByLabelText("I agree to the"));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Password must be at least 8 characters.");
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/api/auth/signup"))).toBe(false);
  });

  it("prompts for business type after registering a new workspace", async () => {
    render(<App />);

    await signUp();

    expect(await screen.findByRole("heading", { name: "What type of construction business do you own?" })).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 5")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Business type" })).toBeInTheDocument();
    businessTypeOptions.forEach((businessType) => {
      expect(screen.getByRole("radio", { name: businessType })).toBeInTheDocument();
    });
    expect(window.location.hash).toBe("#business-type");

    fireEvent.click(screen.getByRole("radio", { name: "Roofing" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    // then the size of the business, which is what the plan is recommended from
    expect(await screen.findByRole("heading", { name: "How big is Reyes Construction today?" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Monthly revenue" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Total employees" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#additional-products");
  });

  it("recommends a plan from the size answers, says why, and keeps Free one click away", async () => {
    render(<App />);

    await signUp();
    await chooseBusinessType("Asphalt");

    // nothing is recommended until both answers are in — or the step is skipped
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "$25k – $100k / month" }));
    fireEvent.click(screen.getByRole("radio", { name: "16 – 50" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    // a crew of 16–50 is past Free's five seats: Pro, with the reason on the card
    expect(await screen.findByRole("heading", { name: "Pro" })).toBeInTheDocument();
    expect(screen.getByText("$20")).toBeInTheDocument();
    expect(screen.getByText("/ user / month")).toBeInTheDocument();
    expect(screen.getByText(/A crew of 16 – 50 is past Free's 5 seats/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Pro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue for free" })).toBeInTheDocument();
    // no add-on catalogue here any more: that lives in Settings › Billing
    expect(screen.queryByText("Map & Field Ops")).not.toBeInTheDocument();
  });

  it("opens a blank workspace after the selected onboarding setup", async () => {
    render(<App />);

    await signUp({ email: "ops@asphalt.test" });
    await chooseBusinessType("Asphalt");
    // the size answers that recommend Business, then that plan (add-ons are Settings' now)
    await chooseSizeAndPlan("Business");
    // last step: invite the team — skippable
    fireEvent.click(await screen.findByRole("button", { name: "Skip for now" }));

    // Onboarding completes straight into the Dashboard — no HUD launcher in between.
    expect(await screen.findByRole("dialog", { name: "Your BuildFlow workspace is ready" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip Tutorial" }));
    expect(await screen.findByRole("heading", { name: "Pending Approvals" })).toBeInTheDocument();
    expect(screen.getByText("Asphalt workspace")).toBeInTheDocument();
    expect(window.localStorage.getItem("buildflow.businessType")).toBe("Asphalt");
    expect(window.localStorage.getItem("buildflow.selectedPlan")).toBe("business");
    expect(JSON.parse(window.localStorage.getItem("buildflow.selectedProducts") ?? "[]")).toEqual([]);
    // "51 – 200" people is recorded as 75 seats (onboarding/recommendPlan.ts, TEAM_OPTIONS)
    expect(fetch).toHaveBeenCalledWith(
      "/api/business-profile",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          businessType: "Asphalt",
          selectedPlan: "business",
          selectedProducts: [],
          seats: 75
        })
      })
    );
    expect(screen.getAllByText(/Business plan/).length).toBeGreaterThan(0);
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
      products: ["Time Cards"],
      plan: "Business"
    });

    expect(await screen.findByRole("dialog", { name: "Your BuildFlow workspace is ready" })).toBeInTheDocument();
    // add-ons are not an onboarding question any more (2026-09-22), so the intro names the trade and the plan
    expect(screen.getByText(/BuildFlow is set up for Asphalt on the Business plan/)).toBeInTheDocument();

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
    // (Map & Field Ops was an add-on until 2026-09-22 — in the backlog, docs/backlog.md — and Equipment
    // Tracking until 2026-09-23, when the Equipment page became part of every plan: its lesson is core now)
    const withTwo = titlesFor(["time-cards", "schedule-ai"]);

    expect(withTwo).toContain("Time Cards lesson");
    expect(withTwo).toContain("AI lesson");
    expect(titlesFor(["time-cards"])).not.toContain("AI lesson");
    expect(core).not.toContain("Time Cards lesson");
    expect(core).toContain("Equipment");
    expect(withTwo).toHaveLength(core.length + 2);

    // and a product chosen twice still earns one lesson
    expect(titlesFor(["time-cards", "time-cards"])).toHaveLength(core.length + 1);
  });

  /**
   * The tutorial is a one-time thing (2026-09-15): seen once, never shown again, and the top
   * bar's Help-and-tutorial button that restarted it is gone. tutorial.test.tsx covers the
   * server record; this covers the top bar and the device-level memory across a remount.
   */
  it("shows the tutorial once: nothing in the top bar restarts it, and a second setup by the same person is not asked", async () => {
    const view = render(<App />);
    await completeOnboarding();
    fireEvent.click(await screen.findByRole("button", { name: "Skip Tutorial" }));

    expect(screen.queryByRole("button", { name: "Help and tutorial" })).not.toBeInTheDocument();
    expect(document.querySelector(".topbar-help-button")).toBeNull();

    view.unmount();
    render(<App />);
    await completeOnboarding({ email: "ops@asphalt.test", businessType: "Asphalt", products: [], plan: "Business" });
    expect(screen.queryByRole("dialog", { name: "Your BuildFlow workspace is ready" })).not.toBeInTheDocument();
  });

  it("returns to the landing page when the BuildFlow brand is clicked on a legal page", async () => {
    window.history.pushState(null, "", "/#privacy");
    render(<App />);

    expect(await screen.findByRole("heading", { name: /Your data, handled with care\./ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^BuildFlow$/ }));

    expect(await screen.findByRole("heading", { name: /^Precision by Default\./ })).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(screen.queryByRole("heading", { name: "Pending Approvals" })).not.toBeInTheDocument();
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
      users: [{ id: "u-guest", name: "Dana Fox", permission: "owner", title: "Owner", avatar: "DF" }],
      activeUser: { id: "u-guest", name: "Dana Fox", permission: "owner", title: "Owner", avatar: "DF" },
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
    expect(screen.getByLabelText("Crew lead")).toBeInTheDocument();
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

    // 2026-09-19: scoped to the crew form. The page being LEFT fades out rather than
    // vanishing now (skin §79), so for DUR.exit the Dashboard is still in the
    // document — inert and hidden from the accessibility tree, but a bare
    // getByText still reaches into it, and it has a "5" of its own.
    const sizePreview = document.querySelector<HTMLElement>(".crew-size-preview");
    expect(sizePreview).not.toBeNull();
    expect(within(sizePreview!).getByText("5")).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText("Crew lead"), { target: { value: "Dana Brooks" } });
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

  it("hides Customize and Reset layout when the board is stacked for a phone", async () => {
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
      expect(screen.queryByRole("button", { name: /Customize/ })).not.toBeInTheDocument();
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
  /**
   * The confirmation link is opened somewhere else — the mail client's tab, a phone — so this
   * tab only learns about it by asking (2026-09-15). Coming back to the tab asks; the pill leaves
   * the moment the answer says confirmed, and not before.
   */
  it("takes the Confirm-email pill down once the address is confirmed elsewhere, without a reload", async () => {
    const unverified = { ...bootstrapFixture, account: { email: "liam@example.com", emailVerifiedAt: null } };
    let verifiedAt: string | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/delayiq/early-warning") return new Response(JSON.stringify({ asOf: "2026-09-09", risks: [] }), { status: 200 });
      if (url.endsWith("/api/auth/me")) {
        const account = {
          id: "acct-1",
          orgId: "org-1",
          email: "liam@example.com",
          name: "Liam",
          role: "owner",
          createdAt: "2026-06-01T00:00:00.000Z",
          emailVerifiedAt: verifiedAt
        };
        const org = { id: "org-1", name: "Reyes Construction", plan: "free", createdAt: "2026-06-01T00:00:00.000Z" };
        return new Response(JSON.stringify({ account, org }), { status: 200 });
      }
      return new Response(JSON.stringify(unverified), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await enterDashboard();
    const pill = () => screen.queryByRole("button", { name: /Confirm liam@example.com/ });
    expect(pill()).toBeInTheDocument();
    const sessionReads = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/auth/me")).length;

    // coming back to the tab before confirming: asked, still unconfirmed, still there
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(sessionReads()).toBe(1));
    expect(pill()).toBeInTheDocument();

    // confirmed in the other tab; coming back again takes it down, no reload
    verifiedAt = "2026-09-15T12:00:00.000Z";
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(pill()).not.toBeInTheDocument());
    expect(sessionReads()).toBe(2);
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
    expect(today.getByRole("button", { name: "Open the Month calendar" })).toBeInTheDocument();
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
  /** The reset layout's order: the superintendent's reading order, every section full width. */
  const FULL_WIDTH_ORDER = [
    "today",
    "quick",
    "kpis",
    "approvals",
    "alerts",
    "recommendations",
    "weather",
    "stats",
    "readiness",
    "conflicts",
    "inspections",
    "meetings",
    "apps"
  ];
  const boardOrder = () =>
    Array.from(document.querySelectorAll<HTMLElement>(".dash-board .dash-block")).map((node) => node.dataset.dashDragId);
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

    /* Reset (2026-09-15): every section full width, one under the next, in the reading order,
       the removed ones back — and SAVED, to this device and to the account, so the next login
       opens on it. It used to clear the board instead. */
    fireEvent.click(screen.getByRole("button", { name: /Reset layout/ }));
    expect(await screen.findByRole("heading", { name: "Weather Impact" })).toBeInTheDocument();
    expect(screen.getByText("Schedule Intelligence")).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem(key) ?? "{}") as {
      items: Array<{ id: string; x: number; w: number }>;
      hidden: string[];
      fit?: boolean;
    };
    expect(saved.hidden).toEqual([]);
    expect(saved.fit).toBe(true);
    expect(saved.items.every((item) => item.x === 0 && item.w === 6)).toBe(true);
    expect(saved.items.map((item) => item.id)).toEqual(FULL_WIDTH_ORDER);
    expect(boardOrder()).toEqual(FULL_WIDTH_ORDER);
    await waitFor(() => expect(settingsWrites(fetchMock).length).toBeGreaterThan(0), { timeout: 3000 });
    const last = settingsWrites(fetchMock).at(-1)!;
    expect(last.url).toBe("/api/me/settings/dash:layout");
    expect(JSON.parse(last.value).items.every((item: { w: number }) => item.w === 6)).toBe(true);
  });

  it("opens the next login on the reset layout, as saved", async () => {
    const key = `bf:dash:layout:${bootstrapFixture.activeUser.id}`;
    localStorage.removeItem(key);
    let y = 0;
    const account = JSON.stringify({
      items: FULL_WIDTH_ORDER.map((id) => {
        const item = { id, x: 0, y, w: 6, h: 4 };
        y += 4;
        return item;
      }),
      hidden: [],
      fit: true
    });
    const fetchMock = dashboardFetch({ userSettings: { "dash:layout": account } });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await enterDashboard();
    await screen.findByRole("heading", { name: "Today's plan" });
    expect(boardOrder()).toEqual(FULL_WIDTH_ORDER);
    expect(screen.getByRole("button", { name: /Reset layout/ })).toBeInTheDocument();
  });

  /**
   * Asked for on 2026-09-15: the layout controls moved DOWN off the date line, to sit beside
   * the lede ("Your AI-powered hub…"). The lede and the stack share one row, so the controls
   * cannot drift back up to the date, and the stack keeps its order: Reset, then + and Customize.
   */
  it("keeps the layout controls beside the lede, off the date line", async () => {
    vi.stubGlobal("fetch", dashboardFetch());
    render(<App />);
    await enterDashboard();

    const lede = screen.getByText("Your AI-powered hub for construction scheduling, insights, and execution.");
    const row = lede.closest(".hs-home-subline") as HTMLElement | null;
    expect(row).not.toBeNull();
    const stack = within(row!)
      .getByRole("button", { name: /Reset layout/ })
      .closest(".hs-home-topline-actions") as HTMLElement;
    expect(
      within(stack)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label") ?? button.textContent?.trim())
    ).toEqual(["Reset layout", "Add a section", "Customize"]);
    // the date line above carries the date alone now
    const dateLine = document.querySelector(".hs-home-topline") as HTMLElement;
    expect(dateLine).not.toContainElement(stack);
    expect(within(dateLine).queryByRole("button")).toBeNull();
  });

  /**
   * The rearrange mode is back (2026-09-15), entered from the Customize button under Reset
   * layout. Outside the mode nothing on a panel offers to hide it; inside it the corner control
   * does, the hidden panel waits under "Hidden panels", and the board is saved to the account
   * and to this device — the round trip the mode exists for.
   */
  it("hides a panel from Customize, keeps it under Hidden panels, and saves the board to the account and this device", async () => {
    const key = `bf:dash:layout:${bootstrapFixture.activeUser.id}`;
    localStorage.removeItem(key);
    const fetchMock = dashboardFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await enterDashboard();

    // outside Customize there is nothing to move, size or remove a section with
    expect(screen.queryByRole("button", { name: "Remove Weather Impact" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Move Weather Impact/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resize Weather Impact" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Customize$/ }));
    expect(screen.getByRole("button", { name: /^Done$/ })).toHaveAttribute("aria-pressed", "true");
    // and inside it, all three
    expect(screen.getByRole("button", { name: /^Move Weather Impact/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resize Weather Impact" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Weather Impact" }));
    expect(screen.queryByRole("heading", { name: "Weather Impact" })).not.toBeInTheDocument();
    const hidden = screen.getByRole("group", { name: "Hidden panels" });
    expect(within(hidden).getByRole("button", { name: "Show Weather Impact" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(key) ?? "{}")).toMatchObject({ hidden: ["weather"] });
    await waitFor(() => expect(settingsWrites(fetchMock)).toHaveLength(1), { timeout: 3000 });
    const saved = JSON.parse(settingsWrites(fetchMock)[0].value) as { items: Array<{ id: string }>; hidden: string[] };
    expect(settingsWrites(fetchMock)[0].url).toBe("/api/me/settings/dash:layout");
    expect(saved.hidden).toEqual(["weather"]);
    expect(saved.items.map((item) => item.id)).not.toContain("weather");

    fireEvent.click(within(hidden).getByRole("button", { name: "Show Weather Impact" }));
    expect(screen.getByRole("heading", { name: "Weather Impact" })).toBeInTheDocument();
    await waitFor(() => expect(settingsWrites(fetchMock)).toHaveLength(2), { timeout: 3000 });
    expect(JSON.parse(settingsWrites(fetchMock)[1].value).hidden).toEqual([]);

    // Done leaves the mode, and the controls go with it
    fireEvent.click(screen.getByRole("button", { name: /^Done$/ }));
    expect(screen.queryByRole("button", { name: "Remove Weather Impact" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Move Weather Impact/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resize Weather Impact" })).not.toBeInTheDocument();
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
