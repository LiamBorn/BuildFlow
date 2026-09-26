/** Seen and read, kept on the server in 8,000 characters, merged so the bell and the Mac agree. */
import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_STATE_BUDGET,
  decodeNotificationState,
  emptyNotificationState,
  encodeNotificationState,
  isNotificationRead,
  isNotificationSeen,
  markNotifications,
  mergeNotificationStateValues,
  mergeNotificationStates,
  notificationKey,
  unseenNotificationCount,
  type NotificationStamp
} from "./notificationState";

const item = (id: string, timestamp = "2026-09-26T12:00:00.000Z"): NotificationStamp => ({ id, timestamp });
const list = (count: number, prefix = "assignment-a") =>
  Array.from({ length: count }, (_, index) => item(`${prefix}${index}`, new Date(Date.UTC(2026, 0, 1) + index * 3_600_000).toISOString()));

describe("notification read state", () => {
  it("keys an id the same way every time, in five characters", () => {
    expect(notificationKey("delayIQ-d12")).toBe(notificationKey("delayIQ-d12"));
    expect(notificationKey("delayIQ-d12")).toMatch(/^[A-Za-z0-9_-]{5}$/);
    expect(notificationKey("delayIQ-d12")).not.toBe(notificationKey("delayIQ-d13"));
    // no two of ten thousand real-looking ids collide
    const keys = new Set(list(10_000).map((entry) => notificationKey(entry.id)));
    expect(keys.size).toBe(10_000);
  });

  it("reads marking read as seeing too, and seeing as not reading", () => {
    let state = emptyNotificationState();
    state = markNotifications(state, ["a", "b"], "seen");
    state = markNotifications(state, ["c"], "read");
    expect(isNotificationSeen(state, item("a"))).toBe(true);
    expect(isNotificationRead(state, item("a"))).toBe(false);
    expect(isNotificationSeen(state, item("c"))).toBe(true);
    expect(isNotificationRead(state, item("c"))).toBe(true);
    expect(unseenNotificationCount(state, [item("a"), item("c"), item("d")])).toBe(1);
    // nothing new marked: the same object, so a caller can skip the write
    expect(markNotifications(state, ["a"], "seen")).toBe(state);
    expect(markNotifications(state, ["a"], "read")).not.toBe(state);
  });

  it("round-trips through the stored value", () => {
    let state = markNotifications(emptyNotificationState(), ["a", "b", "c", "d", "e", "f", "g"], "seen");
    state = markNotifications(state, ["b", "g"], "read");
    const items = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => item(id));
    const back = decodeNotificationState(encodeNotificationState(state, items));
    for (const entry of items) {
      expect(isNotificationSeen(back, entry), entry.id).toBe(entry.id !== "h");
      expect(isNotificationRead(back, entry), entry.id).toBe(entry.id === "b" || entry.id === "g");
    }
  });

  it("reads anything it cannot understand as nothing marked", () => {
    for (const value of [undefined, "", "not json", "[1,2]", '{"v":2,"s":"abcde"}', "null", 42]) {
      const state = decodeNotificationState(value);
      expect(state.seen.size).toBe(0);
      expect(state.through).toBeNull();
    }
  });

  it("merges, so neither side can undo what the other marked", () => {
    const website = markNotifications(emptyNotificationState(), ["a", "b"], "read");
    const mac = markNotifications(markNotifications(emptyNotificationState(), ["c"], "read"), ["d"], "seen");
    const both = mergeNotificationStates(website, mac);
    for (const id of ["a", "b", "c"]) expect(isNotificationRead(both, item(id))).toBe(true);
    expect(isNotificationSeen(both, item("d"))).toBe(true);
    expect(isNotificationRead(both, item("d"))).toBe(false);
  });

  it("stores the merge the server makes, against the server's own list", () => {
    const items = ["a", "b", "c"].map((id) => item(id));
    const stored = encodeNotificationState(markNotifications(emptyNotificationState(), ["a", "gone"], "read"));
    const incoming = encodeNotificationState(markNotifications(emptyNotificationState(), ["b"], "seen"), items);
    const merged = decodeNotificationState(mergeNotificationStateValues(stored, incoming, items));
    expect(isNotificationRead(merged, item("a"))).toBe(true);
    expect(isNotificationSeen(merged, item("b"))).toBe(true);
    expect(isNotificationSeen(merged, item("c"))).toBe(false);
    // something no longer listed is not carried
    expect(merged.seen.has(notificationKey("gone"))).toBe(false);
  });

  it("keeps everything when the list it is given is empty, which is a list not loaded yet", () => {
    const state = markNotifications(emptyNotificationState(), ["a", "b"], "read");
    const back = decodeNotificationState(encodeNotificationState(state, []));
    expect(isNotificationRead(back, item("a"))).toBe(true);
    expect(isNotificationRead(back, item("b"))).toBe(true);
  });

  it("fits in the settings route however long the list gets, folding only the oldest into a watermark", () => {
    const items = list(4_000);
    const state = markNotifications(
      emptyNotificationState(),
      items.map((entry) => entry.id),
      "read"
    );
    const value = encodeNotificationState(state, items);
    expect(value.length).toBeLessThanOrEqual(NOTIFICATION_STATE_BUDGET);
    const back = decodeNotificationState(value);
    // every one of the four thousand still reads as read: the oldest by the watermark, the rest by key
    expect(items.every((entry) => isNotificationRead(back, entry))).toBe(true);
    expect(back.through).not.toBeNull();
    expect(back.seen.size).toBeGreaterThan(1_000);
    // and something newer than all of them is still news
    expect(isNotificationSeen(back, item("new", "2027-01-01T00:00:00.000Z"))).toBe(false);
  });

  it("fits a thousand read notifications without any watermark at all", () => {
    const items = list(1_000);
    const value = encodeNotificationState(
      markNotifications(
        emptyNotificationState(),
        items.map((entry) => entry.id),
        "read"
      ),
      items
    );
    expect(value.length).toBeLessThanOrEqual(NOTIFICATION_STATE_BUDGET);
    expect(decodeNotificationState(value).through).toBeNull();
  });
});
