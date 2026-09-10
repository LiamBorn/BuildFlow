/**
 * "Link to another job…" from a Gantt bar's menu: the job that follows, the link type
 * and the lag. The server keeps the network a loop-free graph and says why it refuses.
 */
import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { DependencyType, Job, JobDependency } from "@buildflow/shared";

const TYPES: Array<{ id: DependencyType; label: string }> = [
  { id: "FS", label: "Finish → start (the usual)" },
  { id: "SS", label: "Start → start" },
  { id: "FF", label: "Finish → finish" },
  { id: "SF", label: "Start → finish" }
];

export function GanttLinkDialog({
  from,
  jobs,
  existing,
  onClose,
  onLink
}: {
  /** The job the link starts from. */
  from: Job;
  /** The jobs on the chart it could lead to. */
  jobs: Job[];
  existing: JobDependency[];
  onClose: () => void;
  onLink: (successor: Job, type: DependencyType, lagDays: number) => void | Promise<void>;
}) {
  const linked = new Set(existing.filter((link) => link.predecessorId === from.id).map((link) => link.successorId));
  const candidates = jobs.filter((job) => job.id !== from.id && !linked.has(job.id));
  const [successorId, setSuccessorId] = useState(candidates[0]?.id ?? "");
  const [type, setType] = useState<DependencyType>("FS");
  const [lag, setLag] = useState("0");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const successor = candidates.find((job) => job.id === successorId);
    if (!successor) return;
    void onLink(successor, type, Number(lag) || 0);
  };

  return (
    <div className="schedule-dialog-backdrop" role="presentation" onClick={onClose}>
      <form
        className="schedule-dialog sched-link"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sched-link-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <header>
          <div>
            <h2 id="sched-link-title">Link {from.name} to another job</h2>
            <p>The other job waits for this one. The arrow shows on the chart, and the critical path follows it.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <label className="form-field">
          <span>Job that follows</span>
          <select value={successorId} onChange={(event) => setSuccessorId(event.target.value)} autoFocus disabled={candidates.length === 0}>
            {candidates.map((job) => (
              <option key={job.id} value={job.id}>
                {job.name} · {job.startDate}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid-two">
          <label className="form-field">
            <span>Link type</span>
            <select value={type} onChange={(event) => setType(event.target.value as DependencyType)}>
              {TYPES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Lag (working days)</span>
            <input type="number" value={lag} min={-365} max={365} onChange={(event) => setLag(event.target.value)} />
          </label>
        </div>
        {candidates.length === 0 && <p className="form-error">Every job on the chart already follows this one.</p>}
        <div className="sched-ask-actions">
          <button type="button" className="outline-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={!successorId}>
            Link jobs
          </button>
        </div>
      </form>
    </div>
  );
}
