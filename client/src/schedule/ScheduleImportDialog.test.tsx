/**
 * The schedule import dialog: a dropped P6 / MS Project file is previewed through
 * the API, the preview's numbers, sample rows and warnings show, the import commits
 * and reports what it made — and a .mpp is refused before any request.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Api from "../api";
import type { ScheduleHealth, ScheduleImportPreview, ScheduleImportResult } from "../api";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof Api>();
  return { ...actual, previewScheduleImport: vi.fn(), commitScheduleImport: vi.fn() };
});

import { ScheduleImportRequestError, commitScheduleImport, previewScheduleImport } from "../api";
import { ScheduleImportDialog } from "./ScheduleImportDialog";

// jsdom's File may lack text(); the dialog reads a dropped file with it
if (typeof File !== "undefined" && typeof File.prototype.text !== "function") {
  File.prototype.text = function text(this: Blob) {
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(this);
    });
  };
}

const health: ScheduleHealth = {
  score: 82,
  grade: "Healthy",
  headline: "On track",
  dataDate: "2026-06-15",
  stats: { activities: 12, complete: 2, inProgress: 3, notStarted: 7, milestones: 1, relationships: 9 },
  findings: [],
  forecastIQ: {
    dataDate: "2026-06-15",
    plannedFinish: "2026-09-30",
    projectedFinish: "2026-09-30",
    slipDays: 0,
    percentComplete: 20,
    percentTimeElapsed: 18,
    scheduleIndex: 1.1,
    status: "on_track",
    method: "earned schedule"
  }
};
const preview: ScheduleImportPreview = {
  format: "mspdi",
  source: "Microsoft Project XML",
  warnings: ["Crew assignments, materials status, and work hours aren't part of a P6/Project export — jobs land unassigned with defaults."],
  health,
  stats: { activitiesRead: 14, jobs: 12, phases: 3, milestones: 1, summariesSkipped: 1, undatedSkipped: 1, relationships: 9 },
  projects: [
    {
      name: "Riverside Office Building",
      targetCompletion: "2026-09-30",
      phases: [{ name: "Foundations", startDate: "2026-06-15", endDate: "2026-07-10" }],
      jobCount: 12,
      sampleJobs: [{ name: "Slab pour", phase: "Foundations", startDate: "2026-06-15", endDate: "2026-06-17", status: "Planned" }]
    }
  ]
};
const result: ScheduleImportResult = {
  format: "mspdi",
  source: "Microsoft Project XML",
  warnings: [],
  health,
  created: { projects: [{ id: "p-new", name: "Riverside Office Building", slug: "riverside" }], jobs: 12, phases: 3 }
};
const xml = "<Project><Name>Riverside</Name></Project>";

/** Drops a file on the dialog's zone the way a browser would. */
const dropFile = (name: string, content = xml) => {
  const zone = document.querySelector(".sim-drop");
  if (!zone) throw new Error("the drop zone is not showing");
  fireEvent.drop(zone, { dataTransfer: { files: [new File([content], name, { type: "text/xml" })] } });
};

describe("ScheduleImportDialog", () => {
  beforeEach(() => {
    vi.mocked(previewScheduleImport).mockReset();
    vi.mocked(commitScheduleImport).mockReset();
  });

  it("previews a dropped file through the API, then imports it and reports what it made", async () => {
    vi.mocked(previewScheduleImport).mockResolvedValue(preview);
    vi.mocked(commitScheduleImport).mockResolvedValue(result);
    const onImported = vi.fn(async () => {});
    render(<ScheduleImportDialog onClose={vi.fn()} onImported={onImported} defaultLocation="Austin, TX" />);
    expect(screen.getByRole("dialog", { name: "Import a schedule" })).toBeInTheDocument();

    dropFile("plan.xml");
    await waitFor(() =>
      expect(previewScheduleImport).toHaveBeenCalledWith({ filename: "plan.xml", content: xml, defaultLocation: "Austin, TX" })
    );
    expect(await screen.findByText("Microsoft Project XML")).toBeInTheDocument();
    expect(screen.getByText("jobs to create").previousElementSibling).toHaveTextContent("12");
    expect(screen.getByText(/jobs land unassigned/)).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Slab pour" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Import & see full health check" }));
    await waitFor(() =>
      expect(commitScheduleImport).toHaveBeenCalledWith({ filename: "plan.xml", content: xml, defaultLocation: "Austin, TX" })
    );
    expect(await screen.findByText("Imported", { exact: false, selector: "span" })).toHaveTextContent(
      "Imported 12 jobs and 3 phases into Riverside Office Building"
    );
    expect(onImported).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "View my projects" })).toBeInTheDocument();
  });

  it("refuses a .mpp before any request, with the way out", async () => {
    render(<ScheduleImportDialog onClose={vi.fn()} onImported={vi.fn()} />);
    dropFile("plan.mpp");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("MS Project .mpp files can't be read directly");
    expect(alert).toHaveTextContent("Save As");
    expect(previewScheduleImport).not.toHaveBeenCalled();
  });

  it("shows the server's reason and hint when the preview fails, and goes back to choosing a file", async () => {
    vi.mocked(previewScheduleImport).mockRejectedValue(
      new ScheduleImportRequestError("That file is not a P6 export.", "Export with File → Export → Primavera PM (XER).")
    );
    render(<ScheduleImportDialog onClose={vi.fn()} onImported={vi.fn()} />);
    dropFile("plan.xer", "not a schedule");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That file is not a P6 export.");
    expect(alert).toHaveTextContent("Export with File → Export → Primavera PM (XER).");
    expect(screen.getByText("Drop your schedule file here")).toBeInTheDocument();
    expect(commitScheduleImport).not.toHaveBeenCalled();
  });
});
