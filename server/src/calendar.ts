/* =========================================================================
   Google Calendar and Microsoft Outlook, read-only.

   The Dashboard's Meetings panel shows what is next on the person's calendar
   and counts down to it. This module is the provider half: the consent URL,
   the code exchange that KEEPS the tokens, the refresh, and the event fetch.

   IT SITS ON TOP OF oauth.ts. Sign-in already registers Google and Microsoft
   and reads their client id and secret from the environment, so the credentials,
   the PKCE pair, the signed state cookie and the return-to allowlist are all
   reused. The only things that differ are the SCOPE (a calendar read instead of
   an identity) and the fact that a calendar connection has to outlive the
   redirect, so the refresh token is stored.

   WHAT YOU MUST REGISTER YOURSELF. Nothing here can work until an OAuth app
   exists in your own Google Cloud and Microsoft Entra consoles, because a
   client secret cannot be issued to anyone but the account that owns the app:

     GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET        (Google Cloud → APIs &
       Services → Credentials → OAuth client, type "Web application". Enable
       the Google Calendar API. Authorised redirect URI:
       <API origin>/api/calendar/google/callback)
     MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET  (Entra ID → App
       registrations → Certificates & secrets. Delegated permission
       Calendars.Read. Redirect URI:
       <API origin>/api/calendar/microsoft/callback)
     MICROSOFT_TENANT                              (optional, default "common")

   Those are the same four variables sign-in already uses, so if OAuth sign-in
   is configured the only extra work is enabling the Calendar API on the Google
   app and adding Calendars.Read to the Microsoft one. Until then every route
   here answers `not_configured` and the panel says the provider is unavailable
   rather than pretending to connect.

   READ-ONLY ON PURPOSE. The panel shows meetings; it never writes one. So the
   scopes are the narrowest that work — calendar.readonly and Calendars.Read —
   and consent asks for nothing else. "New event" on the panel opens the
   provider's own editor in a tab instead.

   THE WHOLE CALENDAR, NOT A PREVIEW (2026-09-23). The panel became a calendar
   (day, week, month) that shows "all meetings when connected", so the feed takes
   a range of up to 62 days and up to 250 meetings a calendar, and each meeting
   carries what a person reads before walking into it: who organised it, who is
   coming and how they answered, how YOU answered, the notes, the conferencing
   service and a link back to it in Google or Outlook. A cancelled meeting is not
   sent at all.
   ========================================================================= */
import { OAUTH_PROVIDERS, type OAuthProvider, providerConfig } from "./oauth.js";

export const CALENDAR_PROVIDERS = OAUTH_PROVIDERS;
export type CalendarProvider = OAuthProvider;

/** How someone answered an invite. */
export type CalendarResponse = "accepted" | "declined" | "tentative" | "pending";

/** One person on a meeting, and their answer. */
export type CalendarGuest = { name: string; email: string; response: CalendarResponse; organizer: boolean };

/** At most this many meetings a calendar per read: a busy month, with room to spare. */
export const CALENDAR_PAGE = 250;

/** What the panel needs about one meeting, whichever provider it came from. */
export type CalendarEvent = {
  id: string;
  provider: CalendarProvider;
  title: string;
  /** ISO 8601, always with an offset or Z. */
  startsAt: string;
  endsAt: string;
  /** True for an all-day entry, which has no countdown. */
  allDay: boolean;
  location: string;
  /** A Meet/Teams link when the invite carries one. */
  joinUrl: string;
  /** Display names, for the avatar row. */
  attendees: string[];
  /** Who sent it: a name, or the address when there is none. */
  organizer: string;
  /** Everyone on the invite with their answer, the organizer first. */
  guests: CalendarGuest[];
  /** How the person whose calendar this is answered; "organizer" when it is their own meeting. */
  myResponse: CalendarResponse | "organizer";
  /** The invite's notes as plain text, at most 600 characters. */
  description: string;
  /** The meeting in Google Calendar or Outlook on the web. */
  webUrl: string;
  /** What the join link opens — "Google Meet", "Microsoft Teams", "Zoom" — or "" with no link. */
  conference: string;
};

/** An invite's notes as plain text: tags out, the common entities decoded, blank lines folded, cut to 600. */
export function plainNotes(value: string | undefined): string {
  if (!value) return "";
  const text = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n[\s]*/g, "\n")
    .trim();
  return text.length > 600 ? `${text.slice(0, 599).trimEnd()}…` : text;
}

/** What a join link opens: the provider's own name for it when it gives one, else read off the host. */
export function conferenceName(url: string, named?: string): string {
  if (named?.trim()) return named.trim();
  if (!url) return "";
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "Online meeting";
  }
  if (host === "meet.google.com") return "Google Meet";
  if (host.endsWith("teams.microsoft.com") || host.endsWith("teams.live.com")) return "Microsoft Teams";
  if (host === "zoom.us" || host.endsWith(".zoom.us")) return "Zoom";
  if (host.endsWith("webex.com")) return "Webex";
  return "Online meeting";
}

const GOOGLE_RESPONSE: Record<string, CalendarResponse> = {
  accepted: "accepted",
  declined: "declined",
  tentative: "tentative",
  needsAction: "pending"
};
const GRAPH_RESPONSE: Record<string, CalendarResponse | "organizer"> = {
  accepted: "accepted",
  declined: "declined",
  tentativelyAccepted: "tentative",
  notResponded: "pending",
  none: "pending",
  organizer: "organizer"
};
const GRAPH_CONFERENCE: Record<string, string> = {
  teamsForBusiness: "Microsoft Teams",
  skypeForBusiness: "Skype for Business",
  skypeForConsumer: "Skype"
};

/** The organizer first, then everyone else in the order the invite lists them. */
const organizerFirst = (guests: CalendarGuest[]) => [...guests].sort((a, b) => Number(b.organizer) - Number(a.organizer));

export type CalendarTokens = {
  accessToken: string;
  /** Absent when the provider declines to re-issue one on a refresh. */
  refreshToken?: string;
  /** Epoch ms. */
  expiresAt: number;
  /** The mailbox the tokens are for, shown beside the connection. */
  email: string;
};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * The consent scope, and the parameters that make the provider hand back a
 * REFRESH token. Google only issues one with access_type=offline, and only
 * re-issues it when prompt=consent, so a connection made without both dies at
 * the first access-token expiry. Microsoft wants offline_access in the scope.
 */
export function calendarScope(provider: CalendarProvider): string {
  if (provider === "google") return "openid email https://www.googleapis.com/auth/calendar.readonly";
  return "openid email offline_access Calendars.Read";
}

export function calendarAuthorizeParams(provider: CalendarProvider): Record<string, string> {
  if (provider === "google") return { access_type: "offline", prompt: "consent", include_granted_scopes: "true" };
  return { prompt: "consent", response_mode: "query" };
}

/** Whether each provider has credentials. Same answer sign-in gives. */
export function calendarConfigured(): Record<CalendarProvider, boolean> {
  return { google: providerConfig("google") !== null, microsoft: providerConfig("microsoft") !== null };
}

/** The consent URL for a calendar connection. Null when the provider has no credentials. */
export function calendarAuthorizeUrl(
  provider: CalendarProvider,
  args: { redirectUri: string; state: string; challenge: string }
): string | null {
  const config = providerConfig(provider);
  if (!config) return null;
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", calendarScope(provider));
  url.searchParams.set("state", args.state);
  url.searchParams.set("code_challenge", args.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  for (const [key, value] of Object.entries(calendarAuthorizeParams(provider))) url.searchParams.set(key, value);
  return url.toString();
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
};

async function postToken(provider: CalendarProvider, body: URLSearchParams): Promise<TokenResponse> {
  const config = providerConfig(provider);
  if (!config) throw new Error("not_configured");
  body.set("client_id", config.clientId);
  body.set("client_secret", config.clientSecret);
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body
  });
  const json = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || json.error) throw new Error(json.error_description || json.error || `token endpoint answered ${response.status}`);
  if (!json.access_token) throw new Error("token endpoint returned no access_token");
  return json;
}

/** The mailbox the tokens belong to, read off the id_token the exchange returns. */
function emailFromIdToken(idToken: string | undefined): string {
  if (!idToken) return "";
  try {
    const parts = idToken.split(".");
    if (parts.length < 2) return "";
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    return String(claims.email ?? claims.preferred_username ?? "")
      .trim()
      .toLowerCase();
  } catch {
    return "";
  }
}

/** Code → tokens. Unlike sign-in's exchange, this keeps them. */
export async function exchangeCalendarCode(
  provider: CalendarProvider,
  args: { code: string; redirectUri: string; verifier: string }
): Promise<CalendarTokens> {
  const json = await postToken(
    provider,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: args.code,
      redirect_uri: args.redirectUri,
      code_verifier: args.verifier
    })
  );
  if (!json.refresh_token) {
    // Without one the connection would work until the first expiry and then fail
    // silently, which is worse than refusing it now.
    throw new Error("provider returned no refresh_token — consent must be granted with offline access");
  }
  return {
    accessToken: json.access_token!,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    email: emailFromIdToken(json.id_token)
  };
}

/** A fresh access token from a stored refresh token. */
export async function refreshCalendarTokens(provider: CalendarProvider, refreshToken: string): Promise<CalendarTokens> {
  const json = await postToken(
    provider,
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, scope: calendarScope(provider) })
  );
  return {
    accessToken: json.access_token!,
    // Google usually omits it on a refresh; Microsoft rotates it. Keep whichever we have.
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    email: emailFromIdToken(json.id_token)
  };
}

const GOOGLE_EVENTS_URL = () => env("CALENDAR_GOOGLE_EVENTS_URL") ?? "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GRAPH_EVENTS_URL = () => env("CALENDAR_MICROSOFT_EVENTS_URL") ?? "https://graph.microsoft.com/v1.0/me/calendarView";

/** Google Calendar's primary calendar, between two instants. */
/** Google Calendar's events list, as it answers. */
type GoogleEventsAnswer = {
  items?: Array<{
    id?: string;
    status?: string;
    summary?: string;
    description?: string;
    location?: string;
    htmlLink?: string;
    hangoutLink?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    organizer?: { displayName?: string; email?: string; self?: boolean };
    attendees?: Array<{ displayName?: string; email?: string; responseStatus?: string; organizer?: boolean; self?: boolean }>;
    conferenceData?: { entryPoints?: Array<{ uri?: string; entryPointType?: string }>; conferenceSolution?: { name?: string } };
  }>;
};

async function fetchGoogleEvents(accessToken: string, from: Date, to: Date): Promise<CalendarEvent[]> {
  const url = new URL(GOOGLE_EVENTS_URL());
  url.searchParams.set("timeMin", from.toISOString());
  url.searchParams.set("timeMax", to.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", String(CALENDAR_PAGE));
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } });
  if (!response.ok) throw new Error(`google calendar answered ${response.status}`);
  return readGoogleEvents((await response.json()) as GoogleEventsAnswer);
}

/** Google's answer, as the panel reads meetings. Exported so the mapping is tested on its own. */
export function readGoogleEvents(json: GoogleEventsAnswer): CalendarEvent[] {
  return (json.items ?? []).flatMap((item) => {
    const start = item.start?.dateTime ?? item.start?.date;
    const end = item.end?.dateTime ?? item.end?.date;
    if (!start || !end || item.status === "cancelled") return [];
    const video = item.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri;
    const joinUrl = item.hangoutLink ?? video ?? "";
    const guests = organizerFirst(
      (item.attendees ?? []).flatMap((a) => {
        const name = (a.displayName ?? a.email ?? "").trim();
        if (!name) return [];
        return [
          {
            name,
            email: (a.email ?? "").trim(),
            response: GOOGLE_RESPONSE[a.responseStatus ?? ""] ?? "pending",
            organizer: a.organizer === true
          }
        ];
      })
    );
    const self = (item.attendees ?? []).find((a) => a.self);
    // your own meeting, or one with no one else on it, is yours to hold; otherwise your answer on the invite
    const myResponse: CalendarEvent["myResponse"] =
      item.organizer?.self || !self ? "organizer" : (GOOGLE_RESPONSE[self.responseStatus ?? ""] ?? "pending");
    return [
      {
        id: `google:${item.id ?? start}`,
        provider: "google" as const,
        title: (item.summary ?? "Untitled meeting").trim(),
        startsAt: start,
        endsAt: end,
        allDay: !item.start?.dateTime,
        location: (item.location ?? "").trim(),
        joinUrl,
        attendees: (item.attendees ?? []).map((a) => (a.displayName ?? a.email ?? "").trim()).filter(Boolean),
        organizer: (item.organizer?.displayName ?? item.organizer?.email ?? "").trim(),
        guests,
        myResponse,
        description: plainNotes(item.description),
        webUrl: item.htmlLink ?? "",
        conference: conferenceName(joinUrl, item.conferenceData?.conferenceSolution?.name)
      }
    ];
  });
}

/** Microsoft Graph's calendar view, between two instants. */
/** Microsoft Graph's calendar view, as it answers. */
type GraphEventsAnswer = {
  value?: Array<{
    id?: string;
    subject?: string;
    isAllDay?: boolean;
    isCancelled?: boolean;
    isOrganizer?: boolean;
    start?: { dateTime?: string };
    end?: { dateTime?: string };
    location?: { displayName?: string };
    onlineMeeting?: { joinUrl?: string };
    onlineMeetingProvider?: string;
    attendees?: Array<{ emailAddress?: { name?: string; address?: string }; status?: { response?: string } }>;
    organizer?: { emailAddress?: { name?: string; address?: string } };
    bodyPreview?: string;
    webLink?: string;
    responseStatus?: { response?: string };
  }>;
};

async function fetchMicrosoftEvents(accessToken: string, from: Date, to: Date): Promise<CalendarEvent[]> {
  const url = new URL(GRAPH_EVENTS_URL());
  url.searchParams.set("startDateTime", from.toISOString());
  url.searchParams.set("endDateTime", to.toISOString());
  url.searchParams.set("$orderby", "start/dateTime");
  url.searchParams.set("$top", String(CALENDAR_PAGE));
  url.searchParams.set(
    "$select",
    "id,subject,isAllDay,isCancelled,isOrganizer,start,end,location,onlineMeeting,onlineMeetingProvider,attendees,organizer,bodyPreview,webLink,responseStatus"
  );
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", prefer: 'outlook.timezone="UTC"' }
  });
  if (!response.ok) throw new Error(`microsoft graph answered ${response.status}`);
  return readGraphEvents((await response.json()) as GraphEventsAnswer);
}

/** Graph's answer, as the panel reads meetings. Exported so the mapping is tested on its own. */
export function readGraphEvents(json: GraphEventsAnswer): CalendarEvent[] {
  return (json.value ?? []).flatMap((item) => {
    const start = item.start?.dateTime;
    const end = item.end?.dateTime;
    if (!start || !end || item.isCancelled === true) return [];
    const joinUrl = item.onlineMeeting?.joinUrl ?? "";
    const organizerName = (item.organizer?.emailAddress?.name ?? item.organizer?.emailAddress?.address ?? "").trim();
    const organizerEmail = (item.organizer?.emailAddress?.address ?? "").trim();
    // Graph leaves the organizer off the attendee list, so they are put back at its head
    const invited = (item.attendees ?? []).flatMap((a) => {
      const name = (a.emailAddress?.name ?? a.emailAddress?.address ?? "").trim();
      if (!name) return [];
      const response = GRAPH_RESPONSE[a.status?.response ?? ""];
      return [
        {
          name,
          email: (a.emailAddress?.address ?? "").trim(),
          response: response === "organizer" || !response ? "pending" : response,
          organizer: false
        }
      ];
    });
    const guests: CalendarGuest[] = organizerName
      ? [
          { name: organizerName, email: organizerEmail, response: "accepted", organizer: true },
          ...invited.filter((guest) => !organizerEmail || guest.email.toLowerCase() !== organizerEmail.toLowerCase())
        ]
      : invited;
    const answered = GRAPH_RESPONSE[item.responseStatus?.response ?? ""];
    const myResponse: CalendarEvent["myResponse"] = item.isOrganizer === true ? "organizer" : (answered ?? "pending");
    // Graph returns a naive local string with the Prefer timezone applied; UTC is what we asked for
    const iso = (value: string) => (/(Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`);
    return [
      {
        id: `microsoft:${item.id ?? start}`,
        provider: "microsoft" as const,
        title: (item.subject ?? "Untitled meeting").trim(),
        startsAt: iso(start),
        endsAt: iso(end),
        allDay: item.isAllDay === true,
        location: (item.location?.displayName ?? "").trim(),
        joinUrl,
        attendees: (item.attendees ?? []).map((a) => (a.emailAddress?.name ?? a.emailAddress?.address ?? "").trim()).filter(Boolean),
        organizer: organizerName,
        guests,
        myResponse,
        description: plainNotes(item.bodyPreview),
        webUrl: item.webLink ?? "",
        conference: conferenceName(joinUrl, GRAPH_CONFERENCE[item.onlineMeetingProvider ?? ""])
      }
    ];
  });
}

export function fetchCalendarEvents(provider: CalendarProvider, accessToken: string, from: Date, to: Date): Promise<CalendarEvent[]> {
  return provider === "google" ? fetchGoogleEvents(accessToken, from, to) : fetchMicrosoftEvents(accessToken, from, to);
}

/** Soonest first, all-day entries after timed ones on the same day. */
export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((left, right) => {
    if (left.allDay !== right.allDay) return left.allDay ? 1 : -1;
    return left.startsAt.localeCompare(right.startsAt);
  });
}
