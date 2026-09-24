/**
 * Transactional writes: a re-book is one request that fully happens or doesn't, its job
 * step carries the drawer's other changes, and the store's multi-row writes land whole —
 * the file written once, after the commit, and not at all when the commit changed nothing.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { BuildFlowStore } from "../src/database.js";

const tempDir = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const shift = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
type Booking = { id: string; jobId: string; date: string; status: string };
type JobRow = { id: string; startDate: string; endDate: string; status: string; notes?: string };

async function testApp() {
  const app = await createApp({ dataFile: path.join(tempDir("buildflow-tx-"), "test.sqlite"), reset: true });
  const agent = request.agent(app);
  await agent.post("/api/auth/demo").expect(200);
  return agent;
}

describe("transactional writes", () => {
  it("runs a re-book's job step with its other changes in the one request, and a bad step undoes the whole batch", async () => {
    const agent = await testApp();
    const before = (await agent.get("/api/bootstrap").expect(200)).body as { assignments: Booking[]; jobs: JobRow[] };
    const booking = before.assignments.find((a) => a.jobId === "j-riverside-concrete")!;
    const job = before.jobs.find((j) => j.id === "j-riverside-concrete")!;

    const moved = await agent
      .post("/api/schedule/rebook")
      .send({
        moves: [
          {
            op: "job",
            id: job.id,
            startDate: shift(job.startDate, 30),
            endDate: shift(job.endDate, 30),
            status: "On Site",
            notes: "Pour after the inspection"
          },
          { op: "move", id: booking.id, date: shift(booking.date, 30) }
        ]
      })
      .expect(200);
    expect(moved.body.jobs[0]).toMatchObject({
      id: job.id,
      startDate: shift(job.startDate, 30),
      status: "On Site",
      notes: "Pour after the inspection"
    });
    // the booking moved with it and wears the new status
    expect(moved.body.assignments[0]).toMatchObject({ id: booking.id, date: shift(booking.date, 30), status: "On Site" });

    // a step the batch cannot apply → nothing in it lands, the job step included
    await agent
      .post("/api/schedule/rebook")
      .send({
        moves: [
          { op: "job", id: job.id, startDate: job.startDate, endDate: job.endDate, status: "Planned" },
          { op: "move", id: "as-nope", date: job.startDate }
        ]
      })
      .expect(404);
    const after = (await agent.get("/api/bootstrap").expect(200)).body as { assignments: Booking[]; jobs: JobRow[] };
    expect(after.jobs.find((j) => j.id === job.id)).toMatchObject({ startDate: shift(job.startDate, 30), status: "On Site" });
    expect(after.assignments.find((a) => a.id === booking.id)).toMatchObject({ date: shift(booking.date, 30), status: "On Site" });
  });

  it("leaves a crew whole when its update fails half-way through", async () => {
    const store = await BuildFlowStore.create(path.join(tempDir("buildflow-crew-"), "store.sqlite"), true);
    const crew = store.crews()[0];
    const before = { name: crew.name, size: crew.size, mix: JSON.stringify(crew.laborMix) };

    // The update deletes the crew's role counts and re-inserts them. A count that cannot be
    // bound throws between the two, which outside a transaction left the crew with none at all.
    expect(() =>
      store.updateCrew(crew.id, {
        name: "Renamed mid-flight",
        specialty: crew.specialty,
        foreman: "Ana Lopez",
        laborMix: [{ category: "Labor", role: "Laborers", count: {} as unknown as number }]
      })
    ).toThrow();

    const after = store.crews().find((row) => row.id === crew.id)!;
    expect({ name: after.name, size: after.size, mix: JSON.stringify(after.laborMix) }).toEqual(before);
  });

  it("does not rewrite the database for a patch that changes nothing", async () => {
    const agent = await testApp();
    const boot = await agent.get("/api/bootstrap").expect(200);
    const job = boot.body.jobs[0] as JobRow;

    // save() publishes by renaming a temp file over the data file, so the rename is the
    // moment the database is rewritten — and counting it is what counting writeFileSync
    // used to be, before the write was made atomic.
    const writes = vi.spyOn(fs, "renameSync");
    try {
      // A patch carrying no writable column is a no-op, and a no-op is not worth exporting the
      // whole SQLite image and writing it to disk.
      await agent.patch(`/api/jobs/${job.id}`).send({}).expect(200);
      expect(writes).not.toHaveBeenCalled();

      await agent.patch(`/api/jobs/${job.id}`).send({ notes: "a real change" }).expect(200);
      expect(writes).toHaveBeenCalledTimes(1);
    } finally {
      writes.mockRestore();
    }
  });

  it("rolls a failing transaction back, lets a nested call join, and writes the file once after the commit", async () => {
    const store = await BuildFlowStore.create(path.join(tempDir("buildflow-store-"), "store.sqlite"), true);
    const crews = store.crews().length;
    const crew = (name: string) => ({ name, specialty: "Concrete", foreman: "Ana Lopez", laborMix: [] });

    expect(() =>
      store.transaction(() => {
        store.createCrew(crew("Half a crew"));
        throw new Error("boom");
      })
    ).toThrow("boom");
    expect(store.crews()).toHaveLength(crews);

    const writes = vi.spyOn(fs, "renameSync"); // the atomic publish; one per save
    try {
      store.transaction(() => {
        store.createCrew(crew("Crew inside")); // createCrew saves on its own; inside a transaction that waits for the commit
        store.transaction(() => store.createCrew(crew("Crew nested")));
      });
      expect(store.crews()).toHaveLength(crews + 2);
      expect(writes).toHaveBeenCalledTimes(1);
    } finally {
      writes.mockRestore();
    }
  });

  it("does not rewrite the file for a transaction that changed no row, and does for one only SQLite saw", async () => {
    const store = await BuildFlowStore.create(path.join(tempDir("buildflow-quiet-"), "store.sqlite"), true);
    const crew = store.crews()[0];

    const writes = vi.spyOn(fs, "renameSync"); // the atomic publish; one per save
    try {
      // Reads, and an update that matches nothing: the file would come out exactly as it went in.
      store.transaction(() => {
        store.crews();
        store.run("UPDATE crews SET name = ? WHERE id = ?", ["Nobody", "crew-that-is-not-there"]);
      });
      expect(writes).not.toHaveBeenCalled();

      // run() never saves or flags anything on its own, so only the commit can notice this change.
      store.transaction(() => store.run("UPDATE crews SET name = ? WHERE id = ?", ["Renamed at the commit", crew.id]));
      expect(writes).toHaveBeenCalledTimes(1);
    } finally {
      writes.mockRestore();
    }

    // and the change is in the file, not only in memory
    const reopened = await BuildFlowStore.create(store.dataFilePath, false, { seedDemo: false });
    expect(reopened.crews().find((row) => row.id === crew.id)?.name).toBe("Renamed at the commit");
  });
});
