/**
 * Home-page announcements are time-boxed: a "try the new X" banner that never
 * expires becomes furniture. `until` is the last day it shows (YYYY-MM-DD).
 */
export const GANTT_PROMO_UNTIL = "2026-10-06";

/** True while `today` (YYYY-MM-DD) is on or before the announcement's last day. */
export function announcementIsLive(today: string, until: string = GANTT_PROMO_UNTIL) {
  return /^\d{4}-\d{2}-\d{2}$/.test(today) && today <= until;
}
