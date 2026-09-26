/**
 * Team's time: an Owner's and an Admin's view of the time the Members put in (2026-09-25).
 *
 * Until this, time a Member put in reached nobody: the Owner's TimeCard was a sample week from end
 * to end. Now its first section is the team's own week, read from the server a week at a time —
 * a person to a row with every day's hours, the entries behind them, and who has put nothing in —
 * and while it is open the page's head says the figures are real rather than a preview.
 *
 * What is pinned: that it opens there and asks for the right week; that every Member has a row even
 * with no time, since the gaps are half of what it is for; that a day's overtime is counted per
 * person and said once; that a person can be picked from the grid or the list; that stepping back a
 * week asks for that week and names it; the payroll export; a failed load that can be tried again;
 * a removed person's time keeping their name; and that a Member is never shown any of it.
 *
 * And, asked for the same day, each person's timecard approved from the end of their row: exactly
 * the entries still waiting on show are sent, the row and the entries say it is approved and by
 * whom, time that came in after an approval is said to be new, an approval can be reopened, and a
 * refusal is said and leaves the button there to try again.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { localIsoDate, type BootstrapPayload, type PermissionLevel, type TimeEntry, type User } from "@buildflow/shared";
import { TimeCardPage } from "../TimeCard";
import { weekDays } from "../schedule/scheduleUtils";
import { bootstrapFixture } from "../test/fixture";

const as = (permission: PermissionLevel): BootstrapPayload => ({
  ...bootstrapFixture,
  activeUser: { ...bootstrapFixture.activeUser!, permission }
});

/** The day `days` after `iso` on the calendar (before it, when negative). */
const shift = (iso: string, days: number) => {
  const day = new Date(`${iso}T00:00:00`);
  day.setDate(day.getDate() + days);
  return localIsoDate(day);
};

const today = localIsoDate();
/** A day of this week that has already come: Monday, unless today is the Monday itself. */
const earlier = weekDays.find((day) => day.date < today)?.date ?? today;

const person = (over: Partial<User>): User => ({
  id: "u-someone",
  name: "Someone",
  permission: "member",
  title: "Teammate",
  avatar: "SO",
  accountId: "acct-someone",
  ...over
});
const carlos = person({ id: "u-carlos", name: "Carlos Ramirez", avatar: "CR", accountId: "acct-carlos" });
const priya = person({ id: "u-priya", name: "Priya Shah", avatar: "PS", accountId: "acct-priya" });
const matt = person({ id: "u-matt", name: "Matt Johnson", permission: "owner", title: "Owner", avatar: "MJ", accountId: "acct-matt" });

let made = 0;
const entry = (over: Partial<TimeEntry> = {}): TimeEntry => ({
  id: `te-${(made += 1)}`,
  accountId: "acct-carlos",
  userId: "u-carlos",
  date: earlier,
  clockIn: "07:00",
  clockOut: "15:30",
  breakMinutes: 30,
  projectId: null,
  notes: "",
  status: "Submitted",
  approvedBy: null,
  approvedAt: null,
  createdAt: new Date(`${earlier}T16:00:00`).toISOString(),
  ...over
});

/** Carlos's day in two stretches: ten hours, two of them overtime. */
const longDay = () => [
  entry({ clockIn: "06:30", clockOut: "11:00", breakMinutes: 0 }),
  entry({ clockIn: "11:30", clockOut: "17:00", breakMinutes: 0 })
];

/**
 * The server's team routes, as far as these cases need them: the entries in the days asked for and
 * the people, after `failures` refusals; approving and reopening by id, which change what the next
 * read of the week says. It records every week it is asked for and every decision sent to it.
 */
function pretendTeam(
  entries: TimeEntry[],
  people: User[],
  failures = 0,
  {
    refuseDecisions = false,
    arrivesMeanwhile,
    rereads
  }: { refuseDecisions?: boolean; arrivesMeanwhile?: TimeEntry; rereads?: Promise<void> } = {}
) {
  const asked: Array<{ from: string; to: string }> = [];
  const urls: string[] = [];
  const decided: Array<{ verb: string; ids: string[] }> = [];
  let failing = failures;
  let held = [...entries];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(input));
      const url = new URL(String(input), "http://localhost");
      const verb = /^\/api\/time-entries\/(approve|reopen)$/.exec(url.pathname)?.[1];
      if (verb) {
        const ids = (JSON.parse(String(init?.body)) as { ids: string[] }).ids;
        decided.push({ verb, ids });
        if (refuseDecisions) return new Response(JSON.stringify({ error: "The server is having a moment." }), { status: 500 });
        // a Member putting time in while the approver was looking at the page
        if (arrivesMeanwhile && !held.some((item) => item.id === arrivesMeanwhile.id)) held = [arrivesMeanwhile, ...held];
        held = held.map((item) =>
          !ids.includes(item.id)
            ? item
            : verb === "approve"
              ? { ...item, status: "Approved", approvedBy: "acct-matt", approvedAt: new Date().toISOString() }
              : { ...item, status: "Submitted", approvedBy: null, approvedAt: null }
        );
        return new Response(JSON.stringify({ entries: held.filter((item) => ids.includes(item.id)) }), { status: 200 });
      }
      if (url.pathname !== "/api/time-entries/team") return new Response(JSON.stringify({ entries: [] }), { status: 200 });
      const from = url.searchParams.get("from") ?? "";
      const to = url.searchParams.get("to") ?? "";
      asked.push({ from, to });
      // every read of the week after the first waits for the case to let it through
      if (rereads && asked.length > 1) await rereads;
      if (failing > 0) {
        failing -= 1;
        return new Response(JSON.stringify({ error: "The server is having a moment." }), { status: 500 });
      }
      return new Response(JSON.stringify({ entries: held.filter((item) => item.date >= from && item.date <= to), people }), {
        status: 200
      });
    })
  );
  return { asked, urls, decided };
}

const tab = (name: string) => screen.getByRole("tab", { name: new RegExp(`^${name.replace(/[&.]/g, "\\$&")}`) });
const tile = (label: string) => within(screen.getByLabelText("Your team's week")).getByText(label).closest(".hs-kpi");
const theWeek = () => screen.findByRole("table", { name: /Hours each person put in/ });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("an Owner's and an Admin's TimeCard opens on the team's time", () => {
  it("asks for this week, and says the figures are the workspace's own", async () => {
    for (const level of ["owner", "admin"] as const) {
      const { asked } = pretendTeam(longDay(), [carlos, priya]);
      const { unmount } = render(<TimeCardPage data={as(level)} />);

      expect(tab("Team's time"), level).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("note")).toHaveTextContent(/none of it is sample/);
      // the title's tag says whose view it is, not "Preview"
      expect(document.querySelector(".tc-title-tag")).toHaveTextContent(level === "owner" ? "Owner" : "Admin");
      await waitFor(() => expect(tile("People with time in")).toHaveTextContent("1 of 2"));
      expect(asked[0]).toEqual({ from: weekDays[0].date, to: weekDays[6].date });
      unmount();
      vi.unstubAllGlobals();
    }
  });

  it("goes back to saying Preview on the sample sections", async () => {
    pretendTeam([], [carlos]);
    render(<TimeCardPage data={as("owner")} />);
    await screen.findByText("Nobody has put time in for this week yet.");

    fireEvent.click(tab("Time Entry"));
    expect(screen.getByRole("note")).toHaveTextContent(/built-in sample week/);
    expect(document.querySelector(".tc-title-tag")).toHaveTextContent("Preview");
    expect(screen.getByLabelText("TimeCard summary")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Week" })).toBeNull();
  });
});

describe("the team's week", () => {
  it("has a row for every Member, with their hours day by day, and who has put nothing in", async () => {
    pretendTeam(longDay(), [carlos, priya, matt]);
    render(<TimeCardPage data={as("owner")} />);
    const grid = await theWeek();

    // a row per Member whether or not they put time in; the Owner put none in and has no row
    expect([...grid.querySelectorAll(".tc-week-person .tc-week-crew-name")].map((name) => name.textContent)).toEqual([
      "Carlos Ramirez",
      "Priya Shah"
    ]);
    const column = weekDays.findIndex((day) => day.date === earlier);
    const hisDays = within(
      within(grid)
        .getByRole("button", { name: /^Carlos Ramirez/ })
        .closest("tr")!
    ).getAllByRole("cell");
    expect(hisDays[column]).toHaveTextContent("10hrs+2 OT");
    expect(hisDays[7], "the week's total").toHaveTextContent("10hrs+2 OT");
    const herDays = within(
      within(grid)
        .getByRole("button", { name: /^Priya Shah/ })
        .closest("tr")!
    ).getAllByRole("cell");
    // seven days, the week, and a timecard with nothing on it to approve
    expect(herDays.map((cell) => cell.textContent)).toEqual(Array(9).fill("—"));

    const missing = screen.getByRole("region", { name: "No time put in" });
    expect(missing).toHaveTextContent("Priya Shah");
    expect(missing).not.toHaveTextContent("Carlos Ramirez");
    expect(missing).not.toHaveTextContent("Matt Johnson");

    expect(tile("Hours put in")).toHaveTextContent("10 hrs");
    expect(tile("Overtime")).toHaveTextContent("2 hrs");
    expect(tile("Timecards approved")).toHaveTextContent("0 of 1");
    expect(tile("Timecards approved")).toHaveTextContent("1 waiting on approval");
  });

  it("lists the entries a day at a time, and says a day's overtime once", async () => {
    const project = bootstrapFixture.projects[0];
    pretendTeam(
      [
        ...longDay(),
        entry({
          userId: "u-priya",
          accountId: "acct-priya",
          clockIn: "08:00",
          clockOut: "12:00",
          breakMinutes: 0,
          projectId: project.id,
          notes: "Tack coat on the west lane",
          createdAt: new Date(`${shift(earlier, 1)}T07:10:00`).toISOString()
        })
      ],
      [carlos, priya]
    );
    render(<TimeCardPage data={as("owner")} />);
    const table = await screen.findByRole("region", { name: "Team's entries" });
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(5));

    const [, day, ...rows] = within(table).getAllByRole("row");
    expect(day).toHaveTextContent(/2 people · 14 hrs$/);
    // person by person, and each person's stretches in the order they were worked
    expect(rows.map((row) => within(row).getAllByRole("cell")[1].textContent)).toEqual([
      "6:30 AM – 11:00 AM",
      "11:30 AM – 5:00 PM",
      "8:00 AM – 12:00 PM"
    ]);
    expect(within(table).getAllByText(/day \+2 OT/)).toHaveLength(1);
    expect(rows[2]).toHaveTextContent(project.name);
    expect(rows[2]).toHaveTextContent("Tack coat on the west lane");
    // put in the morning after the day worked, and said so
    expect(rows[2]).toHaveTextContent("the next day");
    expect(rows[0]).not.toHaveTextContent("the next day");
  });

  it("narrows the entries to one person, from the grid or from the list", async () => {
    pretendTeam(
      [entry(), entry({ userId: "u-priya", accountId: "acct-priya", clockIn: "08:00", clockOut: "12:00", breakMinutes: 0 })],
      [carlos, priya]
    );
    render(<TimeCardPage data={as("owner")} />);
    const table = await screen.findByRole("region", { name: "Team's entries" });
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(4));

    fireEvent.click(screen.getByRole("button", { name: /^Carlos Ramirez/ }));
    expect(screen.getByRole("button", { name: /^Carlos Ramirez/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    // the card also holds the "Whose time" list, whose options are names: look in the table itself
    expect(within(within(table).getByRole("table")).queryByText("Priya Shah")).toBeNull();
    expect(table).toHaveTextContent("Carlos Ramirez's time this week");

    // pressed again, everyone's
    fireEvent.click(screen.getByRole("button", { name: /^Carlos Ramirez/ }));
    expect(within(table).getAllByRole("row")).toHaveLength(4);

    // the list does the same, and the grid shows who it is on
    fireEvent.change(screen.getByLabelText("Whose time"), { target: { value: "u-priya" } });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(within(table).getByRole("table")).queryByText("Carlos Ramirez")).toBeNull();
    expect(screen.getByRole("button", { name: /^Priya Shah/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("steps back a week, asks for that week, and names it", async () => {
    const { asked } = pretendTeam(longDay(), [carlos]);
    render(<TimeCardPage data={as("owner")} />);
    await screen.findByText(/1 person · 10 hrs/);
    // there is no week after this one, and this one is on show
    expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "This week" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    const monday = shift(weekDays[0].date, -7);
    await waitFor(() => expect(asked.at(-1)).toEqual({ from: monday, to: shift(monday, 6) }));
    expect(await screen.findByText("Nobody put time in for that week.")).toBeInTheDocument();
    const label = new Date(`${monday}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    expect(document.querySelector(".tc-week-chip")).toHaveTextContent(label);
    expect(screen.getByRole("button", { name: "Next week" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "This week" }));
    expect(await screen.findByText(/1 person · 10 hrs/)).toBeInTheDocument();
    expect(asked.at(-1)).toEqual({ from: weekDays[0].date, to: weekDays[6].date });
  });

  it("exports the week for payroll, person by person, with a day's overtime once", async () => {
    const blobs: Blob[] = [];
    const { createObjectURL, revokeObjectURL } = URL;
    onTestFinished(() => {
      Object.assign(URL, { createObjectURL, revokeObjectURL });
    });
    Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => {
        blobs.push(blob);
        return "blob:team";
      }),
      revokeObjectURL: vi.fn()
    });
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    const [first, second] = longDay();
    const approvedAt = new Date(`${earlier}T18:30:00`).toISOString();
    pretendTeam(
      [second, { ...first, notes: "Forms, then the pour", status: "Approved", approvedBy: "acct-matt", approvedAt }],
      [carlos, priya, matt]
    );
    render(<TimeCardPage data={as("owner")} />);
    await screen.findByText(/1 person · 10 hrs/);

    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(names).toEqual([`buildflow-team-time-${weekDays[0].date}-to-${weekDays[6].date}.csv`]);
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blobs[0]);
    });
    expect(text.split("\n")).toEqual([
      "Person,Date,Clock in,Clock out,Break (minutes),Hours,Day overtime (hours),Project,Notes,Status,Approved by,Approved at,Put in at",
      `Carlos Ramirez,${earlier},06:30,11:00,0,4.5,2,,"Forms, then the pour",Approved,Matt Johnson,${approvedAt},${first.createdAt}`,
      `Carlos Ramirez,${earlier},11:30,17:00,0,5.5,,,,Submitted,,,${second.createdAt}`
    ]);
  });

  it("says so when the week cannot be loaded, and tries again", async () => {
    pretendTeam(longDay(), [carlos], 1);
    render(<TimeCardPage data={as("owner")} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The server is having a moment.");
    expect(tile("Hours put in")).toHaveTextContent("could not be loaded");
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();

    await act(async () => {
      fireEvent.click(within(alert).getByRole("button", { name: /Try again/ }));
    });
    expect(await screen.findByText(/1 person · 10 hrs/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says an answer that is not a week of time is a problem, in words, rather than breaking the page", async () => {
    /* What a server that does not know the route yet might send back: a 200 with something else
       in it — the bootstrap, or a person's own list with nobody to put it against. */
    for (const answer of [bootstrapFixture, { entries: [] }]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify(answer), { status: 200 }))
      );
      const { unmount } = render(<TimeCardPage data={as("owner")} />);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Your team's time could not be loaded: The answer from BuildFlow was incomplete."
      );
      expect(screen.getByRole("heading", { level: 1, name: "TimeCard" })).toBeInTheDocument();
      unmount();
      vi.unstubAllGlobals();
    }
  });

  it("keeps the name of someone removed since on the time they put in", async () => {
    const sam = person({
      id: "u-sam",
      name: "Sam Ortiz",
      avatar: "SO",
      accountId: null,
      permission: null,
      removedAt: "2026-09-20T10:00:00.000Z"
    });
    pretendTeam([entry({ userId: "u-sam", accountId: "acct-sam" })], [carlos, sam]);
    render(<TimeCardPage data={as("owner")} />);
    const grid = await theWeek();

    expect(within(grid).getByRole("button", { name: /^Sam Ortiz/ })).toHaveTextContent("Removed");
    // they have left, so they are not someone still to put time in
    expect(screen.getByRole("region", { name: "No time put in" })).not.toHaveTextContent("Sam Ortiz");
  });
});

describe("a Member", () => {
  it("is never shown the team's time, and never asks for it", async () => {
    const { urls } = pretendTeam(longDay(), [carlos, priya]);
    render(<TimeCardPage data={as("member")} />);
    await screen.findByText(/Nothing put in yet this week/);

    expect(screen.queryByRole("tab", { name: /Team's time/ })).toBeNull();
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((url) => url.includes("/team"))).toEqual([]);
  });
});

describe("approving a person's timecard", () => {
  const hisRow = (grid: HTMLElement) =>
    within(grid)
      .getByRole("button", { name: /^Carlos Ramirez/ })
      .closest("tr")!;

  it("approves one person's week from the end of their row, and says so everywhere", async () => {
    const his = longDay();
    const { decided } = pretendTeam(
      [...his, entry({ userId: "u-priya", accountId: "acct-priya", clockIn: "08:00", clockOut: "12:00", breakMinutes: 0 })],
      [carlos, priya, matt]
    );
    render(<TimeCardPage data={as("owner")} />);
    const grid = await theWeek();
    expect(tile("Timecards approved")).toHaveTextContent("0 of 2");

    await act(async () => {
      fireEvent.click(within(grid).getByRole("button", { name: "Approve Carlos Ramirez's timecard" }));
    });

    // exactly his entries, both of them, and nobody else's
    expect(decided).toHaveLength(1);
    expect(decided[0].verb).toBe("approve");
    expect([...decided[0].ids].sort()).toEqual(his.map((item) => item.id).sort());
    expect(await within(hisRow(grid)).findByText("Approved")).toBeInTheDocument();
    expect(within(hisRow(grid)).getByRole("button", { name: "Reopen Carlos Ramirez's timecard" })).toBeInTheDocument();
    expect(within(grid).getByRole("button", { name: "Approve Priya Shah's timecard" })).toBeEnabled();
    // the entries say so, and who approved them
    const table = within(screen.getByRole("region", { name: "Team's entries" })).getByRole("table");
    expect(within(table).getAllByText("Approved")).toHaveLength(2);
    expect(within(table).getAllByText("by Matt Johnson")).toHaveLength(2);
    expect(within(table).getAllByText("Submitted")).toHaveLength(1);
    expect(tile("Timecards approved")).toHaveTextContent("1 of 2");
    expect(grid.querySelector("tfoot")).toHaveTextContent("1 of 2 approved");
  });

  it("sends only what is still waiting, and says how much of it is new since the approval", async () => {
    const earlierApproval = entry({
      status: "Approved",
      approvedBy: "acct-matt",
      approvedAt: new Date(`${earlier}T18:00:00`).toISOString()
    });
    const since = entry({ clockIn: "16:00", clockOut: "18:00", breakMinutes: 0 });
    const { decided } = pretendTeam([earlierApproval, since], [carlos, matt]);
    render(<TimeCardPage data={as("admin")} />);
    const grid = await theWeek();

    expect(within(hisRow(grid)).getByText("1 new since approval")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(grid).getByRole("button", { name: "Approve Carlos Ramirez's timecard" }));
    });
    expect(decided).toEqual([{ verb: "approve", ids: [since.id] }]);
    expect(await within(hisRow(grid)).findByText("Approved")).toBeInTheDocument();
    expect(within(hisRow(grid)).queryByText(/new since approval/)).toBeNull();
  });

  it("shows the approval the moment the server answers, not only once the week is read again", async () => {
    let letThrough = () => {};
    const rereads = new Promise<void>((resolve) => {
      letThrough = resolve;
    });
    pretendTeam(longDay(), [carlos, matt], 0, { rereads });
    render(<TimeCardPage data={as("owner")} />);
    const grid = await theWeek();

    await act(async () => {
      fireEvent.click(within(grid).getByRole("button", { name: "Approve Carlos Ramirez's timecard" }));
    });

    // the week is still being read again; the row already says what the server said
    expect(within(hisRow(grid)).getByText("Approved")).toBeInTheDocument();
    expect(within(grid).queryByRole("button", { name: "Approve Carlos Ramirez's timecard" })).toBeNull();
    await act(async () => {
      letThrough();
    });
  });

  it("reads the week again after approving, so time put in meanwhile shows as waiting", async () => {
    const meanwhile = entry({ clockIn: "17:30", clockOut: "19:00", breakMinutes: 0 });
    const { decided } = pretendTeam(longDay(), [carlos, matt], 0, { arrivesMeanwhile: meanwhile });
    render(<TimeCardPage data={as("owner")} />);
    const grid = await theWeek();

    await act(async () => {
      fireEvent.click(within(grid).getByRole("button", { name: "Approve Carlos Ramirez's timecard" }));
    });

    // it was not among what the approver saw, so it was not approved — and now it is on show, waiting
    expect(decided[0].ids).not.toContain(meanwhile.id);
    expect(await within(hisRow(grid)).findByText("1 new since approval")).toBeInTheDocument();
    expect(within(grid).getByRole("button", { name: "Approve Carlos Ramirez's timecard" })).toBeEnabled();
  });

  it("reopens an approval made by mistake", async () => {
    const approved = longDay().map((item) => ({
      ...item,
      status: "Approved" as const,
      approvedBy: "acct-matt",
      approvedAt: new Date().toISOString()
    }));
    const { decided } = pretendTeam(approved, [carlos, matt]);
    render(<TimeCardPage data={as("owner")} />);
    const grid = await theWeek();
    expect(tile("Timecards approved")).toHaveTextContent("every timecard approved");

    await act(async () => {
      fireEvent.click(within(grid).getByRole("button", { name: "Reopen Carlos Ramirez's timecard" }));
    });

    expect(decided[0].verb).toBe("reopen");
    expect([...decided[0].ids].sort()).toEqual(approved.map((item) => item.id).sort());
    expect(await within(grid).findByRole("button", { name: "Approve Carlos Ramirez's timecard" })).toBeEnabled();
    expect(tile("Timecards approved")).toHaveTextContent("0 of 1");
  });

  it("says so when an approval is refused, and leaves the button to try again", async () => {
    pretendTeam(longDay(), [carlos], 0, { refuseDecisions: true });
    render(<TimeCardPage data={as("owner")} />);
    const grid = await theWeek();

    await act(async () => {
      fireEvent.click(within(grid).getByRole("button", { name: "Approve Carlos Ramirez's timecard" }));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Carlos Ramirez's timecard could not be approved: The server is having a moment."
    );
    expect(within(grid).getByRole("button", { name: "Approve Carlos Ramirez's timecard" })).toBeEnabled();
    expect(within(hisRow(grid)).queryByText("Approved")).toBeNull();
  });
});
