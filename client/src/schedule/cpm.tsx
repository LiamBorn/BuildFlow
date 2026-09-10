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
  // A job with no constraint of its own stays where it is planned: start no earlier than
  // its start date. Without that floor every unlinked job would slide back to the epoch and
  // the "project finish" would be the longest job, not the plan.
  const tasks: CpmTask[] = jobs.map((job) => ({
    id: job.id,
    duration: calendar.duration(job.startDate, job.endDate),
    constraintType: job.constraintType && job.constraintDate ? job.constraintType : "SNET",
    constraintDate: calendar.toIndex(job.constraintType && job.constraintDate ? job.constraintDate : job.startDate)
  }));
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
