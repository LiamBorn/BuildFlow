/**
 * The time a person puts in on their own TimeCard (2026-09-25).
 *
 * A Member's TimeCard is a form for the day they worked and when they clocked in and out. What is
 * worth holding down is not that a row can be written but three things around it:
 *
 *   - whose time it is comes from the session and from nothing else, so nobody at any level can
 *     read or remove a teammate's time through these routes;
 *   - time that cannot be right is refused with the field it belongs to — clocking out before
 *     clocking in, a break as long as the shift, a day that has not come, two stretches of one day
 *     covering the same minutes (the hours would count twice);
 *   - every level may put its own time in, because everyone who works logs what they worked.
 *
 * And the one way past the first rule: an Owner and an Admin read the whole team's time, a range of
 * days at a time, with the people it belongs to. A Member cannot reach it, and no workspace ever
 * sees another's.
 *
 * And what they do with it: approve a person's time, by the entries they were shown, and reopen an
 * approval made by mistake. An approved entry is no longer its person's to take back out.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { localIsoDate, type PermissionLevel, type TeamTimeEntries, type TimeEntry } from "@buildflow/shared";
import { createApp } from "../src/app.js";
import { can, ROUTE_POLICY } from "../src/permissions.js";

type MainStore = {
  all: <T>(sql: string) => T[];
  refreshInvite: (id: string, orgId: string, ttlMs: number) => { token: string } | undefined;
  setAccountRole: (id: string, role: string) => { role: string } | undefined;
};

/** An Owner's workspace, and a way to sign teammates into it at a level. */
async function workspace(dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-time-")), "test.sqlite")) {
  const app = await createApp({ dataFile, reset: true });
  const owner = request.agent(app);
  await owner
    .post("/api/auth/signup")
    .send({ email: "dana@asphaltco.com", password: "Roller-Tack-2026", name: "Dana Brooks", orgName: "Asphalt Co", acceptTerms: true })
    .expect(201);
  await owner
    .post("/api/business-profile")
    .send({ businessType: "Asphalt", selectedPlan: "free", selectedProducts: [], seats: 3 })
    .expect(200);
  const orgId = (await owner.get("/api/auth/me").expect(200)).body.org.id as string;
  const main = (app.locals.storeManager as { main: MainStore }).main;

  const join = async (level: PermissionLevel, email = `${level}@asphaltco.com`, name = `${level} person`) => {
    await owner
      .post("/api/team/invites")
      .send({ invites: [{ email, permission: "member" }] })
      .expect(201);
    const row = main
      .all<{ id: string; email: string }>("SELECT id, email FROM invites WHERE acceptedAt IS NULL")
      .find((r) => r.email === email)!;
    const fresh = main.refreshInvite(row.id, orgId, 60_000)!;
    const agent = request.agent(app);
    const joined = await agent
      .post("/api/auth/invite/accept")
      .send({ token: fresh.token, name, password: "Paver-Screed-2026", acceptTerms: true })
      .expect(201);
    if (level !== "member") main.setAccountRole(joined.body.account.id, level);
    return agent;
  };

  return { app, dataFile, owner, join };
}

/** A day that has already happened, so no case depends on what day the suite runs. */
const daysAgo = (days: number) => localIsoDate(new Date(Date.now() - days * 86_400_000));

const shift = (over: Partial<TimeEntry> = {}) => ({
  date: daysAgo(1),
  clockIn: "07:00",
  clockOut: "15:30",
  breakMinutes: 30,
  projectId: null,
  notes: "",
  ...over
});

describe("a person's own time", () => {
  it("goes in, reads back, and comes back out again", async () => {
    const { join, owner } = await workspace();
    const member = await join("member");
    const project = (await owner.get("/api/bootstrap").expect(200)).body.projects[0].id as string;

    const created = await member
      .post("/api/time-entries")
      .send(shift({ projectId: project, notes: "Tack coat on the west lane" }))
      .expect(201);
    expect(created.body).toMatchObject({
      date: daysAgo(1),
      clockIn: "07:00",
      clockOut: "15:30",
      breakMinutes: 30,
      projectId: project,
      notes: "Tack coat on the west lane",
      status: "Submitted"
    });
    expect(created.body.id).toMatch(/^te-/);

    const listed = await member.get("/api/time-entries").expect(200);
    expect(listed.body.entries.map((entry: TimeEntry) => entry.id)).toEqual([created.body.id]);

    await member.delete(`/api/time-entries/${created.body.id}`).expect(204);
    expect((await member.get("/api/time-entries").expect(200)).body.entries).toEqual([]);
  });

  it("is only ever the caller's own, at every level", async () => {
    const { join, owner } = await workspace();
    const carlos = await join("member", "carlos@asphaltco.com");
    const priya = await join("member", "priya@asphaltco.com");
    const admin = await join("admin");

    const theirs = (await carlos.post("/api/time-entries").send(shift()).expect(201)).body as TimeEntry;

    // nobody else sees it, however senior
    for (const other of [priya, admin, owner]) {
      expect((await other.get("/api/time-entries").expect(200)).body.entries).toEqual([]);
    }
    // and nobody else can take it out: somebody else's entry answers as a missing one
    for (const other of [priya, admin, owner]) {
      await other.delete(`/api/time-entries/${theirs.id}`).expect(404);
    }
    expect((await carlos.get("/api/time-entries").expect(200)).body.entries).toHaveLength(1);

    // an account in the body is not how anyone chooses whose time it is
    const forged = await priya
      .post("/api/time-entries")
      .send({ ...shift({ date: daysAgo(2) }), accountId: theirs.accountId })
      .expect(201);
    expect(forged.body.accountId).not.toBe(theirs.accountId);
    expect((await carlos.get("/api/time-entries").expect(200)).body.entries).toHaveLength(1);
  });

  it("keeps a day's stretches apart, latest first, and lets one start where another ended", async () => {
    const { join } = await workspace();
    const member = await join("member");

    await member
      .post("/api/time-entries")
      .send(shift({ clockIn: "06:30", clockOut: "11:00", breakMinutes: 0 }))
      .expect(201);
    // back to back is not an overlap
    await member
      .post("/api/time-entries")
      .send(shift({ clockIn: "11:00", clockOut: "15:00", breakMinutes: 0 }))
      .expect(201);
    const clash = await member
      .post("/api/time-entries")
      .send(shift({ clockIn: "14:00", clockOut: "18:00", breakMinutes: 0 }))
      .expect(409);
    expect(clash.body).toMatchObject({ field: "clockIn" });
    expect(clash.body.error).toContain("11:00–15:00");
    // another day is its own
    await member
      .post("/api/time-entries")
      .send(shift({ date: daysAgo(3) }))
      .expect(201);

    const days = (await member.get("/api/time-entries").expect(200)).body.entries.map(
      (entry: TimeEntry) => `${entry.date} ${entry.clockIn}`
    );
    expect(days).toEqual([`${daysAgo(1)} 11:00`, `${daysAgo(1)} 06:30`, `${daysAgo(3)} 07:00`]);
  });

  it("refuses time that cannot be right, and says which field is wrong", async () => {
    const { join } = await workspace();
    const member = await join("member");

    const refused = async (body: Record<string, unknown>, field: string, status = 400) => {
      const res = await member.post("/api/time-entries").send(body).expect(status);
      expect(res.body.field, JSON.stringify(body)).toBe(field);
      expect(typeof res.body.error).toBe("string");
    };
    await refused(shift({ clockIn: "15:30", clockOut: "07:00" }), "clockOut");
    await refused(shift({ clockIn: "07:00", clockOut: "07:00" }), "clockOut");
    await refused(shift({ clockIn: "07:00", clockOut: "08:00", breakMinutes: 60 }), "breakMinutes");
    await refused(shift({ breakMinutes: -5 }), "breakMinutes");
    await refused(shift({ clockIn: "7:00" }), "clockIn");
    await refused(shift({ clockOut: "24:00" }), "clockOut");
    await refused(shift({ date: "2026-02-30" }), "date");
    await refused(shift({ date: "last tuesday" }), "date");
    await refused(shift({ date: localIsoDate(new Date(Date.now() + 5 * 86_400_000)) }), "date");
    await refused(shift({ projectId: "p-not-here" }), "projectId");

    expect((await member.get("/api/time-entries").expect(200)).body.entries).toEqual([]);
  });

  it("is saved with the workspace, so it is still there after the server restarts", async () => {
    const { join, dataFile } = await workspace();
    const member = await join("member");
    const kept = (await member.post("/api/time-entries").send(shift()).expect(201)).body as TimeEntry;

    // the same data file, a new process: the session is in the main store and the time in the tenant's
    const restarted = await createApp({ dataFile, reset: false });
    const cookie = (await member.get("/api/auth/me")).request.cookies;
    const again = await request(restarted).get("/api/time-entries").set("Cookie", cookie).expect(200);
    expect(again.body.entries.map((entry: TimeEntry) => entry.id)).toEqual([kept.id]);
  });

  it("needs a session, and is open to every level for its own time", async () => {
    const { app } = await workspace();
    await request(app).get("/api/time-entries").expect(401);
    await request(app).post("/api/time-entries").send(shift()).expect(401);

    for (const level of ["owner", "admin", "member"] as const) {
      expect(can(level, "timecard.log"), level).toBe(true);
      expect(can(level, "timecard.read"), level).toBe(true);
    }
    expect(ROUTE_POLICY["GET /api/time-entries"]).toBe("timecard.read");
    expect(ROUTE_POLICY["POST /api/time-entries"]).toBe("timecard.log");
    expect(ROUTE_POLICY["DELETE /api/time-entries/:id"]).toBe("timecard.log");
  });
});

describe("the team's time", () => {
  /* A week back from today, with a day to spare either side of the entries the cases put in. */
  const week = { from: daysAgo(7), to: daysAgo(0) };
  const teamOf = async (reader: ReturnType<typeof request.agent>, range: { from: string; to: string } = week) =>
    (await reader.get("/api/time-entries/team").query(range).expect(200)).body as TeamTimeEntries;

  it("shows an Owner and an Admin everybody's time, and whose each entry is", async () => {
    const { join, owner } = await workspace();
    const carlos = await join("member", "carlos@asphaltco.com", "Carlos Ramirez");
    const priya = await join("member", "priya@asphaltco.com", "Priya Shah");
    const admin = await join("admin", "admin@asphaltco.com", "Jordan Lee");
    const hers = (
      await priya
        .post("/api/time-entries")
        .send(shift({ date: daysAgo(2) }))
        .expect(201)
    ).body as TimeEntry;
    const his = (await carlos.post("/api/time-entries").send(shift()).expect(201)).body as TimeEntry;

    for (const reader of [owner, admin]) {
      const team = await teamOf(reader);
      // the latest day first, whoever it belongs to
      expect(team.entries.map((entry) => entry.id)).toEqual([his.id, hers.id]);
      const whose = (entry: TimeEntry) => team.people.find((person) => person.id === entry.userId);
      expect(team.entries.map((entry) => whose(entry)?.name)).toEqual(["Carlos Ramirez", "Priya Shah"]);
      expect(whose(his)?.permission).toBe("member");
      // everyone with a login is listed, time or not, so the view can say who has put none in
      expect(team.people.map((person) => person.name).sort()).toEqual(["Carlos Ramirez", "Dana Brooks", "Jordan Lee", "Priya Shah"]);
    }
  });

  it("is not a Member's to read, and needs a session", async () => {
    const { app, join } = await workspace();
    const member = await join("member");
    await member.post("/api/time-entries").send(shift()).expect(201);

    const refused = await member.get("/api/time-entries/team").query(week).expect(403);
    expect(refused.body.entries).toBeUndefined();
    await request(app).get("/api/time-entries/team").query(week).expect(401);

    expect(ROUTE_POLICY["GET /api/time-entries/team"]).toBe("timecard.approve");
    expect(can("member", "timecard.approve")).toBe(false);
    expect(can("admin", "timecard.approve")).toBe(true);
    expect(can("owner", "timecard.approve")).toBe(true);
  });

  it("keeps to the days asked for, and to its own workspace", async () => {
    const { app, join, owner } = await workspace();
    const member = await join("member");
    await member
      .post("/api/time-entries")
      .send(shift({ date: daysAgo(1) }))
      .expect(201);
    await member
      .post("/api/time-entries")
      .send(shift({ date: daysAgo(12) }))
      .expect(201);
    // another company on the same server, with time of its own on the same day
    const other = request.agent(app);
    await other
      .post("/api/auth/signup")
      .send({ email: "sam@concreteco.com", password: "Rebar-Chair-2026", name: "Sam Ortiz", orgName: "Concrete Co", acceptTerms: true })
      .expect(201);
    await other
      .post("/api/time-entries")
      .send(shift({ date: daysAgo(1), clockIn: "06:00" }))
      .expect(201);

    const ours = await teamOf(owner);
    expect(ours.entries.map((entry) => entry.date)).toEqual([daysAgo(1)]);
    expect(ours.entries[0].clockIn).toBe("07:00");
    expect(ours.people.map((person) => person.name)).not.toContain("Sam Ortiz");
    const theirs = await teamOf(other);
    expect(theirs.entries.map((entry) => entry.clockIn)).toEqual(["06:00"]);
    expect(theirs.people.map((person) => person.name)).toEqual(["Sam Ortiz"]);
    // a wider range reaches the older day
    const fortnight = await teamOf(owner, { from: daysAgo(14), to: daysAgo(0) });
    expect(fortnight.entries.map((entry) => entry.date)).toEqual([daysAgo(1), daysAgo(12)]);
  });

  it("still names someone removed since, while their time is in the range", async () => {
    const { join, owner } = await workspace();
    const member = await join("member", "carlos@asphaltco.com", "Carlos Ramirez");
    const theirs = (await member.post("/api/time-entries").send(shift()).expect(201)).body as TimeEntry;
    expect(theirs.userId).not.toBe("");
    await owner.delete(`/api/team/users/${theirs.userId}`).expect(200);

    const team = await teamOf(owner);
    expect(team.entries.map((entry) => entry.id)).toEqual([theirs.id]);
    const person = team.people.find((item) => item.id === theirs.userId);
    expect(person).toMatchObject({ name: "Carlos Ramirez", permission: null });
    expect(person?.removedAt).toBeTruthy();
    // a range without their time does not list them: they no longer work here
    const january = await teamOf(owner, { from: "2026-01-05", to: "2026-01-11" });
    expect(january.people.map((item) => item.id)).not.toContain(theirs.userId);
  });

  it("refuses a range it cannot read, and says which end is wrong", async () => {
    const { owner } = await workspace();
    const refused = async (query: Record<string, string>, field: "from" | "to") => {
      const res = await owner.get("/api/time-entries/team").query(query).expect(400);
      expect(res.body.field, JSON.stringify(query)).toBe(field);
      expect(typeof res.body.error).toBe("string");
    };
    await refused({ to: "2026-01-11" }, "from");
    await refused({ from: "2026-01-05" }, "to");
    await refused({ from: "2026-02-30", to: "2026-03-06" }, "from");
    await refused({ from: "2026-01-05", to: "Sunday" }, "to");
    await refused({ from: "2026-01-11", to: "2026-01-05" }, "to");
    // 92 days, both ends counted, is the most it reads at once
    await refused({ from: "2026-01-01", to: "2026-04-03" }, "to");
    await teamOf(owner, { from: "2026-01-01", to: "2026-04-02" });
  });
});

describe("approving a person's time", () => {
  const week = { from: daysAgo(7), to: daysAgo(0) };

  it("approves exactly the entries the approver was shown, as that approver, and keeps them approved", async () => {
    const { dataFile, join } = await workspace();
    const member = await join("member", "carlos@asphaltco.com", "Carlos Ramirez");
    const admin = await join("admin", "jordan@asphaltco.com", "Jordan Lee");
    const morning = (
      await member
        .post("/api/time-entries")
        .send(shift({ clockIn: "06:30", clockOut: "11:00", breakMinutes: 0 }))
        .expect(201)
    ).body as TimeEntry;
    expect(morning).toMatchObject({ status: "Submitted", approvedBy: null, approvedAt: null });
    const shown = (await admin.get("/api/time-entries/team").query(week).expect(200)).body as TeamTimeEntries;
    // put in after the admin looked: not theirs to approve unseen
    const later = (
      await member
        .post("/api/time-entries")
        .send(shift({ clockIn: "11:30", clockOut: "17:00", breakMinutes: 0 }))
        .expect(201)
    ).body as TimeEntry;

    const approved = await admin
      .post("/api/time-entries/approve")
      .send({ ids: shown.entries.map((entry) => entry.id) })
      .expect(200);
    const jordan = shown.people.find((person) => person.name === "Jordan Lee")!;
    expect(approved.body.entries).toHaveLength(1);
    expect(approved.body.entries[0]).toMatchObject({ id: morning.id, status: "Approved", approvedBy: jordan.accountId });
    expect(Date.parse(approved.body.entries[0].approvedAt)).not.toBeNaN();

    // the person sees it, and the stretch put in later is still waiting
    const theirs = (await member.get("/api/time-entries").expect(200)).body.entries as TimeEntry[];
    expect(Object.fromEntries(theirs.map((entry) => [entry.id, entry.status]))).toEqual({
      [morning.id]: "Approved",
      [later.id]: "Submitted"
    });

    // approving again changes nothing about the first approval
    const again = await admin
      .post("/api/time-entries/approve")
      .send({ ids: [morning.id] })
      .expect(200);
    expect(again.body.entries[0].approvedAt).toBe(approved.body.entries[0].approvedAt);

    // and it is saved with the workspace
    const restarted = await createApp({ dataFile, reset: false });
    const cookie = (await member.get("/api/auth/me")).request.cookies;
    const kept = (await request(restarted).get("/api/time-entries").set("Cookie", cookie).expect(200)).body.entries as TimeEntry[];
    expect(kept.find((entry) => entry.id === morning.id)).toMatchObject({ status: "Approved", approvedBy: jordan.accountId });
  });

  it("keeps approved time from being taken out, until an approval is reopened", async () => {
    const { join, owner } = await workspace();
    const member = await join("member");
    const theirs = (await member.post("/api/time-entries").send(shift()).expect(201)).body as TimeEntry;
    await owner
      .post("/api/time-entries/approve")
      .send({ ids: [theirs.id] })
      .expect(200);

    const refused = await member.delete(`/api/time-entries/${theirs.id}`).expect(409);
    expect(refused.body.error).toMatch(/approved/);
    expect((await member.get("/api/time-entries").expect(200)).body.entries).toHaveLength(1);

    const reopened = await owner
      .post("/api/time-entries/reopen")
      .send({ ids: [theirs.id] })
      .expect(200);
    expect(reopened.body.entries[0]).toMatchObject({ status: "Submitted", approvedBy: null, approvedAt: null });
    await member.delete(`/api/time-entries/${theirs.id}`).expect(204);
  });

  it("is not a Member's to do, not even to their own time", async () => {
    const { app, join } = await workspace();
    const member = await join("member");
    const theirs = (await member.post("/api/time-entries").send(shift()).expect(201)).body as TimeEntry;

    await member
      .post("/api/time-entries/approve")
      .send({ ids: [theirs.id] })
      .expect(403);
    await member
      .post("/api/time-entries/reopen")
      .send({ ids: [theirs.id] })
      .expect(403);
    await request(app)
      .post("/api/time-entries/approve")
      .send({ ids: [theirs.id] })
      .expect(401);
    expect((await member.get("/api/time-entries").expect(200)).body.entries[0].status).toBe("Submitted");

    expect(ROUTE_POLICY["POST /api/time-entries/approve"]).toBe("timecard.approve");
    expect(ROUTE_POLICY["POST /api/time-entries/reopen"]).toBe("timecard.approve");
  });

  it("refuses a list it cannot read, and answers for time that is not there", async () => {
    const { app, join, owner } = await workspace();
    const member = await join("member");
    const theirs = (await member.post("/api/time-entries").send(shift()).expect(201)).body as TimeEntry;

    for (const body of [{}, { ids: [] }, { ids: "all" }, { ids: [""] }]) {
      const res = await owner.post("/api/time-entries/approve").send(body).expect(400);
      expect(res.body.field, JSON.stringify(body)).toBe("ids");
      expect(typeof res.body.error).toBe("string");
    }
    await owner
      .post("/api/time-entries/approve")
      .send({ ids: ["te-not-here"] })
      .expect(404);

    // another company's Owner cannot reach this workspace's time by its id
    const other = request.agent(app);
    await other
      .post("/api/auth/signup")
      .send({ email: "sam@concreteco.com", password: "Rebar-Chair-2026", name: "Sam Ortiz", orgName: "Concrete Co", acceptTerms: true })
      .expect(201);
    await other
      .post("/api/time-entries/approve")
      .send({ ids: [theirs.id] })
      .expect(404);
    expect((await member.get("/api/time-entries").expect(200)).body.entries[0].status).toBe("Submitted");
  });
});
