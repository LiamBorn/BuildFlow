/**
 * The Reports page's period select, as a control rather than an ornament.
 *
 * It shipped as `<select defaultValue="last-6-months">` with three options and no onChange. Picking
 * "Last Quarter" did nothing at all: no state, no re-render, no different months. A reader had every
 * reason to believe the charts beside it answered to it.
 *
 * report-series.test.ts covers the windowing arithmetic. This covers the wire: that turning the
 * control in a real render reaches the charts. Without it, `buildReportSeries` could take a period
 * perfectly and the select could still be connected to nothing, which is exactly the bug that was
 * there before.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../App";
import { enterDashboard, installAppHarness, openAppPage } from "../test/appHarness";

async function openReports() {
  render(<App />);
  await enterDashboard();
  await openAppPage("Reports");
  return screen.findByRole("heading", { name: "Reports" });
}

describe("the Reports period select", () => {
  installAppHarness();

  it("starts on six months and says so beside the chart", async () => {
    await openReports();
    expect(screen.getByLabelText("Report period")).toHaveValue("last-6-months");
    expect(await screen.findByText("last 6 months")).toBeInTheDocument();
    expect(screen.getByText("next 6 months")).toBeInTheDocument();
  });

  it("changes what the charts show when it is used", async () => {
    await openReports();
    fireEvent.change(screen.getByLabelText("Report period"), { target: { value: "last-quarter" } });

    expect(await screen.findByText("last 3 months")).toBeInTheDocument();
    expect(screen.getByText("next 3 months")).toBeInTheDocument();
    expect(screen.queryByText("last 6 months"), "the old window must not linger").not.toBeInTheDocument();
  });

  it("reads year to date as this calendar year, forward and back", async () => {
    await openReports();
    fireEvent.change(screen.getByLabelText("Report period"), { target: { value: "year-to-date" } });

    expect(await screen.findByText("year to date")).toBeInTheDocument();
    expect(screen.getByText("rest of this year")).toBeInTheDocument();
  });

  it("leaves crew efficiency labelled as a snapshot, since the period does not reach it", async () => {
    await openReports();
    expect(screen.getByText("current utilization")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Report period"), { target: { value: "last-quarter" } });
    // still a snapshot: it must not start claiming to cover the chosen window
    expect(await screen.findByText("current utilization")).toBeInTheDocument();
  });
});
