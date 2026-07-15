import { useEffect, useMemo, useState } from "react";
import { Plus, Mail, Phone, Building2, X, ChevronDown } from "lucide-react";
import type { Desk } from "../SalesApp";
import type { Lead, LeadStatus } from "../api";
import { NewLeadModal } from "../NewLeadModal";
import { statusTone, moneyFull, timeAgo, dateLabel, initials } from "../util";

const ALL_STATUSES: LeadStatus[] = ["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"];

export function Leads({ desk }: { desk: Desk }) {
  const { data, focusId } = desk;
  const [modal, setModal] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | LeadStatus>("all");
  const [openId, setOpenId] = useState<string | undefined>(focusId);

  useEffect(() => {
    if (focusId) setOpenId(focusId);
  }, [focusId]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.leads.filter((l) => {
      if (status !== "all" && l.status !== status) return false;
      if (!needle) return true;
      return `${l.name} ${l.company} ${l.email}`.toLowerCase().includes(needle);
    });
  }, [data.leads, q, status]);

  const active = openId ? data.leads.find((l) => l.id === openId) : undefined;

  return (
    <div className="dx-inner sd-view">
      {modal && <NewLeadModal onClose={() => setModal(false)} onCreate={desk.createLead} />}

      <header className="sd-head" data-reveal>
        <div>
          <h1 className="sd-h1">Leads</h1>
          <p className="sd-sub">Manage your active prospects and deals.</p>
        </div>
        <button type="button" className="sd-btn primary" onClick={() => setModal(true)}>
          <Plus size={17} /> New Lead
        </button>
      </header>

      <div className="sd-filters" data-reveal>
        <div className="sd-input">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, company, email…" />
        </div>
        <div className="sd-select">
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="all">All Statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <ChevronDown size={16} />
        </div>
      </div>

      <section className="sd-card sd-tablecard" data-reveal>
        <table className="sd-table">
          <thead>
            <tr>
              <th>Lead</th>
              <th>Contact</th>
              <th>Status</th>
              <th className="num">Value</th>
              <th>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} onClick={() => setOpenId(l.id)} className={openId === l.id ? "on" : ""}>
                <td>
                  <div className="sd-lead-cell">
                    <span className="sd-avatar sm">{initials(l.name)}</span>
                    <div>
                      <b>{l.name}</b>
                      <span className="sd-cell-sub">
                        <Building2 size={12} /> {l.company}
                      </span>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="sd-cell-sub">
                    <Mail size={12} /> {l.email}
                  </span>
                  {l.phone && (
                    <span className="sd-cell-sub">
                      <Phone size={12} /> {l.phone}
                    </span>
                  )}
                </td>
                <td>
                  <span className={`sd-badge tone-${statusTone[l.status]}`}>{l.status}</span>
                </td>
                <td className="num">{moneyFull(l.value)}</td>
                <td className="sd-muted">{timeAgo(l.lastActivityAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="sd-empty">
                  No leads match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {active && <LeadDrawer lead={active} desk={desk} onClose={() => setOpenId(undefined)} />}
    </div>
  );
}

function LeadDrawer({ lead, desk, onClose }: { lead: Lead; desk: Desk; onClose: () => void }) {
  const activities = desk.data.activities.filter((a) => a.leadId === lead.id);
  return (
    <div className="sd-drawer-backdrop" onClick={onClose}>
      <aside className="sd-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="sd-drawer-head">
          <span className="sd-avatar lg">{initials(lead.name)}</span>
          <div>
            <h3>{lead.name}</h3>
            <p>
              <Building2 size={13} /> {lead.company}
            </p>
          </div>
          <button type="button" className="sd-modal-x" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="sd-drawer-body">
          <div className="sd-drawer-grid">
            <div>
              <span className="sd-k">Deal value</span>
              <b className="sd-v">{moneyFull(lead.value)}</b>
            </div>
            <div>
              <span className="sd-k">Owner</span>
              <b className="sd-v">{lead.owner || "—"}</b>
            </div>
            <div>
              <span className="sd-k">Source</span>
              <b className="sd-v">{lead.source || "—"}</b>
            </div>
            <div>
              <span className="sd-k">Interested in</span>
              <b className="sd-v">{lead.interest || "—"}</b>
            </div>
          </div>

          <div className="sd-drawer-stage">
            <span className="sd-k">Stage</span>
            <div className="sd-stage-chips">
              {ALL_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`sd-badge tone-${statusTone[s]} ${lead.status === s ? "on" : "ghost"}`}
                  onClick={() => desk.moveLead(lead.id, s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="sd-drawer-contact">
            <a href={`mailto:${lead.email}`}>
              <Mail size={14} /> {lead.email}
            </a>
            {lead.phone && (
              <a href={`tel:${lead.phone}`}>
                <Phone size={14} /> {lead.phone}
              </a>
            )}
          </div>

          {lead.notes && (
            <div className="sd-drawer-notes">
              <span className="sd-k">Notes</span>
              <p>{lead.notes}</p>
            </div>
          )}

          <div className="sd-drawer-timeline">
            <span className="sd-k">Activity</span>
            {activities.length === 0 && <p className="sd-muted">No activity logged yet.</p>}
            <ul>
              {activities.map((a) => (
                <li key={a.id}>
                  <i />
                  <p>{a.summary}</p>
                  <time>{dateLabel(a.createdAt)}</time>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}
