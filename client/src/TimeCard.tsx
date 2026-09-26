import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject
} from "react";
import { AnimatedFigure } from "./components/ui/animated-figure";
import { TextReveal } from "./motion";
import { useHudMotion } from "./useHudMotion";
import {
  AlertTriangle,
  ArrowRight,
  CircleArrowUp,
  Boxes,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  DollarSign,
  Download,
  FileCheck2,
  FlaskConical,
  Gauge,
  HardHat,
  History,
  Layers,
  Link2,
  Lock,
  MapPin,
  Plus,
  Repeat,
  RefreshCw,
  Scale,
  Send,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash2,
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
import {
  DAILY_OVERTIME_HOURS,
  clockMinutes,
  dayHours,
  localIsoDate,
  workedMinutes,
  type BootstrapPayload,
  type PermissionLevel,
  type TimeEntry,
  type TimeEntryInput,
  type User
} from "@buildflow/shared";
import {
  ApiError,
  approveTimeEntries,
  createTimeEntry,
  deleteTimeEntry,
  fetchTeamTimeEntries,
  fetchTimeEntries,
  reopenTimeEntries
} from "./api";
import { weekDays } from "./schedule/scheduleUtils";
import {
  BURDEN_RATE,
  OVERTIME_MULTIPLIER,
  OVERTIME_THRESHOLD,
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
  type TcTimecard,
  type TcWorker
} from "./timecardModel";

/*
 * THE TIMECARD PAGE, on the Month and Crews pages' language (2026-09-25).
 *
 * Asked for: redesign the whole page "similar to the Month page and Crews page", keeping every
 * piece of information it shows. So it is built from their parts rather than a look-alike of them:
 *
 *   - the Month page's head — a crumb chip with its dot, a display title that writes itself in,
 *     one line of what the page is, and the controls as white pills;
 *   - the Crews page's KPI strip, its index card (a date stamp and the section's name over the
 *     travelling-pill views, one per section, with a count where the section is a list), its
 *     tables, badges, faces and progress tracks — the `hs-*` parts, which the skin draws for every
 *     index page (skin §21-§23, where `.tc-rx` is one of the family);
 *   - the Month calendar's week, as a person-by-day grid of the hours the entries already hold;
 *   - and the Projects rail's panels and alert rows for each section's cards.
 *
 * Every figure in the seven sections still comes from buildTimecardModel(), which is a fixed sample
 * week, so the preview notice stays where it was: above the first number. The one section that is
 * not a sample is Team's time, the week the Members put in themselves, and while it is open the
 * head says so instead — its note, its tiles, its week and its Export are the workspace's own.
 */

// ---------------------------------------------------------------------------
// Parts — the index pages' own, so the skin draws them the way it draws Crews
// ---------------------------------------------------------------------------

type Tone = "green" | "blue" | "amber" | "red" | "violet" | "slate";

/** A status: the index pages' badge, a dot and a word on the semantic pairs. Slate is the plain one. */
function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={tone === "slate" ? "hs-badge" : `hs-badge tone-${tone}`}>{children}</span>;
}

const entryStatusTone: Record<TcEntry["status"], Tone> = {
  Approved: "green",
  Submitted: "blue",
  Draft: "slate",
  Flagged: "red"
};

const approvalTone: Record<TcApprovalState, Tone> = {
  Approved: "green",
  Pending: "amber",
  Awaiting: "slate",
  Rejected: "red"
};

/** The progress track tones the index pages paint; the others ride the default (ink) fill. */
const TRACK_TONES: ReadonlySet<Tone> = new Set(["green", "amber", "red"]);

/** A value against a maximum, on the index pages' progress track, with its reading beside it. */
function Meter({ value, max, tone, children }: { value: number; max: number; tone?: Tone; children?: ReactNode }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="hs-progress tc-meter">
      <span className={`hs-progress-track${tone && TRACK_TONES.has(tone) ? ` tone-${tone}` : ""}`} aria-hidden="true">
        <i style={{ width: `${pct}%` } as CSSProperties} />
      </span>
      {children !== undefined && <b>{children}</b>}
    </div>
  );
}

/** A person: the index pages' face and name, with what they do underneath. */
function Person({
  worker,
  sub,
  small = false
}: {
  worker?: Pick<TcWorker, "initials" | "name" | "role">;
  sub?: ReactNode;
  small?: boolean;
}) {
  return (
    <div className="hs-row-name tc-person">
      <span className={`hs-avatar${small ? " is-small" : ""}`} aria-hidden="true">
        {worker?.initials}
      </span>
      <div>
        <span className="tc-person-name">{worker?.name}</span>
        <span className="hs-row-sub">{sub ?? worker?.role}</span>
      </div>
    </div>
  );
}

/**
 * One of a section's cards: the Projects rail's panel, with its glyph in a disc of the panel's tone
 * (skin §60), a title and a line under it, and one action at the right. `span` is how many of the
 * grid's three columns it takes.
 */
function Panel({
  id,
  title,
  subtitle,
  icon: Icon,
  tone = "slate",
  action,
  span = 1,
  className = "",
  children
}: {
  id: string;
  title: string;
  subtitle?: ReactNode;
  icon: typeof Clock;
  tone?: Tone;
  action?: ReactNode;
  span?: 1 | 2 | 3;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`hs-panel tc-panel span-${span}${className ? ` ${className}` : ""}`} aria-labelledby={id}>
      <header className="hs-panel-head tc-panel-head">
        <span className={`tc-panel-ico tone-${tone}`} aria-hidden="true">
          <Icon size={15} />
        </span>
        <div className="tc-panel-heading">
          <h3 id={id}>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action && <div className="tc-panel-action">{action}</div>}
      </header>
      {children}
    </section>
  );
}

/**
 * A choice of one, as a pill track whose selection travels (motion/SegmentPill.tsx reads `.tc-seg`
 * and the pressed button). A group of toggles rather than tabs: it re-sorts the card it sits in.
 */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="tc-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={value === option ? "active" : ""}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {option[0].toUpperCase() + option.slice(1)}
        </button>
      ))}
    </div>
  );
}

/** A chart's key, in the series' own colours. */
function ChartKey({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <ul className="tc-key" aria-label="Chart key">
      {items.map((item) => (
        <li key={item.label}>
          <i style={{ background: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

const chartGrid = "var(--bf-line-solid)";
const chartTick = { fill: "var(--bf-ink-faint)", fontSize: 12 };
/* recharts' tooltip is a white box with a grey border by default, in every mode: this one is the
   program's own raised surface, so it reads in dark mode too. */
const chartTooltip = {
  contentStyle: {
    border: 0,
    borderRadius: 12,
    background: "var(--bf-surface)",
    boxShadow: "var(--bf-shadow-raised)",
    color: "var(--bf-ink)",
    fontSize: 12
  },
  labelStyle: { color: "var(--bf-ink-muted)", fontWeight: 600 },
  itemStyle: { color: "var(--bf-ink)" }
};

/** One CSV cell: quoted when it holds a comma, a quote or a line break. */
const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Rows as a CSV file, handed to the browser to save. */
function downloadCsv(rows: Array<Array<string | number>>, filename: string) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// TimeCard page
// ---------------------------------------------------------------------------

type TabId = "team" | "entry" | "cost" | "crew" | "approvals" | "integrations" | "reporting" | "compliance";

/** The modules the Integrations section lists, which its tab counts. */
const INTEGRATION_COUNT = 6;

const TABS: Array<{ id: TabId; label: string; icon: typeof Clock; about: string }> = [
  {
    id: "team",
    label: "Team's time",
    icon: UserCheck,
    about: "What your Members put in on their own TimeCard: each person's week, day by day, and every entry behind it."
  },
  {
    id: "entry",
    label: "Time Entry",
    icon: Clock,
    about: "Crew leads log hours by job, phase and task; what the jobsite captured offline syncs when it reconnects."
  },
  {
    id: "cost",
    label: "Labor Cost",
    icon: DollarSign,
    about: "Regular, overtime and burdened cost by project, crew, phase or worker, against each project's weekly budget."
  },
  {
    id: "crew",
    label: "Crew & Assignment",
    icon: Users,
    about: "Who was scheduled, who logged time, what each crew member did, and what each crew produced per labor hour."
  },
  {
    id: "approvals",
    label: "Approvals",
    icon: ClipboardCheck,
    about: "Every timecard climbs Crew Lead → Superintendent → Project Manager → Accounting, and every step lands on the audit trail."
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: Link2,
    about: "What TimeCard pulls from the rest of BuildFlow and pushes back to it."
  },
  {
    id: "reporting",
    label: "Reporting",
    icon: TrendingUp,
    about: "Labor variance, unit costs and trends — and the approved hours, ready for payroll."
  },
  {
    id: "compliance",
    label: "Compliance",
    icon: ShieldCheck,
    about: "Certified payroll, worker classification, prevailing-wage minimums and subcontractor lien waivers."
  }
];

/** Today, as the Month page's date stamp prints it. */
function todayStamp() {
  const now = new Date();
  return { month: now.toLocaleDateString("en-US", { month: "short" }), day: now.getDate() };
}

/**
 * The Owner's and Admin's TimeCard. Team's time first — the week the Members put in themselves —
 * then the crews' week, its costs, approvals and compliance, which are a sample week.
 */
function TeamTimeCard({ data }: { data: BootstrapPayload }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useHudMotion(rootRef);
  const model = useMemo(() => buildTimecardModel(data), [data]);
  /* Team's time opens first: it is the one section whose figures are this workspace's own. */
  const [tab, setTab] = useState<TabId>("team");
  /* Once a section has been chosen, the next one arrives on its own short cascade rather than on
     the page's opening beats, which would hold it back for most of a second. */
  const [switched, setSwitched] = useState(false);
  const [entries, setEntries] = useState<TcEntry[]>(model.entries);
  const [timecards, setTimecards] = useState<TcTimecard[]>(model.timecards);
  const [audit, setAudit] = useState(model.audit);

  /* Team's time, a week at a time, stepped from the head. It is read while the section is open. */
  const live = tab === "team";
  const today = localIsoDate();
  const thisMonday = weekDays[0].date;
  const [teamMonday, setTeamMonday] = useState(thisMonday);
  const team = useTeamTime(live, teamMonday);
  const teamDays = useMemo(() => weekOf(teamMonday), [teamMonday]);
  const roster = useMemo(() => (team.entries ? teamRows(team.entries, team.people) : []), [team.entries, team.people]);
  const rosterHours = hoursOf(roster);
  const withTime = roster.filter((row) => row.entries.length > 0).length;
  /* A person's timecard is approved when none of their week is still waiting. */
  const approvedCards = roster.filter((row) => row.entries.length > 0 && waitingOn(row).length === 0).length;
  const onThisWeek = teamMonday === thisMonday;
  const teamWhen = onThisWeek ? "this week" : "that week";

  const week = live ? weekSpanLabel(teamDays) : model.weekLabel;
  const totals = useMemo(() => totalsFor(entries, model.workerById), [entries, model.workerById]);
  const otPendingCards = timecards.filter((card) => card.overtimePending);
  const otPendingHours = otPendingCards.reduce((sum, card) => sum + card.overtimeHours, 0);
  const pendingApprovals = timecards.filter((card) =>
    card.chain.some((step) => step.state === "Pending" || step.state === "Rejected")
  ).length;
  const weeklyBudgetHours = model.projects.reduce((sum, project) => sum + Math.round(project.budgetHours / 26), 0);
  const budgetPct = Math.round((totals.totalHours / weeklyBudgetHours) * 100);
  const stamp = todayStamp();
  const active = TABS.find((item) => item.id === tab) ?? TABS[0];

  /* A count where the section is a list of things, and none where it is not: a number on a tab
     says how many of something are behind it. Team's time has none until its week has loaded. */
  const counts: Partial<Record<TabId, number>> = {
    team: team.entries?.length,
    entry: entries.length,
    crew: model.crews.length,
    approvals: pendingApprovals,
    integrations: INTEGRATION_COUNT
  };
  const meta: Record<TabId, string> = {
    team: team.entries
      ? `${team.entries.length} ${team.entries.length === 1 ? "entry" : "entries"} · ${hoursText(rosterHours.total)}`
      : team.problem
        ? "Not loaded"
        : "Loading…",
    entry: `${entries.length} entries this week`,
    cost: `${formatCurrency(totals.burdenedCost, true)} burdened`,
    crew: `${model.crews.length} crews · ${model.workers.length} workers`,
    approvals: `${pendingApprovals} awaiting approval`,
    integrations: `${INTEGRATION_COUNT} modules connected`,
    reporting: `${timecards.filter((card) => card.chain.every((step) => step.state === "Approved")).length} of ${timecards.length} approved`,
    compliance: `${model.projects.filter((project) => project.prevailingWage).length} prevailing-wage projects`
  };

  const choose = (next: TabId) => {
    if (next === tab) return;
    setTab(next);
    setSwitched(true);
  };
  /* The views are one tab stop: the arrows move along them, Home and End jump to either end. */
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const to = tabStep(
      event.key,
      TABS.findIndex((item) => item.id === tab),
      TABS.length
    );
    if (to < 0) return;
    event.preventDefault();
    choose(TABS[to].id);
    const next = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[to];
    next?.focus();
    next?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };

  /** The week's entries as a spreadsheet — the sample week, and named as one. */
  const exportWeek = () => {
    const header = [
      "Worker",
      "Role",
      "Crew",
      "Project",
      "Phase",
      "Task",
      "Date",
      "Regular hours",
      "Overtime hours",
      "Source",
      "Photo",
      "GPS",
      "Status"
    ];
    const rows = entries.map((entry) => {
      const worker = model.workerById.get(entry.workerId);
      return [
        worker?.name ?? entry.workerId,
        worker?.role ?? "",
        model.crews.find((crew) => crew.id === entry.crewId)?.name ?? entry.crewId,
        model.projects.find((project) => project.id === entry.projectId)?.name ?? entry.projectId,
        entry.phase,
        entry.task,
        entry.date,
        entry.regularHours,
        entry.overtimeHours,
        entry.source,
        entry.photo ? "Yes" : "No",
        entry.location ? "Yes" : "No",
        entry.synced ? entry.status : "Offline"
      ];
    });
    downloadCsv([header, ...rows], `buildflow-timecards-${tcWorkDays[0].date}-sample-week.csv`);
  };

  /**
   * The team's week as a spreadsheet, for payroll: person by person, each person's days in order.
   * A day's overtime is written once, on its first stretch, as the table says it once.
   */
  const exportTeam = () => {
    const header = [
      "Person",
      "Date",
      "Clock in",
      "Clock out",
      "Break (minutes)",
      "Hours",
      "Day overtime (hours)",
      "Project",
      "Notes",
      "Status",
      "Approved by",
      "Approved at",
      "Put in at"
    ];
    const rows: Array<Array<string | number>> = [];
    for (const row of roster) {
      const told = new Set<string>();
      const inOrder = [...row.entries].sort((a, b) =>
        a.date === b.date ? a.clockIn.localeCompare(b.clockIn) : a.date.localeCompare(b.date)
      );
      for (const entry of inOrder) {
        const overtime = told.has(entry.date) ? "" : tenths(dayHours(row.entries.filter((other) => other.date === entry.date)).overtime);
        told.add(entry.date);
        rows.push([
          row.name,
          entry.date,
          entry.clockIn,
          entry.clockOut,
          entry.breakMinutes,
          tenths(workedMinutes(entry) / 60),
          overtime,
          entry.projectId ? (data.projects.find((project) => project.id === entry.projectId)?.name ?? "A removed project") : "",
          entry.notes,
          entry.status,
          entry.approvedBy ? approverName(team.people, entry.approvedBy) : "",
          entry.approvedAt ?? "",
          entry.createdAt
        ]);
      }
    }
    downloadCsv([header, ...rows], `buildflow-team-time-${teamDays[0].date}-to-${teamDays[6].date}.csv`);
  };

  const loaded = team.entries !== null;
  const waiting = team.problem ? "could not be loaded" : "loading…";

  return (
    <div className="page-stack tc-page tc-rx hs-index" ref={rootRef}>
      <div className="dx-bg" aria-hidden="true">
        <span className="dx-aurora dx-aurora-1" />
        <span className="dx-aurora dx-aurora-2" />
        <span className="dx-aurora dx-aurora-3" />
      </div>
      <div className="dx-cursor" aria-hidden="true" />

      {/* The Month page's head: the crumb chip, the title writing itself in, one line of what it is. */}
      <header className="tc-hero" data-tutorial-id="timecard-page-title">
        <span className="tc-eyebrow">
          <span className="tc-dot" aria-hidden="true" />
          Time Cards · {week}
        </span>
        <div className="tc-title-row">
          <h1 className="tc-title">
            <TextReveal text="TimeCard" />
          </h1>
          {/* Whose view this is while the figures are real, as a Member's page says "Member"; a
              preview's warning while they are the sample week. */}
          {live ? (
            <span className="tc-title-tag is-neutral" title="Owners and Admins see everybody's time here">
              {data.activeUser?.permission === "admin" ? "Admin" : "Owner"}
            </span>
          ) : (
            <span className="tc-title-tag" title="Every figure in this section is a built-in sample week">
              Preview
            </span>
          )}
        </div>
        <p className="tc-sub">Daily labor hours, cost, approvals, and certified-payroll compliance · {week}</p>
      </header>
      <div className="tc-controls">
        <span className="tc-week-chip" aria-live="polite">
          <CalendarClock size={16} aria-hidden="true" />
          {week}
        </span>
        {/* The Month page's stepper, a week at a time. There is no week after this one: nobody can
            have put time in for it. */}
        {live && (
          <div className="tc-weeknav" role="group" aria-label="Week">
            <button
              type="button"
              className="tc-weeknav-step"
              aria-label="Previous week"
              onClick={() => setTeamMonday((monday) => shiftDay(monday, -7))}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button type="button" className="tc-weeknav-today" onClick={() => setTeamMonday(thisMonday)} disabled={onThisWeek}>
              This week
            </button>
            <button
              type="button"
              className="tc-weeknav-step"
              aria-label="Next week"
              onClick={() => setTeamMonday((monday) => shiftDay(monday, 7))}
              disabled={teamMonday >= thisMonday}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        )}
        <button
          type="button"
          className="hs-btn tc-export"
          onClick={live ? exportTeam : exportWeek}
          disabled={live && !team.entries?.length}
        >
          <Download size={15} aria-hidden="true" />
          Export
        </button>
      </div>

      {/*
        Said once, at the top, before any of the numbers — and said of the section that is open.

        Every figure in the sample sections comes from buildTimecardModel(), whose parameter is
        named `_data` and is never read: the workers, the entries, the timecards, the approval
        chains, the audit trail and the lien records are all fixed sample values. They are identical
        for an empty workspace and a real one. Time Cards is also a paid add-on, so someone could be
        paying for a page whose figures are not theirs — which is why this says so plainly rather
        than in a footnote, and why it names what IS real: Team's time, which is what the Members
        put in themselves, and the labor hours on Reports, which are computed from the workspace's
        own jobs and the days the field reported.
      */}
      {live ? (
        <p className="tc-preview is-live" role="note">
          <span className="tc-preview-ico" aria-hidden="true">
            <UserCheck size={16} />
          </span>
          <span>
            <strong>Your team&apos;s time.</strong> What your Members put in on their own TimeCard, as they submitted it — none of it is
            sample. The other sections, from Time Entry to Compliance, are still a built-in sample week, Approvals included.
          </span>
        </p>
      ) : (
        <p className="tc-preview" role="note">
          <span className="tc-preview-ico" aria-hidden="true">
            <FlaskConical size={16} />
          </span>
          <span>
            <strong>Preview.</strong> Every hour, cost and approval in this section comes from a built-in sample week — not from this
            workspace, so nothing here reflects your crews. The time your Members put in is under <strong>Team&apos;s time</strong>, and the
            labor hours on <strong>Reports</strong> are real too: those come from your own jobs.
          </span>
        </p>
      )}

      {live ? (
        <section className="hs-kpis" aria-label="Your team's week">
          <Kpi
            icon={Clock}
            tone="blue"
            label="Hours put in"
            value={loaded ? hoursText(rosterHours.total) : "—"}
            note={loaded ? `${hoursText(rosterHours.regular)} regular` : waiting}
          />
          <Kpi
            icon={Users}
            tone="green"
            label="People with time in"
            value={loaded ? (roster.length ? `${withTime} of ${roster.length}` : "0") : "—"}
            note={loaded ? (roster.length ? `put time in ${teamWhen}` : "no Members here yet") : waiting}
          />
          <Kpi
            icon={Timer}
            tone="amber"
            label="Overtime"
            value={loaded ? hoursText(rosterHours.overtime) : "—"}
            note={`past ${DAILY_OVERTIME_HOURS} hrs in a day`}
          />
          <Kpi
            icon={ClipboardCheck}
            tone="violet"
            label="Timecards approved"
            value={loaded ? (withTime ? `${approvedCards} of ${withTime}` : "0") : "—"}
            note={
              loaded
                ? withTime === 0
                  ? "nothing to approve yet"
                  : approvedCards === withTime
                    ? "every timecard approved"
                    : `${withTime - approvedCards} waiting on approval`
                : waiting
            }
          />
        </section>
      ) : (
        <section className="hs-kpis" aria-label="TimeCard summary">
          <Kpi
            icon={Clock}
            tone="blue"
            label="Hours logged this week"
            value={formatHours(totals.totalHours)}
            note={`${formatHours(totals.regularHours)} reg · ${formatHours(totals.overtimeHours)} OT`}
          />
          <Kpi
            icon={DollarSign}
            tone="green"
            label="Burdened labor cost"
            value={formatCurrency(totals.burdenedCost, true)}
            note={`${formatCurrency(totals.baseCost, true)} base + ${Math.round(BURDEN_RATE * 100)}% burden`}
          />
          <Kpi
            icon={Timer}
            tone="amber"
            label="Overtime pending approval"
            value={formatHours(otPendingHours)}
            note={`across ${otPendingCards.length} timecards`}
          />
          <Kpi
            icon={ClipboardCheck}
            tone="violet"
            label="Timecards awaiting approval"
            value={String(pendingApprovals)}
            note={`${budgetPct}% of weekly budgeted hours used`}
          />
        </section>
      )}

      {/* The Crews page's index card: here it holds the section you are in and the way to the others. */}
      <div className="hs-index-main">
        <section className="hs-index-card tc-board" aria-labelledby="tc-section-title">
          <div className="tc-board-head">
            <span className="tc-datestamp" aria-hidden="true">
              <span className="tc-datestamp-month">{stamp.month}</span>
              <span className="tc-datestamp-day">{stamp.day}</span>
            </span>
            <div className="tc-board-heading">
              <h2 id="tc-section-title">{active.label}</h2>
              <p>{active.about}</p>
            </div>
            <span className="hs-count-pill tc-board-meta">{meta[tab]}</span>
          </div>
          <div className="hs-views tc-views" role="tablist" aria-label="TimeCard sections">
            {TABS.map((item) => {
              const Icon = item.icon;
              const selected = tab === item.id;
              return (
                <button
                  key={item.id}
                  id={`tc-tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="tc-section"
                  tabIndex={selected ? 0 : -1}
                  className={`hs-view${selected ? " active" : ""}`}
                  onClick={(event) => {
                    choose(item.id);
                    // a section half past the track's edge comes fully into view when it is chosen
                    event.currentTarget.scrollIntoView?.({ block: "nearest", inline: "nearest" });
                  }}
                  onKeyDown={onTabKey}
                >
                  <Icon aria-hidden="true" />
                  {item.label}
                  {counts[item.id] !== undefined && <span className="hs-view-count">{counts[item.id]}</span>}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div
        key={tab}
        id="tc-section"
        role="tabpanel"
        aria-labelledby={`tc-tab-${tab}`}
        className={`tc-grid${switched ? " is-switched" : ""}`}
      >
        {tab === "team" && (
          <TeamTimeTab
            days={teamDays}
            today={today}
            rows={roster}
            people={team.people}
            loaded={loaded}
            problem={team.problem}
            onRetry={team.retry}
            onChanged={team.merge}
            projects={data.projects}
            thisWeek={onThisWeek}
          />
        )}
        {tab === "entry" && <TimeEntryTab model={model} entries={entries} setEntries={setEntries} />}
        {tab === "cost" && <LaborCostTab model={model} entries={entries} />}
        {tab === "crew" && <CrewTab model={model} entries={entries} />}
        {tab === "approvals" && (
          <ApprovalsTab model={model} timecards={timecards} setTimecards={setTimecards} audit={audit} setAudit={setAudit} />
        )}
        {tab === "integrations" && <IntegrationsTab model={model} data={data} />}
        {tab === "reporting" && <ReportingTab model={model} entries={entries} timecards={timecards} />}
        {tab === "compliance" && <ComplianceTab model={model} entries={entries} />}
      </div>
    </div>
  );
}

/** A KPI tile: the Crews page's, with the figure counting up and a line of what it is made of. */
function Kpi({ icon: Icon, tone, label, value, note }: { icon: typeof Clock; tone: Tone; label: string; value: string; note: string }) {
  return (
    <div className="hs-kpi">
      <span className={`hs-kpi-ico tone-${tone}`}>
        <Icon />
      </span>
      <div className="hs-kpi-body">
        <span className="hs-kpi-label">{label}</span>
        <span className="hs-kpi-value">
          <AnimatedFigure text={value} />
        </span>
        <span className="hs-kpi-note">{note}</span>
      </div>
    </div>
  );
}

/**
 * Which TimeCard you see (2026-09-25). Owners and Admins run the week — the page above, its hours,
 * costs, approvals and compliance. Everyone else puts in their own time. Anyone the roster cannot
 * place gets the smaller of the two, because the week of hours and costs is not theirs to see; the
 * server draws the same line, since nothing a Member can call reaches anybody else's time.
 */
export function TimeCardPage({ data }: { data: BootstrapPayload }) {
  const level = data.activeUser?.permission;
  return level === "owner" || level === "admin" ? <TeamTimeCard data={data} /> : <MyTimeCard data={data} />;
}

/** The next view the arrow keys, Home and End ask for, or -1 for any other key. */
function tabStep(key: string, at: number, count: number) {
  if (key === "ArrowRight") return (at + 1) % count;
  if (key === "ArrowLeft") return (at - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return -1;
}

// ---------------------------------------------------------------------------
// Team's time: what the Members put in, for an Owner or an Admin
// ---------------------------------------------------------------------------

/** The day `days` after `iso`, or before it when negative, counted on the calendar. */
function shiftDay(iso: string, days: number) {
  const day = new Date(`${iso}T00:00:00`);
  day.setDate(day.getDate() + days);
  return localIsoDate(day);
}

/** The seven days of the week that starts on `monday`, in the shape of the schedule's own week. */
function weekOf(monday: string): typeof weekDays {
  return Array.from({ length: 7 }, (_, index) => {
    const date = shiftDay(monday, index);
    const day = new Date(`${date}T00:00:00`);
    return {
      date,
      day: day.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
      label: day.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    };
  });
}

/** "Sep 21 – Sep 27, 2026": how the head names a week. */
function weekSpanLabel(days: typeof weekDays) {
  return `${days[0].label} – ${days[6].label}, ${days[6].date.slice(0, 4)}`;
}

/** When an entry was put in, as a person reads it: "Sep 24, 4:12 PM". */
function putInLabel(iso: string) {
  const at = new Date(iso);
  return `${at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${at.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  })}`;
}

/** How many days after the day worked an entry was put in: 0 the same day, 1 the next. */
function daysAfter(entry: TimeEntry) {
  const putIn = localIsoDate(new Date(entry.createdAt));
  return Math.max(0, Math.round((Date.parse(`${putIn}T00:00:00`) - Date.parse(`${entry.date}T00:00:00`)) / 86_400_000));
}

const LEVEL_NAMES: Record<PermissionLevel, string> = { owner: "Owner", admin: "Admin", member: "Member" };

/** A person on the team's week: who they are, and their time in it. */
type TeamRow = { key: string; name: string; avatar: string; sub: string; entries: TimeEntry[] };

/**
 * The people on the team's week, by name: every Member whether or not they have put time in — the
 * gaps are half of what the view is for — and anyone else whose time is in it, an Owner or Admin
 * who put some in or someone removed since. Time is placed by its roster row first, because
 * removing someone keeps the row and clears its login; time the roster cannot place at all is kept
 * under "A former teammate" rather than dropped from the totals.
 */
function teamRows(entries: TimeEntry[], people: User[]): TeamRow[] {
  const rows = new Map<string, TeamRow>();
  const rowFor = (person: User) => {
    let row = rows.get(person.id);
    if (!row) {
      const sub = person.removedAt ? "Removed" : person.permission ? LEVEL_NAMES[person.permission] : "No login";
      row = { key: person.id, name: person.name, avatar: person.avatar, sub, entries: [] };
      rows.set(person.id, row);
    }
    return row;
  };
  for (const person of people) if (person.permission === "member") rowFor(person);
  for (const entry of entries) {
    const person =
      people.find((item) => entry.userId !== "" && item.id === entry.userId) ??
      people.find((item) => Boolean(item.accountId) && item.accountId === entry.accountId);
    const key = `account:${entry.accountId}`;
    if (!person && !rows.has(key)) rows.set(key, { key, name: "A former teammate", avatar: "?", sub: "Not on the roster", entries: [] });
    (person ? rowFor(person) : rows.get(key)!).entries.push(entry);
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Hours over some people, each person's day on its own: overtime belongs to one person's day. */
function hoursOf(rows: TeamRow[]) {
  const sum = { total: 0, regular: 0, overtime: 0 };
  for (const row of rows) {
    for (const date of new Set(row.entries.map((entry) => entry.date))) {
      const day = dayHours(row.entries.filter((entry) => entry.date === date));
      sum.total += day.total;
      sum.regular += day.regular;
      sum.overtime += day.overtime;
    }
  }
  return sum;
}

/** The same people, with only their time on one day. */
const onDate = (rows: TeamRow[], iso: string) =>
  rows.map((row) => ({ ...row, entries: row.entries.filter((entry) => entry.date === iso) }));

const NOBODY: User[] = [];

/**
 * The team's time for the week that starts on `monday`, read while Team's time is open and read
 * again each time it opens, since a Member may have put time in meanwhile. An answer for a week no
 * longer on show is dropped, so stepping quickly never puts one week's time under another's name.
 */
function useTeamTime(open: boolean, monday: string) {
  const [answer, setAnswer] = useState<{ monday: string; entries: TimeEntry[]; people: User[] } | null>(null);
  const [problem, setProblem] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    let current = true;
    setProblem("");
    const read = async () => {
      try {
        const team = await fetchTeamTimeEntries(monday, shiftDay(monday, 6));
        // an answer that is not a week of time is a problem to say, not a page to break
        if (!Array.isArray(team.entries) || !Array.isArray(team.people)) throw new Error("The answer from BuildFlow was incomplete.");
        if (current) setAnswer({ monday, entries: latestFirst(team.entries), people: team.people });
      } catch (error) {
        if (current) setProblem(error instanceof Error ? error.message : "Your team's time could not be loaded.");
      }
    };
    void read();
    return () => {
      current = false;
    };
  }, [open, monday, attempt]);
  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  /* What an approval sends back takes those entries' places; every other entry stays as it was. */
  const merge = useCallback((changed: TimeEntry[]) => {
    const byId = new Map(changed.map((entry) => [entry.id, entry]));
    setAnswer((current) => (current ? { ...current, entries: current.entries.map((entry) => byId.get(entry.id) ?? entry) } : current));
  }, []);
  const shown = answer?.monday === monday ? answer : null;
  return { entries: shown?.entries ?? null, people: shown?.people ?? NOBODY, problem, retry, merge };
}

/** A person's entries still waiting on an Owner or Admin: everything not yet approved. */
const waitingOn = (row: TeamRow) => row.entries.filter((entry) => entry.status !== "Approved");

/** Whose approval an entry carries, by the approver's login: a name, or who it must have been. */
const approverName = (people: User[], accountId: string | null) =>
  people.find((person) => Boolean(accountId) && person.accountId === accountId)?.name ?? "an Owner or Admin";

/**
 * Team's time (2026-09-25): the week the Members put in, for an Owner or an Admin. The grid is the
 * Month calendar's week turned to the team, a person to a row; choosing a person there, or in the
 * list, narrows the entries under it to theirs. The last card is who has put nothing in, which is
 * what a week of timecards is usually opened to find out.
 *
 * Each person's week is approved from the end of their row (asked for the same day): the entries
 * still waiting, exactly the ones on show, go to the server, which answers with them approved. The
 * week is then read again, so time put in since the page was read shows up waiting rather than
 * hiding behind an "Approved". An approval made by mistake is reopened the same way.
 */
function TeamTimeTab({
  days,
  today,
  rows,
  people,
  loaded,
  problem,
  onRetry,
  onChanged,
  projects,
  thisWeek
}: {
  days: typeof weekDays;
  today: string;
  rows: TeamRow[];
  people: User[];
  loaded: boolean;
  problem: string;
  onRetry: () => void;
  onChanged: (entries: TimeEntry[]) => void;
  projects: BootstrapPayload["projects"];
  thisWeek: boolean;
}) {
  const [who, setWho] = useState("");
  const [working, setWorking] = useState<ReadonlySet<string>>(() => new Set());
  const [decisionProblem, setDecisionProblem] = useState("");
  const picked = rows.find((row) => row.key === who);
  const shown = picked ? [picked] : rows;
  const shownHours = hoursOf(shown);
  const missing = rows.filter((row) => row.entries.length === 0);
  const when = thisWeek ? "this week" : "that week";

  /* The week's problem is said once, with the way to try again, in the first card; the others wait on it. */
  const status = problem ? (
    <div className="tc-problem" role="alert">
      <span>Your team&apos;s time could not be loaded: {problem}</span>
      <button type="button" className="hs-btn tc-btn-sm" onClick={onRetry}>
        <RefreshCw size={14} aria-hidden="true" /> Try again
      </button>
    </div>
  ) : !loaded ? (
    <p className="tc-empty">Loading your team&apos;s time…</p>
  ) : null;
  const waiting = problem || !loaded ? <p className="tc-empty">{problem ? "Waiting on the week above." : "Loading…"}</p> : null;

  /** Approve a person's waiting entries, or reopen their approved ones. */
  const decide = async (row: TeamRow, approve: boolean) => {
    const ids = (approve ? waitingOn(row) : row.entries.filter((entry) => entry.status === "Approved")).map((entry) => entry.id);
    if (!ids.length) return;
    setWorking((current) => new Set(current).add(row.key));
    setDecisionProblem("");
    try {
      const { entries } = await (approve ? approveTimeEntries(ids) : reopenTimeEntries(ids));
      onChanged(entries);
      onRetry();
    } catch (error) {
      setDecisionProblem(
        `${row.name}'s timecard could not be ${approve ? "approved" : "reopened"}: ${error instanceof Error ? error.message : "try again."}`
      );
    } finally {
      setWorking((current) => {
        const next = new Set(current);
        next.delete(row.key);
        return next;
      });
    }
  };

  return (
    <>
      <Panel
        id="tc-panel-team-week"
        span={3}
        icon={CalendarDays}
        tone="violet"
        title="The week, person by person"
        subtitle={`Hours each person put in, day by day, and their timecard to approve · ${weekSpanLabel(days)}`}
        action={
          <ul className="tc-legend" aria-label="What the grid shows">
            <li>
              <i className="is-hours" aria-hidden="true" /> Hours
            </li>
            <li>
              <i className="is-ot" aria-hidden="true" /> Overtime
            </li>
            <li>
              <i className="is-today" aria-hidden="true" /> Today
            </li>
          </ul>
        }
      >
        {decisionProblem && (
          <p className="tc-problem is-inline" role="alert">
            <AlertTriangle size={14} aria-hidden="true" /> {decisionProblem}
          </p>
        )}
        {status ??
          (rows.length === 0 ? (
            <p className="tc-empty">
              Nobody puts their own time in here yet. Invite your crew as Members from Settings, and each person&apos;s week shows here.
            </p>
          ) : (
            <TeamWeekGrid
              rows={rows}
              days={days}
              today={today}
              picked={picked?.key ?? ""}
              onPick={(key) => setWho((current) => (current === key ? "" : key))}
              working={working}
              onApprove={(row) => void decide(row, true)}
              onReopen={(row) => void decide(row, false)}
              people={people}
            />
          ))}
      </Panel>

      <Panel
        id="tc-panel-team-entries"
        span={2}
        icon={Clock}
        tone="blue"
        title="Team's entries"
        subtitle={
          picked
            ? `${picked.name}'s time ${when} · ${hoursText(shownHours.total)}`
            : `Everything put in ${when} · ${hoursText(shownHours.total)}`
        }
        action={
          rows.length > 1 ? (
            <label className="tc-who">
              <span>Whose time</span>
              <select value={picked?.key ?? ""} onChange={(event) => setWho(event.target.value)}>
                <option value="">Everyone</option>
                {rows.map((row) => (
                  <option key={row.key} value={row.key}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
          ) : undefined
        }
      >
        {waiting ??
          (shown.some((row) => row.entries.length > 0) ? (
            <TeamEntriesTable rows={shown} projects={projects} people={people} />
          ) : (
            <p className="tc-empty">
              {picked
                ? `${picked.name} put no time in for ${when}.`
                : thisWeek
                  ? "Nobody has put time in for this week yet."
                  : "Nobody put time in for that week."}
            </p>
          ))}
      </Panel>

      <Panel
        id="tc-panel-team-missing"
        icon={loaded && rows.length > 0 && missing.length === 0 ? CheckCircle2 : AlertTriangle}
        tone={!loaded || rows.length === 0 ? "slate" : missing.length ? "amber" : "green"}
        title="No time put in"
        subtitle={`Members with nothing in ${when}`}
      >
        {waiting ??
          (rows.length === 0 ? (
            <p className="tc-empty">No Members yet.</p>
          ) : missing.length === 0 ? (
            <p className="tc-empty">Everyone has put time in {when}.</p>
          ) : (
            <ul className="tc-roster-list tc-missing">
              {missing.map((row) => (
                <li key={row.key}>
                  <Person worker={{ initials: row.avatar, name: row.name, role: row.sub }} small />
                </li>
              ))}
            </ul>
          ))}
      </Panel>
    </>
  );
}

/**
 * The week, person by person, with all seven days, since a Member can put a Sunday in. A day still
 * to come is dimmed. Each name is a way to that person's entries: pressed, the table under the grid
 * shows only theirs. The last column is their timecard: Approve while any of the week is waiting
 * (saying how much is new when some was approved before), Approved and a way to reopen it after.
 */
function TeamWeekGrid({
  rows,
  days,
  today,
  picked,
  onPick,
  working,
  onApprove,
  onReopen,
  people
}: {
  rows: TeamRow[];
  days: typeof weekDays;
  today: string;
  picked: string;
  onPick: (key: string) => void;
  working: ReadonlySet<string>;
  onApprove: (row: TeamRow) => void;
  onReopen: (row: TeamRow) => void;
  people: User[];
}) {
  const figure = (hours: { total: number; overtime: number }) =>
    hours.total === 0 ? (
      <span className="tc-week-empty">—</span>
    ) : (
      <>
        <strong>{tenths(hours.total)}</strong>
        <span className="tc-week-unit">hrs</span>
        {hours.overtime > 0 && <em className="tc-week-ot">+{tenths(hours.overtime)} OT</em>}
      </>
    );
  const dayClass = (iso: string, overtime = 0) =>
    [iso === today ? "is-today" : "", iso > today ? "is-future" : "", overtime > 0 ? "has-ot" : ""].filter(Boolean).join(" ") || undefined;
  const timecard = (row: TeamRow) => {
    if (!row.entries.length) return <span className="tc-week-empty">—</span>;
    const waiting = waitingOn(row);
    const busy = working.has(row.key);
    if (waiting.length) {
      return (
        <>
          <button
            type="button"
            className="hs-btn hs-btn-primary tc-btn-sm tc-approve"
            aria-label={`Approve ${row.name}'s timecard`}
            disabled={busy}
            onClick={() => onApprove(row)}
          >
            <Check size={14} aria-hidden="true" />
            {busy ? "Approving…" : "Approve"}
          </button>
          {waiting.length < row.entries.length && <span className="tc-approval-note">{waiting.length} new since approval</span>}
        </>
      );
    }
    const last = row.entries.reduce((latest, entry) => ((entry.approvedAt ?? "") > (latest.approvedAt ?? "") ? entry : latest));
    return (
      <>
        <span
          className="tc-approved"
          title={`Approved by ${approverName(people, last.approvedBy)}${last.approvedAt ? ` · ${putInLabel(last.approvedAt)}` : ""}`}
        >
          <CheckCircle2 size={14} aria-hidden="true" /> Approved
        </span>
        <button
          type="button"
          className="tc-reopen"
          aria-label={`Reopen ${row.name}'s timecard`}
          disabled={busy}
          onClick={() => onReopen(row)}
        >
          {busy ? "Reopening…" : "Reopen"}
        </button>
      </>
    );
  };
  const withTime = rows.filter((row) => row.entries.length > 0);
  const approved = withTime.filter((row) => waitingOn(row).length === 0).length;

  return (
    <div className="tc-week-scroll">
      <table className="tc-week is-team">
        <caption className="sr-only">Hours each person put in on each day of {weekSpanLabel(days)}</caption>
        <thead>
          <tr>
            <th scope="col" className="tc-week-crew">
              Person
            </th>
            {days.map((day) => (
              <th scope="col" key={day.date} className={dayClass(day.date)}>
                <span className="tc-week-dow">{day.day}</span>
                <span className="tc-week-date">{day.label}</span>
              </th>
            ))}
            <th scope="col" className="tc-week-total">
              Week
            </th>
            <th scope="col" className="tc-week-approval">
              Timecard
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="tc-week-crew">
                <button
                  type="button"
                  className="tc-week-person"
                  aria-pressed={picked === row.key}
                  title={picked === row.key ? "Show everyone's entries" : `Show only ${row.name}'s entries`}
                  onClick={() => onPick(row.key)}
                >
                  <span className="hs-avatar is-small" aria-hidden="true">
                    {row.avatar}
                  </span>
                  <span className="tc-week-person-text">
                    <span className="tc-week-crew-name">{row.name}</span>
                    <span className="tc-week-crew-task">{row.sub}</span>
                  </span>
                </button>
              </th>
              {days.map((day) => {
                const hours = dayHours(row.entries.filter((entry) => entry.date === day.date));
                return (
                  <td key={day.date} className={dayClass(day.date, hours.overtime)}>
                    {figure(hours)}
                  </td>
                );
              })}
              <td className="tc-week-total">{figure(hoursOf([row]))}</td>
              <td className="tc-week-approval">{timecard(row)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="tc-week-crew">
              Everyone
            </th>
            {days.map((day) => (
              <td key={day.date} className={dayClass(day.date)}>
                {figure(hoursOf(onDate(rows, day.date)))}
              </td>
            ))}
            <td className="tc-week-total">{figure(hoursOf(rows))}</td>
            <td className="tc-week-approval">{withTime.length ? `${approved} of ${withTime.length} approved` : "—"}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * The entries behind the grid, a day to a group, the latest day first; inside a day, person by
 * person and each person's stretches in the order they worked them. A day's overtime is said once
 * per person, on their first stretch. "Put in" is when it reached BuildFlow, with how long after
 * the day worked when it was not the same day. It sits in a card two thirds wide, so a stretch is
 * one column — in to out, with its break under it — and a person's level is left out unless it is
 * news (everyone here is a Member but the Owner, an Admin, or someone removed).
 */
function TeamEntriesTable({ rows, projects, people }: { rows: TeamRow[]; projects: BootstrapPayload["projects"]; people: User[] }) {
  const whose = new Map<string, TeamRow>();
  for (const row of rows) for (const entry of row.entries) whose.set(entry.id, row);
  const all = rows.flatMap((row) => row.entries);
  const dates = [...new Set(all.map((entry) => entry.date))].sort().reverse();

  const body: ReactNode[] = [];
  for (const date of dates) {
    const onDay = all
      .filter((entry) => entry.date === date)
      .sort((a, b) => whose.get(a.id)!.name.localeCompare(whose.get(b.id)!.name) || a.clockIn.localeCompare(b.clockIn));
    const present = new Set(onDay.map((entry) => whose.get(entry.id)!.key));
    body.push(
      <tr key={`day-${date}`} className="tc-group">
        <th colSpan={6} scope="rowgroup">
          {dayLabel(date)} · {present.size} {present.size === 1 ? "person" : "people"} · {hoursText(hoursOf(onDate(rows, date)).total)}
        </th>
      </tr>
    );
    const told = new Set<string>();
    for (const entry of onDay) {
      const row = whose.get(entry.id)!;
      const overtime = told.has(row.key) ? 0 : dayHours(row.entries.filter((other) => other.date === date)).overtime;
      told.add(row.key);
      const project = projects.find((item) => item.id === entry.projectId);
      const late = daysAfter(entry);
      body.push(
        <tr key={entry.id}>
          <td>
            <Person worker={{ initials: row.avatar, name: row.name, role: row.sub === LEVEL_NAMES.member ? "" : row.sub }} small />
          </td>
          <td>
            <span className="tc-cell-strong tc-nowrap">
              {clockLabel(entry.clockIn)} – {clockLabel(entry.clockOut)}
            </span>
            {entry.breakMinutes > 0 && <span className="hs-row-sub">{entry.breakMinutes} min break</span>}
          </td>
          <td className="num">
            {tenths(workedMinutes(entry) / 60)}
            {overtime > 0 && <b className="tc-ot tc-ot-day">day +{tenths(overtime)} OT</b>}
          </td>
          <td className="hs-cell-muted">
            {entry.projectId ? (project?.name ?? "A removed project") : "—"}
            {entry.notes && <span className="hs-row-sub">{entry.notes}</span>}
          </td>
          <td className="hs-cell-muted">
            <span className="tc-nowrap">{putInLabel(entry.createdAt)}</span>
            {late > 0 && <span className="hs-row-sub">{late === 1 ? "the next day" : `${late} days after`}</span>}
          </td>
          <td>
            <Badge tone={entry.status === "Approved" ? "green" : "blue"}>{entry.status}</Badge>
            {entry.status === "Approved" && <span className="hs-row-sub">by {approverName(people, entry.approvedBy)}</span>}
          </td>
        </tr>
      );
    }
  }

  return (
    <div className="hs-table-wrap">
      <table className="hs-table tc-table">
        <thead>
          <tr>
            <th>Person</th>
            <th>Time</th>
            <th className="num">Hours</th>
            <th>Project</th>
            <th>Put in</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A Member's TimeCard: putting in your own time
// ---------------------------------------------------------------------------

type MyTab = "log" | "history";

const MY_TABS: Array<{ id: MyTab; label: string; icon: typeof Clock; about: string }> = [
  {
    id: "log",
    label: "Put in time",
    icon: Clock,
    about: "Pick the day you worked, then when you clocked in and when you clocked out. A day worked in two stretches is two entries."
  },
  { id: "history", label: "History", icon: History, about: "Every hour you have put in, week by week, the latest first." }
];

const BREAKS = [
  { minutes: 0, label: "No break" },
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 45, label: "45 min" },
  { minutes: 60, label: "1 hr" }
];

/** "15:30" as the jobsite reads it: "3:30 PM". */
function clockLabel(value: string) {
  const minutes = clockMinutes(value);
  if (Number.isNaN(minutes)) return value;
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/** "2026-09-24" as "Thu, Sep 24". */
function dayLabel(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** The Monday of the week a day falls in: how History groups your time. */
function mondayOf(iso: string) {
  const day = new Date(`${iso}T00:00:00`);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return localIsoDate(day);
}

/** The clock right now, as a time field wants it. */
function clockNow() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/** Hours to one decimal, as a figure: 8.5, not 8.500000001. */
const tenths = (hours: number) => Math.round(hours * 10) / 10;

/** Hours as words: "8.5 hrs", and "1 hr" rather than "1 hrs". */
const hoursText = (hours: number) => `${tenths(hours)} ${tenths(hours) === 1 ? "hr" : "hrs"}`;

/** "7:00 AM" held together, so a narrow day tile breaks a stretch at its dash and never inside a time. */
const unbroken = (label: string) => label.replace(" ", "\u00a0");

/** Your time in the order the server keeps it: the latest day first, the latest stretch of a day first. */
const latestFirst = (entries: TimeEntry[]) =>
  [...entries].sort((a, b) => (a.date === b.date ? b.clockIn.localeCompare(a.clockIn) : b.date.localeCompare(a.date)));

function MyTimeCard({ data }: { data: BootstrapPayload }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useHudMotion(rootRef);
  const formRef = useRef<HTMLFormElement>(null);
  const [tab, setTab] = useState<MyTab>("log");
  const [switched, setSwitched] = useState(false);
  /** null until the first answer comes back, so an empty week and a week still loading read differently. */
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [loadProblem, setLoadProblem] = useState("");
  const today = localIsoDate();
  /* The form's day lives here, not in the form, so picking a day on the week above can set it. */
  const [date, setDate] = useState(today);

  const load = useCallback(async () => {
    setLoadProblem("");
    try {
      setEntries(latestFirst((await fetchTimeEntries()).entries));
    } catch (error) {
      setLoadProblem(error instanceof Error ? error.message : "Your time could not be loaded.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const mine = entries ?? [];
  const onDay = (iso: string) => mine.filter((entry) => entry.date === iso);
  const week = weekDays;
  const weekLabel = weekSpanLabel(week);
  const thisWeek = mine.filter((entry) => entry.date >= week[0].date && entry.date <= week[6].date);
  const weekTotals = week.reduce(
    (sum, day) => {
      const hours = dayHours(onDay(day.date));
      return { total: sum.total + hours.total, regular: sum.regular + hours.regular, overtime: sum.overtime + hours.overtime };
    },
    { total: 0, regular: 0, overtime: 0 }
  );
  const todays = onDay(today);
  const daysWorked = week.filter((day) => onDay(day.date).length > 0).length;
  const todaySpan = todays.length
    ? `in ${clockLabel(todays.map((entry) => entry.clockIn).sort()[0])} · out ${clockLabel(
        todays
          .map((entry) => entry.clockOut)
          .sort()
          .reverse()[0]
      )}`
    : "Nothing put in yet today";
  const stamp = todayStamp();
  const active = MY_TABS.find((item) => item.id === tab) ?? MY_TABS[0];

  const choose = (next: MyTab) => {
    if (next === tab) return;
    setTab(next);
    setSwitched(true);
  };
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const to = tabStep(
      event.key,
      MY_TABS.findIndex((item) => item.id === tab),
      MY_TABS.length
    );
    if (to < 0) return;
    event.preventDefault();
    choose(MY_TABS[to].id);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[to]?.focus();
  };

  /** A day on the week above: the form takes it, and the cursor goes to when you started. */
  const pickDay = (iso: string) => {
    setDate(iso);
    formRef.current?.querySelector<HTMLInputElement>('input[name="clockIn"]')?.focus();
  };
  const added = (entry: TimeEntry) => setEntries((current) => latestFirst([entry, ...(current ?? [])]));
  const removed = (id: string) => setEntries((current) => (current ?? []).filter((entry) => entry.id !== id));

  /** Your time as a spreadsheet, every entry you have put in. */
  const exportMine = () => {
    const header = ["Date", "Clock in", "Clock out", "Break (minutes)", "Hours", "Project", "Notes", "Status"];
    const rows = mine.map((entry) => [
      entry.date,
      entry.clockIn,
      entry.clockOut,
      entry.breakMinutes,
      tenths(workedMinutes(entry) / 60),
      data.projects.find((project) => project.id === entry.projectId)?.name ?? "",
      entry.notes,
      entry.status
    ]);
    downloadCsv([header, ...rows], `buildflow-my-time-${today}.csv`);
  };

  const loading = entries === null && !loadProblem;
  const status = loadProblem ? (
    <div className="tc-problem" role="alert">
      <span>Your time could not be loaded: {loadProblem}</span>
      <button type="button" className="hs-btn tc-btn-sm" onClick={() => void load()}>
        <RefreshCw size={14} aria-hidden="true" /> Try again
      </button>
    </div>
  ) : loading ? (
    <p className="tc-empty">Loading your time…</p>
  ) : null;

  return (
    <div className="page-stack tc-page tc-rx hs-index is-mine" ref={rootRef}>
      <div className="dx-bg" aria-hidden="true">
        <span className="dx-aurora dx-aurora-1" />
        <span className="dx-aurora dx-aurora-2" />
        <span className="dx-aurora dx-aurora-3" />
      </div>
      <div className="dx-cursor" aria-hidden="true" />

      <header className="tc-hero" data-tutorial-id="timecard-page-title">
        <span className="tc-eyebrow">
          <span className="tc-dot" aria-hidden="true" />
          Time Cards · {weekLabel}
        </span>
        <div className="tc-title-row">
          <h1 className="tc-title">
            <TextReveal text="TimeCard" />
          </h1>
          <span className="tc-title-tag is-neutral" title="Members put in their own time here">
            Member
          </span>
        </div>
        <p className="tc-sub">Put in the hours you worked: the day, when you clocked in and when you clocked out · {weekLabel}</p>
      </header>
      <div className="tc-controls">
        <span className="tc-week-chip">
          <CalendarClock size={16} aria-hidden="true" />
          {weekLabel}
        </span>
        <button type="button" className="hs-btn tc-export" onClick={exportMine} disabled={!mine.length}>
          <Download size={15} aria-hidden="true" />
          Export
        </button>
      </div>

      <p className="tc-preview is-mine" role="note">
        <span className="tc-preview-ico" aria-hidden="true">
          <Clock size={16} />
        </span>
        <span>
          <strong>Your time.</strong> What you put in is saved to this workspace the moment you submit it, and your Owner or Admin approves
          it from their TimeCard. Worked the day in two stretches? Put each one in. A mistake can be removed from{" "}
          <strong>Your entries</strong> and put in again, until it has been approved.
        </span>
      </p>

      <section className="hs-kpis" aria-label="Your time this week">
        <Kpi
          icon={Clock}
          tone="blue"
          label="Hours this week"
          value={hoursText(weekTotals.total)}
          note={`${hoursText(weekTotals.regular)} regular`}
        />
        <Kpi icon={CalendarCheck} tone="green" label="Today" value={hoursText(dayHours(todays).total)} note={todaySpan} />
        <Kpi
          icon={CalendarDays}
          tone="violet"
          label="Days worked"
          value={String(daysWorked)}
          note={`this week, of ${tcWorkDays.length} working days`}
        />
        <Kpi
          icon={Timer}
          tone="amber"
          label="Overtime this week"
          value={hoursText(weekTotals.overtime)}
          note={`past ${DAILY_OVERTIME_HOURS} hrs in a day`}
        />
      </section>

      <div className="hs-index-main">
        <section className="hs-index-card tc-board" aria-labelledby="tc-section-title">
          <div className="tc-board-head">
            <span className="tc-datestamp" aria-hidden="true">
              <span className="tc-datestamp-month">{stamp.month}</span>
              <span className="tc-datestamp-day">{stamp.day}</span>
            </span>
            <div className="tc-board-heading">
              <h2 id="tc-section-title">{active.label}</h2>
              <p>{active.about}</p>
            </div>
            <span className="hs-count-pill tc-board-meta">
              {tab === "log" ? `${thisWeek.length} entries this week` : `${mine.length} entries in all`}
            </span>
          </div>
          <div className="hs-views tc-views" role="tablist" aria-label="Your TimeCard">
            {MY_TABS.map((item) => {
              const Icon = item.icon;
              const selected = tab === item.id;
              const count = item.id === "log" ? thisWeek.length : mine.length;
              return (
                <button
                  key={item.id}
                  id={`tc-tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="tc-section"
                  tabIndex={selected ? 0 : -1}
                  className={`hs-view${selected ? " active" : ""}`}
                  onClick={() => choose(item.id)}
                  onKeyDown={onTabKey}
                >
                  <Icon aria-hidden="true" />
                  {item.label}
                  {entries !== null && <span className="hs-view-count">{count}</span>}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div
        key={tab}
        id="tc-section"
        role="tabpanel"
        aria-labelledby={`tc-tab-${tab}`}
        className={`tc-grid${switched ? " is-switched" : ""}`}
      >
        {tab === "log" ? (
          <>
            <Panel
              id="tc-panel-my-week"
              span={3}
              icon={CalendarDays}
              tone="violet"
              title="This week"
              subtitle={`Pick a day to put time in for it · ${weekLabel}`}
              action={
                <ul className="tc-legend" aria-label="What the days show">
                  <li>
                    <i className="is-hours" aria-hidden="true" /> Hours
                  </li>
                  <li>
                    <i className="is-ot" aria-hidden="true" /> Overtime
                  </li>
                  <li>
                    <i className="is-today" aria-hidden="true" /> Today
                  </li>
                  <li>
                    <i className="is-picked" aria-hidden="true" /> Picked
                  </li>
                </ul>
              }
            >
              <WeekStrip days={week} today={today} picked={date} entriesOn={onDay} onPick={pickDay} />
            </Panel>

            <Panel
              id="tc-panel-put-in"
              icon={Plus}
              tone="green"
              title="Put in your time"
              subtitle="The day, and when you clocked in and out"
            >
              <MyTimeForm
                formRef={formRef}
                date={date}
                setDate={setDate}
                today={today}
                entries={mine}
                projects={data.projects}
                onAdded={added}
              />
            </Panel>

            <Panel
              id="tc-panel-my-entries"
              span={2}
              icon={Clock}
              tone="blue"
              title="Your entries"
              subtitle={`What you have put in this week · ${hoursText(weekTotals.total)}`}
            >
              {status ??
                (thisWeek.length === 0 ? (
                  <p className="tc-empty">Nothing put in yet this week. Pick a day above, or start with today.</p>
                ) : (
                  <MyEntriesTable entries={thisWeek} all={mine} projects={data.projects} people={data.users} onRemoved={removed} />
                ))}
            </Panel>
          </>
        ) : (
          <>
            <Panel id="tc-panel-my-history" span={2} icon={History} title="All your time" subtitle="Every entry, week by week">
              {status ??
                (mine.length === 0 ? (
                  <p className="tc-empty">You have not put any time in yet. It starts on Put in time.</p>
                ) : (
                  <MyEntriesTable entries={mine} all={mine} projects={data.projects} people={data.users} onRemoved={removed} grouped />
                ))}
            </Panel>
            <Panel
              id="tc-panel-my-weeks"
              icon={TrendingUp}
              tone="green"
              title="Your weeks"
              subtitle="Hours each week, against a 40-hour week"
            >
              {status ?? <MyWeeks entries={mine} />}
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The week, a day to a tile — the Month calendar's days, for one person. A tile says what that day
 * already holds and picking it puts the day in the form below; a day that has not come yet cannot
 * be picked. Today is outlined, the day the form is on is filled.
 */
function WeekStrip({
  days,
  today,
  picked,
  entriesOn,
  onPick
}: {
  days: typeof weekDays;
  today: string;
  picked: string;
  entriesOn: (iso: string) => TimeEntry[];
  onPick: (iso: string) => void;
}) {
  return (
    <div className="tc-days-scroll">
      <div className="tc-days" role="group" aria-label="Days this week">
        {days.map((day) => {
          const here = entriesOn(day.date).sort((a, b) => a.clockIn.localeCompare(b.clockIn));
          const hours = dayHours(here);
          const future = day.date > today;
          const classes = [
            "tc-day",
            day.date === today ? "is-today" : "",
            day.date === picked ? "is-picked" : "",
            future ? "is-future" : "",
            here.length ? "has-time" : ""
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={day.date}
              type="button"
              className={classes}
              aria-pressed={day.date === picked}
              disabled={future}
              onClick={() => onPick(day.date)}
              aria-label={`${dayLabel(day.date)}: ${here.length ? hoursText(hours.total) : future ? "still to come" : "nothing put in"}`}
            >
              <span className="tc-day-head">
                <span className="tc-day-dow">{day.day}</span>
                <span className="tc-day-date">{day.label}</span>
              </span>
              {here.length ? (
                <>
                  <span className="tc-day-hours">
                    <strong>{tenths(hours.total)}</strong> hrs
                  </span>
                  {hours.overtime > 0 && <em className="tc-day-ot">+{tenths(hours.overtime)} OT</em>}
                  <span className="tc-day-stretches">
                    {here.map((entry) => (
                      <span key={entry.id} className="tc-day-stretch">
                        {unbroken(clockLabel(entry.clockIn))} – {unbroken(clockLabel(entry.clockOut))}
                      </span>
                    ))}
                  </span>
                </>
              ) : (
                !future && <span className="tc-day-add">+ Put in time</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The form a Member puts time in with. It checks what the server checks before sending — a day that
 * has come, clocking out after clocking in, a break shorter than the time, no overlap with what the
 * day already holds — so the answer is immediate; whatever the server still refuses comes back
 * under the field it names.
 */
function MyTimeForm({
  formRef,
  date,
  setDate,
  today,
  entries,
  projects,
  onAdded
}: {
  formRef: RefObject<HTMLFormElement | null>;
  date: string;
  setDate: (next: string) => void;
  today: string;
  entries: TimeEntry[];
  projects: BootstrapPayload["projects"];
  onAdded: (entry: TimeEntry) => void;
}) {
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [projectId, setProjectId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<{ field: string; message: string } | null>(null);
  const [saved, setSaved] = useState<TimeEntry | null>(null);

  const draft = clockIn && clockOut ? { clockIn, clockOut, breakMinutes } : null;
  const worked = draft ? workedMinutes(draft) : Number.NaN;
  const sameDay = entries.filter((entry) => entry.date === date);
  const day = draft && worked > 0 ? dayHours([...sameDay, draft]) : null;

  /** What is wrong with the form as it stands, the way the server would say it. */
  const check = (): { field: string; message: string } | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { field: "date", message: "Pick the day you worked." };
    if (date > today) return { field: "date", message: "Time can only be put in for a day you have worked." };
    if (!clockIn) return { field: "clockIn", message: "Put in the time you started." };
    if (!clockOut) return { field: "clockOut", message: "Put in the time you finished." };
    const span = clockMinutes(clockOut) - clockMinutes(clockIn);
    if (span <= 0) return { field: "clockOut", message: "Clocking out has to come after clocking in." };
    if (breakMinutes >= span) return { field: "breakMinutes", message: "The break is as long as the time worked." };
    const clash = sameDay.find(
      (entry) => clockMinutes(clockIn) < clockMinutes(entry.clockOut) && clockMinutes(entry.clockIn) < clockMinutes(clockOut)
    );
    if (clash) {
      return { field: "clockIn", message: `That overlaps the time you already put in for this day, ${clash.clockIn}–${clash.clockOut}.` };
    }
    return null;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaved(null);
    const wrong = check();
    setProblem(wrong);
    if (wrong) return;
    const input: TimeEntryInput = { date, clockIn, clockOut, breakMinutes, projectId: projectId || null, notes: notes.trim() };
    setSaving(true);
    try {
      const entry = await createTimeEntry(input);
      onAdded(entry);
      setSaved(entry);
      // ready for the next stretch: the day and the project stay, the times and the note go
      setClockIn("");
      setClockOut("");
      setNotes("");
    } catch (error) {
      setProblem({
        field: error instanceof ApiError && error.field ? error.field : "",
        message: error instanceof Error ? error.message : "Your time could not be saved. Try again."
      });
    } finally {
      setSaving(false);
    }
  };

  const latest = entries[0];
  /* The jobsite shortcuts, as on the Owner's page: each one fills part of the form, none of them submits. */
  const quick: Array<{ label: string; run: () => void; disabled?: boolean }> = [
    {
      label: "Clock in now",
      run: () => {
        setDate(today);
        setClockIn(clockNow());
      }
    },
    {
      label: "Clock out now",
      run: () => {
        setDate(today);
        setClockOut(clockNow());
      }
    },
    {
      label: "Standard day",
      run: () => {
        setClockIn("07:00");
        setClockOut("15:30");
        setBreakMinutes(30);
      }
    },
    {
      label: "Same as last time",
      disabled: !latest,
      run: () => {
        if (!latest) return;
        setClockIn(latest.clockIn);
        setClockOut(latest.clockOut);
        setBreakMinutes(latest.breakMinutes);
        setProjectId(latest.projectId ?? "");
      }
    }
  ];

  const fieldProps = (field: string) =>
    problem?.field === field ? { "aria-invalid": true, "aria-describedby": "tc-form-problem" } : { "aria-invalid": false };
  const fieldClass = (field: string, wide = false) => `tc-field${wide ? " is-wide" : ""}${problem?.field === field ? " is-invalid" : ""}`;

  return (
    <>
      <form ref={formRef} className="tc-form" onSubmit={(event) => void submit(event)} noValidate>
        <label className={fieldClass("date", true)}>
          <span>Date</span>
          <input
            type="date"
            name="date"
            value={date}
            max={today}
            required
            onChange={(event) => setDate(event.target.value)}
            {...fieldProps("date")}
          />
        </label>
        <label className={fieldClass("clockIn")}>
          <span>Time in</span>
          <input
            type="time"
            name="clockIn"
            value={clockIn}
            required
            onChange={(event) => setClockIn(event.target.value)}
            {...fieldProps("clockIn")}
          />
        </label>
        <label className={fieldClass("clockOut")}>
          <span>Time out</span>
          <input
            type="time"
            name="clockOut"
            value={clockOut}
            required
            onChange={(event) => setClockOut(event.target.value)}
            {...fieldProps("clockOut")}
          />
        </label>
        <label className={fieldClass("breakMinutes")}>
          <span>Unpaid break</span>
          <select
            name="breakMinutes"
            value={breakMinutes}
            onChange={(event) => setBreakMinutes(Number(event.target.value))}
            {...fieldProps("breakMinutes")}
          >
            {BREAKS.map((item) => (
              <option key={item.minutes} value={item.minutes}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldClass("projectId")}>
          <span>Project</span>
          <select name="projectId" value={projectId} onChange={(event) => setProjectId(event.target.value)} {...fieldProps("projectId")}>
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldClass("notes", true)}>
          <span>What you worked on</span>
          <input name="notes" value={notes} maxLength={500} placeholder="Optional" onChange={(event) => setNotes(event.target.value)} />
        </label>
        {problem && (
          <p className="tc-problem is-inline" id="tc-form-problem" role="alert">
            <AlertTriangle size={14} aria-hidden="true" /> {problem.message}
          </p>
        )}
        <div className="tc-submit">
          <span className="tc-estimate">
            <span className="tc-estimate-label">Total</span>
            <strong>{worked > 0 ? hoursText(worked / 60) : "—"}</strong>
            <em>
              {day
                ? day.overtime > 0
                  ? `${dayLabel(date)} comes to ${hoursText(day.total)}, ${hoursText(day.overtime)} overtime`
                  : `${dayLabel(date)} comes to ${hoursText(day.total)}`
                : "Put in when you clocked in and out"}
            </em>
          </span>
          <button type="submit" className="hs-btn hs-btn-primary" disabled={saving}>
            <Plus size={16} aria-hidden="true" />
            {saving ? "Saving…" : "Submit time"}
          </button>
        </div>
      </form>
      {saved && (
        <p className="tc-inline-success" role="status">
          <CheckCircle2 size={16} aria-hidden="true" /> Time put in for {dayLabel(saved.date)}, {clockLabel(saved.clockIn)} to{" "}
          {clockLabel(saved.clockOut)}.
        </p>
      )}
      <div className="tc-quick" role="group" aria-label="Quick set">
        <span className="tc-quick-label">Quick set</span>
        {quick.map((chip) => (
          <button type="button" key={chip.label} className="tc-quick-chip" onClick={chip.run} disabled={chip.disabled}>
            {chip.label}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * A person's entries as the index pages' table. Removing one takes two presses — the first asks —
 * because the entry is saved and there is no undo. `grouped` puts a week's heading above each week.
 */
function MyEntriesTable({
  entries,
  all,
  projects,
  people,
  onRemoved,
  grouped = false
}: {
  entries: TimeEntry[];
  /** Every entry the person has, so a day's overtime counts the stretches not on show too. */
  all: TimeEntry[];
  projects: BootstrapPayload["projects"];
  /** The roster, to name whoever approved an entry. */
  people: User[];
  onRemoved: (id: string) => void;
  grouped?: boolean;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [problem, setProblem] = useState("");

  const remove = async (entry: TimeEntry) => {
    if (confirming !== entry.id) {
      setConfirming(entry.id);
      return;
    }
    setRemoving(entry.id);
    setProblem("");
    try {
      await deleteTimeEntry(entry.id);
      onRemoved(entry.id);
      setConfirming(null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That entry could not be removed. Try again.");
    } finally {
      setRemoving(null);
    }
  };

  const overtimeOn = (iso: string) => dayHours(all.filter((entry) => entry.date === iso)).overtime;
  const rows: ReactNode[] = [];
  let weekOf = "";
  /* A day's overtime belongs to the day, so it is said once, on the day's latest stretch (the
     first one listed), rather than on every stretch as though each had earned it. */
  const toldOvertime = new Set<string>();
  for (const entry of entries) {
    if (grouped && mondayOf(entry.date) !== weekOf) {
      weekOf = mondayOf(entry.date);
      const weekHours = new Set(entries.filter((other) => mondayOf(other.date) === weekOf).map((other) => other.date));
      const total = [...weekHours].reduce((sum, iso) => sum + dayHours(all.filter((other) => other.date === iso)).total, 0);
      rows.push(
        <tr key={`week-${weekOf}`} className="tc-group">
          <th colSpan={8} scope="rowgroup">
            Week of {dayLabel(weekOf).replace(/^\w+, /, "")} · {hoursText(total)}
          </th>
        </tr>
      );
    }
    const project = projects.find((item) => item.id === entry.projectId);
    const overtime = toldOvertime.has(entry.date) ? 0 : overtimeOn(entry.date);
    toldOvertime.add(entry.date);
    rows.push(
      <tr key={entry.id}>
        <td className="tc-nowrap">
          <span className="tc-cell-strong">{dayLabel(entry.date)}</span>
          {entry.notes && <span className="hs-row-sub">{entry.notes}</span>}
        </td>
        <td className="tc-nowrap">{clockLabel(entry.clockIn)}</td>
        <td className="tc-nowrap">{clockLabel(entry.clockOut)}</td>
        <td className="hs-cell-muted tc-nowrap">{entry.breakMinutes ? `${entry.breakMinutes} min` : "—"}</td>
        <td className="num">
          {tenths(workedMinutes(entry) / 60)}
          {overtime > 0 && <b className="tc-ot"> · day +{tenths(overtime)} OT</b>}
        </td>
        <td className="hs-cell-muted">{entry.projectId ? (project?.name ?? "A removed project") : "—"}</td>
        <td>
          <Badge tone={entry.status === "Approved" ? "green" : "blue"}>{entry.status}</Badge>
          {entry.status === "Approved" && <span className="hs-row-sub">by {approverName(people, entry.approvedBy)}</span>}
        </td>
        <td className="hs-cell-actions">
          {/* Approved time is past being yours alone to take back: an Owner or Admin reopens it first. */}
          {entry.status === "Approved" ? (
            <span className="tc-locked" title="Approved. Ask an Owner or Admin to reopen it if it needs to change.">
              <Lock size={14} aria-hidden="true" />
              <span className="sr-only">Approved, so it can no longer be removed</span>
            </span>
          ) : (
            <button
              type="button"
              className={`hs-row-action tc-remove${confirming === entry.id ? " is-confirming" : ""}`}
              aria-label={
                confirming === entry.id
                  ? `Confirm removing ${dayLabel(entry.date)}, ${entry.clockIn}–${entry.clockOut}`
                  : `Remove ${dayLabel(entry.date)}, ${entry.clockIn}–${entry.clockOut}`
              }
              title="Remove this entry"
              disabled={removing === entry.id}
              onClick={() => void remove(entry)}
              onBlur={() => setConfirming((current) => (current === entry.id ? null : current))}
            >
              {confirming === entry.id ? "Remove?" : <Trash2 size={15} aria-hidden="true" />}
            </button>
          )}
        </td>
      </tr>
    );
  }

  return (
    <>
      {problem && (
        <p className="tc-problem is-inline" role="alert">
          <AlertTriangle size={14} aria-hidden="true" /> {problem}
        </p>
      )}
      <div className="hs-table-wrap">
        <table className="hs-table tc-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>In</th>
              <th>Out</th>
              <th>Break</th>
              <th className="num">Hours</th>
              <th>Project</th>
              <th>Status</th>
              <th className="hs-cell-actions" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
    </>
  );
}

/** A person's weeks, the latest first, each against a 40-hour week. */
function MyWeeks({ entries }: { entries: TimeEntry[] }) {
  const weeks = [...new Set(entries.map((entry) => mondayOf(entry.date)))].sort().reverse().slice(0, 8);
  if (!weeks.length) return <p className="tc-empty">Your weeks show here once you have put time in.</p>;
  const rows = weeks.map((monday) => {
    const days = [...new Set(entries.filter((entry) => mondayOf(entry.date) === monday).map((entry) => entry.date))];
    const hours = days.reduce(
      (sum, iso) => {
        const day = dayHours(entries.filter((entry) => entry.date === iso));
        return { total: sum.total + day.total, overtime: sum.overtime + day.overtime };
      },
      { total: 0, overtime: 0 }
    );
    const inWeek = entries.filter((entry) => mondayOf(entry.date) === monday);
    const approved = inWeek.filter((entry) => entry.status === "Approved").length;
    const standing = approved === inWeek.length ? "approved" : approved === 0 ? "waiting on approval" : "partly approved";
    return { monday, days: days.length, standing, ...hours };
  });
  const most = Math.max(40, ...rows.map((row) => row.total));
  return (
    <ul className="tc-budget tc-weeks">
      {rows.map((row) => (
        <li className="tc-budget-row" key={row.monday}>
          <div className="tc-budget-label">
            <span className="tc-cell-strong">Week of {dayLabel(row.monday).replace(/^\w+, /, "")}</span>
            <span className="hs-row-sub">
              {row.days} {row.days === 1 ? "day" : "days"}
              {row.overtime > 0 ? ` · ${hoursText(row.overtime)} overtime` : ""} · {row.standing}
            </span>
          </div>
          <div className="tc-budget-track">
            <Meter value={row.total} max={most} tone={row.total > 40 ? "amber" : "green"} />
          </div>
          <strong className="tc-budget-cost">
            <AnimatedFigure text={hoursText(row.total)} />
          </strong>
        </li>
      ))}
    </ul>
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

/** The day a new entry is logged against (the model's working "today", which the Dashboard's cards read too). */
const ENTRY_DAY = tcWorkDays[3];

/**
 * The week, person by person — the Month calendar's grid turned to the timesheet's shape. It was
 * crew by crew until 2026-09-25, when the ask was each person's hours instead of a crew's total: a
 * person's crew is now the line under their name, and crew-mates sit together. Every cell is what
 * the entries already say: that person's hours on that day, the overtime in them, and whether any of
 * them are still on a device waiting to sync. Today is the dark day, as it is on Month.
 */
function WeekGrid({ model, entries }: { model: Model; entries: TcEntry[] }) {
  const todayIso = weekDays.find((day) => day.date === localIsoDate())?.date;
  const cell = (workerId: string | null, date: string | null) => {
    const here = entries.filter((entry) => (workerId === null || entry.workerId === workerId) && (date === null || entry.date === date));
    return {
      hours: here.reduce((sum, entry) => sum + entryHours(entry), 0),
      overtime: here.reduce((sum, entry) => sum + entry.overtimeHours, 0),
      offline: here.filter((entry) => !entry.synced).length
    };
  };
  /* A day's cell also marks entries still waiting on a device; the totals leave that to the sync strip. */
  const figure = (value: { hours: number; overtime: number; offline: number }, markOffline = false) =>
    value.hours === 0 ? (
      <span className="tc-week-empty">—</span>
    ) : (
      <>
        <strong>{Math.round(value.hours)}</strong>
        <span className="tc-week-unit">hrs</span>
        {value.overtime > 0 && <em className="tc-week-ot">+{Math.round(value.overtime)} OT</em>}
        {markOffline && value.offline > 0 && (
          <span className="tc-week-offline" title={`${value.offline} not synced yet`}>
            <WifiOff size={11} aria-hidden="true" />
            <span className="sr-only">{value.offline} not synced yet</span>
          </span>
        )}
      </>
    );

  return (
    <div className="tc-week-scroll">
      <table className="tc-week">
        <caption className="sr-only">Hours logged by each person on each working day of {model.weekLabel}</caption>
        <thead>
          <tr>
            <th scope="col" className="tc-week-crew">
              Person
            </th>
            {tcWorkDays.map((day) => (
              <th scope="col" key={day.date} className={day.date === todayIso ? "is-today" : undefined}>
                <span className="tc-week-dow">{day.day}</span>
                <span className="tc-week-date">{day.label}</span>
              </th>
            ))}
            <th scope="col" className="tc-week-total">
              Week
            </th>
          </tr>
        </thead>
        <tbody>
          {model.workers.map((worker) => (
            <tr key={worker.id}>
              <th scope="row" className="tc-week-crew">
                <span className="tc-week-who">
                  <span className="hs-avatar is-small" aria-hidden="true">
                    {worker.initials}
                  </span>
                  <span className="tc-week-person-text">
                    <span className="tc-week-crew-name">{worker.name}</span>
                    <span className="tc-week-crew-task">
                      {model.crews.find((crew) => crew.id === worker.crewId)?.name} · {worker.role}
                    </span>
                  </span>
                </span>
              </th>
              {tcWorkDays.map((day) => {
                const value = cell(worker.id, day.date);
                return (
                  <td key={day.date} className={`${day.date === todayIso ? "is-today" : ""}${value.overtime > 0 ? " has-ot" : ""}`}>
                    {figure(value, true)}
                  </td>
                );
              })}
              <td className="tc-week-total">{figure(cell(worker.id, null))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="tc-week-crew">
              Everyone
            </th>
            {tcWorkDays.map((day) => (
              <td key={day.date} className={day.date === todayIso ? "is-today" : undefined}>
                {figure(cell(null, day.date))}
              </td>
            ))}
            <td className="tc-week-total">{figure(cell(null, null))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

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

  /* The jobsite shortcuts, which used to be four buttons that did nothing. Each one edits the form
     above it, the way a crew lead would by hand; none of them submits anything on its own. */
  const quickAdd: Array<{ label: string; run: () => void }> = [
    { label: "Clock 8 hrs", run: () => setRegular(8) },
    { label: "Add 30 min break", run: () => setRegular((hours) => Math.max(0, (Number(hours) || 0) - 0.5)) },
    { label: "Start OT", run: () => setOvertime((hours) => Math.min(12, (Number(hours) || 0) + 1)) },
    {
      label: "Copy yesterday",
      run: () => {
        // the worker's day before the entry day, or else the latest day they logged
        const theirs = entries.filter((entry) => entry.workerId === worker.id && entry.date < ENTRY_DAY.date);
        const previous = theirs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
        if (!previous) return;
        setProjectId(previous.projectId);
        setTask(previous.task);
        setRegular(previous.regularHours);
        setOvertime(previous.overtimeHours);
      }
    }
  ];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const id = `manual-${Date.now()}`;
    const entry: TcEntry = {
      id,
      workerId: worker.id,
      crewId: worker.crewId,
      projectId,
      date: ENTRY_DAY.date,
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
    setEntries((prev) => prev.map((entry) => (entry.synced ? entry : { ...entry, synced: true, status: "Submitted" as const })));
  };

  /* What was just added comes first — it is the most recent thing logged whatever day it is for —
     and then the week, latest day first. Sorted by day alone, an entry for Thursday landed under
     Friday's and Saturday's and never showed, so "Entry added" pointed at nothing. */
  const added = entries.filter((entry) => entry.id.startsWith("manual-"));
  const logged = entries
    .filter((entry) => !entry.id.startsWith("manual-"))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const recent = [...added, ...logged].slice(0, 12);
  const estimate = (Number(regular) || 0) * worker.baseRate + (Number(overtime) || 0) * worker.baseRate * OVERTIME_MULTIPLIER;

  return (
    <>
      <Panel
        id="tc-panel-week"
        span={3}
        icon={CalendarDays}
        tone="violet"
        title="This week, person by person"
        subtitle={`Hours each person logged per working day · ${model.weekLabel}`}
        action={
          <ul className="tc-legend" aria-label="What the grid shows">
            <li>
              <i className="is-hours" aria-hidden="true" /> Hours
            </li>
            <li>
              <i className="is-ot" aria-hidden="true" /> Overtime
            </li>
            <li>
              <i className="is-today" aria-hidden="true" /> Today
            </li>
            <li>
              <WifiOff size={11} aria-hidden="true" /> Not synced
            </li>
          </ul>
        }
      >
        <WeekGrid model={model} entries={entries} />
      </Panel>

      <Panel
        id="tc-panel-log"
        icon={Plus}
        tone="green"
        title="Log time"
        subtitle="Crew leads log by job, phase, and task"
        className="tc-log"
      >
        <form className="tc-form" onSubmit={submit}>
          <label className="tc-field is-wide">
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
          <label className="tc-field is-wide">
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
          <label className="tc-field is-wide">
            <span>Project</span>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              {model.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="tc-field is-wide">
            <span>Task / phase</span>
            <input value={task} onChange={(event) => setTask(event.target.value)} placeholder="Describe the work" />
          </label>
          <label className="tc-field">
            <span>Regular hours</span>
            <input type="number" min={0} max={16} step={0.5} value={regular} onChange={(event) => setRegular(Number(event.target.value))} />
          </label>
          <label className="tc-field">
            <span>Overtime hours</span>
            <input
              type="number"
              min={0}
              max={12}
              step={0.5}
              value={overtime}
              onChange={(event) => setOvertime(Number(event.target.value))}
            />
          </label>
          <div className="tc-verify-row">
            <button
              type="button"
              className={`tc-verify${photo ? " on" : ""}`}
              aria-pressed={photo}
              onClick={() => setPhoto((value) => !value)}
            >
              <Camera size={15} aria-hidden="true" />
              Photo {photo ? "attached" : "off"}
            </button>
            <button
              type="button"
              className={`tc-verify${location ? " on" : ""}`}
              aria-pressed={location}
              onClick={() => setLocation((value) => !value)}
            >
              <MapPin size={15} aria-hidden="true" />
              GPS {location ? "verified" : "off"}
            </button>
          </div>
          <div className="tc-submit">
            <span className="tc-estimate">
              <span className="tc-estimate-label">Est.</span>
              <strong>{formatCurrency(estimate)}</strong>
              <em>
                {formatRate(worker.baseRate)} · {worker.role}
              </em>
            </span>
            <button type="submit" className="hs-btn hs-btn-primary">
              <Plus size={16} aria-hidden="true" />
              Add entry
            </button>
          </div>
        </form>
        {justAdded && (
          <p className="tc-inline-success" role="status">
            <CheckCircle2 size={16} aria-hidden="true" /> Entry added and submitted for approval.
          </p>
        )}
        <div className="tc-quick" role="group" aria-label="Mobile quick entry">
          <span className="tc-quick-label">Jobsite quick add</span>
          {quickAdd.map((chip) => (
            <button type="button" key={chip.label} className="tc-quick-chip" onClick={chip.run}>
              {chip.label}
            </button>
          ))}
        </div>
      </Panel>

      <Panel
        id="tc-panel-recent"
        span={2}
        icon={Clock}
        tone="blue"
        title="Recent entries"
        subtitle={`${entries.length} logged this week`}
        className="tc-recent"
      >
        <div className={`tc-sync${unsynced.length ? " is-pending" : " is-synced"}`}>
          <span className="tc-sync-ico" aria-hidden="true">
            {unsynced.length ? <WifiOff size={16} /> : <CheckCircle2 size={16} />}
          </span>
          <div className="tc-sync-text">
            <strong>{unsynced.length ? `${unsynced.length} entries stored offline` : "All entries synced"}</strong>
            <span>
              {unsynced.length ? "Captured on the jobsite — will sync when connected." : "Local device is up to date with BuildFlow."}
            </span>
          </div>
          {unsynced.length > 0 && (
            <button type="button" className="hs-btn tc-btn-sm" onClick={syncAll}>
              <RefreshCw size={14} aria-hidden="true" />
              Sync now
            </button>
          )}
        </div>
        <div className="hs-table-wrap">
          <table className="hs-table tc-table">
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
                  <tr key={entry.id} className={justAdded === entry.id ? "tc-row-new" : undefined}>
                    <td>
                      <Person worker={entryWorker} />
                    </td>
                    <td>
                      <span className="tc-cell-strong">{project?.name}</span>
                      <span className="hs-row-sub">{entry.phase}</span>
                    </td>
                    <td className="hs-cell-muted tc-nowrap">{day?.label ?? entry.date}</td>
                    <td className="num">{entry.regularHours}</td>
                    <td className="num">{entry.overtimeHours ? <b className="tc-ot">{entry.overtimeHours}</b> : "—"}</td>
                    <td>
                      <span className="tc-verify-icons">
                        <i className={entry.photo ? "on" : ""} title={entry.photo ? "Photo attached" : "No photo"}>
                          <Camera size={13} aria-hidden="true" />
                          <span className="sr-only">{entry.photo ? "Photo attached" : "No photo"}</span>
                        </i>
                        <i className={entry.location ? "on" : ""} title={entry.location ? "Location verified" : "No location"}>
                          <MapPin size={13} aria-hidden="true" />
                          <span className="sr-only">{entry.location ? "Location verified" : "No location"}</span>
                        </i>
                      </span>
                    </td>
                    <td>
                      <Badge tone={entry.synced ? entryStatusTone[entry.status] : "slate"}>{entry.synced ? entry.status : "Offline"}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// 2. Labor Cost Tracking
// ---------------------------------------------------------------------------

const COST_DIMENSIONS = ["project", "crew", "phase", "worker"] as const;
type CostDimension = (typeof COST_DIMENSIONS)[number];

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
  const regularCost = totals.baseCost - otCost;
  const burdenCost = totals.burdenedCost - totals.baseCost;
  const share = (value: number) => (totals.burdenedCost > 0 ? (value / totals.burdenedCost) * 100 : 0);

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
  const label = dimension[0].toUpperCase() + dimension.slice(1);

  return (
    <>
      <Panel
        id="tc-panel-breakdown"
        span={2}
        icon={DollarSign}
        tone="green"
        title="Labor cost breakdown"
        subtitle="Regular, overtime, and burdened cost"
        action={<Segmented label="Breakdown dimension" options={COST_DIMENSIONS} value={dimension} onChange={setDimension} />}
      >
        <div className="hs-table-wrap">
          <table className="hs-table tc-table">
            <thead>
              <tr>
                <th>{label}</th>
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
                    <span className="tc-cell-strong">{row.label}</span>
                    {row.sublabel && <span className="hs-row-sub">{row.sublabel}</span>}
                  </td>
                  <td className="num">{Math.round(row.totals.regularHours)}</td>
                  <td className="num">
                    {row.totals.overtimeHours ? <b className="tc-ot">{Math.round(row.totals.overtimeHours)}</b> : "—"}
                  </td>
                  <td className="num">{Math.round(row.totals.totalHours)}</td>
                  <td className="num">{formatCurrency(row.totals.baseCost)}</td>
                  <td className="num">
                    <strong>{formatCurrency(row.totals.burdenedCost)}</strong>
                  </td>
                  <td className="tc-share">
                    <Meter value={row.totals.burdenedCost} max={maxCost} tone="green" />
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
      </Panel>

      <Panel id="tc-panel-composition" icon={Layers} tone="violet" title="Cost composition" subtitle="Where the labor dollar goes">
        {/* the same three amounts as the list below, laid end to end */}
        <div className="tc-stack" aria-hidden="true">
          <i className="is-regular" style={{ width: `${share(regularCost)}%` }} />
          <i className="is-overtime" style={{ width: `${share(otCost)}%` }} />
          <i className="is-burden" style={{ width: `${share(burdenCost)}%` }} />
        </div>
        <ul className="tc-composition">
          <li>
            <span>
              <i className="tc-swatch is-regular" aria-hidden="true" />
              Regular time
            </span>
            <strong>
              <AnimatedFigure text={formatCurrency(regularCost)} />
            </strong>
          </li>
          <li>
            <span>
              <i className="tc-swatch is-overtime" aria-hidden="true" />
              Overtime <Badge tone="amber">1.5×</Badge>
            </span>
            <strong>
              <AnimatedFigure text={formatCurrency(otCost)} />
            </strong>
          </li>
          <li>
            <span>
              <i className="tc-swatch is-burden" aria-hidden="true" />
              Burden <Badge tone="violet">{Math.round(BURDEN_RATE * 100)}%</Badge>
            </span>
            <strong>
              <AnimatedFigure text={formatCurrency(burdenCost)} />
            </strong>
          </li>
          <li className="tc-composition-total">
            <span>Fully burdened</span>
            <strong>
              <AnimatedFigure text={formatCurrency(totals.burdenedCost)} />
            </strong>
          </li>
        </ul>
        <p className="tc-note">
          Burden adds benefits, payroll taxes, and workers' comp on top of base wages so project cost reflects true labor spend.
        </p>
      </Panel>

      <Panel
        id="tc-panel-profit"
        span={2}
        icon={Gauge}
        tone="amber"
        title="Project profitability impact"
        subtitle="Actual burdened labor vs weekly budget"
      >
        <ul className="tc-budget">
          {breakdownByProject(entries, model.workerById).map((row) => {
            const budget = row.budgetHours ?? 0;
            const pct = budget > 0 ? Math.round((row.totals.totalHours / budget) * 100) : 0;
            const over = pct > 100;
            return (
              <li className="tc-budget-row" key={row.key}>
                <div className="tc-budget-label">
                  <span className="tc-cell-strong">{row.label}</span>
                  <span className="hs-row-sub">{row.sublabel}</span>
                </div>
                <div className="tc-budget-track">
                  <Meter value={row.totals.totalHours} max={budget} tone={over ? "red" : "green"} />
                  <span className="tc-budget-meta">
                    {Math.round(row.totals.totalHours)} / {budget} hrs
                    <Badge tone={over ? "red" : "green"}>{over ? `+${pct - 100}% over` : `${pct}% used`}</Badge>
                  </span>
                </div>
                <strong className="tc-budget-cost">{formatCurrency(row.totals.burdenedCost)}</strong>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel
        id="tc-panel-flags"
        icon={AlertTriangle}
        tone="red"
        title="Overtime flags"
        subtitle={`Entries above the ${OVERTIME_THRESHOLD}-hour daily threshold`}
      >
        {flagged.length === 0 ? (
          <p className="tc-empty">No overtime discrepancies flagged this week.</p>
        ) : (
          <>
            <ul className="tc-alerts">
              {flagged.slice(0, 6).map((entry) => {
                const worker = model.workerById.get(entry.workerId);
                const project = model.projects.find((item) => item.id === entry.projectId);
                return (
                  <li className="cc-alert tc-alert" key={entry.id}>
                    <span className="cc-alert-ico tc-alert-ico" aria-hidden="true">
                      <AlertTriangle />
                    </span>
                    <span className="cc-alert-body">
                      <strong>
                        {worker?.name} · <b className="tc-ot">{entry.overtimeHours} OT</b>
                      </strong>
                      <span>
                        {project?.name} · {weekDays.find((day) => day.date === entry.date)?.label}
                      </span>
                    </span>
                    <Badge tone="red">Review</Badge>
                  </li>
                );
              })}
            </ul>
            {flagged.length > 6 && <p className="tc-note">Showing the first 6 of {flagged.length} flagged entries.</p>}
          </>
        )}
      </Panel>

      <Panel id="tc-panel-rates" span={3} icon={Wrench} title="Hourly rates by role" subtitle="Base and prevailing-wage scales">
        <div className="hs-table-wrap">
          <table className="hs-table tc-table">
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
                    <span className="tc-cell-strong">{role}</span>
                  </td>
                  <td>
                    <Badge tone="slate">{info.category}</Badge>
                  </td>
                  <td className="num">{info.count}</td>
                  <td className="num">{formatRate(info.base)}</td>
                  <td className="num">{formatRate(info.prevailing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// 3. Crew & Assignment Management
// ---------------------------------------------------------------------------

function CrewTab({ model, entries }: { model: Model; entries: TcEntry[] }) {
  return (
    <>
      <Panel
        id="tc-panel-attendance"
        span={3}
        icon={UserCheck}
        tone="green"
        title="Attendance verification"
        subtitle="Scheduled crew vs. who actually logged time"
      >
        <div className="tc-tiles is-five">
          {model.attendance.map((row) => {
            const pct = row.scheduled > 0 ? Math.round((row.actual / row.scheduled) * 100) : 0;
            return (
              <article className="tc-tile tc-attend" key={row.crewId}>
                <header>
                  <span className="tc-tile-title">{row.crewName}</span>
                  <Badge tone={pct >= 100 ? "green" : pct >= 80 ? "amber" : "red"}>{pct}% present</Badge>
                </header>
                <div className="tc-attend-count">
                  <span>
                    <b>
                      <AnimatedFigure text={row.actual} />
                    </b>{" "}
                    / {row.scheduled} on site
                  </span>
                  {row.replacements > 0 && (
                    <em className="tc-replace">
                      <Repeat size={13} aria-hidden="true" /> {row.replacements} sub{row.replacements > 1 ? "s" : ""}
                    </em>
                  )}
                </div>
                <Meter value={row.actual} max={row.scheduled} tone={pct >= 100 ? "green" : "amber"} />
              </article>
            );
          })}
        </div>
      </Panel>

      <Panel id="tc-panel-rosters" span={3} icon={Users} tone="violet" title="Crew rosters & skills" subtitle="Who performed which tasks">
        <div className="tc-tiles is-three">
          {model.crews.map((crew) => {
            const meta = crewMeta(crew.id);
            const project = model.projects.find((item) => item.id === crew.projectId);
            const crewWorkers = model.workers.filter((worker) => worker.crewId === crew.id);
            const crewHours = totalsFor(
              entries.filter((entry) => entry.crewId === crew.id),
              model.workerById
            );
            return (
              <article className="tc-tile tc-roster" key={crew.id}>
                <header>
                  <div>
                    <span className="tc-tile-title">{crew.name}</span>
                    <span className="hs-row-sub">
                      {project?.name} · {meta?.task}
                    </span>
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
                        <Person worker={worker} small />
                        <span className="tc-skills">
                          {worker.skills.slice(0, 2).map((skill) => (
                            <b key={skill}>{skill}</b>
                          ))}
                        </span>
                        <span className="tc-roster-hrs">{Math.round(workerHours.totalHours)}h</span>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </div>
      </Panel>

      <Panel
        id="tc-panel-productivity"
        span={3}
        icon={Gauge}
        tone="amber"
        title="Crew productivity"
        subtitle="Production output per labor hour"
      >
        <div className="hs-table-wrap">
          <table className="hs-table tc-table">
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
                      <span className="tc-cell-strong">{row.crewName}</span>
                    </td>
                    <td className="num">{Math.round(row.hours)}</td>
                    <td className="num">
                      {row.output} <span className="tc-unit">{row.unit}</span>
                    </td>
                    <td className="num">{row.perHour.toFixed(2)}</td>
                    <td className="tc-target">
                      <Meter value={row.perHour} max={row.target * 1.3} tone={good ? "green" : "amber"}>
                        <span className={good ? "tc-up" : "tc-down"}>{Math.round(ratio * 100)}%</span>
                      </Meter>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// 4. Approval & Workflow
// ---------------------------------------------------------------------------

const APPROVAL_FILTERS = ["pending", "overtime", "flagged", "all"] as const;
type ApprovalFilter = (typeof APPROVAL_FILTERS)[number];
/** How many timecards the queue shows at once. */
const QUEUE_LIMIT = 8;

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
  const [filter, setFilter] = useState<ApprovalFilter>("pending");

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
    <>
      <Panel
        id="tc-panel-queue"
        span={2}
        icon={ClipboardCheck}
        tone="violet"
        title="Approval queue"
        subtitle="Crew Lead → Superintendent → Project Manager → Accounting"
        action={<Segmented label="Approval filter" options={APPROVAL_FILTERS} value={filter} onChange={setFilter} />}
      >
        {visible.length === 0 ? (
          <p className="tc-empty">Nothing in this queue — every timecard here is cleared. 🎉</p>
        ) : (
          <>
            <div className="tc-approvals">
              {visible.slice(0, QUEUE_LIMIT).map((card) => {
                const worker = model.workerById.get(card.workerId);
                const crew = model.crews.find((item) => item.id === card.crewId);
                const canApprove = card.chain.some((step) => step.state === "Pending");
                return (
                  <article className={`tc-tile tc-approval${card.flagged ? " is-flagged" : ""}`} key={card.id}>
                    <div className="tc-approval-top">
                      <Person worker={worker} sub={`${crew?.name} · ${formatHours(card.regularHours + card.overtimeHours)}`} />
                      <div className="tc-approval-badges">
                        {card.overtimePending && <Badge tone="amber">OT approval</Badge>}
                        {card.flagged && <Badge tone="red">Discrepancy</Badge>}
                        <Badge tone="slate">At {stageLabel(card)}</Badge>
                      </div>
                    </div>

                    <ol className="tc-chain">
                      {card.chain.map((step) => (
                        <li key={step.level} className={`tc-chain-step tone-${approvalTone[step.state]}`}>
                          <span className="tc-chain-dot" aria-hidden="true">
                            {step.state === "Approved" ? <Check size={11} /> : step.state === "Rejected" ? <X size={11} /> : null}
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
                        <AlertTriangle size={14} aria-hidden="true" /> {card.flagReason}
                      </p>
                    )}

                    <div className="tc-approval-actions">
                      {card.overtimePending && (
                        <button type="button" className="hs-btn tc-btn-sm tc-btn-amber" onClick={() => approveOvertime(card)}>
                          <Timer size={14} aria-hidden="true" /> Approve OT
                        </button>
                      )}
                      <button type="button" className="hs-btn tc-btn-sm" onClick={() => reject(card)} disabled={!canApprove}>
                        <Send size={14} aria-hidden="true" /> Request correction
                      </button>
                      <button
                        type="button"
                        className="hs-btn hs-btn-primary tc-btn-sm"
                        onClick={() => approve(card)}
                        disabled={!canApprove}
                      >
                        <Check size={14} aria-hidden="true" /> Approve
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            {visible.length > QUEUE_LIMIT && (
              <p className="tc-note">
                Showing {QUEUE_LIMIT} of {visible.length} — approve or send back a timecard and the next one takes its place.
              </p>
            )}
          </>
        )}
      </Panel>

      <Panel id="tc-panel-audit" icon={FileCheck2} title="Audit trail" subtitle="Every change and approval, timestamped">
        <ol className="tc-audit">
          {audit.map((event) => (
            <li key={event.id}>
              <span className={`tc-audit-dot tone-${event.tone}`} aria-hidden="true" />
              <div>
                <strong>{event.action}</strong>
                <span>{event.detail}</span>
                <small>
                  {event.actor} · {event.at}
                </small>
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// 5. Integration with Other BuildFlow Modules
// ---------------------------------------------------------------------------

function IntegrationsTab({ model, data }: { model: Model; data: BootstrapPayload }) {
  const totals = totalsFor(model.entries, model.workerById);
  const scheduleActual = Math.round(totals.totalHours);
  const schedulePlanned = model.crews.reduce((sum, crew) => sum + crew.scheduledHeadcount * 40, 0);
  const equipmentHours = model.entries.filter((entry) => entry.source === "Equipment").reduce((sum, entry) => sum + entryHours(entry), 0);
  const fieldSyncCount = model.entries.filter((entry) => entry.source === "Field Sync").length;

  const integrations: Array<{ icon: typeof Clock; tone: Tone; title: string; status: string; copy: string; rows: string[] }> = [
    {
      icon: CalendarClock,
      tone: "blue",
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
      tone: "green",
      title: "Field Updates sync",
      status: `${fieldSyncCount} imported`,
      copy: "Daily progress reports push crew hours straight into TimeCard.",
      rows: [`${data.fieldUpdates.length} field updates connected`, "Photo notes attached to matching entries"]
    },
    {
      icon: Wrench,
      tone: "amber",
      title: "Equipment usage",
      status: `${Math.round(equipmentHours)} hrs`,
      copy: "Operator hours captured alongside equipment run time.",
      rows: ["Operator + machine hours reconciled", "Idle vs. productive time flagged"]
    },
    {
      icon: AlertTriangle,
      tone: "red",
      title: "DelayIQ correlation",
      status: `${data.delayIQs.length || 3} linked`,
      copy: "Overtime and extra hours tied back to logged delayIQ reasons.",
      rows: ["Weather delayIQ → 46 recovery OT hrs", "Rework tagged to responsible phase"]
    },
    {
      icon: Boxes,
      tone: "violet",
      title: "Material coordination",
      status: "Staging",
      copy: "Material handling and staging hours tracked as their own task.",
      rows: ["18 hrs logged to material staging", "Cross-project handling split-shifted"]
    },
    {
      icon: Truck,
      tone: "slate",
      title: "Map & Field Ops",
      status: "GPS",
      copy: "Location-verified entries confirm crews were on the right site.",
      rows: ["82% of entries GPS-verified", "Route time excluded from billable hours"]
    }
  ];

  return (
    <>
      <Panel
        id="tc-panel-modules"
        span={3}
        icon={Link2}
        tone="blue"
        title="Connected BuildFlow modules"
        subtitle="TimeCard pulls and pushes across the platform"
      >
        <div className="tc-tiles is-three">
          {integrations.map((item) => {
            const Icon = item.icon;
            return (
              <article className="tc-tile tc-integration" key={item.title}>
                <header>
                  <span className={`tc-panel-ico is-large tone-${item.tone}`} aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <div>
                    <span className="tc-tile-title">{item.title}</span>
                    <Badge tone={item.tone}>{item.status}</Badge>
                  </div>
                </header>
                <p>{item.copy}</p>
                <ul>
                  {item.rows.map((row) => (
                    <li key={row}>
                      <CheckCircle2 size={14} aria-hidden="true" />
                      {row}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </Panel>

      <Panel
        id="tc-panel-schedule"
        span={3}
        icon={TrendingUp}
        title="Schedule vs. actual"
        subtitle="Planned crew hours against logged hours"
      >
        <div className="tc-chart">
          {/* Chart durations are pinned rather than left to recharts' defaults, which
              are 400ms for a Bar but 1500ms for a Line or an Area, and 1500ms AFTER a
              400ms animationBegin for a Pie -- so the pie below used to finish 1.9s
              after the page, well outside the 800ms settle budget. Two rungs: 400ms for
              a bar's short grow and a pie's sweep, 600ms for a line or area crossing the
              full width.
              isAnimationActive is deliberately NOT passed. recharts 3.8.1 defaults it to
              'auto', which reads AND subscribes to prefers-reduced-motion
              (recharts/es6/animation/JavascriptAnimate.js:37). Passing an explicit
              boolean REPLACES 'auto' and removes that gate, so the obvious
              "useChartAnimation" helper would make reduced motion worse, not better.
              The one exception is the 40px sparkline strip further down, which is set to
              false outright: on a 40px chart a grow-in is noise, not a reveal. */}
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={model.crews.map((crew) => ({
                name: crew.name.replace(" Crew", ""),
                planned: crew.scheduledHeadcount * 40,
                actual: Math.round(
                  totalsFor(
                    model.entries.filter((entry) => entry.crewId === crew.id),
                    model.workerById
                  ).totalHours
                )
              }))}
              barGap={6}
              margin={{ top: 10, right: 16, bottom: 4, left: -12 }}
            >
              <CartesianGrid stroke={chartGrid} strokeDasharray="4 6" vertical={false} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={chartTick} />
              <YAxis axisLine={false} tickLine={false} tick={chartTick} />
              <Tooltip cursor={{ fill: "var(--bf-hover)" }} {...chartTooltip} />
              <Bar
                dataKey="planned"
                name="Planned"
                fill="var(--bf-color-series-1)"
                radius={[5, 5, 0, 0]}
                barSize={20}
                animationDuration={400}
              />
              <Bar
                dataKey="actual"
                name="Actual"
                fill="var(--bf-color-series-2)"
                radius={[5, 5, 0, 0]}
                barSize={20}
                animationDuration={400}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ChartKey
          items={[
            { label: "Planned", color: "var(--bf-color-series-1)" },
            { label: "Actual", color: "var(--bf-color-series-2)" }
          ]}
        />
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// 6. Reporting & Analytics
// ---------------------------------------------------------------------------

function ReportingTab({ model, entries, timecards }: { model: Model; entries: TcEntry[]; timecards: TcTimecard[] }) {
  const totals = totalsFor(entries, model.workerById);
  const variance = breakdownByProject(entries, model.workerById).map((row) => {
    const budget = row.budgetHours ?? 0;
    return { ...row, variance: Math.round(row.totals.totalHours) - budget };
  });
  const costPerSY = totals.burdenedCost / 1180; // paving example unit
  const [exported, setExported] = useState(false);
  const approved = timecards.filter((card) => card.chain.every((step) => step.state === "Approved")).length;

  return (
    <>
      <Panel
        id="tc-panel-variance"
        span={2}
        icon={Scale}
        tone="amber"
        title="Labor variance"
        subtitle="Actual vs budgeted hours by project"
      >
        <div className="hs-table-wrap">
          <table className="hs-table tc-table">
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
                    <span className="tc-cell-strong">{row.label}</span>
                    <span className="hs-row-sub">{row.sublabel}</span>
                  </td>
                  <td className="num">{row.budgetHours}</td>
                  <td className="num">{Math.round(row.totals.totalHours)}</td>
                  <td className="num">
                    <Badge tone={row.variance > 0 ? "red" : "green"}>
                      {row.variance > 0 ? "+" : ""}
                      {row.variance}
                    </Badge>
                  </td>
                  <td className="num">{formatCurrency(row.totals.burdenedCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel id="tc-panel-unit" icon={DollarSign} tone="green" title="Cost analysis" subtitle="Unit economics">
        <div className="tc-figures">
          <div>
            <span>Cost / labor hour</span>
            <strong>
              <AnimatedFigure text={formatCurrency(totals.burdenedCost / Math.max(1, totals.totalHours))} />
            </strong>
          </div>
          <div>
            <span>Cost / SY paved</span>
            <strong>
              <AnimatedFigure text={formatCurrency(costPerSY)} />
            </strong>
          </div>
          <div>
            <span>OT % of hours</span>
            <strong>
              <AnimatedFigure text={`${Math.round((totals.overtimeHours / Math.max(1, totals.totalHours)) * 100)}%`} />
            </strong>
          </div>
          <div>
            <span>Avg loaded rate</span>
            <strong>{formatRate(totals.burdenedCost / Math.max(1, totals.totalHours))}</strong>
          </div>
        </div>
      </Panel>

      <Panel id="tc-panel-cost-trend" icon={TrendingUp} title="Labor cost trend" subtitle="Planned vs actual ($K / week)">
        <div className="tc-chart">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={laborCostTrend} margin={{ top: 10, right: 16, bottom: 4, left: -14 }}>
              <CartesianGrid stroke={chartGrid} strokeDasharray="4 6" vertical={false} />
              <XAxis dataKey="week" axisLine={false} tickLine={false} tick={chartTick} />
              <YAxis axisLine={false} tickLine={false} tick={chartTick} />
              <Tooltip cursor={{ stroke: "var(--bf-line-solid)", strokeWidth: 2 }} {...chartTooltip} />
              <Line
                type="monotone"
                dataKey="planned"
                stroke="var(--bf-color-series-1)"
                strokeWidth={2}
                dot={{ r: 3 }}
                animationDuration={600}
              />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="var(--bf-color-series-2)"
                strokeWidth={3}
                dot={{ r: 4 }}
                animationDuration={600}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <ChartKey
          items={[
            { label: "Planned", color: "var(--bf-color-series-1)" },
            { label: "Actual", color: "var(--bf-color-series-2)" }
          ]}
        />
      </Panel>

      <Panel
        id="tc-panel-forecast"
        icon={Sparkles}
        tone="violet"
        title="Labor forecastIQ"
        subtitle="Projected hours from current burn rate"
      >
        <div className="tc-chart">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={laborForecastIQ} margin={{ top: 10, right: 16, bottom: 4, left: -14 }}>
              <defs>
                <linearGradient id="tcForecastIQ" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--bf-color-accent)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--bf-color-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={chartGrid} strokeDasharray="4 6" vertical={false} />
              <XAxis dataKey="week" axisLine={false} tickLine={false} tick={chartTick} />
              <YAxis axisLine={false} tickLine={false} tick={chartTick} domain={[1200, 1800]} />
              <Tooltip cursor={{ stroke: "var(--bf-line-solid)", strokeWidth: 2 }} {...chartTooltip} />
              <Area
                type="monotone"
                dataKey="forecastIQ"
                stroke="var(--bf-color-series-1)"
                strokeWidth={3}
                fill="url(#tcForecastIQ)"
                animationDuration={600}
              />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="var(--bf-color-series-2)"
                strokeWidth={3}
                dot={{ r: 4 }}
                animationDuration={600}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <ChartKey
          items={[
            { label: "ForecastIQ", color: "var(--bf-color-series-1)" },
            { label: "Actual", color: "var(--bf-color-series-2)" }
          ]}
        />
      </Panel>

      <Panel id="tc-panel-productivity-trend" icon={Gauge} tone="green" title="Productivity trend" subtitle="Output per labor hour">
        <div className="tc-chart">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={productivityTrend} margin={{ top: 10, right: 16, bottom: 4, left: -14 }}>
              <CartesianGrid stroke={chartGrid} strokeDasharray="4 6" vertical={false} />
              <XAxis dataKey="week" axisLine={false} tickLine={false} tick={chartTick} />
              <YAxis axisLine={false} tickLine={false} tick={chartTick} domain={[0, 1.1]} />
              <Tooltip cursor={{ fill: "var(--bf-hover)" }} {...chartTooltip} />
              <Bar dataKey="value" fill="var(--bf-color-ok)" radius={[5, 5, 0, 0]} barSize={26} animationDuration={400}>
                {productivityTrend.map((point) => (
                  <Cell key={point.week} fill={point.value >= 0.9 ? "var(--bf-color-ok)" : "var(--bf-color-ok-edge)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ChartKey
          items={[
            { label: "At target", color: "var(--bf-color-ok)" },
            { label: "Below 0.9", color: "var(--bf-color-ok-edge)" }
          ]}
        />
      </Panel>

      <Panel
        id="tc-panel-payroll"
        span={3}
        icon={Download}
        tone="green"
        title="Payroll export"
        subtitle="Approved hours ready for payroll"
        className="tc-payroll"
      >
        <div className="tc-payroll-row">
          <div className="tc-figures is-inline">
            <div>
              <span>Approved timecards</span>
              <strong>
                {approved} / {timecards.length}
              </strong>
            </div>
            <div>
              <span>Gross labor</span>
              <strong>
                <AnimatedFigure text={formatCurrency(totals.baseCost)} />
              </strong>
            </div>
          </div>
          <div className="tc-formats" aria-label="Payroll formats">
            {["ADP", "Paychex", "QuickBooks", "CSV"].map((fmt) => (
              <span key={fmt} className="tc-format-chip">
                {fmt}
              </span>
            ))}
          </div>
          <button type="button" className={`hs-btn${exported ? "" : " hs-btn-primary"} tc-payroll-btn`} onClick={() => setExported(true)}>
            {exported ? (
              <>
                <CheckCircle2 size={16} aria-hidden="true" /> Export queued
              </>
            ) : (
              <>
                <Send size={16} aria-hidden="true" /> Export approved hours
              </>
            )}
          </button>
        </div>
      </Panel>
    </>
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
    { name: "Employee", value: classCounts.Employee ?? 0, color: "var(--bf-color-accent)" },
    { name: "Subcontractor", value: classCounts.Subcontractor ?? 0, color: "var(--bf-color-info)" },
    { name: "Apprentice", value: classCounts.Apprentice ?? 0, color: "var(--bf-color-warn)" }
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
    <>
      <Panel
        id="tc-panel-certified"
        span={2}
        icon={FileCheck2}
        tone="green"
        title="Certified payroll"
        subtitle="Prevailing-wage projects · WH-347 ready"
        action={
          <div className="tc-panel-buttons">
            <button type="button" className="hs-btn tc-btn-sm">
              <FileCheck2 size={14} aria-hidden="true" /> Statement of compliance
            </button>
            <button type="button" className="hs-btn hs-btn-primary tc-btn-sm">
              <Download size={14} aria-hidden="true" /> Generate WH-347
            </button>
          </div>
        }
      >
        <div className="hs-table-wrap">
          <table className="hs-table tc-table">
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
                    <Person worker={worker} small />
                  </td>
                  <td>
                    <Badge
                      tone={
                        worker.classification === "Apprentice" ? "amber" : worker.classification === "Subcontractor" ? "violet" : "blue"
                      }
                    >
                      {worker.classification}
                    </Badge>
                  </td>
                  <td>
                    <span className="tc-cell-strong">{project?.code}</span>
                  </td>
                  <td className="num">{Math.round(totals.totalHours)}</td>
                  <td className="num">{formatRate(worker.baseRate)}</td>
                  <td className="num">{formatRate(worker.prevailingRate)}</td>
                  <td>
                    <Badge tone={meetsPrevailing ? "green" : "red"}>{meetsPrevailing ? "Compliant" : "Below scale"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        id="tc-panel-classification"
        icon={Users}
        tone="violet"
        title="Worker classification"
        subtitle="Employee vs. sub vs. apprentice"
      >
        <div className="tc-class">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={classData}
                dataKey="value"
                nameKey="name"
                innerRadius={46}
                outerRadius={72}
                paddingAngle={3}
                animationDuration={400}
                animationBegin={0}
              >
                {classData.map((slice) => (
                  <Cell key={slice.name} fill={slice.color} />
                ))}
              </Pie>
              <Tooltip {...chartTooltip} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="tc-class-legend">
            {classData.map((slice) => (
              <li key={slice.name}>
                <i style={{ background: slice.color }} aria-hidden="true" />
                <span>{slice.name}</span>
                <strong>{slice.value}</strong>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      <Panel
        id="tc-panel-liens"
        span={2}
        icon={ShieldCheck}
        tone="green"
        title="Lien law compliance"
        subtitle="Subcontractor payment verification"
      >
        <div className="hs-table-wrap">
          <table className="hs-table tc-table">
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
                      <span className="tc-cell-strong">{lien.subcontractor}</span>
                    </td>
                    <td className="hs-cell-muted">{project?.name}</td>
                    <td className="hs-cell-muted tc-nowrap">{lien.throughDate}</td>
                    <td className="num">{formatCurrency(lien.amount)}</td>
                    <td>
                      <Badge tone={lien.status === "Verified" ? "green" : lien.status === "Conditional" ? "amber" : "slate"}>
                        {lien.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel id="tc-panel-wages" icon={Scale} tone="amber" title="Prevailing wage scales" subtitle="Enforced minimums by classification">
        <ul className="tc-wages">
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
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// 8. Dashboard widgets (rendered on the main BuildFlow dashboard)
// ---------------------------------------------------------------------------

export function TimeCardDashboardCards({
  data,
  onOpen,
  locked = false
}: {
  data: BootstrapPayload;
  onOpen: () => void;
  /** TimeCard is an add-on the workspace doesn't have yet — onOpen prompts for it. */
  locked?: boolean;
}) {
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
  const utilization = Math.round((totals.totalHours / (model.crews.reduce((sum, crew) => sum + crew.scheduledHeadcount, 0) * 48)) * 100);
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
          {/* These cards read the same sample week the page does, so they carry the same warning.
              It sits beside the add-on badge rather than replacing it: one says the workspace has
              not bought the feature, the other says the numbers are not the workspace's. Both can
              be true, and they are not the same thing. */}
          <span className="tc-dash-addon is-preview" title="These figures come from a built-in sample week, not from this workspace">
            <FlaskConical size={12} /> Preview
          </span>
          {locked && (
            <span className="tc-dash-addon" title="TimeCard is an add-on — choose it to see where to get it">
              <CircleArrowUp size={12} /> Add-on
            </span>
          )}
        </h2>
        <button type="button" className={`tc-dash-open${locked ? " locked" : ""}`} onClick={onOpen}>
          {locked ? (
            <>
              Get TimeCard <CircleArrowUp size={16} />
            </>
          ) : (
            <>
              Open TimeCard <ArrowRight size={16} />
            </>
          )}
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
          <em>
            {budgetPct}% of {weeklyBudget} budgeted
          </em>
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
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="var(--bf-color-series-1)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
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
            {pendingCrews.length
              ? pendingCrews
                  .slice(0, 2)
                  .map((row) => row.crew.name)
                  .join(", ")
              : "All approved"}
          </em>
        </button>
      </div>
    </section>
  );
}
