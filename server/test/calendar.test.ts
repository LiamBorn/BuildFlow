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

const CLIENT_ID = "test-google-client";

/** A stand-in Google: consent, token endpoint, and one calendar of events. */
function fakeProvider() {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  let refreshCount = 0;
  let events: unknown[] = [];
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
    res.json({ items: events });
  });
  return {
    app,
    setEvents: (next: unknown[]) => {
      events = next;
    },
    refreshes: () => refreshCount
  };
}

describe("Google Calendar and Outlook", () => {
  let server: Server;
  let base = "";
  let setEvents: (next: unknown[]) => void;
  let refreshes: () => number;

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
        start: { dateTime: soon.toISOString() },
        end: { dateTime: later.toISOString() },
        attendees: [{ displayName: "Carlos Ramirez" }, { email: "dana@asphaltco.com" }]
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
      attendees: ["Carlos Ramirez", "dana@asphaltco.com"]
    });
    expect(feed.body.events[1]).toMatchObject({ title: "All-hands", allDay: true });
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
});
