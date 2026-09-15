/**
 * The tutorial's presentation, on the design of the reference recording the user supplied
 * on 2026-09-14: an accent band with a close button, a demonstration panel overlapping it,
 * the step's heading and body, then a progress bar beside Back/Next.
 *
 * IT OWNS THE PRESENTATION ONLY. The steps, the page navigation, the spotlight and the
 * validation gates stay in App.tsx — this is handed a step and three callbacks. That split
 * is why the two gate tests still pass unchanged.
 *
 * EVERY STEP GETS ITS OWN DEMONSTRATION. Asked for on the second pass: the panel should
 * show the screen the step is actually about. So there is a SHAPE per screen — a month
 * calendar looks like a month calendar, kanban lanes look like lanes, the Gantt looks like
 * bars on a timeline — and an ACTION over it: read, click, drag or fill. Twenty steps map
 * onto eleven shapes and four actions in `TUTORIAL_SCENES`, keyed by the step's own id, so
 * a new step either names its scene there or falls back to the shape its target implies.
 *
 * WHAT "PLAYS A VIDEO" MEANS HERE. A step may name a real clip in `video` and then this
 * plays it, muted and looping. No such files exist in client/public yet, so what every step
 * plays today is its shape — which is what the reference's own panel is: an illustration
 * with a drawn cursor, not a screen recording. Drop an .mp4 in and the step plays that.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

/** The screen a demonstration draws. */
export type TutorialShape =
  | "tiles"
  | "table"
  | "board"
  | "calendar"
  | "lanes"
  | "timeline"
  | "list"
  | "form"
  | "switcher"
  | "status"
  | "map";

/** What the cursor does over it. */
export type TutorialAction = "read" | "click" | "drag" | "fill";

export type TutorialSceneSpec = { shape: TutorialShape; action: TutorialAction };

/**
 * One scene per step, by step id. The ids are App.tsx's `buildTutorialSteps` plus the eight
 * in schedule/tour.ts; keeping the table here rather than on the step data means the tour's
 * steps did not have to be touched.
 */
export const TUTORIAL_SCENES: Record<string, TutorialSceneSpec> = {
  // the core seven
  intro: { shape: "tiles", action: "read" },
  "dashboard-context": { shape: "tiles", action: "read" },
  "open-crew-form": { shape: "table", action: "click" },
  "submit-crew": { shape: "form", action: "fill" },
  "schedule-overview": { shape: "board", action: "read" },
  "open-job-form": { shape: "board", action: "click" },
  "submit-job": { shape: "form", action: "fill" },
  // the Schedule tour, one stop per view
  "schedule-landing": { shape: "switcher", action: "click" },
  "schedule-status": { shape: "status", action: "read" },
  "schedule-filters": { shape: "switcher", action: "click" },
  "month-view": { shape: "calendar", action: "drag" },
  "list-view": { shape: "list", action: "read" },
  "gantt-view": { shape: "timeline", action: "drag" },
  "kanban-view": { shape: "lanes", action: "drag" },
  "matrix-view": { shape: "board", action: "read" },
  // the paid add-ons
  "product-schedule-ai": { shape: "list", action: "read" },
  "product-time-cards": { shape: "table", action: "read" },
  "product-map-field-ops": { shape: "map", action: "read" },
  "product-equipment": { shape: "table", action: "read" },
  "wrap-up": { shape: "tiles", action: "click" }
};

export type TutorialStageStep = {
  /** Which scene this step shows; see TUTORIAL_SCENES. */
  id?: string;
  title: string;
  body: string;
  /** Shown while the step's gate is still open. */
  requirement?: string;
  validation?: string;
  targetId?: string;
  /** A real clip for this step, served from client/public. Falls back to the shape. */
  video?: string;
};

/** The scene for a step: its own, or the one its target and gate imply. */
export function sceneForStep(step: TutorialStageStep): TutorialSceneSpec {
  const named = step.id ? TUTORIAL_SCENES[step.id] : undefined;
  if (named) return named;
  if (step.validation && /DialogOpen$/.test(step.validation)) return { shape: "table", action: "click" };
  if (step.validation) return { shape: "form", action: "fill" };
  if (step.targetId && /(calendar|month)/.test(step.targetId)) return { shape: "calendar", action: "drag" };
  if (step.targetId && /(lanes|kanban)/.test(step.targetId)) return { shape: "lanes", action: "drag" };
  if (step.targetId && /(timeline|gantt)/.test(step.targetId)) return { shape: "timeline", action: "drag" };
  if (step.targetId && /(board|grid|matrix)/.test(step.targetId)) return { shape: "board", action: "read" };
  if (step.targetId && /(days|list|alerts)/.test(step.targetId)) return { shape: "list", action: "read" };
  return { shape: "tiles", action: "read" };
}

/**
 * A step's clip, but only once the browser has confirmed the file is really there. A
 * missing .mp4 otherwise renders as an empty black box, and showing something is the
 * tutorial's whole job — so the shape holds the panel until a HEAD says otherwise.
 */
function usePlayableVideo(src: string | undefined) {
  const [playable, setPlayable] = useState(false);
  useEffect(() => {
    setPlayable(false);
    if (!src) return undefined;
    let cancelled = false;
    fetch(src, { method: "HEAD" })
      .then((response) => {
        if (!cancelled && response.ok && (response.headers.get("content-type") ?? "").startsWith("video")) setPlayable(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [src]);
  return playable;
}

const times = (count: number) => Array.from({ length: count }, (_, index) => index);

/** The eleven screens. Each is markup only; the motion is all in tutorial-stage.css. */
function ShapeBody({ shape }: { shape: TutorialShape }) {
  switch (shape) {
    case "tiles":
      return (
        <div className="bftu-tiles">
          {times(4).map((tile) => (
            <span key={tile} className="bftu-tile">
              <i className="bftu-tile-mark" />
              <i className="bftu-tile-label" />
              <i className="bftu-tile-figure" />
            </span>
          ))}
          <span className="bftu-hit" />
        </div>
      );
    case "table":
      return (
        <div className="bftu-table">
          <span className="bftu-table-head">
            <i className="bftu-stub is-head" />
            <span className="bftu-hit is-pill" />
          </span>
          {times(5).map((row) => (
            <span key={row} className="bftu-table-row">
              <i className="bftu-stub" />
              <i className="bftu-chip" />
              <i className="bftu-cell" />
            </span>
          ))}
        </div>
      );
    case "board":
      return (
        <div className="bftu-board">
          <span className="bftu-board-days">
            {times(6).map((day) => (
              <i key={day} />
            ))}
          </span>
          {times(4).map((row) => (
            <span key={row} className="bftu-board-row">
              <i className="bftu-stub is-crew" />
              {times(6).map((cell) => (
                <i key={cell} className="bftu-board-cell" />
              ))}
            </span>
          ))}
          <span className="bftu-hit is-cell" />
        </div>
      );
    case "calendar":
      return (
        <div className="bftu-cal">
          <span className="bftu-cal-dow">
            {times(7).map((day) => (
              <i key={day} />
            ))}
          </span>
          <span className="bftu-cal-grid">
            {times(28).map((cell) => (
              <i key={cell} className="bftu-cal-cell" />
            ))}
          </span>
          <span className="bftu-mover" />
        </div>
      );
    case "lanes":
      return (
        <div className="bftu-lanes">
          {times(4).map((lane) => (
            <span key={lane} className="bftu-lane">
              <i className="bftu-lane-head" />
              {times(lane === 1 ? 1 : 2).map((card) => (
                <i key={card} className="bftu-lane-card" />
              ))}
            </span>
          ))}
          <span className="bftu-mover" />
        </div>
      );
    case "timeline":
      return (
        <div className="bftu-time">
          <span className="bftu-time-scale">
            {times(6).map((tick) => (
              <i key={tick} />
            ))}
          </span>
          {times(5).map((row) => (
            <span key={row} className="bftu-time-row">
              <i className="bftu-stub is-crew" />
              <i className="bftu-time-bar" />
            </span>
          ))}
          <span className="bftu-mover" />
        </div>
      );
    case "list":
      return (
        <div className="bftu-list">
          {times(5).map((row) => (
            <span key={row} className="bftu-list-row">
              <i className="bftu-list-mark" />
              <span className="bftu-list-copy">
                <i className="bftu-stub" />
                <i className="bftu-substub" />
              </span>
              <i className="bftu-chip" />
            </span>
          ))}
        </div>
      );
    case "form":
      return (
        <div className="bftu-form-wrap">
          <div className="bftu-form">
            <i className="bftu-stub is-head" />
            <span className="bftu-form-grid">
              <i className="bftu-field" />
              <i className="bftu-field" />
              <i className="bftu-field is-wide" />
              <i className="bftu-field" />
              <i className="bftu-field" />
            </span>
            <span className="bftu-hit is-submit" />
          </div>
        </div>
      );
    case "switcher":
      return (
        <div className="bftu-switch">
          <span className="bftu-switch-row">
            {times(5).map((pill) => (
              <i key={pill} className="bftu-switch-pill" />
            ))}
            <span className="bftu-hit is-pill" />
          </span>
          <span className="bftu-switch-panel">
            {times(4).map((row) => (
              <i key={row} className="bftu-cell" />
            ))}
          </span>
        </div>
      );
    case "status":
      return (
        <div className="bftu-status">
          <span className="bftu-status-hero">
            <i className="bftu-status-figure" />
            <i className="bftu-stub is-head" />
          </span>
          {times(4).map((row) => (
            <span key={row} className="bftu-status-row">
              <i className="bftu-stub" />
              <i className="bftu-cell" />
              <i className="bftu-chip" />
            </span>
          ))}
        </div>
      );
    case "map":
      return (
        <div className="bftu-map">
          <span className="bftu-map-grid" />
          <span className="bftu-map-route" />
          {times(5).map((pin) => (
            <i key={pin} className="bftu-map-pin" />
          ))}
        </div>
      );
    default:
      return null;
  }
}

function TutorialScenePanel({ scene, stepKey }: { scene: TutorialSceneSpec; stepKey: string }) {
  return (
    <div className={`bftu-scene is-${scene.shape} act-${scene.action}`} key={stepKey} aria-hidden="true">
      <div className="bftu-scene-head">
        <span className="bftu-scene-line is-lg" />
        <span className="bftu-scene-line is-sm" />
      </div>
      <div className="bftu-scene-body">
        <ShapeBody shape={scene.shape} />
      </div>
      {/* the drawn cursor the reference moves over its panel */}
      <span className="bftu-scene-cursor" />
    </div>
  );
}

export type TutorialStageProps = {
  step: TutorialStageStep;
  index: number;
  total: number;
  /** False while the step's gate is still open; Next is held until it clears. */
  satisfied: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
};

export function TutorialStage({ step, index, total, satisfied, onBack, onNext, onSkip }: TutorialStageProps) {
  const scene = useMemo(() => sceneForStep(step), [step]);
  const playable = usePlayableVideo(step.video);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isFinal = index === total - 1;
  const percent = Math.round(((index + 1) / total) * 100);

  // a new step restarts its clip from the top rather than resuming the last one
  useEffect(() => {
    if (!playable || !videoRef.current) return;
    videoRef.current.currentTime = 0;
    void videoRef.current.play().catch(() => undefined);
  }, [playable, step.video]);

  return (
    <div
      className="bftu-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="buildflow-tutorial-title"
      aria-describedby="buildflow-tutorial-body"
    >
      <div className="bftu-band">
        <button type="button" className="bftu-close" onClick={onSkip} aria-label="Skip Tutorial" title="Skip Tutorial">
          <X size={18} />
        </button>
      </div>

      <div className="bftu-media">
        {playable && step.video ? (
          <video ref={videoRef} className="bftu-video" src={step.video} muted loop playsInline autoPlay aria-hidden="true" />
        ) : (
          <TutorialScenePanel scene={scene} stepKey={step.id ?? step.title} />
        )}
      </div>

      <div className="bftu-copy">
        <h2 id="buildflow-tutorial-title">{step.title}</h2>
        <p id="buildflow-tutorial-body">{step.body}</p>
        {step.requirement && !satisfied && (
          <p className="bftu-requirement" role="status">
            {step.requirement}
          </p>
        )}
      </div>

      <div className="bftu-foot">
        <span className="bftu-meter" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${percent}%` }} />
        </span>
        <span className="bftu-steps">
          Step {index + 1} of {total}
        </span>
        <div className="bftu-actions">
          {index > 0 && (
            <button type="button" className="bftu-back" onClick={onBack}>
              Back
            </button>
          )}
          <button type="button" className="bftu-next" onClick={onNext} disabled={!satisfied}>
            {isFinal ? "Finish" : index === 0 ? "Start working" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
