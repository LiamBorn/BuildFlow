/**
 * The schedule filters, with one meaning on every page:
 * - project, region and the status set narrow the jobs;
 * - crew type and crew narrow the crews, and then the jobs to work booked on those crews;
 * - a booking shows when its job and its crew show (it wears its job's status).
 * A project, crew, crew type or region the workspace no longer has (a stale link)
 * counts as unset, so a link never shows an empty board.
 */
import type { Crew, Job, Project, ScheduleAssignment, Status } from "@buildflow/shared";
import { SCHEDULE_STATUSES, type ScheduleContext } from "./useScheduleContext";

export type ScheduleFilterData = { jobs: Job[]; assignments: ScheduleAssignment[]; crews: Crew[]; projects: Project[] };

export type ScheduleFilterSet = {
  projectId: string | null;
  crewType: string | null;
  crewId: string | null;
  region: string | null;
  /** The statuses kept, or null when every status is kept. */
  statuses: Set<Status> | null;
};

export type ScheduleScope = { jobs: Job[]; assignments: ScheduleAssignment[]; crews: Crew[]; filters: ScheduleFilterSet };

const regionOf = (job: Job) => job.location.trim();

/**
 * Bookings whose crew the workspace no longer has.
 *
 * Every page draws a booking inside its crew's row, so one with no crew is dropped — from the
 * boards, the KPIs and the export alike, without a word. The hours are worked and the row is in
 * the database. Deleting a crew takes its bookings with it, so this is not the ordinary path:
 * it is what an import, or an older partial write, can leave behind. Whatever made it, the one
 * thing the schedule must not do is pretend it is not there.
 *
 * Answers to the workspace, not to the page's filters — a booking hidden by a crew filter is
 * hidden on purpose, and this is the opposite of on purpose.
 */
export function bookingsWithoutCrew(data: Pick<ScheduleFilterData, "assignments" | "crews">): ScheduleAssignment[] {
  const crewIds = new Set(data.crews.map((crew) => crew.id));
  return data.assignments.filter((assignment) => !crewIds.has(assignment.crewId));
}

/** The regions the schedule knows: every job's location, once, sorted. */
export function scheduleRegions(jobs: Job[]): string[] {
  return [...new Set(jobs.map(regionOf).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** The filters as they apply to this workspace. */
export function resolveScheduleFilters(context: ScheduleContext, data: ScheduleFilterData): ScheduleFilterSet {
  const projectId = context.projectId && data.projects.some((project) => project.id === context.projectId) ? context.projectId : null;
  const crewType = context.crewType && data.crews.some((crew) => crew.specialty === context.crewType) ? context.crewType : null;
  const crewId = context.crewId && data.crews.some((crew) => crew.id === context.crewId) ? context.crewId : null;
  const region = context.region && data.jobs.some((job) => regionOf(job) === context.region) ? context.region : null;
  const statuses =
    context.statuses && context.statuses.length > 0 && context.statuses.length < SCHEDULE_STATUSES.length
      ? new Set(context.statuses)
      : null;
  return { projectId, crewType, crewId, region, statuses };
}

/**
 * The jobs, bookings and crews a page shows under the context's filters. The
 * Kanban is the status view, so it passes `statuses: false` and keeps every status.
 */
export function applyScheduleFilters(
  data: ScheduleFilterData,
  context: ScheduleContext,
  options: { statuses?: boolean } = {}
): ScheduleScope {
  const filters = resolveScheduleFilters(context, data);
  const statuses = options.statuses === false ? null : filters.statuses;
  const crews = data.crews.filter(
    (crew) => (!filters.crewType || crew.specialty === filters.crewType) && (!filters.crewId || crew.id === filters.crewId)
  );
  const crewIds = new Set(crews.map((crew) => crew.id));
  const jobIdsOnCrews =
    filters.crewType || filters.crewId
      ? new Set(data.assignments.filter((assignment) => crewIds.has(assignment.crewId)).map((assignment) => assignment.jobId))
      : null;
  const jobs = data.jobs.filter(
    (job) =>
      (!filters.projectId || job.projectId === filters.projectId) &&
      (!filters.region || regionOf(job) === filters.region) &&
      (!statuses || statuses.has(job.status)) &&
      (!jobIdsOnCrews || jobIdsOnCrews.has(job.id))
  );
  const jobIds = new Set(jobs.map((job) => job.id));
  const assignments = data.assignments.filter(
    // a booking wears its job's status, so the status set is a job filter
    (assignment) => jobIds.has(assignment.jobId) && crewIds.has(assignment.crewId)
  );
  return { jobs, assignments, crews, filters };
}

export type ScheduleFilterChip = { key: keyof ScheduleFilterSet; label: string; clear: Partial<ScheduleContext> };

/** The active filters as chips: what they say, and the patch that clears each one. */
export function scheduleFilterChips(
  context: ScheduleContext,
  data: ScheduleFilterData,
  options: { statuses?: boolean } = {}
): ScheduleFilterChip[] {
  const filters = resolveScheduleFilters(context, data);
  const chips: ScheduleFilterChip[] = [];
  if (filters.projectId) {
    chips.push({
      key: "projectId",
      label: data.projects.find((project) => project.id === filters.projectId)?.name ?? "Project",
      clear: { projectId: null }
    });
  }
  if (filters.crewType) chips.push({ key: "crewType", label: filters.crewType, clear: { crewType: null } });
  if (filters.crewId) {
    chips.push({ key: "crewId", label: data.crews.find((crew) => crew.id === filters.crewId)?.name ?? "Crew", clear: { crewId: null } });
  }
  if (filters.region) chips.push({ key: "region", label: filters.region, clear: { region: null } });
  if (filters.statuses && options.statuses !== false) {
    const kept = SCHEDULE_STATUSES.filter((status) => filters.statuses?.has(status));
    chips.push({
      key: "statuses",
      label: kept.length <= 2 ? kept.join(" · ") : `${kept.length} of ${SCHEDULE_STATUSES.length} statuses`,
      clear: { statuses: null }
    });
  }
  return chips;
}

/** Everything off: the patch the "Clear filters" action writes. */
export const CLEAR_SCHEDULE_FILTERS: Partial<ScheduleContext> = {
  projectId: null,
  crewType: null,
  crewId: null,
  region: null,
  statuses: null
};
