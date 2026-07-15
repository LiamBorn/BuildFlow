import { useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutGrid,
  Users,
  Columns3,
  CheckSquare,
  MessageSquare,
  LifeBuoy,
  Settings as SettingsIcon,
  Search,
  Bell,
  LogOut,
  ExternalLink,
  Building2,
  X
} from "lucide-react";
import { BrandMark } from "./Brand";
import { Login } from "./Login";
import { useHudMotion } from "./hud-primitives";
import {
  fetchBootstrap,
  createLead,
  updateLead,
  createTask,
  updateTask,
  deleteTask,
  patchConversation,
  BUILDFLOW_URL,
  type SalesBootstrap,
  type Lead,
  type SalesTask,
  type Conversation,
  type ConversationStatus,
  type LeadStatus,
  type Priority,
  type Department
} from "./api";
import { initials } from "./util";
import { Dashboard } from "./views/Dashboard";
import { Leads } from "./views/Leads";
import { Pipeline } from "./views/Pipeline";
import { Tasks } from "./views/Tasks";
import { Conversations } from "./views/Conversations";
import { Settings } from "./views/Settings";

const AUTH_KEY = "bf-sales-desk-auth";
const DEPT_KEY = "bf-sales-desk-dept";
const EMPTY: SalesBootstrap = { leads: [], tasks: [], activities: [], conversations: [] };

export type View = "dashboard" | "leads" | "pipeline" | "tasks" | "conversations" | "settings";

// The callback + data surface every view shares.
export type Desk = {
  data: SalesBootstrap;
  live: boolean;
  department: Department;
  go: (view: View, focusId?: string) => void;
  focusId?: string;
  createLead: (input: Partial<Lead> & { name: string; email: string; company: string }) => Promise<void>;
  moveLead: (id: string, status: LeadStatus) => Promise<void>;
  addTask: (title: string, dueAt: string, leadId?: string | null) => Promise<void>;
  toggleTask: (task: SalesTask) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  reply: (conversationId: string, body: string) => Promise<void>;
  setConversation: (id: string, patch: { status?: ConversationStatus; priority?: Priority }) => Promise<void>;
};

type NavItem = { id: View; label: string; icon: typeof LayoutGrid };
const NAV: Record<Department, NavItem[]> = {
  sales: [
    { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
    { id: "leads", label: "Leads", icon: Users },
    { id: "pipeline", label: "Pipeline", icon: Columns3 },
    { id: "tasks", label: "Tasks", icon: CheckSquare },
    { id: "conversations", label: "Inquiries", icon: MessageSquare }
  ],
  support: [
    { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
    { id: "conversations", label: "Support Inbox", icon: LifeBuoy },
    { id: "tasks", label: "Tasks", icon: CheckSquare },
    { id: "settings", label: "Settings", icon: SettingsIcon }
  ]
};

export function SalesApp() {
  const [email, setEmail] = useState<string | null>(() => localStorage.getItem(AUTH_KEY));
  const [department, setDepartment] = useState<Department>(
    () => (localStorage.getItem(DEPT_KEY) as Department) || "sales"
  );
  const [data, setData] = useState<SalesBootstrap>(EMPTY);
  const [live, setLive] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [focusId, setFocusId] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useHudMotion(rootRef, `${department}:${view}`);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    fetchBootstrap().then((result) => {
      if (cancelled) return;
      setData(result.data);
      setLive(result.live);
    });
    return () => {
      cancelled = true;
    };
  }, [email]);

  const signIn = (value: string, dept: Department) => {
    localStorage.setItem(AUTH_KEY, value);
    localStorage.setItem(DEPT_KEY, dept);
    setDepartment(dept);
    setEmail(value);
  };
  const signOut = () => {
    localStorage.removeItem(AUTH_KEY);
    setEmail(null);
    setData(EMPTY);
    setView("dashboard");
  };
  const openBuildFlow = () => window.open(BUILDFLOW_URL, "_blank", "noopener");

  const refresh = async () => {
    const result = await fetchBootstrap();
    setData(result.data);
    setLive(result.live);
  };

  const go = (next: View, id?: string) => {
    setView(next);
    setFocusId(id);
    setSearchOpen(false);
    setQuery("");
    window.scrollTo({ top: 0 });
  };

  const desk: Desk = {
    data,
    live,
    department,
    go,
    focusId,
    async createLead(input) {
      try {
        const lead = await createLead(input);
        setData((d) => ({ ...d, leads: [lead, ...d.leads] }));
      } catch {
        const lead: Lead = {
          id: `local-${Date.now()}`,
          phone: "",
          teamSize: "",
          interest: "",
          status: "New",
          value: 0,
          owner: "Sales Rep",
          source: "Manual",
          notes: "",
          createdAt: new Date().toISOString(),
          lastActivityAt: null,
          ...input
        } as Lead;
        setData((d) => ({ ...d, leads: [lead, ...d.leads] }));
      }
    },
    async moveLead(id, status) {
      setData((d) => ({ ...d, leads: d.leads.map((l) => (l.id === id ? { ...l, status, lastActivityAt: new Date().toISOString() } : l)) }));
      try {
        await updateLead(id, { status });
      } catch {
        /* optimistic only */
      }
    },
    async addTask(title, dueAt, leadId) {
      try {
        const task = await createTask({ title, dueAt, leadId, department });
        setData((d) => ({ ...d, tasks: [...d.tasks, task] }));
      } catch {
        const task: SalesTask = { id: `local-${Date.now()}`, leadId: leadId ?? null, title, dueAt, done: 0, department, createdAt: new Date().toISOString() };
        setData((d) => ({ ...d, tasks: [...d.tasks, task] }));
      }
    },
    async toggleTask(task) {
      const done = task.done ? 0 : 1;
      setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, done } : t)) }));
      try {
        await updateTask(task.id, { done: Boolean(done) });
      } catch {
        /* optimistic only */
      }
    },
    async removeTask(id) {
      setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }));
      try {
        await deleteTask(id);
      } catch {
        /* optimistic only */
      }
    },
    async reply(conversationId, _body) {
      setData((d) => ({
        ...d,
        conversations: d.conversations.map((c) =>
          c.id === conversationId ? { ...c, status: "pending", lastMessageAt: new Date().toISOString() } : c
        )
      }));
    },
    async setConversation(id, patch) {
      setData((d) => ({ ...d, conversations: d.conversations.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
      try {
        await patchConversation(id, patch);
      } catch {
        /* optimistic only */
      }
    }
  };

  const nav = NAV[department];
  const deptConversations = data.conversations.filter((c) => c.department === department);
  const openConversations = deptConversations.filter((c) => c.status !== "closed").length;
  const inboxLabel = department === "support" ? "General Support" : "Sales inquiries";

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { leads: [] as Lead[], conversations: [] as Conversation[] };
    return {
      // Leads only exist for Sales; Support searches its own inbox.
      leads: department === "sales" ? data.leads.filter((l) => `${l.name} ${l.company} ${l.email}`.toLowerCase().includes(q)).slice(0, 5) : [],
      conversations: deptConversations.filter((c) => `${c.name} ${c.company} ${c.subject}`.toLowerCase().includes(q)).slice(0, 4)
    };
  }, [query, data, department, deptConversations]);

  if (!email) {
    return <Login onAuthed={signIn} initialDepartment={department} />;
  }

  return (
    <div className={`sd-shell dash-rx dept-${department}`} ref={rootRef}>
      <div className="dx-bg" aria-hidden="true">
        <span className="dx-aurora dx-aurora-1" />
        <span className="dx-aurora dx-aurora-2" />
        <span className="dx-aurora dx-aurora-3" />
      </div>
      <div className="dx-cursor" aria-hidden="true" />

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="sd-side">
        <div className="sd-brand">
          <BrandMark size={30} />
          <span>
            BuildFlow <em>{department === "support" ? "Support" : "Sales"}</em>
          </span>
        </div>

        <nav className="sd-nav">
          {nav.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={`sd-nav-item ${view === id ? "on" : ""}`} onClick={() => go(id)}>
              <Icon size={18} />
              <span>{label}</span>
              {id === "conversations" && openConversations > 0 && <b className="sd-nav-badge">{openConversations}</b>}
            </button>
          ))}
        </nav>

        <div className="sd-side-foot">
          <button type="button" className="sd-open-bf" onClick={openBuildFlow}>
            <ExternalLink size={15} />
            Open BuildFlow
          </button>
          <div className="sd-user">
            <span className="sd-avatar">{initials(email.replace(/@.*/, "").replace(/[._-]/g, " "))}</span>
            <span className="sd-user-meta">
              <b>{department === "support" ? "Support Agent" : "Sales Rep"}</b>
              <i>{email}</i>
            </span>
            <button type="button" className="sd-signout" onClick={signOut} title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────────── */}
      <div className="sd-main">
        <header className="sd-top">
          <div className="sd-search" onBlur={() => setTimeout(() => setSearchOpen(false), 120)}>
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder={department === "support" ? "Search support conversations…" : "Search leads, companies, inquiries…"}
            />
            {query && (
              <button type="button" className="sd-search-clear" onMouseDown={() => setQuery("")}>
                <X size={14} />
              </button>
            )}
            {searchOpen && query.trim() && (
              <div className="sd-search-pop">
                {searchResults.leads.length === 0 && searchResults.conversations.length === 0 && (
                  <p className="sd-search-empty">No matches</p>
                )}
                {searchResults.leads.length > 0 && (
                  <div className="sd-search-group">
                    <span className="sd-search-head">Leads</span>
                    {searchResults.leads.map((l) => (
                      <button key={l.id} type="button" className="sd-search-row" onMouseDown={() => go("leads", l.id)}>
                        <span className="sd-avatar sm">{initials(l.name)}</span>
                        <span>
                          <b>{l.name}</b>
                          <i>{l.company}</i>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.conversations.length > 0 && (
                  <div className="sd-search-group">
                    <span className="sd-search-head">{inboxLabel}</span>
                    {searchResults.conversations.map((c) => (
                      <button key={c.id} type="button" className="sd-search-row" onMouseDown={() => go("conversations", c.id)}>
                        <span className="sd-search-ic">
                          <Building2 size={15} />
                        </span>
                        <span>
                          <b>{c.subject}</b>
                          <i>{c.name} · {c.company}</i>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <span className={`sd-linkstate ${live ? "on" : "off"}`} title={live ? "Reading & writing live BuildFlow data" : "BuildFlow backend offline — showing sample data"}>
            <i />
            {live ? "Linked to BuildFlow" : "Sample data"}
          </span>
          <button type="button" className="sd-bell" title="Notifications">
            <Bell size={18} />
            {openConversations > 0 && <b />}
          </button>
        </header>

        <main className="sd-content">
          {view === "dashboard" && <Dashboard desk={desk} />}
          {view === "leads" && department === "sales" && <Leads desk={desk} />}
          {view === "pipeline" && department === "sales" && <Pipeline desk={desk} />}
          {view === "tasks" && <Tasks desk={desk} />}
          {view === "conversations" && <Conversations desk={desk} onRefresh={refresh} />}
          {view === "settings" && department === "support" && <Settings email={email} />}
        </main>
      </div>
    </div>
  );
}
