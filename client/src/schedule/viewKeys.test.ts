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
  it("maps 1–3 to the views in the landing's order", () => {
    // (Week, List and Matrix held 2, 3 and 6 until they left the product on 2026-09-22 — docs/backlog.md)
    expect(SCHEDULE_VIEW_KEYS.map((view) => `${view.key}:${view.page}`)).toEqual(["1:month", "2:gantt", "3:kanban"]);
    expect(scheduleViewForKey(press("2"))).toBe("gantt");
    expect(scheduleViewForKey(press("3"))).toBe("kanban");
    expect(scheduleViewForKey(press("4"))).toBeNull();
    expect(viewKeyFor("gantt")).toBe("2");
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
    renderHook(() => useScheduleViewKeys(open, "gantt"));
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
    expect(open).toHaveBeenLastCalledWith("kanban");
  });
  it("ignores a dialog the app keeps mounted but hidden, like the AI panel", () => {
    const panel = document.createElement("div");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-hidden", "true");
    document.body.appendChild(panel);
    expect(dialogIsOpen()).toBe(false);
    const open = vi.fn();
    renderHook(() => useScheduleViewKeys(open, "month"));
    fireEvent.keyDown(window, { key: "2" });
    expect(open).toHaveBeenCalledWith("gantt");
    panel.removeAttribute("aria-hidden");
    expect(dialogIsOpen()).toBe(true);
    panel.remove();
  });
  it("does nothing without an opener", () => {
    renderHook(() => useScheduleViewKeys(undefined, "month"));
    expect(() => fireEvent.keyDown(window, { key: "1" })).not.toThrow();
  });
});
