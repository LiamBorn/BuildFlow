import type { Job, ScheduleAssignment } from "@buildflow/shared";

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

export function assignmentsForCell(assignments: ScheduleAssignment[], crewId: string, date: string) {
  return assignments.filter((assignment) => assignment.crewId === crewId && assignment.date === date);
}

export function statusTone(status: string) {
  return status.toLowerCase().replaceAll(" ", "-");
}
