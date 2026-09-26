/**
 * What a test needs to be BuildFlow for Mac: a real workspace with its owner signed in, teammates
 * joined through real invites, and a Mac connected through the real PKCE hand-off (the same steps
 * desktop.test.ts proves one by one). Every app gets its own temp data directory.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { expect } from "vitest";
import { createApp } from "../../src/app.js";
import type { StoreManager } from "../../src/stores.js";

export type App = Awaited<ReturnType<typeof createApp>>;
export type Agent = ReturnType<typeof request.agent>;

/** Every temp directory a test made, for the file's afterAll to take away. */
const made: string[] = [];
export function removeTempDirs() {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
}

export async function freshApp(): Promise<App> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-mac-"));
  made.push(dir);
  return createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
}

export const managerOf = (app: App) => app.locals.storeManager as StoreManager;

/** A real, non-demo workspace with its owner signed in and the Asphalt starter seeded. */
export async function workspace(app: App, who = { email: "dana@asphaltco.com", name: "Dana Brooks", orgName: "Asphalt Co" }) {
  const owner = request.agent(app);
  await owner
    .post("/api/auth/signup")
    .send({ ...who, password: "Roller-Tack-2026", acceptTerms: true })
    .expect(201);
  await owner
    .post("/api/business-profile")
    .send({ businessType: "Asphalt", selectedPlan: "free", selectedProducts: [], seats: 3 })
    .expect(200);
  const me = (await owner.get("/api/auth/me").expect(200)).body as { account: { id: string }; org: { id: string } };
  return { owner, accountId: me.account.id, orgId: me.org.id };
}

/** A teammate joining through a real invite, at a level. */
export async function teammate(app: App, owner: Agent, orgId: string, email: string, level: "member" | "admin" = "member") {
  await owner
    .post("/api/team/invites")
    .send({ invites: [{ email, permission: level }] })
    .expect(201);
  const main = managerOf(app).main;
  const row = main
    .all<{ id: string; email: string }>("SELECT id, email FROM invites WHERE acceptedAt IS NULL")
    .find((r) => r.email === email)!;
  const fresh = main.refreshInvite(row.id, orgId, 60_000)!;
  const agent = request.agent(app);
  const joined = await agent
    .post("/api/auth/invite/accept")
    .send({ token: fresh.token, name: email.split("@")[0], password: "Paver-Screed-2026", acceptTerms: true })
    .expect(201);
  return { agent, accountId: joined.body.account.id as string };
}

/** Connect a Mac for whoever `agent` is signed in as, the way the app does. Answers the key and the device. */
export async function connectMac(app: App, agent: Agent) {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("base64url");
  const page = await agent
    .get(
      `/desktop/connect?${new URLSearchParams({
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
        redirect_uri: "buildflow://connect",
        device_name: "Test MacBook"
      })}`
    )
    .expect(200);
  const approval = /name="approval" value="([^"]+)"/.exec(page.text)?.[1];
  expect(approval, "the Connect page offers the button").toBeTruthy();
  const posted = await agent
    .post("/desktop/connect")
    .set("Sec-Fetch-Site", "same-origin")
    .type("form")
    .send({ approval, decision: "allow" })
    .expect(303);
  const code = new URL(String(posted.headers.location)).searchParams.get("code")!;
  const token = await request(app).post("/api/desktop/token").send({ code, code_verifier: verifier }).expect(201);
  return { key: token.body.key as string, deviceId: token.body.device.id as string };
}

/** Requests as the Mac: the key, and nothing else. */
export const asMac = (app: App, key: string) => ({
  get: (url: string) => request(app).get(url).set("Authorization", `Bearer ${key}`),
  post: (url: string) => request(app).post(url).set("Authorization", `Bearer ${key}`)
});

/* ── a real socket, for the event stream ──────────────────────────────────── */

const servers: http.Server[] = [];
export function closeServers() {
  for (const server of servers.splice(0)) {
    server.closeAllConnections?.();
    server.close();
  }
}

/** The app on a real port on 127.0.0.1: supertest cannot hold a stream open and read it as it arrives. */
export async function listen(app: App): Promise<string> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

export type EventStream = {
  /** Every frame so far, whole: "event: inbox\ndata: {…}", ": ping". */
  frames: () => string[];
  /** The frames of one event. */
  events: (name: string) => string[];
  /** Whether the server has ended the stream. */
  ended: () => boolean;
  close: () => void;
};

/** Opens /api/desktop/events with a device key. Rejects with the status when the server will not stream. */
export function openEvents(base: string, key: string | null, headers: Record<string, string> = {}): Promise<EventStream> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      `${base}/api/desktop/events`,
      { headers: { accept: "text/event-stream", ...(key ? { authorization: `Bearer ${key}` } : {}), ...headers } },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`stream answered ${res.statusCode}`));
          res.resume();
          return;
        }
        const frames: string[] = [];
        let ended = false;
        let buffer = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          buffer += chunk;
          let cut = buffer.indexOf("\n\n");
          while (cut >= 0) {
            frames.push(buffer.slice(0, cut));
            buffer = buffer.slice(cut + 2);
            cut = buffer.indexOf("\n\n");
          }
        });
        res.on("end", () => {
          ended = true;
        });
        res.on("close", () => {
          ended = true;
        });
        resolve({
          frames: () => frames,
          events: (name) => frames.filter((frame) => frame.startsWith(`event: ${name}\n`)),
          ended: () => ended,
          close: () => req.destroy()
        });
      }
    );
    req.on("error", reject);
  });
}

/** Waits for a condition, polling; answers whether it came true in time. */
export async function until(check: () => boolean, ms = 3000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end && !check()) await new Promise((r) => setTimeout(r, 15));
  return check();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
