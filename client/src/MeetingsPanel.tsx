/**
 * The Dashboard's Meetings panel.
 *
 * NOT CONNECTED, it is the monday.com reference the user pointed at: the pitch and the two connect
 * buttons on the left, a preview of what a connected panel looks like on the right, and "Not
 * connected" beside the heading. Connecting is signing in: the button goes to Google's or
 * Microsoft's own consent screen, and the provider sends the browser back here.
 *
 * CONNECTED, it is the whole calendar (meetings/MeetingsCalendar.tsx, 2026-09-23): Day / Week /
 * Month, the time grid, New event, the month at a glance, what is up next and which calendars show,
 * with every meeting opening in the right-hand drawer.
 *
 * WHAT IT NEEDS TO GO LIVE. Google Calendar and Microsoft Graph both require an OAuth app
 * registered in your own developer console, because a client secret can only be issued to
 * the account that owns the app. Four environment variables, all of which sign-in already
 * uses: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, MICROSOFT_CLIENT_ID,
 * MICROSOFT_CLIENT_SECRET. server/src/calendar.ts has the console steps. Until they are
 * set, `configured` comes back false and the button says the provider is unavailable
 * instead of starting a flow that cannot finish.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock } from "lucide-react";
import { calendarConnectUrl, calendarStatus, disconnectCalendar, type CalendarProviderId, type CalendarStatus } from "./api";
import { CALENDAR_NAME, PROVIDER_IDS, PROVIDER_LABEL } from "./meetings/calendarModel";
import { MeetingsCalendar } from "./meetings/MeetingsCalendar";
import { SignInWaiting, useSignInWindow, type SignInResult } from "./meetings/signInWindow";

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
 * both true and harmless. (The meetings themselves are read the same way: readMeetings.)
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

/** Why a connection did not finish, in words: the server sends back a code (server/src/app.ts, calDone). */
const REASONS: Record<string, string> = {
  access_denied: "the request was cancelled on the consent screen",
  state_mismatch: "the sign-in expired or was started in another tab. Try again from here",
  not_configured: "it is not switched on for this BuildFlow yet",
  no_code: "the provider sent nothing back",
  unknown_provider: "that provider is not one BuildFlow connects to"
};

/**
 * What the provider said when it sent the browser back: `?calendar=connected&provider=google`, or
 * `?calendar=error&reason=…`. Read once, said once, and taken out of the address so a reload or a
 * shared link does not say it again.
 */
function readConnectReturn(): { ok: boolean; text: string } | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const outcome = url.searchParams.get("calendar");
  if (outcome !== "connected" && outcome !== "error") return null;
  const provider = url.searchParams.get("provider");
  const reason = url.searchParams.get("reason") ?? "";
  for (const key of ["calendar", "provider", "reason"]) url.searchParams.delete(key);
  try {
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // an address that cannot be rewritten only means the note could show again on a reload
  }
  const name = provider === "google" || provider === "microsoft" ? CALENDAR_NAME[provider] : "The calendar";
  if (outcome === "connected") return { ok: true, text: `${name} is connected. Your meetings are below.` };
  return { ok: false, text: `${name} could not be connected: ${REASONS[reason] ?? "the provider refused the request. Try again"}.` };
}

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

/** A person moving the page: the panel stops trying to settle itself. */
const PERSON_SCROLLS = ["wheel", "touchmove", "keydown"] as const;

/** What the card says when a sign-in window is done; nothing for one the person cancelled. */
function signInNote({ provider, outcome, reason }: SignInResult): { ok: boolean; text: string } | null {
  const name = CALENDAR_NAME[provider];
  if (outcome === "connected") return { ok: true, text: `${name} is connected. Your meetings are below.` };
  if (outcome === "error")
    return { ok: false, text: `${name} could not be connected: ${REASONS[reason] ?? "the provider refused the request. Try again"}.` };
  if (outcome === "closed") return { ok: true, text: `The ${PROVIDER_LABEL[provider]} sign-in window was closed before it finished.` };
  if (outcome === "timeout")
    return { ok: true, text: `The ${PROVIDER_LABEL[provider]} sign-in took too long, so the card stopped waiting. Try again.` };
  return null;
}

export function MeetingsPanel() {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** How the last connection went: back from the provider in this tab, or from its window. */
  const [note, setNote] = useState(readConnectReturn);
  /* Back from signing in in this tab, the Dashboard lands on this panel (App.tsx sets the focus). The
     panel then changes what it holds — the calendar is far taller than the pitch — and panels above
     it may still be growing into their own data, so once it knows what it shows it settles itself
     at the top of the screen, where the result it reports can be read. */
  const landing = useRef(note !== null);
  const rootRef = useRef<HTMLDivElement>(null);
  const settle = useRef(0);
  const settleStop = useRef<() => void>(() => undefined);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async (): Promise<CalendarStatus | null> => {
    try {
      const next = readStatus(await calendarStatus());
      if (!alive.current) return null;
      setStatus(next);
      setError(null);
      return next;
    } catch {
      // A calendar that cannot be reached is worth saying; it is not worth breaking the board.
      if (alive.current) setError("Calendar is unavailable right now.");
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!landing.current || status === null) return;
    landing.current = false;
    const block = rootRef.current?.closest<HTMLElement>(".dash-block") ?? rootRef.current;
    if (!block) return;
    /* IT FOLLOWS ITS OWN PLACE for the first four seconds. Measured on the real board: the
       Dashboard's landing put the panel under the top bar, then the panels above it finished loading
       (a lazy section, a forecast arriving) and carried it 122px up and half out of sight, with no
       scroll involved — once at 1.9s, once at 1.5s, never at the same moment. So whenever its place
       on the page has changed and then held still for 400ms it settles again, until 4s have passed;
       and the moment the person scrolls, the page is theirs. */
    const started = performance.now();
    let place = Number.NaN;
    let stillSince = started;
    let settledFor = Number.NaN;
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stop = () => {
      window.clearInterval(settle.current);
      for (const type of PERSON_SCROLLS) window.removeEventListener(type, stop);
    };
    for (const type of PERSON_SCROLLS) window.addEventListener(type, stop, { passive: true });
    settle.current = window.setInterval(() => {
      const now = performance.now();
      const at = block.getBoundingClientRect().top + window.scrollY;
      if (at !== place) {
        place = at;
        stillSince = now;
      }
      if (now - stillSince >= 400 && place !== settledFor) {
        settledFor = place;
        block.scrollIntoView?.({ block: "start", behavior: reduced ? "auto" : "smooth" });
      }
      if (now - started >= 4000) stop();
    }, 150);
    settleStop.current = stop;
  }, [status]);
  useEffect(() => () => settleStop.current(), []);

  /* Coming back to the tab reads the connections again: a calendar connected in another tab, or in a
     sign-in window whose last message never arrived, shows up without a reload. At most every 10s. */
  useEffect(() => {
    let last = 0;
    const onFocus = () => {
      const at = performance.now();
      if (at - last < 10_000) return;
      last = at;
      void load();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  // Signing in happens in a window over the Dashboard (meetings/signInWindow.tsx); the card waits with it.
  const signIn = useSignInWindow({
    readStatus: load,
    onFinished: (result) => {
      if (!alive.current) return;
      const next = signInNote(result);
      if (next) setNote(next);
      if (result.outcome === "connected") setError(null);
    }
  });

  const disconnect = async (provider: CalendarProviderId) => {
    setBusy(true);
    try {
      await disconnectCalendar(provider);
      await load();
    } catch {
      if (alive.current) setError(`${CALENDAR_NAME[provider]} could not be disconnected just now.`);
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const connected = status ? PROVIDER_IDS.filter((id) => status.providers[id].connected) : [];
  const isConnected = status !== null && connected.length > 0;

  return (
    <div className="bfmt" ref={rootRef}>
      <span className="bfmt-state">
        {isConnected ? connected.map((id) => status.providers[id].email || CALENDAR_NAME[id]).join(" · ") : "Not connected"}
      </span>

      {note && (
        <p className={`bfmt-note${note.ok ? "" : " is-error"}`} role="status">
          {note.text}
        </p>
      )}

      {isConnected ? (
        <MeetingsCalendar
          status={status}
          busy={busy}
          signIn={signIn}
          onDisconnect={(provider) => void disconnect(provider)}
          onSync={() => void load()}
        />
      ) : (
        <div className="bfmt-pitch">
          <div className="bfmt-pitch-copy">
            <h3>Turn meetings into your day plan</h3>
            <p>
              Sign in with Google or Microsoft to bring your calendar onto the board: every meeting on a day, week and month calendar, a
              live countdown to the next one, and the link to join it.
            </p>
            {signIn.waitingFor ? (
              <SignInWaiting provider={signIn.waitingFor} onCancel={signIn.cancel} />
            ) : (
              <div className="bfmt-connect">
                {PROVIDER_IDS.map((provider) => {
                  const entry = status?.providers[provider];
                  // A provider with no credentials gets a disabled button that says so, rather
                  // than a live one that would bounce off the provider's error page.
                  const ready = entry?.configured === true;
                  return ready ? (
                    <a
                      key={provider}
                      className={`bfmt-provider is-${provider}`}
                      href={calendarConnectUrl(provider)}
                      onClick={(event) => {
                        // in a window over the Dashboard; a blocked pop-up lets the link sign in in the tab
                        if (signIn.start(provider)) event.preventDefault();
                      }}
                    >
                      <span className="bfmt-provider-mark" aria-hidden="true" />
                      {PROVIDER_LABEL[provider]}
                    </a>
                  ) : (
                    <button
                      key={provider}
                      type="button"
                      className={`bfmt-provider is-${provider}`}
                      disabled
                      title={`${PROVIDER_LABEL[provider]} sign-in is not switched on for this BuildFlow yet`}
                    >
                      <span className="bfmt-provider-mark" aria-hidden="true" />
                      {PROVIDER_LABEL[provider]}
                    </button>
                  );
                })}
              </div>
            )}
            {status && !PROVIDER_IDS.some((id) => status.providers[id].configured) && (
              <p className="bfmt-note" role="status">
                Google and Outlook sign-in are not switched on for this BuildFlow yet: each needs an app registered once with Google and
                with Microsoft, by whoever runs BuildFlow.
              </p>
            )}
            {status && PROVIDER_IDS.some((id) => status.providers[id].configured) && (
              <p className="bfmt-note">Read-only: BuildFlow can see your meetings and never changes them.</p>
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
