import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  DollarSign,
  Download,
  FileCheck2,
  Gauge,
  HardHat,
  Layers,
  Link2,
  MapPin,
  Plus,
  Repeat,
  RefreshCw,
  Scale,
  Send,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
  WifiOff,
  Wrench,
  X
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { BootstrapPayload } from "@buildflow/shared";
import { weekDays } from "./scheduleUtils";
import {
  BURDEN_RATE,
  OVERTIME_MULTIPLIER,
  accumulate,
  breakdownByCrew,
  breakdownByPhase,
  breakdownByProject,
  breakdownByWorker,
  buildTimecardModel,
  crewMeta,
  emptyTotals,
  entryHours,
  formatCurrency,
  formatHours,
  formatRate,
  laborCostTrend,
  laborForecastIQ,
  productivityTrend,
  rateForRole,
  tcWorkDays,
  totalsFor,
  type TcApprovalState,
  type TcBreakdownRow,
  type TcEntry,
  type TcTimecard
} from "./timecardModel";

// ---------------------------------------------------------------------------
// Shared presentational helpers
// ---------------------------------------------------------------------------

type PillTone = "green" | "blue" | "amber" | "red" | "violet" | "slate";

function TcPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return <span className={`tc-pill ${tone}`}>{children}</span>;
}

const entryStatusTone: Record<TcEntry["status"], PillTone> = {
  Approved: "green",
  Submitted: "blue",
  Draft: "slate",
  Flagged: "red"
};

const approvalTone: Record<TcApprovalState, PillTone> = {
  Approved: "green",
  Pending: "amber",
  Awaiting: "slate",
  Rejected: "red"
};

function HoursBar({ value, max, tone = "blue" }: { value: number; max: number; tone?: PillTone }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <span className="tc-bar" aria-hidden="true">
      <i className={tone} style={{ width: `${pct}%` } as CSSProperties} />
    </span>
  );
}

function TcStat({
  icon: Icon,
  tone,
  label,
  value,
  hint
}: {
  icon: typeof Clock;
  tone: PillTone;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <article className="tc-stat">
      <span className={`tc-stat-icon ${tone}`}>
        <Icon size={22} />
      </span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <em>{hint}</em>
      </div>
    </article>
  );
}

function SectionCard({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
  className = ""
}: {
  title: string;
  subtitle?: string;
  icon?: typeof Clock;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`tc-card ${className}`}>
      <header className="tc-card-head">
        <div>
          <h3>
            {Icon && <Icon size={17} />}
            {title}
          </h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

const chartGrid = "#dde6ef";
const chartTick = { fill: "#94a4b8", fontSize: 12 };

// ---------------------------------------------------------------------------
// TimeCard page
// ---------------------------------------------------------------------------

type TabId = "entry" | "cost" | "crew" | "approvals" | "integrations" | "reporting" | "compliance";

const TABS: Array<{ id: TabId; label: string; icon: typeof Clock }> = [
  { id: "entry", label: "Time Entry", icon: Clock },
  { id: "cost", label: "Labor Cost", icon: DollarSign },
  { id: "crew", label: "Crew & Assignment", icon: Users },
  { id: "approvals", label: "Approvals", icon: ClipboardCheck },
  { id: "integrations", label: "Integrations", icon: Link2 },
  { id: "reporting", label: "Reporting", icon: TrendingUp },
  { id: "compliance", label: "Compliance", icon: ShieldCheck }
];

export function TimeCardPage({ data }: { data: BootstrapPayload }) {
  const model = useMemo(() => buildTimecardModel(data), [data]);
  const [tab, setTab] = useState<TabId>("entry");
  const [entries, setEntries] = useState<TcEntry[]>(model.entries);
  const [timecards, setTimecards] = useState<TcTimecard[]>(model.timecards);
  const [audit, setAudit] = useState(model.audit);

  const week = model.weekLabel;
  const totals = useMemo(() => totalsFor(entries, model.workerById), [entries, model.workerById]);
  const otPendingHours = timecards
    .filter((card) => card.overtimePending)
    .reduce((sum, card) => sum + card.overtimeHours, 0);
  const pendingApprovals = timecards.filter((card) =>
    card.chain.some((step) => step.state === "Pending" || step.state === "Rejected")
  ).length;
  const weeklyBudgetHours = model.projects.reduce((sum, project) => sum + Math.round(project.budgetHours / 26), 0);
  const budgetPct = Math.round((totals.totalHours / weeklyBudgetHours) * 100);

  return (
    <div className="page-stack tc-page">
      <div className="page-title tc-page-title">
        <div>
          <h1>TimeCard</h1>
          <p>Daily labor hours, cost, approvals, and certified-payroll compliance · {week}</p>
        </div>
        <div className="tc-title-actions">
          <span className="tc-week-chip">
            <CalendarClock size={16} />
            {week}
          </span>
          <button type="button" className="tc-btn ghost">
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      <section className="tc-stat-grid" aria-label="TimeCard summary">
        <TcStat
          icon={Clock}
          tone="blue"
          label="Hours logged this week"
          value={formatHours(totals.totalHours)}
          hint={`${formatHours(totals.regularHours)} reg · ${formatHours(totals.overtimeHours)} OT`}
        />
        <TcStat
          icon={DollarSign}
          tone="green"
          label="Burdened labor cost"
          value={formatCurrency(totals.burdenedCost, true)}
          hint={`${formatCurrency(totals.baseCost, true)} base + ${Math.round(BURDEN_RATE * 100)}% burden`}
        />
        <TcStat
          icon={Timer}
          tone="amber"
          label="Overtime pending approval"
          value={formatHours(otPendingHours)}
          hint={`across ${timecards.filter((card) => card.overtimePending).length} timecards`}
        />
        <TcStat
          icon={ClipboardCheck}
          tone="violet"
          label="Timecards awaiting approval"
          value={String(pendingApprovals)}
          hint={`${budgetPct}% of weekly budgeted hours used`}
        />
      </section>

      <nav className="tc-tabs" aria-label="TimeCard sections">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={`tc-tab${tab === item.id ? " active" : ""}`}
              aria-pressed={tab === item.id}
              onClick={() => setTab(item.id)}
            >
              <Icon size={17} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {tab === "entry" && <TimeEntryTab model={model} entries={entries} setEntries={setEntries} />}
      {tab === "cost" && <LaborCostTab model={model} entries={entries} />}
      {tab === "crew" && <CrewTab model={model} entries={entries} />}
      {tab === "approvals" && (
        <ApprovalsTab
          model={model}
          timecards={timecards}
          setTimecards={setTimecards}
          audit={audit}
          setAudit={setAudit}
        />
      )}
      {tab === "integrations" && <IntegrationsTab model={model} data={data} />}
      {tab === "reporting" && <ReportingTab model={model} entries={entries} />}
      {tab === "compliance" && <ComplianceTab model={model} entries={entries} />}
    </div>
  );
}

type Model = ReturnType<typeof buildTimecardModel>;

// ---------------------------------------------------------------------------
// 1. Time Entry & Submission
// ---------------------------------------------------------------------------

const entryTemplates: Array<{ id: string; label: string; crewId: string; regular: number; overtime: number }> = [
  { id: "concrete", label: "Concrete pour day", crewId: "cc1", regular: 8, overtime: 1 },
  { id: "framing", label: "Steel & framing", crewId: "fc2", regular: 8, overtime: 0 },
  { id: "utility", label: "Underground utilities", crewId: "uc3", regular: 8, overtime: 2 },
  { id: "paving", label: "Paving shift", crewId: "pc4", regular: 8, overtime: 2 },
  { id: "electrical", label: "Electrical rough-in", crewId: "ec5", regular: 8, overtime: 0 }
];

function TimeEntryTab({
  model,
  entries,
  setEntries
}: {
  model: Model;
  entries: TcEntry[];
  setEntries: (updater: (prev: TcEntry[]) => TcEntry[]) => void;
}) {
  const firstWorker = model.workers[0];
  const [workerId, setWorkerId] = useState(firstWorker.id);
  const [projectId, setProjectId] = useState(crewMeta(firstWorker.crewId)?.projectId ?? model.projects[0].id);
  const [regular, setRegular] = useState(8);
  const [overtime, setOvertime] = useState(0);
  const [task, setTask] = useState(crewMeta(firstWorker.crewId)?.task ?? "");
  const [photo, setPhoto] = useState(true);
  const [location, setLocation] = useState(true);
  const [template, setTemplate] = useState("");
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const worker = model.workerById.get(workerId) ?? firstWorker;
  const crew = crewMeta(worker.crewId);
  const unsynced = entries.filter((entry) => !entry.synced);

  const applyTemplate = (id: string) => {
    setTemplate(id);
    const preset = entryTemplates.find((item) => item.id === id);
    if (!preset) return;
    const crewLead = model.workers.find((item) => item.crewId === preset.crewId);
    if (crewLead) {
      setWorkerId(crewLead.id);
      setProjectId(crewMeta(preset.crewId)?.projectId ?? projectId);
      setTask(crewMeta(preset.crewId)?.task ?? task);
    }
    setRegular(preset.regular);
    setOvertime(preset.overtime);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const id = `manual-${Date.now()}`;
    const entry: TcEntry = {
      id,
      workerId: worker.id,
      crewId: worker.crewId,
      projectId,
      date: tcWorkDays[3].date,
      phase: crew?.phase ?? "Field Work",
      task: task || crew?.task || "Field work",
      regularHours: Number(regular) || 0,
      overtimeHours: Number(overtime) || 0,
      source: "Manual",
      photo,
      location,
      synced: true,
      status: "Submitted"
    };
    setEntries((prev) => [entry, ...prev]);
    setJustAdded(id);
    window.setTimeout(() => setJustAdded((current) => (current === id ? null : current)), 2400);
  };

  const syncAll = () => {
    setEntries((prev) =>
      prev.map((entry) => (entry.synced ? entry : { ...entry, synced: true, status: "Submitted" as const }))
    );
  };

  const recent = [...entries]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 12);

  return (
    <div className="tc-body tc-entry-grid">
      <SectionCard title="Log time" subtitle="Crew leads log by job, phase, and task" icon={Plus} className="tc-entry-form-card">
        <form className="tc-entry-form" onSubmit={submit}>
          <label className="tc-field tc-field-wide">
            <span>Timecard template</span>
            <select value={template} onChange={(event) => applyTemplate(event.target.value)}>
              <option value="">Start blank</option>
              {entryTemplates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="tc-field">
            <span>Worker</span>
            <select
              value={workerId}
              onChange={(event) => {
                setWorkerId(event.target.value);
                const nextCrew = crewMeta(model.workerById.get(event.target.value)?.crewId ?? "");
                if (nextCrew) {
                  setProjectId(nextCrew.projectId);
                  setTask(nextCrew.task);
                }
              }}
            >
              {model.crews.map((crewItem) => (
                <optgroup key={crewItem.id} label={crewItem.name}>
                  {model.workers
                    .filter((item) => item.crewId === crewItem.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.role}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="tc-field">
            <span>Project</span>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              {model.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="tc-field tc-field-wide">
            <span>Task / phase</span>
            <input value={task} onChange={(event) => setTask(event.target.value)} placeholder="Describe the work" />
          </label>
          <label className="tc-field">
            <span>Regular hours</span>
            <input type="number" min={0} max={16} step={0.5} value={regular} onChange={(event) => setRegular(Number(event.target.value))} />
          </label>
          <label className="tc-field">
            <span>Overtime hours</span>
            <input type="number" min={0} max={12} step={0.5} value={overtime} onChange={(event) => setOvertime(Number(event.target.value))} />
          </label>
          <div className="tc-verify-row">
            <button type="button" className={`tc-verify${photo ? " on" : ""}`} onClick={() => setPhoto((value) => !value)}>
              <Camera size={16} />
              Photo {photo ? "attached" : "off"}
            </button>
            <button type="button" className={`tc-verify${location ? " on" : ""}`} onClick={() => setLocation((value) => !value)}>
              <MapPin size={16} />
              GPS {location ? "verified" : "off"}
            </button>
          </div>
          <div className="tc-entry-submit">
            <span className="tc-entry-cost">
              Est.{" "}
              {formatCurrency(
                (Number(regular) || 0) * worker.baseRate +
                  (Number(overtime) || 0) * worker.baseRate * OVERTIME_MULTIPLIER
              )}
              <em>{formatRate(worker.baseRate)} · {worker.role}</em>
            </span>
            <button type="submit" className="tc-btn primary">
              <Plus size={16} />
              Add entry
            </button>
          </div>
        </form>
        {justAdded && (
          <p className="tc-inline-success">
            <CheckCircle2 size={16} /> Entry added and submitted for approval.
          </p>
        )}
        <div className="tc-quick-chips" aria-label="Mobile quick entry">
          <span className="tc-quick-label">Jobsite quick add</span>
          {["Clock 8 hrs", "Add 30 min break", "Start OT", "Copy yesterday"].map((chip) => (
            <button type="button" key={chip} className="tc-quick-chip">
              {chip}
            </button>
          ))}
        </div>
      </SectionCard>

      <div className="tc-entry-side">
        <div className={`tc-offline-banner${unsynced.length ? " pending" : " synced"}`}>
          <span className="tc-offline-icon">{unsynced.length ? <WifiOff size={18} /> : <CheckCircle2 size={18} />}</span>
          <div>
            <strong>{unsynced.length ? `${unsynced.length} entries stored offline` : "All entries synced"}</strong>
            <em>{unsynced.length ? "Captured on the jobsite — will sync when connected." : "Local device is up to date with BuildFlow."}</em>
          </div>
          {unsynced.length > 0 && (
            <button type="button" className="tc-btn small" onClick={syncAll}>
              <RefreshCw size={15} />
              Sync now
            </button>
          )}
        </div>

        <SectionCard title="Recent entries" subtitle={`${entries.length} logged this week`} icon={Clock} className="tc-entries-card">
          <div className="tc-table-scroll">
            <table className="tc-table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Project · Phase</th>
                  <th>Day</th>
                  <th className="num">Reg</th>
                  <th className="num">OT</th>
                  <th>Verify</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((entry) => {
                  const entryWorker = model.workerById.get(entry.workerId);
                  const project = model.projects.find((item) => item.id === entry.projectId);
                  const day = weekDays.find((item) => item.date === entry.date);
                  return (
                    <tr key={entry.id} className={justAdded === entry.id ? "tc-row-new" : ""}>
                      <td>
                        <span className="tc-worker-cell">
                          <i className="tc-avatar">{entryWorker?.initials}</i>
                          <span>
                            <strong>{entryWorker?.name}</strong>
                            <em>{entryWorker?.role}</em>
                          </span>
                        </span>
                      </td>
                      <td>
                        <strong className="tc-cell-strong">{project?.name}</strong>
                        <em className="tc-cell-em">{entry.phase}</em>
                      </td>
                      <td>{day?.label ?? entry.date}</td>
                      <td className="num">{entry.regularHours}</td>
                      <td className="num">{entry.overtimeHours ? <b className="tc-ot">{entry.overtimeHours}</b> : "—"}</td>
                      <td>
                        <span className="tc-verify-icons">
                          <i className={entry.photo ? "on" : ""} title="Photo">
                            <Camera size={14} />
                          </i>
                          <i className={entry.location ? "on" : ""} title="Location">
                            <MapPin size={14} />
                          </i>
                        </span>
                      </td>
                      <td>
                        <TcPill tone={entry.synced ? entryStatusTone[entry.status] : "slate"}>
                          {entry.synced ? entry.status : "Offline"}
                        </TcPill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Labor Cost Tracking
// ---------------------------------------------------------------------------

type CostDimension = "project" | "crew" | "phase" | "worker";

function LaborCostTab({ model, entries }: { model: Model; entries: TcEntry[] }) {
  const [dimension, setDimension] = useState<CostDimension>("project");
  const rows = useMemo<TcBreakdownRow[]>(() => {
    if (dimension === "crew") return breakdownByCrew(entries, model.crews, model.workerById);
    if (dimension === "phase") return breakdownByPhase(entries, model.workerById);
    if (dimension === "worker") return breakdownByWorker(entries, model.workers, model.workerById);
    return breakdownByProject(entries, model.workerById);
  }, [dimension, entries, model]);

  const maxCost = Math.max(...rows.map((row) => row.totals.burdenedCost), 1);
  const totals = totalsFor(entries, model.workerById);
  const otCost = entries.reduce((sum, entry) => {
    const worker = model.workerById.get(entry.workerId);
    return worker ? sum + entry.overtimeHours * worker.baseRate * OVERTIME_MULTIPLIER : sum;
  }, 0);

  const rateRows = useMemo(() => {
    const roles = new Map<string, { count: number; category: string; base: number; prevailing: number }>();
    model.workers.forEach((worker) => {
      const rate = rateForRole(worker.role);
      const existing = roles.get(worker.role);
      if (existing) existing.count += 1;
      else roles.set(worker.role, { count: 1, category: rate.category, base: rate.base, prevailing: rate.prevailing });
    });
    return Array.from(roles.entries()).sort((a, b) => b[1].base - a[1].base);
  }, [model.workers]);

  const flagged = entries.filter((entry) => entry.status === "Flagged");

  return (
    <div className="tc-body tc-cost-grid">
      <SectionCard
        title="Labor cost breakdown"
        subtitle="Regular, overtime, and burdened cost"
        icon={DollarSign}
        className="tc-span-2"
        action={
          <div className="tc-seg" role="tablist" aria-label="Breakdown dimension">
            {(["project", "crew", "phase", "worker"] as CostDimension[]).map((dim) => (
              <button key={dim} type="button" className={dimension === dim ? "active" : ""} onClick={() => setDimension(dim)}>
                {dim[0].toUpperCase() + dim.slice(1)}
              </button>
            ))}
          </div>
        }
      >
        <div className="tc-table-scroll">
          <table className="tc-table tc-cost-table">
            <thead>
              <tr>
                <th>{dimension[0].toUpperCase() + dimension.slice(1)}</th>
                <th className="num">Reg</th>
                <th className="num">OT</th>
                <th className="num">Hours</th>
                <th className="num">Base</th>
                <th className="num">Burdened</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <strong className="tc-cell-strong">{row.label}</strong>
                    {row.sublabel && <em className="tc-cell-em">{row.sublabel}</em>}
                  </td>
                  <td className="num">{Math.round(row.totals.regularHours)}</td>
                  <td className="num">{row.totals.overtimeHours ? <b className="tc-ot">{Math.round(row.totals.overtimeHours)}</b> : "—"}</td>
                  <td className="num">{Math.round(row.totals.totalHours)}</td>
                  <td className="num">{formatCurrency(row.totals.baseCost)}</td>
                  <td className="num">
                    <strong>{formatCurrency(row.totals.burdenedCost)}</strong>
                  </td>
                  <td className="tc-share">
                    <HoursBar value={row.totals.burdenedCost} max={maxCost} tone="green" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num">{Math.round(totals.regularHours)}</td>
                <td className="num">{Math.round(totals.overtimeHours)}</td>
                <td className="num">{Math.round(totals.totalHours)}</td>
                <td className="num">{formatCurrency(totals.baseCost)}</td>
                <td className="num">
                  <strong>{formatCurrency(totals.burdenedCost)}</strong>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Cost composition" subtitle="Where the labor dollar goes" icon={Layers}>
        <ul className="tc-composition">
          <li>
            <span>Regular time</span>
            <strong>{formatCurrency(totals.baseCost - otCost)}</strong>
          </li>
          <li>
            <span>
              Overtime <TcPill tone="amber">1.5×</TcPill>
            </span>
            <strong>{formatCurrency(otCost)}</strong>
          </li>
          <li>
            <span>
              Burden <TcPill tone="violet">{Math.round(BURDEN_RATE * 100)}%</TcPill>
            </span>
            <strong>{formatCurrency(totals.burdenedCost - totals.baseCost)}</strong>
          </li>
          <li className="tc-composition-total">
            <span>Fully burdened</span>
            <strong>{formatCurrency(totals.burdenedCost)}</strong>
          </li>
        </ul>
        <p className="tc-note">
          Burden adds benefits, payroll taxes, and workers' comp on top of base wages so project cost reflects true labor spend.
        </p>
      </SectionCard>

      <SectionCard title="Project profitability impact" subtitle="Actual burdened labor vs weekly budget" icon={Gauge} className="tc-span-2">
        <div className="tc-budget-list">
          {breakdownByProject(entries, model.workerById).map((row) => {
            const budget = row.budgetHours ?? 0;
            const pct = budget > 0 ? Math.round((row.totals.totalHours / budget) * 100) : 0;
            const over = pct > 100;
            return (
              <div className="tc-budget-row" key={row.key}>
                <div className="tc-budget-label">
                  <strong>{row.label}</strong>
                  <em>{row.sublabel}</em>
                </div>
                <div className="tc-budget-track">
                  <span className="tc-budget-bar">
                    <i className={over ? "over" : "under"} style={{ width: `${Math.min(100, pct)}%` } as CSSProperties} />
                  </span>
                  <span className="tc-budget-meta">
                    {Math.round(row.totals.totalHours)} / {budget} hrs
                    <b className={over ? "over" : "under"}>{over ? `+${pct - 100}% over` : `${pct}% used`}</b>
                  </span>
                </div>
                <strong className="tc-budget-cost">{formatCurrency(row.totals.burdenedCost)}</strong>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Hourly rates by role" subtitle="Base and prevailing-wage scales" icon={Wrench}>
        <div className="tc-table-scroll">
          <table className="tc-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Class</th>
                <th className="num">Crew</th>
                <th className="num">Base</th>
                <th className="num">Prevailing</th>
              </tr>
            </thead>
            <tbody>
              {rateRows.map(([role, info]) => (
                <tr key={role}>
                  <td>
                    <strong className="tc-cell-strong">{role}</strong>
                  </td>
                  <td>
                    <TcPill tone="slate">{info.category}</TcPill>
                  </td>
                  <td className="num">{info.count}</td>
                  <td className="num">{formatRate(info.base)}</td>
                  <td className="num">{formatRate(info.prevailing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Overtime flags" subtitle="Entries above the 8-hour daily threshold" icon={AlertTriangle}>
        {flagged.length === 0 ? (
          <p className="tc-empty">No overtime discrepancies flagged this week.</p>
        ) : (
          <ul className="tc-flag-list">
            {flagged.slice(0, 6).map((entry) => {
              const worker = model.workerById.get(entry.workerId);
              const project = model.projects.find((item) => item.id === entry.projectId);
              return (
                <li key={entry.id}>
                  <span className="tc-flag-dot" />
                  <div>
                    <strong>
                      {worker?.name} · <b className="tc-ot">{entry.overtimeHours} OT</b>
                    </strong>
                    <em>
                      {project?.name} · {weekDays.find((day) => day.date === entry.date)?.label}
                    </em>
                  </div>
                  <TcPill tone="red">Review</TcPill>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Crew & Assignment Management
// ---------------------------------------------------------------------------

function CrewTab({ model, entries }: { model: Model; entries: TcEntry[] }) {
  return (
    <div className="tc-body">
      <SectionCard title="Attendance verification" subtitle="Scheduled crew vs. who actually logged time" icon={UserCheck} className="tc-span-2">
        <div className="tc-attend-grid">
          {model.attendance.map((row) => {
            const pct = row.scheduled > 0 ? Math.round((row.actual / row.scheduled) * 100) : 0;
            return (
              <div className="tc-attend-card" key={row.crewId}>
                <header>
                  <strong>{row.crewName}</strong>
                  <TcPill tone={pct >= 100 ? "green" : pct >= 80 ? "amber" : "red"}>{pct}% present</TcPill>
                </header>
                <div className="tc-attend-count">
                  <span>
                    <b>{row.actual}</b> / {row.scheduled} on site
                  </span>
                  {row.replacements > 0 && (
                    <em className="tc-replace">
                      <Repeat size={13} /> {row.replacements} sub{row.replacements > 1 ? "s" : ""}
                    </em>
                  )}
                </div>
                <HoursBar value={row.actual} max={row.scheduled} tone={pct >= 100 ? "green" : "amber"} />
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Crew rosters & skills" subtitle="Who performed which tasks" icon={Users} className="tc-span-2">
        <div className="tc-roster-grid">
          {model.crews.map((crew) => {
            const meta = crewMeta(crew.id);
            const project = model.projects.find((item) => item.id === crew.projectId);
            const crewWorkers = model.workers.filter((worker) => worker.crewId === crew.id);
            const crewHours = totalsFor(entries.filter((entry) => entry.crewId === crew.id), model.workerById);
            return (
              <div className="tc-roster-card" key={crew.id}>
                <header>
                  <div>
                    <strong>{crew.name}</strong>
                    <em>
                      {project?.name} · {meta?.task}
                    </em>
                  </div>
                  <span className="tc-roster-hours">{formatHours(crewHours.totalHours)}</span>
                </header>
                <ul className="tc-roster-list">
                  {crewWorkers.map((worker) => {
                    const workerHours = totalsFor(
                      entries.filter((entry) => entry.workerId === worker.id),
                      model.workerById
                    );
                    return (
                      <li key={worker.id}>
                        <i className="tc-avatar sm">{worker.initials}</i>
                        <span className="tc-roster-name">
                          <strong>{worker.name}</strong>
                          <em>{worker.role}</em>
                        </span>
                        <span className="tc-skill-tags">
                          {worker.skills.slice(0, 2).map((skill) => (
                            <b key={skill}>{skill}</b>
                          ))}
                        </span>
                        <span className="tc-roster-hrs">{Math.round(workerHours.totalHours)}h</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Crew productivity" subtitle="Production output per labor hour" icon={Gauge} className="tc-span-2">
        <div className="tc-table-scroll">
          <table className="tc-table">
            <thead>
              <tr>
                <th>Crew</th>
                <th className="num">Hours</th>
                <th className="num">Output</th>
                <th className="num">Per hour</th>
                <th>vs target</th>
              </tr>
            </thead>
            <tbody>
              {model.productivity.map((row) => {
                const ratio = row.target > 0 ? row.perHour / row.target : 0;
                const good = ratio >= 1;
                return (
                  <tr key={row.crewId}>
                    <td>
                      <strong className="tc-cell-strong">{row.crewName}</strong>
                    </td>
                    <td className="num">{Math.round(row.hours)}</td>
                    <td className="num">
                      {row.output} <em className="tc-unit">{row.unit}</em>
                    </td>
                    <td className="num">{row.perHour.toFixed(2)}</td>
                    <td>
                      <span className="tc-target">
                        <HoursBar value={row.perHour} max={row.target * 1.3} tone={good ? "green" : "amber"} />
                        <b className={good ? "up" : "down"}>{Math.round(ratio * 100)}%</b>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Approval & Workflow
// ---------------------------------------------------------------------------

function ApprovalsTab({
  model,
  timecards,
  setTimecards,
  audit,
  setAudit
}: {
  model: Model;
  timecards: TcTimecard[];
  setTimecards: (updater: (prev: TcTimecard[]) => TcTimecard[]) => void;
  audit: Model["audit"];
  setAudit: (updater: (prev: Model["audit"]) => Model["audit"]) => void;
}) {
  const [filter, setFilter] = useState<"all" | "pending" | "overtime" | "flagged">("pending");

  const logAudit = (action: string, detail: string, tone: Model["audit"][number]["tone"]) => {
    setAudit((prev) => [{ id: `a-${Date.now()}`, at: "Just now", actor: "liam santos", action, detail, tone }, ...prev]);
  };

  const approve = (card: TcTimecard) => {
    const worker = model.workerById.get(card.workerId);
    setTimecards((prev) =>
      prev.map((item) => {
        if (item.id !== card.id) return item;
        const nextIndex = item.chain.findIndex((step) => step.state === "Pending");
        if (nextIndex === -1) return item;
        const chain = item.chain.map((step, index) => {
          if (index === nextIndex) return { ...step, state: "Approved" as TcApprovalState, by: "liam santos", at: "Just now" };
          if (index === nextIndex + 1 && step.state === "Awaiting") return { ...step, state: "Pending" as TcApprovalState };
          return step;
        });
        return { ...item, chain, flagged: false, flagReason: undefined };
      })
    );
    logAudit("Approved timecard", `${worker?.name} · ${model.crews.find((c) => c.id === card.crewId)?.name}`, "green");
  };

  const reject = (card: TcTimecard) => {
    const worker = model.workerById.get(card.workerId);
    setTimecards((prev) =>
      prev.map((item) => {
        if (item.id !== card.id) return item;
        const nextIndex = item.chain.findIndex((step) => step.state === "Pending");
        if (nextIndex === -1) return item;
        const chain = item.chain.map((step, index) =>
          index === nextIndex ? { ...step, state: "Rejected" as TcApprovalState, by: "liam santos", at: "Just now" } : step
        );
        return { ...item, chain, flagged: true, flagReason: "Correction requested by approver" };
      })
    );
    logAudit("Requested correction", `${worker?.name} · sent back for clarification`, "amber");
  };

  const approveOvertime = (card: TcTimecard) => {
    const worker = model.workerById.get(card.workerId);
    setTimecards((prev) => prev.map((item) => (item.id === card.id ? { ...item, overtimePending: false } : item)));
    logAudit("Approved overtime", `${worker?.name} · ${formatHours(card.overtimeHours)} OT cleared for payroll`, "violet");
  };

  const visible = timecards.filter((card) => {
    if (filter === "pending") return card.chain.some((step) => step.state === "Pending" || step.state === "Rejected");
    if (filter === "overtime") return card.overtimePending;
    if (filter === "flagged") return card.flagged;
    return true;
  });

  const stageLabel = (card: TcTimecard) => {
    const pending = card.chain.find((step) => step.state === "Pending" || step.state === "Rejected");
    return pending ? pending.level : "Fully approved";
  };

  return (
    <div className="tc-body tc-approvals-grid">
      <SectionCard
        title="Approval queue"
        subtitle="Crew Lead → Superintendent → Project Manager → Accounting"
        icon={ClipboardCheck}
        action={
          <div className="tc-seg" role="tablist" aria-label="Approval filter">
            {(["pending", "overtime", "flagged", "all"] as const).map((key) => (
              <button key={key} type="button" className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>
                {key[0].toUpperCase() + key.slice(1)}
              </button>
            ))}
          </div>
        }
      >
        {visible.length === 0 ? (
          <p className="tc-empty">Nothing in this queue — every timecard here is cleared. 🎉</p>
        ) : (
          <div className="tc-approval-list">
            {visible.slice(0, 8).map((card) => {
              const worker = model.workerById.get(card.workerId);
              const crew = model.crews.find((item) => item.id === card.crewId);
              const canApprove = card.chain.some((step) => step.state === "Pending");
              return (
                <article className={`tc-approval-card${card.flagged ? " flagged" : ""}`} key={card.id}>
                  <div className="tc-approval-top">
                    <span className="tc-worker-cell">
                      <i className="tc-avatar">{worker?.initials}</i>
                      <span>
                        <strong>{worker?.name}</strong>
                        <em>
                          {crew?.name} · {formatHours(card.regularHours + card.overtimeHours)}
                        </em>
                      </span>
                    </span>
                    <div className="tc-approval-badges">
                      {card.overtimePending && <TcPill tone="amber">OT approval</TcPill>}
                      {card.flagged && <TcPill tone="red">Discrepancy</TcPill>}
                      <TcPill tone="slate">At {stageLabel(card)}</TcPill>
                    </div>
                  </div>

                  <ol className="tc-chain">
                    {card.chain.map((step) => (
                      <li key={step.level} className={`tc-chain-step ${approvalTone[step.state]}`}>
                        <span className="tc-chain-dot">
                          {step.state === "Approved" ? <Check size={12} /> : step.state === "Rejected" ? <X size={12} /> : null}
                        </span>
                        <span className="tc-chain-label">
                          <strong>{step.level}</strong>
                          <em>{step.by ? `${step.by}${step.at ? ` · ${step.at}` : ""}` : step.state}</em>
                        </span>
                      </li>
                    ))}
                  </ol>

                  {card.flagged && card.flagReason && (
                    <p className="tc-flag-reason">
                      <AlertTriangle size={14} /> {card.flagReason}
                    </p>
                  )}

                  <div className="tc-approval-actions">
                    {card.overtimePending && (
                      <button type="button" className="tc-btn small amber" onClick={() => approveOvertime(card)}>
                        <Timer size={15} /> Approve OT
                      </button>
                    )}
                    <button type="button" className="tc-btn small ghost" onClick={() => reject(card)} disabled={!canApprove}>
                      <Send size={15} /> Request correction
                    </button>
                    <button type="button" className="tc-btn small primary" onClick={() => approve(card)} disabled={!canApprove}>
                      <Check size={15} /> Approve
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Audit trail" subtitle="Every change and approval, timestamped" icon={FileCheck2}>
        <ul className="tc-audit-list">
          {audit.map((event) => (
            <li key={event.id}>
              <span className={`tc-audit-dot ${event.tone}`} />
              <div>
                <strong>{event.action}</strong>
                <em>{event.detail}</em>
                <small>
                  {event.actor} · {event.at}
                </small>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Integration with Other BuildFlow Modules
// ---------------------------------------------------------------------------

function IntegrationsTab({ model, data }: { model: Model; data: BootstrapPayload }) {
  const totals = totalsFor(model.entries, model.workerById);
  const scheduleActual = Math.round(totals.totalHours);
  const schedulePlanned = model.crews.reduce((sum, crew) => sum + crew.scheduledHeadcount * 40, 0);
  const equipmentHours = model.entries
    .filter((entry) => entry.source === "Equipment")
    .reduce((sum, entry) => sum + entryHours(entry), 0);
  const fieldSyncCount = model.entries.filter((entry) => entry.source === "Field Sync").length;

  const integrations = [
    {
      icon: CalendarClock,
      tone: "blue" as PillTone,
      title: "Schedule sync",
      status: "Live",
      copy: `Planned ${schedulePlanned} hrs vs actual ${scheduleActual} hrs logged this week.`,
      rows: [
        `Variance ${scheduleActual - schedulePlanned >= 0 ? "+" : ""}${scheduleActual - schedulePlanned} hrs vs plan`,
        "Assignments linked to timecards automatically"
      ]
    },
    {
      icon: HardHat,
      tone: "green" as PillTone,
      title: "Field Updates sync",
      status: `${fieldSyncCount} imported`,
      copy: "Daily progress reports push crew hours straight into TimeCard.",
      rows: [`${data.fieldUpdates.length} field updates connected`, "Photo notes attached to matching entries"]
    },
    {
      icon: Wrench,
      tone: "amber" as PillTone,
      title: "Equipment usage",
      status: `${Math.round(equipmentHours)} hrs`,
      copy: "Operator hours captured alongside equipment run time.",
      rows: ["Operator + machine hours reconciled", "Idle vs. productive time flagged"]
    },
    {
      icon: AlertTriangle,
      tone: "red" as PillTone,
      title: "DelayIQ correlation",
      status: `${data.delayIQs.length || 3} linked`,
      copy: "Overtime and extra hours tied back to logged delayIQ reasons.",
      rows: ["Weather delayIQ → 46 recovery OT hrs", "Rework tagged to responsible phase"]
    },
    {
      icon: Boxes,
      tone: "violet" as PillTone,
      title: "Material coordination",
      status: "Staging",
      copy: "Material handling and staging hours tracked as their own task.",
      rows: ["18 hrs logged to material staging", "Cross-project handling split-shifted"]
    },
    {
      icon: Truck,
      tone: "slate" as PillTone,
      title: "Map & Field Ops",
      status: "GPS",
      copy: "Location-verified entries confirm crews were on the right site.",
      rows: ["82% of entries GPS-verified", "Route time excluded from billable hours"]
    }
  ];

  return (
    <div className="tc-body">
      <SectionCard title="Connected BuildFlow modules" subtitle="TimeCard pulls and pushes across the platform" icon={Link2} className="tc-span-2">
        <div className="tc-integration-grid">
          {integrations.map((item) => {
            const Icon = item.icon;
            return (
              <article className="tc-integration-card" key={item.title}>
                <header>
                  <span className={`tc-int-icon ${item.tone}`}>
                    <Icon size={20} />
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <TcPill tone={item.tone}>{item.status}</TcPill>
                  </div>
                </header>
                <p>{item.copy}</p>
                <ul>
                  {item.rows.map((row) => (
                    <li key={row}>
                      <CheckCircle2 size={14} />
                      {row}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Schedule vs. actual" subtitle="Planned crew hours against logged hours" icon={TrendingUp} className="tc-span-2">
        <div className="tc-chart">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={model.crews.map((crew) => ({
                name: crew.name.replace(" Crew", ""),
                planned: crew.scheduledHeadcount * 40,
                actual: Math.round(totalsFor(model.entries.filter((entry) => entry.crewId === crew.id), model.workerById).totalHours)
              }))}
              barGap={6}
              margin={{ top: 10, right: 16, bottom: 4, left: -12 }}
            >
              <CartesianGrid stroke={chartGrid} strokeDasharray="4 6" vertical={false} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={chartTick} />
              <YAxis axisLine={false} tickLine={false} tick={chartTick} />
              <Tooltip cursor={{ fill: "rgba(9, 32, 56, 0.04)" }} />
              <Bar dataKey="planned" name="Planned" fill="#0a233a" radius={[5, 5, 0, 0]} barSize={20} />
              <Bar dataKey="actual" name="Actual" fill="#fb8500" radius={[5, 5, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
          <div className="tc-legend">
            <span>
              <i style={{ background: "#0a233a" }} /> Planned
            </span>
            <span>
              <i style={{ background: "#fb8500" }} /> Actual
            </span>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. Reporting & Analytics
// ---------------------------------------------------------------------------

function ReportingTab({ model, entries }: { model: Model; entries: TcEntry[] }) {
  const totals = totalsFor(entries, model.workerById);
  const variance = breakdownByProject(entries, model.workerById).map((row) => {
    const budget = row.budgetHours ?? 0;
    return { ...row, variance: Math.round(row.totals.totalHours) - budget };
  });
  const costPerSY = totals.burdenedCost / 1180; // paving example unit
  const [exported, setExported] = useState(false);

  return (
    <div className="tc-body tc-report-grid">
      <SectionCard title="Labor variance" subtitle="Actual vs budgeted hours by project" icon={Scale} className="tc-span-2">
        <div className="tc-table-scroll">
          <table className="tc-table">
            <thead>
              <tr>
                <th>Project</th>
                <th className="num">Budget</th>
                <th className="num">Actual</th>
                <th className="num">Variance</th>
                <th className="num">Burdened cost</th>
              </tr>
            </thead>
            <tbody>
              {variance.map((row) => (
                <tr key={row.key}>
                  <td>
                    <strong className="tc-cell-strong">{row.label}</strong>
                    <em className="tc-cell-em">{row.sublabel}</em>
                  </td>
                  <td className="num">{row.budgetHours}</td>
                  <td className="num">{Math.round(row.totals.totalHours)}</td>
                  <td className="num">
                    <b className={row.variance > 0 ? "tc-ot" : "tc-under"}>
                      {row.variance > 0 ? "+" : ""}
                      {row.variance}
                    </b>
                  </td>
                  <td className="num">{formatCurrency(row.totals.burdenedCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Cost analysis" subtitle="Unit economics" icon={DollarSign}>
        <div className="tc-mini-stats">
          <div>
            <span>Cost / labor hour</span>
            <strong>{formatCurrency(totals.burdenedCost / Math.max(1, totals.totalHours))}</strong>
          </div>
          <div>
            <span>Cost / SY paved</span>
            <strong>{formatCurrency(costPerSY)}</strong>
          </div>
          <div>
            <span>OT % of hours</span>
            <strong>{Math.round((totals.overtimeHours / Math.max(1, totals.totalHours)) * 100)}%</strong>
          </div>
          <div>
            <span>Avg loaded rate</span>
            <strong>{formatRate(totals.burdenedCost / Math.max(1, totals.totalHours))}</strong>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Labor cost trend" subtitle="Planned vs actual ($K / week)" icon={TrendingUp}>
        <div className="tc-chart">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={laborCostTrend} margin={{ top: 10, right: 16, bottom: 4, left: -14 }}>
              <CartesianGrid stroke={chartGrid} strokeDasharray="4 6" vertical={false} />
              <XAxis dataKey="week" axisLine={false} tickLine={false} tick={chartTick} />
              <YAxis axisLine={false} tickLine={false} tick={chartTick} />
              <Tooltip cursor={{ stroke: "#ccd5df", strokeWidth: 2 }} />
              <Line type="monotone" dataKey="planned" stroke="#0a233a" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="actual" stroke="#fb8500" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Labor forecastIQ" subtitle="Projected hours from current burn rate" icon={Sparkles}>
        <div className="tc-chart">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={laborForecastIQ} margin={{ top: 10, right: 16, bottom: 4, left: -14 }}>
              <defs>
                <linearGradient id="tcForecastIQ" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1568c9" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#1568c9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={chartGrid} strokeDasharray="4 6" vertical={false} />
              <XAxis dataKey="week" axisLine={false} tickLine={false} tick={chartTick} />
              <YAxis axisLine={false} tickLine={false} tick={chartTick} domain={[1200, 1800]} />
              <Tooltip cursor={{ stroke: "#ccd5df", strokeWidth: 2 }} />
              <Area type="monotone" dataKey="forecastIQ" stroke="#1568c9" strokeWidth={3} fill="url(#tcForecastIQ)" />
              <Line type="monotone" dataKey="actual" stroke="#20b15a" strokeWidth={3} dot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Productivity trend" subtitle="Output per labor hour" icon={Gauge}>
        <div className="tc-chart">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={productivityTrend} margin={{ top: 10, right: 16, bottom: 4, left: -14 }}>
              <CartesianGrid stroke={chartGrid} strokeDasharray="4 6" vertical={false} />
              <XAxis dataKey="week" axisLine={false} tickLine={false} tick={chartTick} />
              <YAxis axisLine={false} tickLine={false} tick={chartTick} domain={[0, 1.1]} />
              <Tooltip cursor={{ fill: "rgba(9, 32, 56, 0.04)" }} />
              <Bar dataKey="value" fill="#20b15a" radius={[5, 5, 0, 0]} barSize={26}>
                {productivityTrend.map((point) => (
                  <Cell key={point.week} fill={point.value >= 0.9 ? "#20b15a" : "#7cc39a"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Payroll export" subtitle="Approved hours ready for payroll" icon={Download} className="tc-payroll-card">
        <div className="tc-payroll">
          <div className="tc-payroll-summary">
            <div>
              <span>Approved timecards</span>
              <strong>
                {model.timecards.filter((card) => card.chain.every((step) => step.state === "Approved")).length} /{" "}
                {model.timecards.length}
              </strong>
            </div>
            <div>
              <span>Gross labor</span>
              <strong>{formatCurrency(totals.baseCost)}</strong>
            </div>
          </div>
          <div className="tc-payroll-formats">
            {["ADP", "Paychex", "QuickBooks", "CSV"].map((fmt) => (
              <span key={fmt} className="tc-format-chip">
                {fmt}
              </span>
            ))}
          </div>
          <button type="button" className={`tc-btn ${exported ? "ghost" : "primary"} block`} onClick={() => setExported(true)}>
            {exported ? (
              <>
                <CheckCircle2 size={16} /> Export queued
              </>
            ) : (
              <>
                <Send size={16} /> Export approved hours
              </>
            )}
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7. Compliance & Documentation
// ---------------------------------------------------------------------------

function ComplianceTab({ model, entries }: { model: Model; entries: TcEntry[] }) {
  const classCounts = model.workers.reduce<Record<string, number>>((acc, worker) => {
    acc[worker.classification] = (acc[worker.classification] ?? 0) + 1;
    return acc;
  }, {});
  const classData = [
    { name: "Employee", value: classCounts.Employee ?? 0, color: "#1568c9" },
    { name: "Subcontractor", value: classCounts.Subcontractor ?? 0, color: "#6d45d8" },
    { name: "Apprentice", value: classCounts.Apprentice ?? 0, color: "#fb8500" }
  ];

  const certifiedRows = model.workers
    .filter((worker) => {
      const project = model.projects.find((item) => item.id === crewMeta(worker.crewId)?.projectId);
      return project?.prevailingWage;
    })
    .slice(0, 8)
    .map((worker) => {
      const workerEntries = entries.filter((entry) => entry.workerId === worker.id);
      const totals = workerEntries.reduce((acc, entry) => accumulate(acc, worker, entry), emptyTotals());
      const project = model.projects.find((item) => item.id === crewMeta(worker.crewId)?.projectId);
      const meetsPrevailing = worker.baseRate >= worker.prevailingRate * 0.98;
      return { worker, totals, project, meetsPrevailing };
    });

  return (
    <div className="tc-body tc-compliance-grid">
      <SectionCard title="Certified payroll" subtitle="Prevailing-wage projects · WH-347 ready" icon={FileCheck2} className="tc-span-2">
        <div className="tc-table-scroll">
          <table className="tc-table">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Classification</th>
                <th>Project</th>
                <th className="num">Hours</th>
                <th className="num">Paid rate</th>
                <th className="num">Prevailing</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {certifiedRows.map(({ worker, totals, project, meetsPrevailing }) => (
                <tr key={worker.id}>
                  <td>
                    <span className="tc-worker-cell">
                      <i className="tc-avatar sm">{worker.initials}</i>
                      <span>
                        <strong>{worker.name}</strong>
                        <em>{worker.role}</em>
                      </span>
                    </span>
                  </td>
                  <td>
                    <TcPill tone={worker.classification === "Apprentice" ? "amber" : worker.classification === "Subcontractor" ? "violet" : "blue"}>
                      {worker.classification}
                    </TcPill>
                  </td>
                  <td>
                    <span className="tc-cell-strong">{project?.code}</span>
                  </td>
                  <td className="num">{Math.round(totals.totalHours)}</td>
                  <td className="num">{formatRate(worker.baseRate)}</td>
                  <td className="num">{formatRate(worker.prevailingRate)}</td>
                  <td>
                    <TcPill tone={meetsPrevailing ? "green" : "red"}>{meetsPrevailing ? "Compliant" : "Below scale"}</TcPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="tc-cert-actions">
          <button type="button" className="tc-btn primary">
            <Download size={16} /> Generate WH-347
          </button>
          <button type="button" className="tc-btn ghost">
            <FileCheck2 size={16} /> Statement of compliance
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Worker classification" subtitle="Employee vs. sub vs. apprentice" icon={Users}>
        <div className="tc-class-chart">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={classData} dataKey="value" nameKey="name" innerRadius={46} outerRadius={72} paddingAngle={3}>
                {classData.map((slice) => (
                  <Cell key={slice.name} fill={slice.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <ul className="tc-class-legend">
            {classData.map((slice) => (
              <li key={slice.name}>
                <i style={{ background: slice.color }} />
                <span>{slice.name}</span>
                <strong>{slice.value}</strong>
              </li>
            ))}
          </ul>
        </div>
      </SectionCard>

      <SectionCard title="Prevailing wage scales" subtitle="Enforced minimums by classification" icon={Scale}>
        <ul className="tc-wage-list">
          {["Foreman", "Electrician", "Concrete Finisher", "Equipment Operator", "Laborer", "Apprentice"].map((role) => {
            const rate = rateForRole(role);
            return (
              <li key={role}>
                <span>{role}</span>
                <span className="tc-wage-scale">
                  <b>{formatRate(rate.prevailing)}</b>
                  <em>base {formatRate(rate.base)}</em>
                </span>
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <SectionCard title="Lien law compliance" subtitle="Subcontractor payment verification" icon={ShieldCheck} className="tc-span-2">
        <div className="tc-table-scroll">
          <table className="tc-table">
            <thead>
              <tr>
                <th>Subcontractor</th>
                <th>Project</th>
                <th>Paid through</th>
                <th className="num">Amount</th>
                <th>Lien waiver</th>
              </tr>
            </thead>
            <tbody>
              {model.liens.map((lien) => {
                const project = model.projects.find((item) => item.id === lien.projectId);
                return (
                  <tr key={lien.id}>
                    <td>
                      <strong className="tc-cell-strong">{lien.subcontractor}</strong>
                    </td>
                    <td>{project?.name}</td>
                    <td>{lien.throughDate}</td>
                    <td className="num">{formatCurrency(lien.amount)}</td>
                    <td>
                      <TcPill tone={lien.status === "Verified" ? "green" : lien.status === "Conditional" ? "amber" : "slate"}>
                        {lien.status}
                      </TcPill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 8. Dashboard widgets (rendered on the main BuildFlow dashboard)
// ---------------------------------------------------------------------------

export function TimeCardDashboardCards({ data, onOpen }: { data: BootstrapPayload; onOpen: () => void }) {
  const model = useMemo(() => buildTimecardModel(data), [data]);
  const totals = useMemo(() => totalsFor(model.entries, model.workerById), [model]);
  const today = tcWorkDays[3].date;
  const todaysEntries = model.entries.filter((entry) => entry.date === today);
  const activeCrewsToday = new Set(todaysEntries.map((entry) => entry.crewId)).size;
  const todaysHours = todaysEntries.reduce((sum, entry) => sum + entryHours(entry), 0);
  const weeklyBudget = model.projects.reduce((sum, project) => sum + Math.round(project.budgetHours / 26), 0);
  const budgetPct = Math.round((totals.totalHours / weeklyBudget) * 100);
  const otPending = model.timecards.filter((card) => card.overtimePending);
  const otPendingHours = otPending.reduce((sum, card) => sum + card.overtimeHours, 0);
  const utilization = Math.round(
    (totals.totalHours / (model.crews.reduce((sum, crew) => sum + crew.scheduledHeadcount, 0) * 48)) * 100
  );
  const pendingCrews = model.crews
    .map((crew) => ({
      crew,
      pending: model.timecards.filter(
        (card) => card.crewId === crew.id && card.chain.some((step) => step.state === "Pending" || step.state === "Rejected")
      ).length
    }))
    .filter((row) => row.pending > 0);
  const costDelta = laborCostTrend[laborCostTrend.length - 1].actual - laborCostTrend[laborCostTrend.length - 2].actual;

  return (
    <section className="tc-dash" aria-label="TimeCard overview">
      <header className="tc-dash-head">
        <h2>
          <Clock size={18} /> TimeCard
        </h2>
        <button type="button" className="tc-dash-open" onClick={onOpen}>
          Open TimeCard <ArrowRight size={16} />
        </button>
      </header>
      <div className="tc-dash-grid">
        <button type="button" className="tc-dash-card" onClick={onOpen}>
          <span className="tc-dash-icon blue">
            <Users size={20} />
          </span>
          <p>Active crews today</p>
          <strong>{activeCrewsToday}</strong>
          <em>{formatHours(todaysHours)} logged today</em>
        </button>
        <button type="button" className="tc-dash-card" onClick={onOpen}>
          <span className="tc-dash-icon green">
            <Clock size={20} />
          </span>
          <p>Hours this week</p>
          <strong>{Math.round(totals.totalHours)}</strong>
          <em>{budgetPct}% of {weeklyBudget} budgeted</em>
        </button>
        <button type="button" className="tc-dash-card" onClick={onOpen}>
          <span className="tc-dash-icon amber">
            <Timer size={20} />
          </span>
          <p>OT pending approval</p>
          <strong>{Math.round(otPendingHours)}</strong>
          <em>{otPending.length} timecards</em>
        </button>
        <button type="button" className="tc-dash-card" onClick={onOpen}>
          <span className="tc-dash-icon violet">
            <Gauge size={20} />
          </span>
          <p>Crew utilization</p>
          <strong>{utilization}%</strong>
          <em>scheduled capacity</em>
        </button>
        <button type="button" className="tc-dash-card wide" onClick={onOpen}>
          <span className="tc-dash-icon green">
            <TrendingUp size={20} />
          </span>
          <p>Labor cost trending</p>
          <strong>
            {formatCurrency(laborCostTrend[laborCostTrend.length - 1].actual * 1000, true)}
            <b className={costDelta >= 0 ? "up" : "down"}>
              {costDelta >= 0 ? "+" : ""}
              {costDelta}K
            </b>
          </strong>
          <span className="tc-spark">
            <ResponsiveContainer width="100%" height={40}>
              <LineChart data={laborCostTrend} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
                <Line type="monotone" dataKey="actual" stroke="#fb8500" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </span>
        </button>
        <button type="button" className="tc-dash-card pending" onClick={onOpen}>
          <span className="tc-dash-icon red">
            <ClipboardCheck size={20} />
          </span>
          <p>Crews with pending approvals</p>
          <strong>{pendingCrews.length}</strong>
          <em className="tc-dash-crewnames">
            {pendingCrews.length ? pendingCrews.slice(0, 2).map((row) => row.crew.name).join(", ") : "All approved"}
          </em>
        </button>
      </div>
    </section>
  );
}
