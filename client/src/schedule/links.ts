import type { ScheduleAlertPage } from "./alerts";
import type { SchedulePage } from "./useScheduleContext";

/** Where a schedule page can send you: another schedule view, the page an alert is dealt with on, or the Crews page (the landing's crew availability panel). */
export type ScheduleTarget = SchedulePage | ScheduleAlertPage | "crews";
