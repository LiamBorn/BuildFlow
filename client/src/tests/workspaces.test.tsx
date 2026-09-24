import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { bootstrapFixture } from "../test/fixture";
import {
  blankWorkspaceFixture,
  chooseBusinessType,
  enterDashboard,
  installAppHarness,
  newOrgWorkspaceFixture,
  respondToBuildflowApi,
  state,
  workspacesFixture
} from "../test/appHarness";

/* One login, several workspaces (2026-09-15). The Dashboard's switcher lists a person's
   BuildFlow programs by trade, switches between them, and creates one more -- up to three
   beside the first -- which then goes through the same onboarding the first one did. */
const HOME = workspacesFixture.workspaces[0];
const ROOFING = {
  ...HOME,
  id: "org-roofing",
  title: "Roofing",
  businessType: "Roofing" as const,
  kind: "extra" as const,
  active: false,
  trialEndsAt: "2026-06-21T12:00:00.000Z",
  createdAt: "2026-06-16T00:00:00.000Z"
};
const withActive = (workspaces: (typeof HOME)[], activeId: string) => ({
  ...workspacesFixture,
  activeId,
  remaining: 2,
  workspaces: workspaces.map((workspace) => ({ ...workspace, active: workspace.id === activeId }))
});

describe("workspaces", () => {
  installAppHarness();

  it("lists the person's workspaces by trade and switches the Dashboard to another one", async () => {
    let active = "org-home";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/workspaces/org-roofing/switch")) {
        active = "org-roofing";
        return new Response(JSON.stringify({ ...withActive([HOME, ROOFING], active), session: {} }), { status: 200 });
      }
      if (url.endsWith("/api/workspaces")) return new Response(JSON.stringify(withActive([HOME, ROOFING], active)), { status: 200 });
      if (url.includes("/api/bootstrap") && active === "org-roofing") {
        return new Response(JSON.stringify({ ...bootstrapFixture, businessType: "Roofing" }), { status: 200 });
      }
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "Workspace: Asphalt" }));
    const menu = screen.getByRole("dialog", { name: "Workspaces" });
    expect(within(menu).getByRole("button", { name: /Asphalt/ })).toHaveAttribute("aria-current", "true");
    expect(within(menu).getByRole("button", { name: /Roofing/ })).toHaveTextContent(/Trial · \d+ days? left/);
    // the search box narrows the list
    fireEvent.change(within(menu).getByRole("searchbox", { name: "Search workspaces" }), { target: { value: "roof" } });
    expect(within(menu).queryByRole("button", { name: /Asphalt/ })).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("button", { name: /Roofing/ }));

    // the app re-enters on the other workspace: its own data, its own trade line
    expect(await screen.findByRole("button", { name: "Workspace: Roofing" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Workspaces" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/workspaces\/org-roofing\/switch$/),
      expect.objectContaining({ method: "POST" })
    );
    await waitFor(() => expect(screen.getByText(/Roofing workspace/)).toBeInTheDocument());
  });

  /**
   * The trade is a record on the org, but the browser remembers one too (the fallback for a
   * tenant database older than the field). Switching workspaces has to drop that memory, or the
   * workspace being opened is labelled with the trade of the one just left.
   */
  it("does not carry one workspace's trade over to the next", async () => {
    const GENERAL = {
      ...HOME,
      id: "org-general",
      title: "Santos Builders",
      businessType: "" as const,
      kind: "extra" as const,
      active: false
    };
    let active = "org-home";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/workspaces/org-general/switch")) {
        active = "org-general";
        return new Response(JSON.stringify({ ...withActive([HOME, GENERAL], active), session: {} }), { status: 200 });
      }
      if (url.endsWith("/api/workspaces")) return new Response(JSON.stringify(withActive([HOME, GENERAL], active)), { status: 200 });
      if (url.includes("/api/bootstrap")) {
        // org-general has no trade of its own, and is already set up, so it opens on the Dashboard
        const businessType = active === "org-general" ? "" : "Asphalt";
        return new Response(JSON.stringify({ ...bootstrapFixture, businessType, selectedPlan: null, selectedProducts: [] }), {
          status: 200
        });
      }
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await enterDashboard();
    expect(await screen.findByText(/Asphalt workspace/)).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Workspace: Asphalt" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Workspaces" })).getByRole("button", { name: /Santos Builders/ }));

    expect(await screen.findByRole("button", { name: "Workspace: Santos Builders" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Asphalt workspace/)).not.toBeInTheDocument());
    expect(window.localStorage.getItem("buildflow.businessType")).toBeNull();
  });

  it("creates a workspace beside the first and sends it through onboarding", async () => {
    let created = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/workspaces") && init?.method === "POST") {
        created = true;
        const fresh = {
          ...HOME,
          id: "org-new",
          title: "Reyes Construction",
          businessType: "" as const,
          kind: "extra" as const,
          onboardingCompletedAt: null,
          trialEndsAt: "2026-06-23T12:00:00.000Z"
        };
        return new Response(JSON.stringify({ ...withActive([HOME, fresh], "org-new"), session: {} }), { status: 201 });
      }
      if (url.includes("/api/bootstrap") && created) return new Response(JSON.stringify(newOrgWorkspaceFixture), { status: 200 });
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "Workspace: Asphalt" }));
    const menu = screen.getByRole("dialog", { name: "Workspaces" });
    const add = within(menu).getByRole("button", { name: /Add workspace/ });
    expect(add).toBeEnabled();
    expect(add).toHaveTextContent("3 of 3 left");
    fireEvent.click(add);

    // the new workspace is the active one, and it has its onboarding to do: the trade first
    await waitFor(() => expect(window.location.hash).toBe("#business-type"));
    expect(await screen.findByRole("heading", { name: "What type of construction business do you own?" })).toBeInTheDocument();
  });

  it("keeps the menu up with the reason when a workspace cannot be created", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/workspaces") && init?.method === "POST") {
        return new Response(JSON.stringify({ error: "The new workspace could not be created. Please try again." }), { status: 500 });
      }
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "Workspace: Asphalt" }));
    const menu = screen.getByRole("dialog", { name: "Workspaces" });
    fireEvent.click(within(menu).getByRole("button", { name: /Add workspace/ }));
    expect(await within(menu).findByRole("alert")).toHaveTextContent("The new workspace could not be created");
    expect(screen.getByRole("dialog", { name: "Workspaces" })).toBeInTheDocument();
    expect(window.location.hash).not.toBe("#business-type");
  });

  /**
   * The shared demo creates workspaces like anyone (2026-09-15). The onboarding pages turn a demo
   * session away as a rule -- the trade would land on the shared demo data -- but a workspace the
   * demo created beside its own is a fresh org, so the questions are asked: trade, then plan.
   */
  it("walks the demo through the trade and plan questions for a workspace it created", async () => {
    let created = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/auth/me")) {
        return new Response(
          JSON.stringify({
            account: { id: "acct-demo", email: "demo@buildflow.com", name: "Demo User", role: "owner" },
            org: { id: "org-home", name: "BuildFlow Demo Co." },
            demo: true
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/api/workspaces") && init?.method === "POST") {
        created = true;
        const fresh = {
          ...HOME,
          id: "org-new",
          title: "BuildFlow Demo Co.",
          businessType: "" as const,
          kind: "extra" as const,
          onboardingCompletedAt: null,
          trialEndsAt: "2026-06-23T12:00:00.000Z"
        };
        return new Response(JSON.stringify({ ...withActive([HOME, fresh], "org-new"), session: {} }), { status: 201 });
      }
      if (url.includes("/api/bootstrap") && created)
        return new Response(JSON.stringify({ ...newOrgWorkspaceFixture, workspaceTrial: true }), { status: 200 });
      return respondToBuildflowApi(input);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "Workspace: Asphalt" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Workspaces" })).getByRole("button", { name: /Add workspace/ }));

    // the trade question, and it stays (a demo session used to be sent to Create account here)
    expect(await screen.findByRole("heading", { name: "What type of construction business do you own?" })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("heading", { name: "Create your workspace." })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What type of construction business do you own?" })).toBeInTheDocument();
    // then the size question, and the plan it points at …
    await chooseBusinessType("Roofing");
    expect(screen.getByRole("radiogroup", { name: "Monthly revenue" })).toBeInTheDocument();
    // … and the invite step, which is the new workspace's too (the demo used to be bounced HERE,
    // once the trade step had marked the workspace's onboarding complete)
    state.businessProfilePayload = { ...blankWorkspaceFixture, workspaceTrial: true };
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(await screen.findByRole("button", { name: "Continue for free" }));
    expect(await screen.findByRole("button", { name: "Skip for now" })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("heading", { name: "Create your workspace." })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
  });

  it("keeps + off once the three extra workspaces exist", async () => {
    state.workspacesPayload = { ...workspacesFixture, remaining: 0 };
    render(<App />);
    await enterDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "Workspace: Asphalt" }));
    const add = within(screen.getByRole("dialog", { name: "Workspaces" })).getByRole("button", { name: /Add workspace/ });
    expect(add).toBeDisabled();
    expect(add).toHaveTextContent("0 of 3 left");
  });
});
