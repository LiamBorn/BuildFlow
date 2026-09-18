/**
 * The setup stage: what a new workspace shows while the server is building it.
 *
 * Onboarding's last step applies the trade, the plan and the seats to the org, and the
 * server seeds a starter workspace behind that call. On a paid plan it then opens a Stripe
 * Checkout session too, so the wait is real and occasionally a few seconds long. This is
 * what fills it: a miniature of the board being assembled a panel at a time, then a burst,
 * looping until the work lands.
 *
 * Built from the reference recording the user supplied (2026-09-14). The miniature is
 * BuildFlow's own board rather than a generic card — a jobs column, the crews on each job,
 * progress, and a status block — so what the animation assembles is the thing being made.
 *
 * TWO RULES ABOUT WHEN IT SHOWS, both of which exist so it never lies about the wait:
 *   - it waits `delayMs` before appearing, so a fast setup shows nothing at all rather
 *     than a flash of motion;
 *   - once it has appeared it stays for at least `minMs`, so it cannot vanish mid-flight.
 * It never pads the work: the moment the promise settles and the floor has passed, it goes.
 */
import { useEffect, useRef, useState } from "react";

/** The status colours the miniature's last column uses — the palette the real board uses. */
// the four status blocks in the Default Colors set — grays, since the overlay plays outside the shell where the hint tokens do not reach
const STATUS_BLOCKS = ["#4a4a4a", "#8f8f8f", "#626262", "#1c1c1c"];
/** How far along each row reads. Fixed, not random, so every play of the loop is the same. */
const ROW_PROGRESS = [38, 54, 70, 86];

export type SetupStageProps = {
  /** Shown under the miniature. Say what is being made, not how long it will take. */
  label?: string;
  /** How long the work has to run before this appears at all. */
  delayMs?: number;
  /** How long it stays once it has appeared, so it cannot flash. */
  minMs?: number;
};

/**
 * Whether a stage should be on screen for work that is `running`, honouring both the delay
 * before it appears and the floor once it has. Returns false until the delay has passed.
 */
export function useSetupStage(running: boolean, delayMs = 350, minMs = 900) {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (running) {
      const timer = window.setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, delayMs);
      return () => window.clearTimeout(timer);
    }
    if (!visible) return undefined;
    // the work is done; hold only for what is left of the floor
    const left = Math.max(0, minMs - (Date.now() - (shownAt.current ?? 0)));
    const timer = window.setTimeout(() => {
      shownAt.current = null;
      setVisible(false);
    }, left);
    return () => window.clearTimeout(timer);
    // `visible` is read to decide whether there is anything to hide, and is set here too;
    // the guard above makes that safe.
  }, [running, delayMs, minMs, visible]);

  return visible;
}

export function SetupStage({ label = "Getting your workspace ready" }: SetupStageProps) {
  return (
    <div className="bfsu" role="status" aria-live="polite" aria-busy="true">
      <div className="bfsu-scrim" aria-hidden="true" />
      <div className="bfsu-stage">
        {/* The miniature is decoration for the label, which is the part that has to be read. */}
        <div className="bfsu-card" aria-hidden="true">
          <span className="bfsu-line is-lg" />
          <span className="bfsu-line is-sm" />
          <div className="bfsu-board">
            <div className="bfsu-panel is-jobs">
              {[0, 1, 2, 3].map((row) => (
                <span key={row} className="bfsu-row">
                  {/* two lines, because a job row is a name over its phase — the widths are
                      set in CSS per row so the column does not read as four identical bars */}
                  <span className="bfsu-stack">
                    <i className="bfsu-stub" />
                    <i className="bfsu-substub" />
                  </span>
                </span>
              ))}
            </div>
            <div className="bfsu-panel is-crews">
              {[0, 1, 2, 3].map((row) => (
                <span key={row} className="bfsu-row">
                  {/* the head and shoulders inside are ::before and ::after, and the tint
                      varies by row, so four crews do not read as one crew four times */}
                  <i className="bfsu-avatar" />
                </span>
              ))}
            </div>
            <div className="bfsu-panel is-progress">
              {[0, 1, 2, 3].map((row) => (
                <span key={row} className="bfsu-row">
                  {/* a track under the fill, so the bar reads as progress rather than as a
                      floating dash, plus the stub where the figure would sit */}
                  <i className="bfsu-track">
                    <b className="bfsu-meter" style={{ width: `${ROW_PROGRESS[row]}%` }} />
                  </i>
                  <i className="bfsu-figure" />
                </span>
              ))}
            </div>
            <div className="bfsu-panel is-status">
              {STATUS_BLOCKS.map((colour) => (
                <span key={colour} className="bfsu-row">
                  <i className="bfsu-block" style={{ background: colour }} />
                </span>
              ))}
            </div>
          </div>
          <div className="bfsu-burst">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((spark) => (
              <i key={spark} className="bfsu-spark" />
            ))}
          </div>
        </div>
        <p className="bfsu-caption">{label}</p>
      </div>
    </div>
  );
}
