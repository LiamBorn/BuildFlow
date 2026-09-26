/**
 * Parity: the shared notification list, greeting and meeting clock (2026-09-26, notch step 3) against
 * what the website's own copies answered before they were deleted.
 *
 * The *.golden.json files beside this one were CAPTURED, not written: at 28150ca, a one-off script
 * ran App.tsx's buildNotificationItems (exported for the run), rendered the whole app and read the
 * Dashboard's greeting at every hour of the day, and called calendarModel.ts's meetingState and
 * upNext, all on the inputs in cases.ts, and saved what came back. Those copies are gone now, so the
 * capture cannot be re-run; these answers are the record of what they did.
 */
import { describe, expect, it } from "vitest";
import { greetingFor, meetingState, upNext } from "@buildflow/shared";
import { bellNotificationItems } from "../../notifications/bellItems";
import greetingGolden from "./greeting.golden.json";
import meetingsGolden from "./meetings.golden.json";
import notificationsGolden from "./notifications.golden.json";
import { greetingHours, greetingInstant, meetingEvents, meetingNows, notificationFixtures, upNextLimits } from "./cases";

type GoldenItem = {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  tone: string;
  icon: string | null;
  projectId: string | null;
  target: unknown;
};

describe("the shared notification list says what App.tsx said", () => {
  for (const [name, data] of Object.entries(notificationFixtures)) {
    it(`on the ${name} fixture`, () => {
      const now = Date.now();
      const stamped = new Date(now).toISOString();
      const golden = (notificationsGolden as Record<string, GoldenItem[]>)[name];
      expect(golden.length).toBeGreaterThan(0);
      /* The equipment rows were stamped with the capture's clock ("<now>"). Stamped with this run's
         instead and put back in time order — which is how App.tsx would have sorted them here. Every
         other row keeps its captured place. */
      const expected = golden
        .map((item) => ({ ...item, timestamp: item.timestamp === "<now>" ? stamped : item.timestamp }))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      const built = bellNotificationItems(data, now);
      const actual = built.map((item) => ({
        id: item.id,
        title: item.title,
        detail: item.detail,
        timestamp: item.timestamp,
        tone: item.tone,
        icon: (item.icon as { displayName?: string }).displayName ?? null,
        projectId: item.projectId ?? null,
        target: item.target ?? null
      }));
      expect(actual).toEqual(expected);

      // and what is new: equipment, and only equipment, may never alert; every row names its record
      for (const item of built) {
        expect(item.alertable, item.id).toBe(item.kind !== "equipment");
        expect(item.id.endsWith(item.record.id), item.id).toBe(true);
      }
    });
  }

  it("covered every source and every tone", () => {
    const rich = (notificationsGolden as Record<string, GoldenItem[]>).rich;
    const sources = ["field-", "weather-conflict-", "weather-", "delayIQ-", "assignment-", "inspection-", "material-", "equipment-"];
    expect(new Set(rich.map((item) => sources.find((prefix) => item.id.startsWith(prefix))))).toEqual(new Set(sources));
    expect(new Set(rich.map((item) => item.tone))).toEqual(new Set(["blue", "green", "amber", "red", "violet", "slate"]));
  });
});

describe("the shared greeting says what the Dashboard said", () => {
  const golden = greetingGolden as Record<string, string>;

  it("from 5 AM to 9:59 PM, word for word", () => {
    for (const hour of greetingHours.filter((h) => h >= 5 && h < 22)) {
      expect(greetingFor({ name: "Matt Johnson", now: greetingInstant(hour) }).text, `${hour}:30`).toBe(golden[String(hour)]);
    }
  });

  it("and late at night says Working late where it used to say good morning or good evening", () => {
    for (const hour of greetingHours.filter((h) => h < 5 || h >= 22)) {
      expect(golden[String(hour)], `${hour}:30 before`).toMatch(/^Good (morning|evening), Matt$/);
      expect(greetingFor({ name: "Matt Johnson", now: greetingInstant(hour) }).text, `${hour}:30 now`).toBe("Working late, Matt");
    }
  });
});

describe("the shared meeting clock says what the Meetings panel said", () => {
  it("meetingState, for every meeting at every clock", () => {
    for (const [name, now] of Object.entries(meetingNows)) {
      const expected = (meetingsGolden.meetingState as Record<string, Record<string, string>>)[name];
      const actual = Object.fromEntries(meetingEvents.map((event) => [event.id, meetingState(event, now)]));
      expect(actual, name).toEqual(expected);
    }
  });

  it("upNext, at every clock and limit", () => {
    for (const [name, now] of Object.entries(meetingNows)) {
      const expected = (meetingsGolden.upNext as Record<string, Record<string, string[]>>)[name];
      const actual = Object.fromEntries(
        upNextLimits.map((limit) => [String(limit), upNext(meetingEvents, now, limit).map((event) => event.id)])
      );
      expect(actual, name).toEqual(expected);
    }
  });
});
