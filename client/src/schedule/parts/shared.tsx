/**
 * Pieces every schedule page shares: KPI cards, badges, selects, the trade palette,
 * the info dialog, crew availability and ordering. View-specific pieces live beside
 * this file (week, month, kanban, matrix).
 */
import type { Crew, Status } from "@buildflow/shared";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, Users, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRef } from "react";
import type { ReactNode } from "react";
import { useModalDialog } from "../hooks";
import { statusTone } from "../scheduleUtils";
import type { ScheduleKpis } from "../kpis";
import { SCHEDULE_STATUSES } from "../useScheduleContext";
import { plural } from "../week";

export function KpiCard({
  icon: Icon,
  label,
  value,
  delta,
  tone,
  onClick,
  active = false,
  controlsId,
  title
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  delta: string;
  tone: string;
  onClick?: () => void;
  active?: boolean;
  controlsId?: string;
  /** What the number counts — shown as the card's tooltip. */
  title?: string;
}) {
  const content = (
    <>
      <span className={`kpi-icon ${tone}`}>
        <Icon size={32} />
      </span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{delta}</span>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        className={`kpi-card kpi-card-button${active ? " active" : ""}`}
        type="button"
        title={title}
        aria-expanded={active}
        aria-controls={controlsId}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="kpi-card" title={title}>
      {content}
    </div>
  );
}

/** Perspective tilt that follows the pointer — the KPI cards' hover motion. */
export function DxTilt({ children, max = 7 }: { children: ReactNode; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const handleMove = (event: { clientX: number; clientY: number }) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    el.style.setProperty("--rx", `${(px - 0.5) * 2 * max}deg`);
    el.style.setProperty("--ry", `${(0.5 - py) * 2 * max}deg`);
  };
  const handleLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };
  return (
    <div className="dx-tilt" ref={ref} onPointerMove={handleMove} onPointerLeave={handleLeave}>
      {children}
    </div>
  );
}

export function ScheduleBadge({ status }: { status: string }) {
  const label = status === "Ready to Start" ? "Ready" : status;
  return <span className={`badge ${statusTone(status)}`}>{label}</span>;
}

export function ScheduleSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="select-box schedule-select">
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown size={16} />
    </label>
  );
}

export const TRADE_ORDER: { key: TradeKey; label: string }[] = [
  { key: "concrete", label: "Concrete" },
  { key: "framing", label: "Framing" },
  { key: "mep", label: "MEP" },
  { key: "finishes", label: "Finishes" },
  { key: "sitework", label: "Site Work" },
  { key: "inspections", label: "Inspections" },
  { key: "milestone", label: "Milestone" },
  { key: "holiday", label: "Holiday" }
];

export type ScheduleDialog = {
  title: string;
  description: string;
  items?: string[];
};

export function ScheduleDialogPanel({ dialog, onClose }: { dialog: ScheduleDialog; onClose: () => void }) {
  const panel = useModalDialog<HTMLElement>(onClose);
  return (
    <div className="schedule-dialog-backdrop" role="presentation">
      <section className="schedule-dialog" role="dialog" aria-modal="true" aria-label={dialog.title} ref={panel}>
        <header>
          <div>
            <h2>{dialog.title}</h2>
            <p>{dialog.description}</p>
          </div>
          <button type="button" className="icon-button" aria-label={`Close ${dialog.title}`} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {dialog.items && (
          <ul>
            {dialog.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export type TradeKey = "concrete" | "framing" | "mep" | "finishes" | "sitework" | "inspections" | "milestone" | "holiday";

export function tradeForText(text: string): TradeKey {
  const value = text.toLowerCase();
  if (/concrete|pour|footing|slab|rebar|formwork|foundation|embed|cure/.test(value)) return "concrete";
  if (/fram|steel|panel|deck|shear|erection|structur|hardware|joist|truss/.test(value)) return "framing";
  if (/mep|electr|plumb|hvac|mechanical|rough-?in|duct|conduit|wiring/.test(value)) return "mep";
  if (/drywall|paint|finish|floor|trim|punch|closeout|window|door|cabinet|tile/.test(value)) return "finishes";
  if (/site|grad|utilit|excavat|earthwork|trench|mobiliz|patch|dewater|paving|layout/.test(value)) return "sitework";
  if (/inspect|permit|review|walk|test|probe|accept/.test(value)) return "inspections";
  return "concrete";
}

export function tradeColorVar(key: TradeKey) {
  return `var(--sc-${key})`;
}

export function isText(value: string | undefined): value is string {
  return Boolean(value);
}

/** How free a crew is; `utilization` is the week's booked-days percent when the caller has it, else the crew's stored figure. */
export function crewAvailability(crew: Crew, utilization: number = crew.utilization): { label: string; cls: string; ratio: string } {
  const ratio = `${crew.size}/${crew.capacity}`;
  if (utilization >= 88) return { label: "Busy", cls: "busy", ratio };
  if (utilization >= 62) return { label: "Limited", cls: "limited", ratio };
  return { label: "Available", cls: "available", ratio };
}

export const scheduleStatusFilterOptions: Status[] = SCHEDULE_STATUSES;

export function CrewLabel({ crew, utilization = crew.utilization }: { crew: Crew; utilization?: number }) {
  return (
    <div className="crew-label">
      <strong>{crew.name}</strong>
      <span>
        <Users size={15} />
        {crew.size}
      </span>
      <em title="Booked days this week over working days">{utilization}%</em>
    </div>
  );
}

export function ScheduleKpiGrid({ kpis }: { kpis: ScheduleKpis }) {
  return (
    <div className="kpi-grid schedule-kpis">
      <DxTilt>
        <KpiCard
          icon={Users}
          tone="blue"
          label="Active Crews"
          value={kpis.activeCrews}
          delta={`of ${plural(kpis.crewsTotal, "crew")} · ${kpis.utilization === null ? "no crew-days to book" : `${kpis.utilization}% of crew-days`}`}
          title={kpis.definitions.crews}
        />
      </DxTilt>
      <DxTilt>
        <KpiCard
          icon={CalendarDays}
          tone="green"
          label="Scheduled Activities"
          value={kpis.activities}
          delta={`${kpis.hours} hrs · ${kpis.laborCost}`}
          title={kpis.definitions.activities}
        />
      </DxTilt>
      <DxTilt>
        <KpiCard
          icon={AlertTriangle}
          tone="red"
          label="At-Risk Items"
          value={kpis.atRisk}
          delta="conflicts & blockers"
          title={kpis.definitions.atRisk}
        />
      </DxTilt>
      <DxTilt>
        <KpiCard
          icon={CheckCircle2}
          tone="violet"
          label="Milestones This Month"
          value={kpis.milestones}
          delta={`due in ${kpis.monthShort}`}
          title={kpis.definitions.milestones}
        />
      </DxTilt>
    </div>
  );
}

/** Crews in board order: by the number in their name, then by name. */
export function crewScheduleOrder(crew: Crew) {
  const number = crew.name.match(/\d+/)?.[0];
  return number ? Number(number) : Number.MAX_SAFE_INTEGER;
}
