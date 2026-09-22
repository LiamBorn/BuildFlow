/* Shared harness for whole-app tests: the fake BuildFlow API, the fixtures it
   answers with, and the navigation helpers every area test needs. Import
   `installAppHarness()` at the top of a describe block; flip `state.*` inside a
   test to change what the fake server says. */
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { bootstrapFixture } from "./fixture";
import type { WorkspacesPayload } from "@buildflow/shared";

// Every test renders the whole app; under a full-suite run the default 5s is not enough.
vi.setConfig({ testTimeout: 20_000, hookTimeout: 20_000 });

/** What the fake server answers with. Reset before every test by installAppHarness(). */
/** The person's one workspace, as GET /api/workspaces lists it: home, active, called by its trade. */
export const workspacesFixture: WorkspacesPayload = {
  workspaces: [
    {
      id: "org-home",
      name: "Reyes Construction",
      title: "Asphalt",
      businessType: "Asphalt",
      kind: "home",
      role: "owner",
      active: true,
      onboardingCompletedAt: "2026-06-01T00:00:00.000Z",
      trialEndsAt: null,
      createdAt: "2026-06-01T00:00:00.000Z"
    }
  ],
  activeId: "org-home",
  limit: 3,
  remaining: 3
};

export const state = {
  bootstrapPayload: bootstrapFixture as typeof bootstrapFixture,
  businessProfilePayload: bootstrapFixture as typeof bootstrapFixture,
  oauthProviders: { google: false, microsoft: false } as { google: boolean; microsoft: boolean },
  workspacesPayload: workspacesFixture as WorkspacesPayload
};

// The workspace a business profile provisions: real people, no production data yet.
export const blankWorkspaceFixture: typeof bootstrapFixture = {
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
// a just-registered org: the owner exists as a person already, but no trade has been picked
export const newOrgWorkspaceFixture: typeof bootstrapFixture = {
  ...blankWorkspaceFixture,
  onboardingCompletedAt: null,
  users: [{ id: "u-owner", name: "Jordan Reyes", permission: "owner", title: "Owner", avatar: "JR", accountId: "acct-1", isSample: false }],
  activeUser: {
    id: "u-owner",
    name: "Jordan Reyes",
    permission: "owner",
    title: "Owner",
    avatar: "JR",
    accountId: "acct-1",
    isSample: false
  }
};

// The /api/bootstrap response for the test in flight. `signUp()` points this at the
// new-org payload; `beforeEach` resets it to the populated workspace.

// What applying a business profile provisions. Blank by default — that's the point of
// onboarding — but the map/routing tests need real jobs and crews to plan across.

// company is required at signup; the password has to pass the shared policy (no common words)

export const ACCOUNT = { name: "Jordan Reyes", company: "Reyes Construction", email: "ops@buildflow.test", password: "Reyes-Paving-2026" };

/** The default BuildFlow API responder. Tests that stub fetch to intercept a
  third-party API (routing, geocoding) must delegate everything else here rather
  than answering bootstrap themselves — otherwise `bootstrapPayload` is ignored
  and signup never reaches the onboarding questions. */
// Which sign-in providers the fake server says are configured; tests flip this.

export function respondToBuildflowApi(input: RequestInfo | URL) {
  if (String(input).includes("/api/auth/oauth/status")) {
    return new Response(JSON.stringify({ providers: state.oauthProviders }), { status: 200 });
  }
  const url = String(input);
  if (url.includes("/api/business-profile")) {
    return new Response(JSON.stringify(state.businessProfilePayload), { status: 200 });
  }
  if (url.includes("/api/bootstrap")) {
    return new Response(JSON.stringify(state.bootstrapPayload), { status: 200 });
  }
  if (url.includes("/api/workspaces")) {
    return new Response(JSON.stringify(state.workspacesPayload), { status: 200 });
  }
  // Everything else (auth, creates, patches) just needs a 200 with a plausible body.
  return new Response(JSON.stringify(bootstrapFixture), { status: 200 });
}

// The clock is pinned to 2026-06-16 in src/test/setup.ts, inside the week the
// fixtures are dated in — see the comment there for why it has to happen that early.
/** Sign in through the real login form. The workspace has users, so this lands
    straight on the dashboard. */
export async function enterDashboard() {
  fireEvent.click(await screen.findByRole("button", { name: /^Login from welcome navigation$/ }));
  fireEvent.change(await screen.findByLabelText("Email"), { target: { value: ACCOUNT.email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: ACCOUNT.password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByLabelText("Search BuildFlow");
}

/** Reach the signup form the way the landing offers it today: nav "Log in" → "Create an account".
    (The hero's "Get BuildFlow" CTA is a pre-launch casualty; the nav pair is stable.) */
export async function openCreateAccount() {
  fireEvent.click(await screen.findByRole("button", { name: /^Login from welcome navigation$/ }));
  await screen.findByRole("heading", { name: "Welcome back." });
  fireEvent.click(screen.getByRole("button", { name: "Create an account" }));
  await screen.findByRole("heading", { name: "Create your workspace." });
}

/** Which rail hub a page lives under since the HubSpot-style rail (2026-09-04). */
export const HUB_OF: Record<string, string> = {
  Projects: "Operations",
  Crews: "Operations",
  Contacts: "Sales",
  Companies: "Sales",
  Deals: "Sales",
  Equipment: "Resources",
  Materials: "Resources",
  "Field Updates": "Field",
  "Map & Field Ops": "Field",
  DelayIQs: "Field"
};
/** Open an app page from the rail: hover its hub (React listens to mouseover, not mouseenter), then pick it from the flyout. */
export async function openAppPage(item: string) {
  const hub = HUB_OF[item];
  if (!hub) throw new Error(`openAppPage: no hub mapped for ${item}`);
  const hubButton = await screen.findByRole("button", { name: new RegExp(`^${hub}( \\(.*\\))?$`) });
  fireEvent.mouseOver(hubButton);
  fireEvent.click(await screen.findByRole("menuitem", { name: new RegExp(`^${item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }));
}

/** Open the Schedule page from the app sidebar. The board opens on Month, so the
    crew-by-day grid, its queue, and the week controls need an explicit view. */
export async function openSchedule(view?: "Month" | "Week" | "List" | "Gantt" | "Kanban" | "Matrix") {
  const hub = await screen.findByRole("button", { name: /^Schedule( \(.*\))?$/i });
  if (!view) {
    fireEvent.click(hub);
    // the Schedule page is a landing since 2026-09-08; the six views live on their own pages
    await screen.findByRole("heading", { name: "The whole plan, at a glance." });
    return;
  }
  // a view is its own page under the Schedule hub: hover the hub, pick it from the flyout
  fireEvent.mouseOver(hub);
  fireEvent.click(await screen.findByRole("menuitem", { name: new RegExp(`^${view}`) }));
}

/** Register through the real signup form as a brand-new org, which lands on the
    first onboarding question. Leaves the caller on #business-type. */
export async function signUp({ email = ACCOUNT.email }: { email?: string } = {}) {
  state.bootstrapPayload = newOrgWorkspaceFixture;
  await openCreateAccount();
  fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: ACCOUNT.name } });
  fireEvent.change(screen.getByLabelText("Company"), { target: { value: ACCOUNT.company } });
  fireEvent.change(screen.getByLabelText("Work email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: ACCOUNT.password } });
  fireEvent.click(screen.getByLabelText("I agree to the"));
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  await screen.findByRole("heading", { name: "What type of Business do you own" });
}

/** Answer the business-type question, landing on #additional-products. */
export async function chooseBusinessType(businessType: string) {
  // trade cards are radios labelled by the trade name inside the "Business type" group
  fireEvent.click(await screen.findByRole("radio", { name: businessType }));
  fireEvent.click(screen.getByRole("button", { name: "Get BuildFlow" }));
  await screen.findByRole("heading", { name: "What additional products do you want to use?" });
}

/** Pick products and a plan, then continue. This completes onboarding and lands
    straight in the app (the HUD launcher that used to sit here was removed). */
export async function chooseProductsAndPlan(products: string[], plan: string) {
  for (const product of products) {
    const productCheckbox = await screen.findByLabelText(new RegExp(product));
    if (!(productCheckbox as HTMLInputElement).checked) {
      fireEvent.click(productCheckbox);
    }
  }
  fireEvent.click(screen.getByRole("button", { name: `Select ${plan} plan` }));
  fireEvent.click(screen.getByRole("button", { name: "Continue to BuildFlow" }));
  // last step: invite the team — skippable
  fireEvent.click(await screen.findByRole("button", { name: "Skip for now" }));
}

export async function completeOnboarding({
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
  // Applying the business profile provisions the workspace, so bootstrap answers
  // with it from here on rather than with the pre-onboarding new-org payload.
  state.bootstrapPayload = state.businessProfilePayload;
  await chooseProductsAndPlan(products, plan);
  // Onboarding completes straight into the Dashboard now.
  await screen.findByLabelText("Search BuildFlow");
}

/** Reach Map & Field Ops from the app sidebar (it used to be a HUD launch tile). */
export async function openMapFieldOps() {
  await signUp({ email: "route@buildflow.test" });
  await chooseBusinessType("Asphalt");
  state.bootstrapPayload = state.businessProfilePayload;
  await chooseProductsAndPlan(["Map & Field Ops"], "Business");
  fireEvent.click(await screen.findByRole("button", { name: "Skip Tutorial" }));
  await openAppPage("Map & Field Ops");
  // Live Map is a grid of job-site cards since 2026-09-06 (the embedded map is gone)
  await screen.findByRole("heading", { name: "Job sites" });
}

/** beforeEach/afterEach for a describe block: fresh fake server, clean storage, clean URL. */
export function installAppHarness() {
  beforeEach(() => {
    state.oauthProviders = { google: false, microsoft: false };
    state.bootstrapPayload = bootstrapFixture;
    state.businessProfilePayload = blankWorkspaceFixture;
    state.workspacesPayload = workspacesFixture;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => respondToBuildflowApi(input))
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    window.history.pushState(null, "", "/");
  });
}
