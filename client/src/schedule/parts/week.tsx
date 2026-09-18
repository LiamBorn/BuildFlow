/**
 * The Week board's pieces: a crew-day cell, the booking card it holds, the queue chip
 * that books a job by drag, and the "Add job" picker dialog.
 */
import type { CreateJobInput, Crew, Job, Project, ScheduleAssignment, Status } from "@buildflow/shared";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useModalDialog } from "../hooks";
import { GripVertical, Plus, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { FormEvent } from "react";
import { cellKey, statusTone } from "../scheduleUtils";
import { orderGroupItems, placeInGroup } from "../boardOrder";
import { useHoverFor, type HoverStore } from "../useBoardOrder";
import type { CSSProperties } from "react";
import { formatScheduleDate } from "../week";
import { ScheduleBadge, scheduleStatusFilterOptions } from "./shared";
import { liveChangeLabel, useLiveChange } from "../live";

const bookingId = (one: ScheduleAssignment) => one.id;

export function ScheduleCell({
  holiday,
  off,
  crew,
  date,
  assignments,
  allAssignments,
  order,
  hoverStore,
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
  /** The bookings whose own cell this is. What it SHOWS may differ while a card is carried over it. */
  assignments: ScheduleAssignment[];
  /** Every booking in the week, so the one being carried in can be drawn whole. */
  allAssignments?: ScheduleAssignment[];
  order?: Record<string, string[]>;
  hoverStore?: HoverStore;
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
  const { setNodeRef, isOver } = useDroppable({
    id: `${crew.id}-${date}`,
    data: { crewId: crew.id, date }
  });
  /* The cell arranges ITSELF: the planner's order, plus the card being carried over it, drawn
     where it would land. Subscribed here rather than read on the page, so a card crossing cells
     re-renders the cells and not the page above them — the page's own re-render is what made a
     crossing lag (../useBoardOrder). */
  const key = cellKey(crew.id, date);
  const hover = useHoverFor(hoverStore, key);
  const carried = hover ? allAssignments?.find((one) => one.id === hover.itemId) : undefined;
  const mine = assignments.filter((one) => !carried || one.id !== carried.id);
  const ordered = orderGroupItems(mine, order?.[key], bookingId);
  const shown = carried && hover?.section === key ? placeInGroup(ordered, carried, hover.overId, bookingId) : ordered;
  const hasAssignments = shown.length > 0;

  return (
    <div
      ref={setNodeRef}
      className={`schedule-cell${isOver ? " over" : ""}${hasAssignments ? " has-jobs" : " empty"}${holiday ? " is-holiday" : ""}${off ? " is-off" : ""}`}
      title={holiday}
      data-crew-id={crew.id}
      data-date={date}
    >
      {/* the gap that opens while a card is carried over these is dnd-kit's own sortable preview,
          and the drop keeps what it showed (../boardOrder) */}
      <SortableContext items={shown.map((assignment) => assignment.id)} strategy={verticalListSortingStrategy}>
        {shown.map((assignment) => {
          const job = jobsById ? jobsById.get(assignment.jobId) : jobs.find((item) => item.id === assignment.jobId);
          if (!job) return null;
          return (
            <ScheduleJobCard
              key={assignment.id}
              job={job}
              assignment={assignment}
              cell={key}
              isFocused={focusedJobId === job.id}
              onOpenProject={onOpenProject}
              onOpenJob={onOpenJob}
              pending={pendingId === assignment.id}
            />
          );
        })}
      </SortableContext>
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
  cell,
  isFocused,
  onOpenProject,
  onOpenJob,
  pending = false
}: {
  job: Job;
  assignment: ScheduleAssignment;
  /** The crew-day cell this card is drawn in — its own, or the one it is being carried over. */
  cell?: string;
  isFocused: boolean;
  onOpenProject: (projectId: string) => void;
  onOpenJob?: (job: Job, assignment: ScheduleAssignment) => void;
  pending?: boolean;
}) {
  /* A sortable item, keyed on the BOOKING's id: that is what a cell's order is written in and what
     a drop reads off `over`. `cell` names the section it is drawn in, so a drop on a CARD resolves
     to that card's cell the way a drop on the cell itself does. */
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: assignment.id,
    data: {
      assignmentId: assignment.id,
      jobId: job.id,
      crewId: assignment.crewId,
      date: assignment.date,
      cell: cell ?? cellKey(assignment.crewId, assignment.date)
    }
  });
  const live = useLiveChange(assignment.id, job.id);

  return (
    <button
      type="button"
      ref={setNodeRef}
      /* `dragging` is the slot this card leaves behind: the one in the air is the carry layer's
         (parts/carry.tsx), so this stays in its cell, dashed and empty, until the drop lands. */
      className={`schedule-job ${statusTone(job.status)}${isDragging ? " dragging" : ""}${isFocused ? " focused" : ""}${pending ? " is-pending" : ""}${live ? " is-live" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition } as CSSProperties}
      aria-busy={pending || undefined}
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
    </div>,
    document.body
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
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drag-${job.id}`,
    data: { jobId: job.id }
  });
  const dateRange =
    job.startDate === job.endDate
      ? formatScheduleDate(job.startDate)
      : `${formatScheduleDate(job.startDate)} - ${formatScheduleDate(job.endDate)}`;

  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`unassigned-card ${statusTone(job.status)}${isDragging ? " dragging" : ""}${isFocused ? " focused" : ""}`}
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
