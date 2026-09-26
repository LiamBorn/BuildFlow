/**
 * The meeting clock the Meetings panel and the Mac share. The full behaviour is pinned by the
 * client's calendarModel.test.ts (which now runs through these) and by client/src/tests/parity;
 * this covers what the server adds: a reader's date for all-day entries.
 */
import { describe, expect, it } from "vitest";
import { meetingState, upNext } from "./meetings";

const local = (day: number, hour = 0, minute = 0) => new Date(2026, 8, day, hour, minute);
const timed = (id: string, day: number, hour: number, minutes = 60) => ({
  id,
  startsAt: local(day, hour).toISOString(),
  endsAt: new Date(local(day, hour).getTime() + minutes * 60_000).toISOString(),
  allDay: false
});

describe("the meeting clock", () => {
  it("counts the last fifteen minutes as soon", () => {
    const standup = timed("standup", 26, 9, 15);
    expect(meetingState(standup, local(26, 8, 44).getTime())).toBe("later");
    expect(meetingState(standup, local(26, 8, 45).getTime())).toBe("soon");
    expect(meetingState(standup, local(26, 9, 5).getTime())).toBe("now");
    expect(meetingState(standup, local(26, 9, 15).getTime())).toBe("past");
  });

  it("reads an all-day entry by the reader's date when it is given", () => {
    const offsite = { id: "offsite", startsAt: "2026-09-27", endsAt: "2026-09-28", allDay: true };
    const now = local(26, 23).getTime();
    expect(meetingState(offsite, now)).toBe("later");
    // the reader is already on the 27th where they are
    expect(meetingState(offsite, now, "2026-09-27")).toBe("now");
    expect(meetingState(offsite, now, "2026-09-28")).toBe("past");
  });

  it("lists what is still to come this week, declined ones left out, all-day after timed", () => {
    const events = [
      { ...timed("later", 28, 9), myResponse: "accepted" },
      { ...timed("declined", 26, 10), myResponse: "declined" },
      { ...timed("next", 26, 13), myResponse: "organizer" },
      { id: "holiday", startsAt: "2026-09-26", endsAt: "2026-09-27", allDay: true, myResponse: "organizer" },
      { ...timed("far", 26 + 8, 9), myResponse: "accepted" }
    ];
    expect(upNext(events, local(26, 12).getTime()).map((event) => event.id)).toEqual(["next", "later", "holiday"]);
    expect(upNext(events, local(26, 12).getTime(), 1).map((event) => event.id)).toEqual(["next"]);
  });
});
