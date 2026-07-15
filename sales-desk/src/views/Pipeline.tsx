import { useState, type DragEvent } from "react";
import { Building2, DollarSign, Clock } from "lucide-react";
import type { Desk } from "../SalesApp";
import type { LeadStatus } from "../api";
import { STAGES, statusTone, moneyFull, timeAgo } from "../util";

export function Pipeline({ desk }: { desk: Desk }) {
  const { data } = desk;
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<LeadStatus | null>(null);

  const onDrop = (stage: LeadStatus) => (e: DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    if (id) {
      const lead = data.leads.find((l) => l.id === id);
      if (lead && lead.status !== stage) desk.moveLead(id, stage);
    }
    setDragId(null);
    setOverStage(null);
  };

  return (
    <div className="dx-inner sd-view">
      <header className="sd-head" data-reveal>
        <div>
          <h1 className="sd-h1">Pipeline</h1>
          <p className="sd-sub">Track deals across all stages. Drag a card to move it.</p>
        </div>
      </header>

      <div className="sd-board" data-reveal-stagger>
        {STAGES.map((stage) => {
          const cards = data.leads.filter((l) => l.status === stage);
          const total = cards.reduce((s, l) => s + l.value, 0);
          return (
            <section
              key={stage}
              className={`sd-board-col ${overStage === stage ? "over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(stage);
              }}
              onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
              onDrop={onDrop(stage)}
            >
              <header className="sd-board-head">
                <span className="sd-board-title">
                  <i className={`tone-${statusTone[stage]}`} />
                  {stage}
                  <b>{cards.length}</b>
                </span>
                <span className="sd-board-total">{moneyFull(total)}</span>
              </header>

              <div className="sd-board-cards">
                {cards.map((l) => (
                  <article
                    key={l.id}
                    className={`sd-deal ${dragId === l.id ? "dragging" : ""}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", l.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(l.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => desk.go("leads", l.id)}
                  >
                    <h4>{l.name}</h4>
                    <span className="sd-deal-co">
                      <Building2 size={13} /> {l.company}
                    </span>
                    <footer>
                      <span className="sd-deal-val">
                        <DollarSign size={13} />
                        {l.value.toLocaleString()}
                      </span>
                      <span className="sd-deal-date">
                        <Clock size={12} /> {timeAgo(l.lastActivityAt)}
                      </span>
                    </footer>
                  </article>
                ))}
                {cards.length === 0 && <p className="sd-board-empty">Drop deals here</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
