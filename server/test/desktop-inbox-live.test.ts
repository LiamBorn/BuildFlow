/**
 * BuildFlow for Mac, step 5: the live inbox the notch reads (wave-2 contract, "Inbox").
 *
 *   GET  /api/desktop/inbox                   ETag and 304, and reading it writes nothing
 *   POST /api/desktop/tasks/:task/:action     the website's own operation, re-derived for this person
 *   POST /api/desktop/inbox/state             the bell's own merge, so the badge and the notch agree
 *   GET  /api/desktop/events                  nudges, per workspace, closed on revoke
 *
 * Everything runs against a real app on a temp data directory, with a Mac connected through the real
 * PKCE hand-off, and only ever a device key on these routes.
 */
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  NOTIFICATION_STATE_SETTING,
  buildNotificationItems,
  decodeNotificationState,
  emptyNotificationState,
  encodeNotificationState,
  localIsoDate,
  markNotifications,
  unseenNotificationCount,
  type BootstrapPayload,
  type Job
} from "@buildflow/shared";
import type { DesktopInbox } from "../src/desktopInbox.js";
import {
  asMac,
  closeServers,
  connectMac,
  freshApp,
  listen,
  managerOf,
  openEvents,
  removeTempDirs,
  sleep,
  teammate,
  until,
  workspace,
  type Agent,
  type App
} from "./support/mac.js";

const WEBSITE = "https://build-flow.test";
beforeAll(() => {
  // the address emailed links are built from, and so the Mac's links too
  process.env.BUILDFLOW_CLIENT_URL = `${WEBSITE}/`;
});
afterAll(() => {
  delete process.env.BUILDFLOW_CLIENT_URL;
  closeServers();
  removeTempDirs();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const addDays = (date: string, days: number) => {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};

/** The Monday of the week holding a day: how submitted time is grouped into one task a week. */
const mondayOf = (date: string) => {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
};

/** A workspace, its owner's Mac, and the owner's view of the data. */
async function ownerWithMac(app: App, who?: Parameters<typeof workspace>[1]) {
  const ws = await workspace(app, who);
  const mac = await connectMac(app, ws.owner);
  const orgStore = await managerOf(app).getOrgStore(ws.orgId);
  const boot = async () => (await ws.owner.get("/api/bootstrap").expect(200)).body as BootstrapPayload;
  return { ...ws, ...mac, orgStore, boot, mac: asMac(app, mac.key) };
}

const inboxOf = async (mac: ReturnType<typeof asMac>, query = "") => {
  const answer = await mac.get(`/api/desktop/inbox${query}`).expect(200);
  return { inbox: answer.body as DesktopInbox, etag: String(answer.headers.etag) };
};

/** Counts the writes that reach a store's file while `work` runs. */
async function savesDuring(stores: Array<{ onSaved: (listener: () => void) => () => void }>, work: () => Promise<unknown>) {
  let saves = 0;
  const stops = stores.map((store) => store.onSaved(() => (saves += 1)));
  try {
    await work();
  } finally {
    stops.forEach((stop) => stop());
  }
  return saves;
}

/** A pending schedule change on a job, as a field report raises one. */
function pendingVariance(orgStore: Awaited<ReturnType<typeof ownerWithMac>>["orgStore"], job: Job, days = 2) {
  return orgStore.recordVariance({
    projectId: job.projectId,
    jobId: job.id,
    fieldUpdateId: `fu-test-${job.id}`,
    kind: "slip",
    severity: "High",
    reportedPercent: 10,
    plannedPercent: 60,
    varianceDays: days,
    proposal: {
      currentStart: job.startDate,
      currentEnd: job.endDate,
      proposedStart: addDays(job.startDate, days),
      proposedEnd: addDays(job.endDate, days),
      ripple: [],
      projectSlipDays: days,
      criticalPath: true,
      totalFloatDays: 0
    }
  });
}

/** An open rain-day call on a job, as WeatherIQ records one. */
function openWeatherCall(orgStore: Awaited<ReturnType<typeof ownerWithMac>>["orgStore"], job: Job, day: string) {
  const id = `wx-${job.id}-${day}`;
  orgStore.reconcileWeatherConflicts(
    [
      {
        id,
        jobId: job.id,
        projectId: job.projectId,
        date: day,
        cause: "rain",
        severity: "hold",
        start: `${day}T09:00`,
        end: `${day}T11:00`,
        reason: "0.30 in of rain",
        assigneeId: ""
      }
    ],
    { projectIds: [], from: day, to: day }
  );
  return id;
}

const answer = (mac: ReturnType<typeof asMac>, path: string, body: unknown) => mac.post(path).send(body as object);

/* ── the inbox ─────────────────────────────────────────────────────────────── */

describe("the Mac's inbox", () => {
  it("answers the inbox with an ETag, then 304 while nothing it shows has changed, and reading it writes nothing", async () => {
    const app = await freshApp();
    const { owner, orgStore, mac } = await ownerWithMac(app);
    await mac.get("/api/desktop/inbox?tz=America/Chicago").expect(200); // the gate's hourly "last seen" is written here

    let first!: request.Response;
    const saves = await savesDuring([orgStore, managerOf(app).main], async () => {
      first = await mac.get("/api/desktop/inbox?tz=America/Chicago").expect(200);
      for (let read = 0; read < 5; read += 1) await mac.get("/api/desktop/inbox?tz=America/Chicago").expect(200);
    });
    expect(saves, "reading the inbox rewrote a database file").toBe(0);

    const etag = String(first.headers.etag);
    expect(etag).toMatch(/^"bfi-[A-Za-z0-9_-]{32}"$/);
    expect(first.headers["cache-control"]).toBe("private, no-cache");
    const inbox = first.body as DesktopInbox;
    expect(inbox.version).toBe(1);
    expect(inbox.today).toBe(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date()));
    expect(inbox.me).toMatchObject({ name: "Dana Brooks", workspace: "Asphalt Co", role: "owner" });
    expect(inbox.notifications.length).toBeGreaterThan(0);
    for (const item of [...inbox.notifications, ...inbox.jobs, ...inbox.tasks])
      expect(item.url).toMatch(/^https:\/\/build-flow\.test\/#open\//);

    const same = await mac.get("/api/desktop/inbox?tz=America/Chicago").set("If-None-Match", etag).expect(304);
    expect(same.text).toBe("");
    expect(same.headers.etag).toBe(etag);

    // something the Mac shows changes: a new DelayIQ, with the link that opens it
    const delayIQ = (
      await owner
        .post("/api/delayIQs")
        .send({
          projectId: inbox.jobs[0].projectId,
          category: "Materials",
          title: "Rebar delivery slipping",
          impactDays: 2,
          severity: "High",
          status: "Open",
          description: "The supplier moved the truck to Thursday."
        })
        .expect(201)
    ).body as { id: string };
    const changed = await mac.get("/api/desktop/inbox?tz=America/Chicago").set("If-None-Match", etag).expect(200);
    expect(changed.headers.etag).not.toBe(etag);
    expect((changed.body as DesktopInbox).notifications.find((item) => item.id === `delayIQ-${delayIQ.id}`)).toMatchObject({
      title: "DelayIQ being tracked",
      tone: "red",
      url: `${WEBSITE}/#open/delayIQs/${delayIQ.id}`
    });
  });

  it("is the device's own: a browser's session gets 401 on every inbox route, and so does a key once revoked", async () => {
    const app = await freshApp();
    const { owner, deviceId, mac } = await ownerWithMac(app);
    for (const [method, path] of [
      ["get", "/api/desktop/inbox"],
      ["post", "/api/desktop/inbox/state"],
      ["post", "/api/desktop/tasks/variance-v1/accept"],
      ["get", "/api/desktop/events"]
    ] as const) {
      const refused = await owner[method](path).expect(401);
      expect(refused.body.code, `${method.toUpperCase()} ${path}`).toBe("device_key_required");
    }
    await owner.delete(`/api/me/devices/${deviceId}`).expect(200);
    expect((await mac.get("/api/desktop/inbox").expect(401)).body.code).toBe("device_revoked");
  });

  it("reads the device's own workspace, never another's", async () => {
    const app = await freshApp();
    const x = await ownerWithMac(app);
    const y = await ownerWithMac(app, { email: "kim@roadworks.com", name: "Kim Park", orgName: "Roadworks" });
    const log = (owner: Agent, projectId: string, title: string) =>
      owner
        .post("/api/delayIQs")
        .send({ projectId, category: "Other", title, impactDays: 1, severity: "Low", status: "Open", description: "Only here." })
        .expect(201);
    const xProject = (await x.boot()).projects[0].id;
    const yProject = (await y.boot()).projects[0].id;
    const onX = (await log(x.owner, xProject, "Only in Asphalt Co")).body.id as string;
    const onY = (await log(y.owner, yProject, "Only in Roadworks")).body.id as string;

    const seenByX = (await inboxOf(x.mac)).inbox;
    const seenByY = (await inboxOf(y.mac)).inbox;
    expect(seenByX.me.workspace).toBe("Asphalt Co");
    expect(seenByY.me.workspace).toBe("Roadworks");
    expect(seenByX.notifications.map((item) => item.id)).toContain(`delayIQ-${onX}`);
    expect(seenByX.notifications.map((item) => item.id)).not.toContain(`delayIQ-${onY}`);
    expect(seenByY.notifications.map((item) => item.id)).toContain(`delayIQ-${onY}`);
    expect(seenByY.notifications.map((item) => item.id)).not.toContain(`delayIQ-${onX}`);
    // the same starter trade seeds the same ids in both: the workspace, not the id, is what keeps them apart
    expect(JSON.stringify(seenByX)).not.toContain("Only in Roadworks");
    expect(JSON.stringify(seenByY)).not.toContain("Only in Asphalt Co");
  });
});

/* ── answering a task ──────────────────────────────────────────────────────── */

describe("answering a task from the Mac", () => {
  it("accepts one schedule change and rejects another, through the website's own operation", async () => {
    const app = await freshApp();
    const { owner, orgStore, mac, boot } = await ownerWithMac(app);
    const [first, second] = (await boot()).jobs;
    const moving = pendingVariance(orgStore, first);
    const staying = pendingVariance(orgStore, second, 3);

    const { inbox } = await inboxOf(mac);
    const accept = inbox.tasks.find((task) => task.id === `variance-${moving.id}`)!.actions.find((action) => action.id === "accept")!;
    expect(accept.request.path).toBe(`/api/desktop/tasks/variance-${moving.id}/accept`);
    const accepted = await answer(mac, accept.request.path, accept.request.body).expect(200);
    expect(accepted.body).toEqual({ ok: true, etag: expect.stringMatching(/^"bfi-/) });
    // the etag is the inbox as it now stands
    expect(accepted.body.etag).toBe((await inboxOf(mac)).etag);

    const reject = inbox.tasks.find((task) => task.id === `variance-${staying.id}`)!.actions.find((action) => action.id === "reject")!;
    await answer(mac, reject.request.path, reject.request.body).expect(200);

    const variances = (await owner.get("/api/schedule/variances").expect(200)).body as Array<{
      id: string;
      status: string;
      resolvedBy: string;
    }>;
    const me = (await boot()).activeUser.id;
    expect(variances.find((one) => one.id === moving.id)).toMatchObject({ status: "accepted", resolvedBy: me });
    expect(variances.find((one) => one.id === staying.id)).toMatchObject({ status: "rejected", resolvedBy: me });
    // accepting believed the field: the job moved, exactly as the website's Accept moves it
    expect((await boot()).jobs.find((job) => job.id === first.id)).toMatchObject({
      startDate: addDays(first.startDate, 2),
      endDate: addDays(first.endDate, 2)
    });
    // and a task that has been answered is gone
    expect((await answer(mac, accept.request.path, accept.request.body).expect(404)).body.code).toBe("task_gone");
    expect((await inboxOf(mac)).inbox.tasks.some((task) => task.kind === "schedule-change")).toBe(false);
  });

  it("calls one rain day off and keeps another on", async () => {
    const app = await freshApp();
    const { orgStore, mac, boot } = await ownerWithMac(app);
    // the forecast cannot be read: calling a day off still works, on the working calendar alone
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const today = localIsoDate();
    const [first, second] = (await boot()).jobs;
    const callOff = openWeatherCall(orgStore, first, addDays(today, 1));
    const keep = openWeatherCall(orgStore, second, addDays(today, 2));

    const { inbox } = await inboxOf(mac);
    const action = (taskId: string, id: string) => inbox.tasks.find((task) => task.id === taskId)!.actions.find((one) => one.id === id)!;
    const cancel = action(`weather-call-${callOff}`, "cancel");
    await answer(mac, cancel.request.path, cancel.request.body).expect(200);
    const kept = action(`weather-call-${keep}`, "keep");
    await answer(mac, kept.request.path, kept.request.body).expect(200);

    expect(orgStore.weatherConflict(callOff)).toMatchObject({ status: "cancelled" });
    expect(orgStore.weatherConflict(keep)).toMatchObject({ status: "kept" });
    // calling it off raised the reschedule, as the website's Call off does, for someone to accept
    expect(orgStore.variances("pending").some((variance) => variance.kind === "weather" && variance.jobId === first.id)).toBe(true);
    // neither asks any more; keeping a day on that is already kept is a task that has gone
    expect((await inboxOf(mac)).inbox.tasks.some((task) => task.kind === "weather-call")).toBe(false);
    expect((await answer(mac, kept.request.path, {}).expect(404)).body.code).toBe("task_gone");
  });

  it("books a crew on a job with none: asks for the crew, refuses a double booking, and takes nothing else from the Mac", async () => {
    const app = await freshApp();
    const { owner, mac, boot } = await ownerWithMac(app);
    const { inbox } = await inboxOf(mac);
    const task = inbox.tasks.find((one) => one.kind === "unbooked-job")!;
    expect(task, "the starter workspace has a job this week with no crew").toBeTruthy();
    const book = task.actions[0];
    expect(book).toMatchObject({ id: "book", request: { needs: ["crewId"] } });
    const date = book.request.body.date as string;

    const missing = await answer(mac, book.request.path, book.request.body).expect(400);
    expect(missing.body).toMatchObject({ code: "invalid_request", needs: ["crewId"] });
    const stranger = await answer(mac, book.request.path, { ...book.request.body, crewId: "crew-in-another-workspace" }).expect(400);
    expect(stranger.body).toMatchObject({ code: "invalid_request", needs: ["crewId"] });

    // a crew already on another job that day: the website asks "book anyway?"; the Mac cannot, and
    // `force` is not something a task needs, so sending it changes nothing
    const data = await boot();
    const busy = data.crews[0].id;
    const other = data.jobs.find((job) => job.id !== book.request.body.jobId)!;
    await owner.post("/api/schedule/assign").send({ jobId: other.id, crewId: busy, date, force: true }).expect(201);
    const clash = await answer(mac, book.request.path, { ...book.request.body, crewId: busy, force: true }).expect(409);
    expect(clash.body).toMatchObject({ code: "conflict", message: expect.stringContaining("that day") });

    const free = data.crews.find((crew) => crew.id !== busy && !data.assignments.some((a) => a.crewId === crew.id && a.date === date))!;
    await answer(mac, book.request.path, { ...book.request.body, crewId: free.id }).expect(200);
    expect((await boot()).assignments.some((a) => a.jobId === book.request.body.jobId && a.crewId === free.id && a.date === date)).toBe(
      true
    );
    expect((await inboxOf(mac)).inbox.tasks.some((one) => one.id === task.id)).toBe(false);
  });

  it("approves submitted time, and refuses to approve time the approver was not shown", async () => {
    const app = await freshApp();
    const { owner, orgId, mac } = await ownerWithMac(app);
    const member = await teammate(app, owner, orgId, "sam@asphaltco.com");
    const today = localIsoDate();
    const putIn = (clockIn: string, clockOut: string) =>
      member.agent.post("/api/time-entries").send({ date: today, clockIn, clockOut, breakMinutes: 0 }).expect(201);
    const morning = (await putIn("07:00", "11:00")).body.id as string;

    const shown = (await inboxOf(mac)).inbox.tasks.find((task) => task.kind === "time-cards")!;
    const approve = shown.actions[0];
    expect(approve.request.body).toEqual({ ids: [morning] });

    // more time lands after the approver looked: approving what they saw would approve it unseen
    const afternoon = (await putIn("12:00", "15:00")).body.id as string;
    const stale = await answer(mac, approve.request.path, approve.request.body).expect(409);
    expect(stale.body.code).toBe("conflict");
    expect(
      (await member.agent.get("/api/time-entries").expect(200)).body.entries.every((e: { status: string }) => e.status === "Submitted")
    ).toBe(true);

    // looked at again, it is both, and approving it approves both
    const fresh = (await inboxOf(mac)).inbox.tasks.find((task) => task.kind === "time-cards")!.actions[0];
    expect([...(fresh.request.body.ids as string[])].sort()).toEqual([morning, afternoon].sort());
    await answer(mac, fresh.request.path, fresh.request.body).expect(200);
    const entries = (await member.agent.get("/api/time-entries").expect(200)).body.entries as Array<{ status: string }>;
    expect(entries.map((entry) => entry.status)).toEqual(["Approved", "Approved"]);
    expect((await inboxOf(mac)).inbox.tasks.some((task) => task.kind === "time-cards")).toBe(false);
  });

  it("refuses an answer to someone whose role cannot give it, the way the website's endpoint does", async () => {
    const app = await freshApp();
    const { owner, orgId, orgStore, boot } = await ownerWithMac(app);
    const member = await teammate(app, owner, orgId, "sam@asphaltco.com");
    const memberMac = asMac(app, (await connectMac(app, member.agent)).key);
    const [first, second] = (await boot()).jobs;
    const variance = pendingVariance(orgStore, first);
    const call = openWeatherCall(orgStore, second, addDays(localIsoDate(), 1));
    await member.agent
      .post("/api/time-entries")
      .send({ date: localIsoDate(), clockIn: "07:00", clockOut: "11:00", breakMinutes: 0 })
      .expect(201);

    // nothing of the kind is on a Member's list at all
    expect((await inboxOf(memberMac)).inbox.tasks.map((task) => task.kind)).toEqual([]);
    const cases: Array<[string, unknown, string]> = [
      [`/api/desktop/tasks/variance-${variance.id}/accept`, { userId: "anyone" }, "variance.resolve"],
      [`/api/desktop/tasks/weather-call-${call}/cancel`, {}, "assignments.write"],
      [`/api/desktop/tasks/time-cards-${mondayOf(localIsoDate())}/approve`, { ids: [] }, "timecard.approve"]
    ];
    for (const [path, body, need] of cases) {
      const refused = await answer(memberMac, path, body).expect(403);
      expect(refused.body, path).toMatchObject({ code: "forbidden", need });
    }
    // and nothing happened
    expect(orgStore.variances("pending").some((one) => one.id === variance.id)).toBe(true);
    expect(orgStore.weatherConflict(call)?.status).toBe("open");
    expect((await member.agent.get("/api/time-entries").expect(200)).body.entries[0].status).toBe("Submitted");
  });

  it("says a task is gone when it is, and asks for what a task's answer needs", async () => {
    const app = await freshApp();
    const { orgStore, mac, boot } = await ownerWithMac(app);
    const variance = pendingVariance(orgStore, (await boot()).jobs[0]);
    expect((await answer(mac, "/api/desktop/tasks/variance-nothing/accept", {}).expect(404)).body.code).toBe("task_gone");
    // an answer the task does not have
    expect((await answer(mac, `/api/desktop/tasks/variance-${variance.id}/book`, {}).expect(404)).body.code).toBe("task_gone");
    // the body the task listed, which the Mac is to send as given
    const missing = await answer(mac, `/api/desktop/tasks/variance-${variance.id}/accept`, {}).expect(400);
    expect(missing.body).toMatchObject({ code: "invalid_request", needs: ["userId"] });
    // the same answer on somebody else's behalf is a record that is not what was shown
    expect(
      (await answer(mac, `/api/desktop/tasks/variance-${variance.id}/accept`, { userId: "u-someone-else" }).expect(409)).body.code
    ).toBe("conflict");
    expect(orgStore.variances("pending").some((one) => one.id === variance.id)).toBe(true);
  });
});

/* ── seen and read ─────────────────────────────────────────────────────────── */

describe("seen and read, from the Mac", () => {
  it("merges the way the bell does, so the bell's badge and the notch's count are one number", async () => {
    const app = await freshApp();
    const { owner, orgStore, mac, boot } = await ownerWithMac(app);
    const { inbox } = await inboxOf(mac);
    const [a, b, c] = inbox.notifications.map((item) => item.id);

    const marked = await mac
      .post("/api/desktop/inbox/state")
      .send({ seen: [a, b], read: [b] })
      .expect(200);
    const after = await inboxOf(mac);
    expect(marked.body).toEqual({ etag: after.etag });
    expect(after.inbox.counts).toMatchObject({ unseen: inbox.counts.unseen - 2, unread: inbox.counts.unread - 1 });

    // the website's bell, from the same stored state and the same list
    const bell = (data: BootstrapPayload) =>
      unseenNotificationCount(decodeNotificationState(data.userSettings?.[NOTIFICATION_STATE_SETTING]), buildNotificationItems(data));
    expect(bell(await boot())).toBe(after.inbox.counts.unseen);

    // the bell marks one on the website; the Mac's count follows, and nothing either marked is undone
    const website = encodeNotificationState(markNotifications(emptyNotificationState(), [c], "read"));
    await owner
      .put(`/api/me/settings/${encodeURIComponent(NOTIFICATION_STATE_SETTING)}`)
      .send({ value: website })
      .expect(200);
    const both = await inboxOf(mac);
    expect(both.inbox.counts.unseen).toBe(inbox.counts.unseen - 3);
    expect(both.inbox.notifications.find((item) => item.id === b)).toMatchObject({ seen: true, read: true });
    expect(bell(await boot())).toBe(both.inbox.counts.unseen);

    // marking what is already marked writes nothing
    const saves = await savesDuring([orgStore], () =>
      mac
        .post("/api/desktop/inbox/state")
        .send({ seen: [a], read: [b, c] })
        .expect(200)
    );
    expect(saves).toBe(0);

    await mac.post("/api/desktop/inbox/state").send({ allRead: true }).expect(200);
    const all = (await inboxOf(mac)).inbox;
    expect(all.counts).toMatchObject({ unseen: 0, unread: 0 });
    expect(bell(await boot())).toBe(0);
  });

  it("refuses a body it cannot read", async () => {
    const app = await freshApp();
    const { mac } = await ownerWithMac(app);
    expect((await mac.post("/api/desktop/inbox/state").send({ seen: "delayIQ-d1" }).expect(400)).body.code).toBe("invalid_request");
  });
});

/* ── nudges ────────────────────────────────────────────────────────────────── */

describe("the Mac's nudges", () => {
  it("tells a workspace's Macs within a second that something changed, and never another workspace's", async () => {
    const app = await freshApp();
    const base = await listen(app);
    const x = await ownerWithMac(app);
    const y = await ownerWithMac(app, { email: "kim@roadworks.com", name: "Kim Park", orgName: "Roadworks" });
    const member = await teammate(app, x.owner, x.orgId, "sam@asphaltco.com");
    const xEvents = await openEvents(base, x.key);
    const yEvents = await openEvents(base, y.key);
    // each opens with a nudge of its own: whatever changed while it was away
    expect(await until(() => xEvents.events("inbox").length === 1 && yEvents.events("inbox").length === 1)).toBe(true);

    const data = await x.boot();
    const project = data.projects[0].id;
    // the writes that told nobody before, each its own nudge
    const writes: Array<[string, () => Promise<unknown>]> = [
      [
        "a DelayIQ",
        () =>
          x.owner
            .post("/api/delayIQs")
            .send({
              projectId: project,
              category: "Other",
              title: "Crane down",
              impactDays: 1,
              severity: "High",
              status: "Open",
              description: "Hydraulics."
            })
            .expect(201)
      ],
      [
        "a field update",
        () =>
          x.owner
            .post("/api/field-updates")
            .send({ projectId: project, userId: data.activeUser.id, message: "Base course down.", status: "In Progress" })
            .expect(201)
      ],
      [
        "a material",
        () =>
          x.owner
            .post("/api/materials")
            .send({ projectId: project, name: "Tack oil", status: "Ordered", deliveryDate: localIsoDate(), quantity: "2 totes" })
            .expect(201)
      ],
      ["equipment", () => x.owner.post("/api/equipment").send({ name: "Roller 7", type: "Roller", status: "Maintenance" }).expect(201)],
      [
        "time put in",
        () =>
          member.agent
            .post("/api/time-entries")
            .send({ date: localIsoDate(), clockIn: "07:00", clockOut: "09:00", breakMinutes: 0 })
            .expect(201)
      ],
      ["a variance", async () => pendingVariance(x.orgStore, data.jobs[0])],
      ["a weather conflict", async () => openWeatherCall(x.orgStore, data.jobs[1], addDays(localIsoDate(), 1))],
      [
        "read state",
        () =>
          x.owner
            .put(`/api/me/settings/${encodeURIComponent(NOTIFICATION_STATE_SETTING)}`)
            .send({
              value: encodeNotificationState(markNotifications(emptyNotificationState(), [`inspection-${data.inspections[0].id}`], "seen"))
            })
            .expect(200)
      ],
      [
        "a booking",
        () =>
          x.owner
            .post("/api/schedule/assign")
            .send({ jobId: data.jobs[2].id, crewId: data.crews[2].id, date: addDays(localIsoDate(), 3), force: true })
            .expect(201)
      ]
    ];
    for (const [what, write] of writes) {
      const before = xEvents.events("inbox").length;
      const startedAt = Date.now();
      await write();
      expect(await until(() => xEvents.events("inbox").length > before, 1500), `${what} nudged its workspace's Mac`).toBe(true);
      expect(Date.now() - startedAt, `${what} within about a second`).toBeLessThan(1200);
      expect(xEvents.events("inbox")[before]).toBe('event: inbox\ndata: {"etag":null}');
    }
    await sleep(400);
    expect(yEvents.events("inbox"), "the other workspace's Mac heard nothing of it").toHaveLength(1);
    xEvents.close();
    yEvents.close();
  });

  it("makes one nudge of a burst of writes", async () => {
    const app = await freshApp();
    const base = await listen(app);
    const x = await ownerWithMac(app);
    const events = await openEvents(base, x.key);
    expect(await until(() => events.events("inbox").length === 1)).toBe(true);
    const project = (await x.boot()).projects[0].id;
    // five writes to the workspace's file, back to back: each one a whole-file save that the hub hears
    let saves = 0;
    const stop = x.orgStore.onSaved(() => (saves += 1));
    for (let n = 0; n < 5; n += 1) {
      x.orgStore.createDelayIQ({
        projectId: project,
        category: "Other",
        title: `Burst ${n}`,
        impactDays: 1,
        severity: "Low",
        status: "Open",
        description: "One of five."
      });
    }
    stop();
    expect(saves).toBe(5);
    expect(await until(() => events.events("inbox").length === 2, 1500)).toBe(true);
    await sleep(700);
    expect(events.events("inbox")).toHaveLength(2);
    events.close();
  });

  it("says revoked and closes the stream when the Mac is disconnected, from Settings or from the Mac", async () => {
    const app = await freshApp();
    const base = await listen(app);
    const x = await ownerWithMac(app);
    const fromSettings = await openEvents(base, x.key);
    expect(await until(() => fromSettings.events("inbox").length === 1)).toBe(true);
    await x.owner.delete(`/api/me/devices/${x.deviceId}`).expect(200);
    expect(await until(() => fromSettings.ended(), 1500), "the stream ended").toBe(true);
    expect(fromSettings.events("revoked")).toEqual(['event: revoked\ndata: {"code":"device_revoked"}']);
    await expect(openEvents(base, x.key)).rejects.toThrow("stream answered 401");

    const second = await connectMac(app, x.owner);
    const fromMac = await openEvents(base, second.key);
    expect(await until(() => fromMac.events("inbox").length === 1)).toBe(true);
    await asMac(app, second.key).post("/api/desktop/disconnect").expect(200);
    expect(await until(() => fromMac.ended(), 1500)).toBe(true);
    expect(fromMac.events("revoked")).toHaveLength(1);
  });

  it("is closed to anything but a device key", async () => {
    const app = await freshApp();
    const base = await listen(app);
    await expect(openEvents(base, null)).rejects.toThrow("stream answered 401");
    await expect(openEvents(base, "bfd_notarealkeynotarealkeynotarealkeynotarealk")).rejects.toThrow("stream answered 401");
  });
});
