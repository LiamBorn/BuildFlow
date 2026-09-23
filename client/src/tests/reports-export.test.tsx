/**
 * The Reports page's Export button, which used to be a Download icon attached to nothing.
 *
 * Two halves, because either alone would have let the original bug through: the rows the file is
 * built from, and that pressing the button actually produces a file. jsdom has no
 * URL.createObjectURL — downloadCsv returns false and stays quiet rather than throwing — so the
 * click half stubs it and reads the Blob back out. Without that stub a test can "pass" against a
 * button that silently does nothing, which is what was shipped.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../App";
import { enterDashboard, installAppHarness, openAppPage } from "../test/appHarness";
import { REPORT_CSV_COLUMNS, reportCsvRows, reportFilename } from "../reports/export";
import { toCsv } from "../schedule/export";
import type { ReportSeries } from "../reports/series";

const series = (over: Partial<ReportSeries> = {}): ReportSeries => ({
  plannedActual: [{ month: "Aug", planned: 200, actual: 180 }],
  backlog: [{ month: "Sep", backlog: 90 }],
  crews: [{ name: "Concrete", value: 80 }],
  window: { past: "last 6 months", future: "next 6 months" },
  ...over
});
const metrics = [{ label: "On-Time Completion Rate", value: "67%", basis: "2 of 3 finished jobs" }];

/** jsdom's Blob has no .text(); FileReader is how you get the bytes back out of one here. */
const blobText = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
const rowsFor = (s: ReportSeries) =>
  reportCsvRows({ metrics, series: s, period: "last-6-months", today: "2026-09-23" });

describe("the report CSV", () => {
  it("writes the date and both windows into the file, not just the filename", () => {
    const rows = rowsFor(series());
    expect(rows).toContainEqual(["Report", "Generated", "2026-09-23", ""]);
    expect(rows).toContainEqual(["Report", "Period", "Last 6 Months", ""]);
    expect(rows).toContainEqual(["Report", "Planned vs actual window", "last 6 months", ""]);
    expect(rows).toContainEqual(["Report", "Backlog window", "next 6 months", ""]);
  });

  it("carries each summary figure with the basis shown on screen", () => {
    expect(rowsFor(series())).toContainEqual(["Summary", "On-Time Completion Rate", "67%", "2 of 3 finished jobs"]);
  });

  it("splits planned and actual into rows, so every row has the same shape", () => {
    const rows = rowsFor(series());
    expect(rows).toContainEqual(["Planned vs actual hours", "Aug planned", "200", ""]);
    expect(rows).toContainEqual(["Planned vs actual hours", "Aug actual", "180", ""]);
  });

  it("says a section is empty instead of leaving it out, which would read as lost", () => {
    const rows = rowsFor(series({ plannedActual: [], backlog: [], crews: [] }));
    expect(rows.map((r) => r[1])).toEqual(
      expect.arrayContaining(["No months to compare yet", "Nothing outstanding", "No crews yet"])
    );
    // and nothing anywhere reads as a zero measurement
    expect(rows.filter((r) => r[2] === "0")).toEqual([]);
  });

  it("names the file with the date and the period", () => {
    expect(reportFilename("2026-09-23", "last-quarter")).toBe("buildflow-reports-2026-09-23-last-quarter.csv");
  });

  it("quotes every cell, so a comma in a basis cannot shift a column", () => {
    const csv = toCsv(
      reportCsvRows({
        metrics: [{ label: "Active Backlog", value: "$1.2M", basis: "Unbuilt value, 3 of 5 projects priced" }],
        series: series(),
        period: "last-6-months",
        today: "2026-09-23"
      }),
      REPORT_CSV_COLUMNS
    );
    expect(csv).toContain('"Unbuilt value, 3 of 5 projects priced"');
    expect(csv.split("\n")[0]).toBe('"Section","Item","Value","Notes"');
  });
});

describe("the Export button", () => {
  installAppHarness();

  it("hands the browser a CSV of what is on the page", async () => {
    const blobs: Blob[] = [];
    const clicked: string[] = [];
    /* Patch the two static methods, do NOT replace URL itself: spreading the class into an object
       loses its constructor, and `new URL(...)` then throws somewhere else entirely — the first
       version of this test broke MeetingsPanel that way and reported a missing search box. */
    const urlWithBlobs = URL as unknown as {
      createObjectURL?: (blob: Blob) => string;
      revokeObjectURL?: (href: string) => void;
    };
    const hadCreate = urlWithBlobs.createObjectURL;
    const hadRevoke = urlWithBlobs.revokeObjectURL;
    urlWithBlobs.createObjectURL = (blob: Blob) => {
      blobs.push(blob);
      return "blob:report";
    };
    urlWithBlobs.revokeObjectURL = () => undefined;
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      clicked.push(this.download);
    };
    try {
      render(<App />);
      await enterDashboard();
      await openAppPage("Reports");
      await screen.findByRole("heading", { name: "Reports" });

      fireEvent.click(screen.getByRole("button", { name: /Export/ }));

      expect(clicked, "the button must actually hand over a file").toHaveLength(1);
      expect(clicked[0]).toMatch(/^buildflow-reports-\d{4}-\d{2}-\d{2}-last-6-months\.csv$/);
      const text = await blobText(blobs[0]);
      expect(text.split("\n")[0]).toBe('"Section","Item","Value","Notes"');
      expect(text).toContain('"Report","Period","Last 6 Months",""');
      expect(text).toContain('"Crew utilization"');
    } finally {
      HTMLAnchorElement.prototype.click = realClick;
      if (hadCreate) urlWithBlobs.createObjectURL = hadCreate;
      else delete urlWithBlobs.createObjectURL;
      if (hadRevoke) urlWithBlobs.revokeObjectURL = hadRevoke;
      else delete urlWithBlobs.revokeObjectURL;
    }
  });
});
