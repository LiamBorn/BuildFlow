/**
 * The Week board's pieces: a crew-day cell, the booking card it holds, the queue chip
 * that books a job by drag, and the "Add job" picker dialog.
 */
import type { CreateJobInput, Crew, Job, Project, ScheduleAssignment, Status } from "@buildflow/shared";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useModalDialog } from "../hooks";
import { GripVertical, Plus, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { statusTone } from "../scheduleUtils";
import { formatScheduleDate } from "../week";
import { ScheduleBadge, scheduleStatusFilterOptions } from "./shared";
import { liveChangeLabel, useLiveChange } from "../live";

export function ScheduleCell({
  holiday,
  off,
  crew,
  date,
  assignments,
  jobs,
  jobsById,
  focusedJobId,
  onOpenProject,
  onOpenJob,
  onOpenJobPicker,
  pendingId
}: {
  crew: Crew;
  date: string;
  assignments: ScheduleAssignment[];
  jobs: Job[];
  /** Jobs by id, built once by the page; without it the cell looks each booking's job up in `jobs`. */
  jobsById?: Map<string, Job>;
  focusedJobId: string | null;
  onOpenProject: (projectId: string) => void;
  /** When given, a card opens this instead of its project — the sub-pages' job drawer. */
  onOpenJob?: (job: Job, assignment: ScheduleAssignment) => void;
  onOpenJobPicker: (crewId: string, date: string) => void;
  /** The booking whose move is still being saved. */
  pendingId?: string | null;
  /** The holiday this day is, from Settings › Work calendar. */
  holiday?: string;
  /** A day the workspace does not work. */
  off?: boolean;
}) {
  const hasAssignments = assignments.length > 0;
  const { setNodeRef, isOver } = useDroppable({
    id: `${crew.id}-${date}`,
    data: { crewId: crew.id, date }
  });

  return (
    <div
      ref={setNodeRef}
      className={`schedule-cell${isOver ? " over" : ""}${hasAssignments ? " has-jobs" : " empty"}${holiday ? " is-holiday" : ""}${off ? " is-off" : ""}`}
      title={holiday}
      data-crew-id={crew.id}
      data-date={date}
    >
      {assignments.map((assignment) => {
        const job = jobsById ? jobsById.get(assignment.jobId) : jobs.find((item) => item.id === assignment.jobId);
        if (!job) return null;
        return (
          <ScheduleJobCard
            key={assignment.id}
            job={job}
            assignment={assignment}
            isFocused={focusedJobId === job.id}
            onOpenProject={onOpenProject}
            onOpenJob={onOpenJob}
            pending={pendingId === assignment.id}
          />
        );
      })}
      <button
        type="button"
        className={`schedule-add-job-button${hasAssignments ? " compact" : ""}`}
        data-tutorial-id="schedule-add-job-button"
        onClick={() => onOpenJobPicker(crew.id, date)}
        aria-label={`Add job to ${crew.name} on ${formatScheduleDate(date)}`}
      >
        <Plus size={17} />
        <span>Add job</span>
      </button>
    </div>
  );
}

export function ScheduleJobCard({
  job,
  assignment,
  isFocused,
  onOpenProject,
  onOpenJob,
  pending = false
}: {
  job: Job;
  assignment: ScheduleAssignment;
  isFocused: boolean;
  onOpenProject: (projectId: string) => void;
  onOpenJob?: (job: Job, assignment: ScheduleAssignment) => void;
  pending?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `assignment-${assignment.id}`,
    data: {
      assignmentId: assignment.id,
      jobId: job.id,
      crewId: assignment.crewId,
      date: assignment.date
    }
  });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform) };
  const live = useLiveChange(assignment.id, job.id);

  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`schedule-job ${statusTone(job.status)}${isDragging ? " dragging" : ""}${isFocused ? " focused" : ""}${pending ? " is-pending" : ""}${live ? " is-live" : ""}`}
      aria-busy={pending || undefined}
      style={style}
      data-assignment-id={assignment.id}
      data-job-id={job.id}
      // the name has to match the destination: this card opens the job drawer wherever one is
      // wired up, and only falls back to the project record when it is not
      aria-label={onOpenJob ? `Open ${job.name}` : `Open ${job.name} project`}
      onClick={() => (onOpenJob ? onOpenJob(job, assignment) : onOpenProject(job.projectId))}
      {...listeners}
      {...attributes}
    >
      {live && <span className="sched-live-by">{liveChangeLabel(live)}</span>}
      <strong>{job.name}</strong>
      <span>{job.phase}</span>
      <em>
        {job.startTime} - {job.endTime}
      </em>
      <footer>
        <span>
          <Users size={13} /> {job.requiredLabor}
        </span>
        <ScheduleBadge status={job.status} />
      </footer>
      {assignment.conflicts.length > 0 && <p>{assignment.conflicts.join(", ")}</p>}
    </button>
  );
}

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

  return (
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
                {["Normal", "Medium", "High"].map((option) => (
                  <option key={option} value={option}>
                    {option}
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
    </div>
  );
}

export function DraggableJob({
  job,
  isFocused = false,
  onOpenProject
}: {
  job: Job;
  isFocused?: boolean;
  /** Opens the job's project; without it the card is only there to be dragged. */
  onOpenProject?: (projectId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `drag-${job.id}`,
    data: { jobId: job.id }
  });
  const style = { transform: CSS.Translate.toString(transform) };
  const dateRange =
    job.startDate === job.endDate
      ? formatScheduleDate(job.startDate)
      : `${formatScheduleDate(job.startDate)} - ${formatScheduleDate(job.endDate)}`;

  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`unassigned-card ${statusTone(job.status)}${isDragging ? " dragging" : ""}${isFocused ? " focused" : ""}`}
      style={style}
      aria-label={onOpenProject ? `Open ${job.name} project` : `${job.name} — drag onto the board to book it`}
      onClick={() => onOpenProject?.(job.projectId)}
      {...listeners}
      {...attributes}
    >
      <GripVertical className="drag-grip" size={18} aria-hidden="true" />
      <span>
        <strong>{job.name}</strong>
        <em>{job.phase}</em>
        <b>{dateRange}</b>
      </span>
      <ScheduleBadge status={job.status} />
    </button>
  );
}
