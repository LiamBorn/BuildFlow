/**
 * BUILDFLOW_SECRET, and saying so at startup.
 *
 * The OAuth and calendar "Connect" flows both hand the browser a signed cookie and read it back when
 * the provider redirects in. Unset, the signing key is `crypto.randomBytes(32)` generated when the
 * process starts — which is correct for what it was written for, one process and one redirect round
 * trip, and wrong as soon as the callback can arrive somewhere else. A restart or redeploy between
 * the click and the callback invalidates the cookie; more than one instance breaks the flow on every
 * attempt, because one instance signs and another verifies.
 *
 * .replit deploys to a single Reserved VM (`deploymentTarget = "gce"`), so today only the restart
 * case is live. The reason this is worth a warning rather than a shrug is that the variable appeared
 * in exactly one place before this — a comment inside oauth.ts — so a deployer following
 * docs/replit.md had no way to know it existed, and the failure gives them nothing to go on: a
 * sign-in that is refused, with the provider looking like the culprit.
 *
 * The cases about staying SILENT are the point of the design. A startup that warns about things
 * which do not apply to it teaches people to scroll past the ones that do.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stateSecretWarning } from "../src/oauth.js";
import { createApp } from "../src/app.js";

const PRODUCTION = { NODE_ENV: "production" };

describe("the warning itself", () => {
  it("says nothing when the secret is set — the normal, correct deployment", () => {
    expect(stateSecretWarning(true, { ...PRODUCTION, BUILDFLOW_SECRET: "a-long-random-string" })).toBeNull();
  });

  it("says nothing on a developer's machine, where one process is the whole story", () => {
    expect(stateSecretWarning(true, { NODE_ENV: "development" })).toBeNull();
    expect(stateSecretWarning(true, {})).toBeNull();
  });

  it("says nothing when no provider is configured, because then no state cookie is ever signed", () => {
    expect(stateSecretWarning(false, PRODUCTION)).toBeNull();
  });

  it("warns in production once a provider is configured", () => {
    expect(stateSecretWarning(true, PRODUCTION)).toBeTruthy();
  });

  it("does not count a blank value as a secret", () => {
    // An empty Replit Secret is present-but-useless, and `?? ` in oauth.ts would not catch "" either
    // — env() trims it to undefined. The warning has to agree with that.
    expect(stateSecretWarning(true, { ...PRODUCTION, BUILDFLOW_SECRET: "   " })).toBeTruthy();
  });

  it("names the variable and what to do, which is the whole value of printing it", () => {
    const message = stateSecretWarning(true, PRODUCTION)!;
    expect(message).toContain("BUILDFLOW_SECRET");
    expect(message, "a warning that does not say what breaks gets ignored").toMatch(/sign-in|Connect/i);
    expect(message, "and it has to say what to do about it").toMatch(/set BUILDFLOW_SECRET/i);
  });
});

describe("the server at startup", () => {
  /* The function above could be perfect and never called. This is the case that would notice. */
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
  });

  const bootIn = async (vars: Record<string, string>) => {
    Object.assign(process.env, vars);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-secret-"));
    await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    return warn.mock.calls.map((call) => String(call[0])).join("\n");
  };

  it("prints it when a published deployment has a provider but no secret", async () => {
    delete process.env.BUILDFLOW_SECRET;
    const said = await bootIn({
      NODE_ENV: "production",
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: "test-client-secret"
    });
    expect(said).toContain("BUILDFLOW_SECRET");
  });

  it("stays quiet when the secret is set", async () => {
    const said = await bootIn({
      NODE_ENV: "production",
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      BUILDFLOW_SECRET: "a-long-random-string"
    });
    expect(said).not.toContain("BUILDFLOW_SECRET");
  });
});
