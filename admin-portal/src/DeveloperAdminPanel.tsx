import { useRef } from "react";
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Cpu,
  CreditCard,
  Database,
  DollarSign,
  Gauge,
  Globe2,
  Rocket,
  Server,
  Sparkles,
  TerminalSquare,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  Zap
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart as RechartsLineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { DxTilt, Panel, ProgressRing, Sparkline, useHudMotion, type CcTone } from "./hud-primitives";
import { DottedGlobe } from "./DottedGlobe";
import type { BootstrapData } from "./api";

type AdmTone = CcTone;

// Ported from the BuildFlow HUD's DeveloperAdminPanel, re-laid-out to the Soft UI
// "General Statistics" reference: heading → icon-on-right stat cards → a table
// beside a dotted globe → a full-width overview chart. Colors and every motion
// hook (reveals, tilt, sparklines, rings) are unchanged.
export function DeveloperAdminPanel({ data, onOpenBuildFlow }: { data: BootstrapData; onOpenBuildFlow: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useHudMotion(rootRef);

  // The one fully-live signal: objects this workspace is actively managing.
  const managedObjects =
    data.projects.length + data.jobs.length + data.crews.length + data.equipment.length + data.materials.length;

  const admStats: Array<{
    id: string;
    icon: typeof DollarSign;
    tone: AdmTone;
    label: string;
    value: string;
    small?: string;
    trend: "up" | "down" | "flag";
    delta: string;
    note: string;
    spark: number[];
  }> = [
    { id: "mrr", icon: DollarSign, tone: "green", label: "Monthly Recurring Revenue", value: "$48.2k", trend: "up", delta: "+12.4%", note: "vs last month", spark: [31.5, 34.2, 37.6, 40.1, 42.9, 45.7, 46.9, 48.25] },
    { id: "users", icon: Users, tone: "blue", label: "Active Users", value: "2,847", trend: "up", delta: "+8.1%", note: "30-day active", spark: [2180, 2295, 2360, 2510, 2590, 2680, 2760, 2847] },
    { id: "live", icon: Activity, tone: "violet", label: "Live Right Now", value: "312", small: "online", trend: "up", delta: "+27", note: "real-time sessions", spark: [220, 250, 280, 260, 300, 290, 320, 312] },
    { id: "signups", icon: UserPlus, tone: "orange", label: "New Signups", value: "428", trend: "up", delta: "+19%", note: "last 30 days", spark: [78, 92, 85, 104, 96, 118, 112, 128] },
    { id: "uptime", icon: Gauge, tone: "green", label: "Uptime", value: "99.98%", trend: "up", delta: "SLA met", note: "trailing 30 days", spark: [99.95, 99.99, 100, 99.97, 99.99, 99.98, 100, 99.98] }
  ];

  const revenueTrend = [
    { m: "Aug", mrr: 18200 }, { m: "Sep", mrr: 21400 }, { m: "Oct", mrr: 24900 },
    { m: "Nov", mrr: 27100 }, { m: "Dec", mrr: 29800 }, { m: "Jan", mrr: 31500 },
    { m: "Feb", mrr: 34200 }, { m: "Mar", mrr: 37600 }, { m: "Apr", mrr: 40100 },
    { m: "May", mrr: 42900 }, { m: "Jun", mrr: 45700 }, { m: "Jul", mrr: 48250 }
  ];
  const mrrNow = 48250;
  const arrNow = mrrNow * 12;
  const revenueBreakdown: Array<{ label: string; value: number; tone: AdmTone }> = [
    { label: "New business", value: 4200, tone: "green" },
    { label: "Expansion", value: 1800, tone: "blue" },
    { label: "Churned", value: -3450, tone: "red" }
  ];

  const planMix = [
    { name: "Starter", workspaces: 284, revShare: 22, color: "#4285f4" },
    { name: "Pro", workspaces: 172, revShare: 49, color: "#9b72cb" },
    { name: "Enterprise", workspaces: 30, revShare: 29, color: "#188038" }
  ];
  const totalWorkspaces = planMix.reduce((sum, plan) => sum + plan.workspaces, 0);
  const planPie = planMix.map((plan) => ({ name: plan.name, value: plan.revShare, color: plan.color }));

  const wauTrend = [
    { w: "6w", users: 2180 }, { w: "5w", users: 2360 }, { w: "4w", users: 2510 },
    { w: "3w", users: 2590 }, { w: "2w", users: 2680 }, { w: "1w", users: 2760 }, { w: "Now", users: 2847 }
  ];
  const apiTraffic = [
    { t: "00", reqs: 38 }, { t: "03", reqs: 29 }, { t: "06", reqs: 44 }, { t: "09", reqs: 92 },
    { t: "12", reqs: 120 }, { t: "15", reqs: 110 }, { t: "18", reqs: 96 }, { t: "21", reqs: 63 }
  ];
  const errorRate = [
    { t: "00", rate: 0.04 }, { t: "03", rate: 0.03 }, { t: "06", rate: 0.05 }, { t: "09", rate: 0.08 },
    { t: "12", rate: 0.11 }, { t: "15", rate: 0.19 }, { t: "18", rate: 0.07 }, { t: "21", rate: 0.05 }
  ];

  const backgroundJobs: Array<{ id: string; icon: typeof CreditCard; tone: AdmTone; title: string; sub: string; progress: number; ago: string }> = [
    { id: "bj-billing", icon: CreditCard, tone: "green", title: "Billing reconciliation", sub: "Stripe invoices · nightly run", progress: 82, ago: "2 min ago" },
    { id: "bj-metering", icon: Activity, tone: "blue", title: "Usage metering rollup", sub: "Aggregating API + seat usage", progress: 64, ago: "6 min ago" },
    { id: "bj-weather", icon: Globe2, tone: "amber", title: "Weather data sync", sub: "NOAA + provider ingest", progress: 47, ago: "9 min ago" },
    { id: "bj-search", icon: Database, tone: "violet", title: "Search reindex", sub: "Projects + jobs index", progress: 38, ago: "12 min ago" }
  ];

  const services: Array<{ id: string; label: string; status: string; tone: AdmTone; meta: string }> = [
    { id: "svc-api", label: "API Gateway", status: "Operational", tone: "green", meta: "142ms p95" },
    { id: "svc-db", label: "Database", status: "Operational", tone: "green", meta: "18ms" },
    { id: "svc-auth", label: "Auth Service", status: "Operational", tone: "green", meta: "63ms" },
    { id: "svc-rt", label: "Realtime", status: "Degraded", tone: "amber", meta: "210ms" },
    { id: "svc-pay", label: "Payments · Stripe", status: "Operational", tone: "green", meta: "240ms" }
  ];

  const infra: Array<{ id: string; icon: typeof Cpu; label: string; value: number; tone: AdmTone }> = [
    { id: "cpu", icon: Cpu, label: "CPU", value: 34, tone: "blue" },
    { id: "mem", icon: Server, label: "Memory", value: 61, tone: "violet" },
    { id: "disk", icon: Database, label: "DB Storage", value: 48, tone: "amber" },
    { id: "cache", icon: Zap, label: "Cache Hit Rate", value: 96, tone: "green" }
  ];

  const deploys: Array<{ id: string; version: string; note: string; ago: string; status: string; tone: AdmTone }> = [
    { id: "d1", version: "v2.14.0", note: "Command Center perf pass", ago: "12 min ago", status: "Live", tone: "green" },
    { id: "d2", version: "v2.13.2", note: "Schedule calendar hotfix", ago: "3 hrs ago", status: "Live", tone: "green" },
    { id: "d3", version: "v2.13.1", note: "Weather ingest retries", ago: "Yesterday", status: "Live", tone: "green" },
    { id: "d4", version: "v2.13.0", note: "Realtime presence rollout", ago: "2 days ago", status: "Rolled back", tone: "red" }
  ];

  const topWorkspaces = [
    { id: "w1", name: "Summit Construction", plan: "Enterprise", seats: 48, mrr: 4850 },
    { id: "w2", name: "Apex Utilities", plan: "Enterprise", seats: 40, mrr: 4200 },
    { id: "w3", name: "Vanguard Builders", plan: "Pro", seats: 22, mrr: 2400 },
    { id: "w4", name: "Ironclad Concrete", plan: "Pro", seats: 18, mrr: 1900 },
    { id: "w5", name: "Northstar Roofing", plan: "Pro", seats: 12, mrr: 1200 }
  ];

  const recentSignups: Array<{ id: string; name: string; plan: string; tone: AdmTone; ago: string }> = [
    { id: "s1", name: "Bedrock Excavation", plan: "Pro", tone: "violet", ago: "8 min ago" },
    { id: "s2", name: "Meridian Mechanical", plan: "Starter", tone: "blue", ago: "41 min ago" },
    { id: "s3", name: "Cornerstone GC", plan: "Enterprise", tone: "green", ago: "2 hrs ago" },
    { id: "s4", name: "Ridgeline Paving", plan: "Starter", tone: "blue", ago: "5 hrs ago" }
  ];

  const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString()}`;

  return (
    <div className="dash-rx admin-rx" ref={rootRef}>
      <div className="dx-bg" aria-hidden="true">
        <span className="dx-aurora dx-aurora-1" />
        <span className="dx-aurora dx-aurora-2" />
        <span className="dx-aurora dx-aurora-3" />
      </div>
      <div className="dx-cursor" aria-hidden="true" />

      <div className="dx-inner">
        {/* ── heading ────────────────────────────────────────────────── */}
        <header className="cc-hero" data-reveal>
          <span className="cc-eyebrow">
            <span className="dx-dot" />
            Developer · Admin Console
          </span>
          <div className="cc-hero-head">
            <span className="cc-hero-icon">
              <TerminalSquare size={22} />
            </span>
            <div>
              <h1 className="cc-hero-title">General Statistics</h1>
              <p className="cc-hero-sub">
                Revenue, growth, and platform health for BuildFlow — the operator&apos;s view.
              </p>
            </div>
          </div>
          <div className="adm-hero-meta">
            <span className="adm-live">
              <span className="adm-live-dot" />
              All systems operational
            </span>
            <span className="adm-hero-sep">·</span>
            <span>{totalWorkspaces} workspaces</span>
            <span className="adm-hero-sep">·</span>
            <span>{usd(arrNow)} ARR</span>
            <span className="adm-hero-sep">·</span>
            <span>{managedObjects.toLocaleString()} objects in this workspace</span>
          </div>
        </header>

        {/* ── row 1: headline stat cards (icon on the right) ─────────── */}
        <div className="cc-stat-grid" data-reveal-stagger>
          {admStats.map((stat) => {
            const Icon = stat.icon;
            const TrendIcon = stat.trend === "down" ? TrendingDown : stat.trend === "flag" ? AlertTriangle : TrendingUp;
            return (
              <DxTilt key={stat.id} max={5}>
                <article className={`cc-stat adm-soft${stat.id === "live" ? " adm-stat-live" : ""}`}>
                  <div className="adm-soft-main">
                    <span className="cc-stat-label">{stat.label}</span>
                    <div className="adm-soft-figure">
                      <span className="cc-stat-value">
                        {stat.value}
                        {stat.small && <small> {stat.small}</small>}
                      </span>
                      <span className={`cc-trend ${stat.trend}`}>
                        <TrendIcon />
                        {stat.delta}
                      </span>
                    </div>
                    <Sparkline data={stat.spark} tone={stat.tone} />
                  </div>
                  <span className={`cc-stat-ico tone-${stat.tone}`}>
                    <Icon />
                  </span>
                </article>
              </DxTilt>
            );
          })}
        </div>

        {/* ── row 2: table beside a dotted globe ─────────────────────── */}
        <div className="adm-overview-row" data-reveal>
          <section className="cc-panel adm-country-card">
            <div className="cc-panel-head">
              <div>
                <h2>Top Workspaces</h2>
                <p className="adm-panel-sub">
                  <CheckCircle2 size={13} /> {totalWorkspaces} active accounts
                </p>
              </div>
              <button type="button" className="cc-link" onClick={onOpenBuildFlow}>
                Manage
              </button>
            </div>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Workspace</th>
                  <th>Plan</th>
                  <th>Seats</th>
                  <th>MRR</th>
                </tr>
              </thead>
              <tbody>
                {topWorkspaces.map((workspace) => (
                  <tr key={workspace.id}>
                    <td>
                      <span className="adm-ws-name">
                        <Building2 size={15} />
                        {workspace.name}
                      </span>
                    </td>
                    <td>
                      <span className={`adm-plan-tag ${workspace.plan.toLowerCase()}`}>{workspace.plan}</span>
                    </td>
                    <td>{workspace.seats}</td>
                    <td className="adm-ws-mrr">{usd(workspace.mrr)}/mo</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="cc-panel adm-globe-card">
            <div className="cc-panel-head">
              <div>
                <h2>Global Reach</h2>
                <p className="adm-panel-sub">Workspaces around the world</p>
              </div>
              <span className="adm-badge ok">
                <span className="adm-live-dot" />
                Live
              </span>
            </div>
            <DottedGlobe />
            <div className="adm-globe-foot">
              <div>
                <b>{totalWorkspaces}</b>
                <span>workspaces</span>
              </div>
              <div>
                <b>18</b>
                <span>regions</span>
              </div>
              <div>
                <b>312</b>
                <span>online now</span>
              </div>
            </div>
          </section>
        </div>

        {/* ── row 3: sales / revenue overview ────────────────────────── */}
        <section data-reveal>
          <div className="cc-sec-head">
            <h2>Revenue Overview</h2>
            <button type="button" className="cc-link" onClick={onOpenBuildFlow}>
              View reports
            </button>
          </div>
          <div className="cc-panel adm-rev">
            <div className="adm-rev-head">
              <div className="adm-rev-figure">
                <span className="adm-rev-label">MRR</span>
                <strong>{usd(mrrNow)}</strong>
                <span className="cc-trend up">
                  <TrendingUp />
                  +12.4%
                </span>
              </div>
              <div className="adm-rev-figure alt">
                <span className="adm-rev-label">ARR</span>
                <strong>{usd(arrNow)}</strong>
                <span className="adm-rev-sub">projected annual</span>
              </div>
              <div className="adm-rev-break">
                {revenueBreakdown.map((item) => (
                  <span key={item.label} className={`adm-break-chip tone-${item.tone}`}>
                    <em>{item.label}</em>
                    <b>{item.value >= 0 ? `+${usd(item.value)}` : usd(item.value)}</b>
                  </span>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={revenueTrend} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="admMrrFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#188038" stopOpacity={0.42} />
                    <stop offset="95%" stopColor="#188038" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(28, 28, 26, 0.07)" vertical={false} />
                <XAxis dataKey="m" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v: number) => `$${v / 1000}k`} width={44} />
                <Tooltip formatter={(value) => [usd(Number(value)), "MRR"]} />
                <Area dataKey="mrr" stroke="#188038" fill="url(#admMrrFill)" strokeWidth={2.4} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* ── secondary: usage + jobs, with a platform-health rail ───── */}
        <div className="cc-grid">
          <div className="cc-main">
            <section data-reveal>
              <div className="cc-sec-head">
                <h2>Platform Usage</h2>
                <span className="cc-link" aria-hidden="true">
                  Live
                </span>
              </div>
              <div className="adm-duo">
                <div className="cc-panel">
                  <div className="cc-panel-head">
                    <h2>Weekly Active Users</h2>
                    <span className="adm-chip-num">2,847</span>
                  </div>
                  <ResponsiveContainer width="100%" height={190}>
                    <BarChart data={wauTrend} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(28, 28, 26, 0.07)" vertical={false} />
                      <XAxis dataKey="w" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} fontSize={12} width={40} />
                      <Tooltip formatter={(value) => [Number(value).toLocaleString(), "WAU"]} cursor={{ fill: "rgba(47,107,255,0.06)" }} />
                      <Bar dataKey="users" fill="#2f6bff" radius={[5, 5, 0, 0]} maxBarSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="cc-panel">
                  <div className="cc-panel-head">
                    <h2>Plan Distribution</h2>
                    <span className="adm-chip-num">{totalWorkspaces}</span>
                  </div>
                  <div className="adm-plan-list">
                    {planMix.map((plan) => (
                      <div key={plan.name} className="adm-plan">
                        <div className="adm-plan-top">
                          <span className="adm-plan-name">
                            <i style={{ background: plan.color }} />
                            {plan.name}
                          </span>
                          <span className="adm-plan-count">{plan.workspaces} ws</span>
                        </div>
                        <div className="adm-plan-bar">
                          <span style={{ width: `${(plan.workspaces / totalWorkspaces) * 100}%`, background: plan.color }} />
                        </div>
                        <span className="adm-plan-rev">{plan.revShare}% of revenue</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section data-reveal>
              <div className="cc-sec-head">
                <h2>Background Jobs</h2>
                <span className="cc-link" aria-hidden="true">
                  4 running
                </span>
              </div>
              <div className="cc-workflows">
                {backgroundJobs.map((job) => {
                  const Icon = job.icon;
                  return (
                    <article key={job.id} className={`cc-wf tone-${job.tone}`}>
                      <span className="cc-wf-ico">
                        <Icon size={19} />
                      </span>
                      <div className="cc-wf-body">
                        <strong>{job.title}</strong>
                        <span>{job.sub}</span>
                      </div>
                      <ProgressRing value={job.progress} tone={job.tone} size={44} />
                      <span className="cc-status">Running</span>
                      <span className="cc-wf-time">{job.ago}</span>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="cc-rail">
            <section className="cc-panel" data-reveal>
              <div className="cc-panel-head">
                <h2>System Health</h2>
                <span className="adm-badge ok">
                  <Server size={13} />
                  Operational
                </span>
              </div>
              <div className="cc-list">
                {services.map((service) => (
                  <div key={service.id} className="adm-svc">
                    <span className={`adm-dot tone-${service.tone}`} />
                    <span className="adm-svc-name">{service.label}</span>
                    <span className="adm-svc-meta">{service.meta}</span>
                    <span className={`adm-svc-status tone-${service.tone}`}>{service.status}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="cc-panel" data-reveal>
              <div className="cc-panel-head">
                <h2>Infrastructure</h2>
                <span className="adm-badge">us-east-1</span>
              </div>
              <div className="adm-meters">
                {infra.map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <div key={metric.id} className="adm-meter">
                      <span className={`adm-meter-ico tone-${metric.tone}`}>
                        <Icon size={15} />
                      </span>
                      <div className="adm-meter-body">
                        <div className="adm-meter-top">
                          <span>{metric.label}</span>
                          <b>{metric.value}%</b>
                        </div>
                        <div className="adm-meter-bar">
                          <span className={`tone-${metric.tone}`} style={{ width: `${metric.value}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="cc-panel" data-reveal>
              <div className="cc-panel-head">
                <h2>Recent Deploys</h2>
                <Rocket size={15} />
              </div>
              <div className="cc-list">
                {deploys.map((deploy) => (
                  <div key={deploy.id} className="adm-deploy">
                    <span className={`adm-deploy-dot tone-${deploy.tone}`} />
                    <div className="adm-deploy-main">
                      <strong>{deploy.version}</strong>
                      <span>{deploy.note}</span>
                    </div>
                    <div className="adm-deploy-side">
                      <em className={`tone-${deploy.tone}`}>{deploy.status}</em>
                      <span>{deploy.ago}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>

        {/* ── platform context grid ──────────────────────────────────── */}
        <div className="dx-sec-head" data-reveal>
          <span className="dx-eyebrow-2">Platform Context</span>
          <h2 className="dx-h2">
            The business <em>behind the build.</em>
          </h2>
        </div>

        <div className="dashboard-grid">
          <Panel title="Revenue by Plan" reveal>
            <div className="chart-row">
              <ResponsiveContainer width="48%" height={190}>
                <PieChart>
                  <Pie data={planPie} dataKey="value" innerRadius={42} outerRadius={78} paddingAngle={1}>
                    {planPie.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [`${Number(value)}%`, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="legend-list">
                {planMix.map((plan) => (
                  <span key={plan.name}>
                    <i style={{ backgroundColor: plan.color }} />
                    {plan.name}
                    <strong>{plan.revShare}%</strong>
                  </span>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="Recent Signups" action="View all" reveal>
            <div className="adm-signups">
              {recentSignups.map((signup) => (
                <div key={signup.id} className="adm-signup">
                  <span className={`adm-signup-avatar tone-${signup.tone}`}>{signup.name.charAt(0)}</span>
                  <div className="adm-signup-main">
                    <strong>{signup.name}</strong>
                    <span>{signup.plan} plan</span>
                  </div>
                  <span className="adm-signup-time">{signup.ago}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="API Requests · 24h" className="span-2" action="1.24M today" reveal>
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={apiTraffic} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="admApiFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#2f6bff" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#2f6bff" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(28, 28, 26, 0.07)" vertical={false} />
                <XAxis dataKey="t" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={40} tickFormatter={(v: number) => `${v}k`} />
                <Tooltip formatter={(value) => [`${Number(value)}k req`, "Requests"]} />
                <Area dataKey="reqs" stroke="#2f6bff" fill="url(#admApiFill)" strokeWidth={2.2} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title="Error Rate · 24h" action="0.06% avg" reveal>
            <ResponsiveContainer width="100%" height={210}>
              <RechartsLineChart data={errorRate} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(28, 28, 26, 0.07)" vertical={false} />
                <XAxis dataKey="t" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={40} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip formatter={(value) => [`${Number(value)}%`, "Error rate"]} />
                <Line dataKey="rate" stroke="#c5221f" strokeWidth={2.2} dot={false} />
              </RechartsLineChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title="Health Summary" reveal>
            <div className="adm-summary">
              <div className="adm-summary-row">
                <span className="adm-summary-ico tone-green">
                  <CheckCircle2 size={16} />
                </span>
                <div>
                  <strong>All critical services healthy</strong>
                  <span>4 of 5 operational · Realtime degraded</span>
                </div>
              </div>
              <div className="adm-summary-row">
                <span className="adm-summary-ico tone-blue">
                  <Activity size={16} />
                </span>
                <div>
                  <strong>p95 latency 142ms</strong>
                  <span>Within the 200ms SLO target</span>
                </div>
              </div>
              <div className="adm-summary-row">
                <span className="adm-summary-ico tone-violet">
                  <Sparkles size={16} />
                </span>
                <div>
                  <strong>Net revenue retention 118%</strong>
                  <span>Expansion outpacing churn this month</span>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
