/**
 * A stranger cannot choose the address in a password-reset email.
 *
 * `POST /api/auth/reset/request` takes an email address, answers 200 whatever happens (deliberately,
 * so nobody can enumerate accounts), and emails a reset link. The origin of that link came from
 * `req.headers.origin` whenever it parsed as a URL — and Origin is just a header:
 *
 *   curl -X POST <site>/api/auth/reset/request -H 'Origin: https://evil.example' -d '{"email":"…"}'
 *
 * The person whose address that is then receives a real BuildFlow email — real sender, real wording,
 * a real token — whose link points at evil.example. The token is in the fragment, so evil.example's
 * server never sees it, but its page reads `location.hash` in one line. One click is an account.
 *
 * Verification and invite links were built the same way, so all three are checked here.
 *
 * The fix is the app's own address winning over the header once the deployment has stated it, with
 * `safeReturnTo` doing the comparison — the same check the OAuth return already goes through. What
 * makes that worth testing rather than reading is the fallback: with BUILDFLOW_CLIENT_URL unset the
 * header is still used, because a developer's client runs on a different port and the alternative is
 * emailing everyone a localhost link. That case is real, it is the shape of the bug, and the only
 * thing standing in front of it is a startup warning — so it gets a case of its own that says so.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sent } = vi.hoisted(() => ({ sent: [] as { to?: string; html?: string; text?: string }[] }));

vi.mock("../src/email.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/email.js")>();
  return {
    ...actual,
    sendMail: vi.fn(async (message: { to?: string; html?: string; text?: string }) => {
      sent.push(message);
      return undefined;
    })
  };
});

const { createApp, emailLinkOrigin, emailLinkWarning } = await import("../src/app.js");

const SITE = "https://buildflow.example";
const HOSTILE = "https://evil.example";
const saved = { ...process.env };

beforeEach(() => {
  sent.length = 0;
  process.env.BUILDFLOW_CLIENT_URL = SITE;
});
afterEach(() => {
  process.env = { ...saved };
});

const freshApp = () =>
  createApp({ dataFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-links-")), "test.sqlite"), reset: true });

/** Every link in everything sent so far. */
const links = () =>
  sent
    .flatMap((m) => [m.html ?? "", m.text ?? ""])
    .join(" ")
    .match(/https?:\/\/[^\s"'<>)]+/g) ?? [];

describe("the rule", () => {
  const allowed = [SITE, SITE];

  it("ignores a hostile Origin once the app's address is configured", () => {
    expect(emailLinkOrigin({ originHeader: HOSTILE, configuredClientUrl: SITE, fallback: SITE, allowed })).toBe(SITE);
  });

  it("still accepts the app's own origin, so a normal request is unaffected", () => {
    expect(emailLinkOrigin({ originHeader: SITE, configuredClientUrl: SITE, fallback: SITE, allowed })).toBe(SITE);
  });

  it("uses the configured address when there is no Origin at all", () => {
    expect(emailLinkOrigin({ originHeader: undefined, configuredClientUrl: SITE, fallback: SITE, allowed })).toBe(SITE);
  });

  it("falls back to the caller's origin only while the address is unconfigured", () => {
    // A developer's client is on another port, so this has to keep working — and it is exactly the
    // state emailLinkWarning shouts about.
    expect(
      emailLinkOrigin({ originHeader: "http://localhost:5175", configuredClientUrl: undefined, fallback: "http://x", allowed: [] })
    ).toBe("http://localhost:5175");
    expect(emailLinkWarning({ NODE_ENV: "production" })).toBeTruthy();
    expect(emailLinkWarning({ NODE_ENV: "production", BUILDFLOW_CLIENT_URL: SITE })).toBeNull();
    expect(emailLinkWarning({ NODE_ENV: "development" }), "a developer is not warned").toBeNull();
  });

  it("treats a blank configured value as unconfigured", () => {
    expect(emailLinkOrigin({ originHeader: HOSTILE, configuredClientUrl: "  ", fallback: SITE, allowed })).toBe(HOSTILE);
  });
});

describe("the reset email a stranger tried to redirect", () => {
  it("points at the app, not at the address the caller asked for", async () => {
    const app = await freshApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send({
      name: "Real Owner",
      email: "owner@example.com",
      password: "Str0ng!Passphrase42",
      orgName: "Real Co.",
      acceptTerms: true
    });
    sent.length = 0;

    const asked = await request(app).post("/api/auth/reset/request").set("Origin", HOSTILE).send({ email: "owner@example.com" });
    expect(asked.status, "it answers 200 either way, so the answer proves nothing by itself").toBe(200);

    expect(sent.length, "a reset email should still have been sent").toBeGreaterThan(0);
    expect(links().length).toBeGreaterThan(0);
    for (const link of links()) expect(link, "no emailed link may point at the caller's chosen host").not.toContain("evil.example");
    expect(
      links().some((l) => l.includes("reset-password?token=")),
      "and the real link is still there"
    ).toBe(true);
    expect(links().find((l) => l.includes("reset-password?token="))!).toContain(SITE);
  });

  it("does the same for a verification link, which carries a token too", async () => {
    const app = await freshApp();
    await request(app).post("/api/auth/signup").set("Origin", HOSTILE).send({
      name: "New Owner",
      email: "new@example.com",
      password: "Str0ng!Passphrase42",
      orgName: "New Co.",
      acceptTerms: true
    });
    expect(links().length).toBeGreaterThan(0);
    for (const link of links()) expect(link).not.toContain("evil.example");
  });
});
