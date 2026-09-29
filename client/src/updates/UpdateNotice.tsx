/**
 * "An update is available" — the card that offers a newer release of BuildFlow (2026-09-27).
 *
 * Asked for: show the user when there is an update; let them update right then, schedule it, or
 * deny it; show it ONLY when the developer has published an update (releaseWatch.ts and
 * shared/src/release.ts: the server's release number went up); and give it "the same colors,
 * animations, effects, and tweens" as the rest of the program.
 *
 * HOW IT LOOKS. It is the top bar's other floating cards: the Upgrade menu's card on the panel
 * radius and float shadow, its second-surface tile with an eyebrow and a display name, its rows,
 * the program's white and ink pills (section 9), and its parts arriving in the same stagger. It
 * comes out of the BELL — the program's notifications — on section 64's gooey entrance, measured
 * from the bell the way every dropdown is measured from its button, and goes back into it the
 * same way when it is done. Skin section 85 dresses it.
 *
 * WHAT EACH CHOICE DOES.
 *   Update now        reloads. That IS the update: the website is fetched fresh, and the new
 *                     release's "What's new" greets them.
 *   Schedule          picks a time; at that time, if BuildFlow is open, a minute's countdown
 *                     (Update now / Postpone an hour) and then the reload. Opening BuildFlow any
 *                     time before then updates it anyway — the card says so rather than pretend
 *                     otherwise.
 *   Skip this update  never asks about this release again on this device. A later one asks.
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { CalendarClock, Clock3, RefreshCw } from "lucide-react";
import { compareVersions, type AppRelease } from "@buildflow/shared";
import {
  CHECK_EVERY_MS,
  COUNTDOWN_SECONDS,
  clockLabel,
  RECHECK_ON_RETURN_MS,
  decisionKey,
  fetchNewerRelease,
  forgetSpentDecisions,
  publishedLabel,
  readDecision,
  scheduleOptions,
  whenLabel,
  writeDecision,
  type UpdateDecision
} from "./releaseWatch";

type View = "offer" | "schedule" | "scheduled" | "countdown";

/** The bell the card comes out of and goes back into. */
const BELL = '.hs-topbar [aria-label="Notifications"]';
/** How often a scheduled update checks whether its time has come. */
const DUE_CHECK_MS = 15_000;
/** The exit is an animation; this is the backstop for when none runs (reduced motion, a hidden tab). */
const LEAVE_BACKSTOP_MS = 600;

const zoomOf = (element: Element): number => {
  const zoom = (element as Element & { currentCSSZoom?: number }).currentCSSZoom;
  return typeof zoom === "number" && zoom > 0 ? zoom : 1;
};

/**
 * Where the gooey entrance starts: on the bell's own box (skin section 64). Both rects are
 * rendered pixels; the card is inside the shell's zoom, so its translate is in the shell's units.
 */
const gooFromBell = (card: HTMLElement): CSSProperties | null => {
  const bell = document.querySelector(BELL);
  if (!bell) return null;
  const from = bell.getBoundingClientRect();
  const to = card.getBoundingClientRect();
  const zoom = zoomOf(card);
  return {
    "--bf-goo-dx": `${Math.round((from.left - to.left) / zoom)}px`,
    "--bf-goo-y": `${Math.round((from.top - to.top) / zoom)}px`,
    "--bf-goo-x": to.width > 0 ? Math.min(1, from.width / to.width).toFixed(4) : "1",
    "--bf-goo-h": to.height > 0 ? Math.min(1, from.height / to.height).toFixed(4) : "0.2"
  } as CSSProperties;
};

/** What a screen reader hears when the card appears or changes — once, never each second. */
const announcementFor = (view: View, release: AppRelease, decision: UpdateDecision | null) => {
  if (view === "offer") return `BuildFlow ${release.version} is available.`;
  if (view === "schedule") return "Choose when to update.";
  if (view === "scheduled" && decision?.choice === "scheduled") return `Update scheduled for ${whenLabel(decision.at)}.`;
  return `BuildFlow will update in ${COUNTDOWN_SECONDS} seconds.`;
};

export function UpdateNotice({ reload = () => window.location.reload() }: { reload?: () => void }) {
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [decision, setDecision] = useState<UpdateDecision | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [goo, setGoo] = useState<CSSProperties | null>(null);
  const [placed, setPlaced] = useState(false);
  const [countdownEnds, setCountdownEnds] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const cardRef = useRef<HTMLElement | null>(null);
  const leaveTimer = useRef<number | null>(null);
  // held in a ref so the countdown's timer is not rebuilt each second for a new function
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  const show = useCallback((next: View) => {
    if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = null;
    setLeaving(false);
    setView(next);
  }, []);

  const finishLeaving = useCallback(() => {
    if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = null;
    setView(null);
    setLeaving(false);
    setPlaced(false);
    setGoo(null);
  }, []);

  /**
   * Back into the bell: the entrance, reversed, and then gone. Measured again first — the card
   * may be a different height by now (the schedule step is taller than the offer). The leaving
   * card is a NEW element (keyed below): replaying a finished animation in reverse on the same
   * element snaps it to its first frame with no animation and no animationend.
   */
  const dismiss = useCallback(() => {
    if (cardRef.current) setGoo(gooFromBell(cardRef.current));
    setLeaving(true);
    if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(finishLeaving, LEAVE_BACKSTOP_MS);
  }, [finishLeaving]);

  const startCountdown = useCallback(() => {
    setCountdownEnds(Date.now() + COUNTDOWN_SECONDS * 1000);
    setNow(Date.now());
    show("countdown");
  }, [show]);

  /** The card that belongs to a release and what was chosen about it, or none. */
  const settle = useCallback(
    (next: UpdateDecision | null) => {
      setDecision(next);
      if (!next) show("offer");
      else if (next.choice === "scheduled" && next.at <= Date.now()) startCountdown();
      else if (view) dismiss();
    },
    [dismiss, show, startCountdown, view]
  );

  // Asking: now, every few minutes, and on coming back to the tab. Only a newer release answers.
  useEffect(() => {
    forgetSpentDecisions();
    let cancelled = false;
    let lastAsked = 0;
    const ask = async () => {
      lastAsked = Date.now();
      const next = await fetchNewerRelease();
      if (cancelled || !next) return;
      setRelease((current) => (current && compareVersions(current.version, next.version) >= 0 ? current : next));
    };
    void ask();
    const timer = window.setInterval(() => void ask(), CHECK_EVERY_MS);
    const onReturn = () => {
      if (document.visibilityState === "visible" && Date.now() - lastAsked > RECHECK_ON_RETURN_MS) void ask();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, []);

  // A release arrives (or a newer one): offer it, unless this device already chose.
  useEffect(() => {
    if (release) settle(readDecision(release.version));
    // only a different release is a reason to decide again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [release?.version]);

  // A choice made in another tab holds here too.
  useEffect(() => {
    if (!release) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === decisionKey(release.version)) settle(readDecision(release.version));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [release, settle]);

  // A scheduled update waits for its time, then counts down.
  useEffect(() => {
    if (decision?.choice !== "scheduled" || view === "countdown") return;
    const at = decision.at;
    const check = () => {
      if (Date.now() >= at) startCountdown();
    };
    const timer = window.setInterval(check, DUE_CHECK_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [decision, view, startCountdown]);

  // The countdown, from a fixed end so a throttled background tab still lands on time.
  useEffect(() => {
    if (view !== "countdown" || countdownEnds === null) return;
    const tick = () => {
      const at = Date.now();
      setNow(at);
      if (at >= countdownEnds) reloadRef.current();
    };
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [view, countdownEnds]);

  // Measured before it is seen, like the dropdown list: the entrance waits for the numbers.
  useLayoutEffect(() => {
    if (!view || placed || !cardRef.current) return;
    setGoo(gooFromBell(cardRef.current));
    setPlaced(true);
  }, [view, placed]);

  useEffect(
    () => () => {
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    },
    []
  );

  if (!release || !view) return null;

  const choose = (next: UpdateDecision | null) => {
    writeDecision(release.version, next);
    setDecision(next);
  };
  const schedule = (at: number) => {
    choose({ choice: "scheduled", at });
    show("scheduled");
  };
  const secondsLeft = countdownEnds === null ? COUNTDOWN_SECONDS : Math.max(0, Math.ceil((countdownEnds - now) / 1000));
  const scheduledAt = decision?.choice === "scheduled" ? decision.at : null;

  return (
    <section
      key={leaving ? "leaving" : "shown"}
      ref={cardRef}
      className="bfupd"
      role="region"
      aria-label="BuildFlow update"
      data-view={view}
      data-bfupd-ready={placed && !leaving ? "true" : undefined}
      data-bfupd-leaving={leaving ? "true" : undefined}
      style={{ ...(goo ?? {}), visibility: placed ? undefined : "hidden" }}
      onAnimationEnd={(event) => {
        if (leaving && event.target === event.currentTarget) finishLeaving();
      }}
    >
      <p className="bfupd-sr" aria-live="polite">
        {announcementFor(view, release, decision)}
      </p>
      {/* keyed by the view, so each change of step brings its parts in again on the stagger */}
      <Fragment key={view}>
        {view === "offer" && (
          <>
            <div className="bfupd-tile">
              <span className="bfupd-mark" aria-hidden="true">
                <RefreshCw size={15} />
              </span>
              <span className="bfupd-tile-body">
                <span className="bfupd-eyebrow">Update available</span>
                <strong>BuildFlow {release.version}</strong>
                <span className="bfupd-meta">Published {publishedLabel(release.publishedAt)}</span>
              </span>
            </div>
            <div className="bfupd-copy">
              <strong>{release.title}</strong>
              {release.highlights.length > 0 && (
                <ul>
                  {release.highlights.slice(0, 3).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              <p className="bfupd-note">Updating reloads BuildFlow. Save anything you are in the middle of first.</p>
            </div>
            <div className="bfupd-actions">
              <button type="button" className="hs-btn hs-btn-primary" onClick={() => reload()}>
                Update now
              </button>
              <button type="button" className="hs-btn" onClick={() => show("schedule")}>
                <CalendarClock size={15} aria-hidden="true" />
                Schedule
              </button>
            </div>
            <button
              type="button"
              className="bfupd-quiet"
              onClick={() => {
                choose({ choice: "skipped" });
                dismiss();
              }}
            >
              Skip this update
            </button>
          </>
        )}

        {view === "schedule" && (
          <>
            <div className="bfupd-head">
              <span className="bfupd-eyebrow">Schedule the update</span>
              <strong>When should BuildFlow {release.version} install?</strong>
            </div>
            {scheduleOptions().map((option) => (
              <button key={option.id} type="button" className="bfupd-option" onClick={() => schedule(option.at)}>
                <span className="bfupd-mark" aria-hidden="true">
                  <Clock3 size={15} />
                </span>
                <span className="bfupd-option-label">{option.label}</span>
                <span className="bfupd-option-time">{clockLabel(option.at)}</span>
              </button>
            ))}
            <button type="button" className="bfupd-quiet" onClick={() => show("offer")}>
              Back
            </button>
          </>
        )}

        {view === "scheduled" && scheduledAt !== null && (
          <>
            <div className="bfupd-tile">
              <span className="bfupd-mark" aria-hidden="true">
                <CalendarClock size={15} />
              </span>
              <span className="bfupd-tile-body">
                <span className="bfupd-eyebrow">Update scheduled</span>
                <strong>{whenLabel(scheduledAt).replace(/^./, (first) => first.toUpperCase())}</strong>
                <span className="bfupd-meta">BuildFlow {release.version}</span>
              </span>
            </div>
            <p className="bfupd-note">
              If BuildFlow is open then, it gives you a minute and updates. Opening BuildFlow any time before that updates
              it too.
            </p>
            <div className="bfupd-actions">
              <button type="button" className="hs-btn hs-btn-primary" onClick={dismiss}>
                Done
              </button>
              <button type="button" className="hs-btn" onClick={() => show("schedule")}>
                Change time
              </button>
            </div>
          </>
        )}

        {view === "countdown" && (
          <>
            <div className="bfupd-tile">
              <span className="bfupd-mark" aria-hidden="true">
                <RefreshCw size={15} />
              </span>
              <span className="bfupd-tile-body">
                <span className="bfupd-eyebrow">Updating BuildFlow</span>
                <strong>
                  In <span className="bfupd-count">{secondsLeft}</span> {secondsLeft === 1 ? "second" : "seconds"}
                </strong>
                <span className="bfupd-meta">BuildFlow {release.version}, as scheduled</span>
              </span>
            </div>
            <p className="bfupd-note">Save anything you are in the middle of.</p>
            <div className="bfupd-actions">
              <button type="button" className="hs-btn hs-btn-primary" onClick={() => reload()}>
                Update now
              </button>
              <button
                type="button"
                className="hs-btn"
                onClick={() => {
                  choose({ choice: "scheduled", at: Date.now() + 60 * 60_000 });
                  setCountdownEnds(null);
                  dismiss();
                }}
              >
                Postpone an hour
              </button>
            </div>
          </>
        )}
      </Fragment>
    </section>
  );
}
