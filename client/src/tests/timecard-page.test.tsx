/**
 * The TimeCard page, rebuilt on the Month and Crews pages' language (2026-09-25).
 *
 * The request was a redesign that kept "all the same information", so the first two cases are the
 * inventory: the head, the four summary figures, the seven sections and every card each one had.
 * A redesign that dropped a card would look finished in a screenshot of the section you happened
 * to be on; this reads all seven.
 *
 * The rest pin what the redesign changed in behaviour, each of which was a gap in the old page:
 * the sections are real tabs you can walk with the arrow keys, the four jobsite shortcuts edit the
 * form instead of doing nothing, an entry you add shows up at the top of Recent entries instead of
 * below eleven others, and Export writes the week out instead of being a button with no handler.
 *
 * Since the same day the page opens on an eighth section, Team's time, which reads the Members' own
 * time from the server (tests/timecard-team.test.tsx). Here it answers with an empty week, so these
 * cases stay about the sample sections they were written for.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { TimeCardPage } from "../TimeCard";
import { buildTimecardModel, entryHours } from "../timecardModel";
import { bootstrapFixture } from "../test/fixture";

const SECTIONS: Array<[name: string, cards: string[]]> = [
  ["Team's time", ["The week, person by person", "Team's entries", "No time put in"]],
  ["Time Entry", ["This week, person by person", "Log time", "Recent entries"]],
  ["Labor Cost", ["Labor cost breakdown", "Cost composition", "Project profitability impact", "Overtime flags", "Hourly rates by role"]],
  ["Crew & Assignment", ["Attendance verification", "Crew rosters & skills", "Crew productivity"]],
  ["Approvals", ["Approval queue", "Audit trail"]],
  ["Integrations", ["Connected BuildFlow modules", "Schedule vs. actual"]],
  ["Reporting", ["Labor variance", "Cost analysis", "Labor cost trend", "Labor forecastIQ", "Productivity trend", "Payroll export"]],
  ["Compliance", ["Certified payroll", "Worker classification", "Lien law compliance", "Prevailing wage scales"]]
];

const tab = (name: string) => screen.getByRole("tab", { name: new RegExp(`^${name.replace(/[&.]/g, "\\$&")}`) });

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ entries: [], people: [] }), { status: 200 }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the TimeCard page keeps everything it showed", () => {
  it("has its head, the four summary figures and all eight sections", async () => {
    render(<TimeCardPage data={bootstrapFixture} />);

    expect(screen.getByRole("heading", { level: 1, name: "TimeCard" })).toBeInTheDocument();
    expect(screen.getByText(/Daily labor hours, cost, approvals, and certified-payroll compliance/)).toBeInTheDocument();

    // the team's own week opens first, with four figures of its own
    const team = screen.getByLabelText("Your team's week");
    for (const label of ["Hours put in", "People with time in", "Overtime", "Timecards approved"]) {
      expect(within(team).getByText(label)).toBeInTheDocument();
    }
    await screen.findByText("Nobody puts their own time in here yet.", { exact: false });

    fireEvent.click(tab("Time Entry"));
    const summary = screen.getByLabelText("TimeCard summary");
    for (const label of ["Hours logged this week", "Burdened labor cost", "Overtime pending approval", "Timecards awaiting approval"]) {
      expect(within(summary).getByText(label)).toBeInTheDocument();
    }

    const sections = within(screen.getByRole("tablist", { name: "TimeCard sections" })).getAllByRole("tab");
    expect(sections.map((section) => section.textContent?.replace(/\d+$/, ""))).toEqual(SECTIONS.map(([name]) => name));
  });

  it("shows every card each section had", () => {
    render(<TimeCardPage data={bootstrapFixture} />);

    for (const [name, cards] of SECTIONS) {
      fireEvent.click(tab(name));
      const panel = screen.getByRole("tabpanel");
      expect(panel, `${name} is the section on show`).toHaveAccessibleName(new RegExp(`^${name.replace(/[&.]/g, "\\$&")}`));
      for (const card of cards) {
        expect(within(panel).getByRole("heading", { level: 3, name: card }), `${name} → ${card}`).toBeInTheDocument();
      }
    }
  });

  it("keeps the approval chain's four levels and the payroll formats", () => {
    render(<TimeCardPage data={bootstrapFixture} />);

    fireEvent.click(tab("Approvals"));
    const queue = screen.getByRole("region", { name: "Approval queue" });
    for (const level of ["Crew Lead", "Superintendent", "Project Manager", "Accounting"]) {
      expect(within(queue).getAllByText(level).length).toBeGreaterThan(0);
    }

    fireEvent.click(tab("Reporting"));
    const payroll = screen.getByRole("region", { name: "Payroll export" });
    for (const format of ["ADP", "Paychex", "QuickBooks", "CSV"]) expect(within(payroll).getByText(format)).toBeInTheDocument();
  });
});

describe("what the redesign made work", () => {
  /* Asked for on 2026-09-25: each person's hours rather than a crew's total. The crew stays as the
     line under a person's name, so nothing it said is lost. */
  it("lays the sample week out person by person, not crew by crew", () => {
    render(<TimeCardPage data={bootstrapFixture} />);
    fireEvent.click(tab("Time Entry"));
    const grid = screen.getByRole("table", { name: /Hours logged by each person/ });
    const model = buildTimecardModel(bootstrapFixture);

    const people = [...grid.querySelectorAll("tbody .tc-week-crew-name")].map((name) => name.textContent);
    expect(people).toEqual(model.workers.map((worker) => worker.name));
    const [first] = model.workers;
    const row = within(grid).getAllByRole("row")[1];
    expect(row).toHaveTextContent(`${model.crews.find((crew) => crew.id === first.crewId)?.name} · ${first.role}`);
    // the week at the end of a person's row is their own entries, and nobody else's
    const own = model.entries.filter((entry) => entry.workerId === first.id).reduce((sum, entry) => sum + entryHours(entry), 0);
    expect(within(row).getAllByRole("cell").at(-1)).toHaveTextContent(new RegExp(`^${Math.round(own)}hrs`));
  });

  it("walks the sections with the arrow keys, as one tab stop", () => {
    render(<TimeCardPage data={bootstrapFixture} />);
    const first = tab("Team's time");
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(first).toHaveAttribute("tabindex", "0");
    expect(tab("Time Entry")).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(tab("Time Entry")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tab("Time Entry"), { key: "End" });
    expect(tab("Compliance")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tab("Compliance"), { key: "ArrowRight" });
    expect(tab("Team's time"), "the arrows wrap round").toHaveAttribute("aria-selected", "true");
  });

  it("makes the jobsite shortcuts edit the form", () => {
    render(<TimeCardPage data={bootstrapFixture} />);
    fireEvent.click(tab("Time Entry"));
    const regular = screen.getByLabelText("Regular hours") as HTMLInputElement;
    const overtime = screen.getByLabelText("Overtime hours") as HTMLInputElement;
    expect(regular.value).toBe("8");

    fireEvent.click(screen.getByRole("button", { name: "Add 30 min break" }));
    expect(regular.value).toBe("7.5");
    fireEvent.click(screen.getByRole("button", { name: "Clock 8 hrs" }));
    expect(regular.value).toBe("8");
    fireEvent.click(screen.getByRole("button", { name: "Start OT" }));
    expect(overtime.value).toBe("1");
  });

  it("puts an entry you add at the top of Recent entries", () => {
    render(<TimeCardPage data={bootstrapFixture} />);
    fireEvent.click(tab("Time Entry"));
    const worker = (screen.getByLabelText("Worker") as HTMLSelectElement).selectedOptions[0].textContent ?? "";
    const name = worker.split(" · ")[0];
    const before = tab("Time Entry").textContent;

    fireEvent.click(screen.getByRole("button", { name: "Add entry" }));

    expect(screen.getByRole("status")).toHaveTextContent("Entry added and submitted for approval.");
    const recent = screen.getByRole("region", { name: "Recent entries" });
    const [, firstRow] = within(recent).getAllByRole("row");
    expect(firstRow).toHaveClass("tc-row-new");
    expect(firstRow).toHaveTextContent(name);
    expect(firstRow).toHaveTextContent("Submitted");
    // and the section's count went up by one
    expect(Number(tab("Time Entry").textContent?.match(/\d+$/)?.[0])).toBe(Number(before?.match(/\d+$/)?.[0]) + 1);
  });

  it("exports the week's entries as a CSV named for the sample week", async () => {
    const blobs: Blob[] = [];
    // jsdom has neither; both are put back after the case, so no other case sees the fakes
    const { createObjectURL, revokeObjectURL } = URL;
    onTestFinished(() => {
      Object.assign(URL, { createObjectURL, revokeObjectURL });
    });
    Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => {
        blobs.push(blob);
        return "blob:timecards";
      }),
      revokeObjectURL: vi.fn()
    });
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toMatch(/^buildflow-timecards-\d{4}-\d{2}-\d{2}-sample-week\.csv$/);
    });
    render(<TimeCardPage data={bootstrapFixture} />);
    fireEvent.click(tab("Time Entry"));
    const entries = Number(tab("Time Entry").textContent?.match(/\d+$/)?.[0]);

    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(clicked).toHaveBeenCalledTimes(1);
    // jsdom's Blob has no text() and the fetch Response does not recognise it; FileReader reads it
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blobs[0]);
    });
    const lines = text.split("\n");
    expect(lines[0]).toBe("Worker,Role,Crew,Project,Phase,Task,Date,Regular hours,Overtime hours,Source,Photo,GPS,Status");
    expect(lines).toHaveLength(entries + 1);
  });
});
