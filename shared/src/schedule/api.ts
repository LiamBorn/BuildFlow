/* ============================================================================
   Transport shapes between the schedule screen and the API. The §3 records
   travel unchanged; these are the envelopes around them.
   ========================================================================== */
import type { Activity, Baseline, Calendar, Crew, ID, Project, Relationship, WBS } from "./types";

/** Everything the schedule screen needs for one project, in one round trip. */
export interface ScheduleProjectData {
  project: Project;
  calendars: Calendar[];
  crews: Crew[];
  activities: Activity[];
  relationships: Relationship[];
  wbs: WBS[];
  baselines: Baseline[];
  /** Activities created from the project's legacy jobs during this load (a one-time bootstrap). */
  bootstrappedFromJobs?: number;
}

/** The cached, calculated columns written back after a schedule run. Null clears a column. */
export interface ActivityDatesPatch {
  id: ID;
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  totalFloat: number | null;
  freeFloat: number | null;
  isCritical: boolean | null;
}

export interface ScheduleResultsPayload {
  activities: ActivityDatesPatch[];
}

export type ScheduleProjectPatch = Partial<Pick<Project, "number" | "dataDate" | "defaultCalendarId">>;
export type ScheduleCrewPatch = Partial<Pick<Crew, "color" | "defaultProductionRate" | "defaultUnit">>;

/** A whole project's schedule records, for seeding and imports. Everything is upserted in one transaction. */
export interface ScheduleBundle {
  calendars?: Calendar[];
  wbs?: WBS[];
  activities?: Activity[];
  relationships?: Relationship[];
  baselines?: Baseline[];
}
