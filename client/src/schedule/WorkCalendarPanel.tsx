/**
 * Settings › Work calendar: the weekdays crews work and the dates they do not.
 * What is saved here is what the schedule, its critical path and its KPIs count
 * with. A year's holidays come from a generator, so 2027 is a button, not a code change.
 */
import { useState } from "react";
import { CalendarPlus, Trash2 } from "lucide-react";
import { constructionHolidays, normalizeWorkCalendar, type BootstrapPayload, type WorkCalendarSetting } from "@buildflow/shared";
import { saveWorkCalendar } from "../api";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WorkCalendarPanel({ data, reload }: { data: BootstrapPayload; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState<WorkCalendarSetting>(() => normalizeWorkCalendar(data.workCalendar));
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const thisYear = new Date().getFullYear();
  const saved = normalizeWorkCalendar(data.workCalendar);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const toggleDay = (day: number) =>
    setDraft((current) => {
      const days = current.workingDays.includes(day)
        ? current.workingDays.filter((item) => item !== day)
        : [...current.workingDays, day].sort();
      return { ...current, workingDays: days.length > 0 ? days : current.workingDays };
    });
  const addHoliday = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setDraft((current) =>
      normalizeWorkCalendar({
        ...current,
        holidays: [...current.holidays.filter((h) => h.date !== date), { date, name: name.trim() || "Holiday" }]
      })
    );
    setDate("");
    setName("");
  };
  const addYear = (year: number) =>
    setDraft((current) => {
      const have = new Set(current.holidays.map((h) => h.date));
      return normalizeWorkCalendar({
        ...current,
        holidays: [...current.holidays, ...constructionHolidays(year).filter((h) => !have.has(h.date))]
      });
    });
  const remove = (holidayDate: string) =>
    setDraft((current) => ({ ...current, holidays: current.holidays.filter((h) => h.date !== holidayDate) }));
  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const result = await saveWorkCalendar(draft);
      setDraft(result);
      await reload();
      setStatus("Saved. The schedule, the critical path and the KPIs count with this now.");
    } catch (error) {
      setStatus(`Could not save: ${error instanceof Error ? error.message : "request failed"}`);
    } finally {
      setSaving(false);
    }
  };

  const years = [...new Set(draft.holidays.map((h) => h.date.slice(0, 4)))].sort();
  return (
    <section className="settings-section wc-panel" aria-labelledby="wc-title">
      <h2 id="wc-title">Working week</h2>
      <div className="wc-days" role="group" aria-label="Weekdays crews work">
        {WEEKDAYS.map((label, day) => (
          <label key={label} className={`wc-day${draft.workingDays.includes(day) ? " is-on" : ""}`}>
            <input type="checkbox" checked={draft.workingDays.includes(day)} onChange={() => toggleDay(day)} />
            {label}
          </label>
        ))}
      </div>
      <p className="wc-hint">
        Booked days are counted against these; a job's duration on the Gantt Chart and its float are measured in these days.
      </p>

      <h2>Holidays</h2>
      {draft.holidays.length === 0 ? (
        <p className="wc-hint">No holidays yet — crews work every working weekday.</p>
      ) : (
        <ul className="wc-list">
          {draft.holidays.map((holiday) => (
            <li key={holiday.date}>
              <span className="wc-date">
                {new Date(`${holiday.date}T00:00:00`).toLocaleDateString("en-US", {
                  weekday: "short",
                  year: "numeric",
                  month: "short",
                  day: "numeric"
                })}
              </span>
              <span className="wc-name">{holiday.name}</span>
              <button type="button" className="wc-remove" aria-label={`Remove ${holiday.name}`} onClick={() => remove(holiday.date)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="wc-add">
        <input type="date" aria-label="Holiday date" value={date} onChange={(event) => setDate(event.target.value)} />
        <input
          type="text"
          aria-label="Holiday name"
          placeholder="Name (Company picnic)"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="button" className="outline-button" onClick={addHoliday} disabled={!date}>
          <CalendarPlus size={15} /> Add holiday
        </button>
      </div>
      <div className="wc-years">
        {[thisYear, thisYear + 1, thisYear + 2].map((year) => (
          <button
            type="button"
            key={year}
            className="outline-button"
            onClick={() => addYear(year)}
            disabled={
              years.includes(String(year)) && constructionHolidays(year).every((h) => draft.holidays.some((d) => d.date === h.date))
            }
          >
            Add {year} holidays
          </button>
        ))}
      </div>
      <div className="wc-actions">
        <button type="button" className="outline-button" onClick={() => setDraft(saved)} disabled={!dirty || saving}>
          Discard changes
        </button>
        <button type="button" className="primary-button" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save work calendar"}
        </button>
      </div>
      {status && (
        <p className="wc-status" role="status">
          {status}
        </p>
      )}
    </section>
  );
}
