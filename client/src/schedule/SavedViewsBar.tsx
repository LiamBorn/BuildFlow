/**
 * Saved views on the page: the person's pinned filter sets as chips under the
 * filter row (one click applies one; the current one is lit), a "Save view" that
 * names the filters on screen, and the Schedule flyout's list of the same views.
 */
import { useState, type FormEvent } from "react";
import { Pin, X } from "lucide-react";
import type { BootstrapPayload } from "@buildflow/shared";
import { CLEAR_SCHEDULE_FILTERS } from "./filters";
import type { ScheduleTarget } from "./links";
import { describeSavedView, hasFilters, openSavedView, sameFilters, useSavedViews, viewFilters, type SavedView } from "./savedViews";
import type { ScheduleContext, SchedulePage } from "./useScheduleContext";

export function SavedViewsBar({
  data,
  context,
  page,
  onChange,
  onOpenPage,
  reload
}: {
  data: BootstrapPayload;
  context: ScheduleContext;
  /** The page a view saved here opens on. */
  page: SchedulePage;
  onChange: (patch: Partial<ScheduleContext>) => void;
  onOpenPage?: (page: ScheduleTarget) => void;
  reload?: () => Promise<void>;
}) {
  const { views, save, remove } = useSavedViews(data, reload);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const current = viewFilters(context);
  const canSave = hasFilters(current);

  const apply = (view: SavedView) => {
    onChange({ ...CLEAR_SCHEDULE_FILTERS, ...view.filters });
    if (view.page !== page) onOpenPage?.(view.page);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    void save(name, page, context);
    setNaming(false);
    setName("");
  };

  return (
    <div className="sched-views-bar" aria-label="Saved views" data-tutorial-id="schedule-saved-views">
      <span className="sched-views-label">
        <Pin size={13} aria-hidden="true" /> Views
      </span>
      {views.length === 0 && !naming && <span className="sched-views-empty">Pin a filter set and your morning view is one click.</span>}
      {views.map((view) => (
        <span className={`sched-view-chip${sameFilters(view.filters, current) ? " is-active" : ""}`} key={view.id}>
          <button
            type="button"
            onClick={() => apply(view)}
            title={`${describeSavedView(view, data)} · opens ${view.page === "schedule" ? "Schedule" : view.page}`}
          >
            {view.name}
          </button>
          <button type="button" aria-label={`Remove saved view ${view.name}`} onClick={() => void remove(view.id)}>
            <X size={11} aria-hidden="true" />
          </button>
        </span>
      ))}
      {naming ? (
        <form className="sched-views-form" onSubmit={submit}>
          <input
            autoFocus
            aria-label="View name"
            placeholder="Name this view"
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" disabled={!name.trim()}>
            Save
          </button>
          <button type="button" onClick={() => setNaming(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="sched-views-add"
          disabled={!canSave}
          title={canSave ? "Save the filters on screen as a view" : "Set a filter first, then save it as a view"}
          onClick={() => setNaming(true)}
        >
          + Save view
        </button>
      )}
    </div>
  );
}

/** The Schedule flyout's saved views: each opens its page with its filters. */
export function SavedViewsFlyout({ data, onOpenPage }: { data: BootstrapPayload; onOpenPage: (page: SchedulePage) => void }) {
  const { views } = useSavedViews(data);
  if (views.length === 0) return null;
  return (
    <div className="hs-flyout-views">
      <div className="hs-flyout-head">Saved views</div>
      {views.map((view) => (
        <button
          type="button"
          key={view.id}
          className="hs-flyout-item hs-flyout-view"
          role="menuitem"
          onClick={() => openSavedView(data.activeUser.id, view, onOpenPage)}
        >
          <Pin size={14} aria-hidden="true" />
          <span className="hs-flyout-label">{view.name}</span>
          <em>{describeSavedView(view, data)}</em>
        </button>
      ))}
    </div>
  );
}
