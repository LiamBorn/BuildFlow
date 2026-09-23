/**
 * The Meetings calendar's arithmetic: which days a view shows, the range one read covers, where a
 * meeting sits on the grid, and what the panel says about time.
 *
 * Every instant here is built in LOCAL time, because that is what the calendar lays out in: a
 * meeting at 9 AM sits at 9 AM for whoever is reading. Built that way, the suite holds in any time
 * zone the machine running it happens to be in.
 */
import { describe, expect, it } from "vitest";
import type { CalendarMeeting } from "../api";
import {
  addMonths,
  allDaySpan,
  busyLabel,
  countdownLabel,
  dayLabel,
  durationLabel,
  fetchRange,
  initials,
  layoutDay,
  meetingState,
  meetingsOn,
  monthGrid,
  newEventUrl,
  offsetLabel,
  overlapsWith,
  rangeLabel,
  readMeetings,
  shortClock,
  stepAnchor,
  timeRange,
  upNext,
  viewDays,
  whenLabel
} from "./calendarModel";

const local = (month: number, day: number, hour = 0, minute = 0, year = 2026) => new Date(year, month - 1, day, hour, minute);
const at = (month: number, day: number, hour = 0, minute = 0) => local(month, day, hour, minute).toISOString();
/** Monday, September 14, 2026, 9:00 in the morning. */
const NOW = local(9, 14, 9).getTime();

function meeting(fields: Partial<CalendarMeeting> & Pick<CalendarMeeting, "id" | "startsAt" | "endsAt">): CalendarMeeting {
  return {
    provider: "google",
    title: fields.id,
    allDay: false,
    location: "",
    joinUrl: "",
    attendees: [],
    organizer: "",
    guests: [],
    myResponse: "accepted",
    description: "",
    webUrl: "",
    conference: "",
    ...fields
  };
}

describe("the days a view shows", () => {
  it("lays a month out on six weeks that start on Monday", () => {
    const september = monthGrid("2026-09-23");
    expect(september).toHaveLength(42);
    expect(september[0]).toBe("2026-08-31");
    expect(september.at(-1)).toBe("2026-10-11");
    // a month whose 1st is a Monday starts on it
    expect(monthGrid("2027-02-10")[0]).toBe("2027-02-01");
  });

  it("gives a day, a week from Monday, and the month grid", () => {
    expect(viewDays("day", "2026-09-23")).toEqual(["2026-09-23"]);
    expect(viewDays("week", "2026-09-23")).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
      "2026-09-27"
    ]);
    // Sunday belongs to the week that started the Monday before
    expect(viewDays("week", "2026-09-27")[0]).toBe("2026-09-21");
    expect(viewDays("month", "2026-09-23")).toHaveLength(42);
  });

  it("steps by a day, a week or a month, and keeps a month's last day", () => {
    expect(stepAnchor("day", "2026-09-30", 1)).toBe("2026-10-01");
    expect(stepAnchor("week", "2026-09-23", -1)).toBe("2026-09-16");
    expect(stepAnchor("month", "2026-09-23", 1)).toBe("2026-10-23");
    // the 31st of January, a month on, is the last day of February rather than a day in March
    expect(stepAnchor("month", "2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("reads one range for the whole month grid, inside the server's 62 days", () => {
    const { from, to } = fetchRange("2026-09-23");
    expect(from.getTime()).toBe(local(8, 31).getTime());
    expect(to.getTime()).toBe(local(10, 12).getTime());
    expect((to.getTime() - from.getTime()) / 86_400_000).toBeLessThanOrEqual(62);
    // any day in a week near the month's edge is inside its own month's read
    for (const anchor of ["2026-09-01", "2026-09-30", "2026-10-01"]) {
      const range = fetchRange(anchor);
      for (const day of viewDays("week", anchor)) {
        expect(local(Number(day.slice(5, 7)), Number(day.slice(8))).getTime()).toBeGreaterThanOrEqual(range.from.getTime());
        expect(local(Number(day.slice(5, 7)), Number(day.slice(8))).getTime()).toBeLessThan(range.to.getTime());
      }
    }
  });
});

describe("where a meeting sits", () => {
  it("puts an all-day entry on its own dates, whatever the reader's time zone", () => {
    // Google sends dates; Graph sends midnight UTC. Either way, the 16th is the 16th.
    expect(allDaySpan({ startsAt: "2026-09-16", endsAt: "2026-09-17" })).toEqual({ first: "2026-09-16", last: "2026-09-16" });
    expect(allDaySpan({ startsAt: "2026-09-16T00:00:00.0000000Z", endsAt: "2026-09-19T00:00:00.0000000Z" })).toEqual({
      first: "2026-09-16",
      last: "2026-09-18"
    });
    const trip = meeting({ id: "trip", allDay: true, startsAt: "2026-09-16", endsAt: "2026-09-19" });
    expect(meetingsOn([trip], "2026-09-18").allDay).toEqual([trip]);
    expect(meetingsOn([trip], "2026-09-19").allDay).toEqual([]);
  });

  it("puts a timed meeting on every day it touches, soonest first", () => {
    const late = meeting({ id: "late", startsAt: at(9, 14, 23), endsAt: at(9, 15, 1) });
    const early = meeting({ id: "early", startsAt: at(9, 14, 8), endsAt: at(9, 14, 9) });
    expect(meetingsOn([late, early], "2026-09-14").timed.map((m) => m.id)).toEqual(["early", "late"]);
    expect(meetingsOn([late, early], "2026-09-15").timed.map((m) => m.id)).toEqual(["late"]);
    expect(meetingsOn([late, early], "2026-09-16").timed).toEqual([]);
  });

  it("lays overlapping meetings side by side, and a short one still takes a quarter hour", () => {
    const a = meeting({ id: "a", startsAt: at(9, 14, 9), endsAt: at(9, 14, 10) });
    const b = meeting({ id: "b", startsAt: at(9, 14, 9, 30), endsAt: at(9, 14, 10, 30) });
    const c = meeting({ id: "c", startsAt: at(9, 14, 10, 30), endsAt: at(9, 14, 11) });
    const placed = Object.fromEntries(layoutDay([c, b, a], "2026-09-14").map((item) => [item.event.id, item]));
    expect(placed.a).toMatchObject({ top: 540, bottom: 600, lane: 0, lanes: 2 });
    expect(placed.b).toMatchObject({ lane: 1, lanes: 2 });
    // c starts as b ends: a new run, with the width to itself
    expect(placed.c).toMatchObject({ lane: 0, lanes: 1 });

    const blip = meeting({ id: "blip", startsAt: at(9, 14, 13), endsAt: at(9, 14, 13, 5) });
    const next = meeting({ id: "next", startsAt: at(9, 14, 13, 10), endsAt: at(9, 14, 14) });
    const short = layoutDay([blip, next], "2026-09-14");
    expect(short.map((item) => item.lanes)).toEqual([2, 2]);
  });

  it("clips a meeting that runs past midnight to the day it is drawn on", () => {
    const late = meeting({ id: "late", startsAt: at(9, 14, 23), endsAt: at(9, 15, 1) });
    expect(layoutDay([late], "2026-09-14")[0]).toMatchObject({ top: 1380, bottom: 1440 });
    expect(layoutDay([late], "2026-09-15")[0]).toMatchObject({ top: 0, bottom: 60 });
  });
});

describe("what the panel says about time", () => {
  const minutes = (count: number) => new Date(NOW + count * 60_000).toISOString();

  it("says what a person would say about the time left", () => {
    expect(countdownLabel(minutes(5), minutes(35), NOW)).toBe("In 5 min.");
    expect(countdownLabel(minutes(1), minutes(31), NOW)).toBe("In 1 min.");
    expect(countdownLabel(minutes(59), minutes(89), NOW)).toBe("In 59 min.");
    expect(countdownLabel(minutes(70), minutes(100), NOW)).toBe("In 1 h 10 min.");
    expect(countdownLabel(minutes(120), minutes(150), NOW)).toBe("In 2 h");
    expect(countdownLabel(minutes(-5), minutes(25), NOW)).toBe("Now");
    expect(countdownLabel(minutes(-40), minutes(-10), NOW)).toBe("Ended");
    // far enough out that a countdown stops being useful
    expect(countdownLabel(minutes(600), minutes(630), NOW)).toBe("7:00 PM");
  });

  it("groups by the day a person means", () => {
    expect(dayLabel(minutes(30), NOW)).toBe("Today");
    expect(dayLabel(minutes(60 * 24), NOW)).toBe("Tomorrow");
    expect(dayLabel(at(9, 18, 9), NOW)).toBe("Friday");
    // an all-day entry's date is its day
    expect(dayLabel("2026-09-15", NOW)).toBe("Tomorrow");
  });

  it("knows whether a meeting is over, on, about to start, or later", () => {
    expect(meetingState({ startsAt: minutes(-60), endsAt: minutes(-30), allDay: false }, NOW)).toBe("past");
    expect(meetingState({ startsAt: minutes(-10), endsAt: minutes(20), allDay: false }, NOW)).toBe("now");
    expect(meetingState({ startsAt: minutes(15), endsAt: minutes(45), allDay: false }, NOW)).toBe("soon");
    expect(meetingState({ startsAt: minutes(16), endsAt: minutes(45), allDay: false }, NOW)).toBe("later");
    expect(meetingState({ startsAt: "2026-09-14", endsAt: "2026-09-15", allDay: true }, NOW)).toBe("now");
    expect(meetingState({ startsAt: "2026-09-13", endsAt: "2026-09-14", allDay: true }, NOW)).toBe("past");
  });

  it("writes when a meeting is the way a list should say it", () => {
    expect(whenLabel(meeting({ id: "on", startsAt: minutes(-10), endsAt: minutes(60) }), NOW)).toBe("Ongoing · until 10:00 AM");
    expect(whenLabel(meeting({ id: "soon", startsAt: minutes(5), endsAt: minutes(35) }), NOW)).toBe("In 5 min.");
    expect(whenLabel(meeting({ id: "tomorrow", startsAt: at(9, 15, 9), endsAt: at(9, 15, 10) }), NOW)).toBe("Tomorrow · 9:00 AM");
    expect(whenLabel(meeting({ id: "friday", startsAt: at(9, 18, 14, 30), endsAt: at(9, 18, 15) }), NOW)).toBe("Fri · 2:30 PM");
    expect(whenLabel(meeting({ id: "all", allDay: true, startsAt: "2026-09-14", endsAt: "2026-09-15" }), NOW)).toBe("All day");
    expect(whenLabel(meeting({ id: "all2", allDay: true, startsAt: "2026-09-15", endsAt: "2026-09-16" }), NOW)).toBe("Tomorrow · All day");
  });

  it("prints times and lengths compactly", () => {
    expect(timeRange(at(9, 14, 9), at(9, 14, 10, 30))).toBe("9:00 – 10:30 AM");
    expect(timeRange(at(9, 14, 11, 30), at(9, 14, 13))).toBe("11:30 AM – 1:00 PM");
    expect(shortClock(at(9, 14, 9))).toBe("9am");
    expect(shortClock(at(9, 14, 21, 30))).toBe("9:30pm");
    expect(shortClock(at(9, 14, 12))).toBe("12pm");
    expect(durationLabel(at(9, 14, 9), at(9, 14, 9, 30))).toBe("30 min");
    expect(durationLabel(at(9, 14, 9), at(9, 14, 10))).toBe("1 h");
    expect(durationLabel(at(9, 14, 9), at(9, 14, 10, 30))).toBe("1 h 30 min");
  });

  it("labels the range in view", () => {
    expect(rangeLabel("week", "2026-09-23")).toBe("Sep 21 – 27, 2026");
    expect(rangeLabel("week", "2026-09-30")).toBe("Sep 28 – Oct 4, 2026");
    expect(rangeLabel("week", "2026-12-30")).toBe("Dec 28, 2026 – Jan 3, 2027");
    expect(rangeLabel("day", "2026-09-23")).toBe("Wednesday, Sep 23, 2026");
    expect(rangeLabel("month", "2026-09-23")).toBe("September 2026");
  });

  it("names the reader's offset the way a calendar app does", () => {
    expect(offsetLabel({ getTimezoneOffset: () => 240 } as Date)).toBe("GMT-4");
    expect(offsetLabel({ getTimezoneOffset: () => -330 } as Date)).toBe("GMT+5:30");
    expect(offsetLabel({ getTimezoneOffset: () => 0 } as Date)).toBe("GMT+0");
  });
});

describe("what the side column lists", () => {
  it("lists what is still to come this week, soonest first, leaving out what you declined", () => {
    const events = [
      meeting({ id: "over", startsAt: at(9, 14, 7), endsAt: at(9, 14, 8) }),
      meeting({ id: "declined", startsAt: at(9, 14, 10), endsAt: at(9, 14, 11), myResponse: "declined" }),
      meeting({ id: "friday", startsAt: at(9, 18, 9), endsAt: at(9, 18, 10) }),
      meeting({ id: "on", startsAt: at(9, 14, 8, 30), endsAt: at(9, 14, 9, 30) }),
      meeting({ id: "next month", startsAt: at(10, 2, 9), endsAt: at(10, 2, 10) }),
      meeting({ id: "holiday", allDay: true, startsAt: "2026-09-15", endsAt: "2026-09-16" })
    ];
    // timed meetings first, then the all-day entries; nothing past seven days
    expect(upNext(events, NOW).map((m) => m.id)).toEqual(["on", "friday", "holiday"]);
    expect(upNext(events, NOW, 1).map((m) => m.id)).toEqual(["on"]);
  });

  it("adds up booked time, and finds a double booking", () => {
    const a = meeting({ id: "a", startsAt: at(9, 14, 9), endsAt: at(9, 14, 10) });
    const b = meeting({ id: "b", startsAt: at(9, 14, 9, 30), endsAt: at(9, 14, 10, 30) });
    const declined = meeting({ id: "no", startsAt: at(9, 14, 9), endsAt: at(9, 14, 12), myResponse: "declined" });
    const allDay = meeting({ id: "all", allDay: true, startsAt: "2026-09-14", endsAt: "2026-09-15" });
    expect(busyLabel([a, b, declined, allDay])).toBe("2 h");
    expect(busyLabel([meeting({ id: "x", startsAt: at(9, 14, 9), endsAt: at(9, 14, 9, 45) })])).toBe("45 m");
    expect(overlapsWith(a, [a, b, declined, allDay]).map((m) => m.id)).toEqual(["b"]);
    expect(overlapsWith(allDay, [a, b])).toEqual([]);
  });

  it("opens a new event in the calendar it belongs to", () => {
    expect(newEventUrl("google", "dana@asphaltco.com")).toBe("https://calendar.google.com/calendar/r/eventedit");
    expect(newEventUrl("microsoft", "dana@hotmail.com")).toContain("outlook.live.com");
    expect(newEventUrl("microsoft", "dana@contoso.com")).toContain("outlook.office.com");
  });

  it("makes two letters for a face", () => {
    expect(initials("Carlos Ramirez")).toBe("CR");
    expect(initials("dana.brooks@asphaltco.com")).toBe("DB");
    expect(initials("Dana")).toBe("DA");
  });
});

describe("reading a feed", () => {
  it("keeps a meeting an older server sent, and drops anything that is not a meeting", () => {
    const read = readMeetings({
      events: [
        { id: "google:1", provider: "google", startsAt: at(9, 14, 9), endsAt: at(9, 14, 10), title: "  " },
        null,
        { id: 5 },
        {
          id: "microsoft:2",
          provider: "microsoft",
          startsAt: at(9, 14, 11),
          endsAt: at(9, 14, 12),
          title: "Site walk",
          myResponse: "maybe"
        }
      ]
    });
    expect(read).toHaveLength(2);
    expect(read[0]).toMatchObject({ title: "Untitled meeting", guests: [], description: "", myResponse: "accepted", conference: "" });
    // an answer this program does not know reads as the usual one rather than breaking a pill
    expect(read[1]).toMatchObject({ provider: "microsoft", title: "Site walk", myResponse: "accepted" });
    expect(readMeetings("<html>Bad gateway</html>")).toEqual([]);
    expect(readMeetings(undefined)).toEqual([]);
  });
});
