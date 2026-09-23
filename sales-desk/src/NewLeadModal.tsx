import { useState, type FormEvent } from "react";
import { X, UserPlus } from "lucide-react";
import type { Lead, LeadStatus } from "./api";

const STATUSES: LeadStatus[] = ["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"];
const INTERESTS = ["Crew Scheduling", "Schedule AI", "Equipment Tracking", "Materials Readiness", "Production Reports", "Enterprise"];

export function NewLeadModal({
  onClose,
  onCreate
}: {
  onClose: () => void;
  onCreate: (input: Partial<Lead> & { name: string; email: string; company: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({ name: "", email: "", company: "", value: "", interest: INTERESTS[0], status: "New" as LeadStatus });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.company.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        name: form.name.trim(),
        email: form.email.trim(),
        company: form.company.trim(),
        interest: form.interest,
        status: form.status,
        value: Number(form.value) || 0,
        owner: "Sales Rep",
        source: "Manual"
      });
    } catch {
      // Stay open with everything still typed in, rather than closing on a lead that was lost.
      setBusy(false);
      setError("That lead didn't save. Your details are still here — check the connection and try again.");
      return;
    }
    setBusy(false);
    onClose();
  };

  return (
    <div className="sd-modal-backdrop" onClick={onClose}>
      <form className="sd-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="sd-modal-head">
          <span className="sd-modal-ic">
            <UserPlus size={18} />
          </span>
          <div>
            <h3>New lead</h3>
            <p>Add a prospect to your pipeline.</p>
          </div>
          <button type="button" className="sd-modal-x" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="sd-modal-body">
          <label className="sd-field">
            <span>Contact name</span>
            <input value={form.name} onChange={set("name")} placeholder="Jane Foreman" autoFocus />
          </label>
          <label className="sd-field">
            <span>Work email</span>
            <input type="email" value={form.email} onChange={set("email")} placeholder="jane@company.com" />
          </label>
          <label className="sd-field">
            <span>Company</span>
            <input value={form.company} onChange={set("company")} placeholder="Company Inc." />
          </label>
          <div className="sd-field-row">
            <label className="sd-field">
              <span>Deal value ($)</span>
              <input inputMode="numeric" value={form.value} onChange={set("value")} placeholder="25000" />
            </label>
            <label className="sd-field">
              <span>Stage</span>
              <select value={form.status} onChange={set("status")}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="sd-field">
            <span>Interested in</span>
            <select value={form.interest} onChange={set("interest")}>
              {INTERESTS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="sd-member-error">{error}</p>}
        <footer className="sd-modal-foot">
          <button type="button" className="sd-btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="sd-btn primary" disabled={busy}>
            {busy ? "Adding…" : "Add lead"}
          </button>
        </footer>
      </form>
    </div>
  );
}
