/**
 * BuildFlow for Mac, step 6: asking out loud, and changes that wait for Accept.
 *
 * The rules under test:
 * - An answer streams as Server-Sent Events, text first and `done` last, in the order Claude wrote it.
 * - A change Claude proposes is checked on the server before anyone sees it, and NOTHING is written
 *   until Accept. Accept makes the website's own write, with its version check and its permission; it
 *   works once, for ten minutes, from the Mac and the login that asked, in the workspace that asked.
 * - Without Claude (no key, a key that fails, no credit) the Mac still answers what the person's own
 *   inbox covers, and says the AI isn't connected for the rest.
 * - Voice spends the website assistant's forty questions an hour, not forty of its own.
 * - The Mac hanging up stops the request upstream.
 *
 * Claude is never called: the Anthropic SDK is replaced below by a scripted stand-in, and the base URL
 * points at a closed local port in case anything ever reached the real one. No key here is real.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { NOT_CONNECTED_CHANGE, NOT_CONNECTED_OTHER } from "../src/desktopVoice.js";
import { CALENDAR_WAIT_MS, PROPOSAL_TTL_MS, meetingWindow } from "../src/desktopAsk.js";
import { calendarEventCache, type CalendarEvent } from "../src/calendar.js";
import type { StoreManager } from "../src/stores.js";

/* ── the SDK, scripted ─────────────────────────────────────────────────────── */

const fake = vi.hoisted(() => {
  class APIError extends Error {
    status: number | undefined;
    type: string | null;
    constructor(status: number | undefined, message: string, type: string | null = null) {
      super(message);
      this.status = status;
      this.type = type;
    }
  }
  class APIUserAbortError extends APIError {
    constructor() {
      super(undefined, "Request was aborted.");
    }
  }
  class BadRequestError extends APIError {}
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}
  class NotFoundError extends APIError {}
  class InternalServerError extends APIError {}

  /** One request's answer: text deltas, the final content and stop reason, a failure, or a wait for the caller to hang up. */
  type Round = { deltas?: string[]; content?: unknown[]; stopReason?: string; error?: Error; hang?: boolean };
  /* What the server sent, as JSON: read field by field in the cases, so it is left loose on purpose. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Loose = any;
  type Sent = { params: Record<string, Loose>; options: Record<string, Loose> };
  const state = { rounds: [] as Round[], requests: [] as Sent[], aborted: 0, constructed: 0 };

  const stream = (params: Record<string, unknown>, options: Record<string, unknown> = {}) => {
    state.requests.push({ params: JSON.parse(JSON.stringify(params)), options });
    const round = state.rounds.shift() ?? { deltas: ["(nothing scripted)"] };
    const signal = options.signal as AbortSignal | undefined;
    const events = (async function* () {
      if (round.error) throw round.error;
      for (const text of round.deltas ?? []) {
        if (signal?.aborted) throw new APIUserAbortError();
        yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } };
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      if (round.hang) {
        await new Promise((_resolve, reject) => {
          const stop = () => {
            state.aborted += 1;
            reject(new APIUserAbortError());
          };
          if (signal?.aborted) stop();
          else signal?.addEventListener("abort", stop, { once: true });
        });
      }
    })();
    const said = (round.deltas ?? []).join("");
    return {
      [Symbol.asyncIterator]: () => events,
      finalMessage: async () => ({
        id: "msg_scripted",
        type: "message",
        role: "assistant",
        model: params.model,
        content: round.content ?? (said ? [{ type: "text", text: said }] : []),
        stop_reason: round.stopReason ?? "end_turn",
        stop_details: null,
        usage: {}
      })
    };
  };

  class Anthropic {
    static APIError = APIError;
    static APIUserAbortError = APIUserAbortError;
    static BadRequestError = BadRequestError;
    static AuthenticationError = AuthenticationError;
    static PermissionDeniedError = PermissionDeniedError;
    static NotFoundError = NotFoundError;
    static InternalServerError = InternalServerError;
    beta = { messages: { stream } };
    messages = { stream };
    constructor() {
      state.constructed += 1;
    }
  }
  return { state, Anthropic, APIError, BadRequestError, AuthenticationError, InternalServerError };
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: fake.Anthropic,
  APIError: fake.APIError,
  BadRequestError: fake.BadRequestError,
  AuthenticationError: fake.AuthenticationError,
  InternalServerError: fake.InternalServerError
}));

/** Claude says something and proposes one change. */
const proposes = (input: { job_id: string; field: string; value: string }, words = "I've set that up; it's waiting for your Accept.") => ({
  deltas: [words],
  content: [
    { type: "text", text: words },
    { type: "tool_use", id: `toolu_${crypto.randomBytes(4).toString("hex")}`, name: "propose_schedule_change", input }
  ],
  stopReason: "tool_use"
});

/* ── the environment ───────────────────────────────────────────────────────── */

const KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "AI_INTEGRATIONS_ANTHROPIC_API_KEY",
  "AI_INTEGRATIONS_ANTHROPIC_BASE_URL",
  "ANTHROPIC_BASE_URL"
];
const saved: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const key of KEYS) saved[key] = process.env[key];
});
afterAll(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});
beforeEach(() => {
  for (const key of KEYS) delete process.env[key];
  // Belt and braces: were the stand-in ever bypassed, a request would go nowhere.
  process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:9";
  fake.state.rounds = [];
  fake.state.requests = [];
  fake.state.aborted = 0;
});
afterEach(() => {
  vi.useRealTimers();
});
/** Live mode: a credential is configured. Not a real one. */
const live = () => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-a-real-key";
};

/* ── a workspace, a Mac ────────────────────────────────────────────────────── */

type App = Awaited<ReturnType<typeof createApp>>;
type Agent = ReturnType<typeof request.agent>;

const tempDir = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const freshApp = () => createApp({ dataFile: path.join(tempDir("buildflow-voice-"), "test.sqlite"), reset: true });
const managerOf = (app: App) => app.locals.storeManager as StoreManager;

async function workspace(app: App, email = "dana@asphaltco.com", orgName = "Asphalt Co", businessType = "Asphalt") {
  const owner = request.agent(app);
  await owner
    .post("/api/auth/signup")
    .send({ email, password: "Roller-Tack-2026", name: "Dana Brooks", orgName, acceptTerms: true })
    .expect(201);
  await owner.post("/api/business-profile").send({ businessType, selectedPlan: "free", selectedProducts: [], seats: 3 }).expect(200);
  const me = (await owner.get("/api/auth/me").expect(200)).body as { account: { id: string }; org: { id: string } };
  return { owner, accountId: me.account.id, orgId: me.org.id };
}

async function teammate(app: App, owner: Agent, orgId: string, permission: "admin" | "member", email = "sam@asphaltco.com") {
  await owner
    .post("/api/team/invites")
    .send({ invites: [{ email, permission }] })
    .expect(201);
  const main = managerOf(app).main;
  const row = main
    .all<{ id: string; email: string }>("SELECT id, email FROM invites WHERE acceptedAt IS NULL")
    .find((r) => r.email === email)!;
  const fresh = main.refreshInvite(row.id, orgId, 60_000)!;
  const agent = request.agent(app);
  const joined = await agent
    .post("/api/auth/invite/accept")
    .send({ token: fresh.token, name: "Sam Rivera", password: "Paver-Screed-2026", acceptTerms: true })
    .expect(201);
  return { agent, accountId: joined.body.account.id as string };
}

async function connectMac(app: App, agent: Agent) {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("base64url");
  const query = new URLSearchParams({
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    redirect_uri: "buildflow://connect",
    device_name: "Dana's MacBook Air"
  });
  const page = await agent.get(`/desktop/connect?${query}`).expect(200);
  const approval = /name="approval" value="([^"]+)"/.exec(page.text)![1];
  const posted = await agent
    .post("/desktop/connect")
    .set("Sec-Fetch-Site", "same-origin")
    .type("form")
    .send({ approval, decision: "allow" })
    .expect(303);
  const code = new URL(String(posted.headers.location)).searchParams.get("code")!;
  const token = await request(app).post("/api/desktop/token").send({ code, code_verifier: verifier }).expect(201);
  return token.body.key as string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- an event's JSON, read field by field
type Sse = { event: string; data: any };
const parseSse = (text: string): Sse[] =>
  text
    .split("\n\n")
    .filter((block) => block.trim())
    .map((block) => ({ event: /^event: (.+)$/m.exec(block)?.[1] ?? "", data: JSON.parse(/^data: (.+)$/m.exec(block)?.[1] ?? "null") }));

/** POST /api/desktop/ask as the Mac, read to the end. */
async function ask(app: App, key: string, body: Record<string, unknown>) {
  const res = await request(app)
    .post("/api/desktop/ask")
    .set("Authorization", `Bearer ${key}`)
    .send(body)
    .buffer(true)
    .parse((response, done) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => (text += chunk));
      response.on("end", () => done(null, text));
    });
  return { res, events: parseSse(String(res.body)) };
}

const accept = (app: App, key: string, id: string) =>
  request(app).post(`/api/desktop/proposals/${id}/accept`).set("Authorization", `Bearer ${key}`);
const reject = (app: App, key: string, id: string) =>
  request(app).post(`/api/desktop/proposals/${id}/reject`).set("Authorization", `Bearer ${key}`);

type Row = {
  id: string;
  name: string;
  phase: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  version: number;
  notes: string;
};
type Booking = { id: string; jobId: string; crewId: string; date: string; version: number };
const read = async (agent: Agent) =>
  (await agent.get("/api/bootstrap").expect(200)).body as {
    jobs: Row[];
    assignments: Booking[];
    crews: Array<{ id: string; name: string }>;
    projects: Array<{ name: string }>;
  };

/** A job booked on exactly one crew, once. */
async function bookedJob(agent: Agent) {
  const data = await read(agent);
  const job = data.jobs.find((one) => data.assignments.filter((booking) => booking.jobId === one.id).length === 1)!;
  const booking = data.assignments.find((one) => one.jobId === job.id)!;
  return { data, job, booking };
}

/** Everything a proposal must not have touched: the job and its bookings as they stand. */
const snapshot = async (agent: Agent, jobId: string) => {
  const data = await read(agent);
  return JSON.stringify([data.jobs.find((job) => job.id === jobId), data.assignments.filter((booking) => booking.jobId === jobId)]);
};

/* ── the answer ────────────────────────────────────────────────────────────── */

describe("asking out loud", () => {
  it("streams Claude's answer as text events in the order written, and ends with done", async () => {
    live();
    const app = await freshApp();
    const { owner } = await workspace(app);
    const key = await connectMac(app, owner);
    fake.state.rounds = [{ deltas: ["Mainline Milling ", "starts at 7 AM ", "with Milling Crew 1."] }];

    const { res, events } = await ask(app, key, { text: "When does milling start?", tz: "America/Chicago" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/event-stream/);
    expect(res.headers["cache-control"]).toContain("no-cache");
    expect(events).toEqual([
      { event: "text", data: { delta: "Mainline Milling " } },
      { event: "text", data: { delta: "starts at 7 AM " } },
      { event: "text", data: { delta: "with Milling Crew 1." } },
      { event: "done", data: { mode: "live" } }
    ]);
  });

  it("asks the website's model, streamed, at low effort, with the refusal fallback and one strict tool", async () => {
    live();
    const app = await freshApp();
    const { owner } = await workspace(app);
    const key = await connectMac(app, owner);
    fake.state.rounds = [{ deltas: ["Fine."] }];

    await ask(app, key, { text: "Anything I should know?", tz: "America/Chicago" });

    expect(fake.state.requests).toHaveLength(1);
    const { params, options } = fake.state.requests[0];
    expect(params.model).toBe("claude-opus-5");
    expect(params.thinking).toEqual({ type: "adaptive" });
    expect(params.output_config).toEqual({ effort: "low" });
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.fallbacks).toBe("default");
    expect(params.tools).toHaveLength(1);
    expect(params.tools[0]).toMatchObject({ name: "propose_schedule_change", strict: true, input_schema: { additionalProperties: false } });
    expect(params.tools[0].input_schema.properties.field.enum).toEqual(["start", "end", "date", "crew"]);
    expect(params.system[0].text).toMatch(/no markdown, no lists/);
    expect(options.signal, "the request can be called off").toBeInstanceOf(AbortSignal);
  });

  it("tells Claude the workspace and the person's day, and carries the last six turns, starting with the person", async () => {
    live();
    const app = await freshApp();
    const { owner } = await workspace(app);
    const key = await connectMac(app, owner);
    fake.state.rounds = [{ deltas: ["Thursday."] }];
    const history = Array.from({ length: 9 }, (_, index) => ({ role: index % 2 === 0 ? "user" : "assistant", text: `turn ${index}` }));

    await ask(app, key, { text: "and Thursday?", history, tz: "America/Chicago" });

    const messages = fake.state.requests[0].params.messages as Array<{ role: string; content: string }>;
    // The last six are turns 3..8; turn 3 is Claude's, and a conversation starts with the person.
    expect(messages.map((one) => one.content.split("\n")[0])).toEqual([
      "turn 4",
      "turn 5",
      "turn 6",
      "turn 7",
      expect.stringContaining("turn 8")
    ]);
    expect(messages.map((one) => one.role)).toEqual(["user", "assistant", "user", "assistant", "user"]);
    const latest = messages[messages.length - 1].content;
    expect(latest).toContain("WORKSPACE SNAPSHOT");
    expect(latest).toContain("THEIR DAY");
    expect(latest).toMatch(/id job-asphalt-/);
    expect(latest).toMatch(/id crew-asphalt-1: Milling Crew 1/);
    expect(latest).toContain("MEETINGS: their calendar isn't connected");
    expect(latest).toContain("What they asked: and Thursday?");
    expect(latest, "nothing about the account").not.toContain("dana@asphaltco.com");
  });

  it("refuses a question it can't read, in the stream", async () => {
    live();
    const app = await freshApp();
    const { owner } = await workspace(app);
    const key = await connectMac(app, owner);
    const { res, events } = await ask(app, key, { text: "   " });
    expect(res.status).toBe(200);
    expect(events).toEqual([{ event: "error", data: { code: "bad_request", message: "Ask a question." } }]);
    expect(fake.state.requests).toHaveLength(0);
  });

  it("says a refusal plainly, after the fallback has had its chance", async () => {
    live();
    const app = await freshApp();
    const { owner } = await workspace(app);
    const key = await connectMac(app, owner);
    fake.state.rounds = [{ deltas: [], stopReason: "refusal" }];
    const { events } = await ask(app, key, { text: "Something it declines" });
    expect(events).toEqual([{ event: "error", data: { code: "refused", message: "BuildFlow AI can't help with that one." } }]);
  });

  it("answers an outage with ai_unavailable, not with a made-up answer", async () => {
    live();
    const app = await freshApp();
    const { owner } = await workspace(app);
    const key = await connectMac(app, owner);
    fake.state.rounds = [{ error: new fake.InternalServerError(529, "Overloaded", "overloaded_error") }];
    const { events } = await ask(app, key, { text: "What's next?" });
    expect(events).toEqual([{ event: "error", data: { code: "ai_unavailable", message: expect.stringContaining("Try again") } }]);
  });

  it("stops the request upstream when the Mac hangs up", async () => {
    live();
    const app = await freshApp();
    const { owner } = await workspace(app);
    const key = await connectMac(app, owner);
    fake.state.rounds = [{ deltas: ["Let me think about "], hang: true }];

    const server = http.createServer(app).listen(0, "127.0.0.1");
    try {
      await new Promise<void>((resolve) => server.once("listening", () => resolve()));
      const { port } = server.address() as AddressInfo;
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          {
            host: "127.0.0.1",
            port,
            path: "/api/desktop/ask",
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }
          },
          (res) => {
            res.setEncoding("utf8");
            res.on("data", (chunk: string) => {
              // the first words have arrived: now hang up
              if (chunk.includes("event: text")) {
                req.destroy();
                resolve();
              }
            });
          }
        );
        req.on("error", () => undefined);
        req.write(JSON.stringify({ text: "Tell me everything" }));
        req.end();
        setTimeout(() => reject(new Error("no words arrived")), 5000);
      });
      for (let waited = 0; fake.state.aborted === 0 && waited < 3000; waited += 20) await new Promise((resolve) => setTimeout(resolve, 20));
      expect(fake.state.aborted, "the upstream request was called off").toBe(1);
    } finally {
      server.close();
    }
  });
});

/* ── proposals ─────────────────────────────────────────────────────────────── */

describe("a change Claude proposes", () => {
  it("becomes a proposal the Mac is shown, and changes nothing until Accept", async () => {
    live();
    const app = await freshApp();
    const { owner } = await workspace(app);
    const key = await connectMac(app, owner);
    const { job } = await bookedJob(owner);
    const before = await snapshot(owner, job.id);
    fake.state.rounds = [proposes({ job_id: job.id, field: "start", value: "06:00" })];

    const started = Date.now();
    const { events } = await ask(app, key, { text: `Start ${job.name} at 6`, tz: "America/Chicago" });

    expect(events.map((one) => one.event)).toEqual(["text", "proposal", "done"]);
    const proposal = events[1].data;
    expect(proposal).toMatchObject({
      kind: "schedule_change",
      jobId: job.id,
      // what the job is, as the Mac's Jobs tab names it: the seed's jobs are named after their project
      jobName: job.phase || job.name,
      change: { field: "start", from: "7 AM", to: "6 AM", fromValue: "07:00", toValue: "06:00" }
    });
    expect(proposal.id).toMatch(/^bfp_[A-Za-z0-9_-]{24}$/);
    expect(proposal.summary).toBe(`Start ${job.phase} at ${proposal.project} at 6 AM instead of 7 AM.`);
    const expires = new Date(proposal.expiresAt).getTime();
    expect(expires - started).toBeGreaterThanOrEqual(PROPOSAL_TTL_MS - 1000);
    expect(expires - started).toBeLessThanOrEqual(PROPOSAL_TTL_MS + 5000);
    expect(events[2].data).toEqual({ mode: "live" });
    // every change proposed: no second request just to say so
    expect(fake.state.requests).toHaveLength(1);
    expect(await snapshot(owner, job.id), "nothing changed on the proposal").toBe(before);

    const accepted = await accept(app, key, proposal.id).expect(200);
    expect(accepted.body.ok).toBe(true);
    expect(accepted.body.job).toMatchObject({ id: job.id, startTime: "6:00 AM", version: job.version + 1 });
    const after = (await read(owner)).jobs.find((one) => one.id === job.id)!;
    expect(after.startTime, "written the way the job already writes it").toBe("6:00 AM");

    const again = await accept(app, key, proposal.id).expect(404);
    expect(again.body.code).toBe("proposal_gone");
  });

  it("moves the whole job and its bookings together when the day changes, as the website's move does", async () => {
    live();
    const app = await freshApp();
    const { owner } = await workspace(app);
    const key = await connectMac(app, owner);
    const { job, booking } = await bookedJob(owner);
    const target = new Date(Date.parse(`${job.startDate}T12:00:00Z`) + 21 * 86_400_000).toISOString().slice(0, 10);
    fake.state.rounds = [proposes({ job_id: job.id, field: "date", value: target })];

    const { events } = await ask(app, key, { text: "Push it three weeks" });
    const proposal = events.find((one) => one.event === "proposal")!.data;
    expect(proposal.change).toMatchObject({ field: "date", fromValue: job.startDate, toValue: target });
    expect(proposal.summary).toContain("with its booking");

    await accept(app, key, proposal.id).expect(200);
    const after = await read(owner);
    const moved = after.jobs.find((one) => one.id === job.id)!;
    expect(moved.startDate).toBe(target);
    const shift = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) + 21 * 86_400_000).toISOString().slice(0, 10);
    expect(moved.endDate).toBe(shift(job.endDate));
    expect(after.assignments.find((one) => one.id === booking.id)?.date.slice(0, 10)).toBe(shift(booking.date.slice(0, 10)));
  });

  it("moves the job's bookings to another crew", async () => {
    live();
    const app = await freshApp();
    const { owner } = await workspace(app);
    const key = await connectMac(app, owner);
    const { data, job, booking } = await bookedJob(owner);
    const free = data.crews.find(
      (crew) => crew.id !== booking.crewId && !data.assignments.some((one) => one.crewId === crew.id && one.date === booking.date)
    )!;
    fake.state.rounds = [proposes({ job_id: job.id, field: "crew", value: free.id })];

    const { events } = await ask(app, key, { text: `Put ${free.name} on it` });
    const proposal = events.find((one) => one.event === "proposal")!.data;
    expect(proposal.change).toMatchObject({ field: "crew", to: free.name, fromValue: booking.crewId, toValue: free.id });

    await accept(app, key, proposal.id).expect(200);
    expect((await read(owner)).assignments.find((one) => one.id === booking.id)?.crewId).toBe(free.id);
  });

  it("refuses a job that isn't there or a value that isn't one, before any proposal exists", async () => {
    live();
    const app = await freshApp();
    const { owner } = await workspace(app);
    const key = await connectMac(app, owner);
    const { job } = await bookedJob(owner);
    fake.state.rounds = [
      proposes({ job_id: "job-that-is-not-there", field: "start", value: "06:00" }),
      proposes({ job_id: job.id, field: "start", value: "25:99" }),
      { deltas: ["Which job did you mean?"] }
    ];

    const { events } = await ask(app, key, { text: "Start the thing at 6" });

    expect(
      events.map((one) => one.event),
      "no proposal was made"
    ).not.toContain("proposal");
    expect(events[events.length - 1]).toEqual({ event: "done", data: { mode: "live" } });
    // Claude was told why, each time, as an error result for its own call
    const results = fake.state.requests.slice(1).map((one) => one.params.messages[one.params.messages.length - 1].content[0]);
    expect(results[0]).toMatchObject({
      type: "tool_result",
      is_error: true,
      content: expect.stringContaining('No job has the id "job-that-is-not-there"')
    });
    expect(results[1]).toMatchObject({ type: "tool_result", is_error: true, content: expect.stringContaining("isn't a time") });
  });

  it("refuses a move that would double-book a crew, instead of proposing it", async () => {
    live();
    const app = await freshApp();
    const { owner } = await workspace(app);
    const key = await connectMac(app, owner);
    const data = await read(owner);
    // a job whose one booking is on its first day, and another job on the same crew on another day
    const [mover, other] = (() => {
      for (const first of data.assignments) {
        const job = data.jobs.find((one) => one.id === first.jobId)!;
        if (data.assignments.filter((one) => one.jobId === job.id).length !== 1 || first.date.slice(0, 10) !== job.startDate) continue;
        const second = data.assignments.find((one) => one.crewId === first.crewId && one.jobId !== job.id && one.date !== first.date);
        if (second) return [job, second];
      }
      throw new Error("the seeded workspace has no crew with two jobs");
    })();
    fake.state.rounds = [
      proposes({ job_id: mover.id, field: "date", value: other.date.slice(0, 10) }),
      { deltas: ["That crew is busy that day."] }
    ];

    const { events } = await ask(app, key, { text: "Move it" });
    expect(events.map((one) => one.event)).not.toContain("proposal");
    const result = fake.state.requests[1].params.messages.at(-1).content[0];
    expect(result).toMatchObject({ is_error: true, content: expect.stringContaining("double-book") });
  });

  it("answers 409 and changes nothing when the job moved after the proposal", async () => {
    live();
    const app = await freshApp();
    const { owner } = await workspace(app);
    const key = await connectMac(app, owner);
    const { job } = await bookedJob(owner);
    fake.state.rounds = [proposes({ job_id: job.id, field: "end", value: "17:00" })];
    const proposal = (await ask(app, key, { text: "Run it till 5" })).events.find((one) => one.event === "proposal")!.data;

    // somebody edits the job on the website in the meantime
    await owner.patch(`/api/jobs/${job.id}`).send({ notes: "changed on the website", version: job.version }).expect(200);
    const before = await snapshot(owner, job.id);

    const refused = await accept(app, key, proposal.id).expect(409);
    expect(refused.body).toMatchObject({ code: "conflict", reason: "stale" });
    expect(await snapshot(owner, job.id), "the stale Accept wrote nothing").toBe(before);
    await accept(app, key, proposal.id).expect(404);
  });

  it("refuses Accept with 403 to a person who can no longer change the schedule, and leaves the job alone", async () => {
    live();
    const app = await freshApp();
    const { owner, orgId } = await workspace(app);
    const admin = await teammate(app, owner, orgId, "admin");
    const key = await connectMac(app, admin.agent);
    const { job } = await bookedJob(owner);
    fake.state.rounds = [proposes({ job_id: job.id, field: "start", value: "06:30" })];
    const proposal = (await ask(app, key, { text: "Start at 6:30" })).events.find((one) => one.event === "proposal")!.data;

    // the Owner makes them a Member before they press Accept
    const userId = (await owner.get("/api/bootstrap").expect(200)).body.users.find(
      (user: { accountId?: string }) => user.accountId === admin.accountId
    ).id;
    await owner.patch(`/api/team/users/${userId}`).send({ permission: "member" }).expect(200);
    const before = await snapshot(owner, job.id);

    const refused = await accept(app, key, proposal.id).expect(403);
    expect(refused.body.code).toBe("forbidden");
    expect(await snapshot(owner, job.id)).toBe(before);
  });

  it("proposes nothing for a Member, and tells Claude why", async () => {
    live();
    const app = await freshApp();
    const { owner, orgId } = await workspace(app);
    const member = await teammate(app, owner, orgId, "member");
    const key = await connectMac(app, member.agent);
    const { job } = await bookedJob(owner);
    fake.state.rounds = [
      proposes({ job_id: job.id, field: "start", value: "06:00" }),
      { deltas: ["An Owner or Admin can make that change."] }
    ];

    const { events } = await ask(app, key, { text: "Start it at 6" });
    expect(events.map((one) => one.event)).not.toContain("proposal");
    expect(fake.state.requests[0].params.messages.at(-1).content).toContain("Their role can't change the schedule");
    expect(fake.state.requests[1].params.messages.at(-1).content[0]).toMatchObject({
      is_error: true,
      content: expect.stringContaining("only an Owner or Admin")
    });
  });

  it("belongs to the Mac and the login that asked: another Mac or another person gets 404", async () => {
    live();
    const app = await freshApp();
    const { owner, orgId } = await workspace(app);
    const macA = await connectMac(app, owner);
    const macB = await connectMac(app, owner);
    const admin = await teammate(app, owner, orgId, "admin");
    const adminsMac = await connectMac(app, admin.agent);
    const { job } = await bookedJob(owner);
    fake.state.rounds = [proposes({ job_id: job.id, field: "start", value: "06:00" })];
    const proposal = (await ask(app, macA, { text: "Start at 6" })).events.find((one) => one.event === "proposal")!.data;

    expect((await accept(app, macB, proposal.id).expect(404)).body.code).toBe("proposal_gone");
    expect((await reject(app, adminsMac, proposal.id).expect(404)).body.code).toBe("proposal_gone");
    await accept(app, adminsMac, proposal.id).expect(404);
    // none of that spent it: the Mac that asked still can
    await accept(app, macA, proposal.id).expect(200);
  });

  it("is gone after ten minutes", async () => {
    live();
    const app = await freshApp();
    const { owner } = await workspace(app);
    const key = await connectMac(app, owner);
    const { job } = await bookedJob(owner);
    fake.state.rounds = [proposes({ job_id: job.id, field: "start", value: "06:00" })];
    const proposal = (await ask(app, key, { text: "Start at 6" })).events.find((one) => one.event === "proposal")!.data;
    const before = await snapshot(owner, job.id);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + PROPOSAL_TTL_MS + 1000);
    expect((await accept(app, key, proposal.id).expect(404)).body.code).toBe("proposal_gone");
    vi.useRealTimers();
    expect(await snapshot(owner, job.id)).toBe(before);
  });

  it("changes nothing on Reject, and a rejected proposal can't be accepted after", async () => {
    live();
    const app = await freshApp();
    const { owner } = await workspace(app);
    const key = await connectMac(app, owner);
    const { job } = await bookedJob(owner);
    fake.state.rounds = [proposes({ job_id: job.id, field: "start", value: "06:00" })];
    const proposal = (await ask(app, key, { text: "Start at 6" })).events.find((one) => one.event === "proposal")!.data;
    const before = await snapshot(owner, job.id);

    expect((await reject(app, key, proposal.id).expect(200)).body).toEqual({ ok: true });
    expect(await snapshot(owner, job.id)).toBe(before);
    await accept(app, key, proposal.id).expect(404);
    await reject(app, key, proposal.id).expect(404);
  });
});

/* ── without Claude ────────────────────────────────────────────────────────── */

describe("demo mode", () => {
  const demoAsk = async (app: App, key: string, text: string) => {
    const { events } = await ask(app, key, { text, tz: "America/Chicago" });
    expect(events[events.length - 1], text).toEqual({ event: "done", data: { mode: "demo" } });
    return events
      .filter((one) => one.event === "text")
      .map((one) => one.data.delta)
      .join("");
  };

  it("answers what the person's inbox covers, and says the AI isn't connected for the rest", async () => {
    const app = await freshApp();
    const { owner } = await workspace(app);
    const key = await connectMac(app, owner);

    expect(await demoAsk(app, key, "What's next?")).toMatch(/^(Next on the schedule is .+|Nothing else is on your schedule.+)\.$/);
    expect(await demoAsk(app, key, "Any meetings today?")).toBe(
      "Your calendar isn't connected, so I can't see your meetings. You can connect Google or Outlook from the Meetings panel on the BuildFlow website."
    );
    expect(await demoAsk(app, key, "Read my notifications")).toMatch(/^(You have .+ unread notifications?.+|You're all caught up.+)$/);
    expect(await demoAsk(app, key, "What's waiting on me?")).toMatch(/^(.+ waiting on you.*|Nothing is waiting on you right now\.)$/);
    expect(await demoAsk(app, key, "Move milling to Thursday")).toBe(NOT_CONNECTED_CHANGE);
    expect(await demoAsk(app, key, "How much tack coat is left?")).toBe(NOT_CONNECTED_OTHER);
    expect(fake.state.requests, "Claude was never asked").toHaveLength(0);
  });

  /** A Google connection with a token that is good for an hour, so nothing is ever refreshed over the network. */
  const connectGoogle = (app: App, accountId: string) =>
    managerOf(app).main.saveCalendarConnection({
      accountId,
      provider: "google",
      email: "dana@example.com",
      refreshToken: "test-refresh-token",
      accessToken: "test-access-token",
      expiresAt: Date.now() + 60 * 60_000
    });

  it("reads the person's meetings through the calendar cache, over the range the Mac's inbox reads", async () => {
    const app = await freshApp();
    const { owner, accountId } = await workspace(app);
    const key = await connectMac(app, owner);
    connectGoogle(app, accountId);
    // Primed for the range voice reads, so the read below is answered from the cache and Google is never asked.
    const { from, to } = meetingWindow(Date.now(), "America/Chicago");
    const soon = Date.now() + 20 * 60_000;
    const precon: CalendarEvent = {
      id: "evt-1",
      provider: "google",
      title: "Paving pre-con",
      startsAt: new Date(soon).toISOString(),
      endsAt: new Date(soon + 30 * 60_000).toISOString(),
      allDay: false,
      location: "",
      joinUrl: "https://meet.google.com/abc-defg-hij",
      attendees: [],
      organizer: "Dana",
      guests: [],
      myResponse: "accepted",
      description: "",
      webUrl: "",
      conference: "Google Meet"
    };
    await calendarEventCache.read(accountId, "google", from, to, async () => [precon]);

    expect(await demoAsk(app, key, "Any meetings?")).toContain("Paving pre-con");
  });

  it("goes ahead without a calendar that is slow to answer, and says so", async () => {
    const app = await freshApp();
    const { owner, accountId } = await workspace(app);
    const key = await connectMac(app, owner);
    connectGoogle(app, accountId);
    const { from, to } = meetingWindow(Date.now(), "America/Chicago");
    // a provider read already under way that never finishes
    void calendarEventCache.read(accountId, "google", from, to, () => new Promise<CalendarEvent[]>(() => undefined));

    const started = Date.now();
    const said = await demoAsk(app, key, "Any meetings?");
    expect(said).toContain("I couldn't reach your calendar just now");
    expect(Date.now() - started, "the answer waited for the calendar only so long").toBeLessThan(CALENDAR_WAIT_MS + 3000);
  });

  it("is where a key that fails, or an account with no credit, lands", async () => {
    live();
    const app = await freshApp();
    const { owner } = await workspace(app);
    const key = await connectMac(app, owner);
    fake.state.rounds = [
      { error: new fake.AuthenticationError(401, "invalid x-api-key", "authentication_error") },
      {
        error: new fake.BadRequestError(
          400,
          "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
          "invalid_request_error"
        )
      }
    ];
    expect(await demoAsk(app, key, "Any meetings?")).toContain("calendar isn't connected");
    expect(await demoAsk(app, key, "Any meetings?")).toContain("calendar isn't connected");
    expect(fake.state.requests).toHaveLength(2);
  });
});

/* ── the limit and the door ────────────────────────────────────────────────── */

describe("the hourly limit", () => {
  it("is the website assistant's forty, spent from either door", async () => {
    const app = await freshApp();
    const { owner } = await workspace(app);
    const key = await connectMac(app, owner);

    for (let asked = 0; asked < 20; asked += 1) await owner.post("/api/ai/ask").send({ question: "What's next?" }).expect(200);
    for (let asked = 0; asked < 20; asked += 1) {
      const { events } = await ask(app, key, { text: "What's next?" });
      expect(events.at(-1)?.event).toBe("done");
    }

    const { res, events } = await ask(app, key, { text: "One more?" });
    expect(events).toEqual([
      {
        event: "error",
        data: { code: "rate_limited", message: expect.stringContaining("Try again in"), retryAfterSec: expect.any(Number) }
      }
    ]);
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    await owner.post("/api/ai/ask").send({ question: "And the website?" }).expect(429);
  });
});

describe("the door", () => {
  it("is shut to a browser's session cookie", async () => {
    const app = await freshApp();
    const { owner } = await workspace(app);
    expect((await owner.post("/api/desktop/ask").send({ text: "What's next?" }).expect(401)).body.code).toBe("device_key_required");
    expect((await owner.post("/api/desktop/proposals/bfp_x/accept").expect(401)).body.code).toBe("device_key_required");
    expect((await owner.post("/api/desktop/proposals/bfp_x/reject").expect(401)).body.code).toBe("device_key_required");
  });

  it("keeps each workspace to itself: its jobs in the context, its proposals, its writes", async () => {
    live();
    const app = await freshApp();
    const asphalt = await workspace(app);
    const concrete = await workspace(app, "rae@pourco.com", "Pour Co", "Concrete");
    const asphaltMac = await connectMac(app, asphalt.owner);
    const concreteMac = await connectMac(app, concrete.owner);
    const theirs = await bookedJob(concrete.owner);
    const theirProjects = (await read(concrete.owner)).projects.map((project) => project.name);

    // Asphalt's question carries Asphalt's workspace, and none of Pour Co's
    fake.state.rounds = [proposes({ job_id: theirs.job.id, field: "start", value: "06:00" }), { deltas: ["Which job?"] }];
    const mine = await ask(app, asphaltMac, { text: "Start their job at 6" });
    const context = fake.state.requests[0].params.messages.at(-1).content as string;
    for (const name of theirProjects) expect(context).not.toContain(name);
    // and it cannot reach Pour Co's job by its id
    expect(mine.events.map((one) => one.event)).not.toContain("proposal");
    expect(fake.state.requests[1].params.messages.at(-1).content[0].content).toContain("No job has the id");

    // Pour Co's own proposal is not Asphalt's to accept
    fake.state.rounds = [proposes({ job_id: theirs.job.id, field: "start", value: "06:00" })];
    const proposal = (await ask(app, concreteMac, { text: "Start at 6" })).events.find((one) => one.event === "proposal")!.data;
    await accept(app, asphaltMac, proposal.id).expect(404);
    const accepted = await accept(app, concreteMac, proposal.id).expect(200);
    expect(accepted.body.job.id).toBe(theirs.job.id);
  });
});
