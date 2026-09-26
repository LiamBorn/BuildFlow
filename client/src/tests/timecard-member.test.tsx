/**
 * Who sees which TimeCard, and a Member putting their own time in (2026-09-25).
 *
 * Owners and Admins keep the crews' week — the sample-driven page with its costs, approvals and
 * compliance. A Member gets the same page made for one person: the week a day to a tile, a form for
 * the day and when they clocked in and out, and the entries they have put in. The form checks what
 * the server checks before it sends anything, and whatever the server still refuses comes back
 * under the field it names. Removing an entry takes two presses, because it is saved and there is
 * no undo.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localIsoDate, type BootstrapPayload, type PermissionLevel, type TimeEntry } from "@buildflow/shared";
import { TimeCardPage } from "../TimeCard";
import { weekDays } from "../schedule/scheduleUtils";
import { bootstrapFixture } from "../test/fixture";

const as = (permission: PermissionLevel): BootstrapPayload => ({
  ...bootstrapFixture,
  activeUser: { ...bootstrapFixture.activeUser!, permission }
});

const today = localIsoDate();
/** A working day of this week that has already come: Monday, unless today is the Monday itself. */
const earlier = weekDays.find((day) => day.date < today)?.date ?? today;

const entry = (over: Partial<TimeEntry> = {}): TimeEntry => ({
  id: `te-${Math.random().toString(36).slice(2)}`,
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
  createdAt: new Date().toISOString(),
  ...over
});

/** The server, as far as these cases need it: what the person already has, and what they send. */
function pretendServer(start: TimeEntry[] = [], refuse?: { status: number; error: string; field: string }) {
  const state = { entries: [...start], sent: [] as Array<{ method: string; url: string; body: unknown }> };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (!url.includes("/api/time-entries")) return new Response("{}", { status: 404 });
    // an Owner's or Admin's page opens on the team's week; these cases leave it empty
    if (url.includes("/api/time-entries/team")) return new Response(JSON.stringify({ entries: [], people: [] }), { status: 200 });
    if (method !== "GET") state.sent.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === "GET") return new Response(JSON.stringify({ entries: state.entries }), { status: 200 });
    if (method === "POST") {
      if (refuse) return new Response(JSON.stringify({ error: refuse.error, field: refuse.field }), { status: refuse.status });
      const made = entry({ ...(JSON.parse(String(init?.body)) as Partial<TimeEntry>), id: "te-made" });
      state.entries = [made, ...state.entries];
      return new Response(JSON.stringify(made), { status: 201 });
    }
    if (method === "DELETE") {
      const id = decodeURIComponent(url.split("/").pop() ?? "");
      state.entries = state.entries.filter((item) => item.id !== id);
      return new Response(null, { status: 204 });
    }
    return new Response("{}", { status: 405 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return state;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("who sees which TimeCard", () => {
  it("keeps the crews' week for an Owner and an Admin, after their team's own time", () => {
    for (const level of ["owner", "admin"] as const) {
      pretendServer();
      const { unmount } = render(<TimeCardPage data={as(level)} />);
      expect(screen.getByRole("tab", { name: /^Team's time/ }), level).toHaveAttribute("aria-selected", "true");
      fireEvent.click(screen.getByRole("tab", { name: /^Time Entry/ }));
      expect(screen.getByLabelText("TimeCard summary"), level).toBeInTheDocument();
      expect(screen.getByRole("tablist", { name: "TimeCard sections" })).toBeInTheDocument();
      expect(screen.getByRole("note")).toHaveTextContent(/built-in sample week/);
      unmount();
    }
  });

  it("gives a Member their own TimeCard and none of the crews' week", async () => {
    pretendServer();
    render(<TimeCardPage data={as("member")} />);

    expect(screen.getByRole("heading", { level: 1, name: "TimeCard" })).toBeInTheDocument();
    expect(screen.getByText("Member")).toBeInTheDocument();
    expect(screen.getByLabelText("Your time this week")).toBeInTheDocument();
    const views = within(screen.getByRole("tablist", { name: "Your TimeCard" })).getAllByRole("tab");
    expect(views.map((view) => view.textContent?.replace(/\d+$/, ""))).toEqual(["Put in time", "History"]);
    // nothing of the Owner's page: no costs, no approvals, no sample week
    expect(screen.queryByLabelText("TimeCard summary")).toBeNull();
    expect(screen.queryByText(/built-in sample week/)).toBeNull();
    expect(screen.queryByRole("tab", { name: /Approvals/ })).toBeNull();
    expect(await screen.findByText(/Nothing put in yet this week/)).toBeInTheDocument();
  });
});

describe("a Member putting in their time", () => {
  it("shows the week they have put in, from the server", async () => {
    pretendServer([
      entry({ clockIn: "06:30", clockOut: "11:00", breakMinutes: 0 }),
      entry({ clockIn: "11:30", clockOut: "17:00", breakMinutes: 0 })
    ]);
    render(<TimeCardPage data={as("member")} />);

    const days = await screen.findByRole("group", { name: "Days this week" });
    // two stretches of one day are one day of ten hours, two of them overtime
    await waitFor(() => expect(within(days).getByRole("button", { name: /: 10 hrs$/ })).toBeInTheDocument());
    const table = screen.getByRole("region", { name: "Your entries" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getAllByText(/day \+2 OT/)).toHaveLength(1);
  });

  it("puts a day in: pick it, clock in and out, submit", async () => {
    const server = pretendServer();
    render(<TimeCardPage data={as("member")} />);
    await screen.findByText(/Nothing put in yet this week/);

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(`^${new Date(`${earlier}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" })}`)
      })
    );
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe(earlier);
    fireEvent.change(screen.getByLabelText("Time in"), { target: { value: "07:00" } });
    fireEvent.change(screen.getByLabelText("Time out"), { target: { value: "16:30" } });
    fireEvent.change(screen.getByLabelText("Unpaid break"), { target: { value: "30" } });
    expect(screen.getByText("9 hrs")).toBeInTheDocument();
    expect(screen.getByText(/comes to 9 hrs, 1 hr overtime/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit time" }));
    });

    expect(server.sent).toEqual([
      {
        method: "POST",
        url: expect.stringContaining("/api/time-entries"),
        body: { date: earlier, clockIn: "07:00", clockOut: "16:30", breakMinutes: 30, projectId: null, notes: "" }
      }
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent(/Time put in for .*7:00 AM to 4:30 PM/);
    const table = screen.getByRole("region", { name: "Your entries" });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    // the form is ready for the next stretch: the day stays, the times go
    expect((screen.getByLabelText("Time in") as HTMLInputElement).value).toBe("");
  });

  it("checks the time before sending it", async () => {
    const server = pretendServer([entry()]);
    render(<TimeCardPage data={as("member")} />);
    await screen.findByRole("region", { name: "Your entries" });
    const submit = () => fireEvent.click(screen.getByRole("button", { name: "Submit time" }));

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: earlier } });
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent("Put in the time you started.");
    expect(screen.getByLabelText("Time in")).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(screen.getByLabelText("Time in"), { target: { value: "15:00" } });
    fireEvent.change(screen.getByLabelText("Time out"), { target: { value: "07:00" } });
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent("Clocking out has to come after clocking in.");

    // the day already holds 07:00–15:30
    fireEvent.change(screen.getByLabelText("Time in"), { target: { value: "12:00" } });
    fireEvent.change(screen.getByLabelText("Time out"), { target: { value: "18:00" } });
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent("That overlaps the time you already put in for this day, 07:00–15:30.");

    expect(server.sent).toEqual([]);
  });

  it("says what the server refused, under the field it names", async () => {
    pretendServer([], { status: 400, error: "That project is not in this workspace.", field: "projectId" });
    render(<TimeCardPage data={as("member")} />);
    await screen.findByText(/Nothing put in yet this week/);

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: earlier } });
    fireEvent.change(screen.getByLabelText("Time in"), { target: { value: "07:00" } });
    fireEvent.change(screen.getByLabelText("Time out"), { target: { value: "15:00" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit time" }));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("That project is not in this workspace.");
    expect(screen.getByLabelText("Project")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows what an Owner or Admin has approved, and no longer offers to take it out", async () => {
    pretendServer([
      entry({ id: "te-approved", status: "Approved", approvedBy: "acct-matt", approvedAt: new Date().toISOString() }),
      entry({ id: "te-waiting", clockIn: "16:00", clockOut: "18:00", breakMinutes: 0 })
    ]);
    const data = as("member");
    render(
      <TimeCardPage
        data={{ ...data, users: data.users.map((user) => (user.id === "u-matt" ? { ...user, accountId: "acct-matt" } : user)) }}
      />
    );
    const table = await screen.findByRole("region", { name: "Your entries" });

    expect(within(table).getByText("Approved")).toBeInTheDocument();
    expect(within(table).getByText("by Matt Johnson")).toBeInTheDocument();
    expect(within(table).getByText("Submitted")).toBeInTheDocument();
    // one way to take time out: the stretch still waiting; the approved one is locked
    expect(within(table).getAllByRole("button", { name: /^Remove / })).toHaveLength(1);
    expect(within(table).getByText("Approved, so it can no longer be removed")).toBeInTheDocument();
  });

  it("takes a mistake back out, on the second press", async () => {
    const server = pretendServer([entry({ id: "te-oops" })]);
    render(<TimeCardPage data={as("member")} />);
    const table = await screen.findByRole("region", { name: "Your entries" });

    fireEvent.click(within(table).getByRole("button", { name: /^Remove / }));
    expect(server.sent).toEqual([]);
    expect(within(table).getByRole("button", { name: /^Confirm removing / })).toHaveTextContent("Remove?");

    await act(async () => {
      fireEvent.click(within(table).getByRole("button", { name: /^Confirm removing / }));
    });
    expect(server.sent).toEqual([{ method: "DELETE", url: expect.stringContaining("/api/time-entries/te-oops"), body: undefined }]);
    expect(await screen.findByText(/Nothing put in yet this week/)).toBeInTheDocument();
  });
});
