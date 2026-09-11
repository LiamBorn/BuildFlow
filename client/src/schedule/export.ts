/**
 * One export for every schedule page: the same columns for the same data, scoped
 * to whatever the page shows. CSV for spreadsheets, a printable week sheet per
 * crew (the browser's print-to-PDF), and the per-crew calendar feeds (server side).
 */
import type { Crew, Job, Project, ScheduleAssignment } from "@buildflow/shared";
import { bookingLaborHours, showHours } from "./kpis";

export type ExportScope = {
  jobs: Job[];
  assignments: ScheduleAssignment[];
  crews: Crew[];
  projects: Project[];
  /** Only bookings on these days (inclusive, YYYY-MM-DD); every booking of the jobs in scope when absent. */
  window?: { start: string; end: string };
  /** Jobs with no booking in the window get a row of their own (the Kanban, Month and Gantt scopes). */
  includeUnbooked?: boolean;
};

export const EXPORT_COLUMNS = [
  "Date",
  "Day",
  "Crew",
  "Job",
  "Project",
  "Phase",
  "Status",
  "Start",
  "End",
  "Labour",
  // Named for what it holds. It was "Hours", and it meant the shift × the labour on a booked row
  // and the shift alone on an unbooked one, so the same job exported two different numbers and
  // the column could not be added up.
  "Labour hours",
  "Location",
  "Equipment",
  "Materials",
  "Conflicts"
] as const;

const dayOf = (assignment: ScheduleAssignment) => assignment.date.slice(0, 10);
export const weekdayShort = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" });
export const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/** The rows every page exports, header excluded: one per booking in scope, then one per unbooked job when asked. */
export function scheduleExportRows(scope: ExportScope): string[][] {
  const jobsById = new Map(scope.jobs.map((job) => [job.id, job]));
  const crewsById = new Map(scope.crews.map((crew) => [crew.id, crew]));
  const projectsById = new Map(scope.projects.map((project) => [project.id, project]));
  const inWindow = (day: string) => !scope.window || (day >= scope.window.start && day <= scope.window.end);
  const jobRow = (job: Job, extra: { date: string; day: string; crew: string; conflicts: string; hours: string }) => [
    extra.date,
    extra.day,
    extra.crew,
    job.name,
    projectsById.get(job.projectId)?.name ?? "",
    job.phase,
    job.status,
    job.startTime,
    job.endTime,
    String(job.requiredLabor ?? ""),
    extra.hours,
    job.location,
    job.requiredEquipment,
    job.materialsStatus,
    extra.conflicts
  ];
  const booked = new Set<string>();
  const rows = scope.assignments
    .filter((assignment) => jobsById.has(assignment.jobId) && inWindow(dayOf(assignment)))
    .sort(
      (a, b) => dayOf(a).localeCompare(dayOf(b)) || (crewsById.get(a.crewId)?.name ?? "").localeCompare(crewsById.get(b.crewId)?.name ?? "")
    )
    .map((assignment) => {
      const job = jobsById.get(assignment.jobId)!;
      booked.add(job.id);
      return jobRow(job, {
        date: dayOf(assignment),
        day: weekdayShort(dayOf(assignment)),
        crew: crewsById.get(assignment.crewId)?.name ?? assignment.crewId,
        conflicts: assignment.conflicts.join("; "),
        hours: showHours(bookingLaborHours(job))
      });
    });
  if (scope.includeUnbooked) {
    for (const job of [...scope.jobs].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name))) {
      // the same measure as a booked row: what the job asks for, whether or not a crew is on it yet
      if (!booked.has(job.id))
        rows.push(jobRow(job, { date: "", day: "", crew: "", conflicts: "", hours: showHours(bookingLaborHours(job)) }));
    }
  }
  return rows;
}

export function toCsv(rows: string[][], columns: readonly string[] = EXPORT_COLUMNS): string {
  const cell = (value: string) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [columns, ...rows].map((row) => row.map(cell).join(",")).join("\n");
}

/** Hands the browser a CSV to save. Quiet under jsdom, where there is no URL.createObjectURL. */
export function downloadCsv(filename: string, csv: string): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined" || !("createObjectURL" in URL)) return false;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(href);
  return true;
}

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m] ?? m);

/** A printable page per crew: its week, day by day, with the jobs it is booked on. */
export function weekSheetHtml(input: {
  title: string;
  weekDays: string[];
  crews: Crew[];
  assignments: ScheduleAssignment[];
  jobs: Job[];
  projects: Project[];
}): string {
  const jobsById = new Map(input.jobs.map((job) => [job.id, job]));
  const projectsById = new Map(input.projects.map((project) => [project.id, project]));
  const range = `${dayLabel(input.weekDays[0])} – ${dayLabel(input.weekDays[input.weekDays.length - 1])}`;
  const sheets = input.crews.map((crew) => {
    const rows = input.weekDays
      .map((day) => {
        const bookings = input.assignments.filter((assignment) => assignment.crewId === crew.id && dayOf(assignment) === day);
        const cells = bookings.length
          ? bookings
              .map((assignment) => {
                const job = jobsById.get(assignment.jobId);
                if (!job) return "";
                const project = projectsById.get(job.projectId)?.name ?? "";
                return `<div class="job"><strong>${escapeHtml(job.name)}</strong><span>${escapeHtml(project)}${project && job.phase ? " · " : ""}${escapeHtml(job.phase)}</span><span>${escapeHtml(job.startTime)} – ${escapeHtml(job.endTime)} · ${escapeHtml(job.location)}</span>${assignment.conflicts.length ? `<em>${escapeHtml(assignment.conflicts.join(", "))}</em>` : ""}</div>`;
              })
              .join("")
          : '<div class="free">—</div>';
        return `<tr><th>${escapeHtml(dayLabel(day))}</th><td>${cells}</td></tr>`;
      })
      .join("");
    return `<section class="sheet"><header><h1>${escapeHtml(crew.name)}</h1><p>${escapeHtml(crew.specialty)} · foreman ${escapeHtml(crew.lead)} · ${escapeHtml(range)}</p></header><table>${rows}</table><footer>${escapeHtml(input.title)} · printed ${new Date().toLocaleDateString("en-US")}</footer></section>`;
  });
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(input.title)}</title><style>
    @page { margin: 14mm; }
    body { margin: 0; font: 13px/1.4 Inter, system-ui, -apple-system, sans-serif; color: #14203a; }
    .sheet { page-break-after: always; padding: 8px 0 24px; }
    .sheet:last-child { page-break-after: auto; }
    header h1 { margin: 0; font-size: 22px; }
    header p { margin: 4px 0 14px; color: #575550; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-top: 1px solid #d9dde8; padding: 8px 10px; vertical-align: top; text-align: left; }
    th { width: 118px; white-space: nowrap; color: #575550; font-weight: 600; }
    .job { padding: 2px 0 6px; }
    .job strong { display: block; font-size: 13.5px; }
    .job span { display: block; color: #575550; font-size: 12px; }
    .job em { display: block; color: #c5221f; font-size: 12px; font-style: normal; }
    .free { color: #a5adbf; }
    footer { margin-top: 14px; color: #8a92a6; font-size: 11px; }
  </style></head><body>${sheets.join("")}</body></html>`;
}

/** Prints a standalone document through a hidden frame — the browser's print dialog saves it as PDF. */
export function printHtml(html: string): boolean {
  if (typeof document === "undefined") return false;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.srcdoc = html;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      window.setTimeout(() => frame.remove(), 60_000);
    }
  };
  document.body.appendChild(frame);
  return true;
}
