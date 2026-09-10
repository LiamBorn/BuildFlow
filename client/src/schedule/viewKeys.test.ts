import { fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SCHEDULE_VIEW_KEYS, dialogIsOpen, isTypingTarget, scheduleViewForKey, useScheduleViewKeys, viewKeyFor } from "./viewKeys";

const press = (key: string, extra: Partial<KeyboardEvent> = {}) => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  target: document.body,
  ...extra
});

describe("scheduleViewForKey", () => {
  it("maps 1–6 to the views in the landing's order", () => {
    expect(SCHEDULE_VIEW_KEYS.map((view) => `${view.key}:${view.page}`)).toEqual([
      "1:month",
      "2:week",
      "3:list",
      "4:gantt",
      "5:kanban",
      "6:matrix"
    ]);
    expect(scheduleViewForKey(press("2"))).toBe("week");
    expect(scheduleViewForKey(press("6"))).toBe("matrix");
    expect(scheduleViewForKey(press("7"))).toBeNull();
    expect(viewKeyFor("gantt")).toBe("4");
    expect(viewKeyFor("schedule")).toBeUndefined();
  });
  it("stays out of the way while typing, or with a modifier held", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(scheduleViewForKey(press("2", { target: input }))).toBeNull();
    expect(scheduleViewForKey(press("2", { metaKey: true }))).toBeNull();
    expect(scheduleViewForKey(press("2", { ctrlKey: true }))).toBeNull();
    input.remove();
  });
});

describe("useScheduleViewKeys", () => {
  it("opens the view for a digit, but not the one already open and not while a dialog is up", () => {
    const open = vi.fn();
    renderHook(() => useScheduleViewKeys(open, "week"));
    fireEvent.keyDown(window, { key: "1" });
    expect(open).toHaveBeenCalledWith("month");
    fireEvent.keyDown(window, { key: "2" });
    expect(open).toHaveBeenCalledTimes(1);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    fireEvent.keyDown(window, { key: "3" });
    expect(open).toHaveBeenCalledTimes(1);
    dialog.remove();
    fireEvent.keyDown(window, { key: "3" });
    expect(open).toHaveBeenLastCalledWith("list");
  });
  it("ignores a dialog the app keeps mounted but hidden, like the AI panel", () => {
    const panel = document.createElement("div");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-hidden", "true");
    document.body.appendChild(panel);
    expect(dialogIsOpen()).toBe(false);
    const open = vi.fn();
    renderHook(() => useScheduleViewKeys(open, "week"));
    fireEvent.keyDown(window, { key: "4" });
    expect(open).toHaveBeenCalledWith("gantt");
    panel.removeAttribute("aria-hidden");
    expect(dialogIsOpen()).toBe(true);
    panel.remove();
  });
  it("does nothing without an opener", () => {
    renderHook(() => useScheduleViewKeys(undefined, "week"));
    expect(() => fireEvent.keyDown(window, { key: "1" })).not.toThrow();
  });
});
