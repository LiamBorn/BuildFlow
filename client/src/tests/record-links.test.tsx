/**
 * Record links on a cold load (notch plan, step 5): `#open/…`, the addresses the Mac's notch opens.
 *
 * Every case here is a FRESH LOAD: the address is set before the app mounts and no hashchange ever
 * fires, which is how a link from outside arrives — and why none of these is tested by clicking,
 * which would go through history.pushState and hide a route that does not work when loaded.
 *
 * The notifications are the fixture's own, each loaded at `linkHash(item.opens)` — the very
 * destination the bell's click-through is handed — so a link and the bell cannot drift apart.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildNotificationItems, linkHash, type LinkDestination } from "@buildflow/shared";
import App from "../App";
import { enterDashboard, installAppHarness, respondToBuildflowApi, state } from "../test/appHarness";
import { bootstrapFixture } from "../test/fixture";

const focusNode = (id: string) => document.querySelector(`[data-bf-focus="${id}"]`);
const panel = (id: string) => document.querySelector(`[data-dash-drag-id="${id}"]`);
const PAGE_HEADING: Record<string, string> = { field: "Field Updates", delayIQs: "DelayIQs", inventory: "Inventory" };

/** Arrive at `hash` the way a link from the Mac does: typed into a fresh tab. */
function load(hash: string) {
  window.history.replaceState(null, "", `/${hash}`);
  render(<App />);
}

const context = () => JSON.parse(window.localStorage.getItem("bf:schedule:context:u-matt") ?? "{}");

describe("a record link, loaded cold", () => {
  installAppHarness();

  const items = buildNotificationItems(bootstrapFixture, Date.parse("2026-06-16T12:00:00Z"));

  it("covers every kind of notification the fixture has", () => {
    expect(new Set(items.map((item) => item.kind))).toEqual(
      new Set(["fieldUpdate", "weatherAlert", "delayIQ", "assignment", "inspection", "material", "equipment"])
    );
  });

  for (const item of items) {
    it(`opens a ${item.kind} notification's record where the bell does (${linkHash(item.opens)})`, async () => {
      if (item.opens.kind === "schedule") {
        // a remembered context that would hide the booking: the link drops it, as the bell does
        window.localStorage.setItem(
          "bf:schedule:context:u-matt",
          JSON.stringify({ weekStart: "2026-07-06", projectId: "p-harborview", statuses: ["Ready"] })
        );
      }
      load(linkHash(item.opens));
      const opens = item.opens;
      if (opens.kind === "record") {
        expect(await screen.findByRole("heading", { name: PAGE_HEADING[opens.page], level: 1 })).toBeInTheDocument();
        await waitFor(() => expect(focusNode(opens.recordId)?.className).toContain("is-bf-focused"));
      } else if (opens.kind === "panel") {
        await waitFor(() => expect(panel(opens.panelId)?.className).toContain("is-bf-focused"));
      } else {
        expect(await screen.findByRole("heading", { level: 1, name: /^Month/ })).toBeInTheDocument();
        expect(context()).toMatchObject({ weekStart: "2026-06-15", crewId: opens.crewId, projectId: null, statuses: null });
      }
      // followed once: the address no longer carries it, so a reload stays where the person went
      expect(window.location.hash.startsWith("#open/")).toBe(false);
    });
  }

  it("opens a job on the Month at its day, with its drawer open", async () => {
    window.localStorage.setItem("bf:schedule:context:u-matt", JSON.stringify({ weekStart: "2026-07-06", projectId: "p-harborview" }));
    load(linkHash({ kind: "job", jobId: "j-riverside-concrete", date: "2026-06-16" }));
    expect(await screen.findByRole("heading", { level: 1, name: /^Month/ })).toBeInTheDocument();
    const drawer = await screen.findByRole("dialog", { name: "Riverside Office Building" });
    expect(within(drawer).getByText(/Concrete - Level 3 Slab/)).toBeInTheDocument();
    expect(context()).toMatchObject({ weekStart: "2026-06-15", projectId: null, crewId: null });
  });

  it("opens a job without a day at its own start", async () => {
    load("#open/job/j-riverside-concrete");
    expect(await screen.findByRole("dialog", { name: "Riverside Office Building" })).toBeInTheDocument();
  });

  for (const panelId of ["meetings", "approvals", "readiness", "weather", "inspections"] as const) {
    it(`lights the Dashboard's ${panelId} panel`, async () => {
      load(linkHash({ kind: "panel", panelId }));
      await waitFor(() => expect(panel(panelId)?.className).toContain("is-bf-focused"));
    });
  }

  it("opens the team's time on the week that is waiting", async () => {
    // TimeCard is an add-on: this workspace has it, and the workspace's own record says so, whatever this browser remembers
    state.bootstrapPayload = { ...bootstrapFixture, selectedProducts: ["time-cards"] };
    load(linkHash({ kind: "timecard", week: "2026-06-08" } satisfies LinkDestination));
    expect(await screen.findByRole("heading", { name: /TimeCard/, level: 1 })).toBeInTheDocument();
    expect((await screen.findAllByText(/Jun 8 – Jun 14, 2026/)).length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/api/time-entries/team?from=2026-06-08&to=2026-06-14"))
      ).toBe(true)
    );
  });

  it("offers the add-on instead of a page the workspace does not have", async () => {
    state.bootstrapPayload = { ...bootstrapFixture, selectedProducts: [], selectedPlan: "free" };
    load(linkHash({ kind: "timecard", week: "2026-06-08" }));
    // the Dashboard, with the add-on offered over it
    expect(await screen.findByRole("dialog", { name: /^Get / })).toBeInTheDocument();
    expect(screen.getByLabelText("Search BuildFlow")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /TimeCard/, level: 1 })).toBeNull();
  });

  it("loads as any other visit does for a link it cannot follow", async () => {
    load("#open/projects/p-riverside");
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/api/bootstrap"))).toBe(true));
    await screen.findByRole("button", { name: /^Login from welcome navigation$/ });
    expect(screen.queryByRole("heading", { level: 1, name: /^Month/ })).toBeNull();
    expect(screen.queryByRole("heading", { level: 1, name: "DelayIQs" })).toBeNull();
  });
});

describe("a record link followed while signed out", () => {
  installAppHarness();

  it("keeps the landing, and signing in goes to the record", async () => {
    // the first bootstrap has no session; the demo fallback signs in and the landing stays
    let demoSession = false;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), "http://localhost").pathname;
      if (path === "/api/auth/demo") demoSession = true;
      if (path === "/api/bootstrap" && !demoSession) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
      return respondToBuildflowApi(input);
    });
    state.bootstrapPayload = bootstrapFixture;
    load("#open/delayIQs/delayIQ-rain");
    await screen.findByRole("button", { name: /^Login from welcome navigation$/ });
    expect(screen.queryByRole("heading", { name: "DelayIQs", level: 1 })).toBeNull();

    await enterDashboard().catch(() => undefined);
    expect(await screen.findByRole("heading", { name: "DelayIQs", level: 1 })).toBeInTheDocument();
    await waitFor(() => expect(focusNode("delayIQ-rain")?.className).toContain("is-bf-focused"));
  });
});
