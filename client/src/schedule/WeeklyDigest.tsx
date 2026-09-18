/**
 * "What changed this week" on the Schedule landing: this Monday's plan against
 * last week's snapshot — moved jobs, new crew conflicts, slipped milestones — and
 * the button that emails the same digest to the org's planners now (Monday
 * mornings the server sends it on its own).
 */
import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import type { WeeklyDigest } from "@buildflow/shared";
import { fetchScheduleDigest, sendScheduleDigest } from "../api";
import { formatScheduleDate, plural } from "./week";

/** True for a payload shaped like a digest — a stub or an older server answers with something else. */
export function isWeeklyDigest(value: unknown): value is WeeklyDigest {
  const digest = value as Partial<WeeklyDigest> | null;
  return Boolean(
    digest &&
    typeof digest.weekOf === "string" &&
    Array.isArray(digest.movedJobs) &&
    Array.isArray(digest.newJobs) &&
    Array.isArray(digest.newConflicts) &&
    Array.isArray(digest.slippedMilestones) &&
    digest.totals &&
    typeof digest.totals.jobs === "number"
  );
}

export function WeeklyDigestPanel({
  onNotice,
  headless = false
}: {
  onNotice?: (text: string, options?: { error?: boolean }) => void;
  /** Inside a panel on the board (2026-09-15): the panel draws the card and the title row. */
  headless?: boolean;
}) {
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchScheduleDigest()
      .then((payload) => {
        if (cancelled) return;
        if (isWeeklyDigest(payload)) setDigest(payload);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const send = async () => {
    setSending(true);
    try {
      const result = await sendScheduleDigest();
      onNotice?.(`Digest emailed to ${plural(result.recipients, "planner")}.`);
    } catch (error) {
      onNotice?.(`Could not send the digest: ${error instanceof Error ? error.message : "request failed"}`, { error: true });
    } finally {
      setSending(false);
    }
  };

  const changes = digest
    ? digest.movedJobs.length + digest.newConflicts.length + digest.slippedMilestones.length + digest.newJobs.length
    : 0;
  const later = (days: number) => `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} ${days > 0 ? "later" : "earlier"}`;
  const totals = digest
    ? `${plural(digest.totals.jobs, "job")}, ${plural(digest.totals.bookings, "booking")}, ${plural(digest.totals.conflicts, "crew conflict")}`
    : "";

  const digestNote = digest
    ? digest.previousWeekOf
      ? `Since the snapshot of ${formatScheduleDate(digest.previousWeekOf)}`
      : "First snapshot — next Monday compares against it"
    : failed
      ? "The digest could not load"
      : "Comparing snapshots…";
  return (
    <section
      className={`sched-home-section sched-digest${headless ? " is-headless" : ""}`}
      aria-label="What changed this week"
      data-tutorial-id="schedule-digest"
    >
      {headless ? (
        <p className="sched-section-note">{digestNote}</p>
      ) : (
        <header>
          <h2>What changed this week</h2>
          <span>{digestNote}</span>
        </header>
      )}
      {digest && changes === 0 && (
        <p className="helper-text">
          {digest.previousWeekOf ? "Nothing moved. " : ""}The plan now: {totals}.
        </p>
      )}
      {digest && changes > 0 && (
        <ul className="sched-digest-list">
          {digest.movedJobs.map((move) => (
            <li key={`move-${move.id}`} className="tone-blue">
              <strong>{move.name}</strong> moved {later(move.days)} · {formatScheduleDate(move.to.startDate)} to{" "}
              {formatScheduleDate(move.to.endDate)}
              <em>{move.project}</em>
            </li>
          ))}
          {digest.newConflicts.map((conflict) => (
            <li key={`conflict-${conflict.crewId}-${conflict.date}`} className="tone-red">
              <strong>{conflict.crewName}</strong> double-booked on {formatScheduleDate(conflict.date)}
              <em>{conflict.jobs.join(" and ")}</em>
            </li>
          ))}
          {digest.slippedMilestones.map((milestone) => (
            <li key={`milestone-${milestone.id}`} className="tone-amber">
              <strong>{milestone.title}</strong> slipped {plural(milestone.days, "day")} · now {formatScheduleDate(milestone.to)}
              <em>{milestone.project}</em>
            </li>
          ))}
          {digest.newJobs.map((job) => (
            <li key={`new-${job.id}`} className="tone-green">
              <strong>{job.name}</strong> is new · starts {formatScheduleDate(job.startDate)}
              <em>{job.project}</em>
            </li>
          ))}
        </ul>
      )}
      {digest && changes > 0 && <p className="helper-text">The plan now: {totals}.</p>}
      <footer className="sched-digest-foot">
        <span>Monday mornings this goes to every planner by email.</span>
        <button type="button" className="sched-rail-link" disabled={!digest || sending} onClick={() => void send()}>
          <Mail size={14} aria-hidden="true" /> {sending ? "Sending…" : "Email the team now"}
        </button>
      </footer>
    </section>
  );
}
