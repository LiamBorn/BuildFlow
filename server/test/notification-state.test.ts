/**
 * Seen and read notifications, kept on the server per person (2026-09-26, notch step 3) so the
 * website's bell and the Mac's notch agree. Stored through the existing per-person settings route,
 * which MERGES this one key against the server's own list instead of replacing it.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_STATE_SETTING,
  buildNotificationItems,
  decodeNotificationState,
  emptyNotificationState,
  encodeNotificationState,
  isNotificationRead,
  isNotificationSeen,
  markNotifications,
  notificationKey,
  type BootstrapPayload
} from "@buildflow/shared";
import { createApp } from "../src/app.js";

const SETTING = `/api/me/settings/${encodeURIComponent(NOTIFICATION_STATE_SETTING)}`;

async function demoAgent() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildflow-read-state-"));
  const app = await createApp({ dataFile: path.join(dir, "test.sqlite"), reset: true });
  const agent = request.agent(app);
  await agent.post("/api/auth/demo").expect(200);
  const data = (await agent.get("/api/bootstrap").expect(200)).body as BootstrapPayload;
  return { agent, data };
}

describe("notification read state on the server", () => {
  it("round-trips: what the website marks comes down with the next bootstrap", async () => {
    const { agent, data } = await demoAgent();
    const items = buildNotificationItems(data);
    expect(items.length).toBeGreaterThan(5);
    expect(data.userSettings?.[NOTIFICATION_STATE_SETTING]).toBeUndefined();

    let marked = markNotifications(emptyNotificationState(), [items[0].id, items[1].id], "seen");
    marked = markNotifications(marked, [items[0].id], "read");
    const saved = await agent
      .put(SETTING)
      .send({ value: encodeNotificationState(marked, items) })
      .expect(200);
    expect(saved.body.key).toBe(NOTIFICATION_STATE_SETTING);

    const again = (await agent.get("/api/bootstrap").expect(200)).body as BootstrapPayload;
    expect(again.userSettings?.[NOTIFICATION_STATE_SETTING]).toBe(saved.body.value);
    const back = decodeNotificationState(again.userSettings?.[NOTIFICATION_STATE_SETTING]);
    expect(isNotificationRead(back, items[0])).toBe(true);
    expect(isNotificationSeen(back, items[1])).toBe(true);
    expect(isNotificationRead(back, items[1])).toBe(false);
    expect(isNotificationSeen(back, items[2])).toBe(false);
  });

  it("merges each side's marks rather than letting the last write win", async () => {
    const { agent, data } = await demoAgent();
    const items = buildNotificationItems(data);
    const [a, b, c] = items;
    // the website saw two and read one...
    const website = markNotifications(markNotifications(emptyNotificationState(), [a.id, b.id], "seen"), [a.id], "read");
    await agent
      .put(SETTING)
      .send({ value: encodeNotificationState(website, items) })
      .expect(200);
    // ...and the Mac, which never heard of that, read a third
    const mac = markNotifications(emptyNotificationState(), [c.id], "read");
    const merged = decodeNotificationState(
      (
        await agent
          .put(SETTING)
          .send({ value: encodeNotificationState(mac, items) })
          .expect(200)
      ).body.value
    );

    expect(isNotificationRead(merged, a)).toBe(true);
    expect(isNotificationSeen(merged, b)).toBe(true);
    expect(isNotificationRead(merged, c)).toBe(true);
    // nothing is ever marked unread by a write that does not mention it
    const empty = decodeNotificationState((await agent.put(SETTING).send({ value: "" }).expect(200)).body.value);
    expect(isNotificationRead(empty, a)).toBe(true);
  });

  it("keeps only notifications the workspace still lists", async () => {
    const { agent, data } = await demoAgent();
    const items = buildNotificationItems(data);
    const marked = markNotifications(emptyNotificationState(), [items[0].id, "delayIQ-long-gone"], "read");
    // sent without a list, so the stale id travels
    const saved = decodeNotificationState(
      (
        await agent
          .put(SETTING)
          .send({ value: encodeNotificationState(marked) })
          .expect(200)
      ).body.value
    );
    expect(saved.seen.has(notificationKey(items[0].id))).toBe(true);
    expect(saved.seen.has(notificationKey("delayIQ-long-gone"))).toBe(false);
  });

  it("still takes any other setting as it always did, replaced whole", async () => {
    const { agent } = await demoAgent();
    await agent
      .put("/api/me/settings/tutorial:seen")
      .send({ value: "started" })
      .expect(200, { ok: true, key: "tutorial:seen", value: "started" });
    await agent
      .put("/api/me/settings/tutorial:seen")
      .send({ value: "completed" })
      .expect(200, { ok: true, key: "tutorial:seen", value: "completed" });
  });
});
