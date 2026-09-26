/**
 * The notifications drawer.
 *
 * Laid out like the monday.com reference the user pointed at, so what is asserted is the
 * anatomy they asked for — the tabs, the search, the unread toggle — and the two things that
 * are behaviour rather than layout: it shows ALL of them, and read state is real.
 *
 * The panel's role and accessible name are deliberately the same as before the redesign;
 * tutorial.test.tsx finds it by them and still passes untouched.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOTIFICATION_STATE_SETTING,
  decodeNotificationState,
  emptyNotificationState,
  encodeNotificationState,
  isNotificationRead,
  isNotificationSeen,
  markNotifications
} from "@buildflow/shared";
import App from "../App";
import { enterDashboard, installAppHarness, respondToBuildflowApi, state } from "../test/appHarness";
import { bootstrapFixture } from "../test/fixture";

/**
 * The default fixture has exactly ONE of each of the seven sources, so it lands on seven
 * notifications — the same number the old `.slice(0, 7)` cap allowed, which makes it useless
 * for proving the cap is gone. This adds six more pieces of equipment, so a truncating
 * builder would show 7 where an honest one shows 13.
 */
const thirteenNotifications = () => ({
  ...bootstrapFixture,
  equipment: [
    ...bootstrapFixture.equipment,
    ...Array.from({ length: 6 }, (_, index) => ({
      ...bootstrapFixture.equipment[0],
      id: `eq-extra-${index}`,
      name: `Extra Machine ${index + 1}`
    }))
  ]
});

/** How many notifications the default fixture yields: one per source, added up from the fixture itself. */
const bootstrapNotificationCount = () =>
  bootstrapFixture.fieldUpdates.length +
  bootstrapFixture.weatherAlerts.length +
  bootstrapFixture.delayIQs.length +
  bootstrapFixture.assignments.length +
  bootstrapFixture.inspections.length +
  bootstrapFixture.materials.length +
  bootstrapFixture.equipment.length;

const openBell = () => {
  fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
  return screen.getByRole("region", { name: "Recent BuildFlow activity" });
};
const rows = (panel: HTMLElement) =>
  within(panel)
    .getAllByRole("button")
    .filter((node) => node.className.includes("bfnt-row"));
/** The one row that is about a named thing — how a person picks a notification out of the list. */
const rowFor = (panel: HTMLElement, text: RegExp) => {
  const found = rows(panel).find((row) => text.test(row.textContent ?? ""));
  if (!found) throw new Error(`no notification matching ${text}`);
  return found;
};
/** The DOM node a record focus lands on, if it is on screen at all. */
const focusNode = (id: string) => document.querySelector(`[data-bf-focus="${id}"]`);
const badge = () => screen.getByRole("button", { name: "Notifications" }).querySelector(".bubble")?.textContent ?? null;

describe("the notifications drawer", () => {
  installAppHarness();
  beforeEach(() => {
    // read and seen state are per person and persisted, so each test starts with everything new
    for (const key of Object.keys(window.localStorage)) if (key.startsWith("bf:notifications:")) window.localStorage.removeItem(key);
  });

  it("is laid out like the reference: a title, three tabs with counts, search and an unread toggle", async () => {
    render(<App />);
    await enterDashboard();
    const panel = openBell();

    expect(within(panel).getByRole("heading", { name: "Notifications" })).toBeInTheDocument();
    const tabs = within(panel).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent?.replace(/\d+$/, "").trim())).toEqual(["All", "Needs attention", "Projects I manage"]);
    expect(within(panel).getByLabelText("Search notifications")).toBeInTheDocument();
    expect(within(panel).getByText("Unread only")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Close notifications" })).toBeInTheDocument();
  });

  /**
   * The regression the redesign was asked to fix. `buildNotificationItems` used to end
   * `.slice(0, 7)`, so the bell had been showing the seven newest and dropping the rest with
   * nothing to say it had.
   */
  it("shows all of them, not the first seven", async () => {
    state.bootstrapPayload = thirteenNotifications();
    render(<App />);
    await enterDashboard();
    const panel = openBell();

    expect(rows(panel)).toHaveLength(13);
    // and the count on the All tab agrees with what is rendered
    const all = within(panel).getAllByRole("tab")[0];
    expect(Number(all.textContent?.match(/\d+$/)?.[0])).toBe(13);
  });

  it("filters to the ones that need attention", async () => {
    render(<App />);
    await enterDashboard();
    const panel = openBell();
    const total = rows(panel).length;

    fireEvent.click(within(panel).getByRole("tab", { name: /Needs attention/ }));
    const attention = rows(panel);
    expect(attention.length).toBeGreaterThan(0);
    expect(attention.length).toBeLessThan(total);
    // red and amber are the two tones that mean someone has to act
    for (const row of attention) expect(row.className).toMatch(/\b(red|amber)\b/);
  });

  it("searches across the title and the detail", async () => {
    render(<App />);
    await enterDashboard();
    const panel = openBell();

    fireEvent.change(within(panel).getByLabelText("Search notifications"), { target: { value: "weather" } });
    const found = rows(panel);
    expect(found.length).toBeGreaterThan(0);
    for (const row of found) expect(row.textContent?.toLowerCase()).toContain("weather");

    fireEvent.change(within(panel).getByLabelText("Search notifications"), { target: { value: "zzzzz" } });
    expect(within(panel).getByText("No notifications to show")).toBeInTheDocument();
  });

  /**
   * The badge means "not shown to you yet". Before the drawer is opened that is all of them;
   * opening it is being shown them, so the badge clears — and stays clear when the drawer is
   * closed and reopened, because nothing new has arrived. Read is a different thing: the rows
   * are still unread (no dot has gone) until each is clicked.
   */
  it("counts what has not been seen, and opening the drawer is seeing it", async () => {
    render(<App />);
    await enterDashboard();
    const total = bootstrapNotificationCount();
    expect(badge()).toBe(String(total));

    const panel = openBell();
    expect(rows(panel).length).toBe(total);
    expect(badge()).toBeNull();
    // seen is not read: every row still carries its unread dot
    expect(within(panel).getAllByLabelText("Unread").length).toBe(total);

    fireEvent.click(within(panel).getByRole("button", { name: "Close notifications" }));
    expect(badge()).toBeNull();
    expect(rows(openBell()).length).toBe(total);
  });

  /** What was seen is remembered, so only what arrives later counts again. */
  it("brings the badge back for what arrives after the drawer was last opened", async () => {
    const first = render(<App />);
    await enterDashboard();
    openBell();
    expect(badge()).toBeNull();
    first.unmount();

    state.bootstrapPayload = thirteenNotifications();
    render(<App />);
    await enterDashboard();
    // the seven already seen stay quiet; the six new pieces of equipment are the news
    expect(badge()).toBe("6");
  });

  it("marks a notification read when it is opened", async () => {
    render(<App />);
    await enterDashboard();
    const panel = openBell();
    const total = rows(panel).length;

    fireEvent.click(rows(panel)[0]);
    // clicking a row is also a navigation, so the drawer gets out of the way
    expect(screen.queryByRole("region", { name: "Recent BuildFlow activity" })).toBeNull();

    // "Unread only" then hides the one that was just read
    const reopened = openBell();
    fireEvent.click(within(reopened).getByText("Unread only"));
    expect(rows(reopened).length).toBe(total - 1);
  });

  it("marks the lot read from the more menu", async () => {
    render(<App />);
    await enterDashboard();
    const panel = openBell();
    const before = rows(panel).length;

    fireEvent.click(within(panel).getByRole("button", { name: "More notification actions" }));
    fireEvent.click(within(panel).getByRole("menuitem", { name: /Mark all as read/ }));

    expect(badge()).toBeNull();
    // the rows are still there, just quieter — read is not hidden
    expect(rows(panel).length).toBe(before);
    for (const row of rows(panel)) expect(row.className).toContain("is-read");
  });

  /* ── where a row goes ──────────────────────────────────────────────────────────────────
     The ask behind all four of these: a notification that only says a thing happened makes
     the reader go and find the thing. Clicking one has to land on it. */

  it("takes the reader to the record, not just to the page", async () => {
    render(<App />);
    await enterDashboard();
    const row = rowFor(openBell(), /Ready Mix Concrete/);
    // the row promises where it goes, for anyone who cannot see the chevron
    expect(row.getAttribute("aria-label")).toContain("Open Inventory");

    fireEvent.click(row);

    expect(await screen.findByRole("heading", { name: "Inventory", level: 1 })).toBeInTheDocument();
    // and the material itself is lit — "somewhere on the Inventory page" is not the ask
    await waitFor(() => expect(focusNode("mat-concrete")?.className).toContain("is-bf-focused"));
    expect(focusNode("mat-concrete")?.textContent).toContain("Ready Mix Concrete");
  });

  /**
   * The failure this is really about. These four index pages keep a saved view, three filters,
   * a search and a pagination page, and any of them can be the reason the record is not on
   * screen — so a link that only sets the page is a dead end exactly when the reader is
   * already looking at a narrowed list. Clicking has to drop whatever was hiding it.
   */
  it("clears the filter that was hiding the row", async () => {
    render(<App />);
    await enterDashboard();
    fireEvent.click(rowFor(openBell(), /Ready Mix Concrete/));
    await screen.findByRole("heading", { name: "Inventory", level: 1 });

    // the reader narrows the page to what needs attention, and the Ready material drops off it
    fireEvent.click(screen.getByRole("tab", { name: /^Needs attention/ }));
    await waitFor(() => expect(focusNode("mat-concrete")).toBeNull());

    fireEvent.click(rowFor(openBell(), /Ready Mix Concrete/));

    await waitFor(() => expect(focusNode("mat-concrete")?.className).toContain("is-bf-focused"));
    expect(screen.getByRole("tab", { name: /^All items/ })).toHaveAttribute("aria-selected", "true");
  });

  /**
   * Weather and inspections have no page of their own — they are read on the Dashboard — so
   * their target is the panel that holds them. Sending them to a page would be inventing one.
   */
  it("lands on the Dashboard panel for the two kinds with no page of their own", async () => {
    render(<App />);
    await enterDashboard();

    fireEvent.click(rowFor(openBell(), /Weather alert added/));

    await waitFor(() => expect(document.querySelector('[data-dash-drag-id="weather"]')?.className).toContain("is-bf-focused"));
  });

  /**
   * WeatherIQ's job days (2026-09-23) are suggestions for the person in charge — the project's
   * manager — so they sit on the tab for the projects the reader manages, and they land on the
   * WeatherIQ section, where the decision is made.
   */
  it("tells the person in charge about a job day the weather reaches, on the tab for the projects they manage", async () => {
    state.bootstrapPayload = {
      ...bootstrapFixture,
      weatherConflicts: [
        {
          id: "wx-j-riverside-concrete-2026-06-17",
          jobId: "j-riverside-concrete",
          projectId: "p-riverside",
          date: "2026-06-17",
          cause: "lightning",
          severity: "hold",
          start: "2026-06-17T13:00",
          end: "2026-06-17T15:00",
          reason: "thunderstorms",
          assigneeId: "u-matt",
          status: "open",
          detectedAt: "2026-06-16T12:00:00.000Z",
          updatedAt: "2026-06-16T12:00:00.000Z"
        }
      ]
    };
    render(<App />);
    await enterDashboard();
    const panel = openBell();

    const row = rowFor(panel, /Weather may stop Concrete - Level 3 Slab/);
    expect(row.textContent).toContain("Lightning: thunderstorms, Wednesday 1–3 PM, at Riverside Office Building, inside the job's hours.");
    fireEvent.click(within(panel).getByRole("tab", { name: /^Projects I manage/ }));
    fireEvent.click(rowFor(panel, /Weather may stop Concrete - Level 3 Slab/));
    await waitFor(() => expect(document.querySelector('[data-dash-drag-id="weather"]')?.className).toContain("is-bf-focused"));
  });

  /**
   * A booking is addressed by week and crew rather than by row, and the calendar remembers the
   * filters the reader last used — which can be the very reason the booking is not visible.
   * So the jump writes the context, the same way a pasted schedule link does, and opens the
   * Month calendar (the Week board it used to open left on 2026-09-22 — docs/backlog.md).
   */
  it("points the Month calendar at the booking, dropping filters that would hide it", async () => {
    // a context that hides the fixture's only assignment: the wrong project, and a status set
    window.localStorage.setItem(
      "bf:schedule:context:u-matt",
      JSON.stringify({ weekStart: "2026-07-06", projectId: "p-harborview", statuses: ["Ready"] })
    );
    render(<App />);
    await enterDashboard();

    fireEvent.click(rowFor(openBell(), /Schedule assignment updated/));

    await waitFor(() => {
      const context = JSON.parse(window.localStorage.getItem("bf:schedule:context:u-matt") ?? "{}");
      expect(context).toMatchObject({
        weekStart: "2026-06-15", // the Monday of the assignment's own week
        crewId: "crew-concrete",
        projectId: null,
        statuses: null
      });
    });
    expect(await screen.findByRole("heading", { level: 1, name: /^Month/ })).toBeInTheDocument();
  });
});

/* ── read and seen state on the server (2026-09-26, notch step 3) ──────────────────────────────
   The bell and the Mac's notch read the same list; for their counts to agree, what has been seen
   and read has to live with the person, not in one browser. */
describe("the notifications drawer's read state, kept on the server", () => {
  installAppHarness();
  beforeEach(() => {
    for (const key of Object.keys(window.localStorage)) if (key.startsWith("bf:notifications:")) window.localStorage.removeItem(key);
  });

  const SETTING_URL = `/api/me/settings/${encodeURIComponent(NOTIFICATION_STATE_SETTING)}`;
  /** Every PUT of the read state, and what the fake server answers it with. */
  const recordPuts = (answer: (value: string) => Response) => {
    const puts: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes(SETTING_URL) && init?.method === "PUT") {
          const value = (JSON.parse(String(init.body)) as { value: string }).value;
          puts.push(value);
          return answer(value);
        }
        return respondToBuildflowApi(input);
      })
    );
    return puts;
  };
  const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it("starts from what the server remembers — marked on the Mac, quiet on the website", async () => {
    // the Mac saw three and opened the DelayIQ
    let marked = markNotifications(emptyNotificationState(), ["field-fu-1", "weather-wa-1", "delayIQ-delayIQ-rain"], "seen");
    marked = markNotifications(marked, ["delayIQ-delayIQ-rain"], "read");
    state.bootstrapPayload = { ...bootstrapFixture, userSettings: { [NOTIFICATION_STATE_SETTING]: encodeNotificationState(marked) } };
    render(<App />);
    await enterDashboard();

    expect(badge()).toBe(String(bootstrapNotificationCount() - 3));
    const panel = openBell();
    expect(rowFor(panel, /Heavy Rain DelayIQ/).className).toContain("is-read");
    expect(rowFor(panel, /Steel framing/).className).not.toContain("is-read");
  });

  it("tells the server once for a run of changes", async () => {
    const puts = recordPuts((value) => new Response(JSON.stringify({ ok: true, key: NOTIFICATION_STATE_SETTING, value }), { status: 200 }));
    render(<App />);
    await enterDashboard();

    const panel = openBell(); // seeing them all is one change...
    fireEvent.click(within(panel).getByRole("button", { name: "More notification actions" }));
    fireEvent.click(within(panel).getByRole("menuitem", { name: /Mark all as read/ })); // ...reading them all, a second
    expect(puts).toHaveLength(0); // nothing yet: it waits for the run to end

    await waitFor(() => expect(puts).toHaveLength(1), { timeout: 4000 });
    await settle(1_300);
    expect(puts).toHaveLength(1);
    const sent = decodeNotificationState(puts[0]);
    expect(isNotificationRead(sent, { id: "field-fu-1", timestamp: "2026-06-16T09:18:00.000Z" })).toBe(true);
    expect(isNotificationRead(sent, { id: "equipment-eq-pump", timestamp: new Date().toISOString() })).toBe(true);
  });

  it("takes back the server's merge, so what the Mac marked meanwhile shows here too", async () => {
    // the server's answer carries something the Mac marked meanwhile: the inspection, read
    const puts = recordPuts((value) => {
      const merged = markNotifications(decodeNotificationState(value), ["inspection-insp-1"], "read");
      return new Response(JSON.stringify({ ok: true, key: NOTIFICATION_STATE_SETTING, value: encodeNotificationState(merged) }), {
        status: 200
      });
    });
    render(<App />);
    await enterDashboard();

    const panel = openBell(); // seen, not read
    expect(rowFor(panel, /Foundation Inspection/).className).not.toContain("is-read");
    await waitFor(() => expect(puts).toHaveLength(1), { timeout: 4000 });
    expect(isNotificationSeen(decodeNotificationState(puts[0]), { id: "inspection-insp-1", timestamp: "2026-06-23T10:00:00.000Z" })).toBe(
      true
    );
    await waitFor(() => expect(rowFor(panel, /Foundation Inspection/).className).toContain("is-read"));
    expect(rowFor(panel, /Steel framing/).className).not.toContain("is-read");
  });

  it("keeps working when the server will not take it — the shared demo is read-only", async () => {
    const puts = recordPuts(
      () =>
        new Response(JSON.stringify({ error: "The demo workspace is shared and read-only.", code: "demo-read-only" }), {
          status: 403
        })
    );
    const first = render(<App />);
    await enterDashboard();
    fireEvent.click(rowFor(openBell(), /Ready Mix Concrete/));
    await waitFor(() => expect(puts).toHaveLength(1), { timeout: 4000 });

    // refused: this page stops asking...
    const again = openBell();
    fireEvent.click(within(again).getByRole("button", { name: "More notification actions" }));
    fireEvent.click(within(again).getByRole("menuitem", { name: /Mark all as read/ }));
    await settle(1_300);
    expect(puts).toHaveLength(1);
    first.unmount();

    // ...and this browser still remembers, as it always did
    render(<App />);
    await enterDashboard();
    expect(badge()).toBeNull();
    const reopened = openBell();
    fireEvent.click(within(reopened).getByText("Unread only"));
    expect(rows(reopened)).toHaveLength(0);
  });

  it("still honours what this browser kept before the server did", async () => {
    window.localStorage.setItem("bf:notifications:seen:u-matt", JSON.stringify(["field-fu-1", "weather-wa-1"]));
    window.localStorage.setItem("bf:notifications:read:u-matt", JSON.stringify(["weather-wa-1"]));
    render(<App />);
    await enterDashboard();
    expect(badge()).toBe(String(bootstrapNotificationCount() - 2));
    expect(rowFor(openBell(), /Heavy rain expected/).className).toContain("is-read");
  });
});
