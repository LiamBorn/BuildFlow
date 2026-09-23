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
  await screen.findByRole("heading", { name: "Let's start with you." });
}

/** Which rail hub a page lives under since the HubSpot-style rail (2026-09-04). */
export const HUB_OF: Record<string, string> = {
  Projects: "Operations",
  Crews: "Operations",
  Inventory: "Resources",
  "Field Updates": "Field",
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

/** Open the Schedule page from the app sidebar: the landing, or one of its three views. */
export async function openSchedule(view?: "Month" | "Gantt" | "Kanban") {
  const hub = await screen.findByRole("button", { name: /^Schedule( \(.*\))?$/i });
  if (!view) {
    fireEvent.click(hub);
    // the Schedule page is a landing since 2026-09-08; the views live on their own pages
    await screen.findByRole("heading", { name: "The whole plan, at a glance." });
    return;
  }
  // a view is its own page under the Schedule hub: hover the hub, pick it from the flyout
  fireEvent.mouseOver(hub);
  fireEvent.click(await screen.findByRole("menuitem", { name: new RegExp(`^${view}`) }));
}

/** Register through the real signup form as a brand-new org, which lands on the
    first onboarding question. Leaves the caller on #business-type. */
/** Signing up is the first two of the five onboarding steps (2026-09-22): the person, then the
    business — that second Next is the signup — and it lands on the trade question. */
export async function signUp({ email = ACCOUNT.email }: { email?: string } = {}) {
  state.bootstrapPayload = newOrgWorkspaceFixture;
  await openCreateAccount();
  const [firstName, ...rest] = ACCOUNT.name.split(" ");
  fireEvent.change(await screen.findByLabelText("First name"), { target: { value: firstName } });
  fireEvent.change(screen.getByLabelText("Last name"), { target: { value: rest.join(" ") } });
  fireEvent.change(screen.getByLabelText("Work email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: ACCOUNT.password } });
  fireEvent.click(screen.getByLabelText("I agree to the"));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(await screen.findByLabelText("Business name"), { target: { value: ACCOUNT.company } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: "What type of construction business do you own?" });
}

/** Answer the trade question, landing on the size question (#additional-products). */
export async function chooseBusinessType(businessType: string) {
  // trade tiles are radios labelled by the trade name inside the "Business type" group
  fireEvent.click(await screen.findByRole("radio", { name: businessType }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: /How big is/ });
}

/** The size answers that make the rule recommend each plan (see onboarding/recommendPlan.ts). */
const SIZE_FOR_PLAN: Record<string, { revenue: string; team: string }> = {
  Free: { revenue: "Just starting out", team: "Just me" },
  Pro: { revenue: "$25k – $100k / month", team: "16 – 50" },
  Business: { revenue: "$500k – $2M / month", team: "51 – 200" },
  Enterprise: { revenue: "$2M+ / month", team: "200+" }
};
/** Answer the size question so the card recommends `plan`, then take that plan. */
export async function chooseSizeAndPlan(plan: "Free" | "Pro" | "Business") {
  const size = SIZE_FOR_PLAN[plan];
  fireEvent.click(await screen.findByRole("radio", { name: size.revenue }));
  fireEvent.click(screen.getByRole("radio", { name: size.team }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: plan });
  fireEvent.click(screen.getByRole("button", { name: plan === "Free" ? "Continue for free" : `Continue with ${plan}` }));
}

export async function completeOnboarding({
  email = ACCOUNT.email,
  businessType = "Concrete",
  products = [],
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
  /* Add-ons are not asked at onboarding any more (2026-09-22): they are bought in Settings ›
     Billing. `products` is still accepted so the call sites that name them read as they did;
     every onboarding records none. Enterprise ends in a sales conversation, not a workspace,
     so it is asked for here as Pro. */
  void products;
  await chooseSizeAndPlan(plan === "Enterprise" ? "Pro" : plan);
  // last step: invite the team — skippable
  fireEvent.click(await screen.findByRole("button", { name: "Skip for now" }));
  // Onboarding completes straight into the Dashboard now.
  await screen.findByLabelText("Search BuildFlow");
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
