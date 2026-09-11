/**
 * The schedule as a CPM network and the readout the Schedule landing and the
 * Gantt Chart share: project finish, the critical path, slip against the saved
 * baseline, and the Re-baseline action.
 */
import { AlertTriangle, GanttChartSquare } from "lucide-react";
import type { Job, JobDependency } from "@buildflow/shared";
import {
  calculateCpm,
  createWorkCalendar,
  defaultWorkCalendar,
  type CpmLink,
  type CpmTask,
  type WorkCalendarSetting
} from "@buildflow/shared";
import { isText } from "./parts/shared";
import { formatScheduleDate } from "./week";

export function buildScheduleCpm(jobs: Job[], dependencies: JobDependency[], workCalendar: WorkCalendarSetting = defaultWorkCalendar()) {
  if (jobs.length === 0) return null;
  const epoch = jobs.reduce((min, job) => (job.startDate < min ? job.startDate : min), jobs[0].startDate);
  // Crews work Mon–Sat and never on a holiday, so the network is scheduled on a
  // working-day axis. Durations, lags and float are therefore working days —
  // on a raw calendar axis a Saturday finish + "1 day" would land on a Sunday.
  // the workspace's own working week and holidays, so durations and float mean what the planner means
  const calendar = createWorkCalendar(epoch, {
    holidays: workCalendar.holidays.map((holiday) => holiday.date),
    weekendDays: [0, 1, 2, 3, 4, 5, 6].filter((day) => !workCalendar.workingDays.includes(day))
  });
  // Every job stays where it is planned: start no earlier than its start date. Without that
  // floor an unlinked job slides back to the epoch and the "project finish" becomes the longest
  // job, not the plan. A job's own constraint is read on top of that floor rather than instead
  // of it — the two say different things, and only "must start on" is entitled to move a job.
  const tasks: CpmTask[] = jobs.map((job) => {
    const planned = calendar.toIndex(job.startDate);
    const task: CpmTask = {
      id: job.id,
      duration: calendar.duration(job.startDate, job.endDate),
      constraintType: "SNET",
      constraintDate: planned
    };
    const constrained = job.constraintType && job.constraintDate ? calendar.toIndex(job.constraintDate) : null;
    if (constrained == null) return task;
    // "Must start on" is a hard pin and overrides the plan; "start no earlier than" is a floor,
    // so the later of the two wins; "finish no later than" is a deadline for the backward pass,
    // which leaves the job where it is planned and reports negative float if it cannot make it.
    if (job.constraintType === "MSO") return { ...task, constraintType: "MSO", constraintDate: constrained };
    if (job.constraintType === "SNET") return { ...task, constraintDate: Math.max(planned, constrained) };
    if (job.constraintType === "FNLT") return { ...task, deadline: constrained };
    return task; // ASAP adds nothing the plan does not already say
  });
  const links: CpmLink[] = dependencies.map((dependency) => ({
    predecessorId: dependency.predecessorId,
    successorId: dependency.successorId,
    type: dependency.type,
    lag: dependency.lagDays
  }));
  const result = calculateCpm(tasks, links);

  // Project finish as an inclusive last working day, plus slip against baseline.
  const finishDate = result.cycle ? null : calendar.fromIndex(Math.max(result.projectFinish - 1, 0));
  const baselineEnds = jobs.map((job) => job.baselineEnd).filter(isText);
  const baselineFinish = baselineEnds.length ? baselineEnds.reduce((max, date) => (date > max ? date : max)) : null;
  // measured in working days too, so a weekend never reads as two days of slip
  const slipDays = finishDate && baselineFinish ? calendar.toIndex(finishDate) - calendar.toIndex(baselineFinish) : null;

  return { result, epoch, calendar, finishDate, baselineFinish, slipDays };
}

export type ScheduleCpm = NonNullable<ReturnType<typeof buildScheduleCpm>>;

export function ScheduleCpmSummary({ cpm, busy, onSetBaseline }: { cpm: ScheduleCpm; busy: boolean; onSetBaseline: () => void }) {
  const { result, finishDate, slipDays } = cpm;
  if (result.cycle) {
    return (
      <div className="sched-cpm sched-cpm-error" role="alert">
        <span className="sched-cpm-ico">
          <AlertTriangle size={16} />
        </span>
        <div>
          <strong>Circular dependency — the network can't be scheduled.</strong>
          <em>{result.cycle.join(" → ")}</em>
        </div>
      </div>
    );
  }
  const totalFloat = Object.values(result.tasks).map((task) => task.totalFloat);
  const behind = totalFloat.filter((value) => value < 0).length;

  return (
    <div className="sched-cpm">
      <span className="sched-cpm-ico">
        <GanttChartSquare size={16} />
      </span>
      <div className="sched-cpm-stat">
        <em>Project finish</em>
        <strong>{finishDate ? formatScheduleDate(finishDate) : "—"}</strong>
      </div>
      <div className="sched-cpm-stat">
        <em>Critical path</em>
        <strong>
          {result.criticalPath.length} <small>of {Object.keys(result.tasks).length}</small>
        </strong>
      </div>
      <div className="sched-cpm-stat">
        <em>vs baseline</em>
        <strong className={slipDays == null ? "" : slipDays > 0 ? "is-late" : slipDays < 0 ? "is-early" : "is-on"}>
          {slipDays == null ? "—" : slipDays === 0 ? "On plan" : `${slipDays > 0 ? "+" : ""}${slipDays}d`}
        </strong>
      </div>
      {behind > 0 && (
        <div className="sched-cpm-stat">
          <em>Negative float</em>
          <strong className="is-late">{behind}</strong>
        </div>
      )}
      <button type="button" className="sched-cpm-baseline" disabled={busy} onClick={onSetBaseline}>
        {busy ? "Saving…" : "Re-baseline"}
      </button>
    </div>
  );
}
