import { useState } from "react";
import { Plus, Clock, Trash2, Circle, CheckCircle2, X } from "lucide-react";
import type { Desk } from "../SalesApp";
import { dueLabel } from "../util";

type Filter = "all" | "open" | "done";

export function Tasks({ desk }: { desk: Desk }) {
  const { data, department } = desk;
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  const leadName = (id: string | null) => (id ? data.leads.find((l) => l.id === id) : undefined);
  // Only this department's to-dos.
  const deptTasks = data.tasks.filter((t) => t.department === department);
  const tasks = deptTasks.filter((t) => (filter === "open" ? !t.done : filter === "done" ? t.done : true));

  const submit = async () => {
    if (!title.trim()) return;
    const dueAt = due ? new Date(due).toISOString() : new Date(Date.now() + 86_400_000).toISOString();
    await desk.addTask(title.trim(), dueAt, null);
    setTitle("");
    setDue("");
    setAdding(false);
  };

  const counts = {
    all: deptTasks.length,
    open: deptTasks.filter((t) => !t.done).length,
    done: deptTasks.filter((t) => t.done).length
  };

  return (
    <div className="dx-inner sd-view">
      <header className="sd-head" data-reveal>
        <div>
          <h1 className="sd-h1">Tasks</h1>
          <p className="sd-sub">Manage your to-dos and follow-ups.</p>
        </div>
        <button type="button" className="sd-btn primary" onClick={() => setAdding((v) => !v)}>
          <Plus size={17} /> Add Task
        </button>
      </header>

      <div className="sd-tabrow" data-reveal>
        {(["all", "open", "done"] as Filter[]).map((f) => (
          <button key={f} type="button" className={`sd-tab ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? "All Tasks" : f === "open" ? "Open" : "Completed"}
            <b>{counts[f]}</b>
          </button>
        ))}
      </div>

      {adding && (
        <div className="sd-card sd-addtask" data-reveal>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" onKeyDown={(e) => e.key === "Enter" && submit()} />
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          <button type="button" className="sd-btn primary" onClick={submit}>
            Add
          </button>
          <button type="button" className="sd-btn ghost icon" onClick={() => setAdding(false)}>
            <X size={16} />
          </button>
        </div>
      )}

      <section className="sd-tasks" data-reveal-stagger>
        {tasks.map((t) => {
          const lead = leadName(t.leadId);
          const { text, overdue } = dueLabel(t.dueAt);
          return (
            <article key={t.id} className={`sd-card sd-taskrow ${t.done ? "done" : ""}`}>
              <button type="button" className="sd-check" onClick={() => desk.toggleTask(t)} aria-label={t.done ? "Mark open" : "Complete"}>
                {t.done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
              </button>
              <div className="sd-taskrow-body">
                <p className="sd-taskrow-title">{t.title}</p>
                <div className="sd-taskrow-meta">
                  <span className={`sd-due ${overdue && !t.done ? "over" : ""}`}>
                    <Clock size={13} /> {text}
                  </span>
                  {lead && (
                    <span className="sd-muted">
                      {lead.name} · {lead.company}
                    </span>
                  )}
                </div>
              </div>
              <button type="button" className="sd-trash" onClick={() => desk.removeTask(t.id)} aria-label="Delete task">
                <Trash2 size={16} />
              </button>
            </article>
          );
        })}
        {tasks.length === 0 && <p className="sd-empty sd-card">No tasks here.</p>}
      </section>
    </div>
  );
}
