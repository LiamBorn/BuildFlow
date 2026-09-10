/* =========================================================================
   Microsoft Project .xml (MSPDI) parser.

   MSPDI models a schedule very differently from P6: there is no WBS table, the
   hierarchy is implied by <OutlineNumber> ("1.2.3") on a flat <Task> list, and
   summary rows are ordinary tasks flagged <Summary>1</Summary>. So the work
   here is mostly turning that outline back into a parent/child tree that lines
   up with P6's PROJWBS, which is what the canonical shape expects.
   ========================================================================= */

import { XMLParser } from "fast-xml-parser";
import type { ImportedActivity, ImportedProject, ImportedRelation, ImportedWbs, ParsedSchedule, RelationType } from "./types.js";
import { ScheduleImportError } from "./types.js";

/** MSPDI PredecessorLink <Type>. */
const RELATION_TYPES: Record<string, RelationType> = {
  "0": "FF",
  "1": "FS",
  "2": "SF",
  "3": "SS"
};

type RawNode = Record<string, unknown>;

function asArray(value: unknown): RawNode[] {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).filter((item): item is RawNode => typeof item === "object" && item !== null);
}

function str(node: RawNode, key: string): string | undefined {
  const value = node[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value === "object") return undefined;
  const text = String(value).trim();
  return text === "" ? undefined : text;
}

function num(node: RawNode, key: string): number | undefined {
  const value = str(node, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function flag(node: RawNode, key: string): boolean {
  const value = str(node, key);
  return value === "1" || value?.toLowerCase() === "true";
}

/** "2024-01-15T08:00:00" -> "2024-01-15". */
function toIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
}

/** ISO-8601 duration ("PT80H30M0S") -> hours. */
export function parseIsoDurationHours(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value.trim());
  if (!match) return undefined;
  const [, days, hours, minutes, seconds] = match;
  const total = Number(days ?? 0) * 24 + Number(hours ?? 0) + Number(minutes ?? 0) / 60 + Number(seconds ?? 0) / 3600 || 0;
  return total > 0 ? Number(total.toFixed(2)) : 0;
}

/** Parent outline number: "1.2.3" -> "1.2"; top level -> undefined. */
function parentOutline(outline: string | undefined): string | undefined {
  if (!outline) return undefined;
  const parts = outline.split(".");
  if (parts.length <= 1) return undefined;
  return parts.slice(0, -1).join(".");
}

export function parseMspdi(text: string): ParsedSchedule {
  let root: RawNode;
  try {
    const parser = new XMLParser({
      ignoreAttributes: true,
      // Keep every value a string: MSPDI ids and outline numbers ("1.10") must not
      // be coerced to numbers, which would silently corrupt them.
      parseTagValue: false,
      trimValues: true,
      removeNSPrefix: true,
      isArray: (name) => ["Task", "Resource", "Assignment", "PredecessorLink"].includes(name)
    });
    root = parser.parse(text) as RawNode;
  } catch (error) {
    throw new ScheduleImportError(
      "xml_malformed",
      `That XML file could not be parsed: ${error instanceof Error ? error.message : "unknown error"}`,
      "Re-export it from MS Project with File → Save As → XML."
    );
  }

  const project = (root.Project ?? undefined) as RawNode | undefined;
  if (!project) {
    throw new ScheduleImportError(
      "not_mspdi",
      "This XML file has no <Project> element, so it is not an MS Project (MSPDI) export.",
      "In MS Project use File → Save As and choose 'XML Format (*.xml)'."
    );
  }

  const warnings: string[] = [];
  const taskNodes = asArray((project.Tasks as RawNode | undefined)?.Task);
  if (taskNodes.length === 0) {
    throw new ScheduleImportError(
      "mspdi_no_tasks",
      "That MS Project XML parsed, but it contains no tasks.",
      "Check that the project had activities when it was exported."
    );
  }

  // Resource UID -> name, joined onto tasks through <Assignments>.
  const resourceNames = new Map<string, string>();
  for (const node of asArray((project.Resources as RawNode | undefined)?.Resource)) {
    const uid = str(node, "UID");
    const name = str(node, "Name");
    if (uid && name) resourceNames.set(uid, name);
  }
  const resourcesByTask = new Map<string, string[]>();
  for (const node of asArray((project.Assignments as RawNode | undefined)?.Assignment)) {
    const taskUid = str(node, "TaskUID");
    const name = resourceNames.get(str(node, "ResourceUID") ?? "");
    if (!taskUid || !name) continue;
    const list = resourcesByTask.get(taskUid) ?? [];
    if (!list.includes(name)) list.push(name);
    resourcesByTask.set(taskUid, list);
  }

  // UID 0 is MS Project's project-summary row — not real work.
  const tasks = taskNodes.filter((node) => str(node, "UID") !== "0");

  // Outline number -> UID, so PredecessorLinks and parents can be resolved.
  const uidByOutline = new Map<string, string>();
  for (const node of tasks) {
    const outline = str(node, "OutlineNumber");
    const uid = str(node, "UID");
    if (outline && uid) uidByOutline.set(outline, uid);
  }

  const summaries = tasks.filter((node) => flag(node, "Summary"));
  const summaryUids = new Set(summaries.map((node) => str(node, "UID")).filter(Boolean) as string[]);

  // Summary rows become the WBS; their parent is the enclosing summary.
  const wbs: ImportedWbs[] = summaries.map((node, index) => {
    const outline = str(node, "OutlineNumber");
    const parentOutlineNumber = parentOutline(outline);
    return {
      externalId: str(node, "UID") ?? `summary-${index}`,
      parentId: parentOutlineNumber ? uidByOutline.get(parentOutlineNumber) : undefined,
      name: str(node, "Name") ?? `Group ${outline ?? index + 1}`,
      code: outline,
      sequence: num(node, "ID") ?? index
    };
  });

  let unknownRelationTypes = 0;
  const activities: ImportedActivity[] = tasks.map((node, index) => {
    const uid = str(node, "UID") ?? `task-${index}`;
    const outline = str(node, "OutlineNumber");
    const parentOutlineNumber = parentOutline(outline);
    const parentUid = parentOutlineNumber ? uidByOutline.get(parentOutlineNumber) : undefined;

    const predecessors: ImportedRelation[] = [];
    for (const link of asArray(node.PredecessorLink)) {
      const predecessorId = str(link, "PredecessorUID");
      if (!predecessorId) continue;
      const rawType = str(link, "Type") ?? "1";
      const type = RELATION_TYPES[rawType];
      if (!type) unknownRelationTypes += 1;
      // LinkLag is expressed in tenths of a minute.
      const lagTenthsOfMinute = num(link, "LinkLag") ?? 0;
      predecessors.push({
        predecessorId,
        type: type ?? "FS",
        lagHours: Number((lagTenthsOfMinute / 10 / 60).toFixed(3))
      });
    }

    return {
      externalId: uid,
      code: outline ?? uid,
      name: str(node, "Name") ?? `Task ${uid}`,
      // A leaf's own parent summary is its WBS band; a summary row is itself a band.
      wbsId: summaryUids.has(uid) ? parentUid : parentUid,
      start: toIsoDate(str(node, "Start")),
      finish: toIsoDate(str(node, "Finish")),
      durationHours: parseIsoDurationHours(str(node, "Duration")),
      percentComplete: num(node, "PercentComplete"),
      isMilestone: flag(node, "Milestone"),
      isSummary: flag(node, "Summary"),
      resourceNames: resourcesByTask.get(uid) ?? [],
      predecessors
    };
  });

  if (unknownRelationTypes > 0) {
    warnings.push(`${unknownRelationTypes} relationship(s) had an unrecognised type and were treated as Finish-to-Start.`);
  }

  const projects: ImportedProject[] = [
    {
      externalId: str(project, "UID") ?? "mspdi-project",
      name: str(project, "Title") ?? str(project, "Name") ?? "Imported MS Project schedule",
      start: toIsoDate(str(project, "StartDate")),
      finish: toIsoDate(str(project, "FinishDate")),
      // MS Project's status date; CurrentDate is the fallback it stamps on save.
      dataDate: toIsoDate(str(project, "StatusDate")) ?? toIsoDate(str(project, "CurrentDate"))
    }
  ];

  const saveVersion = str(project, "SaveVersion");
  return {
    format: "mspdi",
    source: saveVersion ? `Microsoft Project (XML, save version ${saveVersion})` : "Microsoft Project (XML)",
    projects,
    wbs,
    activities,
    warnings
  };
}
