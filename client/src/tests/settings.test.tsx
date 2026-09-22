/* Settings area: the page opens from the top bar / rail, the category rail
   switches panels, and the real Team / General / profile / Billing panels talk
   to their APIs. Replaces the quarantined Settings tests in App.test.tsx. */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BootstrapPayload, TeamInvite } from "@buildflow/shared";
import App from "../App";
import { ACCOUNT, enterDashboard, installAppHarness, openSchedule, respondToBuildflowApi, state } from "../test/appHarness";
import { bootstrapFixture } from "../test/fixture";

/* The signed-in owner. The top bar and the Settings rail address the account as
   "Liam Santos" / "Liam", so the workspace the fake server answers with is Liam's:
   the profile category's title then reads as the active user's first name either way. */
const LIAM = {
  id: "u-liam",
  name: "Liam Santos",
  permission: "owner",
  title: "Owner",
  avatar: "LS",
  accountId: "acct-liam",
  isSample: false
} as const;
const SAMPLE_CARLOS = { ...bootstrapFixture.users[1], isSample: true, accountId: null } as const;

function liamWorkspace(overrides: Partial<BootstrapPayload> = {}): BootstrapPayload {
  return {
    ...bootstrapFixture,
    users: [LIAM, SAMPLE_CARLOS],
    activeUser: LIAM,
    account: { email: ACCOUNT.email, emailVerifiedAt: null },
    businessType: "Concrete",
    ...overrides
  };
}

const pendingInvite: TeamInvite = {
  id: "inv-1",
  email: "sam.rivera@buildflow.test",
  // The one thing an invite decides: what this login may do once it is accepted.
  permission: "member",
  invitedBy: "acct-liam",
  createdAt: "2026-06-10T09:00:00.000Z",
  expiresAt: "2026-06-24T09:00:00.000Z",
  sentAt: "2026-06-10T09:00:00.000Z"
};

type Handler = (url: string, init: RequestInit | undefined) => Response | undefined;

/** Route a few endpoints to the test; everything else falls through to the shared fake server. */
function stubApi(handler: Handler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    return handler(url, init) ?? respondToBuildflowApi(input);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const isMethod = (init: RequestInit | undefined, method: string) => (init?.method ?? "GET").toUpperCase() === method;
const bodyOf = (call: [RequestInfo | URL, RequestInit?]) => JSON.parse(String(call[1]?.body ?? "null"));
const callsTo = (fetchMock: ReturnType<typeof stubApi>, path: string, method = "GET") =>
  fetchMock.mock.calls.filter(([input, init]) => String(input).endsWith(path) && isMethod(init as RequestInit | undefined, method)) as [
    RequestInfo | URL,
    RequestInit?
  ][];

async function openSettings() {
  fireEvent.click(await screen.findByRole("button", { name: "Liam Santos account" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
  return screen.findByLabelText("Settings categories");
}

async function openSettingsCategory(label: string) {
  const rail = await openSettings();
  fireEvent.click(within(rail).getAllByRole("button", { name: label })[0]);
  return rail;
}

describe("Settings", () => {
  installAppHarness();

  // replaces "opens Settings from the schedule username button"
  it("opens Settings from the top-bar account menu and closes back to the page it came from", async () => {
    state.bootstrapPayload = liamWorkspace();
    render(<App />);
    await enterDashboard();
    await openSchedule();

    // the top-bar control is avatar-only; the name and role live in the menu it opens
    const accountButton = screen.getByRole("button", { name: "Liam Santos account" });
    expect(accountButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(accountButton);

    const accountMenu = screen.getByRole("menu", { name: "Account menu" });
    expect(within(accountMenu).getByText("Liam Santos")).toBeInTheDocument();
    expect(within(accountMenu).getByText("Workspace Owner")).toBeInTheDocument();
    expect(within(accountMenu).getByRole("menuitem", { name: "Log out" })).toBeInTheDocument();
    fireEvent.click(within(accountMenu).getByRole("menuitem", { name: "Settings" }));

    // lands on Preferences with the category rail beside it
    expect(await screen.findByRole("heading", { level: 1, name: "Preferences" })).toBeInTheDocument();
    const rail = screen.getByLabelText("Settings categories");
    expect(within(rail).getByRole("button", { name: "Preferences" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("heading", { name: "The whole plan, at a glance." })).not.toBeInTheDocument();

    // closing returns to the Schedule landing, not the dashboard
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(await screen.findByRole("heading", { name: "The whole plan, at a glance." })).toBeInTheDocument();
    // 2026-09-19: the page being left now fades out rather than vanishing (skin §79),
    // so for DUR.exit it is still in the document — inert, hidden from the
    // accessibility tree, and behind. It leaves for good a moment later.
    await waitFor(() => expect(screen.queryByLabelText("Settings categories")).not.toBeInTheDocument());
  });

  // replaces "shows the same account settings button on every app category"
  it("keeps the account menu and the Settings controls on every rail hub", async () => {
    state.bootstrapPayload = liamWorkspace();
    render(<App />);
    await enterDashboard();

    for (const hub of ["Schedule", "Operations", "Resources", "Field", "Reporting", "Home"]) {
      fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^${hub}( \\(.*\\))?$`) }));

      /* The two gears used to be both labelled "Settings" and this counted them.
         They now do different things -- the top bar's opens the layout
         Preferences panel, the rail's opens the Settings page -- so the useful
         assertion is that they are distinguishable by name, not that there are
         two of the same name. */
      expect(await screen.findByRole("button", { name: "Settings" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Layout preferences" })).toBeInTheDocument();

      const accountButton = screen.getByRole("button", { name: "Liam Santos account" });
      fireEvent.click(accountButton);
      const accountMenu = screen.getByRole("menu", { name: "Account menu" });
      expect(within(accountMenu).getByText("Liam Santos")).toBeInTheDocument();
      expect(within(accountMenu).getByText("Workspace Owner")).toBeInTheDocument();
      expect(within(accountMenu).getByRole("menuitem", { name: "Settings" })).toHaveAttribute("title", "Settings");
      expect(within(accountMenu).queryByText("Demo role")).not.toBeInTheDocument();

      fireEvent.click(accountButton);
      await waitFor(() => expect(screen.queryByRole("menu", { name: "Account menu" })).not.toBeInTheDocument());
    }

    // the rail gear opens the same page as the menu item
    fireEvent.click(screen.getAllByRole("button", { name: "Settings" })[0]);
    expect(await screen.findByRole("heading", { level: 1, name: "Preferences" })).toBeInTheDocument();
  });

  // replaces "switches between every Settings category from the category rail"
  it("switches between every Settings category from the category rail", async () => {
    state.bootstrapPayload = liamWorkspace();
    stubApi((url) => (url.endsWith("/api/team") ? json({ users: [LIAM, SAMPLE_CARLOS], invites: [], emailVerified: true }) : undefined));
    render(<App />);
    await enterDashboard();
    const rail = await openSettings();

    for (const group of ["Account", "Workspace", "Features", "Admin"]) {
      expect(within(rail).getByRole("heading", { name: group })).toBeInTheDocument();
    }

    // [rail label, page title, a heading inside the panel]
    const categories = [
      ["Liam", "Liam", "Name and email"],
      ["Preferences", "Preferences", "Appearance"],
      ["Notifications", "Notifications", "Alerts"],
      ["Mail & Calendar", "Mail & Calendar", "Calendar"],
      ["General", "General", "Company and trade"],
      ["Work calendar", "Work calendar", "Working week"],
      ["People", "People", "Team"],
      ["Import", "Import", "Import tools"],
      ["BuildFlow AI", "BuildFlow AI", "AI assistance"],
      ["Connections", "Connections", "Connected apps"],
      ["Public schedules", "Public schedules", "Sharing"],
      ["Teams", "Teams", "Team setup"],
      ["Security", "Security", "Protection"],
      ["Billing", "Billing", /^Free plan/]
    ] as const;

    for (const [label, title, section] of categories) {
      // "BuildFlow AI" also has the rail's spotlight button; the first match is the nav item
      const categoryButton = within(rail).getAllByRole("button", { name: label })[0];
      fireEvent.click(categoryButton);

      expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
      expect(await screen.findByRole("heading", { level: 2, name: section })).toBeInTheDocument();
      expect(categoryButton).toHaveAttribute("aria-current", "page");
      expect(within(rail).getAllByRole("button", { current: "page" })).toHaveLength(label === "BuildFlow AI" ? 2 : 1);
    }
  });

  // replaces "lets a workspace owner invite people and change member roles" (roster half)
  it("shows the Team roster with you/Sample tags and the pending invites from /api/team", async () => {
    state.bootstrapPayload = liamWorkspace();
    stubApi((url) =>
      url.endsWith("/api/team") ? json({ users: [LIAM, SAMPLE_CARLOS], invites: [pendingInvite], emailVerified: true }) : undefined
    );
    render(<App />);
    await enterDashboard();
    await openSettingsCategory("People");

    expect(screen.getByRole("heading", { level: 1, name: "People" })).toBeInTheDocument();
    const team = screen.getByRole("region", { name: "Team" });
    expect(await within(team).findByRole("heading", { name: "Pending invites (1)" })).toBeInTheDocument();
    expect(within(team).getByRole("heading", { name: "Members (2)" })).toBeInTheDocument();
    expect(within(team).getByText("1 with logins · 1 sample")).toBeInTheDocument();
    // a confirmed owner sees no "held" notice
    expect(within(team).queryByText(/Invites go out once you confirm your own email/)).not.toBeInTheDocument();

    const me = within(team).getByText("Liam Santos").closest("article") as HTMLElement;
    expect(within(me).getByText("you")).toBeInTheDocument();
    expect(within(me).getByText("Owner")).toBeInTheDocument();
    // your own level is shown, never offered: it is not something you set on yourself
    expect(within(me).getByText("Workspace Owner")).toBeInTheDocument();
    expect(within(me).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(me).queryByRole("button", { name: /^Remove/ })).not.toBeInTheDocument();

    const sample = within(team).getByText("Carlos Ramirez").closest("article") as HTMLElement;
    expect(within(sample).getByText("Sample")).toBeInTheDocument();
    expect(within(sample).getByText("Seeded example — safe to remove")).toBeInTheDocument();
    expect(within(sample).getByRole("button", { name: "Remove Carlos Ramirez" })).toBeInTheDocument();

    const invite = within(team).getByText("sam.rivera@buildflow.test").closest("article") as HTMLElement;
    expect(within(invite).getByText(/^Sent .* · expires /)).toBeInTheDocument();
    expect(within(invite).getByText("Member")).toBeInTheDocument();
    expect(within(invite).getByRole("button", { name: "Resend" })).toBeEnabled();
    expect(within(invite).getByRole("button", { name: "Withdraw invite for sam.rivera@buildflow.test" })).toBeInTheDocument();
  });

  // replaces "lets a workspace owner invite people and change member roles" (invite half)
  it("sends invites from the Team panel, reports held ones, and refuses bad emails", async () => {
    state.bootstrapPayload = liamWorkspace();
    let invites: TeamInvite[] = [];
    const fetchMock = stubApi((url, init) => {
      if (url.endsWith("/api/team/invites") && isMethod(init, "POST")) {
        const sent = JSON.parse(String(init?.body)) as { invites: Array<{ email: string; permission: string }> };
        invites = sent.invites.map((row, index) => ({
          ...pendingInvite,
          id: `inv-${index}`,
          email: row.email,
          permission: row.permission as TeamInvite["permission"],
          sentAt: null
        }));
        return json({
          results: [
            { email: sent.invites[0].email, status: "held" },
            { email: sent.invites[1].email, status: "skipped", reason: "already a member" }
          ],
          invites,
          emailVerified: false
        });
      }
      if (url.endsWith("/api/team")) return json({ users: [LIAM, SAMPLE_CARLOS], invites, emailVerified: false });
      return undefined;
    });
    render(<App />);
    await enterDashboard();
    await openSettingsCategory("People");

    const team = screen.getByRole("region", { name: "Team" });
    // the owner's email is unconfirmed, so the panel warns invites will be held
    expect(await within(team).findByText(/Invites go out once you confirm your own email/)).toBeInTheDocument();

    // a bad address is named in place and nothing is posted (submit the form itself:
    // jsdom's constraint validation would swallow a click on the button for an invalid type="email")
    fireEvent.change(within(team).getByLabelText("Email 1"), { target: { value: "not-an-email" } });
    fireEvent.submit(within(team).getByRole("button", { name: "Send invites" }).closest("form") as HTMLFormElement);
    expect(within(team).getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(within(team).getByLabelText("Email 1")).toHaveAttribute("aria-invalid", "true");
    expect(callsTo(fetchMock, "/api/team/invites", "POST")).toHaveLength(0);

    fireEvent.change(within(team).getByLabelText("Email 1"), { target: { value: " Sam.Rivera@buildflow.test " } });
    fireEvent.change(within(team).getByLabelText("Access level 1"), { target: { value: "admin" } });
    fireEvent.click(within(team).getByRole("button", { name: "+ Add another" }));
    fireEvent.change(within(team).getByLabelText("Email 2"), { target: { value: "carlos@buildflow.test" } });
    // a new row starts at the least it can be
    expect(within(team).getByLabelText("Access level 2")).toHaveValue("member");
    fireEvent.click(within(team).getByRole("button", { name: "Send invites" }));

    expect(await within(team).findByRole("status", { name: "" })).toBeInTheDocument();
    expect(
      within(team).getByText("1 held until you confirm your email. carlos@buildflow.test already has an account.")
    ).toBeInTheDocument();

    // emails are trimmed + lower-cased before they go out, with the level each row picked
    const posts = callsTo(fetchMock, "/api/team/invites", "POST");
    expect(posts).toHaveLength(1);
    expect(bodyOf(posts[0])).toEqual({
      invites: [
        { email: "sam.rivera@buildflow.test", permission: "admin" },
        { email: "carlos@buildflow.test", permission: "member" }
      ]
    });

    // the roster reloads with the held invite, the form resets to one blank row
    expect(await within(team).findByRole("heading", { name: "Pending invites (2)" })).toBeInTheDocument();
    const held = within(team).getByText("sam.rivera@buildflow.test").closest("article") as HTMLElement;
    expect(within(held).getByText("Held until your email is confirmed")).toBeInTheDocument();
    expect(within(held).getByRole("button", { name: "Resend" })).toBeDisabled();
    expect(within(team).getByLabelText("Email 1")).toHaveValue("");
    expect(within(team).queryByLabelText("Email 2")).not.toBeInTheDocument();
  });

  it("renames the company and re-tunes the trade from General", async () => {
    state.bootstrapPayload = liamWorkspace({ businessType: "" });
    const fetchMock = stubApi((url, init) => {
      if (url.endsWith("/api/auth/me"))
        return json({
          account: {
            id: "acct-liam",
            orgId: "org-1",
            email: ACCOUNT.email,
            name: LIAM.name,
            role: "owner",
            createdAt: "2026-01-05T09:00:00.000Z"
          },
          org: { id: "org-1", name: ACCOUNT.company, plan: "free", createdAt: "2026-01-05T09:00:00.000Z" }
        });
      if (url.endsWith("/api/org") && isMethod(init, "PATCH"))
        return json({ org: { id: "org-1", name: "Santos Concrete", plan: "free", createdAt: "2026-01-05T09:00:00.000Z" } });
      if (url.endsWith("/api/business-profile") && isMethod(init, "POST")) {
        // the org now carries the trade: the reload that follows sees it too
        state.bootstrapPayload = liamWorkspace({ businessType: "Concrete" });
        return json(state.bootstrapPayload);
      }
      return undefined;
    });
    render(<App />);
    await enterDashboard();
    await openSettingsCategory("General");

    const workspace = screen.getByRole("region", { name: "Company and trade" });
    const nameInput = within(workspace).getByLabelText("Company name");
    await waitFor(() => expect(nameInput).toHaveValue(ACCOUNT.company));

    fireEvent.change(nameInput, { target: { value: " Santos Concrete " } });
    fireEvent.click(within(workspace).getByRole("button", { name: "Save name" }));
    expect(await within(workspace).findByText("Company name saved.")).toBeInTheDocument();
    const renames = callsTo(fetchMock, "/api/org", "PATCH");
    expect(renames).toHaveLength(1);
    expect(bodyOf(renames[0])).toEqual({ name: "Santos Concrete" });

    // no trade yet: Apply stays off until one is chosen
    const tradeSelect = within(workspace).getByLabelText("Trade");
    expect(tradeSelect).toHaveValue("");
    const applyButton = within(workspace).getByRole("button", { name: "Apply trade" });
    expect(applyButton).toBeDisabled();
    fireEvent.change(tradeSelect, { target: { value: "Concrete" } });
    expect(applyButton).toBeEnabled();
    fireEvent.click(applyButton);

    expect(
      await within(workspace).findByText("BuildFlow is now tuned for concrete work. Your projects and crews are untouched.")
    ).toBeInTheDocument();
    const profiles = callsTo(fetchMock, "/api/business-profile", "POST");
    expect(profiles).toHaveLength(1);
    expect(bodyOf(profiles[0])).toEqual({ businessType: "Concrete" });
    // the workspace now carries the trade, so re-applying the same one is a no-op
    await waitFor(() => expect(within(workspace).getByRole("button", { name: "Apply trade" })).toBeDisabled());
  });

  it("updates the login name and email from the profile panel", async () => {
    state.bootstrapPayload = liamWorkspace();
    const fetchMock = stubApi((url, init) => {
      if (url.endsWith("/api/auth/account") && isMethod(init, "PATCH")) {
        const patch = JSON.parse(String(init?.body)) as { name?: string; email?: string };
        return json({
          account: {
            id: "acct-liam",
            orgId: "org-1",
            email: patch.email ?? ACCOUNT.email,
            name: patch.name ?? LIAM.name,
            role: "owner",
            createdAt: "2026-01-05T09:00:00.000Z",
            emailVerifiedAt: null
          },
          verificationSent: Boolean(patch.email)
        });
      }
      return undefined;
    });
    render(<App />);
    await enterDashboard();
    await openSettingsCategory("Liam");

    expect(screen.getByRole("heading", { level: 1, name: "Liam" })).toBeInTheDocument();
    const login = screen.getByRole("region", { name: "Name and email" });
    expect(within(login).getByText(`${ACCOUNT.email} is not confirmed yet.`)).toBeInTheDocument();
    const nameInput = within(login).getByLabelText("Your name");
    const emailInput = within(login).getByLabelText("Email");
    expect(nameInput).toHaveValue("Liam Santos");
    expect(emailInput).toHaveValue(ACCOUNT.email);

    // nothing changed → nothing posted
    fireEvent.click(within(login).getByRole("button", { name: "Save" }));
    expect(within(login).getByText("Nothing to save.")).toBeInTheDocument();
    expect(callsTo(fetchMock, "/api/auth/account", "PATCH")).toHaveLength(0);

    fireEvent.change(emailInput, { target: { value: "bad@" } });
    fireEvent.submit(within(login).getByRole("button", { name: "Save" }).closest("form") as HTMLFormElement);
    expect(within(login).getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(callsTo(fetchMock, "/api/auth/account", "PATCH")).toHaveLength(0);

    fireEvent.change(nameInput, { target: { value: " Liam J. Santos " } });
    fireEvent.change(emailInput, { target: { value: "Liam@Santos-Concrete.test" } });
    fireEvent.click(within(login).getByRole("button", { name: "Save" }));

    expect(
      await within(login).findByText(
        "Saved. We sent a confirmation link to liam@santos-concrete.test — open it to confirm the new address."
      )
    ).toBeInTheDocument();
    const patches = callsTo(fetchMock, "/api/auth/account", "PATCH");
    expect(patches).toHaveLength(1);
    expect(bodyOf(patches[0])).toEqual({ name: "Liam J. Santos", email: "liam@santos-concrete.test" });
  });

  it("shows the trial on Billing, starts checkout, and can fall back to Free", async () => {
    state.bootstrapPayload = liamWorkspace({
      selectedPlan: "pro",
      seats: 5,
      billingStatus: "trial",
      trialEndsAt: "2026-06-30T12:00:00.000Z"
    });
    const fetchMock = stubApi((url, init) => {
      if (url.endsWith("/api/billing/checkout") && isMethod(init, "POST"))
        return json({ configured: false, message: "Billing isn't connected in this test." });
      if (url.endsWith("/api/business-profile") && isMethod(init, "POST")) {
        state.bootstrapPayload = liamWorkspace({ selectedPlan: "free", seats: 5, billingStatus: "free" });
        return json(state.bootstrapPayload);
      }
      return undefined;
    });
    render(<App />);
    await enterDashboard();
    await openSettingsCategory("Billing");

    const billing = screen.getByRole("region", { name: /^Pro plan/ });
    expect(within(billing).getByRole("heading", { level: 2, name: /^Pro plan/ })).toHaveTextContent("Trial · 14 days left");
    expect(within(billing).getByText(/Nothing is charged during the trial\./)).toBeInTheDocument();
    expect(within(billing).getByText("5 seats · $100/mo")).toBeInTheDocument();
    expect(within(billing).getByLabelText("Plan")).toHaveValue("pro");
    expect(within(billing).getByLabelText("Seats")).toHaveValue(5);
    expect(within(billing).getByRole("button", { name: "Update plan" })).toBeDisabled();

    fireEvent.click(within(billing).getByRole("button", { name: "Add a payment method now" }));
    expect(await within(billing).findByRole("alert")).toHaveTextContent("Billing isn't connected in this test.");
    const checkouts = callsTo(fetchMock, "/api/billing/checkout", "POST");
    expect(checkouts).toHaveLength(1);
    expect(bodyOf(checkouts[0])).toEqual({
      plan: "pro",
      period: "monthly",
      seats: 5,
      email: ACCOUNT.email,
      returnTo: "settings",
      origin: window.location.origin
    });

    fireEvent.click(within(billing).getByRole("button", { name: "Switch to Free instead" }));
    expect(await within(billing).findByText("You're on Free. Nothing will be charged.")).toBeInTheDocument();
    const profiles = callsTo(fetchMock, "/api/business-profile", "POST");
    expect(profiles).toHaveLength(1);
    expect(bodyOf(profiles[0])).toEqual({ businessType: "Concrete", selectedPlan: "free", seats: 5 });
    // the reloaded workspace is on Free
    expect(await screen.findByRole("heading", { level: 2, name: /^Free plan/ })).toHaveTextContent("Free");
    expect(screen.queryByRole("button", { name: "Add a payment method now" })).not.toBeInTheDocument();
  });
  it("lets the owner change what a teammate may do, and never their own", async () => {
    const owner = {
      id: "u-owner",
      name: "Liam Santos",
      permission: "owner" as const,
      title: "Owner",
      avatar: "LS",
      accountId: "acct-1",
      isSample: false
    };
    const sam = {
      id: "u-sam",
      name: "Sam Ortiz",
      permission: "member" as const,
      title: "Teammate",
      avatar: "SO",
      accountId: "acct-2",
      isSample: false
    };
    state.bootstrapPayload = {
      ...bootstrapFixture,
      users: [owner, sam],
      activeUser: owner,
      account: { email: "liam@buildflow.test", emailVerifiedAt: "2026-06-01T00:00:00.000Z" }
    };
    const patches: Array<[string, unknown]> = [];
    let samLevel: "member" | "admin" = "member";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/team/users/") && init?.method === "PATCH") {
          const body = JSON.parse(String(init.body)) as { permission: "member" | "admin" };
          patches.push([url, body]);
          samLevel = body.permission;
          return new Response(JSON.stringify({ user: { ...sam, permission: samLevel } }), { status: 200 });
        }
        const roster = [owner, { ...sam, permission: samLevel }];
        if (url.endsWith("/api/team")) {
          return new Response(JSON.stringify({ users: roster, invites: [], emailVerified: true, canManage: true }), { status: 200 });
        }
        if (url.includes("/api/bootstrap")) {
          return new Response(JSON.stringify({ ...state.bootstrapPayload, users: roster }), { status: 200 });
        }
        return respondToBuildflowApi(input);
      })
    );
    render(<App />);
    await enterDashboard();
    await openSettingsCategory("People");

    const select = (await screen.findByLabelText("Access for Sam Ortiz")) as HTMLSelectElement;
    expect(select.value).toBe("member");
    // Owner is shown, never offered: ownership moves by transfer, not off a list.
    expect([...select.options].map((option) => option.value)).toEqual(["admin", "member"]);
    // and nobody sets their own level, so the owner's own row is a pill. Scoped to the roster:
    // the rail's account card names the viewer AND their level too, so the page says both twice.
    expect(screen.queryByLabelText("Access for Liam Santos")).not.toBeInTheDocument();
    const roster = select.closest(".settings-member-list") as HTMLElement;
    const myRow = within(roster).getByText("Liam Santos").closest("article") as HTMLElement;
    expect(within(myRow).getByText("Workspace Owner")).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "admin" } });
    await screen.findByText("Sam Ortiz is now an Admin.");
    expect(patches).toEqual([[expect.stringContaining("/api/team/users/u-sam"), { permission: "admin" }]]);
    expect(((await screen.findByLabelText("Access for Sam Ortiz")) as HTMLSelectElement).value).toBe("admin");
  });
});
