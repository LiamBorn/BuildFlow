/**
 * The job drawer every schedule view opens: status, priority, dates and notes for
 * one job, saved through the page's own PATCH, and the job's links — with the way
 * to draw or remove one — so a dependency needs no mouse. One implementation shared by the
 * Week, List, Kanban, Month, Matrix and Gantt pages; styled by hs-gantt.css.
 */
import { useEffect, useState, type FormEvent } from "react";
import { ExternalLink, Link2, Unlink, X } from "lucide-react";
import type { Job, JobDependency, Status } from "@buildflow/shared";
import { parseIsoDate } from "../../components/ui/gantt";
import { useModalDialog, type JobSaveResult } from "../hooks";
import { PRIORITIES, STATUSES } from "../statusPalette";

export function JobDrawer({
  job,
  projectName,
  crews,
  onClose,
  onOpenSchedule,
  onSave,
  links,
  jobsById,
  onLink,
  onUnlink
}: {
  job: Job;
  projectName: string;
  crews: string;
  onClose: () => void;
  onOpenSchedule: () => void;
  /** Saves the change; what comes back says whether it saved and, when it did not, why. */
  onSave: (patch: Partial<Job>) => Promise<JobSaveResult | void>;
  /** The job's dependencies, either way round. */
  links?: JobDependency[];
  jobsById?: Map<string, Job>;
  /** "Link to another job…": opens the link dialog for this job. */
  onLink?: () => void;
  onUnlink?: (link: JobDependency) => void;
}) {
  const [status, setStatus] = useState<Status>(job.status);
  const [priority, setPriority] = useState<Job["priority"]>(job.priority);
  const [startDate, setStartDate] = useState(job.startDate);
  const [endDate, setEndDate] = useState(job.endDate);
  const [notes, setNotes] = useState(job.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const panel = useModalDialog<HTMLElement>(onClose);

  useEffect(() => {
    setStatus(job.status);
    setPriority(job.priority);
    setStartDate(job.startDate);
    setEndDate(job.endDate);
    setNotes(job.notes ?? "");
    setError(null);
  }, [job]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!startDate || !endDate) {
      setError("Both dates are required.");
      return;
    }
    if (endDate < startDate) {
      setError("The finish cannot be before the start.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // a save that could not happen is reported here, where the eye already is — the board's notice is behind this panel
      const result = await onSave({ status, priority, startDate, endDate, notes });
      if (result && !result.saved && result.problem) setError(result.problem);
    } finally {
      setBusy(false);
    }
  };

  const days = Math.max(
    1,
    Math.round((parseIsoDate(endDate || startDate).getTime() - parseIsoDate(startDate || endDate).getTime()) / 86_400_000) + 1
  );

  return (
    <div className="gantt-drawer-layer" role="presentation">
      <div className="gantt-drawer-backdrop" onClick={onClose} />
      <aside className="gantt-drawer" role="dialog" aria-modal="true" aria-labelledby="gantt-drawer-title" ref={panel}>
        <div className="gantt-drawer-top">
          <div>
            <h2 id="gantt-drawer-title">{job.name}</h2>
            <p className="gantt-drawer-sub">
              {projectName}
              {job.phase ? ` · ${job.phase}` : ""}
              {job.location ? ` · ${job.location}` : ""}
            </p>
          </div>
          <button type="button" className="gantt-drawer-close" aria-label="Close job details" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <dl className="gantt-drawer-facts">
          <div>
            <dt>Crews</dt>
            <dd title={crews || undefined}>{crews || "Unassigned"}</dd>
          </div>
          <div>
            <dt>Progress</dt>
            <dd>{job.percentComplete ?? 0}% complete</dd>
          </div>
          <div>
            <dt>Materials</dt>
            <dd>{job.materialsStatus}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>
              {days} day{days === 1 ? "" : "s"}
            </dd>
          </div>
        </dl>
        {(links || onLink) && (
          <section className="gantt-drawer-links" aria-label="Dependencies">
            <div className="gantt-drawer-links-head">
              <h3>Links</h3>
              {onLink && (
                <button className="hs-btn" type="button" onClick={onLink}>
                  <Link2 size={14} /> Link to another job…
                </button>
              )}
            </div>
            {links && links.length > 0 ? (
              <ul>
                {links.map((link) => {
                  // this job follows the other, or leads to it
                  const follows = link.successorId === job.id;
                  const otherId = follows ? link.predecessorId : link.successorId;
                  const other = jobsById?.get(otherId)?.name ?? otherId;
                  return (
                    <li key={link.id}>
                      <span>
                        {follows ? "Follows" : "Leads to"} <b>{other}</b>{" "}
                        <em>
                          ({link.type}
                          {link.lagDays ? `, ${link.lagDays}d lag` : ""})
                        </em>
                      </span>
                      {onUnlink && (
                        <button className="hs-btn" type="button" aria-label={`Unlink ${other}`} onClick={() => onUnlink(link)}>
                          <Unlink size={14} /> Unlink
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="gantt-drawer-links-empty">No links yet. A link makes the other job wait for this one.</p>
            )}
          </section>
        )}
        <form className="gantt-drawer-form" onSubmit={submit}>
          <div className="gantt-drawer-row">
            <label>
              <span>Status</span>
              <select autoFocus value={status} onChange={(event) => setStatus(event.target.value as Status)}>
                {STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Priority</span>
              <select value={priority} onChange={(event) => setPriority(event.target.value as Job["priority"])}>
                {PRIORITIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="gantt-drawer-row">
            <label>
              <span>Start</span>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
            </label>
            <label>
              <span>Finish</span>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => setEndDate(event.target.value)}
                required
              />
            </label>
          </div>
          <label>
            <span>Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Anything the crew should know" />
          </label>
          {error && (
            <p className="gantt-drawer-error" role="alert">
              {error}
            </p>
          )}
          <div className="gantt-drawer-actions">
            <button className="hs-btn hs-btn-primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button className="hs-btn" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="hs-btn hs-btn-link" type="button" onClick={onOpenSchedule}>
              <ExternalLink size={15} /> Open in Schedule
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
