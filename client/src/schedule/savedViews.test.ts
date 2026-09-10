import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_SCHEDULE_CONTEXT, readScheduleContext } from "./useScheduleContext";
import {
  MAX_SAVED_VIEWS,
  describeSavedView,
  hasFilters,
  openSavedView,
  parseSavedViews,
  sameFilters,
  serializeSavedViews,
  viewFilters,
  type SavedView
} from "./savedViews";

const view = (extra: Partial<SavedView> = {}): SavedView => ({
  id: "view-1",
  name: "Concrete crews, Pinecrest",
  page: "week",
  filters: { projectId: "p-1", crewType: "Concrete", crewId: null, region: null, statuses: null },
  ...extra
});
const data = { projects: [{ id: "p-1", name: "Pinecrest Medical" }], crews: [{ id: "c-1", name: "Concrete Crew 1" }] } as never;

beforeEach(() => {
  window.localStorage.clear();
});

describe("saved views", () => {
  it("keeps only the filters of a context — the week and month stay live", () => {
    const filters = viewFilters({ ...EMPTY_SCHEDULE_CONTEXT, weekStart: "2026-09-07", projectId: "p-1", statuses: ["Planned", "Ready"] });
    expect(filters).toEqual({ projectId: "p-1", crewType: null, crewId: null, region: null, statuses: ["Planned", "Ready"] });
    expect(hasFilters(filters)).toBe(true);
    expect(hasFilters(viewFilters(EMPTY_SCHEDULE_CONTEXT))).toBe(false);
    expect(sameFilters(filters, { ...filters, statuses: ["Ready", "Planned"] })).toBe(true);
    expect(sameFilters(filters, { ...filters, crewId: "c-1" })).toBe(false);
  });

  it("round-trips through the setting, dropping what it cannot read", () => {
    const raw = serializeSavedViews([view(), view({ id: "view-2", name: "Everything", page: "kanban", filters: viewFilters({}) })]);
    expect(JSON.parse(raw)[0].filters).toEqual({ projectId: "p-1", crewType: "Concrete" }); // nulls are not stored
    expect(parseSavedViews(raw)).toEqual([view(), view({ id: "view-2", name: "Everything", page: "kanban", filters: viewFilters({}) })]);
    expect(parseSavedViews("not json")).toEqual([]);
    expect(parseSavedViews(JSON.stringify([{ id: "x", name: "No page" }, { id: "y", name: "Bad page", page: "mars" }, view()]))).toEqual([
      view()
    ]);
    expect(parseSavedViews(null)).toEqual([]);
    const many = Array.from({ length: MAX_SAVED_VIEWS + 5 }, (_, index) => view({ id: `view-${index}`, name: `View ${index}` }));
    expect(parseSavedViews(serializeSavedViews(many))).toHaveLength(MAX_SAVED_VIEWS);
  });

  it("describes a view by what it filters", () => {
    expect(describeSavedView(view(), data)).toBe("Pinecrest Medical · Concrete");
    expect(
      describeSavedView(
        view({ filters: { projectId: null, crewType: null, crewId: "c-1", region: "East Austin", statuses: ["Planned"] } }),
        data
      )
    ).toBe("Concrete Crew 1 · East Austin · 1 status");
    expect(describeSavedView(view({ filters: viewFilters({}) }), data)).toBe("All work");
  });

  it("opens a view through the shared context, clearing the filters it does not set", () => {
    const open = vi.fn();
    window.localStorage.setItem(
      "bf:schedule:context:u-1",
      JSON.stringify({ ...EMPTY_SCHEDULE_CONTEXT, weekStart: "2026-09-07", region: "Downtown" })
    );
    openSavedView("u-1", view(), open);
    expect(open).toHaveBeenCalledWith("week");
    expect(readScheduleContext("u-1")).toMatchObject({ weekStart: "2026-09-07", projectId: "p-1", crewType: "Concrete", region: null });
  });
});
