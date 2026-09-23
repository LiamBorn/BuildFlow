/**
 * One meeting, in the program's right-hand drawer (2026-09-23) — `.pdx`, portalled to the body like
 * every other one, so it slides in with the same entrance, lists its contents in behind it, and
 * leaves with the same exit (components/ui/panelExit.tsx already watches `.pdx`).
 *
 * The reference's event card has two tabs, Detail and Participant, and a Join meeting button; this is
 * that card with everything a person checks before walking in: when and for how long, where, the
 * video link and which service it opens, who sent it, how they answered, which calendar and account
 * it came from, the notes, and — the one the reference does not have — anything else booked at the
 * same time, since a double booking is the thing most worth knowing in advance.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ExternalLink, Video, X } from "lucide-react";
import type { CalendarGuest, CalendarMeeting, CalendarResponse } from "../api";
import { useModalDialog } from "../schedule/hooks";
import {
  CALENDAR_NAME,
  GUEST_RESPONSE_LABEL,
  MY_RESPONSE_LABEL,
  addDays,
  allDaySpan,
  clock,
  dayKey,
  durationLabel,
  initials,
  longDayLabel,
  meetingState,
  timeRange,
  whenLabel
} from "./calendarModel";

type Tab = "details" | "people";
const ANSWER_ORDER: CalendarResponse[] = ["accepted", "tentative", "pending", "declined"];
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** "Wednesday, September 23 · 9:00 – 10:30 AM"; an all-day entry by its dates. */
export function meetingWhen(event: CalendarMeeting): string {
  if (event.allDay) {
    const { first, last } = allDaySpan(event);
    return first === last ? `${longDayLabel(first)} · All day` : `${longDayLabel(first)} – ${longDayLabel(last)} · All day`;
  }
  const startDay = dayKey(new Date(event.startsAt));
  const endDay = dayKey(new Date(event.endsAt));
  // a meeting that runs past midnight names both days rather than a range that reads backwards
  if (endDay !== startDay && endDay !== addDays(startDay, 1)) {
    return `${longDayLabel(startDay)}, ${clock(event.startsAt)} – ${longDayLabel(endDay)}, ${clock(event.endsAt)}`;
  }
  return `${longDayLabel(startDay)} · ${timeRange(event.startsAt, event.endsAt)}`;
}

/** Where the video link goes, as a person would read it: "meet.google.com/abc-defg-hij". */
const linkText = (url: string) => {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function MeetingDrawer({
  event,
  now,
  account,
  overlaps,
  onOpen,
  onClose
}: {
  event: CalendarMeeting;
  now: number;
  /** The mailbox this calendar belongs to. */
  account: string;
  /** Anything else booked at the same time. */
  overlaps: CalendarMeeting[];
  /** Open another meeting in place of this one (a clash). */
  onOpen: (event: CalendarMeeting) => void;
  onClose: () => void;
}) {
  const panelRef = useModalDialog<HTMLElement>(onClose);
  const [tab, setTab] = useState<Tab>("details");
  // another meeting opened in the same drawer starts on its details again
  useEffect(() => setTab("details"), [event.id]);

  const state = meetingState(event, now);
  const status =
    state === "past" ? "Ended" : state === "now" && !event.allDay ? `Happening now · until ${clock(event.endsAt)}` : whenLabel(event, now);
  const joinable = Boolean(event.joinUrl) && state !== "past";
  const counts = ANSWER_ORDER.map((answer) => [answer, event.guests.filter((guest) => guest.response === answer).length] as const).filter(
    ([, count]) => count > 0
  );

  return createPortal(
    <div
      className="project-dialog-backdrop pdx"
      role="presentation"
      onMouseDown={(mouse) => {
        if (mouse.target === mouse.currentTarget) onClose();
      }}
    >
      <section
        className="project-dialog pdx-dialog bfmd"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bfmd-title"
        aria-describedby="bfmd-when"
        ref={panelRef}
      >
        <div className="pdx-glow" aria-hidden="true">
          <span className="pdx-aurora pdx-aurora-1" />
          <span className="pdx-aurora pdx-aurora-2" />
        </div>
        <header className="project-dialog-header pdx-head">
          <div>
            <span className="pdx-eyebrow">
              <span className="pdx-dot" />
              {CALENDAR_NAME[event.provider]}
            </span>
            <h2 id="bfmd-title" className="pdx-title">
              {event.title}
            </h2>
            <p className="pdx-sub" id="bfmd-when">
              {meetingWhen(event)}
            </p>
          </div>
          <button className="pdx-close" aria-label="Close meeting" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="pdx-body bfmd-body">
          <div className="bfmd-status">
            <span className={`bfmd-state is-${state}`}>{status}</span>
            <span className={`bfmd-answer is-${event.myResponse}`}>{MY_RESPONSE_LABEL[event.myResponse]}</span>
            {!event.allDay && <span className="bfmd-length">{durationLabel(event.startsAt, event.endsAt)}</span>}
          </div>

          {overlaps.length > 0 && (
            <div className="bfmd-clash" role="note">
              <AlertTriangle size={15} aria-hidden="true" />
              <span>
                Overlaps with{" "}
                <button type="button" onClick={() => onOpen(overlaps[0])}>
                  {overlaps[0].title}
                </button>{" "}
                ({timeRange(overlaps[0].startsAt, overlaps[0].endsAt)})
                {overlaps.length > 1 ? ` and ${plural(overlaps.length - 1, "other meeting")}` : ""}.
              </span>
            </div>
          )}

          <div className="bfmd-tabs" role="tablist" aria-label="About this meeting">
            <button
              type="button"
              role="tab"
              id="bfmd-tab-details"
              aria-controls="bfmd-panel"
              aria-selected={tab === "details"}
              className={tab === "details" ? "is-active" : ""}
              onClick={() => setTab("details")}
            >
              Details
            </button>
            <button
              type="button"
              role="tab"
              id="bfmd-tab-people"
              aria-controls="bfmd-panel"
              aria-selected={tab === "people"}
              className={tab === "people" ? "is-active" : ""}
              onClick={() => setTab("people")}
            >
              Participants <span className="bfmd-count">{event.guests.length}</span>
            </button>
          </div>

          <div
            className="bfmd-panel"
            id="bfmd-panel"
            role="tabpanel"
            aria-labelledby={tab === "details" ? "bfmd-tab-details" : "bfmd-tab-people"}
            key={tab}
          >
            {tab === "details" ? (
              <>
                <dl className="bfmd-facts">
                  <div>
                    <dt>When</dt>
                    <dd>{meetingWhen(event)}</dd>
                  </div>
                  <div>
                    <dt>Where</dt>
                    <dd>{event.location || <span className="bfmd-none">No location given</span>}</dd>
                  </div>
                  <div>
                    <dt>Video</dt>
                    <dd>
                      {event.joinUrl ? (
                        <a href={event.joinUrl} target="_blank" rel="noreferrer">
                          {event.conference ? `${event.conference} · ` : ""}
                          {linkText(event.joinUrl)}
                        </a>
                      ) : (
                        <span className="bfmd-none">No video link</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Organizer</dt>
                    <dd>{event.myResponse === "organizer" ? "You" : event.organizer || <span className="bfmd-none">Not given</span>}</dd>
                  </div>
                  <div>
                    <dt>Your answer</dt>
                    <dd>{MY_RESPONSE_LABEL[event.myResponse]}</dd>
                  </div>
                  <div>
                    <dt>Calendar</dt>
                    <dd>
                      {CALENDAR_NAME[event.provider]}
                      {account ? ` · ${account}` : ""}
                    </dd>
                  </div>
                </dl>
                <div className="bfmd-notes">
                  <span className="bfmd-eyebrow">Notes</span>
                  {event.description ? <p>{event.description}</p> : <p className="bfmd-none">No notes on this meeting.</p>}
                </div>
              </>
            ) : event.guests.length === 0 ? (
              <p className="bfmd-none">Nobody else is on this meeting.</p>
            ) : (
              <>
                <p className="bfmd-tally">
                  {plural(event.guests.length, "person", "people")} invited
                  {counts.map(([answer, count]) => ` · ${count} ${GUEST_RESPONSE_LABEL[answer].toLowerCase()}`).join("")}
                </p>
                <ul className="bfmd-guests">
                  {event.guests.map((guest) => (
                    <GuestRow key={guest.email || guest.name} guest={guest} />
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="pdx-actions bfmd-actions">
            {event.webUrl && (
              <a className="pdx-cancel" href={event.webUrl} target="_blank" rel="noreferrer">
                Open in {CALENDAR_NAME[event.provider]} <ExternalLink size={14} />
              </a>
            )}
            {joinable && (
              <a className="pdx-save" href={event.joinUrl} target="_blank" rel="noreferrer">
                <Video size={16} /> Join {event.conference || "meeting"}
              </a>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}

function GuestRow({ guest }: { guest: CalendarGuest }) {
  return (
    <li className="bfmd-guest">
      <span className="bfmt-faces" aria-hidden="true">
        <i>{initials(guest.name)}</i>
      </span>
      <span className="bfmd-guest-text">
        <strong>
          {guest.name}
          {guest.organizer && <span className="bfmd-tag">Organizer</span>}
        </strong>
        {guest.email && guest.email !== guest.name && <em>{guest.email}</em>}
      </span>
      <span className={`bfmd-answer is-${guest.response}`}>{GUEST_RESPONSE_LABEL[guest.response]}</span>
    </li>
  );
}
