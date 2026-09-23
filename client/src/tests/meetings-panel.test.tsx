/**
 * The Meetings panel: what it says before a calendar is connected, and the calendar it becomes once
 * one is (2026-09-23: "when a user is connected change up what the Section/Widget will look like").
 *
 * The connect flow itself is a full-page redirect to Google or Microsoft and is covered
 * server-side in server/test/calendar.test.ts, end to end against a stand-in provider. What
 * is worth asserting here is the part a person sees: that an unconfigured deployment says so
 * instead of offering a button that cannot work; that a connected calendar shows every meeting on
 * a day, week and month, with the countdown and the link to join; that a meeting opens with
 * everything a person checks before walking in; and that coming back from the provider says how
 * it went.
 *
 * The clock is LOCAL (Monday, September 14, 2026, 9:00), because the calendar lays days out in
 * the reader's own time zone; built that way, the suite holds wherever it runs.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeetingsPanel } from "../MeetingsPanel";
import { SIGN_IN_TIMING } from "../meetings/signInWindow";

const NOW = new Date(2026, 8, 14, 9, 0).getTime();
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

type Providers = Record<"google" | "microsoft", { configured: boolean; connected: boolean; email: string }>;

/**
 * Answers the calls the panel makes, and nothing else. `providers` is live: a DELETE disconnects,
 * the way the server does, so the next status read says so.
 */
function calendarApi(providers: Providers, events: unknown[] = [], failed: string[] = []) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const disconnect = url.match(/\/api\/calendar\/(google|microsoft)$/);
    if (disconnect && init?.method === "DELETE") {
      providers[disconnect[1] as keyof Providers] = { ...providers[disconnect[1] as keyof Providers], connected: false, email: "" };
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url.includes("/api/calendar/status")) return new Response(JSON.stringify({ providers }), { status: 200 });
    if (url.includes("/api/calendar/events"))
      return new Response(JSON.stringify({ events, failed, fetchedAt: new Date(NOW).toISOString() }), { status: 200 });
    return new Response("{}", { status: 404 });
  });
}

const NOT_CONFIGURED = (): Providers => ({
  google: { configured: false, connected: false, email: "" },
  microsoft: { configured: false, connected: false, email: "" }
});
const GOOGLE = (): Providers => ({
  google: { configured: true, connected: true, email: "dana@asphaltco.com" },
  microsoft: { configured: true, connected: false, email: "" }
});

const WALKTHROUGH = {
  id: "google:1",
  provider: "google",
  title: "Podium framing walkthrough",
  startsAt: at(5),
  endsAt: at(35),
  allDay: false,
  location: "Harborview",
  joinUrl: "https://meet.google.com/abc-defg-hij",
  attendees: ["Carlos Ramirez", "Dana Brooks"],
  organizer: "Carlos Ramirez",
  guests: [
    { name: "Carlos Ramirez", email: "carlos@harborview.com", response: "accepted", organizer: true },
    { name: "Dana Brooks", email: "dana@asphaltco.com", response: "tentative", organizer: false }
  ],
  myResponse: "tentative",
  description: "Bring the podium drawings & the RFI log.\nPark on 5th.",
  webUrl: "https://calendar.google.com/calendar/event?eid=abc",
  conference: "Google Meet"
};
const INSPECTION = {
  id: "google:2",
  provider: "google",
  title: "Pre-pour inspection",
  startsAt: at(180),
  endsAt: at(210),
  allDay: false,
  location: "",
  joinUrl: "",
  attendees: []
};

const eventCalls = (fetch: ReturnType<typeof calendarApi>) =>
  fetch.mock.calls.map(([input]) => String(input)).filter((url) => url.includes("/api/calendar/events"));
const upNext = () => screen.getByRole("region", { name: "Up next" });

describe("the Meetings panel", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(NOW));
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("offers Google and Outlook, and says when neither is set up", async () => {
    vi.stubGlobal("fetch", calendarApi(NOT_CONFIGURED()));
    render(<MeetingsPanel />);

    expect(await screen.findByText("Not connected")).toBeInTheDocument();
    expect(screen.getByText("Turn meetings into your day plan")).toBeInTheDocument();
    // both providers are offered, and both are refused rather than pretending
    expect(screen.getByRole("button", { name: "Google" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Outlook" })).toBeDisabled();
    expect(await screen.findByText(/Google and Outlook sign-in are not switched on for this BuildFlow yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Google" })).toHaveAttribute(
      "title",
      "Google sign-in is not switched on for this BuildFlow yet"
    );
  });

  it("offers a real sign-in link once a provider has credentials", async () => {
    vi.stubGlobal("fetch", calendarApi({ ...NOT_CONFIGURED(), google: { configured: true, connected: false, email: "" } }));
    render(<MeetingsPanel />);

    const google = await screen.findByRole("link", { name: "Google" });
    expect(google).toHaveAttribute("href", expect.stringContaining("/api/calendar/google/start"));
    // the one without credentials is still refused
    expect(screen.getByRole("button", { name: "Outlook" })).toBeDisabled();
    expect(screen.getByText("Read-only: BuildFlow can see your meetings and never changes them.")).toBeInTheDocument();
  });

  it("becomes the calendar once connected: the week, every meeting on it, and what is up next", async () => {
    const fetch = calendarApi(GOOGLE(), [WALKTHROUGH, INSPECTION]);
    vi.stubGlobal("fetch", fetch);
    render(<MeetingsPanel />);

    // the mailbox, in the panel's state line and against its calendar
    expect(await screen.findAllByText("dana@asphaltco.com")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Week", pressed: true })).toBeInTheDocument();
    expect(screen.getByText("Sep 14 – 20, 2026")).toBeInTheDocument();
    expect(await screen.findByText("2 meetings · 1 h booked")).toBeInTheDocument();

    // both meetings are on the grid, at their times
    expect(screen.getByRole("button", { name: /^Podium framing walkthrough, 9:05 – 9:35 AM, Google Meet/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pre-pour inspection, 12:00 – 12:30 PM/ })).toBeInTheDocument();

    // up next: the countdown on the first, and its call one click away
    expect(within(upNext()).getByText("In 5 min.")).toBeInTheDocument();
    expect(within(upNext()).getByRole("link", { name: "Join Podium framing walkthrough" })).toHaveAttribute(
      "href",
      "https://meet.google.com/abc-defg-hij"
    );
    expect(within(upNext()).getByText("In 3 h")).toBeInTheDocument();

    // ONE read covers the whole month grid, and with it the week ahead
    const calls = eventCalls(fetch);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain(`from=${encodeURIComponent(new Date(2026, 7, 31).toISOString())}`);
    expect(calls[0]).toContain(`to=${encodeURIComponent(new Date(2026, 9, 12).toISOString())}`);

    // the calendar it came from, a way to connect the other, and a way out
    expect(screen.getByRole("switch", { name: "Show Google Calendar" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("link", { name: /Connect Outlook/ })).toHaveAttribute(
      "href",
      expect.stringContaining("/api/calendar/microsoft/start")
    );
    expect(screen.getByRole("button", { name: "Disconnect Google" })).toBeEnabled();
    // New event opens the provider's own editor: the connection only reads
    expect(screen.getByRole("link", { name: /New event/ })).toHaveAttribute("href", "https://calendar.google.com/calendar/r/eventedit");
  });

  /** A meeting that has finished stays on the calendar, faded, and leaves Up next on its own. */
  it("keeps a finished meeting on the grid but drops it from Up next", async () => {
    vi.stubGlobal(
      "fetch",
      calendarApi(GOOGLE(), [
        { id: "google:past", provider: "google", title: "Morning huddle", startsAt: at(-60), endsAt: at(-30), allDay: false },
        { id: "google:next", provider: "google", title: "Pre-pour inspection", startsAt: at(45), endsAt: at(75), allDay: false }
      ])
    );
    render(<MeetingsPanel />);

    expect(await screen.findByRole("button", { name: /^Morning huddle/ })).toHaveClass("is-past");
    expect(within(upNext()).queryByText("Morning huddle")).not.toBeInTheDocument();
    expect(within(upNext()).getByText("In 45 min.")).toBeInTheDocument();
  });

  it("moves between Day, Week and Month, and back to today", async () => {
    vi.stubGlobal("fetch", calendarApi(GOOGLE(), [WALKTHROUGH, INSPECTION]));
    render(<MeetingsPanel />);
    await screen.findByText("Sep 14 – 20, 2026");

    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    expect(screen.getByRole("button", { name: "Month", pressed: true })).toBeInTheDocument();
    expect(screen.getByText("September 2026", { selector: ".bfmc-heading strong" })).toBeInTheDocument();
    expect(screen.getByText("2 meetings")).toBeInTheDocument();
    // a day in the month says how full it is, and opens on its own
    fireEvent.click(screen.getByRole("button", { name: "Monday, September 14, 2 meetings" }));
    expect(screen.getByRole("button", { name: "Day", pressed: true })).toBeInTheDocument();
    expect(screen.getByText("Monday, Sep 14, 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(screen.getByText("Tuesday, Sep 15, 2026")).toBeInTheDocument();
    expect(screen.getByText("No meetings on this day")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByText("Monday, Sep 14, 2026")).toBeInTheDocument();

    // the view is remembered for next time
    expect(localStorage.getItem("bf:meetings:view")).toBe('"day"');
  });

  it("reads the week ahead on its own once the calendar is paged to another month", async () => {
    const fetch = calendarApi(GOOGLE(), [WALKTHROUGH]);
    vi.stubGlobal("fetch", fetch);
    render(<MeetingsPanel />);
    await screen.findByText("Sep 14 – 20, 2026");

    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("October 2026", { selector: ".bfmc-heading strong" })).toBeInTheDocument();
    await waitFor(() => expect(eventCalls(fetch)).toHaveLength(3));
    // October's grid, and the seven days from now, so Up next still tells the truth
    expect(eventCalls(fetch).some((url) => url.includes(`from=${encodeURIComponent(new Date(2026, 8, 28).toISOString())}`))).toBe(true);
    expect(eventCalls(fetch).some((url) => url.includes(`from=${encodeURIComponent(new Date(NOW).toISOString())}`))).toBe(true);
    expect(within(upNext()).getByText("Podium framing walkthrough")).toBeInTheDocument();
  });

  it("opens a meeting with what a person checks before walking in: details, then the people", async () => {
    vi.stubGlobal("fetch", calendarApi(GOOGLE(), [WALKTHROUGH, INSPECTION]));
    render(<MeetingsPanel />);

    fireEvent.click(await screen.findByRole("button", { name: /^Podium framing walkthrough, 9:05/ }));
    const drawer = await screen.findByRole("dialog", { name: "Podium framing walkthrough" });
    expect(within(drawer).getByText("Monday, September 14 · 9:05 – 9:35 AM", { selector: ".pdx-sub" })).toBeInTheDocument();
    expect(within(drawer).getByText("In 5 min.")).toBeInTheDocument();
    expect(within(drawer).getByText("30 min")).toBeInTheDocument();
    expect(within(drawer).getByText("Harborview")).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: "Google Meet · meet.google.com/abc-defg-hij" })).toHaveAttribute(
      "href",
      "https://meet.google.com/abc-defg-hij"
    );
    expect(within(drawer).getByText("Carlos Ramirez")).toBeInTheDocument();
    // how you answered, as a pill and as a fact
    expect(within(drawer).getAllByText("Maybe")).toHaveLength(2);
    expect(within(drawer).getByText("Google Calendar · dana@asphaltco.com")).toBeInTheDocument();
    expect(within(drawer).getByText(/Bring the podium drawings & the RFI log\./)).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: /Join Google Meet/ })).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
    expect(within(drawer).getByRole("link", { name: /Open in Google Calendar/ })).toHaveAttribute(
      "href",
      "https://calendar.google.com/calendar/event?eid=abc"
    );

    fireEvent.click(within(drawer).getByRole("tab", { name: "Participants 2" }));
    expect(within(drawer).getByRole("tab", { name: "Participants 2" })).toHaveAttribute("aria-selected", "true");
    expect(within(drawer).getByText("2 people invited · 1 going · 1 maybe")).toBeInTheDocument();
    const carlos = within(drawer).getByText("carlos@harborview.com").closest("li") as HTMLElement;
    expect(within(carlos).getByText("Organizer")).toBeInTheDocument();
    expect(within(carlos).getByText("Going")).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole("button", { name: "Close meeting" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("warns about a double booking, and opens the other meeting from the warning", async () => {
    vi.stubGlobal(
      "fetch",
      calendarApi(GOOGLE(), [
        WALKTHROUGH,
        { id: "google:3", provider: "google", title: "Budget review", startsAt: at(15), endsAt: at(45), allDay: false }
      ])
    );
    render(<MeetingsPanel />);

    fireEvent.click(await screen.findByRole("button", { name: /^Podium framing walkthrough, 9:05/ }));
    const drawer = await screen.findByRole("dialog", { name: "Podium framing walkthrough" });
    expect(within(drawer).getByRole("note")).toHaveTextContent("Overlaps with Budget review (9:15 – 9:45 AM).");
    fireEvent.click(within(drawer).getByRole("button", { name: "Budget review" }));
    expect(await screen.findByRole("dialog", { name: "Budget review" })).toBeInTheDocument();
  });

  it("shows two calendars side by side, hides one with its switch, and asks where a new event goes", async () => {
    vi.stubGlobal(
      "fetch",
      calendarApi(
        {
          google: { configured: true, connected: true, email: "dana@asphaltco.com" },
          microsoft: { configured: true, connected: true, email: "dana@contoso.com" }
        },
        [
          WALKTHROUGH,
          { id: "microsoft:1", provider: "microsoft", title: "Owner's meeting", startsAt: at(120), endsAt: at(180), allDay: false }
        ]
      )
    );
    render(<MeetingsPanel />);

    expect(await screen.findByRole("button", { name: /^Owner's meeting/ })).toHaveClass("is-microsoft");
    fireEvent.click(screen.getByRole("switch", { name: "Show Outlook Calendar" }));
    expect(screen.getByRole("switch", { name: "Show Outlook Calendar" })).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText("Owner's meeting")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Podium framing walkthrough/ })).toBeInTheDocument();
    expect(localStorage.getItem("bf:meetings:hidden")).toBe('["microsoft"]');

    fireEvent.click(screen.getByRole("button", { name: /New event/ }));
    const menu = screen.getByRole("menu", { name: "New event in" });
    expect(within(menu).getByRole("menuitem", { name: /Google Calendar/ })).toHaveAttribute(
      "href",
      "https://calendar.google.com/calendar/r/eventedit"
    );
    // a work account writes on outlook.office.com
    expect(within(menu).getByRole("menuitem", { name: /Outlook Calendar/ })).toHaveAttribute(
      "href",
      expect.stringContaining("outlook.office.com")
    );
  });

  it("says when a calendar could not be reached, rather than showing it as empty", async () => {
    vi.stubGlobal(
      "fetch",
      calendarApi(
        {
          google: { configured: true, connected: true, email: "dana@asphaltco.com" },
          microsoft: { configured: true, connected: true, email: "dana@contoso.com" }
        },
        [WALKTHROUGH],
        ["microsoft"]
      )
    );
    render(<MeetingsPanel />);

    expect(
      await screen.findByText("Outlook could not be reached just now, so its meetings are missing. Sync to try again.")
    ).toBeInTheDocument();
  });

  it("goes back to the sign-in pitch when the last calendar is disconnected", async () => {
    vi.stubGlobal("fetch", calendarApi(GOOGLE(), [WALKTHROUGH]));
    render(<MeetingsPanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Disconnect Google" }));
    expect(await screen.findByText("Turn meetings into your day plan")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
  });

  it("says the calendar is connected when Google sends the browser back, once", async () => {
    window.history.replaceState(null, "", "/?calendar=connected&provider=google#dashboard");
    vi.stubGlobal("fetch", calendarApi(GOOGLE(), [WALKTHROUGH]));
    render(<MeetingsPanel />);

    expect(await screen.findByText("Google Calendar is connected. Your meetings are below.")).toBeInTheDocument();
    // taken out of the address, so a reload does not say it again; the rest of the address stays
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#dashboard");
  });

  it("settles at the top of the screen once it knows what it shows, after coming back from signing in", async () => {
    window.history.replaceState(null, "", "/?calendar=connected&provider=google#dashboard");
    vi.stubGlobal("fetch", calendarApi(GOOGLE(), [WALKTHROUGH]));
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: scrollIntoView, configurable: true, writable: true });
    try {
      // on the Dashboard the panel sits in a board block; that block is what comes into view
      const { container } = render(
        <div className="dash-block" data-dash-drag-id="meetings">
          <MeetingsPanel />
        </div>
      );
      await screen.findByText("Google Calendar is connected. Your meetings are below.");
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1), { timeout: 3000 });
      expect(scrollIntoView.mock.contexts[0]).toBe(container.querySelector(".dash-block"));
      expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
    } finally {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it("stays where it is on an ordinary visit", async () => {
    vi.stubGlobal("fetch", calendarApi(GOOGLE(), [WALKTHROUGH]));
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: scrollIntoView, configurable: true, writable: true });
    try {
      render(<MeetingsPanel />);
      await screen.findByRole("button", { name: "Week", pressed: true });
      await new Promise((resolve) => setTimeout(resolve, 800));
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it("says why a connection did not finish", async () => {
    window.history.replaceState(null, "", "/?calendar=error&reason=access_denied#dashboard");
    vi.stubGlobal("fetch", calendarApi({ ...NOT_CONFIGURED(), google: { configured: true, connected: false, email: "" } }));
    render(<MeetingsPanel />);

    expect(
      await screen.findByText("The calendar could not be connected: the request was cancelled on the consent screen.")
    ).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  /**
   * SIGNING IN WITHOUT LEAVING THE DASHBOARD (2026-09-23): "make it so that users are able to login to
   * Google & outlook within the meeting Section/Widget". The provider's page opens in a window over the
   * Dashboard; the card waits with it and becomes the calendar when it is done.
   */
  describe("signing in in a window", () => {
    const TIMING = { ...SIGN_IN_TIMING };
    let frame: HTMLIFrameElement | null = null;
    /** A real window object, so a message can name it as its source, standing in for the pop-up. */
    const signInWindow = () => {
      frame = document.createElement("iframe");
      document.body.appendChild(frame);
      const popup = frame.contentWindow!;
      vi.spyOn(popup, "close").mockImplementation(() => undefined);
      vi.spyOn(popup, "focus").mockImplementation(() => undefined);
      return popup;
    };
    const configured = (): Providers => ({ ...NOT_CONFIGURED(), google: { configured: true, connected: false, email: "" } });
    const tellPanel = (source: Window, data: unknown) => window.dispatchEvent(new MessageEvent("message", { data, source }));

    afterEach(() => {
      Object.assign(SIGN_IN_TIMING, TIMING);
      frame?.remove();
      frame = null;
    });

    it("opens the provider in a window, waits with it, and becomes the calendar when it is done", async () => {
      const providers = configured();
      vi.stubGlobal("fetch", calendarApi(providers, [WALKTHROUGH]));
      const popup = signInWindow();
      const open = vi.fn(() => popup);
      vi.stubGlobal("open", open);
      render(<MeetingsPanel />);

      // the link keeps its address (a new tab, no script), and a click opens the window instead
      const google = await screen.findByRole("link", { name: "Google" });
      expect(fireEvent.click(google)).toBe(false);
      expect(open).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/calendar\/google\/start\?returnTo=.*&mode=popup$/),
        "bf-calendar-sign-in",
        expect.stringContaining("popup=yes")
      );
      expect(screen.getByText("Finish signing in with Google")).toBeInTheDocument();

      // the window finishes: the server now has the connection, and the window says so
      providers.google = { configured: true, connected: true, email: "dana@asphaltco.com" };
      tellPanel(popup, { type: "bf-calendar", calendar: "connected", provider: "google" });

      expect(await screen.findByText("Google Calendar is connected. Your meetings are below.")).toBeInTheDocument();
      expect(await screen.findByRole("button", { name: "Week", pressed: true })).toBeInTheDocument();
      expect(popup.close).toHaveBeenCalled();
    });

    it("takes the server's word for it when the window's message never arrives", async () => {
      Object.assign(SIGN_IN_TIMING, { pollMs: 40 });
      const providers = configured();
      vi.stubGlobal("fetch", calendarApi(providers, [WALKTHROUGH]));
      vi.stubGlobal(
        "open",
        vi.fn(() => signInWindow())
      );
      render(<MeetingsPanel />);

      fireEvent.click(await screen.findByRole("link", { name: "Google" }));
      expect(screen.getByText("Finish signing in with Google")).toBeInTheDocument();
      // a message from any other window is not this one's to act on
      tellPanel(window, { type: "bf-calendar", calendar: "error", reason: "access_denied" });
      expect(screen.getByText("Finish signing in with Google")).toBeInTheDocument();

      providers.google = { configured: true, connected: true, email: "dana@asphaltco.com" };
      expect(await screen.findByRole("button", { name: "Week", pressed: true })).toBeInTheDocument();
    });

    it("says why when the window reports a sign-in that did not finish", async () => {
      vi.stubGlobal("fetch", calendarApi(configured()));
      const popup = signInWindow();
      vi.stubGlobal(
        "open",
        vi.fn(() => popup)
      );
      render(<MeetingsPanel />);

      fireEvent.click(await screen.findByRole("link", { name: "Google" }));
      tellPanel(popup, { type: "bf-calendar", calendar: "error", provider: "google", reason: "access_denied" });

      expect(
        await screen.findByText("Google Calendar could not be connected: the request was cancelled on the consent screen.")
      ).toBeInTheDocument();
      // and the way in is back
      expect(screen.getByRole("link", { name: "Google" })).toBeInTheDocument();
    });

    it("stops waiting when the window is closed before it finishes, and on Cancel", async () => {
      Object.assign(SIGN_IN_TIMING, { watchMs: 20, closedGraceMs: 60 });
      vi.stubGlobal("fetch", calendarApi(configured()));
      const closing = { closed: false, close: vi.fn(), focus: vi.fn() };
      vi.stubGlobal(
        "open",
        vi.fn(() => closing)
      );
      render(<MeetingsPanel />);

      fireEvent.click(await screen.findByRole("link", { name: "Google" }));
      expect(screen.getByText("Finish signing in with Google")).toBeInTheDocument();
      closing.closed = true;
      expect(await screen.findByText("The Google sign-in window was closed before it finished.")).toBeInTheDocument();

      // Cancel closes the window and says nothing more
      closing.closed = false;
      fireEvent.click(screen.getByRole("link", { name: "Google" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(closing.close).toHaveBeenCalled();
      expect(screen.getByRole("link", { name: "Google" })).toBeInTheDocument();
      expect(screen.queryByText("Finish signing in with Google")).not.toBeInTheDocument();
    });

    it("signs in in the tab when the browser blocks the window", async () => {
      vi.stubGlobal("fetch", calendarApi(configured()));
      vi.stubGlobal(
        "open",
        vi.fn(() => null)
      );
      render(<MeetingsPanel />);

      // nothing in the panel stops the link, so the browser follows it to the provider as before
      // (read after the panel's own handler, then stopped here: jsdom cannot navigate)
      let stoppedByPanel: boolean | null = null;
      const afterPanel = (event: Event) => {
        stoppedByPanel = event.defaultPrevented;
        event.preventDefault();
      };
      window.addEventListener("click", afterPanel);
      fireEvent.click(await screen.findByRole("link", { name: "Google" }));
      window.removeEventListener("click", afterPanel);
      expect(stoppedByPanel).toBe(false);
      expect(screen.queryByText("Finish signing in with Google")).not.toBeInTheDocument();
    });

    it("connects the other calendar from the calendar, in the same window", async () => {
      vi.stubGlobal("fetch", calendarApi(GOOGLE(), [WALKTHROUGH]));
      const open = vi.fn(() => signInWindow());
      vi.stubGlobal("open", open);
      render(<MeetingsPanel />);

      expect(fireEvent.click(await screen.findByRole("link", { name: /Connect Outlook/ }))).toBe(false);
      expect(open).toHaveBeenCalledWith(
        expect.stringContaining("/api/calendar/microsoft/start"),
        "bf-calendar-sign-in",
        expect.any(String)
      );
      expect(screen.getByText("Finish signing in with Outlook")).toBeInTheDocument();
      // the calendar stays up while it waits
      expect(screen.getByRole("button", { name: "Week", pressed: true })).toBeInTheDocument();
    });
  });
});
