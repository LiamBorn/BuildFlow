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
   and consent asks for nothing else.
   ========================================================================= */
import { OAUTH_PROVIDERS, type OAuthProvider, providerConfig } from "./oauth.js";

export const CALENDAR_PROVIDERS = OAUTH_PROVIDERS;
export type CalendarProvider = OAuthProvider;

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
};

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
async function fetchGoogleEvents(accessToken: string, from: Date, to: Date): Promise<CalendarEvent[]> {
  const url = new URL(GOOGLE_EVENTS_URL());
  url.searchParams.set("timeMin", from.toISOString());
  url.searchParams.set("timeMax", to.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "12");
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } });
  if (!response.ok) throw new Error(`google calendar answered ${response.status}`);
  const json = (await response.json()) as {
    items?: Array<{
      id?: string;
      summary?: string;
      location?: string;
      hangoutLink?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      attendees?: Array<{ displayName?: string; email?: string }>;
      conferenceData?: { entryPoints?: Array<{ uri?: string; entryPointType?: string }> };
    }>;
  };
  return (json.items ?? []).flatMap((item) => {
    const start = item.start?.dateTime ?? item.start?.date;
    const end = item.end?.dateTime ?? item.end?.date;
    if (!start || !end) return [];
    const video = item.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri;
    return [
      {
        id: `google:${item.id ?? start}`,
        provider: "google" as const,
        title: (item.summary ?? "Untitled meeting").trim(),
        startsAt: start,
        endsAt: end,
        allDay: !item.start?.dateTime,
        location: (item.location ?? "").trim(),
        joinUrl: item.hangoutLink ?? video ?? "",
        attendees: (item.attendees ?? []).map((a) => (a.displayName ?? a.email ?? "").trim()).filter(Boolean)
      }
    ];
  });
}

/** Microsoft Graph's calendar view, between two instants. */
async function fetchMicrosoftEvents(accessToken: string, from: Date, to: Date): Promise<CalendarEvent[]> {
  const url = new URL(GRAPH_EVENTS_URL());
  url.searchParams.set("startDateTime", from.toISOString());
  url.searchParams.set("endDateTime", to.toISOString());
  url.searchParams.set("$orderby", "start/dateTime");
  url.searchParams.set("$top", "12");
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", prefer: 'outlook.timezone="UTC"' }
  });
  if (!response.ok) throw new Error(`microsoft graph answered ${response.status}`);
  const json = (await response.json()) as {
    value?: Array<{
      id?: string;
      subject?: string;
      isAllDay?: boolean;
      start?: { dateTime?: string };
      end?: { dateTime?: string };
      location?: { displayName?: string };
      onlineMeeting?: { joinUrl?: string };
      attendees?: Array<{ emailAddress?: { name?: string; address?: string } }>;
    }>;
  };
  return (json.value ?? []).flatMap((item) => {
    const start = item.start?.dateTime;
    const end = item.end?.dateTime;
    if (!start || !end) return [];
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
        joinUrl: item.onlineMeeting?.joinUrl ?? "",
        attendees: (item.attendees ?? []).map((a) => (a.emailAddress?.name ?? a.emailAddress?.address ?? "").trim()).filter(Boolean)
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
