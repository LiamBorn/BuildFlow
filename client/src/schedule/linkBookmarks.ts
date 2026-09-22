/**
 * Bookmarked views: a schedule page as it is — the week or month it shows and
 * its filters — kept as its link, so the star menu and the Bookmarks page open
 * exactly that view. Per person on this device, like the page bookmarks.
 */
import { useCallback, useEffect, useState } from "react";
import type { BootstrapPayload } from "@buildflow/shared";
import { formatScheduleMonth } from "./month";
import { describeSavedView, viewFilters } from "./savedViews";
import { SCHEDULE_PAGES, scheduleHash, type ScheduleContext, type SchedulePage } from "./useScheduleContext";
import { SCHEDULE_VIEW_KEYS } from "./viewKeys";
import { formatScheduleDate } from "./week";

export type ScheduleLink = { page: SchedulePage; hash: string; label: string; detail: string };

export const LINK_BOOKMARKS_EVENT = "bf:nav:links";
const storageKey = (userId: string) => `bf:nav:links:${userId}`;
const PAGE_LABELS: Record<SchedulePage, string> = {
  ...(Object.fromEntries(SCHEDULE_VIEW_KEYS.map((view) => [view.page, view.label])) as Record<SchedulePage, string>),
  schedule: "Schedule"
};
/** The pages whose link carries the week (the Month carries its month; Kanban and Gantt carry filters only). */
const WEEK_PAGES = new Set<SchedulePage>(["schedule"]);

/** The view on screen as a link: the page, the week or month it shows, and its filters. */
export function scheduleLinkFor(
  page: SchedulePage,
  context: ScheduleContext,
  data: Pick<BootstrapPayload, "projects" | "crews">
): ScheduleLink {
  const hash = scheduleHash(page, context);
  const when = WEEK_PAGES.has(page)
    ? `week of ${context.weekStart ? formatScheduleDate(context.weekStart) : "today"}`
    : page === "month"
      ? context.monthAnchor
        ? formatScheduleMonth(context.monthAnchor)
        : "this month"
      : "";
  const label = when ? `${PAGE_LABELS[page]} · ${when}` : PAGE_LABELS[page];
  return { page, hash, label, detail: describeSavedView({ id: hash, name: label, page, filters: viewFilters(context) }, data) };
}

const isPage = (value: unknown): value is SchedulePage =>
  typeof value === "string" && (SCHEDULE_PAGES as readonly string[]).includes(value);

export function readLinkBookmarks(userId: string): ScheduleLink[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      const link = entry as Partial<ScheduleLink> | null;
      if (
        !link ||
        !isPage(link.page) ||
        typeof link.hash !== "string" ||
        !link.hash.startsWith("#schedule") ||
        typeof link.label !== "string"
      )
        return [];
      return [{ page: link.page, hash: link.hash, label: link.label, detail: typeof link.detail === "string" ? link.detail : "" }];
    });
  } catch {
    return [];
  }
}

export function writeLinkBookmarks(userId: string, links: ScheduleLink[]) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(links));
  } catch {
    /* private mode: the pins just do not persist */
  }
  window.dispatchEvent(new CustomEvent(LINK_BOOKMARKS_EVENT, { detail: { userId } }));
}

export const hasLinkBookmark = (links: ScheduleLink[], hash: string) => links.some((link) => link.hash === hash);

/** Pins the link, or unpins it when it is already there (the link is the identity). */
export function toggleLinkBookmark(userId: string, link: ScheduleLink): ScheduleLink[] {
  const current = readLinkBookmarks(userId);
  const next = hasLinkBookmark(current, link.hash) ? current.filter((entry) => entry.hash !== link.hash) : [...current, link];
  writeLinkBookmarks(userId, next);
  return next;
}

/** Opens the view the link names: the app routes on the hash and applies the week and filters it carries. */
export function openScheduleLink(link: Pick<ScheduleLink, "hash">) {
  if (typeof window === "undefined") return;
  window.location.hash = link.hash;
}

export function useLinkBookmarks(userId: string) {
  const [links, setLinks] = useState<ScheduleLink[]>(() => readLinkBookmarks(userId));
  useEffect(() => {
    setLinks(readLinkBookmarks(userId));
    const follow = () => setLinks(readLinkBookmarks(userId));
    window.addEventListener(LINK_BOOKMARKS_EVENT, follow);
    return () => window.removeEventListener(LINK_BOOKMARKS_EVENT, follow);
  }, [userId]);
  const toggle = useCallback(
    (link: ScheduleLink) => {
      setLinks(toggleLinkBookmark(userId, link));
    },
    [userId]
  );
  return { links, toggle };
}
