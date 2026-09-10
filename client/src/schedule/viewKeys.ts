/**
 * Keys 1–6 switch views from anywhere in Schedule, in the order the landing lists
 * them. Not while typing in a field, not with a modifier held, not inside a dialog.
 */
import { useEffect } from "react";
import type { SchedulePage } from "./useScheduleContext";

export const SCHEDULE_VIEW_KEYS: ReadonlyArray<{ key: string; page: SchedulePage; label: string }> = [
  { key: "1", page: "month", label: "Month" },
  { key: "2", page: "week", label: "Week" },
  { key: "3", page: "list", label: "List" },
  { key: "4", page: "gantt", label: "Gantt Chart" },
  { key: "5", page: "kanban", label: "Kanban" },
  { key: "6", page: "matrix", label: "Matrix" }
];

/** The key that opens a view, if it has one. */
export const viewKeyFor = (page: SchedulePage) => SCHEDULE_VIEW_KEYS.find((view) => view.page === page)?.key;

/** True when a keypress is typing rather than a command: the target is a field or an editable region. */
export function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element || typeof element.closest !== "function") return false;
  return Boolean(element.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='textbox']"));
}

/** True while a dialog is actually up — the app keeps some (the AI panel) mounted but hidden. */
export function dialogIsOpen(root: Document = document) {
  return [...root.querySelectorAll<HTMLElement>("[role='dialog']")].some(
    (dialog) =>
      !dialog.hidden &&
      dialog.getAttribute("aria-hidden") !== "true" &&
      (typeof dialog.checkVisibility !== "function" || dialog.checkVisibility())
  );
}

/** The view a keypress asks for, or null when it is typing, a shortcut with a modifier, or not a view key. */
export function scheduleViewForKey(event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "target">): SchedulePage | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  if (isTypingTarget(event.target)) return null;
  return SCHEDULE_VIEW_KEYS.find((view) => view.key === event.key)?.page ?? null;
}

/** Keys 1–6 open the views while a schedule page is on screen; `current` is the one already open. */
export function useScheduleViewKeys(onOpen: ((page: SchedulePage) => void) | undefined, current?: SchedulePage) {
  useEffect(() => {
    if (!onOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      // a dialog owns the keyboard while it is up
      if (dialogIsOpen()) return;
      const page = scheduleViewForKey(event);
      if (!page || page === current) return;
      event.preventDefault();
      onOpen(page);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen, current]);
}
