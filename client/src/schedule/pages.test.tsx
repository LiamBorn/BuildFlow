/**
 * The six schedule sub-pages against one small workspace: what each shows, that the
 * shared filters narrow it, and what a drop sends to the API. dnd-kit's DndContext is
 * replaced by a shim that hands each page's onDragEnd to the test, so a drop is one
 * call carrying the data a real drag would.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { DragEndEvent, DragOverEvent } from "@dnd-kit/core";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BootstrapPayload, Crew, Job, Project, ScheduleAssignment } from "@buildflow/shared";
import type * as DndKit from "@dnd-kit/core";
import type * as Api from "../api";
import type * as ExportModule from "./export";

// whole-page renders take seconds when the machine is busy; the default 5 s is too tight for them
vi.setConfig({ testTimeout: 20000 });

const drops = vi.hoisted(() => ({
  onDragEnd: undefined as ((event: DragEndEvent) => void) | undefined,
  onDragOver: undefined as ((event: DragOverEvent) => void) | undefined
}));
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof DndKit>();
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
      onDragOver
    }: {
      children?: ReactNode;
      onDragEnd?: (event: DragEndEvent) => void;
      onDragOver?: (event: DragOverEvent) => void;
    }) => {
      drops.onDragEnd = onDragEnd;
      drops.onDragOver = onDragOver;
      return <>{children}</>;
    }
  };
});
vi.mock("./export", async (importOriginal) => {
  const actual = await importOriginal<typeof ExportModule>();
  // the browser download is a side effect; the CSV it would save is what the tests read
  return { ...actual, downloadCsv: vi.fn(() => true), printHtml: vi.fn(() => true) };
});
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof Api>();
  return {
    ...actual,
    rebookSchedule: vi.fn(async () => ({ assignments: [{ id: "as-new" }], removed: [], jobs: [] })),
    updateJob: vi.fn(async (id: string, patch: object) => ({ id, ...patch })),
    updatePhase: vi.fn(async (id: string, patch: object) => ({ id, ...patch })),
    updateProject: vi.fn(async (id: string, patch: object) => ({ id, ...patch })),
    assignJob: vi.fn(),
    createJob: vi.fn(),
    setScheduleBaseline: vi.fn(),
    createDependency: vi.fn(async (input: object) => ({ id: "dep-new", ...input })),
    deleteDependency: vi.fn(async () => undefined),
    fetchCalendarFeeds: vi.fn(async () => []),
    // the status band keeps loading: the landing's own content is what these tests read
    fetchScheduleStatus: vi.fn(() => new Promise(() => {})),
    setUserSetting: vi.fn(async (key: string, value: string) => ({ ok: true as const, key, value })),
    fetchScheduleDigest: vi.fn(async () => ({
      weekOf: "2026-06-15",
      previousWeekOf: "2026-06-08",
      capturedAt: "2026-06-15T07:00:00.000Z",
      movedJobs: [
        {
          id: "j-riverside-concrete",
          name: "Riverside Office Building",
          project: "Riverside Office Building",
          from: { startDate: "2026-06-13", endDate: "2026-06-15" },
          to: { startDate: "2026-06-15", endDate: "2026-06-17" },
          days: 2
        }
      ],
      newJobs: [],
      newConflicts: [{ crewId: "crew-concrete", crewName: "Concrete Crew 1", date: "2026-06-16", jobs: ["Slab pour", "Backfill"] }],
      clearedConflicts: 0,
      slippedMilestones: [
        { id: "phase-1", title: "Slab complete", project: "Riverside Office Building", from: "2026-06-20", to: "2026-06-22", days: 2 }
      ],
      totals: { jobs: 3, bookings: 2, conflicts: 1 }
    })),
    sendScheduleDigest: vi.fn(async () => ({ ok: true as const, weekOf: "2026-06-15", recipients: 2 })),
    createCrew: vi.fn(async (input: { name: string }) => ({ id: "crew-new", ...input })),
    createProject: vi.fn(async (input: { name: string }) => ({ id: "p-new", ...input })),
    loadSampleData: vi.fn(async () => ({ ok: true as const, alreadyLoaded: false, projectIds: ["p-s"], crewIds: ["c-s"] })),
    removeSampleData: vi.fn(async () => ({ ok: true as const, removed: 1 }))
  };
});

import {
  ApiError,
  assignJob,
  createCrew,
  createDependency,
  createJob,
  createProject,
  updatePhase,
  updateProject,
  deleteDependency,
  loadSampleData,
  rebookSchedule,
  removeSampleData,
  sendScheduleDigest,
  setUserSetting,
  updateJob
} from "../api";
import { bootstrapFixture } from "../test/fixture";
import { EXPORT_COLUMNS, downloadCsv, printHtml } from "./export";
import { WeekPage } from "./pages/WeekPage";
import { ListPage } from "./pages/ListPage";
import { KanbanPage } from "./pages/KanbanPage";
import { MonthPage } from "./pages/MonthPage";
import { MatrixPage } from "./pages/MatrixPage";
import { GanttPage } from "./pages/GanttPage";
import { SchedulePage } from "./pages/SchedulePage";
import { scheduleTourSteps } from "./tour";
import { SavedViewsFlyout } from "./SavedViewsBar";
import { resetSavedViews } from "./savedViews";
import { parseScheduleHash, readScheduleContext } from "./useScheduleContext";
import { EMPTY_SCHEDULE_CONTEXT, writeScheduleContext } from "./useScheduleContext";

// jsdom lays nothing out and scrolls nothing; the Gantt asks for both on mount
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// The test clock is Tuesday 16 June 2026 (src/test/setup.ts pins Date); every booking below sits in that week.
const framing: Crew = { ...bootstrapFixture.crews[0], id: "crew-framing", name: "Framing Crew 2", specialty: "Framing", lead: "Ana Lopez" };
const pinecrest: Project = { ...bootstrapFixture.projects[0], id: "p-pinecrest", name: "Pinecrest Medical" };
const pinecrestJob: Job = {
  ...bootstrapFixture.jobs[0],
  id: "j-pinecrest",
  projectId: "p-pinecrest",
  name: "Pinecrest Foundations",
  phase: "Foundations",
  location: "Pinecrest, Austin",
  startDate: "2026-06-17",
  endDate: "2026-06-18",
  status: "In Progress"
};
const pinecrestBooking: ScheduleAssignment = {
  id: "as-2",
  jobId: "j-pinecrest",
  crewId: "crew-framing",
  date: "2026-06-17",
  status: "In Progress",
  conflicts: []
};
const data: BootstrapPayload = {
  ...bootstrapFixture,
  projects: [...bootstrapFixture.projects, pinecrest],
  crews: [...bootstrapFixture.crews, framing],
  jobs: [...bootstrapFixture.jobs, pinecrestJob],
  assignments: [...bootstrapFixture.assignments, pinecrestBooking]
};
const userId = data.activeUser.id;

const reload = vi.fn(async () => {});
const pageProps = { data, reload, onOpenSchedule: vi.fn(), onOpenPage: vi.fn() };
const dragEnd = (source: Record<string, unknown>, over: Record<string, unknown>) =>
  ({ active: { id: "drag", data: { current: source } }, over: { id: "drop", data: { current: over } } }) as unknown as DragEndEvent;
/** Ends a drag the way dnd-kit would: the source's data, the target's data. */
const drop = async (source: Record<string, unknown>, over: Record<string, unknown>) => {
  expect(drops.onDragEnd).toBeTypeOf("function");
  await act(async () => {
    drops.onDragEnd?.(dragEnd(source, over));
  });
};
/** A card still in the air, held over `over` — what the board draws before the drop. */
const dragOver = async (source: Record<string, unknown>, over: Record<string, unknown> | null) => {
  expect(drops.onDragOver).toBeTypeOf("function");
  await act(async () => {
    drops.onDragOver?.({
      active: { id: "drag", data: { current: source } },
      over: over ? { id: "drop", data: { current: over } } : null
    } as unknown as DragOverEvent);
  });
};
/** The arrangement a board just saved, by section — every board keeps one under its own key. */
const savedFor = (key: string) => {
  const call = vi.mocked(setUserSetting).mock.calls.at(-1);
  expect(call?.[0], `the board saved ${key}`).toBe(key);
  return JSON.parse(String(call?.[1])) as Record<string, string[]>;
};
const notice = () => document.querySelector(".gantt-status");
const cell = (crewId: string, date: string) => document.querySelector(`[data-crew-id="${crewId}"][data-date="${date}"]`) as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  drops.onDragEnd = undefined;
  drops.onDragOver = undefined;
  resetSavedViews();
});

describe("Week page", () => {
  it("shows every crew's row with its bookings in the right day cells, and the queue", () => {
    render(<WeekPage {...pageProps} />);
    expect(screen.getByRole("heading", { level: 1, name: /Week/ })).toBeInTheDocument();
    expect(screen.getByText("Concrete Crew 1", { selector: "strong" })).toBeInTheDocument(); // the crew filter lists it too
    expect(screen.getByText("Framing Crew 2", { selector: "strong" })).toBeInTheDocument();
    expect(within(cell("crew-concrete", "2026-06-15")).getByText("Riverside Office Building")).toBeInTheDocument();
    expect(within(cell("crew-framing", "2026-06-17")).getByText("Pinecrest Foundations")).toBeInTheDocument();
    expect(cell("crew-concrete", "2026-06-16").querySelectorAll(".schedule-job")).toHaveLength(0);
    expect(screen.getAllByText("Downtown Retail Buildout").length).toBeGreaterThan(0); // unbooked, so in the queue
  });

  it("narrows to the shared filters' project", () => {
    writeScheduleContext(userId, { ...EMPTY_SCHEDULE_CONTEXT, projectId: "p-pinecrest" });
    render(<WeekPage {...pageProps} />);
    expect(within(cell("crew-framing", "2026-06-17")).getByText("Pinecrest Foundations")).toBeInTheDocument();
    expect(screen.queryAllByText("Riverside Office Building", { selector: "strong" })).toHaveLength(0); // no card anywhere
    expect(screen.getByLabelText("Active filters")).toHaveTextContent("Pinecrest Medical");
  });

  it("re-books a dropped card in one request and offers the way back", async () => {
    render(<WeekPage {...pageProps} />);
    await drop(
      { assignmentId: "as-1", jobId: "j-riverside-concrete", crewId: "crew-concrete", date: "2026-06-15" },
      { crewId: "crew-framing", date: "2026-06-17" }
    );
    await waitFor(() =>
      expect(rebookSchedule).toHaveBeenCalledWith([{ op: "move", id: "as-1", crewId: "crew-framing", date: "2026-06-17" }], {
        force: false
      })
    );
    await waitFor(() => expect(reload).toHaveBeenCalled());
    await waitFor(() => expect(notice()).toHaveTextContent("Riverside Office Building moved to Framing Crew 2 on Jun 17"));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    // not forced: the crew-day it is going home to may have been taken while the notice was up
    await waitFor(() =>
      expect(rebookSchedule).toHaveBeenLastCalledWith([{ op: "move", id: "as-1", crewId: "crew-concrete", date: "2026-06-15" }], {
        force: false
      })
    );
    await waitFor(() => expect(notice()).toHaveTextContent("Riverside Office Building back with Concrete Crew 1 on Jun 15"));
  });

  it("books a queued job on the cell it lands on, and ignores a drop on the card's own cell", async () => {
    render(<WeekPage {...pageProps} />);
    await drop(
      { assignmentId: "as-1", jobId: "j-riverside-concrete", crewId: "crew-concrete", date: "2026-06-15" },
      { crewId: "crew-concrete", date: "2026-06-15" }
    );
    expect(rebookSchedule).not.toHaveBeenCalled();
    await drop({ jobId: "j-unassigned" }, { crewId: "crew-framing", date: "2026-06-16" });
    await waitFor(() =>
      expect(rebookSchedule).toHaveBeenCalledWith([{ op: "book", jobId: "j-unassigned", crewId: "crew-framing", date: "2026-06-16" }], {
        force: false
      })
    );
    await waitFor(() => expect(notice()).toHaveTextContent("Downtown Retail Buildout booked with Framing Crew 2 on Jun 16"));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(rebookSchedule).toHaveBeenLastCalledWith([{ op: "unbook", id: "as-new" }], { force: false }));
  });
});

describe("List page", () => {
  /* A CELL IS A LIST THE PLANNER ARRANGES (2026-09-18, the Kanban's arrangement asked for on the
     other Schedule boards): carry a card between two others in a crew's day and it goes there.
     Inside the cell that is an arrangement and nothing is asked of the server; across cells it
     still re-books, and the card keeps the place it landed in. */
  const twoInACell: BootstrapPayload = {
    ...data,
    assignments: [...data.assignments, { ...pinecrestBooking, id: "as-3", jobId: "j-riverside-concrete" }]
  };
  const FRAMING_JUN17 = "crew-framing|2026-06-17";

  it("places a card between two in its own cell and writes only the arrangement, but still re-books across cells", async () => {
    render(<WeekPage {...pageProps} data={twoInACell} />);
    // both bookings sit in Framing Crew 2's 17th; the later one takes the earlier one's place
    await drop(
      { assignmentId: "as-3", jobId: "j-riverside-concrete", crewId: "crew-framing", date: "2026-06-17", cell: FRAMING_JUN17 },
      { assignmentId: "as-2", cell: FRAMING_JUN17 }
    );
    await waitFor(() => expect(setUserSetting).toHaveBeenCalled());
    const cellOrder = savedFor("schedule:week-order")[FRAMING_JUN17];
    expect(cellOrder.indexOf("as-3")).toBeLessThan(cellOrder.indexOf("as-2"));
    // an arrangement is the planner's own: no booking moved
    expect(rebookSchedule).not.toHaveBeenCalled();
    // and released on its OWN slot the cell is left alone, not sent to the end
    vi.mocked(setUserSetting).mockClear();
    await drop(
      { assignmentId: "as-3", jobId: "j-riverside-concrete", crewId: "crew-framing", date: "2026-06-17", cell: FRAMING_JUN17 },
      { assignmentId: "as-3", cell: FRAMING_JUN17 }
    );
    expect(setUserSetting).not.toHaveBeenCalled();

    // and onto another crew's day it re-books, keeping the place it was dropped in
    await drop(
      { assignmentId: "as-3", jobId: "j-riverside-concrete", crewId: "crew-framing", date: "2026-06-17", cell: FRAMING_JUN17 },
      { assignmentId: "as-1", cell: "crew-concrete|2026-06-15", crewId: "crew-concrete", date: "2026-06-15" }
    );
    await waitFor(() => expect(rebookSchedule).toHaveBeenCalled());
    const moved = savedFor("schedule:week-order")["crew-concrete|2026-06-15"];
    expect(moved[moved.indexOf("as-1") - 1]).toBe("as-3");
  });

  it("shows the week as seven day sections, quiet days included", () => {
    render(<ListPage {...pageProps} />);
    expect(screen.getByRole("heading", { level: 1, name: /List/ })).toBeInTheDocument();
    expect(document.querySelectorAll(".sched-list-day")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Open Riverside Office Building for Concrete Crew 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Pinecrest Foundations for Framing Crew 2" })).toBeInTheDocument();
    expect(screen.getAllByText("Nothing booked — drop a booking here")).toHaveLength(5);
  });

  /* A DAY IS A LIST THE PLANNER ARRANGES, the same arrangement the Kanban and the Week board have.
     Time order is what a day starts in; a row carried between two others stays where it was put. */
  it("places a row between two in its own day and writes only the arrangement", async () => {
    // the fixture books one crew on the 17th; a second booking that day is what there is to arrange
    const twoOnADay: BootstrapPayload = {
      ...data,
      assignments: [...data.assignments, { ...pinecrestBooking, id: "as-3", jobId: "j-riverside-concrete", crewId: "crew-concrete" }]
    };
    render(<ListPage {...pageProps} data={twoOnADay} />);
    await drop({ assignmentId: "as-3", date: "2026-06-17" }, { assignmentId: "as-2", date: "2026-06-17" });
    await waitFor(() => expect(setUserSetting).toHaveBeenCalled());
    const day = savedFor("schedule:list-order")["2026-06-17"];
    expect(day.indexOf("as-3")).toBeLessThan(day.indexOf("as-2"));
    expect(rebookSchedule, "an arrangement moves no booking").not.toHaveBeenCalled();
    // and released on its OWN slot the day is left alone, not sent to the end
    vi.mocked(setUserSetting).mockClear();
    await drop({ assignmentId: "as-3", date: "2026-06-17" }, { assignmentId: "as-3", date: "2026-06-17" });
    expect(setUserSetting).not.toHaveBeenCalled();
    expect(notice(), "an arrangement needs no notice and nothing to undo").toBeNull();
  });

  it("re-books a row dropped on another day, and leaves one dropped on its own day alone", async () => {
    render(<ListPage {...pageProps} />);
    await drop({ assignmentId: "as-1" }, { date: "2026-06-18" });
    await waitFor(() => expect(rebookSchedule).toHaveBeenCalledWith([{ op: "move", id: "as-1", date: "2026-06-18" }], { force: false }));
    await waitFor(() => expect(notice()).toHaveTextContent("Concrete Crew 1 on Riverside Office Building moved to Jun 18"));
    await drop({ assignmentId: "as-2" }, { date: "2026-06-17" });
    expect(rebookSchedule).toHaveBeenCalledTimes(1);
  });
});

describe("Kanban page", () => {
  const board = () => document.querySelector(".sched-kanban") as HTMLElement;
  const lane = (name: string) => within(board()).getByRole("heading", { level: 3, name }).closest("section") as HTMLElement;

  it("lays the jobs out by status lane", () => {
    render(<KanbanPage {...pageProps} />);
    expect(screen.getByRole("heading", { level: 1, name: /Kanban/ })).toBeInTheDocument();
    expect(
      within(board())
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual(["Planned", "Ready", "In Progress", "Blocked", "Complete"]);
    expect(within(lane("Ready")).getAllByText("Riverside Office Building", { selector: "strong" })).toHaveLength(1); // Confirmed sits in Ready
    expect(within(lane("Planned")).getAllByText("Downtown Retail Buildout", { selector: "strong" })).toHaveLength(1);
    expect(within(lane("In Progress")).getAllByText("Pinecrest Foundations", { selector: "strong" })).toHaveLength(1);
    expect(within(lane("Complete")).getByText("Drop a job here")).toBeInTheDocument();
  });

  /* A lane is a list a planner arranges, not just a bucket (2026-09-17): "if a user grabs a job and
     wants to put it between 2 jobs they can". Inside its own lane a drop writes the ARRANGEMENT and
     nothing else; into another lane it still writes the status, and keeps the place it landed in. */
  const readyBoard: BootstrapPayload = {
    ...data,
    jobs: [
      ...data.jobs,
      { ...pinecrestJob, id: "j-ready-1", name: "Ready One", status: "Ready" },
      { ...pinecrestJob, id: "j-ready-2", name: "Ready Two", status: "Ready" }
    ]
  };
  /** The lane order the board just saved, by lane key. */
  const savedOrder = () => {
    const call = vi.mocked(setUserSetting).mock.calls.at(-1);
    expect(call?.[0], "the board saved an order").toBe("schedule:kanban-order");
    return JSON.parse(String(call?.[1])) as Record<string, string[]>;
  };

  it("places a card between two others in its own lane, and writes only the arrangement", async () => {
    render(<KanbanPage {...pageProps} data={readyBoard} />);
    // Ready holds three: the Confirmed job the fixture books, then the two above
    await drop({ jobId: "j-ready-2", status: "Ready", lane: "ready" }, { jobId: "j-riverside-concrete", lane: "ready" });
    await waitFor(() => expect(setUserSetting).toHaveBeenCalled());
    const ready = savedOrder().ready;
    expect(ready).toHaveLength(3);
    // it took the place of the card it was dropped on, which closed up behind it
    expect(ready.indexOf("j-ready-2")).toBeLessThan(ready.indexOf("j-riverside-concrete"));
    // an order is the planner's own: nothing about the job changed
    expect(updateJob).not.toHaveBeenCalled();
    /* Released on its OWN slot — picked up and put straight back — the lane is left alone. Read as
       "no target" it used to mean the lane's own space, which sent the card to the end. */
    vi.mocked(setUserSetting).mockClear();
    await drop({ jobId: "j-ready-2", status: "Ready", lane: "ready" }, { jobId: "j-ready-2", lane: "ready" });
    expect(setUserSetting).not.toHaveBeenCalled();
    expect(notice(), "an arrangement needs no notice and nothing to undo").toBeNull();
  });

  it("keeps the place a card lands in when it comes from another lane, and still moves its status", async () => {
    render(<KanbanPage {...pageProps} data={readyBoard} />);
    await drop({ jobId: "j-pinecrest", status: "In Progress", lane: "progress" }, { jobId: "j-ready-1", lane: "ready" });
    await waitFor(() => expect(updateJob).toHaveBeenCalledWith("j-pinecrest", { status: "Ready" }, pinecrestJob.version));
    const ready = savedOrder().ready;
    expect(ready[ready.indexOf("j-ready-1") - 1]).toBe("j-pinecrest");
    await waitFor(() => expect(notice()).toHaveTextContent("Pinecrest Foundations moved to Ready"));
  });

  /* CROSSING LANES used to show nothing moving aside — dnd-kit's sortable only opens a gap inside
     the list the card belongs to. While the hand holds it over another lane the board now draws it
     THERE, at the place it would take; and because it is drawn there, the pointer at the drop is
     often on its own slot, so the drop has to read the preview rather than what is under it. */
  const cardNames = (name: string) =>
    within(lane(name))
      .queryAllByText(/./, { selector: ".sched-kan-card strong" })
      .map((node) => node.textContent);

  it("opens the lane a card is held over, and drops it into the place that opened", async () => {
    render(<KanbanPage {...pageProps} data={readyBoard} />);
    const carried = { jobId: "j-pinecrest", status: "In Progress" as const, lane: "progress" };
    expect(cardNames("In Progress")).toContain("Pinecrest Foundations");
    const readyBefore = cardNames("Ready");

    // held over the second card in Ready: it is drawn in front of it, and leaves In Progress
    await dragOver(carried, { jobId: "j-ready-1", lane: "ready" });
    const held = cardNames("Ready");
    expect(held).toHaveLength(readyBefore.length + 1);
    expect(held[held.indexOf("Ready One") - 1]).toBe("Pinecrest Foundations");
    expect(cardNames("In Progress")).not.toContain("Pinecrest Foundations");
    expect(within(lane("Ready")).getByRole("heading", { level: 3 }).nextElementSibling, "the count follows the cards").toHaveTextContent(
      String(held.length)
    );
    // nothing has been written: it is still in the air
    expect(setUserSetting).not.toHaveBeenCalled();
    expect(updateJob).not.toHaveBeenCalled();

    // let go with the pointer on the slot the card itself now fills — where the preview put it
    await drop({ ...carried, lane: "ready" }, { jobId: "j-pinecrest", lane: "ready" });
    await waitFor(() => expect(updateJob).toHaveBeenCalledWith("j-pinecrest", { status: "Ready" }, pinecrestJob.version));
    const saved = savedOrder().ready;
    expect(saved[saved.indexOf("j-ready-1") - 1], "it landed where the gap was, not at the end").toBe("j-pinecrest");
  });

  it("takes the preview back down when the card comes home, or the drag is called off", async () => {
    render(<KanbanPage {...pageProps} data={readyBoard} />);
    const carried = { jobId: "j-pinecrest", status: "In Progress" as const, lane: "progress" };
    await dragOver(carried, { jobId: "j-ready-1", lane: "ready" });
    expect(cardNames("Ready")).toContain("Pinecrest Foundations");
    // back over its own lane: the sortable takes over from here, so the preview stands down
    await dragOver({ ...carried, lane: "ready" }, { jobId: "j-pinecrest", lane: "progress" });
    await dragOver(carried, { status: "In Progress", lane: "progress" });
    expect(cardNames("Ready")).not.toContain("Pinecrest Foundations");
    expect(cardNames("In Progress")).toContain("Pinecrest Foundations");
  });

  it("moves a dropped card to the lane's status, ignores its own lane, and can take the move back", async () => {
    render(<KanbanPage {...pageProps} />);
    await drop({ jobId: "j-riverside-concrete", status: "Confirmed" }, { status: "Ready" });
    expect(updateJob).not.toHaveBeenCalled();
    await drop({ jobId: "j-riverside-concrete", status: "Confirmed" }, { status: "Complete" });
    await waitFor(() => expect(updateJob).toHaveBeenCalledWith("j-riverside-concrete", { status: "Complete" }, undefined));
    await waitFor(() => expect(notice()).toHaveTextContent("Riverside Office Building moved to Complete"));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(updateJob).toHaveBeenLastCalledWith("j-riverside-concrete", { status: "Confirmed" }));
  });
});

describe("Month page", () => {
  it("draws the month grid with each job's chip", () => {
    render(<MonthPage {...pageProps} />);
    expect(screen.getByRole("heading", { level: 1, name: /Month/ })).toBeInTheDocument();
    expect(screen.getAllByText("June 2026").length).toBeGreaterThan(0);
    // June 2026 only: 30 day cells over five weeks, and five places padding the first and last
    expect(document.querySelectorAll(".sched-cal-cell")).toHaveLength(30);
    expect(document.querySelectorAll(".sched-cal-blank")).toHaveLength(5);
    expect(screen.queryByText("31")).not.toBeInTheDocument(); // no 31 May before it, no 31 July after
    expect(document.querySelector('.sched-cal-cell[data-date="2026-07-01"]')).toBeNull();
    expect(screen.getAllByTitle("Riverside Office Building · Concrete - Level 3 Slab").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("Pinecrest Foundations · Foundations").length).toBeGreaterThan(0);
  });

  it("keeps every job on a busy day in reach: the day opens where it stands", async () => {
    /* Three chips is all a day shows, and what it was holding back used to be answered with a
       dialog that LISTED the rest — the one thing a planner cannot pick up. Five jobs here, and a
       marker on the same day to prove the jobs are the ones that get the room. */
    const busy: BootstrapPayload = {
      ...data,
      phases: [...data.phases, { ...data.phases[0], id: "phase-busy", name: "Tear-Off", endDate: "2026-06-17" }],
      jobs: [
        ...data.jobs,
        ...Array.from({ length: 4 }, (_, index) => ({
          ...pinecrestJob,
          id: `j-busy-${index}`,
          name: `Busy Job ${index + 1}`,
          startDate: "2026-06-17",
          endDate: "2026-06-17"
        }))
      ]
    };
    render(<MonthPage {...pageProps} data={busy} />);
    const day = document.querySelector('.sched-cal-cell[data-date="2026-06-17"]') as HTMLElement;
    /* Everything on the day a planner can pick up. A job chip is SORTABLE since the day became a
       list they arrange (2026-09-18), a marker is still only draggable — dnd-kit gives each its own
       `aria-roledescription`, and both are grabbable, which is what this is counting. */
    const grabbable = () =>
      [...day.querySelectorAll('[aria-roledescription="draggable"] strong, [aria-roledescription="sortable"] strong')].map(
        (name) => name.textContent
      );

    // collapsed: three chips, all of them jobs — the marker is what waits
    expect(grabbable()).toEqual(["Pinecrest Foundations", "Busy Job 1", "Busy Job 2"]);
    expect(day.querySelector(".sched-act.is-milestone")).toBeNull();
    const opener = within(day).getByRole("button", { name: "+3 more" });
    expect(opener).toHaveAttribute("aria-expanded", "false");

    // opened: every job on the day is a chip like any other, and the marker is one too
    fireEvent.click(opener);
    expect(grabbable()).toEqual(["Pinecrest Foundations", "Busy Job 1", "Busy Job 2", "Busy Job 3", "Busy Job 4", "Tear-Off Complete"]);
    const closer = within(day).getByRole("button", { name: "Show fewer" });
    expect(closer).toHaveAttribute("aria-expanded", "true");

    // and it closes again
    fireEvent.click(closer);
    expect(grabbable()).toHaveLength(3);
    expect(within(day).getByRole("button", { name: "+3 more" })).toBeInTheDocument();
  });

  /* Every chip on the calendar can be carried, and each moves the date it stands for. The report
     that asked for this said "it only lets me move the last job listed on the day" — the first
     three were the phase markers, which looked exactly like jobs and moved nothing. */
  /* A DAY IS A LIST THE PLANNER ARRANGES, the same arrangement the other Schedule boards have
     (2026-09-18). A MARKER is not in it — it is a date, read and not ordered — so it keeps moving
     the thing it stands for and never takes part in an order. */
  const twoOnADay: BootstrapPayload = {
    ...data,
    jobs: [
      ...data.jobs,
      { ...pinecrestJob, id: "j-second", name: "Second On The Day" },
      // a day keys on the job's START date, so a chip on the 18th has to start there
      { ...pinecrestJob, id: "j-third", name: "Third Next Day", startDate: "2026-06-18", endDate: "2026-06-19" }
    ]
  };

  it("places a chip between two in its own day, and keeps the place it lands in on another day", async () => {
    render(<MonthPage {...pageProps} data={twoOnADay} />);
    // both jobs start on the 17th; the second takes the first's place, and no date moves
    await drop({ jobId: "j-second", date: "2026-06-17" }, { jobId: "j-pinecrest", date: "2026-06-17" });
    await waitFor(() => expect(setUserSetting).toHaveBeenCalled());
    const day = savedFor("schedule:month-order")["2026-06-17"];
    expect(day.indexOf("j-second")).toBeLessThan(day.indexOf("j-pinecrest"));
    expect(rebookSchedule, "an arrangement moves no date").not.toHaveBeenCalled();
    // and released on its OWN slot the day is left alone, not sent to the end
    vi.mocked(setUserSetting).mockClear();
    await drop({ jobId: "j-second", date: "2026-06-17" }, { jobId: "j-second", date: "2026-06-17" });
    expect(setUserSetting).not.toHaveBeenCalled();

    // carried onto another day it moves the job, and keeps the place it was dropped in
    await drop({ jobId: "j-second", date: "2026-06-17" }, { jobId: "j-third", date: "2026-06-18" });
    await waitFor(() => expect(rebookSchedule).toHaveBeenCalled());
    const next = savedFor("schedule:month-order")["2026-06-18"];
    expect(next[next.indexOf("j-third") - 1]).toBe("j-second");
  });

  it("draws a chip held over another day in that day, and drops it into the place that opened", async () => {
    render(<MonthPage {...pageProps} data={twoOnADay} />);
    const chipsOn = (date: string) =>
      [...document.querySelectorAll(`.sched-cal-cell[data-date="${date}"] .sched-act strong`)].map((node) => node.textContent);
    expect(chipsOn("2026-06-17")).toContain("Second On The Day");

    // held over the 18th: it is drawn THERE, and leaves the day it came from
    await dragOver({ jobId: "j-second", date: "2026-06-17" }, { jobId: "j-third", date: "2026-06-18" });
    expect(chipsOn("2026-06-18"), "drawn where it would land").toContain("Second On The Day");
    expect(chipsOn("2026-06-17"), "and its own day closed up").not.toContain("Second On The Day");
    expect(setUserSetting, "nothing is written while it is in the air").not.toHaveBeenCalled();

    // let go with the pointer on the slot the chip itself now fills — where the preview put it
    await drop({ jobId: "j-second", date: "2026-06-18" }, { jobId: "j-second", date: "2026-06-18" });
    await waitFor(() => expect(setUserSetting).toHaveBeenCalled());
    const landed = savedFor("schedule:month-order")["2026-06-18"];
    expect(landed[landed.indexOf("j-third") - 1], "it landed where the gap was, not at the end").toBe("j-second");
  });

  it("moves a phase's finish when its marker is dropped, and puts it back on Undo", async () => {
    render(<MonthPage {...pageProps} />);
    // the fixture's one phase ends 2026-07-14, which is the marker's day
    await drop({ milestoneId: "ms-phase-phase-1", date: "2026-07-14" }, { date: "2026-07-20" });
    await waitFor(() => expect(updatePhase).toHaveBeenCalledWith("phase-1", { endDate: "2026-07-20" }));
    await waitFor(() => expect(notice()).toHaveTextContent("Foundation Complete moved to Jul 20"));
    // the work inside the phase is not touched: moving a milestone says when the phase is DUE
    expect(rebookSchedule).not.toHaveBeenCalled();
    expect(updateJob).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(updatePhase).toHaveBeenLastCalledWith("phase-1", { endDate: "2026-07-14" }));
  });

  it("refuses a phase finish dropped before the phase starts, and writes nothing", async () => {
    render(<MonthPage {...pageProps} />);
    // phase-1 runs 2026-06-17 → 2026-07-14; the 10th of June is before it begins
    await drop({ milestoneId: "ms-phase-phase-1", date: "2026-07-14" }, { date: "2026-06-10" });
    await waitFor(() => expect(notice()).toHaveTextContent("Foundation Complete cannot land before its phase starts on Jun 17"));
    expect(updatePhase).not.toHaveBeenCalled();
  });

  it("moves a project's completion when its own marker is dropped", async () => {
    render(<MonthPage {...pageProps} />);
    await drop({ milestoneId: "ms-co-p-riverside", date: data.projects[0].targetCompletion }, { date: "2026-08-31" });
    // the project's PATCH wants every field, so the change rides with the project as it stands
    await waitFor(() =>
      expect(updateProject).toHaveBeenCalledWith(
        "p-riverside",
        expect.objectContaining({ targetCompletion: "2026-08-31", name: data.projects[0].name, managerId: data.projects[0].managerId })
      )
    );
    await waitFor(() => expect(notice()).toHaveTextContent("Certificate of Occupancy moved to Aug 31"));
  });

  it("moves the job and its bookings together on a drop", async () => {
    render(<MonthPage {...pageProps} />);
    await drop({ jobId: "j-riverside-concrete", date: "2026-06-15" }, { date: "2026-06-22" });
    await waitFor(() =>
      expect(rebookSchedule).toHaveBeenCalledWith(
        [
          { op: "job", id: "j-riverside-concrete", startDate: "2026-06-22", endDate: "2026-06-24" },
          { op: "move", id: "as-1", date: "2026-06-22" }
        ],
        { force: false }
      )
    );
    await waitFor(() => expect(notice()).toHaveTextContent("Riverside Office Building moved to Jun 22"));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(rebookSchedule).toHaveBeenLastCalledWith(
        [
          { op: "job", id: "j-riverside-concrete", startDate: "2026-06-15", endDate: "2026-06-17" },
          { op: "move", id: "as-1", date: "2026-06-15" }
        ],
        { force: false }
      )
    );
  });

  /* EVERY CHIP OPENS (2026-09-20). Reported with a clip: "make it so that a user is able to open
     all jobs — as of right now users are only able to open up a select amount of jobs to edit
     them." Markers were `<div>`s with no handler, on the reasoning that a marker is only a date;
     on the month in the clip that was 14 of the 20 chips, and nothing about one says it is a
     different kind of thing from the job beside it. A date is still something you edit. */
  const chips = () => [...document.querySelectorAll<HTMLElement>(".sched-cal-cell .sched-act")];
  const openDrawer = () => document.querySelector(".gantt-drawer");
  /* The fixture's two markers fall outside the month that renders — the phase ends 2026-07-14 and
     the Certificate of Occupancy 2026-09-04 — and the drag tests above never needed them drawn,
     because a drop is dispatched rather than clicked. A click has to hit a real chip, so both are
     brought into June. Their spans are kept honest: the phase still starts 2026-06-17. */
  const marked: BootstrapPayload = {
    ...data,
    phases: [{ ...data.phases[0], endDate: "2026-06-24" }],
    projects: [{ ...data.projects[0], targetCompletion: "2026-06-26" }, ...data.projects.slice(1)]
  };

  it("opens a drawer for every chip on the calendar, markers included", async () => {
    render(<MonthPage {...pageProps} data={marked} />);
    const all = chips();
    expect(all.length, "the fixture month has to hold both kinds").toBeGreaterThan(1);
    expect(all.some((chip) => chip.classList.contains("is-milestone")), "no marker to test").toBe(true);

    for (const chip of all) {
      const label = chip.querySelector("strong")?.textContent ?? "";
      fireEvent.click(chip);
      const drawer = await waitFor(() => {
        const found = openDrawer();
        expect(found, `${label} opened nothing`).not.toBeNull();
        return found as HTMLElement;
      });
      expect(drawer.querySelector("h2")?.textContent, "it opened something else").toBe(label);
      fireEvent.click(within(drawer).getByRole("button", { name: /^Close/ }));
      await waitFor(() => expect(openDrawer()).toBeNull());
    }
  });

  it("makes a marker a button, so the keyboard can reach it too", () => {
    render(<MonthPage {...pageProps} data={marked} />);
    const marker = chips().find((chip) => chip.classList.contains("is-milestone"));
    // it was a <div onClick>, which cannot be tabbed to or pressed with Enter
    expect(marker?.tagName).toBe("BUTTON");
  });

  it("saves a phase's own dates from its marker's drawer", async () => {
    render(<MonthPage {...pageProps} data={marked} />);
    fireEvent.click(chips().find((chip) => chip.querySelector("strong")?.textContent === "Foundation Complete")!);
    const drawer = await screen.findByRole("dialog", { name: "Foundation Complete" });
    // the phase's OWN span, not the job's
    const starts = within(drawer).getByLabelText("Phase starts") as HTMLInputElement;
    const finishes = within(drawer).getByLabelText("Phase finishes") as HTMLInputElement;
    expect(starts.value).toBe("2026-06-17");
    expect(finishes.value).toBe("2026-06-24");

    fireEvent.change(finishes, { target: { value: "2026-06-30" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save changes" }));
    // both dates ride along, so a start edited in the same visit is not dropped
    await waitFor(() => expect(updatePhase).toHaveBeenCalledWith("phase-1", { startDate: "2026-06-17", endDate: "2026-06-30" }));
    // and the work inside the phase is untouched — the drag's rule, kept by the form
    expect(rebookSchedule).not.toHaveBeenCalled();
    expect(updateJob).not.toHaveBeenCalled();
  });

  it("refuses a finish typed before the start, in the panel, and writes nothing", async () => {
    render(<MonthPage {...pageProps} data={marked} />);
    fireEvent.click(chips().find((chip) => chip.querySelector("strong")?.textContent === "Foundation Complete")!);
    const drawer = await screen.findByRole("dialog", { name: "Foundation Complete" });
    fireEvent.change(within(drawer).getByLabelText("Phase finishes"), { target: { value: "2026-06-01" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save changes" }));
    /* IN THE PANEL, not on the board's notice — which is behind it. The job drawer's rule. */
    await waitFor(() => expect(within(drawer).getByRole("alert")).toHaveTextContent("The finish cannot be before the start."));
    expect(updatePhase).not.toHaveBeenCalled();
  });

  /* A JOB YOU JUST SCHEDULED IS ON EVERY PAGE (2026-09-20). Reported: "if a user schedules a job
     within the Month, that same job can be seen within the week page, list, kanban, matrix, and
     gantt chart — as of right now it doesn't do it." The week and the month are one shared context
     so a page opens where the last one left off, which is right for browsing and wrong the moment
     you schedule something: measured in the running app, a job created on the 24th was invisible
     on List and Matrix (parked a week later) and on the Week BOARD — it showed only in the side
     queue, and only because its status happened to be Planned. Kanban and Gantt have no window
     and always showed it. */
  it("moves the shared week and month to a job it has just scheduled", async () => {
    const ctxKey = `bf:schedule:context:${userId}`;
    // parked in NOVEMBER, nowhere near the day the job is about to be made on
    window.localStorage.setItem(ctxKey, JSON.stringify({ weekStart: "2026-11-02", monthAnchor: "2026-06-01" }));
    vi.mocked(createJob).mockResolvedValueOnce({ ...pinecrestJob, id: "j-new", name: "New Pour", startDate: "2026-06-24", endDate: "2026-06-24" });
    vi.mocked(assignJob).mockResolvedValueOnce({ id: "as-new" } as never);

    render(<MonthPage {...pageProps} />);
    fireEvent.click(document.querySelector('.sched-cal-cell[data-date="2026-06-24"] .sched-cal-add') as HTMLElement);
    const dialog = await screen.findByRole("dialog", { name: "Add job to schedule" });
    fireEvent.change(within(dialog).getByLabelText("Job Name"), { target: { value: "New Pour" } });
    // the form's own guard refuses a blank phase, so the click would do nothing without this
    fireEvent.change(within(dialog).getByLabelText("Phase"), { target: { value: "Concrete - Pour" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create & Schedule Job" }));

    await waitFor(() => {
      const context = JSON.parse(window.localStorage.getItem(ctxKey) ?? "{}");
      // the Monday of the week holding the 24th — what Week, List and Matrix all read
      expect(context.weekStart, "the week boards would open somewhere else").toBe("2026-06-22");
      // the month rides along on its own: setting the week alone is what couples them
      expect(context.monthAnchor, "and the calendar too").toBe("2026-06-01");
    });
  });

  it("follows the job's OWN start day, not the cell the form was opened from", async () => {
    const ctxKey = `bf:schedule:context:${userId}`;
    // the calendar has to be on June for the 24th to be there to click; the WEEK is parked away
    window.localStorage.setItem(ctxKey, JSON.stringify({ weekStart: "2026-11-02", monthAnchor: "2026-06-01" }));
    /* The picker's Start Date is editable, so the day you clicked and the day the job lands on
       are not always the same. The job is the thing that has to be on screen. */
    vi.mocked(createJob).mockResolvedValueOnce({ ...pinecrestJob, id: "j-later", name: "Later Pour", startDate: "2026-07-08", endDate: "2026-07-08" });
    vi.mocked(assignJob).mockResolvedValueOnce({ id: "as-later" } as never);

    render(<MonthPage {...pageProps} />);
    fireEvent.click(document.querySelector('.sched-cal-cell[data-date="2026-06-24"] .sched-cal-add') as HTMLElement);
    const dialog = await screen.findByRole("dialog", { name: "Add job to schedule" });
    fireEvent.change(within(dialog).getByLabelText("Job Name"), { target: { value: "Later Pour" } });
    fireEvent.change(within(dialog).getByLabelText("Phase"), { target: { value: "Concrete - Pour" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create & Schedule Job" }));

    await waitFor(() => {
      const context = JSON.parse(window.localStorage.getItem(ctxKey) ?? "{}");
      expect(context.weekStart).toBe("2026-07-06"); // the Monday holding July 8, not June 22
      // and the calendar followed it out of June without being told to
      expect(context.monthAnchor).toBe("2026-07-01");
    });
  });

  it("saves the project's completion from the Certificate of Occupancy drawer", async () => {
    render(<MonthPage {...pageProps} data={marked} />);
    fireEvent.click(chips().find((chip) => chip.querySelector("strong")?.textContent === "Certificate of Occupancy")!);
    const drawer = await screen.findByRole("dialog", { name: "Certificate of Occupancy" });
    // a project marker has ONE date and no phase span
    expect(within(drawer).queryByLabelText("Phase starts")).toBeNull();
    fireEvent.change(within(drawer).getByLabelText("Target completion"), { target: { value: "2026-08-31" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save changes" }));
    // the project's PATCH wants every field, so the change rides with the project as it stands
    await waitFor(() =>
      expect(updateProject).toHaveBeenCalledWith(
        "p-riverside",
        expect.objectContaining({ targetCompletion: "2026-08-31", name: data.projects[0].name, managerId: data.projects[0].managerId })
      )
    );
  });
});

describe("Matrix page", () => {
  it("shows each crew's load across the week with a totals column", () => {
    render(<MatrixPage {...pageProps} />);
    expect(screen.getByRole("heading", { level: 1, name: /Matrix/ })).toBeInTheDocument();
    // the detail is the cell's accessible name and a tooltip that shows on hover and keyboard focus — not a title attribute
    const booked = screen.getByRole("button", { name: "Concrete Crew 1 · Jun 15: Riverside Office Building" });
    expect(booked.querySelector("[role='tooltip']")).toHaveTextContent("Concrete Crew 1 · Jun 15: Riverside Office Building");
    expect(booked).toHaveAttribute("aria-describedby", booked.querySelector("[role='tooltip']")?.id);
    expect(booked).not.toHaveAttribute("title");
    expect(screen.getByRole("button", { name: "Framing Crew 2 · Jun 17: Pinecrest Foundations" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Concrete Crew 1 · Jun 16: open" })).toBeInTheDocument();
    const row = screen.getByText("Concrete Crew 1", { selector: "strong" }).closest(".sched-matrix-row") as HTMLElement;
    expect(row.querySelector(".sched-matrix-total b")).toHaveTextContent("1");
    expect(row.querySelector(".sched-matrix-util")).toHaveTextContent("%");
    expect(row.querySelector(".sched-matrix-util")).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/^\d+% of working days booked this week$/)
    );
  });
});

describe("Gantt page", () => {
  const barOf = (name: string) => {
    const bar = screen
      .getAllByText(name)
      .map((element) => element.closest(".gantt-ctx"))
      .find((element): element is HTMLElement => element instanceof HTMLElement);
    if (!bar) throw new Error(`no bar for ${name}`);
    return bar;
  };

  it("draws a bar for every job", () => {
    render(<GanttPage {...pageProps} />);
    expect(screen.getByRole("heading", { level: 1, name: /Gantt Chart/ })).toBeInTheDocument();
    for (const job of data.jobs) expect(screen.getAllByText(job.name).length).toBeGreaterThan(0);
  });

  it("shares the KPI grid and the Schedule Alerts panel with the other six pages", () => {
    render(<GanttPage {...pageProps} />);
    expect(document.querySelectorAll(".schedule-kpis .kpi-card").length).toBeGreaterThan(0);
    const alerts = screen.getByRole("region", { name: "Schedule alerts" });
    expect(within(alerts).getByRole("heading", { name: "Schedule Alerts" })).toBeInTheDocument();
  });

  it("links a job to the one that follows it from the bar's menu, and unlinks from it", async () => {
    vi.mocked(createDependency).mockClear();
    vi.mocked(deleteDependency).mockClear();
    const first = render(<GanttPage {...pageProps} />);
    fireEvent.contextMenu(barOf("Riverside Office Building"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Link to another job/ }));
    const dialog = screen.getByRole("dialog", { name: /Link Riverside Office Building to another job/ });
    fireEvent.change(within(dialog).getByLabelText("Job that follows"), { target: { value: "j-pinecrest" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Link jobs" }));
    await waitFor(() =>
      expect(createDependency).toHaveBeenCalledWith({
        predecessorId: "j-riverside-concrete",
        successorId: "j-pinecrest",
        type: "FS",
        lagDays: 0
      })
    );
    await waitFor(() => expect(notice()).toHaveTextContent("Riverside Office Building → Pinecrest Foundations linked"));
    first.unmount();

    const linked: BootstrapPayload = {
      ...data,
      dependencies: [{ id: "dep-1", predecessorId: "j-riverside-concrete", successorId: "j-pinecrest", type: "FS", lagDays: 0 }]
    };
    render(<GanttPage {...pageProps} data={linked} />);
    fireEvent.contextMenu(barOf("Pinecrest Foundations"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Unlink Riverside Office Building \(FS\)/ }));
    await waitFor(() => expect(deleteDependency).toHaveBeenCalledWith("dep-1"));
    await waitFor(() => expect(notice()).toHaveTextContent("unlinked"));
  });

  it("flags the workspace's holidays on the timeline", () => {
    render(
      <GanttPage
        {...pageProps}
        data={{
          ...data,
          workCalendar: { workingDays: [1, 2, 3, 4, 5, 6], holidays: [{ date: "2026-06-17", name: "Juneteenth (observed)" }] }
        }}
      />
    );
    expect(screen.getByText("Juneteenth (observed)").closest(".gantt-marker")).toHaveClass("is-holiday");
  });
});

describe("Schedule landing", () => {
  it("shows the plan at a glance with a card for every view, and opens a view through the shared context", () => {
    const onOpenPage = vi.fn();
    render(<SchedulePage data={data} reload={reload} onOpenPage={onOpenPage} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("The whole plan");
    const cards = within(screen.getByLabelText("Schedule views")).getAllByRole("button");
    expect(cards.map((card) => card.querySelector("strong")?.textContent)).toEqual([
      "Month",
      "Week",
      "List",
      "Gantt Chart",
      "Kanban",
      "Matrix"
    ]);
    expect(within(screen.getByLabelText("Unassigned jobs")).getByText("Downtown Retail Buildout")).toBeInTheDocument();
    expect(screen.getByText("Concrete Crew 1", { selector: ".sched-avail-name" })).toBeInTheDocument();
    fireEvent.click(cards[1]);
    expect(onOpenPage).toHaveBeenCalledWith("week");
  });
});

describe("Guided tour", () => {
  const pageFor: Record<string, () => ReactElement> = {
    schedule: () => <SchedulePage data={data} reload={reload} onOpenPage={vi.fn()} />,
    week: () => <WeekPage {...pageProps} />,
    month: () => <MonthPage {...pageProps} />,
    list: () => <ListPage {...pageProps} />,
    gantt: () => <GanttPage {...pageProps} />,
    kanban: () => <KanbanPage {...pageProps} />,
    matrix: () => <MatrixPage {...pageProps} />
  };
  it("has its anchor on the page for every stop", () => {
    for (const step of scheduleTourSteps) {
      const { unmount } = render(pageFor[step.page]());
      expect(
        document.querySelector(`[data-tutorial-id="${step.targetId}"]`),
        `${step.id} → ${step.targetId} on ${step.page}`
      ).not.toBeNull();
      unmount();
    }
  });
  it("shows the view keys on the landing cards", () => {
    render(<SchedulePage data={data} reload={reload} onOpenPage={vi.fn()} />);
    expect([...document.querySelectorAll(".sched-view-key")].map((key) => key.textContent)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });
});

describe("Saved views", () => {
  it("saves the filters on screen under a name, shows the pin, and applies it again on one click", async () => {
    writeScheduleContext(userId, { ...EMPTY_SCHEDULE_CONTEXT, projectId: "p-pinecrest" });
    render(<WeekPage {...pageProps} />);
    const bar = screen.getByLabelText("Saved views");
    fireEvent.click(within(bar).getByRole("button", { name: "+ Save view" }));
    fireEvent.change(within(bar).getByLabelText("View name"), { target: { value: "Pinecrest crews" } });
    fireEvent.click(within(bar).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(setUserSetting).toHaveBeenCalledTimes(1));
    const [key, raw] = vi.mocked(setUserSetting).mock.calls[0];
    expect(key).toBe("schedule:views");
    expect(JSON.parse(raw)).toEqual([
      expect.objectContaining({ name: "Pinecrest crews", page: "week", filters: { projectId: "p-pinecrest" } })
    ]);
    await waitFor(() => expect(reload).toHaveBeenCalled());
    const chip = within(bar).getByRole("button", { name: "Pinecrest crews" });
    expect(chip.parentElement).toHaveClass("is-active");
    // the filters change, the pin dims; clicking it brings them back
    fireEvent.click(screen.getByRole("button", { name: /Clear filters/ }));
    expect(chip.parentElement).not.toHaveClass("is-active");
    fireEvent.click(chip);
    expect(readScheduleContext(userId).projectId).toBe("p-pinecrest");
    fireEvent.click(within(bar).getByRole("button", { name: "Remove saved view Pinecrest crews" }));
    await waitFor(() => expect(within(bar).queryByRole("button", { name: "Pinecrest crews" })).toBeNull());
  });

  it("cannot save a view with no filters", () => {
    render(<WeekPage {...pageProps} />);
    expect(within(screen.getByLabelText("Saved views")).getByRole("button", { name: "+ Save view" })).toBeDisabled();
  });

  it("opens a view from the Schedule flyout with its filters and its page", () => {
    const stored = JSON.stringify([{ id: "view-1", name: "Morning board", page: "matrix", filters: { crewType: "Framing" } }]);
    const open = vi.fn();
    render(<SavedViewsFlyout data={{ ...data, userSettings: { "schedule:views": stored } }} onOpenPage={open} />);
    fireEvent.click(screen.getByRole("menuitem", { name: /Morning board/ }));
    expect(open).toHaveBeenCalledWith("matrix");
    expect(readScheduleContext(userId)).toMatchObject({ crewType: "Framing", projectId: null });
  });
});

describe("Weekly digest", () => {
  it("tells the landing what moved since last Monday and emails it on request", async () => {
    render(<SchedulePage data={data} reload={reload} onOpenPage={vi.fn()} />);
    const panel = screen.getByLabelText("What changed this week");
    expect(await within(panel).findByText("Since the snapshot of Jun 8")).toBeInTheDocument();
    expect(within(panel).getByText("Riverside Office Building", { selector: "strong" })).toBeInTheDocument();
    expect(within(panel).getByText(/moved 2 days later/)).toBeInTheDocument();
    expect(within(panel).getByText(/double-booked on Jun 16/)).toBeInTheDocument();
    expect(within(panel).getByText(/slipped 2 days/)).toBeInTheDocument();
    expect(within(panel).getByText(/3 jobs, 2 bookings, 1 crew conflict/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: /Email the team now/ }));
    await waitFor(() => expect(sendScheduleDigest).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(notice()).toHaveTextContent("Digest emailed to 2 planners."));
  });
});

describe("First run", () => {
  const empty: BootstrapPayload = {
    ...bootstrapFixture,
    projects: [],
    phases: [],
    crews: [],
    jobs: [],
    assignments: [],
    equipment: [],
    materials: []
  };
  const landing = (payload: BootstrapPayload) => render(<SchedulePage data={payload} reload={reload} onOpenPage={vi.fn()} />);

  it("walks an empty workspace through crew, project, job and booking from the landing", async () => {
    landing(empty);
    const guide = screen.getByLabelText("Set up your schedule");
    expect(within(guide).getByRole("button", { name: "Add a job" })).toBeDisabled();
    fireEvent.change(within(guide).getByLabelText("Crew name"), { target: { value: "Concrete Crew 1" } });
    fireEvent.change(within(guide).getByLabelText("Crew lead"), { target: { value: "Mike Johnson" } });
    fireEvent.click(within(guide).getByRole("button", { name: "Create crew" }));
    await waitFor(() =>
      expect(createCrew).toHaveBeenCalledWith({
        name: "Concrete Crew 1",
        specialty: "Concrete",
        foreman: "Mike Johnson",
        laborMix: [{ category: "Labor", role: "Laborers", count: 4 }]
      })
    );
    await waitFor(() => expect(reload).toHaveBeenCalled());
    fireEvent.change(within(guide).getByLabelText("Project name"), { target: { value: "Riverside Office Building" } });
    fireEvent.change(within(guide).getByLabelText("Location"), { target: { value: "Downtown, Austin" } });
    fireEvent.click(within(guide).getByRole("button", { name: "Create project" }));
    await waitFor(() =>
      expect(createProject).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Riverside Office Building", location: "Downtown, Austin", managerId: "u-matt", status: "Planned" })
      )
    );
    await waitFor(() => expect(notice()).toHaveTextContent("Riverside Office Building created — now add its first job."));
  });

  it("marks the steps already done, and the last one when the week is booked", () => {
    landing({ ...empty, crews: bootstrapFixture.crews, projects: bootstrapFixture.projects, jobs: bootstrapFixture.jobs });
    const guide = screen.getByLabelText("Set up your schedule");
    expect(guide.querySelectorAll(".sched-firstrun-steps li.is-done")).toHaveLength(3);
    expect(within(guide).getByRole("button", { name: "Add a job" })).toBeEnabled();
    expect(within(guide).getByRole("button", { name: "Open the Week board" })).toBeInTheDocument();
    expect(within(guide).getByRole("button", { name: "Load sample data" })).toBeDisabled(); // the workspace has projects
  });

  it("loads sample data into an empty workspace and offers to remove it while it is there", async () => {
    landing(empty);
    fireEvent.click(within(screen.getByLabelText("Set up your schedule")).getByRole("button", { name: "Load sample data" }));
    await waitFor(() => expect(loadSampleData).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(notice()).toHaveTextContent("Sample data loaded"));
    render(<SchedulePage data={{ ...data, sampleData: true }} reload={reload} onOpenPage={vi.fn()} />);
    const sample = screen.getByLabelText("Sample data");
    fireEvent.click(within(sample).getByRole("button", { name: "Remove sample data" }));
    await waitFor(() => expect(removeSampleData).toHaveBeenCalledTimes(1));
  });

  it("stays out of the way once the week is booked", () => {
    landing(data);
    expect(screen.queryByLabelText("Set up your schedule")).toBeNull();
  });
});

describe("Continuity", () => {
  it("names a week that crosses New Year with both of its years", () => {
    // The label is what a planner reads, and it was built inline from the first day's year —
    // so the helper that knows better had a test, no caller, and the screen kept saying 2026.
    window.location.hash = "#schedule/week";
    writeScheduleContext(userId, { ...EMPTY_SCHEDULE_CONTEXT, weekStart: "2026-12-28" });
    render(<WeekPage {...pageProps} />);
    expect(screen.getByLabelText("Selected week Dec 28, 2026 - Jan 3, 2027")).toBeInTheDocument();
  });

  it("carries the week, the month and the filters across all seven pages, and survives a reload", () => {
    window.location.hash = "#schedule/week";
    writeScheduleContext(userId, { ...EMPTY_SCHEDULE_CONTEXT, weekStart: "2026-06-22", projectId: "p-pinecrest", crewType: "Framing" });
    const expectWeek = (label: string) => expect(screen.getByLabelText(`Selected week ${label}`)).toBeInTheDocument();
    const expectChips = () => {
      const chips = screen.getByLabelText("Active filters");
      expect(chips).toHaveTextContent("Pinecrest Medical");
      expect(chips).toHaveTextContent("Framing");
    };
    const pages: Array<[string, () => ReactElement, () => void]> = [
      ["Week", () => <WeekPage {...pageProps} />, () => expectWeek("Jun 22 - Jun 28, 2026")],
      ["List", () => <ListPage {...pageProps} />, () => expectWeek("Jun 22 - Jun 28, 2026")],
      ["Matrix", () => <MatrixPage {...pageProps} />, () => expectWeek("Jun 22 - Jun 28, 2026")],
      [
        "Gantt",
        () => <GanttPage {...pageProps} />,
        () => {
          // the chart's own stepper appears in its Week fit mode, and it is the shared week
          fireEvent.click(screen.getByRole("button", { name: "Week", pressed: false }));
          expect(screen.getByLabelText(/^Selected week Jun 22/)).toBeInTheDocument();
        }
      ],
      ["Kanban", () => <KanbanPage {...pageProps} />, () => undefined],
      ["Month", () => <MonthPage {...pageProps} />, () => expect(screen.getAllByText("June 2026").length).toBeGreaterThan(0)],
      [
        "Schedule",
        () => <SchedulePage data={data} reload={reload} onOpenPage={vi.fn()} />,
        () => expect(screen.getByText(/Jun 22 - Jun 28, 2026/)).toBeInTheDocument()
      ]
    ];
    for (const [, page, check] of pages) {
      const view = render(page());
      check();
      expectChips();
      view.unmount();
    }
    // a step on the Week board: the List, the Month and the landing follow
    let view = render(<WeekPage {...pageProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expectWeek("Jun 29 - Jul 5, 2026");
    view.unmount();
    view = render(<ListPage {...pageProps} />);
    expectWeek("Jun 29 - Jul 5, 2026");
    view.unmount();
    view = render(<MonthPage {...pageProps} />);
    expect(screen.getAllByText("June 2026").length).toBeGreaterThan(0); // Monday 29 June is still June
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getAllByText("July 2026").length).toBeGreaterThan(0);
    view.unmount();
    view = render(<WeekPage {...pageProps} />);
    expectWeek("Jun 29 - Jul 5, 2026"); // the week that holds 1 July was already on screen
    view.unmount();
    // a reload keeps only what is stored — and it is all there, in the link too
    expect(readScheduleContext(userId)).toMatchObject({
      weekStart: "2026-06-29",
      monthAnchor: "2026-07-01",
      projectId: "p-pinecrest",
      crewType: "Framing"
    });
    expect(parseScheduleHash(window.location.hash)?.patch).toMatchObject({
      weekStart: "2026-06-29",
      projectId: "p-pinecrest",
      crewType: "Framing"
    });
    window.location.hash = "";
  });
});

describe("Copy link", () => {
  it("puts the address of this view — this week, these filters — on the clipboard", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    window.location.hash = "#schedule/week";
    writeScheduleContext(userId, { ...EMPTY_SCHEDULE_CONTEXT, weekStart: "2026-06-22", projectId: "p-pinecrest" });
    render(<WeekPage {...pageProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Export/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Copy link to this view/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(window.location.href));
    expect(window.location.hash).toBe("#schedule/week?w=2026-06-22&project=p-pinecrest");
    await waitFor(() => expect(notice()).toHaveTextContent("Link copied"));
    window.location.hash = "";
  });
});

describe("Conflicts ask before saving", () => {
  const clash = () =>
    new ApiError("Framing Crew 2 is on Slab pour that day", 409, undefined, "conflict", {
      clashes: [
        {
          crewId: "crew-framing",
          crewName: "Framing Crew 2",
          date: "2026-06-24",
          jobId: "j-other",
          jobName: "Slab pour",
          movingJobId: "j-pinecrest",
          movingJobName: "Pinecrest Foundations"
        }
      ]
    });
  /** Opens Pinecrest's drawer from its Week card and moves the job a week later, the same length. */
  const moveFromDrawer = async () => {
    render(<WeekPage {...pageProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Pinecrest Foundations" }));
    const drawer = await screen.findByRole("dialog", { name: "Pinecrest Foundations" });
    fireEvent.change(within(drawer).getByLabelText("Start"), { target: { value: "2026-06-24" } });
    fireEvent.change(within(drawer).getByLabelText("Finish"), { target: { value: "2026-06-25" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save changes" }));
  };
  beforeEach(() => {
    vi.mocked(rebookSchedule).mockClear();
    vi.mocked(updateJob).mockClear();
  });

  it("moves a job with its bookings from the drawer, and asks before double-booking the crew", async () => {
    vi.mocked(rebookSchedule).mockRejectedValueOnce(clash());
    await moveFromDrawer();
    const ask = await screen.findByRole("alertdialog", { name: "Book anyway?" });
    expect(ask).toHaveTextContent("Framing Crew 2 is on Slab pour that day");
    expect(rebookSchedule).toHaveBeenCalledTimes(1);
    expect(vi.mocked(rebookSchedule).mock.calls[0]).toEqual([
      [
        { op: "job", id: "j-pinecrest", startDate: "2026-06-24", endDate: "2026-06-25" },
        { op: "move", id: "as-2", date: "2026-06-24" }
      ],
      { force: false }
    ]);
    fireEvent.click(within(ask).getByRole("button", { name: "Book anyway" }));
    await waitFor(() => expect(rebookSchedule).toHaveBeenCalledTimes(2));
    expect(vi.mocked(rebookSchedule).mock.calls[1]?.[1]).toEqual({ force: true });
    expect(updateJob).not.toHaveBeenCalled(); // nothing but the dates changed
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Pinecrest Foundations" })).toBeNull()); // saved: the drawer closes
  });

  it("saves nothing when the planner keeps the schedule as it is", async () => {
    vi.mocked(rebookSchedule).mockRejectedValueOnce(clash());
    await moveFromDrawer();
    const ask = await screen.findByRole("alertdialog", { name: "Book anyway?" });
    fireEvent.click(within(ask).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(rebookSchedule).toHaveBeenCalledTimes(1);
    expect(updateJob).not.toHaveBeenCalled();
    expect(screen.getByText(/Pinecrest Foundations stays on/)).toBeInTheDocument();
  });

  it("edits a job in place when only its status changes, and offers the way back", async () => {
    render(<WeekPage {...pageProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Pinecrest Foundations" }));
    const drawer = await screen.findByRole("dialog", { name: "Pinecrest Foundations" });
    fireEvent.change(within(drawer).getByLabelText("Status"), { target: { value: "On Site" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateJob).toHaveBeenCalledWith("j-pinecrest", { status: "On Site" }, undefined));
    expect(rebookSchedule).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(updateJob).toHaveBeenLastCalledWith("j-pinecrest", { status: "In Progress" }));
  });
});

describe("News from another tab", () => {
  /** jsdom has no EventSource, so the live feed's effect returns early without one. */
  class FakeEventSource {
    static open: FakeEventSource[] = [];
    listeners = new Map<string, (event: Event) => void>();
    withCredentials = true;
    constructor(public url: string) {
      FakeEventSource.open.push(this);
    }
    addEventListener(type: string, handler: (event: Event) => void) {
      this.listeners.set(type, handler);
    }
    removeEventListener(type: string) {
      this.listeners.delete(type);
    }
    close() {}
    /** What the server sends when somebody else moves something. */
    announce(payload: Record<string, unknown>) {
      this.listeners.get("schedule")?.(new MessageEvent("schedule", { data: JSON.stringify(payload) }));
    }
  }

  beforeEach(() => {
    FakeEventSource.open = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("announces a change from another tab without taking away the Undo", async () => {
    render(<WeekPage {...pageProps} />);
    await drop(
      { assignmentId: "as-1", jobId: "j-riverside-concrete", crewId: "crew-concrete", date: "2026-06-15" },
      { crewId: "crew-framing", date: "2026-06-17" }
    );
    const undo = await screen.findByRole("button", { name: "Undo" });
    expect(undo).toBeInTheDocument();

    const feed = FakeEventSource.open[0];
    expect(feed, "the page should be listening to the org's feed").toBeDefined();
    act(() => {
      feed.announce({ kind: "assignments", op: "move", ids: ["as-9"], by: { id: "u-2", name: "Dana Brooks" }, client: "another-tab" });
    });

    // the news lands…
    expect(await screen.findByText("Dana Brooks changed a booking in another tab.")).toBeInTheDocument();
    // …beside the way back, not over it. One notice slot meant this click disappeared mid-decision.
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.getByText(/Riverside Office Building moved to Framing Crew 2/)).toBeInTheDocument();

    // both sit inside the one live region, so a screen reader hears them in order
    const region = document.querySelector(".gantt-status-live")!;
    expect(region).toHaveTextContent("Riverside Office Building moved to Framing Crew 2");
    expect(region).toHaveTextContent("Dana Brooks changed a booking in another tab.");
  });
});

describe("What a control says it will do", () => {
  it("names a board card for the drawer it opens, not the project it does not", () => {
    render(<WeekPage {...pageProps} />);
    // the card opened the job drawer while announcing itself as the way to the project record
    const card = screen.getByRole("button", { name: "Open Pinecrest Foundations" });
    expect(screen.queryByRole("button", { name: "Open Pinecrest Foundations project" })).toBeNull();
    fireEvent.click(card);
    expect(screen.getByRole("dialog", { name: "Pinecrest Foundations" })).toBeInTheDocument();
  });

  it("leaves no control on the board promising a project it will not open", () => {
    render(<WeekPage {...pageProps} />);
    const promisesAProject = screen.queryAllByRole("button", { name: /\bproject$/ });
    expect(promisesAProject).toHaveLength(0);
    // the queue's cards are not a way into anything: they say what they are for
    expect(screen.getByRole("button", { name: "Downtown Retail Buildout — drag onto the board to book it" })).toBeInTheDocument();
  });
});

describe("Undoing into a day somebody else took", () => {
  const clashOnTheWayBack = () =>
    new ApiError("Concrete Crew 1 is on Slab pour that day", 409, undefined, "conflict", {
      clashes: [{ crewId: "crew-concrete", crewName: "Concrete Crew 1", date: "2026-06-15", jobId: "j-other", jobName: "Slab pour" }]
    });

  beforeEach(() => {
    vi.mocked(rebookSchedule).mockClear();
    vi.mocked(rebookSchedule).mockResolvedValue({ assignments: [{ id: "as-new" }], removed: [], jobs: [] } as never);
  });

  it("asks before double-booking on the way back, and leaves the card where it is on a no", async () => {
    render(<WeekPage {...pageProps} />);
    await drop(
      { assignmentId: "as-1", jobId: "j-riverside-concrete", crewId: "crew-concrete", date: "2026-06-15" },
      { crewId: "crew-framing", date: "2026-06-17" }
    );
    await waitFor(() => expect(notice()).toHaveTextContent("moved to Framing Crew 2"));

    // while the notice is up, somebody takes the crew-day it came from
    vi.mocked(rebookSchedule).mockRejectedValueOnce(clashOnTheWayBack());
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    // the way back is a clash the planner has not seen, so it is put to them
    const ask = await screen.findByRole("alertdialog", { name: "Book anyway?" });
    expect(ask).toHaveTextContent("Concrete Crew 1 is on Slab pour that day");
    fireEvent.click(within(ask).getByRole("button", { name: "Cancel" }));

    // a no leaves the move where it is — the card does not go home over somebody else
    await waitFor(() => expect(notice()).toHaveTextContent("stays where it is"));
    expect(vi.mocked(rebookSchedule).mock.calls.filter((call) => call[1]?.force === true)).toHaveLength(0);
  });

  it("goes home on a yes, and only then forces it", async () => {
    render(<WeekPage {...pageProps} />);
    await drop(
      { assignmentId: "as-1", jobId: "j-riverside-concrete", crewId: "crew-concrete", date: "2026-06-15" },
      { crewId: "crew-framing", date: "2026-06-17" }
    );
    await waitFor(() => expect(notice()).toHaveTextContent("moved to Framing Crew 2"));

    vi.mocked(rebookSchedule).mockRejectedValueOnce(clashOnTheWayBack());
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    const ask = await screen.findByRole("alertdialog", { name: "Book anyway?" });
    fireEvent.click(within(ask).getByRole("button", { name: "Book anyway" }));

    // the retry is the forced one, and it is the planner who forced it
    await waitFor(() => expect(vi.mocked(rebookSchedule).mock.calls.some((call) => call[1]?.force === true)).toBe(true));
    await waitFor(() => expect(notice()).toHaveTextContent("back with Concrete Crew 1"));
  });
});

describe("When somebody else got there first", () => {
  beforeEach(() => {
    vi.mocked(updateJob).mockClear();
    reload.mockClear();
    reload.mockResolvedValue(undefined);
  });

  /** What the server answers when the row has moved on since the client read it. */
  const stale = () =>
    new ApiError(
      "Pinecrest Foundations was changed by someone else while you had it open, so nothing was saved.",
      409,
      undefined,
      "stale",
      {
        current: { version: 4, startDate: "2026-06-29" }
      }
    );

  it("says who moved what, refreshes the board, and does not offer to force it", async () => {
    vi.mocked(updateJob).mockRejectedValueOnce(stale());
    render(<WeekPage {...pageProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Pinecrest Foundations" }));
    const drawer = await screen.findByRole("dialog", { name: "Pinecrest Foundations" });
    fireEvent.change(within(drawer).getByLabelText("Status"), { target: { value: "On Site" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save changes" }));

    // the server's words, not "could not save" — nothing was wrong with the request
    expect(await within(drawer).findByRole("alert")).toHaveTextContent("was changed by someone else while you had it open");
    await waitFor(() => expect(notice()).toHaveTextContent("was changed by someone else while you had it open"));
    // the board is refreshed, so the planner is looking at what really happened
    await waitFor(() => expect(reload).toHaveBeenCalled());
    // and this is not the double-booking question: there is nothing to force
    expect(screen.queryByRole("alertdialog", { name: "Book anyway?" })).toBeNull();
    expect(vi.mocked(updateJob)).toHaveBeenCalledTimes(1);
    // the drawer stays open with the change still in it, so the planner can decide again
    expect(screen.getByRole("dialog", { name: "Pinecrest Foundations" })).toBeInTheDocument();
  });

  it("sends the version it read, so the server can tell", async () => {
    render(<WeekPage {...pageProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Pinecrest Foundations" }));
    const drawer = await screen.findByRole("dialog", { name: "Pinecrest Foundations" });
    fireEvent.change(within(drawer).getByLabelText("Status"), { target: { value: "On Site" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateJob).toHaveBeenCalled());
    // the fixture's jobs carry no version, so this is the shape rather than the number
    expect(vi.mocked(updateJob).mock.calls[0]).toHaveLength(3);
  });
});

describe("When the write lands but the board cannot refresh", () => {
  beforeEach(() => {
    vi.mocked(rebookSchedule).mockClear();
    vi.mocked(updateJob).mockClear();
    reload.mockClear();
    reload.mockResolvedValue(undefined);
  });
  afterEach(() => {
    reload.mockResolvedValue(undefined);
  });

  it("says the board may be out of date instead of claiming the change failed", async () => {
    reload.mockRejectedValueOnce(new Error("Could not reach the BuildFlow API"));
    render(<WeekPage {...pageProps} />);
    await drop(
      { assignmentId: "as-1", jobId: "j-riverside-concrete", crewId: "crew-concrete", date: "2026-06-15" },
      { crewId: "crew-framing", date: "2026-06-17" }
    );
    // the re-book itself went through: the server has the move
    await waitFor(() => expect(rebookSchedule).toHaveBeenCalled());
    await waitFor(() => expect(notice()).toHaveTextContent("The board could not refresh, so what you see may be out of date"));
    expect(notice()).toHaveTextContent("Riverside Office Building moved to Framing Crew 2 on Jun 17");
    expect(notice()).not.toHaveTextContent("Could not move");
    expect(notice()).toHaveClass("is-error");
    // no Undo against a board that is already behind — the way out is to refresh
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(notice()).toHaveTextContent("The board is up to date."));
  });

  it("offers the refresh again when it still cannot reach the API", async () => {
    reload.mockRejectedValue(new Error("Could not reach the BuildFlow API"));
    render(<WeekPage {...pageProps} />);
    await drop({ jobId: "j-unassigned" }, { crewId: "crew-framing", date: "2026-06-16" });
    await waitFor(() => expect(notice()).toHaveTextContent("may be out of date"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(notice()).toHaveTextContent("Still could not reach the API"));
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });

  it("closes the drawer on a save that landed, and keeps it open on one that did not", async () => {
    reload.mockRejectedValueOnce(new Error("Could not reach the BuildFlow API"));
    render(<WeekPage {...pageProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Pinecrest Foundations" }));
    const drawer = await screen.findByRole("dialog", { name: "Pinecrest Foundations" });
    fireEvent.change(within(drawer).getByLabelText("Status"), { target: { value: "On Site" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateJob).toHaveBeenCalledWith("j-pinecrest", { status: "On Site" }, undefined));
    // the save worked, so the drawer closes and the notice carries the news about the board
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Pinecrest Foundations" })).toBeNull());
    expect(notice()).toHaveTextContent("Pinecrest Foundations saved. The board could not refresh");

    // a write that genuinely fails still says so, in the drawer, which stays open
    vi.mocked(updateJob).mockRejectedValueOnce(new Error("nope"));
    fireEvent.click(screen.getByRole("button", { name: "Open Pinecrest Foundations" }));
    const again = await screen.findByRole("dialog", { name: "Pinecrest Foundations" });
    fireEvent.change(within(again).getByLabelText("Status"), { target: { value: "Complete" } });
    fireEvent.click(within(again).getByRole("button", { name: "Save changes" }));
    expect(await within(again).findByRole("alert")).toHaveTextContent("Could not save Pinecrest Foundations: nope");
    expect(screen.getByRole("dialog", { name: "Pinecrest Foundations" })).toBeInTheDocument();
  });
});

describe("Transactional writes", () => {
  beforeEach(() => {
    vi.mocked(rebookSchedule).mockClear();
    vi.mocked(updateJob).mockClear();
  });

  it("saves a move with its other changes as one re-book request, and takes it back with one", async () => {
    render(<WeekPage {...pageProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Pinecrest Foundations" }));
    const drawer = await screen.findByRole("dialog", { name: "Pinecrest Foundations" });
    fireEvent.change(within(drawer).getByLabelText("Start"), { target: { value: "2026-06-24" } });
    fireEvent.change(within(drawer).getByLabelText("Finish"), { target: { value: "2026-06-25" } });
    fireEvent.change(within(drawer).getByLabelText("Status"), { target: { value: "On Site" } });
    fireEvent.change(within(drawer).getByLabelText("Notes"), { target: { value: "Pour after the inspection" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(rebookSchedule).toHaveBeenCalledTimes(1));
    expect(vi.mocked(rebookSchedule).mock.calls[0]).toEqual([
      [
        {
          op: "job",
          id: "j-pinecrest",
          startDate: "2026-06-24",
          endDate: "2026-06-25",
          status: "On Site",
          notes: "Pour after the inspection"
        },
        { op: "move", id: "as-2", date: "2026-06-24" }
      ],
      { force: false }
    ]);
    expect(updateJob).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(rebookSchedule).toHaveBeenCalledTimes(2));
    expect(vi.mocked(rebookSchedule).mock.calls[1]).toEqual([
      [
        { op: "job", id: "j-pinecrest", startDate: "2026-06-17", endDate: "2026-06-18", status: "In Progress", notes: "Slab pour." },
        { op: "move", id: "as-2", date: "2026-06-17" }
      ],
      { force: false }
    ]);
    expect(updateJob).not.toHaveBeenCalled();
  });
});

describe("Correct anywhere", () => {
  const withHoliday: BootstrapPayload = {
    ...data,
    workCalendar: { workingDays: [1, 2, 3, 4, 5, 6], holidays: [{ date: "2026-06-17", name: "Juneteenth (observed)" }] }
  };

  it("marks the workspace's holiday on the Week board, the Matrix and the List", () => {
    const week = render(<WeekPage {...pageProps} data={withHoliday} />);
    expect(screen.getByText("Juneteenth (observed)")).toBeInTheDocument();
    expect(cell("crew-framing", "2026-06-17")).toHaveClass("is-holiday");
    week.unmount();
    const matrix = render(<MatrixPage {...pageProps} data={withHoliday} />);
    expect(screen.getByText("Juneteenth (observed)")).toBeInTheDocument();
    matrix.unmount();
    render(<ListPage {...pageProps} data={withHoliday} />);
    expect(screen.getByText(/Juneteenth \(observed\)/)).toBeInTheDocument();
  });
});

describe("Same export everywhere", () => {
  const pages: Array<[string, () => ReactElement]> = [
    ["Schedule landing", () => <SchedulePage data={data} reload={reload} onOpenPage={vi.fn()} />],
    ["Week", () => <WeekPage {...pageProps} />],
    ["List", () => <ListPage {...pageProps} />],
    ["Kanban", () => <KanbanPage {...pageProps} />],
    ["Month", () => <MonthPage {...pageProps} />],
    ["Matrix", () => <MatrixPage {...pageProps} />],
    ["Gantt", () => <GanttPage {...pageProps} />]
  ];

  it("offers the same menu — CSV, link, crew week sheets, calendar feeds — on all seven pages", () => {
    for (const [name, page] of pages) {
      const view = render(page());
      fireEvent.click(screen.getByRole("button", { name: /Export/ }));
      for (const item of ["Download CSV", "Copy link to this view", "Print week sheets", "Calendar feeds…"]) {
        expect(screen.getByRole("menuitem", { name: new RegExp(item) }), `${name}: ${item}`).toBeInTheDocument();
      }
      view.unmount();
    }
  });

  it("writes the same columns and the same rows for the same week from the landing and the Week board", () => {
    vi.mocked(downloadCsv).mockClear();
    const csvOf = (page: ReactElement) => {
      const view = render(page);
      fireEvent.click(screen.getByRole("button", { name: /Export/ }));
      fireEvent.click(screen.getByRole("menuitem", { name: /Download CSV/ }));
      view.unmount();
      const call = vi.mocked(downloadCsv).mock.calls.at(-1);
      if (!call) throw new Error("no CSV was written");
      return { filename: call[0], csv: call[1] };
    };
    const landing = csvOf(<SchedulePage data={data} reload={reload} onOpenPage={vi.fn()} />);
    const week = csvOf(<WeekPage {...pageProps} />);
    expect(landing.filename).toBe("buildflow-schedule-2026-06-15");
    expect(week.filename).toBe("buildflow-week-2026-06-15");
    expect(landing.csv.split("\n")[0]).toBe(EXPORT_COLUMNS.map((column) => `"${column}"`).join(","));
    expect(landing.csv.split("\n").sort()).toEqual(week.csv.split("\n").sort());
    expect(landing.csv).toContain("Pinecrest Foundations");
  });
});

describe("One job, one crew-day, one booking", () => {
  it("says a queued job dropped on the crew-day it already has is booked there, and writes nothing", async () => {
    render(<WeekPage {...pageProps} />);
    await drop({ jobId: "j-riverside-concrete" }, { crewId: "crew-concrete", date: "2026-06-15" });
    expect(notice()).toHaveTextContent("Riverside Office Building is already booked with Concrete Crew 1 on Jun 15.");
    expect(rebookSchedule).not.toHaveBeenCalled();
  });
});

describe("Links from the drawer", () => {
  const linked: BootstrapPayload = {
    ...data,
    dependencies: [{ id: "dep-1", predecessorId: "j-riverside-concrete", successorId: "j-pinecrest", type: "FS", lagDays: 0 }]
  };
  /** Enter on a focused control. jsdom does not turn Enter on a native button into the click a browser fires, so this does what the browser does. */
  const press = (element: HTMLElement) => {
    element.focus();
    fireEvent.keyDown(element, { key: "Enter" });
    if (element.tagName === "BUTTON") fireEvent.click(element);
  };

  it("adds and removes a dependency from the Gantt's drawer with the keyboard alone", async () => {
    vi.mocked(createDependency).mockClear();
    vi.mocked(deleteDependency).mockClear();
    render(<GanttPage {...pageProps} data={linked} />);
    // Enter on the job's sidebar row opens its drawer
    const sidebar = document.querySelector(".gantt-sidebar") as HTMLElement;
    press(within(sidebar).getByRole("button", { name: /^Pinecrest Foundations/ }));
    const drawer = await screen.findByRole("dialog", { name: "Pinecrest Foundations" });
    const links = within(drawer).getByRole("region", { name: "Dependencies" });
    expect(links).toHaveTextContent("Follows Riverside Office Building (FS)");
    // "Link to another job…" from the drawer, then the dialog's own controls
    press(within(links).getByRole("button", { name: /Link to another job/ }));
    const dialog = screen.getByRole("dialog", { name: /Link Pinecrest Foundations to another job/ });
    fireEvent.change(within(dialog).getByLabelText("Job that follows"), { target: { value: "j-unassigned" } });
    press(within(dialog).getByRole("button", { name: "Link jobs" }));
    await waitFor(() =>
      expect(createDependency).toHaveBeenCalledWith({ predecessorId: "j-pinecrest", successorId: "j-unassigned", type: "FS", lagDays: 0 })
    );
    await waitFor(() => expect(notice()).toHaveTextContent("Pinecrest Foundations → Downtown Retail Buildout linked"));
    expect(screen.getByRole("dialog", { name: "Pinecrest Foundations" })).toBeInTheDocument(); // the drawer stays open
    // Escape closes the link dialog only — the drawer under it stays
    press(within(links).getByRole("button", { name: /Link to another job/ }));
    fireEvent.keyDown(screen.getByRole("dialog", { name: /Link Pinecrest Foundations to another job/ }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Link Pinecrest Foundations to another job/ })).toBeNull());
    expect(screen.getByRole("dialog", { name: "Pinecrest Foundations" })).toBeInTheDocument();
    // Unlink from the drawer
    press(within(links).getByRole("button", { name: "Unlink Riverside Office Building" }));
    await waitFor(() => expect(deleteDependency).toHaveBeenCalledWith("dep-1"));
    await waitFor(() => expect(notice()).toHaveTextContent("Riverside Office Building and Pinecrest Foundations unlinked"));
  });

  it("carries the same links in the drawer on the Week board", async () => {
    render(<WeekPage {...pageProps} data={linked} />);
    fireEvent.click(within(cell("crew-concrete", "2026-06-15")).getByText("Riverside Office Building"));
    const drawer = await screen.findByRole("dialog", { name: "Riverside Office Building" });
    const links = within(drawer).getByRole("region", { name: "Dependencies" });
    expect(links).toHaveTextContent("Leads to Pinecrest Foundations (FS)");
    expect(within(links).getByRole("button", { name: "Unlink Pinecrest Foundations" })).toBeInTheDocument();
    expect(within(links).getByRole("button", { name: /Link to another job/ })).toBeInTheDocument();
  });
});

describe("Dialogs that behave like dialogs", () => {
  /** Everything the keyboard can reach inside an element, in order. */
  const reachable = (root: HTMLElement) => [
    ...root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ];

  it("keeps Tab inside the job drawer and gives focus back to the card that opened it", async () => {
    render(<WeekPage {...pageProps} />);
    const card = within(cell("crew-concrete", "2026-06-15")).getByText("Riverside Office Building").closest("button") as HTMLElement;
    card.focus();
    fireEvent.click(card);
    const drawer = await screen.findByRole("dialog", { name: "Riverside Office Building" });
    // focus goes in, and Tab past the last control comes back to the first
    expect(drawer.contains(document.activeElement)).toBe(true);
    const inside = reachable(drawer);
    expect(inside.length).toBeGreaterThan(3);
    inside[inside.length - 1].focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(inside[0]);
    // and Shift+Tab off the first wraps to the last, rather than leaving for the page behind
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(inside[inside.length - 1]);

    fireEvent.click(within(drawer).getByRole("button", { name: "Close job details" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Riverside Office Building" })).toBeNull());
    expect(document.activeElement).toBe(card);
  });

  it("says a failed save inside the drawer, where the eye already is", async () => {
    vi.mocked(updateJob).mockRejectedValueOnce(new Error("Could not reach the BuildFlow API."));
    render(<WeekPage {...pageProps} />);
    fireEvent.click(within(cell("crew-concrete", "2026-06-15")).getByText("Riverside Office Building"));
    const drawer = await screen.findByRole("dialog", { name: "Riverside Office Building" });
    fireEvent.change(within(drawer).getByLabelText("Notes"), { target: { value: "a note that cannot be saved" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save changes" }));
    const alert = await within(drawer).findByRole("alert");
    expect(alert).toHaveTextContent("Could not save Riverside Office Building");
    expect(screen.getByRole("dialog", { name: "Riverside Office Building" })).toBeInTheDocument(); // it stays open
  });

  it("keeps a live region on the page before there is anything to announce", async () => {
    render(<WeekPage {...pageProps} />);
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();
    expect(region).toHaveAttribute("aria-live", "polite");
    // the message lands inside the region that was already there
    await drop(
      { assignmentId: "as-1", jobId: "j-riverside-concrete", crewId: "crew-concrete", date: "2026-06-15" },
      { crewId: "crew-concrete", date: "2026-06-17" }
    );
    await waitFor(() => expect(region).toHaveTextContent("moved to"));
  });
});

describe("An export says what happened", () => {
  it("tells the planner when the browser would not save the file, instead of claiming it did", async () => {
    vi.mocked(downloadCsv).mockReturnValueOnce(false);
    render(<WeekPage {...pageProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Export/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Download CSV/ }));
    await waitFor(() => expect(notice()).toHaveTextContent("This browser would not save the file"));
    expect(notice()).toHaveClass("is-error");
  });

  it("still says what it wrote when the file goes out", async () => {
    vi.mocked(downloadCsv).mockReturnValueOnce(true);
    render(<WeekPage {...pageProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Export/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Download CSV/ }));
    await waitFor(() => expect(notice()).toHaveTextContent(/Exported \d+ rows to buildflow-week-/));
  });

  it("tells the planner when the print view would not open", async () => {
    vi.mocked(printHtml).mockReturnValueOnce(false);
    render(<WeekPage {...pageProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Export/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Print week sheets/ }));
    await waitFor(() => expect(notice()).toHaveTextContent("This browser would not open the print view"));
  });

  it("gives the Matrix a legend for the colours it actually uses", () => {
    render(<MatrixPage {...pageProps} />);
    const legend = screen.getByLabelText("What the cells mean");
    for (const band of ["Open", "1 booking", "2 bookings", "3 or more", "Clash to settle"]) {
      expect(legend).toHaveTextContent(band);
    }
    // the status words belong to the boards that colour by status
    expect(legend).not.toHaveTextContent("DelayIQed");
    expect(screen.queryByLabelText("Schedule statuses")).toBeNull();
  });
});

describe("What a phone gets", () => {
  /** A viewport of `width` px, the way the page asks about one. */
  const atWidth = (width: number) => {
    vi.stubGlobal("matchMedia", (query: string) => {
      const max = /max-width:\s*(\d+)px/.exec(query);
      const min = /min-width:\s*(\d+)px/.exec(query);
      const matches = (!max || width <= Number(max[1])) && (!min || width >= Number(min[1]));
      return { matches, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), onchange: null, dispatchEvent: vi.fn() };
    });
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("opens the chart on the fitted week at 375 px", () => {
    atWidth(375);
    render(<GanttPage {...pageProps} />);
    expect(screen.getByRole("button", { name: "Week", pressed: true })).toBeInTheDocument();
    // the fitted week brings the chart's own stepper with it
    expect(screen.getByLabelText(/^Selected week/)).toBeInTheDocument();
  });

  it("opens the chart on the month on a desktop", () => {
    atWidth(1280);
    render(<GanttPage {...pageProps} />);
    expect(screen.getByRole("button", { name: "Month", pressed: true })).toBeInTheDocument();
  });

  it("keeps a range the planner chose, whatever the screen", () => {
    window.localStorage.setItem("gantt:range", JSON.stringify("quarterly"));
    atWidth(375);
    render(<GanttPage {...pageProps} />);
    expect(screen.getByRole("button", { name: "Quarter", pressed: true })).toBeInTheDocument();
  });
});

describe("Dragging a bar on the chart", () => {
  /**
   * What jsdom does not give a drag: the timeline has no size, and there is no pointer capture. The
   * chart reads dates off the first and takes the pointer with the second, so both are stood in for.
   */
  const withADraggableChart = () => {
    const realRect = Element.prototype.getBoundingClientRect;
    const captured = new Set<number>();
    Element.prototype.getBoundingClientRect = function box(this: Element) {
      if (this.classList.contains("gantt-timeline"))
        return { left: 0, top: 0, width: 4500, height: 400, right: 4500, bottom: 400, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
      return realRect.call(this);
    };
    Element.prototype.setPointerCapture = function capture(id: number) {
      captured.add(id);
    };
    Element.prototype.hasPointerCapture = function has(id: number) {
      return captured.has(id);
    };
    Element.prototype.releasePointerCapture = function release(id: number) {
      captured.delete(id);
    };
    return () => {
      Element.prototype.getBoundingClientRect = realRect;
    };
  };

  it("moves the job's dates through the same save the drawer uses", async () => {
    vi.mocked(updateJob).mockClear();
    vi.mocked(rebookSchedule).mockClear();
    const restore = withADraggableChart();
    try {
      render(<GanttPage {...pageProps} />);
      const bar = document.querySelector(".gantt-bar") as HTMLElement;
      expect(bar, "the chart drew a bar").not.toBeNull();
      // jsdom has no PointerEvent; the chart reads clientX and the pointer id, which a MouseEvent carries
      const pointer = (type: string, clientX: number) =>
        Object.assign(new MouseEvent(type, { bubbles: true, clientX, clientY: 10, button: 0 }), { pointerId: 1 });
      bar.dispatchEvent(pointer("pointerdown", 200));
      bar.dispatchEvent(pointer("pointermove", 560));
      bar.dispatchEvent(pointer("pointerup", 560));
      // a job with bookings moves through the re-book, so its bookings travel with it; one without is a plain patch
      await waitFor(() =>
        expect(
          vi.mocked(rebookSchedule).mock.calls.length + vi.mocked(updateJob).mock.calls.length,
          "the drag saved something"
        ).toBeGreaterThan(0)
      );
      const rebooked = vi.mocked(rebookSchedule).mock.calls.at(-1);
      const span = rebooked
        ? (rebooked[0].find((move) => move.op === "job") as { startDate: string; endDate: string })
        : (vi.mocked(updateJob).mock.calls.at(-1)?.[1] as { startDate: string; endDate: string });
      expect(span.startDate, "a moved bar sends a real start date").toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(span.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(span.endDate >= span.startDate, "the span stays the right way round").toBe(true);
      // and the bookings of that job move with it
      if (rebooked)
        expect(
          rebooked[0].some((move) => move.op === "move"),
          "its bookings travel with it"
        ).toBe(true);
    } finally {
      restore();
    }
  });

  it("leaves a bar where the hand put it when an unrelated change reloads the board", async () => {
    vi.mocked(updateJob).mockClear();
    vi.mocked(rebookSchedule).mockClear();
    // the save never answers, so the bar stays mid-flight for the whole test
    vi.mocked(rebookSchedule).mockImplementation(() => new Promise(() => {}));
    vi.mocked(updateJob).mockImplementation(() => new Promise(() => {}));
    const restore = withADraggableChart();
    try {
      const view = render(<GanttPage {...pageProps} />);
      const bar = document.querySelector(".gantt-bar") as HTMLElement;
      const startedAt = bar.getAttribute("title");
      const pointer = (type: string, clientX: number) =>
        Object.assign(new MouseEvent(type, { bubbles: true, clientX, clientY: 10, button: 0 }), { pointerId: 1 });
      bar.dispatchEvent(pointer("pointerdown", 200));
      bar.dispatchEvent(pointer("pointermove", 560));
      bar.dispatchEvent(pointer("pointerup", 560));
      await waitFor(() => expect(document.querySelector(".gantt-bar")!.getAttribute("title")).not.toBe(startedAt));
      const movedTo = document.querySelector(".gantt-bar")!.getAttribute("title");

      // somebody changes something else entirely, so the board reloads with a new jobs array
      const elsewhere = {
        ...data,
        jobs: data.jobs.map((job) => (job.id === "j-pinecrest" ? { ...job, notes: "someone else's note" } : { ...job }))
      };
      view.rerender(<GanttPage {...pageProps} data={elsewhere} />);

      // the bar stays where the hand put it: clearing every override on any reload snapped it back
      await waitFor(() => expect(document.querySelector(".gantt-bar")!.getAttribute("title")).toBe(movedTo));
    } finally {
      restore();
      vi.mocked(rebookSchedule).mockReset();
      vi.mocked(updateJob).mockReset();
    }
  });

  it("lets go of the bar once the server's copy says the same thing", async () => {
    vi.mocked(updateJob).mockClear();
    vi.mocked(rebookSchedule).mockClear();
    vi.mocked(rebookSchedule).mockImplementation(() => new Promise(() => {}));
    vi.mocked(updateJob).mockImplementation(() => new Promise(() => {}));
    const restore = withADraggableChart();
    try {
      const view = render(<GanttPage {...pageProps} />);
      const bar = document.querySelector(".gantt-bar") as HTMLElement;
      const pointer = (type: string, clientX: number) =>
        Object.assign(new MouseEvent(type, { bubbles: true, clientX, clientY: 10, button: 0 }), { pointerId: 1 });
      const startedAt = bar.getAttribute("title");
      bar.dispatchEvent(pointer("pointerdown", 200));
      bar.dispatchEvent(pointer("pointermove", 560));
      bar.dispatchEvent(pointer("pointerup", 560));
      await waitFor(() => expect(document.querySelector(".gantt-bar")!.getAttribute("title")).not.toBe(startedAt));

      // what the drag asked the server for
      const asked = (vi
        .mocked(rebookSchedule)
        .mock.calls.at(-1)?.[0]
        .find((move) => move.op === "job") ?? vi.mocked(updateJob).mock.calls.at(-1)?.[1]) as { startDate: string; endDate: string };
      const movedId =
        (
          vi
            .mocked(rebookSchedule)
            .mock.calls.at(-1)?.[0]
            .find((move) => move.op === "job") as { id: string }
        )?.id ?? (vi.mocked(updateJob).mock.calls.at(-1)?.[0] as string);

      // the server now says the same thing, so the local copy has nothing left to hold
      const landed = {
        ...data,
        jobs: data.jobs.map((job) => (job.id === movedId ? { ...job, startDate: asked.startDate, endDate: asked.endDate } : { ...job }))
      };
      view.rerender(<GanttPage {...pageProps} data={landed} />);
      const settled = document.querySelector(".gantt-bar")!.getAttribute("title");

      // Proof it let go: somebody else moves the same job again. A bar still holding its own copy
      // would ignore that and stay where it was; this one follows the server.
      const movedAgain = {
        ...data,
        jobs: data.jobs.map((job) => (job.id === movedId ? { ...job, startDate: "2026-10-05", endDate: "2026-10-07" } : { ...job }))
      };
      view.rerender(<GanttPage {...pageProps} data={movedAgain} />);
      await waitFor(() => expect(document.querySelector(".gantt-bar")!.getAttribute("title")).not.toBe(settled));
    } finally {
      restore();
      vi.mocked(rebookSchedule).mockReset();
      vi.mocked(updateJob).mockReset();
    }
  });
});
