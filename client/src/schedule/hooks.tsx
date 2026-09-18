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
import { ApiError, rebookSchedule, updateJob } from "../api";
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

/** The window-scale drag modifier lives in ../dragZoom; re-exported here for the pages and the test that import it from the hooks. */
export { unzoomDrag } from "../dragZoom";

/** The one thing a notice offers: Undo after a change, Refresh after a board that could not reload. */
export type ScheduleNoticeAction = { label: string; busy: string; run: () => Promise<void> };
export type ScheduleNoticeState = { text: string; error?: boolean; action?: ScheduleNoticeAction };
export type ScheduleSayOptions = { error?: boolean; undo?: () => Promise<void>; action?: ScheduleNoticeAction };
export type ScheduleSay = (text: string, options?: ScheduleSayOptions) => void;

/**
 * The status line, in two parts: what this tab did, and what other tabs did.
 *
 * They are separate because they are not the same kind of message. A change this tab made comes
 * with a way back, and the person is deciding whether to take it. News from another tab is
 * commentary — it needs to be heard, and it has no business ending that decision. Sharing one
 * slot meant any remote change inside the eight-second window took the Undo off the screen with
 * nothing to replace it.
 *
 * Each keeps its own clock: 4s for news, 8s for a notice that is an error or carries something
 * to press.
 */
export function useScheduleNotice() {
  const [notice, setNotice] = useState<ScheduleNoticeState | null>(null);
  const [news, setNews] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const newsTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (newsTimer.current) window.clearTimeout(newsTimer.current);
    },
    []
  );
  const say = useCallback<ScheduleSay>((text, options = {}) => {
    const action = options.action ?? (options.undo ? { label: "Undo", busy: "Undoing…", run: options.undo } : undefined);
    setNotice({ text, error: options.error, action });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(null), options.error || action ? 8000 : 4000);
  }, []);
  /** What another tab changed. Announced beside the notice, never over it. */
  const report = useCallback((text: string) => {
    setNews(text);
    if (newsTimer.current) window.clearTimeout(newsTimer.current);
    newsTimer.current = window.setTimeout(() => setNews(null), 4000);
  }, []);
  return { notice, news, say, report };
}

export function ScheduleNotice({ notice, news = null }: { notice: ScheduleNoticeState | null; news?: string | null }) {
  const [running, setRunning] = useState(false);
  const action = notice?.action;
  return (
    // the region stays in the page with nothing in it: a live region created together with its message is often not read out
    <div className="gantt-status-live" role="status" aria-live="polite">
      {notice && (
        <p className={`gantt-status${notice.error ? " is-error" : ""}`}>
          {notice.text}
          {action && (
            <button
              type="button"
              className="sched-undo"
              disabled={running}
              onClick={async () => {
                setRunning(true);
                try {
                  await action.run();
                } finally {
                  setRunning(false);
                }
              }}
            >
              {running ? action.busy : action.label}
            </button>
          )}
        </p>
      )}
      {news && <p className="gantt-status sched-news">{news}</p>}
    </div>
  );
}

/** What a dialog can hand focus to. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The dialogs that are open, in the order they opened. Document order will not do: the job drawer is
 * rendered after the dialogs that open on top of it, so the one that opened last is the one on top.
 */
const openDialogs: HTMLElement[] = [];
const isTopDialog = (panel: HTMLElement) => openDialogs[openDialogs.length - 1] === panel;

/**
 * The last few controls the person touched, newest last. A dialog cannot simply read what had focus when
 * it opened: a field inside it may carry autoFocus, which React honours during the commit — before any
 * effect runs — so by then the card that opened the dialog no longer has it. The interaction itself is
 * also the steadier signal: a browser that is not the frontmost window fires no focus events at all.
 */
const recentlyTouched: HTMLElement[] = [];
if (typeof document !== "undefined") {
  const remember = (event: Event) => {
    if (!(event.target instanceof HTMLElement)) return;
    const control = event.target.closest<HTMLElement>(FOCUSABLE);
    if (!control) return;
    recentlyTouched.push(control);
    if (recentlyTouched.length > 8) recentlyTouched.shift();
  };
  for (const type of ["pointerdown", "click", "keydown", "focusin"]) document.addEventListener(type, remember, true);
}

/** What to give focus back to when `panel` closes: the last control touched outside it that is still on the page. */
function openerOf(panel: HTMLElement) {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body && !panel.contains(active) && document.contains(active)) return active;
  for (let index = recentlyTouched.length - 1; index >= 0; index -= 1) {
    const candidate = recentlyTouched[index];
    if (!panel.contains(candidate) && document.contains(candidate)) return candidate;
  }
  return null;
}

/**
 * Makes a dialog behave like one. Focus moves inside when it opens, Tab and Shift+Tab stay inside it,
 * Escape closes the topmost dialog only, and focus returns to whatever opened it. Put the returned ref
 * on the dialog's own panel — the element carrying role="dialog", not the backdrop.
 */
export function useModalDialog<T extends HTMLElement>(onClose: () => void) {
  const panelRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const opener = openerOf(panel);
    openDialogs.push(panel);
    const inside = () => [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => !element.hasAttribute("hidden"));
    // React's own autoFocus has already run for the fields that ask for it; only step in when nothing has focus
    if (!panel.contains(document.activeElement)) {
      const first = inside()[0];
      if (first) first.focus({ preventScroll: true });
      else {
        panel.tabIndex = -1;
        panel.focus({ preventScroll: true });
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (!isTopDialog(panel)) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = inside();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !panel.contains(active);
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      const at = openDialogs.indexOf(panel);
      if (at !== -1) openDialogs.splice(at, 1);
      // Back to the card, the row or the button that opened it — after this turn, because removing the
      // panel while something inside it has focus sends the browser's focus to the body on its own.
      if (opener)
        window.setTimeout(() => {
          if (document.contains(opener) && (document.activeElement === document.body || document.activeElement === null))
            opener.focus({ preventScroll: true });
        }, 0);
    };
  }, []);
  return panelRef;
}

export function ConflictDialog({ clashes, onAnswer }: { clashes: CrewClash[]; onAnswer: (bookAnyway: boolean) => void }) {
  const first = clashes[0];
  const panel = useModalDialog<HTMLElement>(() => onAnswer(false));
  return (
    <div className="schedule-dialog-backdrop" role="presentation" onClick={() => onAnswer(false)}>
      <section
        className="schedule-dialog sched-ask"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sched-ask-title"
        ref={panel}
        onClick={(event) => event.stopPropagation()}
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

/* ── The refresh that follows a write ─────────────────────────────────────
   A write and the reload after it are two different things, and only the first
   one can fail as a save. Wrapping both in one try/catch — which is what every
   board did — makes a refresh that throws say "Could not save", after the server
   has already taken the change: the planner is told to try again, saves twice,
   and the board they are looking at is stale with nothing saying so.

   So the write is reported on its own, and the refresh reports itself: the change
   landed, the board may be behind, and here is the button that tries again. */

/** Reworded so the sentence still reads after a `done` that ends in a full stop, or does not. */
const boardMayBeStale = (done: string) =>
  `${done.replace(/[.\s]+$/, "")}. The board could not refresh, so what you see may be out of date.`;

const refreshAction = (reload: () => Promise<void>, say: ScheduleSay): ScheduleNoticeAction => ({
  label: "Refresh",
  busy: "Refreshing…",
  run: async () => {
    try {
      await reload();
      say("The board is up to date.");
    } catch {
      say("Still could not reach the API. Check the connection, then try again.", {
        error: true,
        action: refreshAction(reload, say)
      });
    }
  }
});

/**
 * Say what a change did, once the change itself has landed on the server.
 *
 * Resolves true when the board is showing fresh data and false when the refresh failed —
 * in which case the notice says so and offers to try again, rather than claiming the save
 * did not happen. An Undo is only offered on the fresh path: undoing against a board that
 * is already out of date is how one wrong click becomes two.
 */
export function useSettleWrite(reload: () => Promise<void>, say: ScheduleSay) {
  return useCallback(
    async ({ done, undo }: { done: string; undo?: () => Promise<void> }): Promise<boolean> => {
      try {
        await reload();
      } catch {
        say(boardMayBeStale(done), { error: true, action: refreshAction(reload, say) });
        return false;
      }
      say(done, { undo });
      return true;
    },
    [reload, say]
  );
}

/**
 * The server's own words when a write was refused because the row had moved on, or null when the
 * failure is something else. A stale write is not a failed save: nothing was attempted twice and
 * nothing is wrong with the request — the plan simply changed underneath it.
 */
export function staleMessage(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 409 || error.code !== "stale") return null;
  return error.message;
}

/** What a page's Save does — and every drag that moves a job: resolves true when it saved. */
/** What a save did: saved, declined by the planner (no problem to report), or failed with a reason to show. */
export type JobSaveResult = {
  saved: boolean;
  problem?: string;
  /** The change is on the server, but the board could not refresh — the notice says so. */
  stale?: boolean;
};
export type JobSave = (job: Job, patch: Partial<Job>, done: string) => Promise<JobSaveResult>;

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
  say: ScheduleSay;
  ask: (clashes: CrewClash[]) => Promise<boolean>;
}): JobSave {
  const settle = useSettleWrite(reload, say);
  return useCallback<JobSave>(
    async (job, patch, done) => {
      // only what actually changed travels: a drawer sends every field, a drag two dates
      const changes = Object.fromEntries(
        Object.entries(patch).filter(([key, value]) => !sameValue(value, job[key as keyof Job]))
      ) as Partial<Job>;
      if (Object.keys(changes).length === 0) {
        say(done);
        return { saved: true };
      }
      const move = jobMove(job, assignments, changes);
      // for a plain edit, the values the fields had (a field that was empty stays as the server has it)
      const was = Object.fromEntries(
        Object.keys(changes)
          .map((key) => [key, job[key as keyof Job]])
          .filter(([, value]) => value !== undefined)
      ) as Partial<Job>;
      const reason = (error: unknown) => `Could not save ${job.name}: ${error instanceof Error ? error.message : "request failed"}`;
      const failed = (error: unknown) => say(reason(error), { error: true });
      try {
        if (move) {
          const result = await withConflictAsk((force) => rebookSchedule(move.moves, { force }), ask);
          if (!result) {
            say(`${job.name} stays on ${formatScheduleDate(job.startDate)}.`);
            return { saved: false };
          }
        } else {
          await updateJob(job.id, changes, job.version);
        }
      } catch (error) {
        // Somebody else changed the row while this drawer was open. The server says so and wrote
        // nothing, so there is no "could not save" to report — there is a different plan to show.
        // Refresh so the board carries what really happened, and put their words on the notice.
        const moved = staleMessage(error);
        if (moved) {
          await settle({ done: moved });
          return { saved: false, problem: moved };
        }
        // the notice carries it for the board; the reason travels back for whoever asked (the drawer shows it in place)
        failed(error);
        return { saved: false, problem: reason(error) };
      }
      // Past here the server has the change: the only thing left that can fail is the refresh,
      // and a stale board is not a failed save.
      const fresh = await settle({
        done,
        undo: async () => {
          try {
            if (move) {
              // The way back is not automatically allowed: eight seconds is long enough for
              // somebody to take the day this job is going home to. A clash here is one the
              // planner has not been shown, so it is asked about exactly like a first move.
              const back = await withConflictAsk((force) => rebookSchedule(move.inverse, { force }), ask);
              if (!back) {
                say(`${job.name} stays where it is.`);
                return;
              }
            } else if (Object.keys(was).length > 0) {
              await updateJob(job.id, was);
            }
          } catch (error) {
            failed(error);
            return;
          }
          await settle({ done: `${job.name} as it was` });
        }
      });
      return { saved: true, stale: !fresh };
    },
    [assignments, settle, say, ask]
  );
}

/** Whether the viewport is at most `maxWidth` px wide, for the places a hook cannot go (a state initialiser). */
export function narrowViewport(maxWidth = 640) {
  return (
    typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(`(max-width: ${maxWidth}px)`).matches
  );
}

/**
 * True while the viewport is at most `maxWidth` px wide — the phone layouts' breakpoint,
 * kept in step with schedule-phone.css. False where matchMedia does not exist (tests).
 */
export function useNarrowViewport(maxWidth = 640) {
  const query = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState(() => narrowViewport(maxWidth));
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
