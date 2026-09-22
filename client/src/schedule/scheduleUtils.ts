import type { Job, ScheduleAssignment } from "@buildflow/shared";
import { localIsoDate } from "@buildflow/shared";

// The current calendar week (Mon–Sun), computed at load so the schedule always
// opens on the most up-to-date day & month rather than a hard-coded past week.
function buildCurrentWeek() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = today.getDay(); // 0=Sun..6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(today);
    d.setDate(today.getDate() + mondayOffset + index);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      date: iso,
      day: dayNames[d.getDay()],
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    };
  });
}

export const weekDays = buildCurrentWeek();

export function getUnassignedJobs(jobs: Job[], assignments: ScheduleAssignment[]) {
  const assignedJobIds = new Set(assignments.map((assignment) => assignment.jobId));
  return jobs.filter((job) => !assignedJobIds.has(job.id));
}

export function statusTone(status: string) {
  return status.toLowerCase().replaceAll(" ", "-");
}

/**
 * A Date's local calendar day as YYYY-MM-DD. `toISOString()` reads the UTC day,
 * which is yesterday for any clock ahead of UTC once a local midnight is involved.
 *
 * One implementation, shared with the server, which had the same question to answer about
 * "today" and was answering it in UTC.
 */
export const toLocalIsoDate = (date: Date) => localIsoDate(date);

/** Move a YYYY-MM-DD day by whole calendar days, in local time. */
export function shiftScheduleDate(date: string, days: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return toLocalIsoDate(next);
}
