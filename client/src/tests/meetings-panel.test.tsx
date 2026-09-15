/**
 * The Meetings panel: what it says before a calendar is connected, and the countdown.
 *
 * The connect flow itself is a full-page redirect to Google or Microsoft and is covered
 * server-side in server/test/calendar.test.ts, end to end against a stand-in provider. What
 * is worth asserting here is the part a person sees: that an unconfigured deployment says so
 * instead of offering a button that cannot work, and that the pill tells the truth about
 * when the next meeting is.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeetingsPanel, countdownLabel, dayLabel } from "../MeetingsPanel";

const NOW = new Date("2026-09-14T13:00:00Z").getTime();
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

/** Answers the two calls the panel makes, and nothing else. */
function calendarApi(providers: Record<string, { configured: boolean; connected: boolean; email: string }>, events: unknown[] = []) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/calendar/status")) return new Response(JSON.stringify({ providers }), { status: 200 });
    if (url.includes("/api/calendar/events"))
      return new Response(JSON.stringify({ events, failed: [], fetchedAt: new Date(NOW).toISOString() }), { status: 200 });
    return new Response("{}", { status: 404 });
  });
}

const NOT_CONFIGURED = {
  google: { configured: false, connected: false, email: "" },
  microsoft: { configured: false, connected: false, email: "" }
};

describe("the countdown", () => {
  it("says what a person would say about the time left", () => {
    expect(countdownLabel(at(5), at(35), NOW)).toBe("In 5 min.");
    expect(countdownLabel(at(1), at(31), NOW)).toBe("In 1 min.");
    expect(countdownLabel(at(59), at(89), NOW)).toBe("In 59 min.");
    expect(countdownLabel(at(70), at(100), NOW)).toBe("In 1 h 10 min.");
    expect(countdownLabel(at(120), at(150), NOW)).toBe("In 2 h");
    // in progress, and over
    expect(countdownLabel(at(-5), at(25), NOW)).toBe("Now");
    expect(countdownLabel(at(-40), at(-10), NOW)).toBe("Ended");
    // far enough out that a countdown stops being useful
    expect(countdownLabel(at(600), at(630), NOW)).toMatch(/\d{1,2}:\d{2}/);
  });

  it("groups by the day a person means", () => {
    expect(dayLabel(at(30), NOW)).toBe("Today");
    expect(dayLabel(at(60 * 24), NOW)).toBe("Tomorrow");
  });
});

describe("the Meetings panel", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("offers Google and Outlook, and says when neither is set up", async () => {
    vi.stubGlobal("fetch", calendarApi(NOT_CONFIGURED));
    render(<MeetingsPanel />);

    expect(await screen.findByText("Not connected")).toBeInTheDocument();
    expect(screen.getByText("Turn meetings into your day plan")).toBeInTheDocument();
    // both providers are offered, and both are refused rather than pretending
    const google = screen.getByRole("button", { name: "Google" });
    const outlook = screen.getByRole("button", { name: "Outlook" });
    expect(google).toBeDisabled();
    expect(outlook).toBeDisabled();
    expect(await screen.findByText("No calendar provider is set up on this deployment yet.")).toBeInTheDocument();
  });

  it("offers a real link once a provider has credentials", async () => {
    vi.stubGlobal(
      "fetch",
      calendarApi({ ...NOT_CONFIGURED, google: { configured: true, connected: false, email: "" } })
    );
    render(<MeetingsPanel />);

    const google = await screen.findByRole("link", { name: "Google" });
    expect(google).toHaveAttribute("href", expect.stringContaining("/api/calendar/google/start"));
    // the one without credentials is still refused
    expect(screen.getByRole("button", { name: "Outlook" })).toBeDisabled();
  });

  it("counts down to the next meeting and names the mailbox", async () => {
    vi.stubGlobal(
      "fetch",
      calendarApi({ ...NOT_CONFIGURED, google: { configured: true, connected: true, email: "dana@asphaltco.com" } }, [
        {
          id: "google:1",
          provider: "google",
          title: "Podium framing walkthrough",
          startsAt: at(5),
          endsAt: at(35),
          allDay: false,
          location: "Harborview",
          joinUrl: "https://meet.example/abc",
          attendees: ["Carlos Ramirez", "Dana Brooks"]
        },
        {
          id: "google:2",
          provider: "google",
          title: "Pre-pour inspection",
          startsAt: at(180),
          endsAt: at(210),
          allDay: false,
          location: "",
          joinUrl: "",
          attendees: []
        }
      ])
    );
    render(<MeetingsPanel />);

    expect(await screen.findByText("dana@asphaltco.com")).toBeInTheDocument();
    expect(await screen.findByText("In 5 min.")).toBeInTheDocument();
    expect(screen.getByText("Podium framing walkthrough")).toBeInTheDocument();
    expect(screen.getByText("Pre-pour inspection")).toBeInTheDocument();
    // a meeting with a link is joinable straight from the panel
    expect(screen.getByRole("link", { name: /Join/ })).toHaveAttribute("href", "https://meet.example/abc");
  });

  /** A meeting that has finished must drop off on its own, not sit at the top saying "Ended". */
  it("drops a meeting once it is over", async () => {
    vi.stubGlobal(
      "fetch",
      calendarApi({ ...NOT_CONFIGURED, google: { configured: true, connected: true, email: "dana@asphaltco.com" } }, [
        { id: "google:past", provider: "google", title: "Morning huddle", startsAt: at(-60), endsAt: at(-30), allDay: false, location: "", joinUrl: "", attendees: [] },
        { id: "google:next", provider: "google", title: "Pre-pour inspection", startsAt: at(45), endsAt: at(75), allDay: false, location: "", joinUrl: "", attendees: [] }
      ])
    );
    render(<MeetingsPanel />);

    await waitFor(() => expect(screen.getByText("Pre-pour inspection")).toBeInTheDocument());
    expect(screen.queryByText("Morning huddle")).not.toBeInTheDocument();
    expect(screen.getByText("In 45 min.")).toBeInTheDocument();
  });
});
