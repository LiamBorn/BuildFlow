/**
 * The "Add job" picker dialog: creates a job and books it on a crew for a day in one go.
 * (The Week board's crew-day cell, its booking card and its queue chip lived here until
 * the board left the product on 2026-09-22 — docs/backlog.md.)
 */
import type { CreateJobInput, Crew, Job, Project, Status } from "@buildflow/shared";
import { useModalDialog } from "../hooks";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { FormEvent } from "react";
import { formatScheduleDate } from "../week";
import { scheduleStatusFilterOptions } from "./shared";
import { PRIORITIES, PRIORITY_LABEL } from "../statusPalette";

export function ScheduleJobPickerDialog({
  crew,
  crews,
  date,
  projects,
  busy,
  onClose,
  onCreateJob
}: {
  crew: Crew;
  crews: Crew[];
  date: string;
  projects: Project[];
  busy: boolean;
  onClose: () => void;
  onCreateJob: (input: CreateJobInput, crewId: string) => Promise<void>;
}) {
  const dateLabel = formatScheduleDate(date);
  const panel = useModalDialog<HTMLElement>(onClose);
  // The crew is fixed when this opens from a Week cell (that cell's row), but a
  // calendar-day add has no row — so the crew is chosen here, pre-set to the one
  // we opened with.
  const [selectedCrewId, setSelectedCrewId] = useState(crew.id);
  const selectedCrew = crews.find((item) => item.id === selectedCrewId) ?? crew;
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const selectedProject = projects.find((project) => project.id === projectId);
  const [jobName, setJobName] = useState("");
  const [phase, setPhase] = useState("");
  const [location, setLocation] = useState(selectedProject?.location ?? "");
  const [startDate, setStartDate] = useState(date);
  const [endDate, setEndDate] = useState(date);
  const [startTime, setStartTime] = useState("7:00 AM");
  const [endTime, setEndTime] = useState("3:00 PM");
  const [requiredLabor, setRequiredLabor] = useState(`${Math.max(1, Math.min(crew.size, 6))}`);
  const [requiredEquipment, setRequiredEquipment] = useState("General tools");
  const [materialsStatus, setMaterialsStatus] = useState<Job["materialsStatus"]>("Delivered");
  const [status, setStatus] = useState<Status>("Planned");
  const [priority, setPriority] = useState<Job["priority"]>("Normal");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setStartDate(date);
    setEndDate(date);
  }, [date]);

  useEffect(() => {
    if (selectedProject) setLocation(selectedProject.location);
  }, [selectedProject]);

  async function submitCustomJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const laborCount = Number(requiredLabor);
    if (!projectId) {
      setFormError("Choose a project before scheduling the job.");
      return;
    }
    if (!jobName.trim() || !phase.trim() || !location.trim() || !requiredEquipment.trim()) {
      setFormError("Add the job name, phase, location, and equipment.");
      return;
    }
    if (!Number.isInteger(laborCount) || laborCount <= 0) {
      setFormError("Labor must be a whole number above 0.");
      return;
    }
    await onCreateJob(
      {
        projectId,
        name: jobName,
        phase,
        location,
        startDate,
        endDate,
        startTime,
        endTime,
        requiredLabor: laborCount,
        requiredEquipment,
        materialsStatus,
        status,
        priority,
        notes
      },
      selectedCrewId
    );
  }

  /* A PORTAL TO THE BODY, for the same reason the project dialog is one. `.sched-rx` sets
     `isolation: isolate`, so this backdrop's z-index was scoped INSIDE the page's stacking
     context and the page itself sits at `z-index: auto` under the sticky top bar — measured
     2026-09-18, with the panel at z-index 45 against the bar's 40 and the bar's buttons still
     hit-testing above the panel's own header. A z-index cannot climb out of a trapped context;
     only leaving it can. The skin scopes this panel's rules from the body to match. */
  return createPortal(
    <div className="schedule-dialog-backdrop" role="presentation">
      <section
        className="schedule-dialog schedule-job-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Add job to schedule"
        data-tutorial-id="schedule-job-dialog"
        ref={panel}
      >
        <header>
          <div>
            <h2>Add job to schedule</h2>
            <p>
              {selectedCrew.name} · {dateLabel}
            </p>
          </div>
          <button type="button" className="icon-button" aria-label="Close Add job to schedule" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="schedule-job-picker-content">
          <form className="schedule-job-create-form" onSubmit={submitCustomJob}>
            <h3>Custom job</h3>
            <label className="form-field">
              <span>Job Name</span>
              <input value={jobName} onChange={(event) => setJobName(event.target.value)} placeholder="Job name" />
            </label>
            <label className="form-field">
              <span>Project</span>
              <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Crew</span>
              <select value={selectedCrewId} onChange={(event) => setSelectedCrewId(event.target.value)}>
                {crews.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Phase</span>
              <input value={phase} onChange={(event) => setPhase(event.target.value)} placeholder="Phase or scope" />
            </label>
            <label className="form-field">
              <span>Location</span>
              <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" />
            </label>
            <div className="form-grid-two">
              <label className="form-field">
                <span>Start Date</span>
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label className="form-field">
                <span>End Date</span>
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </label>
            </div>
            <div className="form-grid-two">
              <label className="form-field">
                <span>Start Time</span>
                <input value={startTime} onChange={(event) => setStartTime(event.target.value)} placeholder="7:00 AM" />
              </label>
              <label className="form-field">
                <span>End Time</span>
                <input value={endTime} onChange={(event) => setEndTime(event.target.value)} placeholder="3:00 PM" />
              </label>
            </div>
            <div className="form-grid-two">
              <label className="form-field">
                <span>Labor</span>
                <input type="number" min="1" value={requiredLabor} onChange={(event) => setRequiredLabor(event.target.value)} />
              </label>
              <label className="form-field">
                <span>Equipment</span>
                <input value={requiredEquipment} onChange={(event) => setRequiredEquipment(event.target.value)} />
              </label>
            </div>
            <div className="form-grid-two">
              <label className="form-field">
                <span>Materials</span>
                <select value={materialsStatus} onChange={(event) => setMaterialsStatus(event.target.value as Job["materialsStatus"])}>
                  {["Delivered", "Ordered", "Missing", "Waiting on Delivery"].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value as Status)}>
                  {scheduleStatusFilterOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="form-field">
              <span>Priority</span>
              <select value={priority} onChange={(event) => setPriority(event.target.value as Job["priority"])}>
                {PRIORITIES.map((option) => (
                  <option key={option} value={option}>
                    {PRIORITY_LABEL[option]}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Notes</span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Notes" />
            </label>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <div className="schedule-job-create-actions">
              <button type="button" className="outline-button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="primary-button" data-tutorial-id="schedule-job-submit" disabled={busy}>
                {busy ? "Scheduling..." : "Create & Schedule Job"}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>,
    document.body
  );
}
