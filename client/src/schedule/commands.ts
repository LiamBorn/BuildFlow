/** The command palette's Schedule entries: the landing, and one per view with its key. */
import { SCHEDULE_VIEW_KEYS } from "./viewKeys";
import type { SchedulePage } from "./useScheduleContext";

export type ScheduleCommand = { id: string; label: string; hint?: string; group: string; keywords?: string; run: () => void };

export function scheduleCommands(open: (page: SchedulePage) => void): ScheduleCommand[] {
  return [
    {
      id: "schedule-landing",
      label: "Schedule",
      group: "Schedule",
      keywords: "plan overview landing status alerts",
      run: () => open("schedule")
    },
    ...SCHEDULE_VIEW_KEYS.map((view) => ({
      id: `schedule-${view.page}`,
      label: `${view.label} view`,
      hint: view.key,
      group: "Schedule",
      keywords: `schedule view ${view.page} ${view.key}`,
      run: () => open(view.page)
    }))
  ];
}
