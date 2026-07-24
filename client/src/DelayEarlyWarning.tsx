import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, BellRing, ChevronDown, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { fetchDelayEarlyWarning, notifyDelayImpact, type DelayEarlyWarning as EarlyWarning, type DelayRisk } from "./api";

/**
 * DelayIQ early-warning readout — the proactive half of the schedule loop.
 * "Drywall trending 3 days behind — here's what it pushes." Read-only: it never
 * changes the plan (that's the variance drawer's job); it just tells you what's
 * heading for trouble while there's still room to plan around it.
 */

const SEV_TONE: Record<DelayRisk["severity"], string> = { High: "bad", Medium: "warn", Low: "low" };

function formatDate(iso: string): string {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function trigger(risk: DelayRisk): string {
  return risk.kind === "overdue_start"
    ? `Overdue to start — ${risk.varianceDays} working day${risk.varianceDays === 1 ? "" : "s"} late`
    : `Trending ${risk.varianceDays} working day${risk.varianceDays === 1 ? "" : "s"} behind`;
}

function RiskCard({ risk }: { risk: DelayRisk }) {
  const [open, setOpen] = useState(false);
  const [notifyState, setNotifyState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const tone = SEV_TONE[risk.severity];

  const notify = async () => {
    setNotifyState("sending");
    try {
      await notifyDelayImpact(risk.jobId);
      setNotifyState("done");
    } catch {
      setNotifyState("error");
    }
  };

  return (
    <div className={`diq-risk diq-tone-${tone}`}>
      <div className="diq-risk-head">
        <span className="diq-sev" aria-label={`${risk.severity} severity`}>
          <TriangleAlert size={14} aria-hidden="true" />
          {risk.severity}
        </span>
        <div className="diq-risk-title">
          <strong>{risk.jobName}</strong>
          <span>{risk.trade}</span>
        </div>
        {risk.projectSlipDays > 0 ? (
          <span className="diq-slip">Finish +{risk.projectSlipDays}d</span>
        ) : (
          <span className="diq-slip diq-slip-soft">Float absorbing</span>
        )}
      </div>

      <p className="diq-trigger">
        {trigger(risk)}
        {risk.kind === "behind_pace" && (
          <em>
            {" "}
            · {risk.percentComplete}% done vs {risk.plannedPercent}% planned
          </em>
        )}
        <span className="diq-dates">
          {formatDate(risk.currentEnd)} <ArrowRight size={12} aria-hidden="true" /> {formatDate(risk.forecastEnd)}
        </span>
      </p>

      {risk.affectedTrades.length > 0 ? (
        <p className="diq-pushes">
          Pushes{" "}
          {risk.affectedTrades.map((t, i) => (
            <span key={t} className="diq-trade">
              {t}
              {i < risk.affectedTrades.length - 1 ? "" : ""}
            </span>
          ))}
        </p>
      ) : (
        <p className="diq-pushes diq-pushes-none">Nothing downstream yet — it slips only itself for now.</p>
      )}

      <div className="diq-actions">
        {risk.downstream.length > 0 && (
          <button type="button" className={`diq-expand ${open ? "open" : ""}`} onClick={() => setOpen((v) => !v)}>
            <ChevronDown size={15} aria-hidden="true" />
            {open ? "Hide" : "See"} what it pushes ({risk.downstream.length})
          </button>
        )}
        {notifyState === "done" ? (
          <span className="diq-notified">
            <CheckCircle2 size={15} aria-hidden="true" /> Affected trades notified
          </span>
        ) : (
          <button type="button" className="diq-notify" onClick={notify} disabled={notifyState === "sending"}>
            {notifyState === "sending" ? (
              <Loader2 size={15} className="spin" aria-hidden="true" />
            ) : (
              <BellRing size={15} aria-hidden="true" />
            )}
            {notifyState === "error" ? "Retry notify" : "Notify affected trades"}
          </button>
        )}
      </div>

      {open && risk.downstream.length > 0 && (
        <table className="diq-chain">
          <thead>
            <tr>
              <th>Downstream activity</th>
              <th>Trade</th>
              <th>Pushed to</th>
              <th>Slip</th>
            </tr>
          </thead>
          <tbody>
            {risk.downstream.map((push) => (
              <tr key={push.jobId} className={push.critical ? "diq-critical" : ""}>
                <td>{push.jobName}</td>
                <td>{push.trade}</td>
                <td>
                  {formatDate(push.currentEnd)} → <b>{formatDate(push.pushedEnd)}</b>
                </td>
                <td>
                  +{push.shiftDays}d{push.critical && <span className="diq-crit-tag">critical</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function DelayEarlyWarning() {
  const [warning, setWarning] = useState<EarlyWarning | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchDelayEarlyWarning()
      .then((data) => {
        if (alive) setWarning(data);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Unable to load early warnings.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const risks = warning?.risks ?? [];
  const high = risks.filter((r) => r.severity === "High").length;

  return (
    <section className="diq-panel span-2" data-reveal aria-label="DelayIQ early warning">
      <header className="diq-panel-head">
        <div>
          <span className="diq-kicker">
            <span className="diq-kicker-dot" />
            DelayIQ · Early warning
          </span>
          <h2>What&rsquo;s trending behind</h2>
        </div>
        {!loading && !error && (
          <span className="diq-count">
            {risks.length === 0 ? "All clear" : `${risks.length} at risk${high > 0 ? ` · ${high} high` : ""}`}
          </span>
        )}
      </header>

      {loading ? (
        <div className="diq-loading">
          <Loader2 className="spin" size={20} aria-hidden="true" /> Scanning the schedule…
        </div>
      ) : error ? (
        <div className="diq-error">
          <AlertTriangle size={18} aria-hidden="true" /> {error}
        </div>
      ) : risks.length === 0 ? (
        <div className="diq-clear">
          <CheckCircle2 size={22} aria-hidden="true" />
          <div>
            <strong>Nothing trending behind.</strong>
            <span>Every in-progress activity is keeping pace with its plan as of {warning ? formatDate(warning.asOf) : "today"}.</span>
          </div>
        </div>
      ) : (
        <>
          <p className="diq-lead">
            An early read from the live schedule — the plan hasn&rsquo;t changed. Warn the trades now, or resolve the
            slip in the variance drawer.
          </p>
          <div className="diq-list">
            {risks.map((risk) => (
              <RiskCard key={risk.jobId} risk={risk} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
