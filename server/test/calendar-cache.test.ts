/**
 * The five-minute calendar cache (2026-09-26, notch step 3). Before it, every read of the Meetings
 * panel went out to Google or Microsoft, and the Mac's inbox is about to ask every minute.
 */
import { describe, expect, it, vi } from "vitest";
import { CALENDAR_CACHE_MS, CalendarEventCache, type CalendarEvent } from "../src/calendar.js";

const FROM = new Date("2026-09-26T05:00:00.000Z");
const TO = new Date("2026-10-04T05:00:00.000Z");

const meeting = (id: string): CalendarEvent => ({
  id,
  provider: "google",
  title: id,
  startsAt: "2026-09-26T14:30:00.000Z",
  endsAt: "2026-09-26T15:00:00.000Z",
  allDay: false,
  location: "",
  joinUrl: "",
  attendees: [],
  organizer: "",
  guests: [],
  myResponse: "accepted",
  description: "",
  webUrl: "",
  conference: ""
});

function setup() {
  let now = Date.UTC(2026, 8, 26, 12);
  const cache = new CalendarEventCache(CALENDAR_CACHE_MS, () => now, 3);
  const load = vi.fn(async () => [meeting(`read-${load.mock.calls.length}`)]);
  return { cache, load, advance: (ms: number) => (now += ms) };
}

describe("the calendar cache", () => {
  it("asks the provider once in five minutes for the same person and range, then again", async () => {
    const { cache, load, advance } = setup();
    const first = await cache.read("acct-1", "google", FROM, TO, load);
    advance(CALENDAR_CACHE_MS - 1);
    expect(await cache.read("acct-1", "google", FROM, TO, load)).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);

    advance(1);
    const fresh = await cache.read("acct-1", "google", FROM, TO, load);
    expect(load).toHaveBeenCalledTimes(2);
    expect(fresh[0].id).toBe("read-2");
  });

  it("keeps each person, provider and range apart", async () => {
    const { cache, load } = setup();
    await cache.read("acct-1", "google", FROM, TO, load);
    await cache.read("acct-2", "google", FROM, TO, load);
    await cache.read("acct-1", "microsoft", FROM, TO, load);
    await cache.read("acct-1", "google", FROM, new Date(TO.getTime() + 1), load);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("does not keep a failure: the next read asks again", async () => {
    const { cache } = setup();
    const failing = vi.fn(async (): Promise<CalendarEvent[]> => {
      throw new Error("provider down");
    });
    await expect(cache.read("acct-1", "google", FROM, TO, failing)).rejects.toThrow("provider down");
    const working = vi.fn(async () => [meeting("back")]);
    expect((await cache.read("acct-1", "google", FROM, TO, working))[0].id).toBe("back");
    expect(working).toHaveBeenCalledTimes(1);
  });

  it("shares one provider call between reads that arrive together", async () => {
    const { cache, load } = setup();
    const [a, b] = await Promise.all([cache.read("acct-1", "google", FROM, TO, load), cache.read("acct-1", "google", FROM, TO, load)]);
    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("forgets a person's meetings when a calendar is connected or disconnected", async () => {
    const { cache, load } = setup();
    await cache.read("acct-1", "google", FROM, TO, load);
    await cache.read("acct-1", "microsoft", FROM, TO, load);
    await cache.read("acct-2", "google", FROM, TO, load);

    cache.clear("acct-1", "google");
    await cache.read("acct-1", "google", FROM, TO, load);
    await cache.read("acct-1", "microsoft", FROM, TO, load);
    await cache.read("acct-2", "google", FROM, TO, load);
    // only the cleared provider of the cleared person was asked again
    expect(load).toHaveBeenCalledTimes(4);

    cache.clear("acct-1");
    await cache.read("acct-1", "microsoft", FROM, TO, load);
    expect(load).toHaveBeenCalledTimes(5);
  });

  it("hands back, but does not keep, a read that a disconnect overtook", async () => {
    const { cache } = setup();
    let finish: (events: CalendarEvent[]) => void = () => undefined;
    const slow = vi.fn(() => new Promise<CalendarEvent[]>((resolve) => (finish = resolve)));
    const pending = cache.read("acct-1", "google", FROM, TO, slow);
    await Promise.resolve();
    cache.clear("acct-1", "google");
    finish([meeting("before-disconnect")]);
    expect((await pending)[0].id).toBe("before-disconnect");
    expect(cache.size).toBe(0);

    const after = vi.fn(async () => [meeting("after")]);
    expect((await cache.read("acct-1", "google", FROM, TO, after))[0].id).toBe("after");
  });

  it("holds a bounded number of ranges, dropping the oldest", async () => {
    const { cache, load } = setup();
    for (let day = 0; day < 5; day += 1) await cache.read("acct-1", "google", new Date(FROM.getTime() + day * 86_400_000), TO, load);
    expect(cache.size).toBe(3);
    // the newest is still kept; the first is gone
    await cache.read("acct-1", "google", new Date(FROM.getTime() + 4 * 86_400_000), TO, load);
    expect(load).toHaveBeenCalledTimes(5);
    await cache.read("acct-1", "google", FROM, TO, load);
    expect(load).toHaveBeenCalledTimes(6);
  });
});
