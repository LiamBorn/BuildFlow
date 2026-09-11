import { useRef, useState, type DragEvent } from "react";
import { useModalDialog } from "./hooks";
import CloudLoader from "../components/ui/quantum-cloud-loader"; // the BuildFlow AI "thinking" particles, reused while a file is read
import { AlertTriangle, CalendarClock, CheckCircle2, FileUp, TrendingDown, TrendingUp, X } from "lucide-react";
import {
  commitScheduleImport,
  previewScheduleImport,
  ScheduleImportRequestError,
  type ScheduleForecastIQ,
  type ScheduleHealth,
  type ScheduleImportPreview,
  type ScheduleImportResult
} from "../api";

/**
 * Import a Primavera P6 (.xer) or MS Project XML schedule.
 *
 * Two steps on purpose: nobody drops a 2,000-activity schedule into a new tool and
 * accepts whatever happens. So the file is parsed and reported first — counts, the
 * phases it found, a sample of real activities, and everything that won't survive
 * the mapping — and nothing is written until "Import" is pressed.
 *
 * Reuses the program's existing dialog shell (.project-dialog-*) so it looks like
 * every other dialog in the app; only the import-specific bits are new (.sim-*).
 */

const ACCEPTED = ".xer,.xml,.mpp";
/** The API's JSON body cap is 25mb; stop before the request fails obscurely. */
const MAX_BYTES = 24 * 1024 * 1024;

type Stage = "choose" | "reading" | "preview" | "committing" | "done";
type ImportError = { message: string; hint?: string };

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ScheduleImportDialog({
  onClose,
  onImported,
  defaultLocation
}: {
  onClose: () => void;
  /** Fired after a successful commit so the caller can reload the workspace. */
  onImported: () => Promise<void> | void;
  defaultLocation?: string;
}) {
  const [stage, setStage] = useState<Stage>("choose");
  const [file, setFile] = useState<{ name: string; content: string; size: number } | null>(null);
  const [preview, setPreview] = useState<ScheduleImportPreview | null>(null);
  const [result, setResult] = useState<ScheduleImportResult | null>(null);
  const [error, setError] = useState<ImportError | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panel = useModalDialog<HTMLElement>(onClose);

  const busy = stage === "reading" || stage === "committing";

  const fail = (err: unknown): void => {
    if (err instanceof ScheduleImportRequestError) setError({ message: err.message, hint: err.hint });
    else setError({ message: err instanceof Error ? err.message : "Something went wrong reading that file." });
  };

  const handleFile = async (picked: File) => {
    setError(null);
    setPreview(null);

    // .mpp is an OLE2 binary. The server rejects it too (it's the source of truth
    // for API callers), but catching it here avoids reading tens of megabytes of
    // binary into a string just to be told no.
    if (/\.mpp$/i.test(picked.name)) {
      setError({
        message: "MS Project .mpp files can't be read directly — it's a binary format.",
        hint: "In MS Project open the file, then File → Save As → 'XML Format (*.xml)' and drop that .xml here."
      });
      return;
    }
    if (picked.size > MAX_BYTES) {
      setError({
        message: `That file is ${formatBytes(picked.size)}, which is over the ${formatBytes(MAX_BYTES)} limit.`,
        hint: "Export a single project rather than the whole database, or split the schedule."
      });
      return;
    }

    setStage("reading");
    try {
      const content = await picked.text();
      setFile({ name: picked.name, content, size: picked.size });
      const parsed = await previewScheduleImport({ filename: picked.name, content, defaultLocation });
      setPreview(parsed);
      setStage("preview");
    } catch (err) {
      fail(err);
      setStage("choose");
    }
  };

  const commit = async () => {
    if (!file) return;
    setError(null);
    setStage("committing");
    try {
      const committed = await commitScheduleImport({ filename: file.name, content: file.content, defaultLocation });
      setResult(committed);
      setStage("done");
      await onImported();
    } catch (err) {
      fail(err);
      setStage("preview");
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const picked = event.dataTransfer.files?.[0];
    if (picked) void handleFile(picked);
  };

  const reset = () => {
    setStage("choose");
    setFile(null);
    setPreview(null);
    setError(null);
  };

  const totalJobs = preview?.stats.jobs ?? 0;

  return (
    <div className="project-dialog-backdrop" role="presentation">
      <section className="project-dialog sim-dialog" role="dialog" aria-modal="true" aria-labelledby="schedule-import-title" ref={panel}>
        <header className="project-dialog-header">
          <div>
            <h2 id="schedule-import-title">Import a schedule</h2>
            <p>Bring an existing Primavera P6 or Microsoft Project schedule into BuildFlow.</p>
          </div>
          <button className="icon-button" aria-label="Close schedule import" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="sim-body">
          {error && (
            <div className="sim-error" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              <div>
                <strong>{error.message}</strong>
                {error.hint && <p>{error.hint}</p>}
              </div>
            </div>
          )}

          {(stage === "choose" || stage === "reading") && (
            <>
              <div
                className={dragging ? "sim-drop dragging" : "sim-drop"}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                {stage === "reading" ? (
                  <>
                    <CloudLoader compact className="sim-cloud" />
                    <strong>Reading your schedule…</strong>
                  </>
                ) : (
                  <>
                    <FileUp size={26} aria-hidden="true" />
                    <strong>Drop your schedule file here</strong>
                    <span>Primavera P6 export (.xer) or Microsoft Project XML (.xml)</span>
                    <button type="button" className="primary-button" onClick={() => inputRef.current?.click()}>
                      Choose file
                    </button>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPTED}
                  className="sim-file-input"
                  onChange={(event) => {
                    const picked = event.target.files?.[0];
                    if (picked) void handleFile(picked);
                    // Let the same file be picked again after an error.
                    event.target.value = "";
                  }}
                />
              </div>

              <div className="sim-formats">
                <div>
                  <strong>Primavera P6</strong>
                  <span>File → Export → Primavera PM (XER)</span>
                </div>
                <div>
                  <strong>Microsoft Project</strong>
                  <span>File → Save As → XML Format (*.xml)</span>
                </div>
                <div>
                  <strong>Why not .mpp?</strong>
                  <span>It's an undocumented binary format — save it as XML first.</span>
                </div>
              </div>
            </>
          )}

          {stage === "committing" && preview && (
            <div className="sim-working" role="status" aria-live="polite">
              <CloudLoader compact className="sim-cloud" />
              <strong>Importing your schedule…</strong>
              <span>
                {totalJobs.toLocaleString()} job{totalJobs === 1 ? "" : "s"} into {preview.projects.length} project
                {preview.projects.length === 1 ? "" : "s"}
              </span>
            </div>
          )}

          {stage === "preview" && preview && (
            <>
              <div className="sim-source">
                <CheckCircle2 size={16} aria-hidden="true" />
                <strong>{preview.source}</strong>
                <span>{file?.name}</span>
              </div>

              <HealthTeaser health={preview.health} />

              <div className="sim-stats">
                <div>
                  <b>{preview.stats.activitiesRead.toLocaleString()}</b>
                  <span>activities read</span>
                </div>
                <div>
                  <b>{preview.stats.jobs.toLocaleString()}</b>
                  <span>jobs to create</span>
                </div>
                <div>
                  <b>{preview.stats.phases.toLocaleString()}</b>
                  <span>phases</span>
                </div>
                <div>
                  <b>{preview.stats.milestones.toLocaleString()}</b>
                  <span>milestones</span>
                </div>
                <div>
                  <b>{preview.stats.relationships.toLocaleString()}</b>
                  <span>relationships</span>
                </div>
              </div>

              {preview.projects.map((project) => (
                <div className="sim-project" key={project.name}>
                  <div className="sim-project-head">
                    <strong>{project.name}</strong>
                    <span>
                      {project.jobCount.toLocaleString()} jobs · {project.phases.length} phases
                      {project.targetCompletion ? ` · finishes ${project.targetCompletion}` : ""}
                    </span>
                  </div>
                  {project.phases.length > 0 && (
                    <div className="sim-phases">
                      {project.phases.map((phase) => (
                        <span key={phase.name} title={`${phase.startDate} → ${phase.endDate}`}>
                          {phase.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <table className="sim-table">
                    <thead>
                      <tr>
                        <th>Activity</th>
                        <th>Phase</th>
                        <th>Start</th>
                        <th>Finish</th>
                      </tr>
                    </thead>
                    <tbody>
                      {project.sampleJobs.map((job, index) => (
                        <tr key={`${job.name}-${index}`}>
                          <td>{job.name}</td>
                          <td>{job.phase}</td>
                          <td>{job.startDate}</td>
                          <td>{job.endDate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {project.jobCount > project.sampleJobs.length && (
                    <p className="sim-more">+ {(project.jobCount - project.sampleJobs.length).toLocaleString()} more activities</p>
                  )}
                </div>
              ))}

              {preview.warnings.length > 0 && (
                <div className="sim-warnings">
                  <strong>Before you import</strong>
                  <ul>
                    {preview.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {stage === "done" && result && (
            <div className="sim-report">
              <div className="sim-report-imported">
                <CheckCircle2 size={18} aria-hidden="true" />
                <span>
                  Imported <b>{result.created.jobs.toLocaleString()}</b> job{result.created.jobs === 1 ? "" : "s"} and{" "}
                  <b>{result.created.phases.toLocaleString()}</b> phase{result.created.phases === 1 ? "" : "s"} into{" "}
                  {result.created.projects.map((project) => project.name).join(", ")}
                </span>
              </div>
              <HealthReport health={result.health} />
            </div>
          )}
        </div>

        <footer className="sim-actions">
          {stage === "preview" && (
            <button type="button" className="sim-ghost" onClick={reset} disabled={busy}>
              Choose a different file
            </button>
          )}
          <div className="sim-actions-right">
            <button type="button" className={stage === "done" ? "primary-button" : "sim-ghost"} onClick={onClose} disabled={busy}>
              {stage === "done" ? "View my projects" : "Cancel"}
            </button>
            {(stage === "preview" || stage === "committing") && (
              <button type="button" className="primary-button" onClick={commit} disabled={busy || totalJobs === 0}>
                {stage === "committing" ? "Importing…" : "Import & see full health check"}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}

/* ── Health check presentation ──────────────────────────────────────────────
   All values come from the server's ScheduleHealth (server/src/import/analyze.ts);
   these components only render them. */

const GRADE_TONE: Record<ScheduleHealth["grade"], string> = {
  Healthy: "good",
  Monitor: "warn",
  "At Risk": "risk",
  Critical: "bad"
};

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** SVG progress ring around the 0–100 score. */
function ScoreRing({ score, tone }: { score: number; tone: string }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  return (
    <div className={`sim-ring sim-tone-${tone}`}>
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <circle className="sim-ring-track" cx="40" cy="40" r={radius} />
        <circle className="sim-ring-value" cx="40" cy="40" r={radius} strokeDasharray={circumference} strokeDashoffset={offset} />
      </svg>
      <div className="sim-ring-label">
        <b>{score}</b>
        <span>/ 100</span>
      </div>
    </div>
  );
}

const FORECASTIQ_LABEL: Record<ScheduleForecastIQ["status"], string> = {
  not_started: "Not started yet",
  on_track: "On track",
  slipping: "Slipping",
  at_risk: "At risk",
  complete: "Complete"
};

const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/**
 * The "your schedule is lying to you" moment: the plan date is a single optimistic
 * number, and this shows where the finish actually lands once pace and merge risk
 * are simulated — a P10–P90 band with P50/P80 markers and the plan date sitting
 * (usually) to its left, plus the blunt on-time probability.
 */
function ConfidenceBand({ confidence }: { confidence: NonNullable<ScheduleForecastIQ["confidence"]> }) {
  const lo = Math.min(dayMs(confidence.planFinish), dayMs(confidence.p10));
  const hi = Math.max(dayMs(confidence.p90), dayMs(confidence.planFinish));
  const span = Math.max(1, hi - lo);
  const pos = (iso: string) => Math.max(0, Math.min(100, ((dayMs(iso) - lo) / span) * 100));

  const odds = confidence.onTimeProbability;
  const oddsTone = odds >= 70 ? "good" : odds >= 40 ? "warn" : "bad";

  return (
    <div className="sim-band">
      <div className={`sim-band-verdict sim-tone-${oddsTone}`}>
        <b>{odds}%</b>
        <span>
          chance of hitting your <strong>{formatDate(confidence.planFinish)}</strong> plan date
        </span>
      </div>

      <div
        className="sim-band-track"
        role="img"
        aria-label={`Likely finish between ${confidence.p10} and ${confidence.p90}; P50 ${confidence.p50}, P80 ${confidence.p80}`}
      >
        <span className="sim-band-range" style={{ left: `${pos(confidence.p10)}%`, right: `${100 - pos(confidence.p90)}%` }} />
        <span className="sim-band-tick sim-band-p50" style={{ left: `${pos(confidence.p50)}%` }} />
        <span className="sim-band-tick sim-band-p80" style={{ left: `${pos(confidence.p80)}%` }} />
        <span className="sim-band-plan" style={{ left: `${pos(confidence.planFinish)}%` }} />
      </div>

      <div className="sim-band-legend">
        <div className="sim-band-key sim-band-key-plan">
          <span>Your plan</span>
          <b>{formatDate(confidence.planFinish)}</b>
        </div>
        <div className="sim-band-key sim-band-key-p50">
          <span>P50 · coin-flip</span>
          <b>{formatDate(confidence.p50)}</b>
        </div>
        <div className="sim-band-key sim-band-key-p80">
          <span>P80 · confident</span>
          <b>{formatDate(confidence.p80)}</b>
        </div>
      </div>

      <p className="sim-forecastIQ-method">{confidence.method}</p>
    </div>
  );
}

function ForecastIQPanel({ forecastIQ }: { forecastIQ: ScheduleForecastIQ }) {
  const late = forecastIQ.slipDays > 0;
  const tone = forecastIQ.status === "on_track" || forecastIQ.status === "complete" ? "good" : forecastIQ.slipDays > 20 ? "bad" : "warn";
  const slipText =
    forecastIQ.slipDays === 0
      ? "on plan"
      : late
        ? `${forecastIQ.slipDays} day${forecastIQ.slipDays === 1 ? "" : "s"} late`
        : `${Math.abs(forecastIQ.slipDays)} day${Math.abs(forecastIQ.slipDays) === 1 ? "" : "s"} early`;

  return (
    <div className={`sim-forecastIQ sim-tone-${tone}`}>
      <div className="sim-forecastIQ-head">
        <CalendarClock size={16} aria-hidden="true" />
        <strong>ForecastIQ completion</strong>
        <span className={`sim-forecastIQ-badge sim-tone-${tone}`}>
          {late ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}
          {FORECASTIQ_LABEL[forecastIQ.status]}
        </span>
      </div>
      <div className="sim-forecastIQ-dates">
        <div>
          <span>Planned finish</span>
          <b>{formatDate(forecastIQ.plannedFinish)}</b>
        </div>
        <div className="sim-forecastIQ-arrow" aria-hidden="true">
          →
        </div>
        <div>
          <span>Projected finish</span>
          <b className="sim-forecastIQ-proj">{formatDate(forecastIQ.projectedFinish)}</b>
        </div>
        <div className="sim-forecastIQ-slip">
          <span>Variance</span>
          <b>{slipText}</b>
        </div>
      </div>
      <div className="sim-forecastIQ-meter">
        <div className="sim-forecastIQ-meter-track">
          <span className="sim-forecastIQ-meter-done" style={{ width: `${forecastIQ.percentComplete}%` }} />
          <span className="sim-forecastIQ-meter-time" style={{ left: `${forecastIQ.percentTimeElapsed}%` }} />
        </div>
        <div className="sim-forecastIQ-meter-legend">
          <span>{forecastIQ.percentComplete}% complete</span>
          <span>{forecastIQ.percentTimeElapsed}% of time elapsed</span>
        </div>
      </div>
      {forecastIQ.confidence ? (
        <ConfidenceBand confidence={forecastIQ.confidence} />
      ) : (
        <p className="sim-forecastIQ-method">{forecastIQ.method}</p>
      )}
    </div>
  );
}

function FindingsList({ health }: { health: ScheduleHealth }) {
  if (health.findings.length === 0) {
    return (
      <div className="sim-findings-clean">
        <CheckCircle2 size={16} aria-hidden="true" />
        No structural issues found — logic, durations, and resourcing all look clean.
      </div>
    );
  }
  return (
    <div className="sim-findings">
      {health.findings.map((finding) => (
        <div className={`sim-finding sim-sev-${finding.severity}`} key={finding.id}>
          <div className="sim-finding-head">
            <span className="sim-finding-dot" aria-hidden="true" />
            <strong>{finding.title}</strong>
            <span className="sim-finding-sev">{finding.severity}</span>
          </div>
          <p>{finding.detail}</p>
          {finding.sample.length > 0 && (
            <div className="sim-finding-codes">
              {finding.sample.map((code) => (
                <code key={code}>{code}</code>
              ))}
              {finding.count > finding.sample.length && <span>+{finding.count - finding.sample.length} more</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** The full report shown after import — the day-one value payoff. */
function HealthReport({ health }: { health: ScheduleHealth }) {
  const tone = GRADE_TONE[health.grade];
  return (
    <div className="sim-health">
      <div className="sim-health-hero">
        <ScoreRing score={health.score} tone={tone} />
        <div className="sim-health-hero-copy">
          <span className={`sim-grade sim-tone-${tone}`}>{health.grade}</span>
          <h3>Schedule health check</h3>
          <p>{health.headline}</p>
        </div>
      </div>

      <ForecastIQPanel forecastIQ={health.forecastIQ} />

      <div className="sim-health-stats">
        <div>
          <b>{health.stats.activities.toLocaleString()}</b>
          <span>activities</span>
        </div>
        <div>
          <b>{health.stats.complete.toLocaleString()}</b>
          <span>complete</span>
        </div>
        <div>
          <b>{health.stats.inProgress.toLocaleString()}</b>
          <span>in progress</span>
        </div>
        <div>
          <b>{health.stats.notStarted.toLocaleString()}</b>
          <span>not started</span>
        </div>
        <div>
          <b>{health.stats.relationships.toLocaleString()}</b>
          <span>links</span>
        </div>
      </div>

      <FindingsList health={health} />
    </div>
  );
}

/** Compact score + headline + one-line forecastIQ, shown on the preview so value
 *  lands before the user commits. */
function HealthTeaser({ health }: { health: ScheduleHealth }) {
  const tone = GRADE_TONE[health.grade];
  return (
    <div className={`sim-teaser sim-tone-${tone}`}>
      <ScoreRing score={health.score} tone={tone} />
      <div className="sim-teaser-copy">
        <span className={`sim-grade sim-tone-${tone}`}>{health.grade}</span>
        <p>{health.headline}</p>
      </div>
    </div>
  );
}
