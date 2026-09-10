/* =========================================================================
   Schedule import — entry point: sniff the format, hand off to a parser.
   ========================================================================= */

import { parseMspdi } from "./mspdi.js";
import type { ParsedSchedule, ScheduleFormat } from "./types.js";
import { ScheduleImportError } from "./types.js";
import { parseXer } from "./xer.js";

export * from "./types.js";
export { parseXer } from "./xer.js";
export { parseMspdi } from "./mspdi.js";
export { buildImportPlan, type ImportPlan, type ImportPlanOptions } from "./map.js";
export { analyzeSchedule, type ScheduleHealth, type ScheduleForecastIQ, type HealthFinding, type Severity } from "./analyze.js";
export { simulateFinish, type FinishConfidence } from "./montecarlo.js";

function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return match ? match[1].toLowerCase() : "";
}

/**
 * .mpp is an OLE2 compound document. Decoded as text its magic bytes
 * (D0 CF 11 E0) survive as these code points, which is enough to recognise a
 * binary Project file that was uploaded as text.
 */
function looksLikeOle2(content: string): boolean {
  // eslint-disable-next-line no-control-regex -- the OLE2 magic bytes, as they survive a text decode
  return /^���/.test(content) || content.startsWith("ÐÏà");
}

const MPP_HINT =
  "BuildFlow reads Project schedules as XML. In MS Project open the .mpp, then File → Save As → 'XML Format (*.xml)' and upload that file. (The .mpp format itself is an undocumented binary format — even Microsoft's own tooling round-trips through XML.)";

export function detectFormat(filename: string, content: string): ScheduleFormat {
  const extension = extensionOf(filename);

  if (extension === "mpp" || looksLikeOle2(content)) {
    throw new ScheduleImportError("mpp_unsupported", "MS Project .mpp files can't be read directly — it's a binary format.", MPP_HINT);
  }

  const head = content.slice(0, 4000);
  if (extension === "xer" || head.startsWith("ERMHDR") || /(^|\n)%T\t/.test(head)) return "xer";
  if (extension === "xml" || /<\?xml/i.test(head) || /<Project[\s>]/i.test(head)) return "mspdi";

  throw new ScheduleImportError(
    "unknown_format",
    `Unrecognised schedule file${extension ? ` (.${extension})` : ""}.`,
    "Upload a Primavera P6 export (.xer) or an MS Project XML export (.xml)."
  );
}

export function parseSchedule(filename: string, content: string): ParsedSchedule {
  if (!content || !content.trim()) {
    throw new ScheduleImportError("empty_file", "That file is empty.", "Re-export the schedule and try again.");
  }
  const format = detectFormat(filename, content);
  return format === "xer" ? parseXer(content) : parseMspdi(content);
}
