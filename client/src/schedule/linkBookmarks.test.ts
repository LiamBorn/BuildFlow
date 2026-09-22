import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { bootstrapFixture } from "../test/fixture";
import {
  hasLinkBookmark,
  openScheduleLink,
  readLinkBookmarks,
  scheduleLinkFor,
  toggleLinkBookmark,
  useLinkBookmarks
} from "./linkBookmarks";
import { EMPTY_SCHEDULE_CONTEXT } from "./useScheduleContext";

const data = { projects: bootstrapFixture.projects, crews: bootstrapFixture.crews };

beforeEach(() => window.localStorage.clear());

describe("scheduleLinkFor", () => {
  it("names the page, the week or month it shows, and its filters — the link is the identity", () => {
    // the landing is the page whose link carries the week (the Week board's did too, until 2026-09-22)
    const week = scheduleLinkFor("schedule", { ...EMPTY_SCHEDULE_CONTEXT, weekStart: "2026-06-22", projectId: "p-riverside" }, data);
    expect(week).toEqual({
      page: "schedule",
      hash: "#schedule?w=2026-06-22&project=p-riverside",
      label: "Schedule · week of Jun 22",
      detail: "Riverside Office Building"
    });
    const month = scheduleLinkFor("month", { ...EMPTY_SCHEDULE_CONTEXT, monthAnchor: "2026-06-01", crewType: "Concrete" }, data);
    expect(month.label).toBe("Month · June 2026");
    expect(month.hash).toBe("#schedule/month?m=2026-06-01&crewType=Concrete");
    expect(scheduleLinkFor("kanban", EMPTY_SCHEDULE_CONTEXT, data)).toMatchObject({
      label: "Kanban",
      detail: "All work",
      hash: "#schedule/kanban"
    });
    expect(scheduleLinkFor("schedule", EMPTY_SCHEDULE_CONTEXT, data).label).toBe("Schedule · week of today");
  });
});

describe("link bookmarks", () => {
  it("pin and unpin by their link, per person, and survive a reload", () => {
    const week = scheduleLinkFor("schedule", { ...EMPTY_SCHEDULE_CONTEXT, weekStart: "2026-06-22" }, data);
    const month = scheduleLinkFor("month", { ...EMPTY_SCHEDULE_CONTEXT, monthAnchor: "2026-06-01" }, data);
    expect(toggleLinkBookmark("u-1", week)).toEqual([week]);
    expect(toggleLinkBookmark("u-1", month)).toEqual([week, month]);
    expect(readLinkBookmarks("u-1")).toEqual([week, month]);
    expect(readLinkBookmarks("u-2")).toEqual([]);
    expect(hasLinkBookmark(readLinkBookmarks("u-1"), week.hash)).toBe(true);
    expect(toggleLinkBookmark("u-1", week)).toEqual([month]);
    window.localStorage.setItem(
      "bf:nav:links:u-3",
      JSON.stringify([{ page: "mars" }, { page: "schedule", hash: "#elsewhere", label: "x" }, { page: "week", hash: "#schedule/week", label: "old" }, month])
    );
    expect(readLinkBookmarks("u-3")).toEqual([month]); // only real schedule links survive — a retired page's pin is dropped too
  });

  it("keep every star menu in step through the hook", () => {
    const week = scheduleLinkFor("schedule", { ...EMPTY_SCHEDULE_CONTEXT, weekStart: "2026-06-22" }, data);
    const menu = renderHook(() => useLinkBookmarks("u-1"));
    const page = renderHook(() => useLinkBookmarks("u-1"));
    act(() => menu.result.current.toggle(week));
    expect(page.result.current.links).toEqual([week]);
    act(() => page.result.current.toggle(week));
    expect(menu.result.current.links).toEqual([]);
  });

  it("open by putting the link on the address bar, which the app routes on", () => {
    openScheduleLink({ hash: "#schedule/month?m=2026-06-01" });
    expect(window.location.hash).toBe("#schedule/month?m=2026-06-01");
    window.location.hash = "";
  });
});
