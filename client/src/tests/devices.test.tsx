/* Settings › Devices and the way back to the Mac's Connect page (BuildFlow for Mac, step 2).
   The Connect page itself is the server's (server/test/desktop.test.ts); what lives in the app is
   the list of connected Macs with its two-step Revoke, and returning to the Connect page after a
   real sign-in. */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BootstrapPayload, DesktopDevice } from "@buildflow/shared";
import App from "../App";
import { lastSeenLabel } from "../DevicesSettingsPanel";
import {
  desktopConnectNavigation,
  pendingDesktopConnect,
  rememberDesktopConnect,
  resumeDesktopConnect,
  safeDesktopConnectPath
} from "../desktopConnect";
import { ACCOUNT, enterDashboard, installAppHarness, respondToBuildflowApi, state } from "../test/appHarness";
import { bootstrapFixture } from "../test/fixture";

const LIAM = {
  id: "u-liam",
  name: "Liam Santos",
  permission: "owner",
  title: "Owner",
  avatar: "LS",
  accountId: "acct-liam",
  isSample: false
} as const;

function liamWorkspace(): BootstrapPayload {
  return { ...bootstrapFixture, users: [LIAM], activeUser: LIAM, account: { email: ACCOUNT.email, emailVerifiedAt: null } };
}

const airDevice: DesktopDevice = {
  id: "dev-air",
  name: "Liam's MacBook Air",
  platform: "macOS 13.3",
  appVersion: "1.0.0",
  workspace: { id: "org-home", name: "Keating Paving" },
  createdAt: "2026-06-10T09:00:00.000Z",
  // the test clock is pinned to 2026-06-16 12:00 local
  lastSeenAt: "2026-06-16T11:30:00",
  revokedAt: null
};
const studioDevice: DesktopDevice = {
  ...airDevice,
  id: "dev-studio",
  name: "Office Mac Studio",
  lastSeenAt: "2026-06-13T09:00:00"
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const methodOf = (init?: RequestInit) => (init?.method ?? "GET").toUpperCase();

/** The fake server, with /api/me/devices answered from `devices`. */
function stubDevices(devices: DesktopDevice[]) {
  let current = [...devices];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/me/devices") && methodOf(init) === "GET") return json({ devices: current });
    const revoke = /\/api\/me\/devices\/([^/?]+)$/.exec(url);
    if (revoke && methodOf(init) === "DELETE") {
      const id = decodeURIComponent(revoke[1]);
      const found = current.find((one) => one.id === id);
      if (!found) return json({ error: "That Mac isn't connected to your account.", code: "device_not_found" }, 404);
      current = current.filter((one) => one.id !== id);
      return json({ device: { ...found, revokedAt: "2026-06-16T12:00:00.000Z" } });
    }
    return respondToBuildflowApi(input);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function openDevices() {
  fireEvent.click(await screen.findByRole("button", { name: "Liam Santos account" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
  const rail = await screen.findByLabelText("Settings categories");
  fireEvent.click(within(rail).getByRole("button", { name: "Devices" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Devices" })).toBeInTheDocument();
}

describe("Settings › Devices", () => {
  installAppHarness();

  it("lists the connected Macs and revokes one only after it is confirmed", async () => {
    state.bootstrapPayload = liamWorkspace();
    const fetchMock = stubDevices([airDevice, studioDevice]);
    render(<App />);
    await enterDashboard();
    await openDevices();

    const air = await screen.findByRole("article", { name: "Liam's MacBook Air" });
    expect(within(air).getByText(/Keating Paving · Connected Jun 10, 2026 · BuildFlow for Mac 1\.0\.0 · macOS 13\.3/)).toBeInTheDocument();
    expect(within(air).getByText("Active recently")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Office Mac Studio" })).getByText("Last seen 3 days ago")).toBeInTheDocument();
    expect(screen.getByText("2 connected")).toBeInTheDocument();

    // The first press only arms it: nothing is sent, and Cancel stands down.
    fireEvent.click(within(air).getByRole("button", { name: "Revoke Liam's MacBook Air" }));
    const deletes = () => fetchMock.mock.calls.filter(([, init]) => methodOf(init as RequestInit | undefined) === "DELETE");
    expect(deletes()).toHaveLength(0);
    fireEvent.click(within(air).getByRole("button", { name: "Keep Liam's MacBook Air" }));
    expect(within(air).getByRole("button", { name: "Revoke Liam's MacBook Air" })).toBeInTheDocument();

    // The second press revokes that Mac and no other.
    fireEvent.click(within(air).getByRole("button", { name: "Revoke Liam's MacBook Air" }));
    fireEvent.click(within(air).getByRole("button", { name: "Confirm: revoke Liam's MacBook Air" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Liam's MacBook Air is disconnected.");
    expect(deletes()).toHaveLength(1);
    expect(String(deletes()[0][0])).toMatch(/\/api\/me\/devices\/dev-air$/);
    await waitFor(() => expect(screen.queryByRole("article", { name: "Liam's MacBook Air" })).not.toBeInTheDocument());
    expect(screen.getByRole("article", { name: "Office Mac Studio" })).toBeInTheDocument();
    expect(screen.getByText("1 connected")).toBeInTheDocument();
  });

  it("says so when no Mac is connected", async () => {
    state.bootstrapPayload = liamWorkspace();
    stubDevices([]);
    render(<App />);
    await enterDashboard();
    await openDevices();
    expect(await screen.findByText(/No Macs are connected/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Revoke/ })).not.toBeInTheDocument();
  });

  it("shows the server's refusal instead of pretending the Mac was revoked", async () => {
    state.bootstrapPayload = liamWorkspace();
    const fetchMock = stubDevices([airDevice]);
    render(<App />);
    await enterDashboard();
    await openDevices();
    // the Mac was disconnected elsewhere in the meantime
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) =>
      methodOf(init) === "DELETE"
        ? json({ error: "That Mac isn't connected to your account.", code: "device_not_found" }, 404)
        : respondToBuildflowApi(input)
    );
    const air = await screen.findByRole("article", { name: "Liam's MacBook Air" });
    fireEvent.click(within(air).getByRole("button", { name: "Revoke Liam's MacBook Air" }));
    fireEvent.click(within(air).getByRole("button", { name: "Confirm: revoke Liam's MacBook Air" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That Mac isn't connected to your account.");
    expect(screen.getByRole("article", { name: "Liam's MacBook Air" })).toBeInTheDocument();
  });
});

describe("last seen, in words", () => {
  const now = new Date("2026-06-16T12:00:00").getTime();
  it("treats anything inside two hours as active, because the server records it hourly", () => {
    expect(lastSeenLabel(null, now)).toBe("Not seen yet");
    expect(lastSeenLabel("2026-06-16T10:30:00", now)).toBe("Active recently");
    expect(lastSeenLabel("2026-06-16T07:00:00", now)).toBe("Last seen 5 hours ago");
    expect(lastSeenLabel("2026-06-15T11:00:00", now)).toBe("Last seen 1 day ago");
    expect(lastSeenLabel("2026-06-01T12:00:00", now)).toBe("Last seen Jun 1, 2026");
  });
});

describe("signing in on the way to connecting a Mac", () => {
  installAppHarness();
  const connectPath =
    "/desktop/connect?code_challenge=abc&code_challenge_method=S256&state=xyz12345&redirect_uri=buildflow%3A%2F%2Fconnect";
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("only ever follows a path back to the Connect page on this origin", () => {
    expect(safeDesktopConnectPath(connectPath)).toBe(connectPath);
    for (const bad of [
      null,
      "",
      "https://evil.example/desktop/connect?x=1",
      "//evil.example/desktop/connect?x=1",
      "/desktop/connect",
      "/desktop/connect-elsewhere?x=1",
      "/desktop/connect?x=1\\@evil.example",
      "/dashboard"
    ]) {
      expect(safeDesktopConnectPath(bad)).toBeNull();
    }
  });

  it("keeps the way back through the sign-in, tidies the address, and uses it once", () => {
    window.history.replaceState(null, "", `/?next=${encodeURIComponent(connectPath)}#create-account`);
    rememberDesktopConnect();
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#create-account");
    expect(pendingDesktopConnect()).toBe(connectPath);

    const go = vi.spyOn(desktopConnectNavigation, "go").mockImplementation(() => undefined);
    try {
      expect(resumeDesktopConnect()).toBe(true);
      expect(go).toHaveBeenCalledWith(connectPath);
      expect(resumeDesktopConnect()).toBe(false);
      expect(go).toHaveBeenCalledTimes(1);
    } finally {
      go.mockRestore();
    }
  });

  it("opens the sign-in form and, after a real sign-in, goes back to the Connect page instead of the Dashboard", async () => {
    window.history.replaceState(null, "", `/?next=${encodeURIComponent(connectPath)}#create-account`);
    const go = vi.spyOn(desktopConnectNavigation, "go").mockImplementation(() => undefined);
    try {
      render(<App />);
      // the account page opens on signing in, not on creating an account
      expect(await screen.findByRole("heading", { name: "Welcome back." })).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Email"), { target: { value: ACCOUNT.email } });
      fireEvent.change(screen.getByLabelText("Password"), { target: { value: ACCOUNT.password } });
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
      await waitFor(() => expect(go).toHaveBeenCalledWith(connectPath));
      expect(screen.queryByLabelText("Search BuildFlow")).not.toBeInTheDocument();
    } finally {
      go.mockRestore();
    }
  });
});
