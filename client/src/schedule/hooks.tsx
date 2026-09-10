/**
 * The hooks every schedule page uses — drag sensors and collision, the drop notice
 * with its Undo, the "book anyway?" question and the one way a page saves a job —
 * with the two small components they drive.
 */
import type { CrewClash, Job, ScheduleAssignment } from "@buildflow/shared";
import { KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useSensor, useSensors } from "@dnd-kit/core";
import type { CollisionDetection } from "@dnd-kit/core";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { rebookSchedule, updateJob } from "../api";
import { clashSentence, withConflictAsk } from "./conflicts";
import { jobMove } from "./rebook";
import { scheduleKeyboardCoordinates } from "./dragKeyboard";
import { formatScheduleDate } from "./week";

/**
 * Mouse drags start after 4px; touch lifts a card after a 250ms press so a
 * swipe still scrolls; the keyboard picks a card up with Space or Enter, moves
 * it with the arrow keys and drops it with Space (Escape cancels).
 */
export function useScheduleSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: scheduleKeyboardCoordinates })
  );
}

/** Pointer drags drop where the pointer is; a keyboard drag has no pointer, so it drops where the card overlaps. */
export const scheduleCollision: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : rectIntersection(args);
};

export type ScheduleNoticeState = { text: string; error?: boolean; undo?: () => Promise<void> };

/** A short status line: 4s for news, 8s when it is an error or carries an Undo. */
export function useScheduleNotice() {
  const [notice, setNotice] = useState<ScheduleNoticeState | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );
  const say = useCallback((text: string, options: { error?: boolean; undo?: () => Promise<void> } = {}) => {
    setNotice({ text, error: options.error, undo: options.undo });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(null), options.error || options.undo ? 8000 : 4000);
  }, []);
  return { notice, say };
}

export function ScheduleNotice({ notice }: { notice: ScheduleNoticeState | null }) {
  const [undoing, setUndoing] = useState(false);
  if (!notice) return null;
  const undo = notice.undo;
  return (
    <p className={`gantt-status${notice.error ? " is-error" : ""}`} role="status" aria-live="polite">
      {notice.text}
      {undo && (
        <button
          type="button"
          className="sched-undo"
          disabled={undoing}
          onClick={async () => {
            setUndoing(true);
            try {
              await undo();
            } finally {
              setUndoing(false);
            }
          }}
        >
          {undoing ? "Undoing…" : "Undo"}
        </button>
      )}
    </p>
  );
}

export function ConflictDialog({ clashes, onAnswer }: { clashes: CrewClash[]; onAnswer: (bookAnyway: boolean) => void }) {
  const first = clashes[0];
  return (
    <div className="schedule-dialog-backdrop" role="presentation" onClick={() => onAnswer(false)}>
      <section
        className="schedule-dialog sched-ask"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sched-ask-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onAnswer(false);
        }}
      >
        <header>
          <div>
            <h2 id="sched-ask-title">Book anyway?</h2>
            <p>
              {clashSentence(clashes)}
              {first ? ` — book ${first.movingJobName} on ${formatScheduleDate(first.date)} anyway?` : ""}
            </p>
          </div>
          <button type="button" className="icon-button" aria-label="Keep the schedule as it is" onClick={() => onAnswer(false)}>
            <X size={18} />
          </button>
        </header>
        {clashes.length > 1 && (
          <ul>
            {clashes.map((clash) => (
              <li key={`${clash.crewId}-${clash.date}-${clash.jobId}`}>
                {clash.crewName} · {formatScheduleDate(clash.date)} · already on {clash.jobName}
              </li>
            ))}
          </ul>
        )}
        <div className="sched-ask-actions">
          <button type="button" className="outline-button" onClick={() => onAnswer(false)}>
            Cancel
          </button>
          <button type="button" className="primary-button" autoFocus onClick={() => onAnswer(true)}>
            Book anyway
          </button>
        </div>
      </section>
    </div>
  );
}

/** `ask(clashes)` resolves with the planner's answer; render `dialog` next to the page's other dialogs. */
export function useConflictAsk() {
  const [pending, setPending] = useState<{ clashes: CrewClash[]; resolve: (bookAnyway: boolean) => void } | null>(null);
  const ask = useCallback((clashes: CrewClash[]) => new Promise<boolean>((resolve) => setPending({ clashes, resolve })), []);
  const dialog = pending ? (
    <ConflictDialog
      clashes={pending.clashes}
      onAnswer={(bookAnyway) => {
        pending.resolve(bookAnyway);
        setPending(null);
      }}
    />
  ) : null;
  return { ask, dialog };
}

/** What a page's Save does — and every drag that moves a job: resolves true when it saved. */
export type JobSave = (job: Job, patch: Partial<Job>, done: string) => Promise<boolean>;

const sameValue = (a: unknown, b: unknown) => a === b || ((a === "" || a == null) && (b === "" || b == null));

/**
 * The one way a schedule page saves a job — one request either way. A move (the same
 * length on new dates) carries every booking the job has, and whatever else changed, in
 * one re-book the server runs as one transaction and asks about before double-booking a
 * crew; any other change is one patch of the job. Both offer Undo, one request too.
 */
export function useJobSave({
  assignments,
  reload,
  say,
  ask
}: {
  assignments: ScheduleAssignment[];
  reload: () => Promise<void>;
  say: (text: string, options?: { error?: boolean; undo?: () => Promise<void> }) => void;
  ask: (clashes: CrewClash[]) => Promise<boolean>;
}): JobSave {
  return useCallback<JobSave>(
    async (job, patch, done) => {
      // only what actually changed travels: a drawer sends every field, a drag two dates
      const changes = Object.fromEntries(
        Object.entries(patch).filter(([key, value]) => !sameValue(value, job[key as keyof Job]))
      ) as Partial<Job>;
      if (Object.keys(changes).length === 0) {
        say(done);
        return true;
      }
      const move = jobMove(job, assignments, changes);
      // for a plain edit, the values the fields had (a field that was empty stays as the server has it)
      const was = Object.fromEntries(
        Object.keys(changes)
          .map((key) => [key, job[key as keyof Job]])
          .filter(([, value]) => value !== undefined)
      ) as Partial<Job>;
      const failed = (error: unknown) =>
        say(`Could not save ${job.name}: ${error instanceof Error ? error.message : "request failed"}`, { error: true });
      try {
        if (move) {
          const result = await withConflictAsk((force) => rebookSchedule(move.moves, { force }), ask);
          if (!result) {
            say(`${job.name} stays on ${formatScheduleDate(job.startDate)}.`);
            return false;
          }
        } else {
          await updateJob(job.id, changes);
        }
        await reload();
        say(done, {
          undo: async () => {
            try {
              if (move) await rebookSchedule(move.inverse, { force: true });
              else if (Object.keys(was).length > 0) await updateJob(job.id, was);
              await reload();
              say(`${job.name} as it was`);
            } catch (error) {
              failed(error);
            }
          }
        });
        return true;
      } catch (error) {
        failed(error);
        return false;
      }
    },
    [assignments, reload, say, ask]
  );
}

/**
 * True while the viewport is at most `maxWidth` px wide — the phone layouts' breakpoint,
 * kept in step with schedule-phone.css. False where matchMedia does not exist (tests).
 */
export function useNarrowViewport(maxWidth = 640) {
  const query = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return narrow;
}
