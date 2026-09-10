/**
 * The schedule KPIs, defined once and used by every schedule page and the landing:
 * - hours: each booking's job shift (start to end time) × its required labour;
 * - cost: those hours × the crew's hourly rate per worker;
 * - utilisation: booked crew-days over the workspace's working days (its weekdays, minus its holidays) for the crews in view;
 * - at risk: bookings with a conflict note, plus jobs At Risk, DelayIQed or missing materials.
 * The same inputs give the same figures on every page.
 */
import {
  DEFAULT_CREW_RATE,
  defaultWorkCalendar,
  holidayMap,
  normalizeWorkCalendar,
  type BootstrapPayload,
  type Crew,
  type Job,
  type Project,
  type ScheduleAssignment,
  type WorkCalendarSetting
} from "@buildflow/shared";

/** The workspace's calendar from a bootstrap, or the computed default for an older tenant. */
export const workCalendarOf = (data: Pick<BootstrapPayload, "workCalendar">): WorkCalendarSetting =>
  data.workCalendar ? normalizeWorkCalendar(data.workCalendar) : defaultWorkCalendar();

export type ScheduleKpis = {
  activeCrews: number;
  crewsTotal: number;
  /** Booked crew-days over working crew-days, as a whole percent. */
  utilization: number;
  bookedCrewDays: number;
  workingDays: number;
  activities: number;
  hours: number;
  laborCost: string;
  atRisk: number;
  milestones: number;
  monthShort: string;
  /** What each card counts — the tooltip on it. */
  definitions: { crews: string; activities: string; atRisk: string; milestones: string };
};

export const AT_RISK_DEFINITION = "Bookings with a conflict note, plus jobs that are At Risk, DelayIQed or missing materials.";

/** "7:00 AM" → minutes since midnight; null when the text is not a clock time. */
export function parseClockTime(text: string | undefined): number | null {
  const match = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*$/i.exec(text ?? "");
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase().replace(/\./g, "");
  if (hours > 23 || minutes > 59) return null;
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

/** The hours in a job's shift, from its start and end times; 8 when the job does not say. */
export function jobShiftHours(job: Pick<Job, "startTime" | "endTime">): number {
  const start = parseClockTime(job.startTime);
  const end = parseClockTime(job.endTime);
  if (start === null || end === null) return 8;
  const minutes = end > start ? end - start : end + 24 * 60 - start;
  return Math.round((minutes / 60) * 100) / 100;
}

/** One booking's labour-hours: the shift × the labour the job asks for (at least one person). */
export function bookingLaborHours(job: Pick<Job, "startTime" | "endTime" | "requiredLabor">): number {
  return jobShiftHours(job) * Math.max(1, Number(job.requiredLabor) || 1);
}

export const isAtRiskJob = (job: Pick<Job, "status" | "materialsStatus">) =>
  job.status === "At Risk" || job.status === "DelayIQed" || job.materialsStatus === "Missing";
export const isAtRiskBooking = (assignment: Pick<ScheduleAssignment, "conflicts">) => assignment.conflicts.length > 0;

/** The days crews work, by the workspace's calendar: its working weekdays, minus its holidays. */
export function workingDays(days: string[], calendar: WorkCalendarSetting = defaultWorkCalendar()): string[] {
  const holidays = holidayMap(calendar);
  return days.filter((day) => calendar.workingDays.includes(new Date(`${day}T00:00:00`).getDay()) && !holidays[day]);
}

/** The seven days of the week starting on `weekStart`, as YYYY-MM-DD. */
export function weekIsoDays(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
}

const dayOf = (assignment: ScheduleAssignment) => assignment.date.slice(0, 10);

/** How booked a crew is in a week: its distinct booked days over the working days, as a whole percent. */
export function crewWeekUtilization(crew: Pick<Crew, "id">, weekAssignments: ScheduleAssignment[], workingDayCount: number): number {
  if (workingDayCount <= 0) return 0;
  const booked = new Set(weekAssignments.filter((assignment) => assignment.crewId === crew.id).map(dayOf)).size;
  return Math.min(100, Math.round((100 * booked) / workingDayCount));
}

export const formatMoney = (amount: number) => `$${Math.round(amount).toLocaleString("en-US")}`;

export function computeScheduleKpis({
  crews,
  jobs,
  weekAssignments,
  weekDays,
  phases,
  projects,
  calendar = defaultWorkCalendar()
}: {
  crews: Crew[];
  jobs: Job[];
  weekAssignments: ScheduleAssignment[];
  /** The week the bookings belong to, as YYYY-MM-DD days. */
  weekDays: string[];
  phases: BootstrapPayload["phases"];
  projects: Project[];
  /** The workspace's working week and holidays. */
  calendar?: WorkCalendarSetting;
}): ScheduleKpis {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const crewsById = new Map(crews.map((crew) => [crew.id, crew]));
  let hours = 0;
  let cost = 0;
  for (const assignment of weekAssignments) {
    const job = jobsById.get(assignment.jobId);
    if (!job) continue;
    const bookingHours = bookingLaborHours(job);
    hours += bookingHours;
    cost += bookingHours * (crewsById.get(assignment.crewId)?.rate ?? DEFAULT_CREW_RATE);
  }
  const working = workingDays(weekDays, calendar).length;
  const bookedCrewDays = new Set(weekAssignments.map((assignment) => `${assignment.crewId}|${dayOf(assignment)}`)).size;
  const crewDays = crews.length * working;
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const bookedCrewIds = new Set(weekAssignments.map((assignment) => assignment.crewId));
  return {
    activeCrews: crews.filter((crew) => bookedCrewIds.has(crew.id)).length,
    crewsTotal: crews.length,
    utilization: crewDays > 0 ? Math.min(100, Math.round((100 * bookedCrewDays) / crewDays)) : 0,
    bookedCrewDays,
    workingDays: working,
    activities: weekAssignments.length,
    hours: Math.round(hours * 10) / 10,
    laborCost: formatMoney(cost),
    atRisk: weekAssignments.filter(isAtRiskBooking).length + jobs.filter(isAtRiskJob).length,
    milestones:
      phases.filter((phase) => phase.endDate && phase.endDate.slice(0, 7) === monthKey).length +
      projects.filter((project) => project.targetCompletion && project.targetCompletion.slice(0, 7) === monthKey).length,
    monthShort: now.toLocaleDateString("en-US", { month: "short" }),
    definitions: {
      crews: `Crews with a booking this week. Utilisation is booked crew-days over working crew-days (the workspace's working week, minus its holidays): ${bookedCrewDays} of ${crewDays}.`,
      activities:
        "Bookings this week. Hours are each booking's job shift (start to end time) × its required labour; cost is those hours × the crew's hourly rate per worker.",
      atRisk: AT_RISK_DEFINITION,
      milestones: "Phases ending and project targets due in the current calendar month."
    }
  };
}
