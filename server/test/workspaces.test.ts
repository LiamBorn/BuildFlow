import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

/* One login, several workspaces (2026-09-15): the original plus up to three created beside it,
   each its own org with its own data, trade, team and a 7-day trial; the session's org is the
   active one. */
async function freshApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-workspaces-"));
  return createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
}
const OWNER = { email: "dana@asphaltco.com", password: "Roller-Tack-2026", name: "Dana Brooks", orgName: "Asphalt Co", acceptTerms: true };
type Summary = {
  id: string;
  kind: string;
  active: boolean;
  title: string;
  name: string;
  trialEndsAt: string | null;
  onboardingCompletedAt: string | null;
};

describe("workspaces", () => {
  it("lets one login create up to three workspaces beside its first, each on a 7-day trial and called by its trade", async () => {
    const app = await freshApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send(OWNER).expect(201);
    await agent.post("/api/business-profile").send({ businessType: "Asphalt" }).expect(200);

    // the first workspace: home, active, called by its trade, no trial clock of its own
    const first = await agent.get("/api/workspaces").expect(200);
    expect(first.body.workspaces).toHaveLength(1);
    expect(first.body.workspaces[0]).toMatchObject({ kind: "home", active: true, title: "Asphalt", name: "Asphalt Co", trialEndsAt: null });
    expect(first.body).toMatchObject({ limit: 3, remaining: 3 });
    const homeId: string = first.body.workspaces[0].id;

    // creating one switches to it: onboarding still to do there, the trial clock already running
    const created = await agent.post("/api/workspaces").send({}).expect(201);
    expect(created.body.activeId).not.toBe(homeId);
    expect(created.body.remaining).toBe(2);
    expect(created.body.session.org.id).toBe(created.body.activeId);
    const extra = (created.body.workspaces as Summary[]).find((w) => w.kind === "extra")!;
    expect(extra).toMatchObject({ active: true, name: "Asphalt Co", onboardingCompletedAt: null });
    const boot = await agent.get("/api/bootstrap").expect(200);
    expect(boot.body.onboardingCompletedAt).toBeNull();
    expect(boot.body.workspaceTrial).toBe(true);
    expect(boot.body.billingStatus).toBe("trial");
    const daysLeft = (new Date(boot.body.trialEndsAt).getTime() - Date.now()) / 86_400_000;
    expect(daysLeft).toBeGreaterThan(6.9);
    expect(daysLeft).toBeLessThanOrEqual(7);

    // the same questions again: the trade names it, and picking Free does not end the trial
    await agent
      .post("/api/business-profile")
      .send({ businessType: "Roofing", selectedPlan: "free", selectedProducts: [], seats: 3 })
      .expect(200);
    const named = await agent.get("/api/workspaces").expect(200);
    expect((named.body.workspaces as Summary[]).find((w) => w.id === extra.id)).toMatchObject({
      title: "Roofing",
      businessType: "Roofing",
      trialEndsAt: expect.any(String),
      onboardingCompletedAt: expect.any(String)
    });
    expect((await agent.get("/api/bootstrap").expect(200)).body.billingStatus).toBe("trial");
    // the owner is a person in the new workspace, at their level
    const me = await agent.get("/api/auth/me").expect(200);
    const team = await agent.get("/api/team").expect(200);
    // the level rides on the roster row it belongs to, not in a map beside it
    expect(team.body.users.find((user: { accountId?: string }) => user.accountId === me.body.account.id).permission).toBe("owner");
    expect(team.body.users.some((user: { accountId?: string }) => user.accountId === me.body.account.id)).toBe(true);

    // two more are allowed, a fourth is not
    await agent.post("/api/workspaces").send({}).expect(201);
    const third = await agent.post("/api/workspaces").send({}).expect(201);
    expect(third.body.remaining).toBe(0);
    const refused = await agent.post("/api/workspaces").send({}).expect(409);
    expect(refused.body.code).toBe("workspace_limit");
    expect((await agent.get("/api/workspaces").expect(200)).body.workspaces).toHaveLength(4);

    // switching back lands on the first workspace's own data
    const back = await agent.post(`/api/workspaces/${homeId}/switch`).send({}).expect(200);
    expect(back.body.activeId).toBe(homeId);
    expect(back.body.session.org.id).toBe(homeId);
    expect((back.body.workspaces as Summary[]).filter((w) => w.active).map((w) => w.id)).toEqual([homeId]);
    const home = await agent.get("/api/bootstrap").expect(200);
    expect(home.body.businessType).toBe("Asphalt");
    expect(home.body.workspaceTrial).toBe(false);
    // and only to a workspace that is theirs
    await agent.post("/api/workspaces/org-not-mine/switch").send({}).expect(404);
  });

  it("keeps a workspace to the login that made it", async () => {
    const app = await freshApp();
    const dana = request.agent(app);
    await dana.post("/api/auth/signup").send(OWNER).expect(201);
    const created = await dana.post("/api/workspaces").send({}).expect(201);
    const extraId: string = created.body.activeId;

    const sam = request.agent(app);
    await sam
      .post("/api/auth/signup")
      .send({ ...OWNER, email: "sam@concrete.test", orgName: "Sam Concrete" })
      .expect(201);
    const mine = await sam.get("/api/workspaces").expect(200);
    expect(mine.body.workspaces).toHaveLength(1);
    expect(mine.body.workspaces[0].name).toBe("Sam Concrete");
    const refused = await sam.post(`/api/workspaces/${extraId}/switch`).send({}).expect(404);
    expect(refused.body.code).toBe("not_member");
  });

  it("lets the shared demo create workspaces too, and a fresh demo starts with just its own", async () => {
    const app = await freshApp();
    await request(app).get("/api/workspaces").expect(401);
    await request(app).post("/api/workspaces").send({}).expect(401);
    const demo = request.agent(app);
    await demo.post("/api/auth/demo").expect(200);
    expect((await demo.get("/api/workspaces").expect(200)).body.workspaces).toHaveLength(1);
    // the seeded demo workspace counts as set up, so switching back to it lands on the Dashboard
    expect((await demo.get("/api/bootstrap").expect(200)).body.onboardingCompletedAt).toBeTruthy();

    // a visitor creates one and sets it up
    const created = await demo.post("/api/workspaces").send({}).expect(201);
    const extraId: string = created.body.activeId;
    await demo
      .post("/api/business-profile")
      .send({ businessType: "Roofing", selectedPlan: "free", selectedProducts: [], seats: 3 })
      .expect(200);
    const two = await demo.get("/api/workspaces").expect(200);
    expect(two.body.workspaces).toHaveLength(2);
    expect((two.body.workspaces as Summary[]).find((w) => w.id === extraId)).toMatchObject({ title: "Roofing", kind: "extra" });

    // back to the demo workspace: set up, so the Dashboard, not onboarding
    const homeId: string = (two.body.workspaces as Summary[]).find((w) => w.kind === "home")!.id;
    await demo.post(`/api/workspaces/${homeId}/switch`).send({}).expect(200);
    expect((await demo.get("/api/bootstrap").expect(200)).body.onboardingCompletedAt).toBeTruthy();

    // the next "Preview the live demo" starts clean: the visitor's workspace is gone, files and all
    await demo.post("/api/auth/demo").expect(200);
    const fresh = await demo.get("/api/workspaces").expect(200);
    expect(fresh.body.workspaces).toHaveLength(1);
    expect(fresh.body.workspaces[0].kind).toBe("home");
    expect(fresh.body.remaining).toBe(3);
    await demo.post(`/api/workspaces/${extraId}/switch`).send({}).expect(404);
    // and the demo's own data is untouched
    expect((await demo.get("/api/bootstrap").expect(200)).body.projects.length).toBeGreaterThan(0);
  });
});
