/**
 * "Export" on every schedule page: the same small menu — a CSV of what the page
 * shows, a printable week sheet per crew, and the calendar-feed links a foreman
 * subscribes a phone to.
 */
import { useEffect, useRef, useState } from "react";
import { Link2, CalendarClock, ChevronDown, Copy, Download, Printer, X } from "lucide-react";
import { fetchCalendarFeeds } from "../api";
import { useModalDialog } from "./hooks";
import { downloadCsv, printHtml, scheduleExportRows, toCsv, weekSheetHtml, type ExportScope } from "./export";

export function ScheduleExportMenu({
  scope,
  filename,
  weekDays,
  sheetTitle = "Crew week sheets",
  buttonClassName = "export-button",
  disabled = false,
  onNotice
}: {
  scope: ExportScope;
  /** The CSV's file name, without extension. */
  filename: string;
  /** The week the printed sheets cover; no sheets without it. */
  weekDays?: string[];
  sheetTitle?: string;
  buttonClassName?: string;
  disabled?: boolean;
  onNotice?: (text: string, options?: { error?: boolean }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [feeds, setFeeds] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const csv = () => {
    const rows = scheduleExportRows(scope);
    // the writer says whether the browser took it; claiming a file that was never written helps nobody
    const written = downloadCsv(filename, toCsv(rows));
    onNotice?.(
      written
        ? `Exported ${rows.length} ${rows.length === 1 ? "row" : "rows"} to ${filename}.csv`
        : "This browser would not save the file. Try the print sheets, or copy the link and open it in another browser.",
      written ? undefined : { error: true }
    );
    setOpen(false);
  };
  const sheets = () => {
    if (!weekDays) return;
    const printing = printHtml(
      weekSheetHtml({
        title: sheetTitle,
        weekDays,
        crews: scope.crews,
        assignments: scope.assignments,
        jobs: scope.jobs,
        projects: scope.projects
      })
    );
    onNotice?.(
      printing
        ? `Printing ${scope.crews.length} crew ${scope.crews.length === 1 ? "sheet" : "sheets"} — choose "Save as PDF" to keep them`
        : "This browser would not open the print view. Try the CSV instead.",
      printing ? undefined : { error: true }
    );
    setOpen(false);
  };

  // the address bar already says this page, this week and these filters; this puts it on the clipboard
  const copyLink = async () => {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(window.location.href);
      onNotice?.("Link copied — it opens this view on this week with these filters.");
    } catch {
      onNotice?.("Could not copy the link — copy the address bar instead.");
    }
  };

  return (
    <div className="sched-export" ref={root}>
      <button
        type="button"
        className={buttonClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <Download size={16} /> Export <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="sched-export-menu" role="menu" aria-label="Export">
          <button type="button" role="menuitem" onClick={csv}>
            <Download size={15} /> Download CSV
            <em>{EXPORT_HINT}</em>
          </button>
          <button type="button" role="menuitem" onClick={() => void copyLink()}>
            <Link2 size={15} /> Copy link to this view
            <em>This page, this week, these filters</em>
          </button>
          {weekDays && (
            <button type="button" role="menuitem" onClick={sheets} disabled={scope.crews.length === 0}>
              <Printer size={15} /> Print week sheets
              <em>One page per crew — save as PDF</em>
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setFeeds(true);
            }}
          >
            <CalendarClock size={15} /> Calendar feeds…
            <em>Subscribe a phone to a crew</em>
          </button>
        </div>
      )}
      {feeds && <CalendarFeedsDialog onClose={() => setFeeds(false)} onNotice={onNotice} />}
    </div>
  );
}

const EXPORT_HINT = "The same columns on every page";

function CalendarFeedsDialog({ onClose, onNotice }: { onClose: () => void; onNotice?: (text: string) => void }) {
  const [crews, setCrews] = useState<Array<{ id: string; name: string; url: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panel = useModalDialog<HTMLElement>(onClose);
  useEffect(() => {
    let live = true;
    fetchCalendarFeeds()
      .then((result) => {
        if (live) setCrews(result.crews);
      })
      .catch((problem: unknown) => {
        if (live) setError(problem instanceof Error ? problem.message : "Could not load the feed links");
      });
    return () => {
      live = false;
    };
  }, []);
  const copy = async (url: string, name: string) => {
    try {
      await navigator.clipboard.writeText(url);
      onNotice?.(`Copied the calendar link for ${name}`);
    } catch {
      onNotice?.("Could not copy — select the link and copy it by hand");
    }
  };
  return (
    <div className="schedule-dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="schedule-dialog sched-feeds"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sched-feeds-title"
        ref={panel}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2 id="sched-feeds-title">Calendar feeds</h2>
            <p>Each crew has a link a phone's calendar can subscribe to. Bookings show up as events and refresh about every hour.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close calendar feeds" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {error && <p className="form-error">{error}</p>}
        {!crews && !error && <p className="helper-text">Loading…</p>}
        {crews && crews.length === 0 && <p className="helper-text">Add a crew first.</p>}
        {crews && crews.length > 0 && (
          <ul className="sched-feed-list">
            {crews.map((crew) => (
              <li key={crew.id} className="sched-feed-row">
                <div>
                  <strong>{crew.name}</strong>
                  <code className="sched-feed-url">{crew.url}</code>
                </div>
                <button type="button" className="outline-button" onClick={() => void copy(crew.url, crew.name)}>
                  <Copy size={14} /> Copy link
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="helper-text">
          iPhone: Settings › Calendar › Accounts › Add Subscribed Calendar. Google Calendar: Other calendars › From URL. Anyone with a link
          can read that crew's bookings.
        </p>
      </section>
    </div>
  );
}
