/**
 * Scroll reveals for a panel that mounts late (2026-09-28). `.dx-ready` hides every [data-reveal]
 * until it gains `.in`. Under prefers-reduced-motion (or with no IntersectionObserver) the reveal
 * effects add `.in` at once instead of waiting to be scrolled to. They used to do that only for the
 * targets present at mount, and returned before the watcher that catches later ones, so the Schedule
 * status band — which mounts when its fetch resolves — stayed at opacity 0 for the life of the page,
 * for exactly the readers who asked for less motion.
 *
 * Both copies of the effect are covered: the Dashboard's inlined one and the shared useHudMotion hook
 * the command-center pages use. Each also keeps its full-motion path: a late target is observed and
 * shows only once it scrolls into view.
 */
import { useRef, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import type { ScheduleStatusResponse } from "../api";
import { useHudMotion } from "../useHudMotion";
import { enterDashboard, installAppHarness, respondToBuildflowApi } from "../test/appHarness";

/** matchMedia as a reader who asked for reduced motion answers it. Returns the undo. */
function preferReducedMotion() {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion: reduce"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

/**
 * An IntersectionObserver that remembers what it was handed and reports only when told to. The one in
 * test/setup.ts is a no-op, which is enough for the reduced-motion path; the full-motion path needs to
 * see what was observed and to scroll it into view.
 */
class RecordingObserver {
  static all: RecordingObserver[] = [];
  readonly observed = new Set<Element>();
  readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    RecordingObserver.all.push(this);
  }
  observe(el: Element) {
    this.observed.add(el);
  }
  unobserve(el: Element) {
    this.observed.delete(el);
  }
  disconnect() {
    this.observed.clear();
  }
  takeRecords() {
    return [];
  }
  /** Scroll `el` into view: report it as intersecting to whichever observer holds it. */
  static enter(el: Element) {
    const holder = RecordingObserver.all.find((observer) => observer.observed.has(el));
    if (!holder) throw new Error("nothing is observing that element");
    const entry = { target: el, isIntersecting: true } as unknown as IntersectionObserverEntry;
    act(() => holder.callback([entry], holder as unknown as IntersectionObserver));
  }
}

const isObserved = (el: Element) => RecordingObserver.all.some((observer) => observer.observed.has(el));

/** What GET /api/schedule/status answers with: one project, two days ahead. */
const STATUS: ScheduleStatusResponse = {
  asOf: "2026-06-16",
  weekOf: "2026-06-15",
  portfolio: {
    daysAhead: 2,
    percentComplete: 40,
    projects: 1,
    behindProjects: 0,
    reportingJobs: 2,
    totalJobs: 3,
    daysAheadDelta: null,
    percentDelta: null
  },
  projects: [
    {
      projectId: "p-riverside",
      name: "Riverside Office Building",
      plannedFinish: "2026-08-03",
      forecastFinish: "2026-07-30",
      daysAhead: 2,
      percentComplete: 40,
      reportingJobs: 2,
      totalJobs: 3,
      daysAheadDelta: null,
      percentDelta: null
    }
  ]
};

describe("the Dashboard's schedule status band, which mounts after its fetch", () => {
  installAppHarness();

  // The status fetch is held until the case releases it, so the band provably arrives after the
  // Dashboard's reveal effect has run — the order that stranded it.
  let releaseStatus: () => void = () => {};
  let restoreMotion: () => void = () => {};
  beforeEach(() => {
    const held = new Promise<void>((resolve) => {
      releaseStatus = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (!String(input).includes("/api/schedule/status")) return respondToBuildflowApi(input);
        await held;
        return new Response(JSON.stringify(STATUS), { status: 200 });
      })
    );
  });
  afterEach(() => {
    releaseStatus();
    restoreMotion();
    restoreMotion = () => {};
    RecordingObserver.all = [];
  });

  /** Sign in and wait for the Dashboard's reveal effect, with the band not here yet. */
  async function dashboardBeforeTheBand() {
    render(<App />);
    await enterDashboard();
    const root = await waitFor(() => {
      const found = document.querySelector<HTMLElement>(".dash-rx.dx-ready");
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(root.querySelector(".ss-band"), "the band waits on its fetch").toBeNull();
    return root;
  }

  it("is revealed once its data loads when the reader prefers reduced motion", async () => {
    restoreMotion = preferReducedMotion();
    const root = await dashboardBeforeTheBand();
    // the reduced-motion path ran: the panels already on the page were shown at once
    await waitFor(() => expect(root.querySelector("[data-reveal].in")).not.toBeNull());

    releaseStatus();
    const band = await screen.findByRole("region", { name: "Schedule status" });
    expect(band).toHaveClass("ss-band");
    await waitFor(() => expect(band).toHaveClass("in"));
  });

  it("is observed when it mounts and revealed as it scrolls into view, with full motion", async () => {
    vi.stubGlobal("IntersectionObserver", RecordingObserver);
    await dashboardBeforeTheBand();

    releaseStatus();
    const band = await screen.findByRole("region", { name: "Schedule status" });
    await waitFor(() => expect(isObserved(band)).toBe(true));
    expect(band).not.toHaveClass("in");

    RecordingObserver.enter(band);
    expect(band).toHaveClass("in");
    expect(isObserved(band), "one-shot: unobserved once shown").toBe(false);
  });
});

/** A command-center page in miniature: one panel at mount, one that arrives when "Load" is pressed. */
function LatePanelPage() {
  const rootRef = useRef<HTMLElement>(null);
  const [loaded, setLoaded] = useState(false);
  useHudMotion(rootRef);
  return (
    <main ref={rootRef}>
      <section data-reveal aria-label="First panel" />
      {loaded ? (
        <section data-reveal aria-label="Late panel" />
      ) : (
        <button type="button" onClick={() => setLoaded(true)}>
          Load
        </button>
      )}
    </main>
  );
}

describe("useHudMotion with a panel that mounts late", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    RecordingObserver.all = [];
  });

  it("reveals the late panel at once when the reader prefers reduced motion", async () => {
    const restore = preferReducedMotion();
    try {
      render(<LatePanelPage />);
      expect(screen.getByRole("region", { name: "First panel" })).toHaveClass("in");
      fireEvent.click(screen.getByRole("button", { name: "Load" }));
      const late = screen.getByRole("region", { name: "Late panel" });
      await waitFor(() => expect(late).toHaveClass("in"));
    } finally {
      restore();
    }
  });

  it("observes the late panel and reveals it as it scrolls into view, with full motion", async () => {
    vi.stubGlobal("IntersectionObserver", RecordingObserver);
    render(<LatePanelPage />);
    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    const late = screen.getByRole("region", { name: "Late panel" });
    await waitFor(() => expect(isObserved(late)).toBe(true));
    expect(late).not.toHaveClass("in");

    RecordingObserver.enter(late);
    expect(late).toHaveClass("in");
    expect(isObserved(late)).toBe(false);
  });
});
