/* =========================================================================
   Schedule import — the canonical shape every source format is normalised to.

   P6 (.xer) and MS Project (.xml/MSPDI) model a schedule very differently, so
   each parser's only job is to produce this. Everything downstream (mapping to
   BuildFlow projects/phases/jobs, the preview, the commit) works off this one
   shape and never sees a format-specific field.
   ========================================================================= */

export type ScheduleFormat = "xer" | "mspdi";

/** Finish-to-start etc. Kept as the canonical P6 spelling; MSPDI's numeric
 *  codes are translated into these. */
export type RelationType = "FS" | "SS" | "FF" | "SF";

export type ImportedRelation = {
  /** `externalId` of the predecessor activity. */
  predecessorId: string;
  type: RelationType;
  lagHours: number;
};

export type ImportedActivity = {
  /** Stable id within the source file (P6 `task_id`, MSPDI `<UID>`). */
  externalId: string;
  /** The human-facing id a scheduler recognises (P6 `task_code`, e.g. "A1020"). */
  code: string;
  name: string;
  /** `externalId` of the owning WBS node, if any. */
  wbsId?: string;
  projectId?: string;
  start?: string;
  finish?: string;
  durationHours?: number;
  percentComplete?: number;
  isMilestone: boolean;
  /** Summary/WBS-level rows: real schedules carry these as roll-ups, and they
   *  are not work to be scheduled, so mapping drops them. */
  isSummary: boolean;
  resourceNames: string[];
  predecessors: ImportedRelation[];
};

export type ImportedWbs = {
  externalId: string;
  parentId?: string;
  projectId?: string;
  name: string;
  code?: string;
  sequence?: number;
};

export type ImportedProject = {
  externalId: string;
  name: string;
  code?: string;
  start?: string;
  finish?: string;
  /** The schedule's data date / status date — "as of when" the progress is true.
   *  Drives the health check's forecastIQ; falls back to today when absent. */
  dataDate?: string;
};

export type ParsedSchedule = {
  format: ScheduleFormat;
  /** Free-text provenance for the UI, e.g. "Primavera P6 (XER 19.12)". */
  source: string;
  projects: ImportedProject[];
  wbs: ImportedWbs[];
  activities: ImportedActivity[];
  /** Anything the operator should know before committing: unsupported rows,
   *  dropped fields, suspicious data. Surfaced verbatim in the preview. */
  warnings: string[];
};

/** Thrown for input we understand well enough to reject with a real reason
 *  (wrong format, binary .mpp, truncated file) rather than a 500. */
export class ScheduleImportError extends Error {
  readonly code: string;
  /** What the user should actually do about it. */
  readonly hint?: string;
  constructor(code: string, message: string, hint?: string) {
    super(message);
    this.name = "ScheduleImportError";
    this.code = code;
    this.hint = hint;
  }
}
