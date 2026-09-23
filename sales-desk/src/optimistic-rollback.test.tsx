/**
 * An optimistic change the server refused has to go back.
 *
 * Four toggles apply to local state before the request — moving a lead's stage, completing a
 * to-do, deleting one, and changing a conversation's status. Applying first is right: a status
 * flip should feel instant. What they used to do on FAILURE was keep the change anyway, under a
 * `catch { /* optimistic only *\/ }`. The board then showed a stage the server had never accepted,
 * the next refresh silently undid it, and nothing in between said a word.
 *
 * These render the real SalesApp rather than a stub, because the rollback lives in its `desk`
 * object and a stubbed desk would test the stub. The api module is mocked at the boundary: the
 * bootstrap succeeds so the app is "Linked to BuildFlow", and the individual writes reject.
 *
 * The last test is the one that keeps the rest honest. When the backend is unreachable the app
 * falls back to sample data and says so in the header, and there the optimistic change is
 * supposed to stand — that IS the demo. Roll back unconditionally and you break it, with every
 * other test here still green.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type * as ApiModule from "./api";
import type { Lead, SalesBootstrap, SalesTask } from "./api";
import { fetchBootstrap, updateLead, updateTask, deleteTask } from "./api";
import { SalesApp } from "./SalesApp";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    fetchBootstrap: vi.fn(),
    updateLead: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    patchConversation: vi.fn(),
    fetchMessages: vi.fn().mockResolvedValue([])
  };
});

const lead: Lead = {
  id: "l1",
  name: "Dana Reyes",
  email: "dana@asphaltco.com",
  phone: "",
  company: "Asphalt Co",
  teamSize: "12",
  interest: "Crew Scheduling",
  status: "New",
  value: 25000,
  owner: "Sales Rep",
  source: "Manual",
  notes: "",
  createdAt: "2026-09-01T10:00:00.000Z",
  lastActivityAt: null
};

const task: SalesTask = {
  id: "t1",
  leadId: null,
  title: "Call Dana back",
  dueAt: "2026-09-30T10:00:00.000Z",
  done: 0,
  department: "sales",
  createdAt: "2026-09-01T10:00:00.000Z"
};

const bootstrap: SalesBootstrap = { leads: [lead], tasks: [task], activities: [], conversations: [] };

/** Sign in as sales and answer the bootstrap, live unless a test says otherwise. */
function mount(live = true) {
  localStorage.setItem("bf-sales-desk-auth", "rep@buildflow.com");
  localStorage.setItem("bf-sales-desk-dept", "sales");
  vi.mocked(fetchBootstrap).mockResolvedValue({ data: structuredClone(bootstrap), live });
  return render(<SalesApp />);
}

const goTo = async (label: string) => {
  const nav = await screen.findByRole("button", { name: label });
  fireEvent.click(nav);
};

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollTo = vi.fn();
  vi.mocked(updateLead).mockReset();
  vi.mocked(updateTask).mockReset();
  vi.mocked(deleteTask).mockReset();
});

describe("a to-do whose change the server refused", () => {
  it("goes back to not-done, and says so", async () => {
    vi.mocked(updateTask).mockRejectedValue(new Error("network"));
    mount();
    await goTo("Tasks");

    const complete = await screen.findByRole("button", { name: "Complete" });
    fireEvent.click(complete);

    await waitFor(() => expect(screen.getByText(/couldn't mark/i)).toBeInTheDocument());
    // Still offering to complete it means it is still open -- the flip was undone.
    expect(await screen.findByRole("button", { name: "Complete" })).toBeInTheDocument();
  });

  it("comes back at its own position when a delete is refused", async () => {
    vi.mocked(deleteTask).mockRejectedValue(new Error("network"));
    mount();
    await goTo("Tasks");

    fireEvent.click(await screen.findByRole("button", { name: "Delete task" }));

    await waitFor(() => expect(screen.getByText(/couldn't delete/i)).toBeInTheDocument());
    expect(screen.getByText(task.title), "the to-do must still be listed").toBeInTheDocument();
  });
});

describe("a lead whose stage the server refused", () => {
  it("goes back to the stage it was in", async () => {
    vi.mocked(updateLead).mockRejectedValue(new Error("network"));
    mount();
    await goTo("Leads");

    // The stage chips live in the lead's drawer, which opens when its row is clicked.
    fireEvent.click(await screen.findByText(lead.company));
    fireEvent.click(await screen.findByRole("button", { name: "Qualified" }));

    await waitFor(() => expect(screen.getByText(/couldn't move/i)).toBeInTheDocument());
    expect(screen.getByText(/back where it was/i)).toBeInTheDocument();
  });
});

describe("the message itself", () => {
  it("can be dismissed", async () => {
    vi.mocked(updateTask).mockRejectedValue(new Error("network"));
    mount();
    await goTo("Tasks");
    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));
    await waitFor(() => expect(screen.getByText(/couldn't mark/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    await waitFor(() => expect(screen.queryByText(/couldn't mark/i)).not.toBeInTheDocument());
  });

  it("clears itself once a change does go through", async () => {
    vi.mocked(updateTask).mockRejectedValueOnce(new Error("network")).mockResolvedValue({ ...task, done: 1 });
    mount();
    await goTo("Tasks");

    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));
    await waitFor(() => expect(screen.getByText(/couldn't mark/i)).toBeInTheDocument());

    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));
    await waitFor(() => expect(screen.queryByText(/couldn't mark/i)).not.toBeInTheDocument());
  });
});

describe("sample mode, where there is no server to refuse anything", () => {
  it("keeps the optimistic change and stays quiet", async () => {
    // The header says "Sample data"; inventing the result locally is the demo working.
    vi.mocked(updateTask).mockRejectedValue(new Error("no backend"));
    mount(false);
    await goTo("Tasks");
    expect(await screen.findByText(/sample data/i)).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Mark open" })).toBeInTheDocument());
    expect(screen.queryByText(/couldn't mark/i), "sample mode must not scold").not.toBeInTheDocument();
  });
});

describe("the whole point", () => {
  it("never leaves a refused change on screen while claiming to be linked", async () => {
    vi.mocked(updateTask).mockRejectedValue(new Error("network"));
    mount();
    await goTo("Tasks");
    expect(await screen.findByText(/linked to buildflow/i)).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));
    await waitFor(() => expect(screen.getByText(/couldn't mark/i)).toBeInTheDocument());

    // Nothing anywhere should be showing the task as done.
    const main = screen.getByRole("main");
    expect(within(main).queryByRole("button", { name: "Mark open" })).not.toBeInTheDocument();
  });
});
