/**
 * The Meetings panel once a calendar is connected (2026-09-23): THE WHOLE CALENDAR, not a preview.
 *
 * Asked for with the Schedule reference beside the panel: "When a user is connected change up what
 * the Section/Widget will look like", keeping BuildFlow's design, its animations, and everything a
 * person needs to see. So the reference's layout — Day / Week / Month over a time grid, the range
 * with its arrows and a Sync, a column beside it with New event, the month at a glance, what is up
 * next and which calendars are showing — drawn in the program's own parts: the Dashboard's
 * segmented toggle and its travelling pill, the Month page's stepper, date stamp, tiles and chips,
 * and a meeting opens in the program's right-hand drawer (MeetingDrawer.tsx).
 *
 * ONE READ PER MONTH. A read covers the month grid around the date in view (fetchRange), so moving
 * between days and weeks inside it asks the provider nothing new. "Up next" is the coming week from
 * NOW, which that read already holds unless the calendar has been paged to another month — then it
 * is a second, small read. Both are re-read every five minutes and on Sync; the countdowns are
 * worked out from the clock on a 15-second tick in between.
 *
 * READ-ONLY, by design: the connection asks Google and Microsoft for read access and nothing more,
 * so New event opens the provider's own editor in a tab rather than writing from here.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { calendarConnectUrl, calendarFeed, type CalendarMeeting, type CalendarProviderId, type CalendarStatus } from "../api";
import {
  CALENDAR_NAME,
  PROVIDER_IDS,
  PROVIDER_LABEL,
  addMonths,
  busyLabel,
  clock,
  dayKey,
  fetchRange,
  fromKey,
  hourLabel,
  initials,
  layoutDay,
  longDayLabel,
  meetingState,
  meetingsOn,
  monthGrid,
  newEventUrl,
  offsetLabel,
  overlapsWith,
  rangeLabel,
  readMeetings,
  shortClock,
  stepAnchor,
  timeRange,
  upNext,
  viewDays,
  whenLabel,
  type CalendarView,
  type PlacedMeeting
} from "./calendarModel";
import { MeetingDrawer } from "./MeetingDrawer";

/** How often the countdowns re-read the clock, and how often the calendar is read again. */
const TICK_MS = 15_000;
const REFRESH_MS = 5 * 60_000;
const WEEK_MS = 7 * 24 * 60 * 60_000;
/** An hour of the time grid, in CSS px. The grid scrolls; the panel keeps its height. */
const HOUR_PX = 52;
const VIEWS: { id: CalendarView; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" }
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const VIEW_KEY = "bf:meetings:view";
const HIDDEN_KEY = "bf:meetings:hidden";

/* The view and the hidden calendars are one person's conveniences in one browser, so every read and
   write may fail (a private window, blocked storage) and the calendar still works without them. */
function readStored<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}
function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // not remembered, which is all it costs
  }
}
const isView = (value: unknown): value is CalendarView => value === "day" || value === "week" || value === "month";
const isProviderList = (value: unknown): value is CalendarProviderId[] =>
  Array.isArray(value) && value.every((id) => id === "google" || id === "microsoft");

type Feed = { key: string; events: CalendarMeeting[]; failed: CalendarProviderId[]; fetchedAt: number };

const rangeKeyOf = (anchor: string) => {
  const { from, to } = fetchRange(anchor);
  return `${from.toISOString()}|${to.toISOString()}`;
};
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export function MeetingsCalendar({
  status,
  busy,
  onDisconnect,
  onSync
}: {
  status: CalendarStatus;
  /** A connection is being changed. */
  busy: boolean;
  onDisconnect: (provider: CalendarProviderId) => void;
  /** Read the connections again: Sync is also how a revoked calendar finds out. */
  onSync: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const today = dayKey(new Date(now));
  const [view, setViewState] = useState<CalendarView>(() => readStored(VIEW_KEY, "week", isView));
  const [anchor, setAnchor] = useState(today);
  const [hidden, setHiddenState] = useState<CalendarProviderId[]>(() => readStored(HIDDEN_KEY, [], isProviderList));
  const [feed, setFeed] = useState<Feed | null>(null);
  /** The week from now, when the month in view does not hold it. */
  const [ahead, setAhead] = useState<CalendarMeeting[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<CalendarMeeting | null>(null);
  const alive = useRef(true);
  const ticket = useRef(0);
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const setView = (next: CalendarView) => {
    setViewState(next);
    writeStored(VIEW_KEY, next);
  };
  const toggleCalendar = (provider: CalendarProviderId) => {
    setHiddenState((current) => {
      const next = current.includes(provider) ? current.filter((id) => id !== provider) : [...current, provider];
      writeStored(HIDDEN_KEY, next);
      return next;
    });
  };
  const showDay = (key: string) => {
    setView("day");
    setAnchor(key);
  };

  const load = useCallback(async () => {
    const mine = ++ticket.current;
    const key = rangeKeyOf(anchorRef.current);
    const { from, to } = fetchRange(anchorRef.current);
    const at = Date.now();
    const holdsAhead = from.getTime() <= at && to.getTime() >= at + WEEK_MS;
    setSyncing(true);
    try {
      const [main, next] = await Promise.all([
        calendarFeed({ from, to }),
        holdsAhead ? Promise.resolve(null) : calendarFeed({ from: new Date(at), to: new Date(at + WEEK_MS) })
      ]);
      // a read that a newer one has overtaken (the calendar was paged on) is dropped
      if (!alive.current || mine !== ticket.current) return;
      const failedOf = (value: unknown) =>
        Array.isArray((value as { failed?: unknown } | null)?.failed) ? ((value as { failed: unknown[] }).failed as unknown[]) : [];
      const failed = PROVIDER_IDS.filter((id) => [...failedOf(main), ...failedOf(next)].includes(id));
      setFeed({ key, events: readMeetings(main), failed, fetchedAt: Date.now() });
      setAhead(next ? readMeetings(next) : null);
      setError(null);
    } catch {
      // a calendar that cannot be reached is worth saying; it is not worth breaking the board
      if (alive.current && mine === ticket.current) setError("The calendar could not be read just now. Sync to try again.");
    } finally {
      if (alive.current && mine === ticket.current) setSyncing(false);
    }
  }, []);

  const rangeKey = rangeKeyOf(anchor);
  useEffect(() => {
    void load();
  }, [rangeKey, load]);
  useEffect(() => {
    const refresh = window.setInterval(() => void load(), REFRESH_MS);
    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(tick);
    };
  }, [load]);

  const connected = PROVIDER_IDS.filter((id) => status.providers[id].connected);
  const connectable = PROVIDER_IDS.filter((id) => !status.providers[id].connected && status.providers[id].configured);
  const loaded = feed !== null && feed.key === rangeKey;
  const everything = useMemo(() => (loaded ? feed.events : []), [loaded, feed]);
  const shown = useMemo(() => everything.filter((event) => !hidden.includes(event.provider)), [everything, hidden]);
  const soon = useMemo(
    () =>
      upNext(
        (ahead ?? everything).filter((event) => !hidden.includes(event.provider)),
        now,
        3
      ),
    [ahead, everything, hidden, now]
  );
  /** Every meeting this panel knows about, for the drawer to follow through a re-read. */
  const known = useMemo(() => [...everything, ...(ahead ?? [])], [everything, ahead]);
  const current = open ? (known.find((event) => event.id === open.id) ?? open) : null;

  const days = viewDays(view, anchor);
  const byDay = useMemo(() => {
    const map = new Map<string, ReturnType<typeof meetingsOn>>();
    for (const key of view === "month" ? monthGrid(anchor) : days) map.set(key, meetingsOn(shown, key));
    return map;
    // `days` is derived from view and anchor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, view, anchor]);

  // what the heading says under the range: how full the days in view are
  const counted = view === "month" ? monthGrid(anchor).filter((key) => key.slice(0, 7) === anchor.slice(0, 7)) : days;
  const inView = [
    ...new Map(
      counted.flatMap((key) => [...(byDay.get(key)?.allDay ?? []), ...(byDay.get(key)?.timed ?? [])]).map((event) => [event.id, event])
    ).values()
  ].filter((event) => event.myResponse !== "declined");
  const span = view === "day" ? "today" : view === "week" ? "this week" : "this month";
  const summary = !loaded
    ? "Reading your calendar…"
    : connected.length > 0 && connected.every((id) => hidden.includes(id))
      ? "Every calendar is hidden. Turn one on under Calendars."
      : inView.length === 0
        ? `No meetings ${view === "day" && anchor !== today ? "on this day" : span}`
        : `${plural(inView.length, "meeting")}${view === "month" ? "" : ` · ${busyLabel(inView)} booked`}`;
  const showsToday = view === "month" ? anchor.slice(0, 7) === today.slice(0, 7) : days.includes(today);
  const todayDate = fromKey(today);

  const failedNames = (feed?.failed ?? []).map((id) => PROVIDER_LABEL[id]);

  return (
    <div className="bfmc" data-view={view}>
      <div className="bfmc-bar">
        <div className="bfmc-lead">
          <span className="bfmc-stamp" aria-hidden="true">
            <span>{todayDate.toLocaleDateString("en-US", { month: "short" })}</span>
            <b>{todayDate.getDate()}</b>
          </span>
          <span className="bfmc-heading">
            <strong>{rangeLabel(view, anchor)}</strong>
            <em aria-live="polite">{summary}</em>
          </span>
        </div>
        <div className="bfmc-actions">
          <div className="hs-home-seg" role="group" aria-label="Calendar view">
            {VIEWS.map(({ id, label }) => (
              <button key={id} type="button" className={view === id ? "active" : ""} aria-pressed={view === id} onClick={() => setView(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="bfmc-nav">
            <button
              type="button"
              className="bfmc-icon"
              aria-label={`Previous ${view}`}
              onClick={() => setAnchor((key) => stepAnchor(view, key, -1))}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              className="bfmc-today"
              disabled={showsToday && (view !== "day" || anchor === today)}
              onClick={() => setAnchor(today)}
            >
              Today
            </button>
            <button
              type="button"
              className="bfmc-icon"
              aria-label={`Next ${view}`}
              onClick={() => setAnchor((key) => stepAnchor(view, key, 1))}
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <button
            type="button"
            className={`bfmt-link bfmc-sync${syncing ? " is-syncing" : ""}`}
            disabled={syncing}
            title={feed ? `Last synced ${clock(new Date(feed.fetchedAt).toISOString())}` : undefined}
            onClick={() => {
              onSync();
              void load();
            }}
          >
            <RefreshCw size={13} /> {syncing ? "Syncing" : "Sync"}
          </button>
        </div>
      </div>

      <div className="bfmc-body">
        {/* keyed by view, so switching comes into focus the way a section does */}
        <div className="bfmc-main" key={view}>
          {view === "month" ? (
            <MonthGrid anchor={anchor} today={today} byDay={byDay} onOpen={setOpen} onPickDay={showDay} />
          ) : (
            <TimeGrid
              days={days}
              today={today}
              now={now}
              byDay={byDay}
              ready={loaded}
              onOpen={setOpen}
              onPickDay={view === "week" ? showDay : undefined}
            />
          )}
        </div>

        <aside className="bfmc-side" aria-label="Calendar tools">
          <div className="bfmc-plan">
            <NewEvent providers={connected.map((id) => ({ id, email: status.providers[id].email }))} />
            <MiniMonth anchor={anchor} today={today} view={view} busyDays={loaded ? busyDaysOf(shown) : new Set()} onPick={setAnchor} />
          </div>
          <section className="bfmc-upnext" aria-labelledby="bfmc-upnext-title">
            <h4 className="bfmc-side-title" id="bfmc-upnext-title">
              Up next
            </h4>
            {!loaded && ahead === null ? (
              <p className="bfmt-empty">Reading your calendar…</p>
            ) : soon.length === 0 ? (
              <p className="bfmt-empty">Nothing in the next seven days.</p>
            ) : (
              <ul className="bfmc-next">
                {soon.map((event, index) => {
                  const state = meetingState(event, now);
                  const live = state === "now" || state === "soon";
                  return (
                    <li key={event.id} className={`bfmc-next-row is-${state}`}>
                      <button type="button" className="bfmc-next-open" onClick={() => setOpen(event)}>
                        <span className={index === 0 && !event.allDay ? "bfmt-pill" : "bfmc-when"}>{whenLabel(event, now)}</span>
                        <strong>{event.title}</strong>
                        <em>
                          {[event.allDay ? "All day" : timeRange(event.startsAt, event.endsAt), event.conference || event.location]
                            .filter(Boolean)
                            .join(" · ")}
                        </em>
                      </button>
                      {event.joinUrl && live && (
                        <a className="bfmt-join" href={event.joinUrl} target="_blank" rel="noreferrer" aria-label={`Join ${event.title}`}>
                          Join
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section className="bfmc-cals" aria-labelledby="bfmc-cals-title">
            <h4 className="bfmc-side-title" id="bfmc-cals-title">
              Calendars
            </h4>
            {connected.map((id) => {
              const showing = !hidden.includes(id);
              return (
                <div key={id} className="bfmc-cal">
                  <span className={`bfmc-swatch is-${id}`} aria-hidden="true" />
                  <span className="bfmc-cal-text">
                    <strong>{CALENDAR_NAME[id]}</strong>
                    <em>{status.providers[id].email || "Connected"}</em>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    className={`bfmc-switch is-${id}`}
                    aria-checked={showing}
                    aria-label={`Show ${CALENDAR_NAME[id]}`}
                    onClick={() => toggleCalendar(id)}
                  >
                    <i />
                  </button>
                </div>
              );
            })}
            <div className="bfmc-cal-links">
              {connectable.map((id) => (
                <a key={id} className="bfmt-link" href={calendarConnectUrl(id)}>
                  <Plus size={13} /> Connect {PROVIDER_LABEL[id]}
                </a>
              ))}
              {connected.map((id) => (
                <button key={id} type="button" className="bfmt-link" disabled={busy} onClick={() => onDisconnect(id)}>
                  Disconnect {PROVIDER_LABEL[id]}
                </button>
              ))}
            </div>
            {feed && (
              <p className="bfmt-note bfmc-synced">
                Synced {clock(new Date(feed.fetchedAt).toISOString())} · times in {offsetLabel(new Date(now))}
              </p>
            )}
          </section>
          {(error || failedNames.length > 0) && (
            <p className="bfmt-note is-error" role="status">
              {error ??
                `${failedNames.join(" and ")} could not be reached just now, so ${failedNames.length > 1 ? "their" : "its"} meetings are missing. Sync to try again.`}
            </p>
          )}
        </aside>
      </div>

      {current && (
        <MeetingDrawer
          event={current}
          now={now}
          account={status.providers[current.provider].email}
          overlaps={overlapsWith(current, known)}
          onOpen={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** The days with anything on them, for the mini month's dots. */
function busyDaysOf(events: CalendarMeeting[]): Set<string> {
  const days = new Set<string>();
  for (const event of events) {
    if (event.myResponse === "declined") continue;
    if (event.allDay) {
      days.add(event.startsAt.slice(0, 10));
      continue;
    }
    days.add(dayKey(new Date(event.startsAt)));
  }
  return days;
}

/* ── the time grid: a day or a week ───────────────────────────────────────── */

function TimeGrid({
  days,
  today,
  now,
  byDay,
  ready,
  onOpen,
  onPickDay
}: {
  days: string[];
  today: string;
  now: number;
  byDay: Map<string, ReturnType<typeof meetingsOn>>;
  /** The meetings are in, so the grid can scroll to the first of them. */
  ready: boolean;
  onOpen: (event: CalendarMeeting) => void;
  /** Open one day on its own; the week's day headings do this, the day view's does not. */
  onPickDay?: (key: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef("");
  const minutesNow = (now - fromKey(today).getTime()) / 60_000;
  const hasAllDay = days.some((key) => (byDay.get(key)?.allDay.length ?? 0) > 0);
  const placed = days.map((key) => layoutDay(byDay.get(key)?.timed ?? [], key));
  const earliest = Math.min(...placed.flat().map((item) => item.top), Infinity);
  const showsToday = days.includes(today);

  // Open on the part of the day that matters, once per day or week: the present hour when today is
  // in view, otherwise the first meeting, otherwise the start of a working day. Never again after
  // that, so a re-read every five minutes does not take the grid out from under a reader.
  const scrollKey = `${days[0]}|${days.length}`;
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !ready || scrolledFor.current === scrollKey) return;
    scrolledFor.current = scrollKey;
    const target = showsToday ? minutesNow - 90 : Number.isFinite(earliest) ? earliest - 30 : 7 * 60;
    scroller.scrollTop = (Math.max(0, target) / 60) * HOUR_PX;
  });

  const style = { "--bfmc-days": days.length, "--bfmc-hour": `${HOUR_PX}px` } as CSSProperties;
  return (
    <div className={`bfmc-grid${days.length === 1 ? " is-single" : ""}`} style={style}>
      <div className="bfmc-scroll" ref={scrollRef}>
        {/* the headings and the all-day row stick at the top of the scroller, so they share its
            width (and its scrollbar) with the columns under them and cannot drift out of line */}
        <div className="bfmc-top">
          <div className="bfmc-head">
            <span className="bfmc-tz" title="Times are in your time zone">
              {offsetLabel(new Date(now))}
            </span>
            {days.map((key) => {
              const date = fromKey(key);
              const count = (byDay.get(key)?.allDay.length ?? 0) + (byDay.get(key)?.timed.length ?? 0);
              const label = (
                <>
                  <em>{date.toLocaleDateString("en-US", { weekday: "short" })}</em>
                  <b>{date.getDate()}</b>
                </>
              );
              const className = `bfmc-dow${key === today ? " is-today" : ""}`;
              return onPickDay ? (
                <button
                  key={key}
                  type="button"
                  className={className}
                  aria-label={`${longDayLabel(key)}, ${plural(count, "meeting")}. Open the day`}
                  onClick={() => onPickDay(key)}
                >
                  {label}
                </button>
              ) : (
                <span key={key} className={className}>
                  {label}
                </span>
              );
            })}
          </div>
          {hasAllDay && (
            <div className="bfmc-allday">
              <span className="bfmc-allday-label">All day</span>
              {days.map((key) => (
                <div key={key} className="bfmc-allday-cell">
                  {(byDay.get(key)?.allDay ?? []).map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className={`bfmc-chip is-${event.provider}${event.myResponse === "declined" ? " is-declined" : ""}`}
                      onClick={() => onOpen(event)}
                    >
                      <i className="bfmc-dot" aria-hidden="true" />
                      <span>{event.title}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bfmc-canvas">
          <div className="bfmc-hours" aria-hidden="true">
            {Array.from({ length: 23 }, (_, index) => index + 1).map((hour) => (
              <span
                key={hour}
                className={showsToday && Math.abs(minutesNow - hour * 60) < 22 ? "is-near" : undefined}
                style={{ top: `${hour * HOUR_PX}px` }}
              >
                {hourLabel(hour)}
              </span>
            ))}
            {showsToday && (
              <span className="bfmc-now-pill" style={{ top: `${(minutesNow / 60) * HOUR_PX}px` }}>
                {clock(new Date(now).toISOString())}
              </span>
            )}
          </div>
          {days.map((key, index) => {
            const weekend = [0, 6].includes(fromKey(key).getDay());
            return (
              <div key={index} className={`bfmc-col${key === today ? " is-today" : ""}${weekend ? " is-weekend" : ""}`}>
                {placed[index].map((item) => (
                  <MeetingCard key={item.event.id} placed={item} now={now} onOpen={onOpen} />
                ))}
                {key === today && <span className="bfmc-now" style={{ top: `${(minutesNow / 60) * HOUR_PX}px` }} aria-hidden="true" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MeetingCard({ placed, now, onOpen }: { placed: PlacedMeeting; now: number; onOpen: (event: CalendarMeeting) => void }) {
  const { event } = placed;
  const state = meetingState(event, now);
  const height = Math.max(((placed.bottom - placed.top) / 60) * HOUR_PX - 3, 18);
  const where = event.conference || event.location;
  const style: CSSProperties = {
    top: `${(placed.top / 60) * HOUR_PX + 1}px`,
    height: `${height}px`,
    left: `calc(${(placed.lane / placed.lanes) * 100}% + 2px)`,
    width: `calc(${100 / placed.lanes}% - 4px)`
  };
  const classes = ["bfmc-event", `is-${event.provider}`, `is-${state}`, `is-${event.myResponse}`, height < 34 ? "is-short" : ""].filter(
    Boolean
  );
  const spoken = [
    event.title,
    timeRange(event.startsAt, event.endsAt),
    where,
    state === "now" ? "happening now" : "",
    event.myResponse === "declined" ? "declined" : ""
  ].filter(Boolean);
  return (
    <button type="button" className={classes.join(" ")} style={style} aria-label={spoken.join(", ")} onClick={() => onOpen(event)}>
      <strong>{event.title}</strong>
      <span className="bfmc-event-time">{timeRange(event.startsAt, event.endsAt)}</span>
      {height >= 54 && where && <span className="bfmc-event-where">{where}</span>}
      {height >= 84 && event.guests.length > 0 && (
        <span className="bfmt-faces" aria-hidden="true">
          {event.guests.slice(0, 3).map((guest) => (
            <i key={guest.email || guest.name}>{initials(guest.name)}</i>
          ))}
          {event.guests.length > 3 && <i className="is-more">+{event.guests.length - 3}</i>}
        </span>
      )}
    </button>
  );
}

/* ── the month ────────────────────────────────────────────────────────────── */

function MonthGrid({
  anchor,
  today,
  byDay,
  onOpen,
  onPickDay
}: {
  anchor: string;
  today: string;
  byDay: Map<string, ReturnType<typeof meetingsOn>>;
  onOpen: (event: CalendarMeeting) => void;
  onPickDay: (key: string) => void;
}) {
  const month = anchor.slice(0, 7);
  return (
    <div className="bfmc-month">
      <div className="bfmc-month-dow" aria-hidden="true">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="bfmc-month-grid">
        {monthGrid(anchor).map((key) => {
          const list = [...(byDay.get(key)?.allDay ?? []), ...(byDay.get(key)?.timed ?? [])];
          // a tile has two lines under its date: two meetings, or one and how many more there are
          const fits = list.length > 2 ? 1 : 2;
          const weekend = [0, 6].includes(fromKey(key).getDay());
          const classes = [
            "bfmc-mcell",
            key === today ? "is-today" : "",
            key.slice(0, 7) !== month ? "is-outside" : "",
            weekend ? "is-weekend" : ""
          ].filter(Boolean);
          return (
            <div key={key} className={classes.join(" ")}>
              <button
                type="button"
                className="bfmc-mday"
                aria-label={`${longDayLabel(key)}, ${plural(list.length, "meeting")}`}
                onClick={() => onPickDay(key)}
              >
                {fromKey(key).getDate()}
              </button>
              {list.slice(0, fits).map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className={`bfmc-chip is-${event.provider}${event.myResponse === "declined" ? " is-declined" : ""}`}
                  onClick={() => onOpen(event)}
                >
                  <i className="bfmc-dot" aria-hidden="true" />
                  {!event.allDay && <em>{shortClock(event.startsAt)}</em>}
                  <span>{event.title}</span>
                </button>
              ))}
              {list.length > fits && (
                <button type="button" className="bfmc-more" onClick={() => onPickDay(key)}>
                  +{list.length - fits} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── the side column ──────────────────────────────────────────────────────── */

/** New event opens the provider's own editor: this connection only reads. Two calendars, two choices. */
function NewEvent({ providers }: { providers: { id: CalendarProviderId; email: string }[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (providers.length === 0) return null;
  if (providers.length === 1) {
    const [only] = providers;
    return (
      <a
        className="bfmc-new"
        href={newEventUrl(only.id, only.email)}
        target="_blank"
        rel="noreferrer"
        title={`Opens ${CALENDAR_NAME[only.id]} in a new tab`}
      >
        <Plus size={15} /> New event
      </a>
    );
  }
  return (
    <div className="bfmc-new-wrap" ref={wrapRef}>
      <button type="button" className="bfmc-new" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)}>
        <Plus size={15} /> New event <ChevronDown size={14} className="bfmc-new-caret" />
      </button>
      {open && (
        <div className="bfmc-new-menu" role="menu" aria-label="New event in">
          {providers.map((provider) => (
            <a
              key={provider.id}
              role="menuitem"
              href={newEventUrl(provider.id, provider.email)}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
            >
              <span className={`bfmc-swatch is-${provider.id}`} aria-hidden="true" />
              <span>
                <strong>{CALENDAR_NAME[provider.id]}</strong>
                <em>{provider.email}</em>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/** The month at a glance: a dot under every day with a meeting on it; a day opens it in the calendar. */
function MiniMonth({
  anchor,
  today,
  view,
  busyDays,
  onPick
}: {
  anchor: string;
  today: string;
  view: CalendarView;
  busyDays: Set<string>;
  onPick: (key: string) => void;
}) {
  const [month, setMonth] = useState(`${anchor.slice(0, 7)}-01`);
  // it follows the calendar: page the calendar to another month and this one goes with it
  useEffect(() => setMonth(`${anchor.slice(0, 7)}-01`), [anchor]);
  const selected = new Set(view === "month" ? [] : viewDays(view, anchor));
  return (
    <section className="bfmc-mini" aria-label="Month at a glance">
      <div className="bfmc-mini-head">
        <strong>{fromKey(month).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong>
        <span className="bfmc-mini-nav">
          <button type="button" aria-label="Show the previous month" onClick={() => setMonth((key) => addMonths(key, -1))}>
            <ChevronLeft size={13} />
          </button>
          <button type="button" aria-label="Show the next month" onClick={() => setMonth((key) => addMonths(key, 1))}>
            <ChevronRight size={13} />
          </button>
        </span>
      </div>
      <div className="bfmc-mini-grid">
        {WEEKDAYS.map((day) => (
          <span key={day} className="bfmc-mini-dow" aria-hidden="true">
            {day[0]}
          </span>
        ))}
        {monthGrid(month).map((key) => {
          const classes = [
            key === today ? "is-today" : "",
            selected.has(key) ? "is-selected" : "",
            key.slice(0, 7) !== month.slice(0, 7) ? "is-outside" : "",
            busyDays.has(key) ? "has-meetings" : ""
          ].filter(Boolean);
          return (
            <button
              key={key}
              type="button"
              className={classes.join(" ") || undefined}
              aria-label={`${longDayLabel(key)}${busyDays.has(key) ? ", has meetings" : ""}`}
              aria-current={key === today ? "date" : undefined}
              onClick={() => onPick(key)}
            >
              {fromKey(key).getDate()}
            </button>
          );
        })}
      </div>
    </section>
  );
}
