/**
 * The page must never show a number it cannot vouch for.
 *
 * api.ts states the rule in its own header — "we never invent a number, because a number on this
 * page reads as a customer's data" — and records the bug that earned it: the console used to
 * answer a failed fetch with a hardcoded object shaped like a fresh seed, and rendered those
 * constants as the live contents of a workspace. Plausible enough that nobody noticed, and
 * already wrong, because the seed had drifted.
 *
 * api.test.ts holds that rule at the boundary. What nothing held is the RENDERING, and the
 * rendering is where the promise is actually kept or broken:
 *
 *   - platform counts appear only in the "live" state, and an unreadable backend produces a
 *     sentence about why rather than a figure;
 *   - every other figure on this page is invented — the revenue chart, the plan mix, the active
 *     users — and one line in the hero says so. That line is the whole defence. Rename it in a
 *     redesign and the page goes back to presenting $48.2k of MRR as though it were real, with
 *     every test still green.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type * as ApiModule from "./api";
import type { PlatformMetrics } from "./api";
import { fetchPlatformMetrics } from "./api";
import { AdminApp } from "./AdminApp";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, fetchPlatformMetrics: vi.fn() };
});

const metrics: PlatformMetrics = {
  generatedAt: "2026-09-23T10:00:00.000Z",
  workspaces: 23,
  coldWorkspaces: 4,
  objects: 1875,
  byKind: { projects: 61, jobs: 1402, crews: 88, equipment: 214, materials: 110 }
};

/** Sign the operator in; AdminApp shows the login screen otherwise. */
function mount() {
  localStorage.setItem("bf-admin-portal-auth", "ops@buildflow.com");
  return render(<AdminApp />);
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(fetchPlatformMetrics).mockReset();
});

describe("when the platform counts can be read", () => {
  it("shows them, and says they are live", async () => {
    vi.mocked(fetchPlatformMetrics).mockResolvedValue({ status: "live", metrics });
    mount();

    expect(await screen.findByText(/live from buildflow/i)).toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByText("1,875")).toBeInTheDocument();
  });
});

describe("when they cannot be read", () => {
  it("gives the reason instead of a figure", async () => {
    vi.mocked(fetchPlatformMetrics).mockResolvedValue({
      status: "unavailable",
      reason: "Could not reach the BuildFlow backend.",
      needsToken: false
    });
    mount();

    expect((await screen.findAllByText(/platform counts unavailable/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/could not reach the buildflow backend/i).length).toBeGreaterThan(0);
  });

  /** The specific shape of the old bug: a stand-in that reads as a customer's data. */
  it("puts no number at all where the platform counts go", async () => {
    vi.mocked(fetchPlatformMetrics).mockResolvedValue({
      status: "unavailable",
      reason: "That ops token was rejected by the BuildFlow backend.",
      needsToken: true
    });
    mount();

    await waitFor(() => expect(screen.getAllByText(/platform counts unavailable/i).length).toBeGreaterThan(0));
    expect(screen.queryByText(/objects across all workspaces/i), "no count may be claimed").not.toBeInTheDocument();
    expect(screen.queryByText(/live from buildflow/i)).not.toBeInTheDocument();
  });
});

describe("the sample-data disclaimer", () => {
  /**
   * Everything on this page other than the platform counts is invented -- MRR, ARR, churn, the
   * plan mix, active users, API traffic, uptime. That is a deliberate choice for an unfinished
   * console, and it is only honest while the page says so.
   */
  it("is on the page whether or not the real counts loaded", async () => {
    for (const state of [
      { status: "live", metrics } as const,
      { status: "unavailable", reason: "Could not reach the BuildFlow backend.", needsToken: false } as const
    ]) {
      vi.mocked(fetchPlatformMetrics).mockResolvedValue(state);
      const { unmount } = mount();
      expect(
        await screen.findByText(/every other figure on this page is sample data/i),
        `missing while metrics were "${state.status}"`
      ).toBeInTheDocument();
      unmount();
      localStorage.clear();
    }
  });

  it("sits beside the figures it disclaims, not somewhere else on the page", async () => {
    vi.mocked(fetchPlatformMetrics).mockResolvedValue({ status: "live", metrics });
    mount();

    const flag = await screen.findByText(/every other figure on this page is sample data/i);
    // The hero meta is the line carrying the live counts; a disclaimer parked in a footer
    // below three screens of charts is not a disclaimer.
    expect(flag.closest(".adm-hero-meta"), "the disclaimer must share the line with the live counts").not.toBeNull();
  });
});
