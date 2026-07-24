/* =========================================================================
   Primavera P6 .xer parser.

   XER is a flat, tab-delimited dump of P6's tables:

     ERMHDR<TAB>19.12<TAB>2024-01-15<TAB>...        file header
     %T<TAB>TASK                                    begin table
     %F<TAB>task_id<TAB>task_code<TAB>task_name...  its columns
     %R<TAB>1001<TAB>A1020<TAB>Pour slab...         one row per %R
     %E                                             end of file

   The column list is emitted per table and **its order changes between P6
   versions and export settings** — so every value here is looked up by field
   NAME against that table's %F header. Never by index.
   ========================================================================= */

import {
  ImportedActivity,
  ImportedProject,
  ImportedRelation,
  ImportedWbs,
  ParsedSchedule,
  RelationType,
  ScheduleImportError
} from "./types.js";

/** One XER table: its %F column names plus every %R row, as name→value maps. */
type XerTable = {
  name: string;
  fields: string[];
  rows: Record<string, string>[];
};

const RELATION_TYPES: Record<string, RelationType> = {
  PR_FS: "FS",
  PR_SS: "SS",
  PR_FF: "FF",
  PR_SF: "SF"
};

/** P6 activity types that are roll-ups rather than work to be scheduled. */
const SUMMARY_TASK_TYPES = new Set(["TT_WBS", "TT_LOE"]);
const MILESTONE_TASK_TYPES = new Set(["TT_Mile", "TT_FinMile"]);

/** "2024-01-15 08:00" | "2024-01-15" -> "2024-01-15". Anything else -> undefined. */
function toIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return undefined;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** First non-empty value among the given field names. */
function pick(row: Record<string, string>, ...fields: string[]): string | undefined {
  for (const field of fields) {
    const value = row[field];
    if (value !== undefined && value.trim() !== "") return value;
  }
  return undefined;
}

/**
 * Split an XER file into tables. Tolerates the real-world messiness: blank
 * lines, CRLF, %R rows shorter or longer than their %F header, and stray rows
 * that appear before any %T.
 */
export function parseXerTables(text: string): { tables: Map<string, XerTable>; header: string[] } {
  const tables = new Map<string, XerTable>();
  let header: string[] = [];
  let current: XerTable | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine || !rawLine.trim()) continue;
    const cells = rawLine.split("\t");
    const marker = cells[0];

    if (marker === "ERMHDR") {
      header = cells.slice(1);
      continue;
    }
    if (marker === "%T") {
      const name = (cells[1] ?? "").trim();
      current = { name, fields: [], rows: [] };
      tables.set(name, current);
      continue;
    }
    if (marker === "%F") {
      if (current) current.fields = cells.slice(1).map((field) => field.trim());
      continue;
    }
    if (marker === "%R") {
      if (!current || current.fields.length === 0) continue;
      const values = cells.slice(1);
      const row: Record<string, string> = {};
      current.fields.forEach((field, index) => {
        row[field] = values[index] ?? "";
      });
      current.rows.push(row);
      continue;
    }
    // %E ends the file; anything else is a marker we don't model.
  }

  return { tables, header };
}

export function parseXer(text: string): ParsedSchedule {
  if (!/(^|\n)%T\t/.test(text) && !text.startsWith("ERMHDR")) {
    throw new ScheduleImportError(
      "not_xer",
      "This file does not look like a P6 XER export.",
      "In P6, use File → Export → Primavera PM (XER) and upload the resulting .xer file."
    );
  }

  const { tables, header } = parseXerTables(text);
  const warnings: string[] = [];

  const taskTable = tables.get("TASK");
  if (!taskTable || taskTable.rows.length === 0) {
    throw new ScheduleImportError(
      "xer_no_tasks",
      "That XER file parsed, but it contains no activities (no TASK rows).",
      "Check that the export included at least one project's activities."
    );
  }

  // Mojibake check: XER is commonly written as Windows-1252, so a file decoded
  // as UTF-8 can arrive with replacement characters. Worth flagging — the import
  // still works, the names are just wrong.
  if (text.includes("�")) {
    warnings.push(
      "Some characters could not be decoded and may appear garbled. XER files are often saved in a non-UTF-8 encoding; re-exporting as UTF-8 fixes activity names."
    );
  }

  const projects: ImportedProject[] = (tables.get("PROJECT")?.rows ?? []).map((row) => ({
    externalId: row.proj_id,
    name: pick(row, "proj_short_name", "proj_name") ?? `P6 project ${row.proj_id}`,
    code: pick(row, "proj_short_name"),
    start: toIsoDate(pick(row, "plan_start_date", "scd_end_date")),
    finish: toIsoDate(pick(row, "plan_end_date", "scd_end_date")),
    // P6's data date — the "as of" for all progress.
    dataDate: toIsoDate(pick(row, "last_recalc_date", "sum_data_date"))
  }));

  // proj_node_flag = 'Y' marks the project's own root node, not a real WBS band.
  const wbs: ImportedWbs[] = (tables.get("PROJWBS")?.rows ?? [])
    .filter((row) => row.proj_node_flag !== "Y")
    .map((row) => ({
      externalId: row.wbs_id,
      parentId: row.parent_wbs_id?.trim() || undefined,
      projectId: row.proj_id?.trim() || undefined,
      name: pick(row, "wbs_name", "wbs_short_name") ?? `WBS ${row.wbs_id}`,
      code: pick(row, "wbs_short_name"),
      sequence: toNumber(row.seq_num)
    }));

  // Relationships, grouped by successor.
  const relationsByTask = new Map<string, ImportedRelation[]>();
  let unknownRelationTypes = 0;
  for (const row of tables.get("TASKPRED")?.rows ?? []) {
    const successor = row.task_id;
    const predecessorId = row.pred_task_id;
    if (!successor || !predecessorId) continue;
    const type = RELATION_TYPES[row.pred_type];
    if (!type) unknownRelationTypes += 1;
    const list = relationsByTask.get(successor) ?? [];
    list.push({
      predecessorId,
      type: type ?? "FS",
      lagHours: toNumber(row.lag_hr_cnt) ?? 0
    });
    relationsByTask.set(successor, list);
  }
  if (unknownRelationTypes > 0) {
    warnings.push(`${unknownRelationTypes} relationship(s) had an unrecognised type and were treated as Finish-to-Start.`);
  }

  // Resource names, joined through TASKRSRC.
  const resourceNames = new Map<string, string>();
  for (const row of tables.get("RSRC")?.rows ?? []) {
    const name = pick(row, "rsrc_name", "rsrc_short_name");
    if (row.rsrc_id && name) resourceNames.set(row.rsrc_id, name);
  }
  const resourcesByTask = new Map<string, string[]>();
  for (const row of tables.get("TASKRSRC")?.rows ?? []) {
    const name = resourceNames.get(row.rsrc_id);
    if (!row.task_id || !name) continue;
    const list = resourcesByTask.get(row.task_id) ?? [];
    if (!list.includes(name)) list.push(name);
    resourcesByTask.set(row.task_id, list);
  }

  const activities: ImportedActivity[] = taskTable.rows.map((row) => {
    const taskType = row.task_type ?? "";
    return {
      externalId: row.task_id,
      code: pick(row, "task_code") ?? row.task_id,
      name: pick(row, "task_name") ?? pick(row, "task_code") ?? `Activity ${row.task_id}`,
      wbsId: row.wbs_id?.trim() || undefined,
      projectId: row.proj_id?.trim() || undefined,
      // Actual dates win over planned, then the scheduler's early dates — this is
      // the order a P6 user reads a schedule in.
      start: toIsoDate(pick(row, "act_start_date", "target_start_date", "early_start_date", "restart_date")),
      finish: toIsoDate(pick(row, "act_end_date", "target_end_date", "early_end_date", "reend_date")),
      durationHours: toNumber(pick(row, "target_drtn_hr_cnt", "remain_drtn_hr_cnt")),
      percentComplete: toNumber(pick(row, "phys_complete_pct")),
      isMilestone: MILESTONE_TASK_TYPES.has(taskType),
      isSummary: SUMMARY_TASK_TYPES.has(taskType),
      resourceNames: resourcesByTask.get(row.task_id) ?? [],
      predecessors: relationsByTask.get(row.task_id) ?? []
    };
  });

  const version = header[0]?.trim();
  return {
    format: "xer",
    source: version ? `Primavera P6 (XER ${version})` : "Primavera P6 (XER)",
    projects,
    wbs,
    activities,
    warnings
  };
}
