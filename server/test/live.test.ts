/**
 * The schedule's live feed: a tab that listens on /api/schedule/events hears what
 * another tab changed, with the ids, who did it and the tab id that did it.
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const servers: http.Server[] = [];
afterAll(() => {
  for (const server of servers) server.close();
});

async function listen(app: Parameters<typeof http.createServer>[1]) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  servers.push(server);
  const { port } = server.address() as { port: number };
  return `http://127.0.0.1:${port}`;
}

/** Opens the stream with the session cookie; frames arrive as the server writes them. */
function openStream(base: string, cookie: string) {
  return new Promise<{ frames: () => string[]; ready: Promise<void>; close: () => void }>((resolve, reject) => {
    const req = http.get(`${base}/api/schedule/events?client=watcher`, { headers: { cookie, accept: "text/event-stream" } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`stream answered ${res.statusCode}`));
        return;
      }
      const frames: string[] = [];
      let buffer = "";
      let sayHello = () => {};
      const ready = new Promise<void>((r) => {
        sayHello = r;
      });
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        buffer += chunk;
        let cut = buffer.indexOf("\n\n");
        while (cut >= 0) {
          const frame = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          frames.push(frame);
          if (frame.startsWith("event: hello")) sayHello();
          cut = buffer.indexOf("\n\n");
        }
      });
      resolve({ frames: () => frames, ready, close: () => req.destroy() });
    });
    req.on("error", reject);
  });
}

async function until(check: () => boolean, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end && !check()) await new Promise((r) => setTimeout(r, 20));
  return check();
}

describe("schedule live feed", () => {
  it("tells the org's other tabs what a drop changed, who did it and which tab it came from", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-live-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    const base = await listen(app);
    const login = await request(app).post("/api/auth/demo").expect(200);
    const cookie = (login.headers["set-cookie"] as unknown as string[]).map((c) => c.split(";")[0]).join("; ");

    const stream = await openStream(base, cookie);
    await stream.ready;

    const boot = (await request(app).get("/api/bootstrap").set("Cookie", cookie).expect(200)).body as {
      assignments: Array<{ id: string; crewId: string; jobId: string; date: string }>;
      crews: Array<{ id: string }>;
    };
    const booking = boot.assignments[0];
    const otherCrew = boot.crews.find((crew) => crew.id !== booking.crewId)!;
    await request(app)
      .post("/api/schedule/rebook")
      .set("Cookie", cookie)
      .set("X-BuildFlow-Client", "mover")
      .send({ moves: [{ op: "move", id: booking.id, crewId: otherCrew.id, date: booking.date.slice(0, 10) }], force: true })
      .expect(200);

    expect(await until(() => stream.frames().some((frame) => frame.startsWith("event: schedule")))).toBe(true);
    const frame = stream.frames().find((candidate) => candidate.startsWith("event: schedule"))!;
    const event = JSON.parse(frame.split("\ndata: ")[1]) as {
      kind: string;
      op: string;
      ids: string[];
      by: { name: string };
      client: string;
    };
    expect(event).toMatchObject({ kind: "assignments", op: "move", client: "mover" });
    expect(event.ids).toEqual(expect.arrayContaining([booking.id, booking.jobId]));
    expect(event.by.name.length).toBeGreaterThan(0);
    stream.close();
  });

  it("only streams to a signed-in tab", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-live-"));
    const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
    await request(app).get("/api/schedule/events").expect(401);
  });
});
