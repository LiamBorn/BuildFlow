/**
 * Saved views: a named, pinned filter set per person ("Concrete crews, Pinecrest")
 * that opens a schedule view with those filters in one click — from the filter row
 * of any schedule page, and from the Schedule flyout. Stored as the person's
 * `schedule:views` setting (server-side, so it follows them across devices) and
 * mirrored in one module store so every mounted piece of UI shows the same list.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { BootstrapPayload } from "@buildflow/shared";
import { setUserSetting } from "../api";
import { CLEAR_SCHEDULE_FILTERS } from "./filters";
import { SCHEDULE_PAGES, writeScheduleContext, type ScheduleContext, type SchedulePage } from "./useScheduleContext";

export const SAVED_VIEWS_KEY = "schedule:views";
/** The setting holds at most 2,000 characters; a dozen views fit comfortably. */
export const MAX_SAVED_VIEWS = 12;
export const MAX_VIEW_NAME = 40;

export type SavedViewFilters = Pick<ScheduleContext, "projectId" | "crewType" | "crewId" | "region" | "statuses">;
export type SavedView = { id: string; name: string; page: SchedulePage; filters: SavedViewFilters };

const FILTER_KEYS: Array<keyof SavedViewFilters> = ["projectId", "crewType", "crewId", "region", "statuses"];

/** The filters of a context (the week and month stay out: a morning view is "this week"). */
export function viewFilters(context: Partial<ScheduleContext>): SavedViewFilters {
  return {
    projectId: context.projectId ?? null,
    crewType: context.crewType ?? null,
    crewId: context.crewId ?? null,
    region: context.region ?? null,
    statuses: context.statuses ?? null
  };
}

export const hasFilters = (filters: SavedViewFilters) => FILTER_KEYS.some((key) => filters[key] !== null);

export function sameFilters(a: SavedViewFilters, b: SavedViewFilters) {
  return FILTER_KEYS.every((key) => {
    const left = a[key];
    const right = b[key];
    if (Array.isArray(left) || Array.isArray(right))
      return JSON.stringify([...(left ?? [])].sort()) === JSON.stringify([...(right ?? [])].sort());
    return (left ?? null) === (right ?? null);
  });
}

const isPage = (value: unknown): value is SchedulePage =>
  typeof value === "string" && (SCHEDULE_PAGES as readonly string[]).includes(value);

/** The stored JSON, read leniently: a broken entry is dropped, never the whole list. */
export function parseSavedViews(raw: string | null | undefined): SavedView[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const view = entry as Record<string, unknown>;
      if (typeof view.id !== "string" || typeof view.name !== "string" || !isPage(view.page)) return [];
      const filters = (view.filters && typeof view.filters === "object" ? view.filters : {}) as Partial<ScheduleContext>;
      return [{ id: view.id, name: view.name.slice(0, MAX_VIEW_NAME), page: view.page, filters: viewFilters(filters) }];
    });
  } catch {
    return [];
  }
}

/** The JSON the setting stores: nulls dropped, the list capped. */
export function serializeSavedViews(views: SavedView[]) {
  return JSON.stringify(
    views.slice(0, MAX_SAVED_VIEWS).map((view) => ({
      id: view.id,
      name: view.name,
      page: view.page,
      filters: Object.fromEntries(FILTER_KEYS.filter((key) => view.filters[key] !== null).map((key) => [key, view.filters[key]]))
    }))
  );
}

/** "Pinecrest Medical · Concrete · Concrete Crew 1 · 3 statuses", or "All work". */
export function describeSavedView(view: SavedView, data: Pick<BootstrapPayload, "projects" | "crews">) {
  const parts: string[] = [];
  const { filters } = view;
  if (filters.projectId) parts.push(data.projects.find((project) => project.id === filters.projectId)?.name ?? "a project");
  if (filters.crewType) parts.push(filters.crewType);
  if (filters.crewId) parts.push(data.crews.find((crew) => crew.id === filters.crewId)?.name ?? "a crew");
  if (filters.region) parts.push(filters.region);
  if (filters.statuses) parts.push(`${filters.statuses.length} ${filters.statuses.length === 1 ? "status" : "statuses"}`);
  return parts.length > 0 ? parts.join(" · ") : "All work";
}

/* ── the module store: one list for every filter row and the flyout ── */
let views: SavedView[] = [];
let lastRawFromData: string | null | undefined;
let localRaw: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => views;

/** Adopts the setting as the bootstrap carries it — unless it is the value this tab just wrote, or the one it already read. */
export function syncSavedViews(raw: string | null | undefined) {
  if (raw === lastRawFromData) return;
  lastRawFromData = raw;
  if (raw === localRaw) return;
  views = parseSavedViews(raw);
  emit();
}

/** Forgets everything (tests). */
export function resetSavedViews() {
  views = [];
  lastRawFromData = undefined;
  localRaw = null;
  emit();
}

export function useSavedViews(data: Pick<BootstrapPayload, "userSettings">, reload?: () => Promise<void>) {
  const raw = data.userSettings?.[SAVED_VIEWS_KEY] ?? null;
  useEffect(() => {
    syncSavedViews(raw);
  }, [raw]);
  const list = useSyncExternalStore(subscribe, snapshot, snapshot);
  const persist = useCallback(
    async (next: SavedView[]) => {
      views = next.slice(-MAX_SAVED_VIEWS);
      localRaw = serializeSavedViews(views);
      emit();
      try {
        await setUserSetting(SAVED_VIEWS_KEY, localRaw);
      } catch {
        // the pins stay for this session; the next save tries again
      }
      if (reload) await reload().catch(() => undefined);
    },
    [reload]
  );
  const save = useCallback(
    async (name: string, page: SchedulePage, context: Partial<ScheduleContext>) => {
      const view: SavedView = {
        id: `view-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: name.trim().slice(0, MAX_VIEW_NAME),
        page,
        filters: viewFilters(context)
      };
      await persist([...views.filter((candidate) => candidate.name !== view.name), view]);
      return view;
    },
    [persist]
  );
  const remove = useCallback((id: string) => persist(views.filter((view) => view.id !== id)), [persist]);
  return { views: list, save, remove };
}

/** Opens a view from outside a schedule page: its filters into the shared context (the week stays), then its page. */
export function openSavedView(userId: string, view: SavedView, onOpenPage: (page: SchedulePage) => void) {
  writeScheduleContext(userId, { ...CLEAR_SCHEDULE_FILTERS, ...view.filters });
  onOpenPage(view.page);
}
