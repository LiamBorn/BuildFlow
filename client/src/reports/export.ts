/**
 * What the Reports page's Export button hands over.
 *
 * The button had a Download icon and no onClick at all, so it looked like the way to get the
 * numbers out and was the one thing on the page that did nothing whatsoever.
 *
 * One flat table rather than four stapled together, because a CSV with several header rows stops
 * being a CSV the moment anything tries to parse it. Every row says which section it belongs to,
 * and planned and actual hours are separate rows rather than two value columns, so the shape is the
 * same all the way down and a pivot table can do the rest.
 *
 * The provenance rows are not decoration. These are hours and percentages with no units visible in
 * the numbers themselves, and a file of them with no date and no window is exactly what gets read
 * six weeks later as covering something it never covered. The same two windows the charts print
 * under their titles are written into the file.
 */
import type { ReportPeriod, ReportSeries } from "./series";
import { PERIOD_LABEL } from "./series";

export const REPORT_CSV_COLUMNS = ["Section", "Item", "Value", "Notes"] as const;

export type ReportMetric = { label: string; value: string; basis: string };

export function reportCsvRows(input: { metrics: ReportMetric[]; series: ReportSeries; period: ReportPeriod; today: string }): string[][] {
  const { metrics, series, period, today } = input;
  const rows: string[][] = [
    ["Report", "Generated", today, ""],
    ["Report", "Period", PERIOD_LABEL[period], ""],
    ["Report", "Planned vs actual window", series.window.past, ""],
    ["Report", "Backlog window", series.window.future, ""]
  ];

  for (const metric of metrics) rows.push(["Summary", metric.label, metric.value, metric.basis]);

  /* An empty series says so in the file. Leaving the section out entirely would read as though the
     export had lost it, and reading it as a zero would be worse. */
  if (series.plannedActual.length === 0) {
    rows.push(["Planned vs actual hours", "No months to compare yet", "", "Actual hours need a job the field reported starting"]);
  }
  for (const point of series.plannedActual) {
    rows.push(["Planned vs actual hours", `${point.month} planned`, String(point.planned), ""]);
    rows.push(["Planned vs actual hours", `${point.month} actual`, String(point.actual), ""]);
  }

  if (series.backlog.length === 0) {
    rows.push(["Backlog hours", "Nothing outstanding", "", "No unfinished job has hours left in this window"]);
  }
  for (const point of series.backlog) rows.push(["Backlog hours", point.month, String(point.backlog), ""]);

  if (series.crews.length === 0) rows.push(["Crew utilization", "No crews yet", "", ""]);
  for (const crew of series.crews) rows.push(["Crew utilization", crew.name, `${crew.value}%`, "Current utilization"]);

  return rows;
}

/** buildflow-reports-2026-09-23-last-6-months.csv — the date and window are in the name too. */
export function reportFilename(today: string, period: ReportPeriod) {
  return `buildflow-reports-${today}-${period}.csv`;
}
