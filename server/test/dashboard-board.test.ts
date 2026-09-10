import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

/**
 * The Dashboard's account-side pieces: the board a person arranges follows
 * their login, and the status endpoint keeps the weekly readings the
 * Performance tiles trend on.
 */
async function demoAgent() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-board-"));
  const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
  const agent = request.agent(app);
  await agent.post("/api/auth/demo").expect(200);
  return agent;
}

describe("Dashboard board on the account", () => {
  it("keeps a person's board layout on their account and brings it down with bootstrap", async () => {
    const agent = await demoAgent();
    // a dozen panels with a hidden one — well past the old 2,000-character ceiling for a setting
    const board = JSON.stringify({
      items: Array.from({ length: 24 }, (_, index) => ({ id: `panel-${index}`, x: index % 6, y: index * 4, w: 3, h: 6 })),
      hidden: ["weather"]
    });
    expect(board.length).toBeGreaterThan(1000);

    const saved = await agent.put("/api/me/settings/dash:layout").send({ value: board }).expect(200);
    expect(saved.body).toEqual({ ok: true, key: "dash:layout", value: board });

    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.userSettings["dash:layout"]).toBe(board);

    // a cleared board is an empty value, not a missing setting call
    await agent.put("/api/me/settings/dash:layout").send({ value: "" }).expect(200);
    const cleared = await agent.get("/api/bootstrap").expect(200);
    expect(cleared.body.userSettings["dash:layout"]).toBe("");
  });

  it("returns the weekly readings the Performance tiles trend on, this week's included", async () => {
    const agent = await demoAgent();
    const response = await agent.get("/api/schedule/status").expect(200);
    const { weekOf, history } = response.body as {
      weekOf: string;
      history: Array<{
        weekOf: string;
        daysAhead: number;
        percentComplete: number;
        onTrackProjects: number | null;
        projects: number | null;
        crewUtilization: number | null;
      }>;
    };
    expect(Array.isArray(history)).toBe(true);
    const thisWeek = history[history.length - 1];
    expect(thisWeek.weekOf).toBe(weekOf);
    // measured from the seed the same way the Dashboard measures them
    const bootstrap = await agent.get("/api/bootstrap").expect(200);
    const projects = bootstrap.body.projects as Array<{ scheduleHealth: string }>;
    const crews = bootstrap.body.crews as Array<{ utilization: number }>;
    expect(thisWeek.projects).toBe(projects.length);
    expect(thisWeek.onTrackProjects).toBe(projects.filter((p) => p.scheduleHealth === "On Track" || p.scheduleHealth === "Complete").length);
    expect(thisWeek.crewUtilization).toBe(Math.round(crews.reduce((sum, crew) => sum + crew.utilization, 0) / crews.length));
    // a second request in the same week keeps the first reading
    const again = await agent.get("/api/schedule/status").expect(200);
    expect(again.body.history).toEqual(history);
  });
});
