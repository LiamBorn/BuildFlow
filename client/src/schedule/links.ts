import type { ScheduleAlertPage } from "./alerts";
import type { SchedulePage } from "./useScheduleContext";

/** Where a schedule page can send you: another schedule view, or the page an alert is dealt with on. */
export type ScheduleTarget = SchedulePage | ScheduleAlertPage;
