/**
 * The Dashboard's Meetings panel.
 *
 * Built to the monday.com reference the user pointed at: the pitch and the two connect
 * buttons on the left, a preview of what a connected panel looks like on the right, and
 * "Not connected" beside the heading. Once a calendar IS connected the same panel becomes
 * the live list — the next meeting with a countdown that ticks, then the rest of today and
 * tomorrow.
 *
 * WHAT IT NEEDS TO GO LIVE. Google Calendar and Microsoft Graph both require an OAuth app
 * registered in your own developer console, because a client secret can only be issued to
 * the account that owns the app. Four environment variables, all of which sign-in already
 * uses: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, MICROSOFT_CLIENT_ID,
 * MICROSOFT_CLIENT_SECRET. server/src/calendar.ts has the console steps. Until they are
 * set, `configured` comes back false and the button says the provider is unavailable
 * instead of starting a flow that cannot finish.
 *
 * THE COUNTDOWN IS COMPUTED, NOT STORED. The server hands over start and end instants; the
 * "In 5 min." pill is derived from them against the clock on a 15-second tick, so it stays
 * true without re-fetching. Events are re-fetched every five minutes, which is what
 * actually costs a provider call.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, ExternalLink, RefreshCw } from "lucide-react";
import {
  calendarConnectUrl,
  calendarFeed,
  calendarStatus,
  disconnectCalendar,
  type CalendarMeeting,
  type CalendarProviderId,
  type CalendarStatus
} from "./api";

const PROVIDER_LABEL: Record<CalendarProviderId, string> = { google: "Google", microsoft: "Outlook" };
const PROVIDER_IDS = Object.keys(PROVIDER_LABEL) as CalendarProviderId[];
const NOT_CONNECTED: CalendarStatus = {
  providers: {
    google: { configured: false, connected: false, email: "" },
    microsoft: { configured: false, connected: false, email: "" }
  }
};

/**
 * A status this panel can render, whatever came back.
 *
 * ONE PANEL MUST NOT TAKE THE DASHBOARD DOWN. The first version read
 * `Object.entries(status.providers)` straight off the response, and a reply of another shape
 * — which is what every test's blanket fetch mock returns, and what a proxy error page would
 * be in production — threw `Cannot convert undefined or null to object` inside the board and
 * blanked the whole page. Anything unrecognisable now reads as "not connected", which is
 * both true and harmless.
 */
function readStatus(value: unknown): CalendarStatus {
  const providers = (value as CalendarStatus | undefined)?.providers;
  if (!providers || typeof providers !== "object") return NOT_CONNECTED;
  return {
    providers: Object.fromEntries(
      PROVIDER_IDS.map((id) => {
        const entry = (providers as Record<string, unknown>)[id] as Partial<CalendarStatus["providers"][CalendarProviderId]> | undefined;
        return [
          id,
          {
            configured: entry?.configured === true,
            connected: entry?.connected === true,
            email: typeof entry?.email === "string" ? entry.email : ""
          }
        ];
      })
    ) as CalendarStatus["providers"]
  };
}

/** Likewise for the feed: a reply that is not a list of meetings is no meetings. */
function readEvents(value: unknown): CalendarMeeting[] {
  const events = (value as { events?: unknown } | undefined)?.events;
  if (!Array.isArray(events)) return [];
  return events.filter(
    (event): event is CalendarMeeting =>
      Boolean(event) && typeof (event as CalendarMeeting).id === "string" && typeof (event as CalendarMeeting).startsAt === "string"
  );
}
/** How often the pill re-reads the clock, and how often the events are re-fetched. */
const TICK_MS = 15_000;
const REFRESH_MS = 5 * 60_000;

/** "In 5 min.", "Now", "In 2 h 10 min.", "9:00 AM" — what the pill says about one meeting. */
export function countdownLabel(startsAt: string, endsAt: string, now: number): string {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return "";
  if (now >= end) return "Ended";
  if (now >= start) return "Now";
  const minutes = Math.round((start - now) / 60_000);
  if (minutes < 1) return "Now";
  if (minutes < 60) return `In ${minutes} min.`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 8) return rest ? `In ${hours} h ${rest} min.` : `In ${hours} h`;
  // beyond that a countdown stops being useful and the clock time is what you want
  return new Date(start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "Today", "Tomorrow", or the weekday — the group a meeting belongs to. */
export function dayLabel(startsAt: string, now: number): string {
  const start = new Date(startsAt);
  const today = new Date(now);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(start, today)) return "Today";
  const tomorrow = new Date(now + 24 * 60 * 60 * 1000);
  if (sameDay(start, tomorrow)) return "Tomorrow";
  return start.toLocaleDateString("en-US", { weekday: "long" });
}

const timeRange = (startsAt: string, endsAt: string) => {
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${new Date(startsAt).toLocaleTimeString("en-US", opts)} – ${new Date(endsAt).toLocaleTimeString("en-US", opts)}`;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

/** The mock on the right of the not-connected state: what a connected panel looks like. */
function MeetingsPreview() {
  return (
    <div className="bfmt-preview" aria-hidden="true">
      <span className="bfmt-preview-head">
        <CalendarClock size={13} />
        <i />
      </span>
      <span className="bfmt-preview-next">
        <span className="bfmt-preview-pill">In 5 min.</span>
        <span className="bfmt-preview-faces">
          <i />
          <i />
          <i />
        </span>
        <span className="bfmt-preview-prep">Prep me</span>
      </span>
      <span className="bfmt-preview-row">
        <b>5:00 – 6:00 PM</b>
        <i />
      </span>
      <span className="bfmt-preview-row">
        <b>Tomorrow</b>
        <i />
      </span>
    </div>
  );
}

export function MeetingsPanel() {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [events, setEvents] = useState<CalendarMeeting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const next = readStatus(await calendarStatus());
      if (!alive.current) return;
      setStatus(next);
      const connected = PROVIDER_IDS.some((id) => next.providers[id].connected);
      if (!connected) {
        setEvents(null);
        return;
      }
      const raw = await calendarFeed();
      if (!alive.current) return;
      setEvents(readEvents(raw));
      const failed = Array.isArray(raw?.failed) ? raw.failed.filter((id) => PROVIDER_IDS.includes(id)) : [];
      setError(failed.length > 0 ? `Could not reach ${failed.map((id) => PROVIDER_LABEL[id]).join(" and ")}.` : null);
    } catch {
      // A calendar that cannot be reached is worth saying; it is not worth breaking the board.
      if (alive.current) setError("Calendar is unavailable right now.");
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => void load(), REFRESH_MS);
    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(tick);
    };
  }, [load]);

  const connectedProviders = useMemo(
    () =>
      status ? PROVIDER_IDS.map((id) => [id, status.providers[id]] as const).filter(([, entry]) => entry.connected) : [],
    [status]
  );
  /** Ended meetings drop off on their own, so the panel is never showing the past. */
  const upcoming = useMemo(() => (events ?? []).filter((event) => new Date(event.endsAt).getTime() > now), [events, now]);

  const disconnect = async (provider: CalendarProviderId) => {
    setBusy(true);
    try {
      await disconnectCalendar(provider);
      await load();
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const isConnected = connectedProviders.length > 0;

  return (
    <div className="bfmt">
      <span className="bfmt-state">
        {isConnected ? connectedProviders.map(([, entry]) => entry.email || "Connected").join(" · ") : "Not connected"}
      </span>

      {isConnected ? (
        <>
          <div className="bfmt-list">
            {upcoming.length === 0 ? (
              <p className="bfmt-empty">Nothing else on the calendar today or tomorrow.</p>
            ) : (
              upcoming.slice(0, 5).map((event, index) => (
                <div key={event.id} className={`bfmt-row${index === 0 ? " is-next" : ""}`}>
                  <span className="bfmt-when">
                    {index === 0 && !event.allDay ? (
                      <span className="bfmt-pill">{countdownLabel(event.startsAt, event.endsAt, now)}</span>
                    ) : (
                      <span className="bfmt-day">{event.allDay ? dayLabel(event.startsAt, now) : timeRange(event.startsAt, event.endsAt)}</span>
                    )}
                  </span>
                  <span className="bfmt-what">
                    <strong>{event.title}</strong>
                    <em>
                      {[dayLabel(event.startsAt, now), event.allDay ? "All day" : timeRange(event.startsAt, event.endsAt), event.location]
                        .filter(Boolean)
                        .join(" · ")}
                    </em>
                  </span>
                  {event.attendees.length > 0 && (
                    <span className="bfmt-faces" aria-label={`${event.attendees.length} attending`}>
                      {event.attendees.slice(0, 3).map((name) => (
                        <i key={name}>{initials(name)}</i>
                      ))}
                    </span>
                  )}
                  {event.joinUrl && (
                    <a className="bfmt-join" href={event.joinUrl} target="_blank" rel="noreferrer">
                      Join <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="bfmt-foot">
            <button type="button" className="bfmt-link" onClick={() => void load()}>
              <RefreshCw size={13} /> Refresh
            </button>
            {connectedProviders.map(([provider]) => (
              <button key={provider} type="button" className="bfmt-link" disabled={busy} onClick={() => void disconnect(provider)}>
                Disconnect {PROVIDER_LABEL[provider]}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="bfmt-pitch">
          <div className="bfmt-pitch-copy">
            <h3>Turn meetings into your day plan</h3>
            <p>Connect your calendar to see what is next on the board, with a live countdown to every meeting.</p>
            <div className="bfmt-connect">
              {PROVIDER_IDS.map((provider) => {
                const entry = status?.providers[provider];
                // A provider with no credentials gets a disabled button that says so, rather
                // than a live one that would bounce off the provider's error page.
                const ready = entry?.configured === true;
                return ready ? (
                  <a key={provider} className={`bfmt-provider is-${provider}`} href={calendarConnectUrl(provider)}>
                    <span className="bfmt-provider-mark" aria-hidden="true" />
                    {PROVIDER_LABEL[provider]}
                  </a>
                ) : (
                  <button
                    key={provider}
                    type="button"
                    className={`bfmt-provider is-${provider}`}
                    disabled
                    title={`${PROVIDER_LABEL[provider]} is not set up on this deployment yet`}
                  >
                    <span className="bfmt-provider-mark" aria-hidden="true" />
                    {PROVIDER_LABEL[provider]}
                  </button>
                );
              })}
            </div>
            {status && !PROVIDER_IDS.some((id) => status.providers[id].configured) && (
              <p className="bfmt-note" role="status">
                No calendar provider is set up on this deployment yet.
              </p>
            )}
          </div>
          <MeetingsPreview />
        </div>
      )}

      {error && (
        <p className="bfmt-note is-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
