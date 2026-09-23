import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Building2, CheckCheck, CircleDot, Clock } from "lucide-react";
import type { Desk } from "../SalesApp";
import type { ConversationStatus, Message } from "../api";
import { fetchMessages, sendMessage } from "../api";
import { priorityTone, initials, timeAgo } from "../util";

const STATUS_LABEL: Record<ConversationStatus, string> = { open: "Open", pending: "Waiting on customer", closed: "Closed" };

export function Conversations({ desk, onRefresh }: { desk: Desk; onRefresh: () => Promise<void> }) {
  const { data, focusId, department } = desk;
  // Only this department's queue: Support sees General Support, Sales sees inquiries.
  const deptConversations = useMemo(
    () => data.conversations.filter((c) => c.department === department),
    [data.conversations, department]
  );
  const [selected, setSelected] = useState<string | undefined>(focusId ?? deptConversations[0]?.id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  /** Set when a reply did not reach the server, so the agent is not left thinking it did. */
  const [sendError, setSendError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | ConversationStatus>("all");
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusId) setSelected(focusId);
  }, [focusId]);

  // Keep the selection inside the active department (e.g. after switching depts).
  useEffect(() => {
    if (!deptConversations.some((c) => c.id === selected)) {
      setSelected(deptConversations[0]?.id);
    }
  }, [deptConversations, selected]);

  const active = deptConversations.find((c) => c.id === selected);

  useEffect(() => {
    if (!selected) return;
    setSendError(null);
    let cancelled = false;
    fetchMessages(selected).then((m) => {
      if (!cancelled) setMessages(m);
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const title = department === "support" ? "General Support" : "Sales Inquiries";
  const subtitle =
    department === "support"
      ? "Anything customers need help with — routed to Customer Support."
      : "Sales-related questions from prospects & customers — routed to Sales.";

  const list = useMemo(
    () => deptConversations.filter((c) => (tab === "all" ? true : c.status === tab)),
    [deptConversations, tab]
  );

  const reply = async () => {
    if (!draft.trim() || !active) return;
    const body = draft.trim();
    setDraft("");
    setSendError(null);
    const optimistic: Message = { id: `local-${Date.now()}`, conversationId: active.id, author: "agent", body, createdAt: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    try {
      const saved = await sendMessage(active.id, body, "agent");
      setMessages((m) => m.map((x) => (x.id === optimistic.id ? saved : x)));
      // Only once it is actually sent: this marks the conversation replied-to.
      await desk.reply(active.id, body);
    } catch {
      // The send failed. Keeping the optimistic bubble would leave the reply sitting in the
      // thread looking delivered, which is the one thing a support console must not do -- the
      // customer got nothing. Take it back out, return the text to the composer so the work is
      // not lost, and leave the conversation unreplied.
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setDraft(body);
      setSendError("That reply didn't send — your message is back in the box. Check the connection and try again.");
    }
  };

  const setStatus = async (status: ConversationStatus) => {
    if (!active) return;
    await desk.setConversation(active.id, { status });
  };

  return (
    <div className="dx-inner sd-view">
      <header className="sd-head" data-reveal>
        <div>
          <h1 className="sd-h1">{title}</h1>
          <p className="sd-sub">{subtitle}</p>
        </div>
        <button type="button" className="sd-btn ghost" onClick={onRefresh}>
          Refresh
        </button>
      </header>

      <div className="sd-inbox" data-reveal>
        <div className="sd-inbox-list">
          <div className="sd-tabrow tight">
            {(["all", "open", "pending", "closed"] as const).map((t) => (
              <button key={t} type="button" className={`sd-tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
                {t === "all" ? "All" : STATUS_LABEL[t].split(" ")[0]}
              </button>
            ))}
          </div>
          <ul>
            {list.map((c) => (
              <li key={c.id}>
                <button type="button" className={`sd-convo ${selected === c.id ? "on" : ""}`} onClick={() => setSelected(c.id)}>
                  <span className="sd-avatar sm">{initials(c.name)}</span>
                  <div className="sd-convo-body">
                    <div className="sd-convo-top">
                      <b>{c.name}</b>
                      <time>{timeAgo(c.lastMessageAt)}</time>
                    </div>
                    <p className="sd-convo-subject">{c.subject}</p>
                    <div className="sd-convo-tags">
                      <span className={`sd-dot tone-${statusToneOf(c.status)}`} />
                      <span className="sd-convo-co">{c.company}</span>
                      <span className={`sd-prio tone-${priorityTone[c.priority]}`}>{c.priority}</span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="sd-empty">No conversations.</li>}
          </ul>
        </div>

        <div className="sd-thread-pane">
          {active ? (
            <>
              <header className="sd-thread-head">
                <div>
                  <h3>{active.subject}</h3>
                  <p>
                    <span className="sd-avatar xs">{initials(active.name)}</span>
                    {active.name} · <Building2 size={12} /> {active.company} · {active.email}
                  </p>
                </div>
                <div className="sd-thread-actions">
                  <span className={`sd-status-pill ${active.status}`}>
                    {active.status === "open" ? <CircleDot size={13} /> : active.status === "pending" ? <Clock size={13} /> : <CheckCheck size={13} />}
                    {STATUS_LABEL[active.status]}
                  </span>
                  {active.status !== "closed" ? (
                    <button type="button" className="sd-btn ghost sm" onClick={() => setStatus("closed")}>
                      Resolve
                    </button>
                  ) : (
                    <button type="button" className="sd-btn ghost sm" onClick={() => setStatus("open")}>
                      Reopen
                    </button>
                  )}
                </div>
              </header>

              <div className="sd-thread" ref={threadRef}>
                {messages.map((m) => (
                  <div key={m.id} className={`sd-msg ${m.author}`}>
                    <div className="sd-msg-bubble">{m.body}</div>
                    <time>
                      {m.author === "agent" ? "You" : active.name.split(" ")[0]} · {timeAgo(m.createdAt)}
                    </time>
                  </div>
                ))}
                {messages.length === 0 && <p className="sd-muted sd-thread-empty">No messages yet.</p>}
              </div>

              {sendError && <p className="sd-member-error">{sendError}</p>}
              <div className="sd-composer">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Reply to ${active.name.split(" ")[0]}…`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) reply();
                  }}
                />
                <button type="button" className="sd-btn primary" onClick={reply} disabled={!draft.trim()}>
                  <Send size={16} /> Send
                </button>
              </div>
            </>
          ) : (
            <div className="sd-thread-blank">Select a conversation to reply.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function statusToneOf(s: ConversationStatus): string {
  return s === "open" ? "green" : s === "pending" ? "amber" : "blue";
}
