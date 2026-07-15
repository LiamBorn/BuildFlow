import { useState } from "react";
import {
  DollarSign,
  Target,
  Users,
  MessageSquare,
  Plus,
  Bell,
  StickyNote,
  Phone,
  Mail,
  CalendarClock,
  ArrowRightLeft,
  Circle,
  LifeBuoy,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Building2
} from "lucide-react";
import type { Desk } from "../SalesApp";
import type { Activity } from "../api";
import { Sparkline, ProgressRing, DxTilt } from "../hud-primitives";
import { Donut, type Segment } from "../Donut";
import { NewLeadModal } from "../NewLeadModal";
import { STAGES, statusTone, priorityTone, money, moneyFull, timeAgo, initials } from "../util";

export function Dashboard({ desk }: { desk: Desk }) {
  return desk.department === "support" ? <SupportDashboard desk={desk} /> : <SalesDashboard desk={desk} />;
}

// ── Statistic card (shared) ─────────────────────────────────────────────────
type Stat = { label: string; value: string; sub: string; icon: typeof DollarSign; tone: string; spark: number[] };
function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <section className="sd-stats" data-reveal-stagger>
      {stats.map((s) => (
        <DxTilt key={s.label}>
          <article className={`sd-stat tone-${s.tone}`}>
            <header>
              <span>{s.label}</span>
              <s.icon size={17} />
            </header>
            <strong>{s.value}</strong>
            <div className="sd-stat-foot">
              <span>{s.sub}</span>
              <Sparkline data={s.spark} tone={s.tone as never} />
            </div>
          </article>
        </DxTilt>
      ))}
    </section>
  );
}

// ============================================================================
// SALES DEPARTMENT — pipeline, leads, and sales inquiries.
// ============================================================================
const activityIcon: Record<Activity["type"], typeof StickyNote> = {
  note: StickyNote,
  call: Phone,
  email: Mail,
  meeting: CalendarClock,
  stage: ArrowRightLeft
};

function SalesDashboard({ desk }: { desk: Desk }) {
  const { data } = desk;
  const [modal, setModal] = useState(false);

  const open = data.leads.filter((l) => STAGES.includes(l.status as (typeof STAGES)[number]));
  const openValue = open.reduce((s, l) => s + l.value, 0);
  const won = data.leads.filter((l) => l.status === "Won");
  const lost = data.leads.filter((l) => l.status === "Lost");
  const wonValue = won.reduce((s, l) => s + l.value, 0);
  const winRate = won.length + lost.length > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) : 0;
  const inquiries = data.conversations.filter((c) => c.department === "sales" && c.status !== "closed");
  const tasks = data.tasks.filter((t) => t.department === "sales");
  const openTasks = tasks.filter((t) => !t.done);

  const segments: Segment[] = STAGES.map((stage) => ({
    label: stage,
    value: open.filter((l) => l.status === stage).reduce((s, l) => s + l.value, 0),
    tone: statusTone[stage]
  })).filter((s) => s.value > 0);

  const leadName = (id: string) => data.leads.find((l) => l.id === id);
  const followUps = open
    .filter((l) => !l.lastActivityAt || Date.now() - new Date(l.lastActivityAt).getTime() > 3 * 86_400_000)
    .slice(0, 4);

  const stats: Stat[] = [
    { label: "Open Pipeline", value: money(openValue), sub: `Across ${open.length} active leads`, icon: DollarSign, tone: "blue", spark: [8, 10, 9, 13, 12, 16, 18] },
    { label: "Closed Won", value: money(wonValue), sub: `${winRate}% win rate`, icon: Target, tone: "green", spark: [4, 6, 5, 8, 10, 12, 15] },
    { label: "Total Leads", value: String(data.leads.length), sub: "In workspace", icon: Users, tone: "violet", spark: [3, 4, 6, 6, 7, 8, 8] },
    { label: "Sales Inquiries", value: String(inquiries.length), sub: "Awaiting a reply", icon: MessageSquare, tone: "amber", spark: [2, 3, 2, 4, 3, 5, 4] }
  ];

  return (
    <div className="dx-inner sd-view">
      {modal && <NewLeadModal onClose={() => setModal(false)} onCreate={desk.createLead} />}

      <header className="sd-head" data-reveal>
        <div>
          <h1 className="sd-h1">Sales Dashboard</h1>
          <p className="sd-sub">Here's what's happening with your pipeline today.</p>
        </div>
        <button type="button" className="sd-btn primary" onClick={() => setModal(true)}>
          <Plus size={17} /> New Lead
        </button>
      </header>

      <StatCards stats={stats} />

      <div className="sd-cols">
        <div className="sd-col-main">
          <section className="sd-card" data-reveal>
            <header className="sd-card-head">
              <div>
                <h2>Pipeline by Stage</h2>
                <p>Value distribution across active stages</p>
              </div>
            </header>
            <div className="sd-pipeline">
              <div className="sd-donut-wrap">
                <Donut segments={segments} />
                <div className="sd-donut-center">
                  <b>{money(openValue)}</b>
                  <i>open</i>
                </div>
              </div>
              <ul className="sd-legend">
                {STAGES.map((stage) => {
                  const v = open.filter((l) => l.status === stage).reduce((s, l) => s + l.value, 0);
                  return (
                    <li key={stage}>
                      <i className={`tone-${statusTone[stage]}`} />
                      <span>{stage}</span>
                      <b>{moneyFull(v)}</b>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          <section className="sd-card" data-reveal>
            <header className="sd-card-head">
              <div>
                <h2>Recent Activity</h2>
                <p>Latest outreach across your leads</p>
              </div>
            </header>
            <ul className="sd-activity">
              {data.activities.slice(0, 6).map((a) => {
                const Icon = activityIcon[a.type];
                const lead = leadName(a.leadId);
                return (
                  <li key={a.id}>
                    <span className={`sd-act-ic tone-${statusTone[lead?.status ?? "New"]}`}>
                      <Icon size={15} />
                    </span>
                    <div className="sd-act-body">
                      <p>{a.summary}</p>
                      {lead && (
                        <span className="sd-act-meta">
                          {lead.name} · {lead.company}
                        </span>
                      )}
                    </div>
                    <time>{timeAgo(a.createdAt)}</time>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div className="sd-col-rail">
          <section className="sd-card" data-reveal>
            <header className="sd-card-head">
              <div>
                <h2>Today's Tasks</h2>
                <p>{openTasks.length} open</p>
              </div>
              <ProgressRing value={tasks.length ? ((tasks.length - openTasks.length) / tasks.length) * 100 : 0} tone="blue" size={40} />
            </header>
            <ul className="sd-tasklist">
              {openTasks.slice(0, 4).map((t) => {
                const lead = t.leadId ? leadName(t.leadId) : undefined;
                return (
                  <li key={t.id}>
                    <button type="button" className="sd-check" onClick={() => desk.toggleTask(t)} aria-label="Complete task">
                      <Circle size={18} />
                    </button>
                    <div>
                      <p>{t.title}</p>
                      {lead && (
                        <span className="sd-task-meta">
                          {lead.name} · {lead.company}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
              {openTasks.length === 0 && <li className="sd-empty">All caught up 🎉</li>}
            </ul>
            <button type="button" className="sd-card-link" onClick={() => desk.go("tasks")}>
              View all tasks →
            </button>
          </section>

          <section className="sd-card" data-reveal>
            <header className="sd-card-head">
              <div>
                <h2 className="sd-danger">
                  <Bell size={16} /> Follow-ups Needed
                </h2>
                <p>Leads not contacted recently</p>
              </div>
            </header>
            <ul className="sd-followups">
              {followUps.map((l) => (
                <li key={l.id} onClick={() => desk.go("leads", l.id)}>
                  <span className="sd-avatar sm">{initials(l.name)}</span>
                  <div>
                    <p>{l.name}</p>
                    <span>{l.company}</span>
                  </div>
                  <span className={`sd-badge tone-${statusTone[l.status]}`}>{l.status}</span>
                </li>
              ))}
              {followUps.length === 0 && <li className="sd-empty">Everyone's been contacted 👍</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CUSTOMER SUPPORT DEPARTMENT — the General Support queue.
// ============================================================================
function SupportDashboard({ desk }: { desk: Desk }) {
  const { data } = desk;
  const convos = data.conversations.filter((c) => c.department === "support");
  const openC = convos.filter((c) => c.status === "open");
  const waiting = convos.filter((c) => c.status === "pending");
  const resolved = convos.filter((c) => c.status === "closed");
  const highPriority = convos.filter((c) => c.status !== "closed" && (c.priority === "High" || c.priority === "Urgent"));
  const tasks = data.tasks.filter((t) => t.department === "support");
  const openTasks = tasks.filter((t) => !t.done);

  // Queue = anything still needing us, newest activity first.
  const queue = [...openC, ...waiting].sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt));

  const stats: Stat[] = [
    { label: "Open Tickets", value: String(openC.length), sub: "Need a response", icon: LifeBuoy, tone: "green", spark: [3, 4, 3, 5, 4, 6, 5] },
    { label: "Waiting on Customer", value: String(waiting.length), sub: "Awaiting their reply", icon: Clock, tone: "amber", spark: [1, 2, 2, 1, 3, 2, 2] },
    { label: "High Priority", value: String(highPriority.length), sub: "Escalated / urgent", icon: AlertTriangle, tone: "red", spark: [0, 1, 1, 2, 1, 2, 2] },
    { label: "Resolved", value: String(resolved.length), sub: "Closed recently", icon: CheckCircle2, tone: "blue", spark: [2, 3, 4, 5, 6, 7, 9] }
  ];

  return (
    <div className="dx-inner sd-view">
      <header className="sd-head" data-reveal>
        <div>
          <h1 className="sd-h1">Support Dashboard</h1>
          <p className="sd-sub">Everything customers need help with — routed to Customer Support.</p>
        </div>
        <button type="button" className="sd-btn primary" onClick={() => desk.go("conversations")}>
          <LifeBuoy size={17} /> Open inbox
        </button>
      </header>

      <StatCards stats={stats} />

      <div className="sd-cols">
        <div className="sd-col-main">
          <section className="sd-card" data-reveal>
            <header className="sd-card-head">
              <div>
                <h2>General Support Queue</h2>
                <p>Conversations still needing your team</p>
              </div>
              <span className="sd-count-pill">{queue.length}</span>
            </header>
            <ul className="sd-queue">
              {queue.map((c) => (
                <li key={c.id} onClick={() => desk.go("conversations", c.id)}>
                  <span className="sd-avatar sm">{initials(c.name)}</span>
                  <div className="sd-queue-body">
                    <p>{c.subject}</p>
                    <span className="sd-queue-meta">
                      {c.name} · {c.company}
                    </span>
                  </div>
                  <div className="sd-queue-side">
                    <span className={`sd-prio tone-${priorityTone[c.priority]}`}>{c.priority}</span>
                    <time>{timeAgo(c.lastMessageAt)}</time>
                  </div>
                </li>
              ))}
              {queue.length === 0 && <li className="sd-empty">Inbox zero — nothing waiting 🎉</li>}
            </ul>
          </section>
        </div>

        <div className="sd-col-rail">
          <section className="sd-card" data-reveal>
            <header className="sd-card-head">
              <div>
                <h2>Today's Tasks</h2>
                <p>{openTasks.length} open</p>
              </div>
              <ProgressRing value={tasks.length ? ((tasks.length - openTasks.length) / tasks.length) * 100 : 0} tone="green" size={40} />
            </header>
            <ul className="sd-tasklist">
              {openTasks.slice(0, 4).map((t) => (
                <li key={t.id}>
                  <button type="button" className="sd-check" onClick={() => desk.toggleTask(t)} aria-label="Complete task">
                    <Circle size={18} />
                  </button>
                  <div>
                    <p>{t.title}</p>
                  </div>
                </li>
              ))}
              {openTasks.length === 0 && <li className="sd-empty">All caught up 🎉</li>}
            </ul>
            <button type="button" className="sd-card-link" onClick={() => desk.go("tasks")}>
              View all tasks →
            </button>
          </section>

          <section className="sd-card" data-reveal>
            <header className="sd-card-head">
              <div>
                <h2 className="sd-danger">
                  <AlertTriangle size={16} /> Needs Attention
                </h2>
                <p>High-priority open tickets</p>
              </div>
            </header>
            <ul className="sd-followups">
              {highPriority.map((c) => (
                <li key={c.id} onClick={() => desk.go("conversations", c.id)}>
                  <span className="sd-search-ic">
                    <Building2 size={15} />
                  </span>
                  <div>
                    <p>{c.subject}</p>
                    <span>{c.name} · {c.company}</span>
                  </div>
                  <ArrowRight size={15} />
                </li>
              ))}
              {highPriority.length === 0 && <li className="sd-empty">Nothing urgent 👍</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
