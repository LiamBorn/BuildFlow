/**
 * The filter row every Schedule page shares: project, crew type, crew and
 * region as selects, the status set behind a "Statuses" button, and a chip for
 * each active filter that clears it. It reads and writes the shared schedule
 * context, so a filter set on one page is the same filter on the next.
 */
import { useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { ScheduleBadge, ScheduleSelect } from "./parts/shared";
import { CLEAR_SCHEDULE_FILTERS, resolveScheduleFilters, scheduleFilterChips, scheduleRegions, type ScheduleFilterData } from "./filters";
import { SCHEDULE_STATUSES, type ScheduleContext } from "./useScheduleContext";

const ALL_PROJECTS = "All projects";
const ALL_CREW_TYPES = "All Crew Types";
const ALL_CREWS = "All crews";
const ALL_REGIONS = "All regions";

export function ScheduleFilters({
  data,
  context,
  onChange,
  statuses = true,
  note
}: {
  data: ScheduleFilterData;
  context: ScheduleContext;
  onChange: (patch: Partial<ScheduleContext>) => void;
  /** False on the Kanban, which is the status view and keeps every status. */
  statuses?: boolean;
  /** A line under the filters, for a page that applies them differently. */
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  const filters = resolveScheduleFilters(context, data);
  // a filter the workspace cannot apply (a project or region that is gone, a status set that keeps everything) is dropped, so the link stays honest
  useEffect(() => {
    const stale: Partial<ScheduleContext> = {};
    if (context.projectId && !filters.projectId) stale.projectId = null;
    if (context.crewType && !filters.crewType) stale.crewType = null;
    if (context.crewId && !filters.crewId) stale.crewId = null;
    if (context.region && !filters.region) stale.region = null;
    if (context.statuses && !filters.statuses) stale.statuses = null;
    if (Object.keys(stale).length > 0) onChange(stale);
  }, [context, filters.projectId, filters.crewType, filters.crewId, filters.region, filters.statuses, onChange]);
  const projects = [...data.projects].sort((a, b) => a.name.localeCompare(b.name));
  const crewTypes = [...new Set(data.crews.map((crew) => crew.specialty))].sort();
  const crews = data.crews
    .filter((crew) => !filters.crewType || crew.specialty === filters.crewType)
    .sort((a, b) => a.name.localeCompare(b.name));
  const regions = scheduleRegions(data.jobs);
  const chips = scheduleFilterChips(context, data, { statuses });
  const kept = filters.statuses ?? new Set(SCHEDULE_STATUSES);

  const toggleStatus = (status: (typeof SCHEDULE_STATUSES)[number]) => {
    const next = new Set(kept);
    if (next.has(status)) {
      if (next.size === 1) return; // something has to stay visible
      next.delete(status);
    } else next.add(status);
    onChange({ statuses: next.size === SCHEDULE_STATUSES.length ? null : SCHEDULE_STATUSES.filter((item) => next.has(item)) });
  };

  return (
    <div className="sched-filters" data-tutorial-id="schedule-filters">
      <div className="filter-strip">
        <ScheduleSelect
          label="Project"
          value={projects.find((project) => project.id === filters.projectId)?.name ?? ALL_PROJECTS}
          options={[ALL_PROJECTS, ...projects.map((project) => project.name)]}
          onChange={(value) => onChange({ projectId: projects.find((project) => project.name === value)?.id ?? null })}
        />
        <ScheduleSelect
          label="Crew Type"
          value={filters.crewType ?? ALL_CREW_TYPES}
          options={[ALL_CREW_TYPES, ...crewTypes]}
          onChange={(value) => onChange({ crewType: value === ALL_CREW_TYPES ? null : value, crewId: null })}
        />
        <ScheduleSelect
          label="Crew"
          value={crews.find((crew) => crew.id === filters.crewId)?.name ?? ALL_CREWS}
          options={[ALL_CREWS, ...crews.map((crew) => crew.name)]}
          onChange={(value) => onChange({ crewId: crews.find((crew) => crew.name === value)?.id ?? null })}
        />
        <ScheduleSelect
          label="Region"
          value={filters.region ?? ALL_REGIONS}
          options={[ALL_REGIONS, ...regions]}
          onChange={(value) => onChange({ region: value === ALL_REGIONS ? null : value })}
        />
        {statuses && (
          <button
            type="button"
            className={`outline-button${open || filters.statuses ? " active" : ""}`}
            data-tutorial-id="schedule-filters-button"
            aria-expanded={open}
            aria-controls="schedule-status-filters"
            onClick={() => setOpen((current) => !current)}
          >
            <SlidersHorizontal size={16} /> Statuses
            <em>
              {kept.size}/{SCHEDULE_STATUSES.length}
            </em>
          </button>
        )}
        {chips.length > 0 && (
          <button type="button" className="sched-filters-clear" onClick={() => onChange(CLEAR_SCHEDULE_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>
      {statuses && open && (
        <section className="schedule-filter-panel" id="schedule-status-filters" aria-label="Job statuses">
          <header>
            <div>
              <h2>Statuses</h2>
              <p>Choose which job and booking statuses stay visible — on every schedule page.</p>
            </div>
            <button type="button" onClick={() => onChange({ statuses: null })} disabled={!filters.statuses}>
              All statuses
            </button>
          </header>
          <div className="schedule-filter-chips" role="group" aria-label="Visible statuses">
            {SCHEDULE_STATUSES.map((status) => (
              <button
                type="button"
                key={status}
                className={kept.has(status) ? "active" : ""}
                aria-pressed={kept.has(status)}
                onClick={() => toggleStatus(status)}
              >
                <ScheduleBadge status={status} />
              </button>
            ))}
          </div>
        </section>
      )}
      {chips.length > 0 && (
        <div className="sched-chips" aria-label="Active filters">
          {chips.map((chip) => (
            <button type="button" className="sched-chip" key={chip.key} onClick={() => onChange(chip.clear)} title={`Clear ${chip.label}`}>
              {chip.label}
              <X size={12} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      {note && <p className="sched-filters-note">{note}</p>}
    </div>
  );
}
