import { useEffect, useRef, useState } from "react";
import { User, Bell, Inbox, MessageSquare, Trash2, Plus, Check, CircleDot, Users, UserPlus, Crown, X } from "lucide-react";
import { initials } from "../util";
import { fetchAgents, addAgent, removeAgent, type SupportAgent, type AgentRole } from "../api";

const roleTone: Record<AgentRole, string> = { Owner: "violet", Admin: "blue", Agent: "green" };

// Customer Support workspace settings. Demo-persisted to localStorage (no backend
// model for preferences) — same pattern as the department/auth keys.
type SupportSettings = {
  displayName: string;
  status: "online" | "away" | "offline";
  autoAccept: boolean;
  notifyNewTicket: boolean;
  notifyDesktop: boolean;
  notifySound: boolean;
  dailyDigest: boolean;
  defaultSort: "recent" | "priority";
  showClosed: boolean;
  signature: string;
  cannedReplies: string[];
};

const KEY = "bf-sales-desk-support-settings";
const DEFAULTS: SupportSettings = {
  displayName: "Support Agent",
  status: "online",
  autoAccept: true,
  notifyNewTicket: true,
  notifyDesktop: false,
  notifySound: true,
  dailyDigest: true,
  defaultSort: "recent",
  showClosed: false,
  signature: "Thanks,\nThe BuildFlow Support Team",
  cannedReplies: [
    "Thanks for reaching out — I'm looking into this now and will update you shortly.",
    "Could you share a screenshot or the exact steps so I can reproduce it?",
    "Glad that's sorted! I'll close this out — reply any time to reopen."
  ]
};

function load(): SupportSettings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<SupportSettings>) };
  } catch {
    return DEFAULTS;
  }
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={`sd-toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}>
      <span className="sd-toggle-knob" />
    </button>
  );
}

export function Settings({ email }: { email: string }) {
  const [settings, setSettings] = useState<SupportSettings>(load);
  const [saved, setSaved] = useState(false);
  const [newReply, setNewReply] = useState("");
  const mounted = useRef(false);

  // Customer Support team roster (shared, from the backend).
  const [agents, setAgents] = useState<SupportAgent[]>([]);
  const [addingMember, setAddingMember] = useState(false);
  const [member, setMember] = useState<{ name: string; email: string; role: AgentRole }>({ name: "", email: "", role: "Agent" });
  const [memberError, setMemberError] = useState("");
  useEffect(() => {
    fetchAgents().then(setAgents);
  }, []);

  // Auto-save on any change (skip the initial mount so it doesn't flash "Saved").
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    localStorage.setItem(KEY, JSON.stringify(settings));
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(t);
  }, [settings]);

  const update = (patch: Partial<SupportSettings>) => setSettings((s) => ({ ...s, ...patch }));

  const addReply = () => {
    const text = newReply.trim();
    if (!text) return;
    update({ cannedReplies: [...settings.cannedReplies, text] });
    setNewReply("");
  };
  const removeReply = (index: number) => update({ cannedReplies: settings.cannedReplies.filter((_, i) => i !== index) });

  // You can manage the roster if you're the workspace Owner or an Admin.
  const me = agents.find((a) => a.email.toLowerCase() === email.toLowerCase());
  const canManage = !me || me.role === "Owner" || me.role === "Admin";

  const addMember = async () => {
    if (!member.name.trim() || !member.email.trim()) {
      setMemberError("Add a name and a work email.");
      return;
    }
    try {
      const created = await addAgent({ name: member.name.trim(), email: member.email.trim(), role: member.role });
      setAgents((a) => [...a, created]);
      setMember({ name: "", email: "", role: "Agent" });
      setMemberError("");
      setAddingMember(false);
    } catch (e) {
      setMemberError(e instanceof Error ? e.message : "Couldn't add teammate.");
    }
  };

  const removeMember = async (id: string) => {
    const prev = agents;
    setAgents((a) => a.filter((x) => x.id !== id));
    try {
      await removeAgent(id);
    } catch (e) {
      setAgents(prev);
      setMemberError(e instanceof Error ? e.message : "Couldn't remove teammate.");
    }
  };

  const STATUS: SupportSettings["status"][] = ["online", "away", "offline"];

  return (
    <div className="dx-inner sd-view sd-settings">
      <header className="sd-head" data-reveal>
        <div>
          <h1 className="sd-h1">Settings</h1>
          <p className="sd-sub">Manage your Customer Support workspace and preferences.</p>
        </div>
        <span className={`sd-saved ${saved ? "show" : ""}`}>
          <Check size={15} /> Saved
        </span>
      </header>

      {/* Profile */}
      <section className="sd-card" data-reveal>
        <header className="sd-card-head">
          <div>
            <h2>
              <User size={16} /> Profile
            </h2>
            <p>How you appear to customers and teammates.</p>
          </div>
        </header>
        <div className="sd-set-profile">
          <span className="sd-avatar lg">{initials(settings.displayName || email)}</span>
          <div className="sd-set-fields">
            <label className="sd-field">
              <span>Display name</span>
              <input value={settings.displayName} onChange={(e) => update({ displayName: e.target.value })} placeholder="Your name" />
            </label>
            <label className="sd-field">
              <span>Email</span>
              <input value={email} readOnly />
            </label>
            <label className="sd-field">
              <span>Role</span>
              <input value="Support Agent · Customer Support" readOnly />
            </label>
          </div>
        </div>
      </section>

      {/* Team members */}
      <section className="sd-card" data-reveal>
        <header className="sd-card-head">
          <div>
            <h2>
              <Users size={16} /> Team members
            </h2>
            <p>Owner and admins can add teammates to the Customer Support workspace.</p>
          </div>
          <div className="sd-head-actions">
            <span className="sd-count-pill">{agents.length}</span>
            {canManage && (
              <button
                type="button"
                className="sd-btn ghost sm"
                onClick={() => {
                  setAddingMember((v) => !v);
                  setMemberError("");
                }}
              >
                <UserPlus size={15} /> Add member
              </button>
            )}
          </div>
        </header>

        {addingMember && canManage && (
          <div className="sd-member-form">
            <input value={member.name} onChange={(e) => setMember((m) => ({ ...m, name: e.target.value }))} placeholder="Full name" autoFocus />
            <input
              type="email"
              value={member.email}
              onChange={(e) => setMember((m) => ({ ...m, email: e.target.value }))}
              placeholder="name@buildflow.io"
              onKeyDown={(e) => e.key === "Enter" && addMember()}
            />
            <div className="sd-select compact">
              <select value={member.role} onChange={(e) => setMember((m) => ({ ...m, role: e.target.value as AgentRole }))}>
                <option value="Agent">Agent</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
            <button type="button" className="sd-btn primary" onClick={addMember}>
              Add
            </button>
            <button type="button" className="sd-btn ghost icon" onClick={() => { setAddingMember(false); setMemberError(""); }}>
              <X size={16} />
            </button>
          </div>
        )}
        {memberError && <p className="sd-member-error">{memberError}</p>}

        <ul className="sd-members">
          {agents.map((a) => {
            const isMe = a.email.toLowerCase() === email.toLowerCase();
            return (
              <li className="sd-member" key={a.id}>
                <span className="sd-avatar sm">{initials(a.name)}</span>
                <div className="sd-member-id">
                  <b>
                    {a.name}
                    {isMe && <span className="sd-you">You</span>}
                  </b>
                  <span>{a.email}</span>
                </div>
                {a.status === "Invited" && <span className="sd-invited">Invited</span>}
                <span className={`sd-badge tone-${roleTone[a.role]}`}>
                  {a.role === "Owner" && <Crown size={11} />}
                  {a.role}
                </span>
                {canManage && a.role !== "Owner" && !isMe ? (
                  <button type="button" className="sd-member-remove" onClick={() => removeMember(a.id)} aria-label={`Remove ${a.name}`}>
                    <Trash2 size={15} />
                  </button>
                ) : (
                  <span className="sd-member-remove spacer" />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Availability */}
      <section className="sd-card" data-reveal>
        <header className="sd-card-head">
          <div>
            <h2>
              <CircleDot size={16} /> Availability
            </h2>
            <p>Control whether new conversations reach you.</p>
          </div>
        </header>
        <div className="sd-setting-row">
          <div className="sd-set-label">
            <b>Status</b>
            <span>Shown on your profile and the support queue.</span>
          </div>
          <div className="sd-tabrow">
            {STATUS.map((s) => (
              <button key={s} type="button" className={`sd-tab ${settings.status === s ? "on" : ""}`} onClick={() => update({ status: s })}>
                <i className={`sd-status-dot ${s}`} />
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="sd-setting-row">
          <div className="sd-set-label">
            <b>Auto-accept new conversations</b>
            <span>New General Support tickets are assigned to you automatically.</span>
          </div>
          <Toggle checked={settings.autoAccept} onChange={(v) => update({ autoAccept: v })} />
        </div>
      </section>

      {/* Notifications */}
      <section className="sd-card" data-reveal>
        <header className="sd-card-head">
          <div>
            <h2>
              <Bell size={16} /> Notifications
            </h2>
            <p>Choose what you get pinged about.</p>
          </div>
        </header>
        {(
          [
            ["notifyNewTicket", "New ticket email", "Email me when a customer opens a support conversation."],
            ["notifyDesktop", "Desktop notifications", "Show a browser notification for new replies."],
            ["notifySound", "Sound alerts", "Play a sound when a new message arrives."],
            ["dailyDigest", "Daily summary", "A morning digest of open and waiting tickets."]
          ] as const
        ).map(([field, label, desc]) => (
          <div className="sd-setting-row" key={field}>
            <div className="sd-set-label">
              <b>{label}</b>
              <span>{desc}</span>
            </div>
            <Toggle checked={settings[field]} onChange={(v) => update({ [field]: v } as Partial<SupportSettings>)} />
          </div>
        ))}
      </section>

      {/* Inbox preferences */}
      <section className="sd-card" data-reveal>
        <header className="sd-card-head">
          <div>
            <h2>
              <Inbox size={16} /> Inbox
            </h2>
            <p>Defaults for your General Support inbox.</p>
          </div>
        </header>
        <div className="sd-setting-row">
          <div className="sd-set-label">
            <b>Default sort</b>
            <span>How conversations are ordered when you open the inbox.</span>
          </div>
          <div className="sd-select compact">
            <select value={settings.defaultSort} onChange={(e) => update({ defaultSort: e.target.value as SupportSettings["defaultSort"] })}>
              <option value="recent">Most recent</option>
              <option value="priority">Priority</option>
            </select>
          </div>
        </div>
        <div className="sd-setting-row">
          <div className="sd-set-label">
            <b>Show closed conversations</b>
            <span>Include resolved tickets in the inbox list by default.</span>
          </div>
          <Toggle checked={settings.showClosed} onChange={(v) => update({ showClosed: v })} />
        </div>
        <label className="sd-field sd-set-signature">
          <span>Reply signature</span>
          <textarea rows={3} value={settings.signature} onChange={(e) => update({ signature: e.target.value })} placeholder="Added to the end of your replies" />
        </label>
      </section>

      {/* Saved replies */}
      <section className="sd-card" data-reveal>
        <header className="sd-card-head">
          <div>
            <h2>
              <MessageSquare size={16} /> Saved replies
            </h2>
            <p>Quick responses you can reuse in the inbox.</p>
          </div>
          <span className="sd-count-pill">{settings.cannedReplies.length}</span>
        </header>
        <div className="sd-replies">
          {settings.cannedReplies.map((reply, i) => (
            <div className="sd-reply" key={i}>
              <p>{reply}</p>
              <button type="button" onClick={() => removeReply(i)} aria-label="Delete reply">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {settings.cannedReplies.length === 0 && <p className="sd-empty">No saved replies yet.</p>}
          <div className="sd-reply-add">
            <input
              value={newReply}
              onChange={(e) => setNewReply(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addReply()}
              placeholder="Add a saved reply…"
            />
            <button type="button" className="sd-btn primary" onClick={addReply} disabled={!newReply.trim()}>
              <Plus size={16} /> Add
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
