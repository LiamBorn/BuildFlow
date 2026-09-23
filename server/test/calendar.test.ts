/**
 * Connecting a calendar, and reading meetings off it.
 *
 * The whole flow is exercised against a STAND-IN provider — a tiny express app that issues a
 * code, trades it for an access and refresh token, and serves an events list. That is what
 * the overridable URLs in calendar.ts are for, and it means the integration is tested end to
 * end without a real Google or Microsoft app: consent, the code exchange, the stored refresh
 * token, a refresh when the access token has expired, and the normalised feed the panel reads.
 *
 * The first two tests are the honest-without-credentials case, which is what every deployment
 * looks like until someone registers an OAuth app.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import { calendarPopupPage, conferenceName, plainNotes, readGraphEvents } from "../src/calendar.js";

const CLIENT_ID = "test-google-client";

/** A stand-in Google: consent, token endpoint, and one calendar of events. */
function fakeProvider() {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  let refreshCount = 0;
  let events: unknown[] = [];
  /** The window the last events read asked for. */
  let lastWindow: { timeMin: string; timeMax: string; maxResults: string } | null = null;
  app.get("/authorize", (req, res) => {
    // the scope and offline access are what make a refresh token possible at all
    if (!String(req.query.scope).includes("calendar.readonly")) {
      res.status(400).send("scope");
      return;
    }
    if (req.query.access_type !== "offline") {
      res.status(400).send("access_type");
      return;
    }
    res.redirect(`${req.query.redirect_uri}?code=cal-code&state=${req.query.state}`);
  });
  app.post("/token", (req, res) => {
    if (req.body.client_id !== CLIENT_ID) {
      res.status(400).json({ error: "invalid_client" });
      return;
    }
    if (req.body.grant_type === "refresh_token") {
      if (req.body.refresh_token !== "refresh-1") {
        res.status(400).json({ error: "invalid_grant" });
        return;
      }
      refreshCount += 1;
      res.json({ access_token: `access-refreshed-${refreshCount}`, expires_in: 3600, token_type: "Bearer" });
      return;
    }
    if (req.body.code !== "cal-code" || !req.body.code_verifier) {
      res.status(400).json({ error: "invalid_grant" });
      return;
    }
    const idToken = Buffer.from(JSON.stringify({ email: "dana@asphaltco.com" })).toString("base64url");
    res.json({
      access_token: "access-1",
      refresh_token: "refresh-1",
      expires_in: 3600,
      id_token: `eyJhbGciOiJub25lIn0.${idToken}.sig`,
      token_type: "Bearer"
    });
  });
  app.get("/events", (req, res) => {
    if (!String(req.headers.authorization ?? "").startsWith("Bearer ")) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    lastWindow = {
      timeMin: String(req.query.timeMin ?? ""),
      timeMax: String(req.query.timeMax ?? ""),
      maxResults: String(req.query.maxResults ?? "")
    };
    res.json({ items: events });
  });
  return {
    app,
    setEvents: (next: unknown[]) => {
      events = next;
    },
    lastWindow: () => lastWindow,
    refreshes: () => refreshCount
  };
}

describe("Google Calendar and Outlook", () => {
  let server: Server;
  let base = "";
  let setEvents: (next: unknown[]) => void;
  let refreshes: () => number;
  let lastWindow: () => { timeMin: string; timeMax: string; maxResults: string } | null;

  const configure = () => {
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.OAUTH_GOOGLE_AUTHORIZE_URL = `${base}/authorize`;
    process.env.OAUTH_GOOGLE_TOKEN_URL = `${base}/token`;
    process.env.CALENDAR_GOOGLE_EVENTS_URL = `${base}/events`;
    process.env.BUILDFLOW_API_URL = "http://api.test";
  };
  const unconfigure = () => {
    for (const key of [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "OAUTH_GOOGLE_AUTHORIZE_URL",
      "OAUTH_GOOGLE_TOKEN_URL",
      "CALENDAR_GOOGLE_EVENTS_URL"
    ])
      delete process.env[key];
  };

  beforeAll(async () => {
    const fake = fakeProvider();
    setEvents = fake.setEvents;
    refreshes = fake.refreshes;
    lastWindow = fake.lastWindow;
    await new Promise<void>((resolve) => {
      server = fake.app.listen(0, () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => {
    server.close();
    unconfigure();
    delete process.env.BUILDFLOW_API_URL;
  });
  afterEach(() => unconfigure());

  /**
   * A workspace with its owner signed in. Every route here is gated — reading your own
   * calendar is "signed-in" and connecting one needs `integrations.connect` — so an
   * unauthenticated agent gets 401 and proves nothing about the calendar.
   */
  const signedIn = async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-calendar-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    const agent = request.agent(app);
    await agent
      .post("/api/auth/signup")
      .send({ email: "dana@asphaltco.com", password: "Roller-Tack-2026", name: "Dana Brooks", orgName: "Asphalt Co", acceptTerms: true })
      .expect(201);
    return { app, agent };
  };

  it("says no provider is configured when no OAuth app has been registered", async () => {
    const { agent } = await signedIn();
    const status = await agent.get("/api/calendar/status").expect(200);
    expect(status.body.providers.google).toEqual({ configured: false, connected: false, email: "" });
    expect(status.body.providers.microsoft).toEqual({ configured: false, connected: false, email: "" });
  });

  /** The panel disables the button for this case, but the route has to refuse it too. */
  it("refuses to start a connection for a provider with no credentials", async () => {
    const { agent } = await signedIn();
    const start = await agent.get("/api/calendar/google/start").expect(302);
    expect(start.headers.location).toContain("calendar=error");
    expect(start.headers.location).toContain("reason=not_configured");
  });

  it("has nothing to show before anything is connected", async () => {
    const { agent } = await signedIn();
    const feed = await agent.get("/api/calendar/events").expect(200);
    expect(feed.body.events).toEqual([]);
    expect(feed.body.failed).toEqual([]);
  });

  it("connects, stores the refresh token, and reads the calendar", async () => {
    configure();
    const { agent } = await signedIn();

    const start = await agent.get("/api/calendar/google/start").expect(302);
    const consent = new URL(start.headers.location);
    expect(consent.origin).toBe(base);
    expect(consent.searchParams.get("code_challenge_method")).toBe("S256");
    expect(consent.searchParams.get("redirect_uri")).toBe("http://api.test/api/calendar/google/callback");
    // read-only, and nothing wider
    expect(consent.searchParams.get("scope")).toContain("calendar.readonly");

    const provider = await fetch(consent, { redirect: "manual" });
    const back = new URL(provider.headers.get("location")!);
    const callback = await agent.get(`${back.pathname}${back.search}`).expect(302);
    expect(callback.headers.location).toContain("calendar=connected");

    const status = await agent.get("/api/calendar/status").expect(200);
    expect(status.body.providers.google).toEqual({ configured: true, connected: true, email: "dana@asphaltco.com" });
    // the refresh token is a secret and is never part of an answer
    expect(JSON.stringify(status.body)).not.toContain("refresh-1");

    const soon = new Date(Date.now() + 5 * 60_000);
    const later = new Date(Date.now() + 65 * 60_000);
    setEvents([
      {
        id: "evt-1",
        summary: "Podium framing walkthrough",
        location: "Harborview, East Austin",
        hangoutLink: "https://meet.example/abc",
        htmlLink: "https://calendar.google.com/event?eid=evt-1",
        description: "<p>Bring the <b>podium</b> drawings &amp; the RFI log.</p><p>Park on 5th.</p>",
        start: { dateTime: soon.toISOString() },
        end: { dateTime: later.toISOString() },
        organizer: { displayName: "Carlos Ramirez", email: "carlos@harborview.com" },
        conferenceData: { conferenceSolution: { name: "Google Meet" } },
        attendees: [
          { email: "dana@asphaltco.com", responseStatus: "tentative", self: true },
          { displayName: "Carlos Ramirez", email: "carlos@harborview.com", responseStatus: "accepted", organizer: true }
        ]
      },
      { id: "evt-2", summary: "All-hands", start: { date: "2026-09-16" }, end: { date: "2026-09-17" } }
    ]);

    const feed = await agent.get("/api/calendar/events").expect(200);
    expect(feed.body.failed).toEqual([]);
    expect(feed.body.events).toHaveLength(2);
    // timed before all-day, soonest first
    expect(feed.body.events[0]).toMatchObject({
      provider: "google",
      title: "Podium framing walkthrough",
      allDay: false,
      location: "Harborview, East Austin",
      joinUrl: "https://meet.example/abc",
      attendees: ["dana@asphaltco.com", "Carlos Ramirez"],
      // what a person reads before walking in: who called it, who is coming, how YOU answered
      organizer: "Carlos Ramirez",
      guests: [
        { name: "Carlos Ramirez", email: "carlos@harborview.com", response: "accepted", organizer: true },
        { name: "dana@asphaltco.com", email: "dana@asphaltco.com", response: "tentative", organizer: false }
      ],
      myResponse: "tentative",
      // the invite's notes arrive as HTML; the panel reads text
      description: "Bring the podium drawings & the RFI log.\nPark on 5th.",
      webUrl: "https://calendar.google.com/event?eid=evt-1",
      conference: "Google Meet"
    });
    // a meeting with no one else on it is the person's own
    expect(feed.body.events[1]).toMatchObject({ title: "All-hands", allDay: true, myResponse: "organizer", guests: [], conference: "" });
  });

  it("reads the range it is asked for, refuses one it cannot, and leaves cancelled meetings out", async () => {
    configure();
    const { agent } = await signedIn();
    const start = await agent.get("/api/calendar/google/start").expect(302);
    const provider = await fetch(new URL(start.headers.location), { redirect: "manual" });
    const back = new URL(provider.headers.get("location")!);
    await agent.get(`${back.pathname}${back.search}`).expect(302);

    setEvents([
      {
        id: "kept",
        summary: "Pour sequence review",
        start: { dateTime: "2026-09-24T14:00:00Z" },
        end: { dateTime: "2026-09-24T15:00:00Z" }
      },
      {
        id: "gone",
        status: "cancelled",
        summary: "Old walkthrough",
        start: { dateTime: "2026-09-24T16:00:00Z" },
        end: { dateTime: "2026-09-24T17:00:00Z" }
      }
    ]);
    // the month the panel shows, not the next two days
    const month = await agent.get("/api/calendar/events?from=2026-08-31T04:00:00.000Z&to=2026-10-12T04:00:00.000Z").expect(200);
    expect(lastWindow()).toEqual({ timeMin: "2026-08-31T04:00:00.000Z", timeMax: "2026-10-12T04:00:00.000Z", maxResults: "250" });
    expect(month.body.events.map((event: { title: string }) => event.title)).toEqual(["Pour sequence review"]);
    expect(month.body).toMatchObject({ from: "2026-08-31T04:00:00.000Z", to: "2026-10-12T04:00:00.000Z" });

    // backwards, unreadable, or wider than two months is refused before any provider is asked
    await agent.get("/api/calendar/events?from=2026-10-12T00:00:00Z&to=2026-08-31T00:00:00Z").expect(400, { error: "invalid_range" });
    await agent.get("/api/calendar/events?from=soon&to=later").expect(400, { error: "invalid_range" });
    await agent.get("/api/calendar/events?from=2026-01-01T00:00:00Z&to=2026-06-01T00:00:00Z").expect(400, { error: "range_too_wide" });
  });

  it("refreshes an expired access token instead of failing the fetch", async () => {
    configure();
    const { agent } = await signedIn();
    const start = await agent.get("/api/calendar/google/start").expect(302);
    const provider = await fetch(new URL(start.headers.location), { redirect: "manual" });
    const back = new URL(provider.headers.get("location")!);
    await agent.get(`${back.pathname}${back.search}`).expect(302);

    const before = refreshes();
    setEvents([]);
    await agent.get("/api/calendar/events").expect(200);
    expect(refreshes(), "a token good for an hour should not be refreshed").toBe(before);

    // A token good for an hour is reused, which is the half worth asserting from outside.
    // The refresh path itself is proven by the stand-in provider rejecting any refresh_token
    // but "refresh-1": if the stored one were wrong, the fetch below would 401 and `failed`
    // would name google.
    setEvents([]);
    const again = await agent.get("/api/calendar/events").expect(200);
    expect(again.body.failed).toEqual([]);
  });

  it("forgets a connection on request", async () => {
    configure();
    const { agent } = await signedIn();
    const start = await agent.get("/api/calendar/google/start").expect(302);
    const provider = await fetch(new URL(start.headers.location), { redirect: "manual" });
    const back = new URL(provider.headers.get("location")!);
    await agent.get(`${back.pathname}${back.search}`).expect(302);
    expect((await agent.get("/api/calendar/status")).body.providers.google.connected).toBe(true);

    await agent.delete("/api/calendar/google").expect(200);
    const after = await agent.get("/api/calendar/status").expect(200);
    expect(after.body.providers.google).toEqual({ configured: true, connected: false, email: "" });
    expect((await agent.get("/api/calendar/events")).body.events).toEqual([]);
  });

  it("rejects a callback whose state does not match the cookie", async () => {
    configure();
    const { agent } = await signedIn();
    await agent.get("/api/calendar/google/start").expect(302);
    const forged = await agent.get("/api/calendar/google/callback?code=cal-code&state=not-the-one").expect(302);
    expect(forged.headers.location).toContain("reason=state_mismatch");
    expect((await agent.get("/api/calendar/status")).body.providers.google.connected).toBe(false);
  });

  /**
   * SIGNING IN IN A WINDOW (2026-09-23): the panel opens the consent page in a small window over the
   * Dashboard, so the callback answers that window — a page that tells the panel and closes itself —
   * instead of sending the whole tab back to the app.
   */
  it("answers the sign-in window with a page that tells only the app, and closes itself", async () => {
    configure();
    const { agent } = await signedIn();

    const start = await agent.get("/api/calendar/google/start?mode=popup&returnTo=http%3A%2F%2Flocalhost%3A5432").expect(302);
    const consent = new URL(start.headers.location);
    // the state carries the way back, so even a callback that has lost its cookie answers a window
    expect(consent.searchParams.get("state")).toMatch(/^p\./);

    const provider = await fetch(consent, { redirect: "manual" });
    const back = new URL(provider.headers.get("location")!);
    const page = await agent.get(`${back.pathname}${back.search}`).expect(200);
    expect(page.headers["content-type"]).toContain("text/html");
    expect(page.text).toContain("Google Calendar is connected");
    // it tells the window that opened it, and only if that window is the app
    expect(page.text).toContain('"calendar":"connected"');
    expect(page.text).toContain("opener.postMessage(message, target)");
    expect(page.text).toContain('var target = "http://localhost:5432"');
    expect(page.text).toContain("window.close()");
    // …but only as a window: loaded as a tab it stays, with a way back that carries the result
    expect(page.text).toContain("if (!opener || opener.closed || !target) return;");
    expect(page.text).toContain('href="http://localhost:5432/?calendar=connected&amp;provider=google#dashboard"');
    // what happened, and nothing more: no token is ever in the page
    expect(page.text).not.toContain("refresh-1");
    expect(page.text).not.toContain("access-");

    const status = await agent.get("/api/calendar/status").expect(200);
    expect(status.body.providers.google).toEqual({ configured: true, connected: true, email: "dana@asphaltco.com" });
  });

  it("says in the window when a provider is not set up, or the sign-in cannot be matched", async () => {
    const { agent } = await signedIn();
    const off = await agent.get("/api/calendar/google/start?mode=popup").expect(200);
    expect(off.text).toContain("Google Calendar could not be connected");
    expect(off.text).toContain("It is not switched on for this BuildFlow yet.");
    expect(off.text).toContain('"reason":"not_configured"');

    // no cookie at all: the state's own mark still says the answer goes to a window…
    const lost = await agent.get("/api/calendar/google/callback?code=cal-code&state=p.lost").expect(200);
    expect(lost.text).toContain('"reason":"state_mismatch"');
    // …and a tab's sign-in still goes back to the app the way it always has
    const tab = await agent.get("/api/calendar/google/callback?code=cal-code&state=r.lost").expect(302);
    expect(tab.headers.location).toContain("reason=state_mismatch");
  });

  it("never lets a reason out of the page's script or text", () => {
    const page = calendarPopupPage(
      { calendar: "error", provider: "google", reason: '</script><script>alert("x")</script><img src=x onerror=alert(1)>' },
      "http://localhost:5432"
    );
    expect(page).not.toContain('<script>alert("x")');
    expect(page).not.toContain("<img src=x");
    expect(page).toContain("\\u003c/script>");
    // an unknown reason reads as a plain sentence, not as the code
    expect(page).toContain("The provider did not finish the sign-in.");
  });
});

describe("reading an Outlook calendar", () => {
  it("puts the organizer back at the head of the guests, reads every answer, yours included, and drops what was cancelled", () => {
    const events = readGraphEvents({
      value: [
        {
          id: "m-1",
          subject: "Owner walkthrough",
          start: { dateTime: "2026-09-24T14:00:00.0000000" },
          end: { dateTime: "2026-09-24T15:00:00.0000000" },
          location: { displayName: "Site trailer" },
          onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/abc" },
          onlineMeetingProvider: "teamsForBusiness",
          organizer: { emailAddress: { name: "Priya Patel", address: "priya@owner.com" } },
          attendees: [
            { emailAddress: { name: "Dana Brooks", address: "dana@asphaltco.com" }, status: { response: "tentativelyAccepted" } },
            { emailAddress: { name: "Carlos Ramirez", address: "carlos@harborview.com" }, status: { response: "declined" } },
            { emailAddress: { name: "Mia Chen", address: "mia@asphaltco.com" }, status: { response: "notResponded" } }
          ],
          responseStatus: { response: "tentativelyAccepted" },
          bodyPreview: "Agenda: punch list, then the retaining wall.",
          webLink: "https://outlook.office365.com/owa/?itemid=m-1"
        },
        {
          id: "m-2",
          subject: "Cancelled sync",
          isCancelled: true,
          start: { dateTime: "2026-09-24T16:00:00Z" },
          end: { dateTime: "2026-09-24T16:30:00Z" }
        },
        {
          id: "m-3",
          subject: "Focus block",
          isOrganizer: true,
          start: { dateTime: "2026-09-25T13:00:00Z" },
          end: { dateTime: "2026-09-25T14:00:00Z" }
        }
      ]
    });
    expect(events.map((event) => event.title)).toEqual(["Owner walkthrough", "Focus block"]);
    expect(events[0]).toMatchObject({
      provider: "microsoft",
      // Graph's naive time is read as the UTC it was asked for
      startsAt: "2026-09-24T14:00:00.0000000Z",
      location: "Site trailer",
      conference: "Microsoft Teams",
      organizer: "Priya Patel",
      myResponse: "tentative",
      description: "Agenda: punch list, then the retaining wall.",
      webUrl: "https://outlook.office365.com/owa/?itemid=m-1"
    });
    expect(events[0].guests).toEqual([
      { name: "Priya Patel", email: "priya@owner.com", response: "accepted", organizer: true },
      { name: "Dana Brooks", email: "dana@asphaltco.com", response: "tentative", organizer: false },
      { name: "Carlos Ramirez", email: "carlos@harborview.com", response: "declined", organizer: false },
      { name: "Mia Chen", email: "mia@asphaltco.com", response: "pending", organizer: false }
    ]);
    expect(events[1]).toMatchObject({ myResponse: "organizer", guests: [], conference: "", joinUrl: "" });
  });

  it("names a meeting's service from its link when the invite does not, and reads notes as text", () => {
    expect(conferenceName("https://meet.google.com/abc-defg-hij")).toBe("Google Meet");
    expect(conferenceName("https://acme.zoom.us/j/123")).toBe("Zoom");
    expect(conferenceName("https://acme.webex.com/meet/pm")).toBe("Webex");
    expect(conferenceName("https://example.com/room")).toBe("Online meeting");
    expect(conferenceName("")).toBe("");
    expect(plainNotes("<div>Line one<br>Line&nbsp;two</div><ul><li>a &lt; b</li></ul>")).toBe("Line one\nLine two\na < b");
    expect(plainNotes("x".repeat(700))).toHaveLength(600);
  });
});
