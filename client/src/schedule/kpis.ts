/**
 * The schedule KPIs, defined once and used by every schedule page and the landing:
 * - hours: each booking's job shift (start to end time) × its required labour;
 * - cost: those hours × the crew's hourly rate per worker;
 * - utilisation: booked crew-days over the workspace's working days (its weekdays, minus its holidays) for the crews in view;
 * - at risk: the jobs in trouble this week — a booking with a conflict note, or a job over the week
 *   that is At Risk, DelayIQed or missing materials; each job counts once.
 * Every figure is about the week and the month the page is showing, not about today: the same inputs
 * give the same figures on every page, and on any day the tests are run.
 */
import {
  defaultCrewRate,
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
  /**
   * Booked crew-days over working crew-days, as a whole percent — above 100 when the week is
   * over-booked, and null when there are no crews in view to book against, which is not the
   * same as nobody working.
   */
  utilization: number | null;
  bookedCrewDays: number;
  workingDays: number;
  activities: number;
  hours: number;
  laborCost: string;
  atRisk: number;
  milestones: number;
  monthShort: string;
  /** Crews in view carrying no usable rate, priced at their specialty's default. */
  unpricedCrews: number;
  /** What each card counts — the tooltip on it. */
  definitions: { crews: string; activities: string; atRisk: string; milestones: string };
};

export const AT_RISK_DEFINITION =
  "Jobs in trouble this week: one with a booking that carries a conflict note, or one running over the week that is At Risk, DelayIQed or missing materials. Each job counts once.";

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

/**
 * The hours in a job's shift, from its start and end times; 8 when the job does not say.
 *
 * Exact, not rounded. It used to round to two decimals here, which is fine to look at and wrong
 * to multiply: a 7:00–15:20 shift is 8.333… hours, and rounding it to 8.33 before the labour and
 * the rate go near it loses a few cents on every booking. Round once, where a number is shown.
 */
export function jobShiftHours(job: Pick<Job, "startTime" | "endTime">): number {
  const start = parseClockTime(job.startTime);
  const end = parseClockTime(job.endTime);
  if (start === null || end === null) return 8;
  const minutes = end > start ? end - start : end + 24 * 60 - start;
  return minutes / 60;
}

/** Hours as a person reads them: two decimals, and no trailing zeros. */
export const showHours = (hours: number) => String(Math.round(hours * 100) / 100);

/**
 * What a crew costs an hour, per worker. A rate of zero is not a price, it is a blank: the crew
 * form offers the specialty's default as its placeholder and the server stores that when the
 * field is left empty, so a stored 0 is old or mistyped data. Reading it as a real price put
 * a whole week of booked work on the board at $0 with nothing saying why.
 */
export const crewHourlyRate = (crew: Pick<Crew, "rate" | "specialty"> | undefined): number =>
  crew && typeof crew.rate === "number" && crew.rate > 0 ? crew.rate : defaultCrewRate(crew?.specialty ?? "");

/** Whether this crew is priced at a default because it carries no rate of its own. */
export const isUnpricedCrew = (crew: Pick<Crew, "rate">) => !(typeof crew.rate === "number" && crew.rate > 0);

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

/**
 * How booked a crew is in a week: its distinct booked days over the working days, as a whole
 * percent. Not capped: a crew booked on the Sunday of a six-day week reads 117%, and a week that
 * is over-booked has to look different from one that is exactly full.
 */
export function crewWeekUtilization(crew: Pick<Crew, "id">, weekAssignments: ScheduleAssignment[], workingDayCount: number): number {
  if (workingDayCount <= 0) return 0;
  const booked = new Set(weekAssignments.filter((assignment) => assignment.crewId === crew.id).map(dayOf)).size;
  return Math.round((100 * booked) / workingDayCount);
}

export const formatMoney = (amount: number) => `$${Math.round(amount).toLocaleString("en-US")}`;

export function computeScheduleKpis({
  crews,
  jobs,
  weekAssignments,
  weekDays,
  month,
  phases,
  projects,
  calendar = defaultWorkCalendar()
}: {
  crews: Crew[];
  jobs: Job[];
  weekAssignments: ScheduleAssignment[];
  /** The week the bookings belong to, as YYYY-MM-DD days. */
  weekDays: string[];
  /** The month the page is showing, as YYYY-MM — what the milestones tile counts. */
  month: string;
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
    // exact all the way through: the only rounding is on the way out, below
    const bookingHours = bookingLaborHours(job);
    hours += bookingHours;
    cost += bookingHours * crewHourlyRate(crewsById.get(assignment.crewId));
  }
  const weekFrom = weekDays[0] ?? "";
  const weekTo = weekDays[weekDays.length - 1] ?? weekFrom;
  // the jobs this week is in trouble over, each counted once however many ways it shows
  const atRiskJobs = new Set(
    jobs.filter((job) => weekFrom && job.startDate <= weekTo && job.endDate >= weekFrom && isAtRiskJob(job)).map((job) => job.id)
  );
  for (const assignment of weekAssignments) if (isAtRiskBooking(assignment)) atRiskJobs.add(assignment.jobId);
  const working = workingDays(weekDays, calendar).length;
  const bookedCrewDays = new Set(weekAssignments.map((assignment) => `${assignment.crewId}|${dayOf(assignment)}`)).size;
  const crewDays = crews.length * working;
  const bookedCrewIds = new Set(weekAssignments.map((assignment) => assignment.crewId));
  const unpriced = crews.filter(isUnpricedCrew);
  const pricedAt = [...new Set(unpriced.map((crew) => defaultCrewRate(crew.specialty)))].sort((a, b) => a - b);
  return {
    activeCrews: crews.filter((crew) => bookedCrewIds.has(crew.id)).length,
    crewsTotal: crews.length,
    // null, not 0: with no crews in view there is nothing to be booked against, and a week of
    // real work would otherwise read as nobody working at all
    utilization: crewDays > 0 ? Math.round((100 * bookedCrewDays) / crewDays) : null,
    bookedCrewDays,
    workingDays: working,
    activities: weekAssignments.length,
    hours: Math.round(hours * 10) / 10,
    laborCost: formatMoney(cost),
    atRisk: atRiskJobs.size,
    unpricedCrews: unpriced.length,
    milestones:
      phases.filter((phase) => phase.endDate && phase.endDate.slice(0, 7) === month).length +
      projects.filter((project) => project.targetCompletion && project.targetCompletion.slice(0, 7) === month).length,
    monthShort: new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" }),
    definitions: {
      crews:
        crewDays > 0
          ? `Crews with a booking this week. Utilisation is booked crew-days over working crew-days (the workspace's working week, minus its holidays): ${bookedCrewDays} of ${crewDays}${bookedCrewDays > crewDays ? " — over-booked" : ""}.`
          : "No crews in view, so there is nothing to be booked against. Any bookings counted here sit on crews this page is not showing.",
      activities:
        "Bookings this week. Hours are each booking's job shift (start to end time) × its required labour; cost is those hours × the crew's hourly rate per worker." +
        (unpriced.length > 0
          ? ` ${unpriced.length === 1 ? "One crew carries no rate of its own and is" : `${unpriced.length} crews carry no rate of their own and are`} priced at the specialty default (${pricedAt.map((rate) => `$${rate}`).join(", ")} an hour).`
          : ""),
      atRisk: AT_RISK_DEFINITION,
      milestones: "Phases ending and project targets due in the month this page is showing."
    }
  };
}
