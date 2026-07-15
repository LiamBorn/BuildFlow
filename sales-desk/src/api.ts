// The Sales & Support Desk is a separate site but stays LINKED to BuildFlow: it
// reads & writes live sales / support data on the BuildFlow backend. Vite proxies
// /api → :4300, so these are same-origin calls in dev.

export type Department = "sales" | "support";

export type LeadStatus = "New" | "Contacted" | "Qualified" | "Proposal" | "Won" | "Lost";

export type Lead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  teamSize: string;
  interest: string;
  status: LeadStatus;
  value: number;
  owner: string;
  source: string;
  notes: string;
  createdAt: string;
  lastActivityAt: string | null;
};

export type SalesTask = {
  id: string;
  leadId: string | null;
  title: string;
  dueAt: string;
  done: number;
  department: Department;
  createdAt: string;
};

export type Activity = {
  id: string;
  leadId: string;
  type: "note" | "call" | "email" | "meeting" | "stage";
  summary: string;
  createdAt: string;
};

export type ConversationStatus = "open" | "pending" | "closed";
export type Priority = "Low" | "Normal" | "High" | "Urgent";

export type Conversation = {
  id: string;
  name: string;
  email: string;
  company: string;
  subject: string;
  status: ConversationStatus;
  priority: Priority;
  department: Department;
  createdAt: string;
  lastMessageAt: string;
};

export type Message = {
  id: string;
  conversationId: string;
  author: "customer" | "agent";
  body: string;
  createdAt: string;
};

export type SalesBootstrap = {
  leads: Lead[];
  tasks: SalesTask[];
  activities: Activity[];
  conversations: Conversation[];
};

export type AgentRole = "Owner" | "Admin" | "Agent";
export type SupportAgent = {
  id: string;
  name: string;
  email: string;
  role: AgentRole;
  status: "Active" | "Invited";
  createdAt: string;
};

// Where the main BuildFlow HUD is served in this dev environment.
export const BUILDFLOW_URL = "http://localhost:5301";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function fetchBootstrap(): Promise<{ data: SalesBootstrap; live: boolean }> {
  try {
    const data = await json<SalesBootstrap>(await fetch("/api/sales/bootstrap"));
    return { data, live: true };
  } catch {
    return { data: SAMPLE, live: false };
  }
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  try {
    return await json<Message[]>(await fetch(`/api/support/conversations/${conversationId}/messages`));
  } catch {
    return SAMPLE_MESSAGES[conversationId] ?? [];
  }
}

export async function createLead(input: Partial<Lead> & { name: string; email: string; company: string }): Promise<Lead> {
  return json<Lead>(
    await fetch("/api/sales/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function updateLead(id: string, patch: Partial<Lead>): Promise<Lead> {
  return json<Lead>(
    await fetch(`/api/sales/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    })
  );
}

export async function createTask(input: { title: string; dueAt: string; leadId?: string | null; department?: Department }): Promise<SalesTask> {
  return json<SalesTask>(
    await fetch("/api/sales/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function updateTask(id: string, patch: { done?: boolean; title?: string; dueAt?: string }): Promise<SalesTask> {
  return json<SalesTask>(
    await fetch(`/api/sales/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    })
  );
}

export async function deleteTask(id: string): Promise<void> {
  await fetch(`/api/sales/tasks/${id}`, { method: "DELETE" });
}

export async function sendMessage(conversationId: string, body: string, author: "agent" | "customer" = "agent"): Promise<Message> {
  return json<Message>(
    await fetch(`/api/support/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author, body })
    })
  );
}

export async function patchConversation(id: string, patch: { status?: ConversationStatus; priority?: Priority }): Promise<Conversation> {
  return json<Conversation>(
    await fetch(`/api/support/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    })
  );
}

// Open a brand-new support thread (used by the customer-side chat simulator).
export async function openConversation(input: {
  name: string;
  email: string;
  company?: string;
  subject: string;
  body: string;
  priority?: Priority;
}): Promise<{ conversation: Conversation; message: Message }> {
  return json<{ conversation: Conversation; message: Message }>(
    await fetch("/api/support/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

// ── Customer Support team roster ────────────────────────────────────────────
export async function fetchAgents(): Promise<SupportAgent[]> {
  try {
    return await json<SupportAgent[]>(await fetch("/api/support/agents"));
  } catch {
    return SAMPLE_AGENTS;
  }
}

export async function addAgent(input: { name: string; email: string; role?: AgentRole }): Promise<SupportAgent> {
  const res = await fetch("/api/support/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "Couldn't add teammate.");
  }
  return (await res.json()) as SupportAgent;
}

export async function removeAgent(id: string): Promise<void> {
  const res = await fetch(`/api/support/agents/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "Couldn't remove teammate.");
  }
}

// ── Offline sample data (mirrors a fresh backend seed) so the console always
//    renders even if BuildFlow's backend isn't running. ──────────────────────
const now = Date.now();
const DAY = 86_400_000;
const ago = (d: number) => new Date(now - d * DAY).toISOString();
const ahead = (d: number) => new Date(now + d * DAY).toISOString();

const SAMPLE: SalesBootstrap = {
  leads: [
    { id: "lead-diego", name: "Diego Alvarez", email: "diego@summitridge.build", phone: "+1 415 555 0142", company: "Summit Ridge Builders", teamSize: "25–50", interest: "Crew Scheduling", status: "New", value: 12000, owner: "Sales Rep", source: "Website", notes: "", createdAt: ago(1), lastActivityAt: null },
    { id: "lead-yuki", name: "Yuki Tanaka", email: "yuki@paccoastconcrete.com", phone: "+1 503 555 0100", company: "Pacific Coast Concrete", teamSize: "50–100", interest: "Schedule AI", status: "New", value: 35000, owner: "Sales Rep", source: "Referral", notes: "", createdAt: ago(2), lastActivityAt: null },
    { id: "lead-marcus", name: "Marcus Holloway", email: "marcus@bluepeaksite.com", phone: "+1 312 555 0177", company: "Bluepeak Site Services", teamSize: "10–25", interest: "Equipment Tracking", status: "Contacted", value: 22500, owner: "Sales Rep", source: "Outbound", notes: "", createdAt: ago(9), lastActivityAt: ago(3) },
    { id: "lead-rachel", name: "Rachel Mendes", email: "rachel@foundrysteel.com", phone: "+1 617 555 0155", company: "Foundry Steelworks", teamSize: "100–250", interest: "Materials Readiness", status: "Contacted", value: 64000, owner: "Priya Nair", source: "Trade show", notes: "", createdAt: ago(12), lastActivityAt: ago(5) },
    { id: "lead-sarah", name: "Sarah Chen", email: "sarah.chen@northwindmech.com", phone: "+1 415 555 0142", company: "Northwind Mechanical", teamSize: "50–100", interest: "Production Reports", status: "Qualified", value: 48000, owner: "Sales Rep", source: "Outbound", notes: "", createdAt: ago(15), lastActivityAt: ago(2) },
    { id: "lead-priya", name: "Priya Raman", email: "priya.raman@helixinfra.com", phone: "+1 646 555 0193", company: "Helix Infrastructure", teamSize: "250+", interest: "Enterprise", status: "Proposal", value: 96000, owner: "Priya Nair", source: "Website", notes: "", createdAt: ago(24), lastActivityAt: ago(1) },
    { id: "lead-anna", name: "Anna Kowalski", email: "anna@tidewatercp.com", phone: "+1 206 555 0128", company: "Tidewater Capital Projects", teamSize: "250+", interest: "Enterprise", status: "Won", value: 150000, owner: "Sales Rep", source: "Referral", notes: "", createdAt: ago(40), lastActivityAt: ago(6) },
    { id: "lead-tom", name: "Tom Becker", email: "tom@cedarvalleygc.com", phone: "+1 720 555 0119", company: "Cedar Valley GC", teamSize: "10–25", interest: "Crew Scheduling", status: "Lost", value: 18000, owner: "Priya Nair", source: "Website", notes: "", createdAt: ago(34), lastActivityAt: ago(20) }
  ],
  tasks: [
    { id: "stask-1", leadId: "lead-yuki", title: "Send personalised intro to Yuki", dueAt: ahead(1), done: 0, department: "sales", createdAt: ago(2) },
    { id: "stask-2", leadId: "lead-diego", title: "Initial discovery call with Diego", dueAt: ahead(2), done: 0, department: "sales", createdAt: ago(1) },
    { id: "stask-3", leadId: "lead-sarah", title: "Send tailored ROI deck", dueAt: ahead(3), done: 0, department: "sales", createdAt: ago(2) },
    { id: "stask-4", leadId: "lead-marcus", title: "Confirm demo time with Marcus", dueAt: ahead(0), done: 0, department: "sales", createdAt: ago(3) },
    { id: "stask-5", leadId: "lead-priya", title: "Follow up on legal review", dueAt: ahead(4), done: 0, department: "sales", createdAt: ago(1) },
    { id: "stask-6", leadId: "lead-rachel", title: "Schedule pricing review", dueAt: ahead(5), done: 0, department: "sales", createdAt: ago(2) },
    { id: "stask-7", leadId: "lead-anna", title: "Kick off onboarding with Tidewater", dueAt: ago(1), done: 1, department: "sales", createdAt: ago(6) },
    { id: "stask-s1", leadId: null, title: "Reply to Sarah — mobile sync outage", dueAt: ahead(0), done: 0, department: "support", createdAt: ago(0.04) },
    { id: "stask-s2", leadId: null, title: "Send Leah the PDF export steps", dueAt: ahead(1), done: 0, department: "support", createdAt: ago(1) },
    { id: "stask-s3", leadId: null, title: "Write help-doc: importing an existing schedule", dueAt: ahead(2), done: 0, department: "support", createdAt: ago(0.25) },
    { id: "stask-s4", leadId: null, title: "Close out resolved Gantt feature-request thread", dueAt: ago(1), done: 1, department: "support", createdAt: ago(4) }
  ],
  activities: [
    { id: "sact-1", leadId: "lead-priya", type: "note", summary: "Note: Stakeholder map — 3 decision makers identified", createdAt: ago(0.08) },
    { id: "sact-2", leadId: "lead-priya", type: "meeting", summary: "Meeting: Proposal review with procurement", createdAt: ago(1) },
    { id: "sact-3", leadId: "lead-sarah", type: "call", summary: "Call: Discovery — mapped current scheduling pains", createdAt: ago(2) },
    { id: "sact-4", leadId: "lead-marcus", type: "email", summary: "Email: Sent demo recording + follow-up questions", createdAt: ago(3) },
    { id: "sact-5", leadId: "lead-rachel", type: "stage", summary: "Stage change: New → Contacted", createdAt: ago(5) },
    { id: "sact-6", leadId: "lead-anna", type: "note", summary: "Note: Contract signed 🎉 handoff to onboarding", createdAt: ago(6) }
  ],
  conversations: [
    // General Support (Customer Support department)
    { id: "conv-sarah", name: "Sarah Chen", email: "sarah.chen@northwindmech.com", company: "Northwind Mechanical", subject: "Crew schedule won't sync to the mobile app", status: "open", priority: "High", department: "support", createdAt: ago(0.2), lastMessageAt: ago(0.04) },
    { id: "conv-leah", name: "Leah Moreno", email: "leah@foundrysteel.com", company: "Foundry Steelworks", subject: "Export weekly production report to PDF", status: "open", priority: "Normal", department: "support", createdAt: ago(1), lastMessageAt: ago(1) },
    { id: "conv-priya", name: "Priya Raman", email: "priya.raman@helixinfra.com", company: "Helix Infrastructure", subject: "Onboarding: importing our existing schedule", status: "open", priority: "High", department: "support", createdAt: ago(1.2), lastMessageAt: ago(0.3) },
    { id: "conv-james", name: "James Park", email: "james@paccoastconcrete.com", company: "Pacific Coast Concrete", subject: "Feature request: Gantt dependencies", status: "closed", priority: "Low", department: "support", createdAt: ago(6), lastMessageAt: ago(4) },
    // Sales inquiries (Sales department)
    { id: "conv-diego", name: "Diego Alvarez", email: "diego@summitridge.build", company: "Summit Ridge Builders", subject: "Question about per-seat pricing", status: "pending", priority: "Normal", department: "sales", createdAt: ago(2), lastMessageAt: ago(0.8) },
    { id: "conv-omar", name: "Omar Haddad", email: "omar@granitepeakgc.com", company: "Granite Peak GC", subject: "Pricing for a 40-crew rollout", status: "open", priority: "High", department: "sales", createdAt: ago(0.25), lastMessageAt: ago(0.25) },
    { id: "conv-nina", name: "Nina Alvarez", email: "nina@harborlinebuild.com", company: "Harborline Build", subject: "Interested in the Enterprise plan — can we get a demo?", status: "open", priority: "Normal", department: "sales", createdAt: ago(1), lastMessageAt: ago(0.8) }
  ]
};

const SAMPLE_MESSAGES: Record<string, Message[]> = {
  "conv-sarah": [
    { id: "conv-sarah-m1", conversationId: "conv-sarah", author: "customer", body: "Hi — my foremen aren't seeing today's assignments on their phones even though the web schedule looks right. Started this morning.", createdAt: ago(0.2) },
    { id: "conv-sarah-m2", conversationId: "conv-sarah", author: "agent", body: "Thanks Sarah — sorry about that. Can you confirm whether they pulled to refresh, and which crew is affected? I'll check the sync logs on our side now.", createdAt: ago(0.16) },
    { id: "conv-sarah-m3", conversationId: "conv-sarah", author: "customer", body: "It's the Concrete crew. They pulled to refresh, still nothing.", createdAt: ago(0.04) }
  ]
};

const SAMPLE_AGENTS: SupportAgent[] = [
  { id: "agent-owner", name: "Jordan Lee", email: "support@buildflow.io", role: "Owner", status: "Active", createdAt: ago(120) },
  { id: "agent-priya", name: "Priya Nair", email: "priya.nair@buildflow.io", role: "Admin", status: "Active", createdAt: ago(80) },
  { id: "agent-sam", name: "Sam Rivera", email: "sam.rivera@buildflow.io", role: "Agent", status: "Active", createdAt: ago(40) },
  { id: "agent-alex", name: "Alex Kim", email: "alex.kim@buildflow.io", role: "Agent", status: "Invited", createdAt: ago(3) }
];
