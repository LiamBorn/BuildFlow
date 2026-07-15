/**
 * analytics.ts — provider-agnostic funnel analytics for the BuildFlow welcome site.
 *
 * Pick ONE provider at build time via Vite env vars (client/.env.example documents
 * all three). Until a provider is configured this runs in DEBUG mode: events are
 * logged to the console in dev and dropped in prod — NO third-party script loads
 * and NO cookies are set. This mirrors the server's email.ts "LOG MODE until creds
 * added" pattern, so the funnel is fully instrumented now and going live is a
 * one-line env change, not a code change.
 *
 *   Plausible : VITE_ANALYTICS_PROVIDER=plausible  VITE_PLAUSIBLE_DOMAIN=buildflow.com
 *   GA4       : VITE_ANALYTICS_PROVIDER=ga          VITE_GA_ID=G-XXXXXXXXXX
 *   PostHog   : VITE_ANALYTICS_PROVIDER=posthog     VITE_POSTHOG_KEY=phc_xxxxx
 *
 * Usage:
 *   initAnalytics();                          // once, in main.tsx
 *   trackPageView("integrations");            // on welcome route changes
 *   track(EVENTS.waitlistSignup, { count });  // funnel conversions
 */

type Provider = "plausible" | "ga" | "posthog" | "none";
export type AnalyticsProps = Record<string, string | number | boolean | undefined>;

/** Canonical funnel event names — use these so every call site stays consistent. */
export const EVENTS = {
  waitlistSignup: "waitlist_signup",
  contactSales: "contact_sales_submit",
  demoVideoOpen: "demo_video_open",
  enterApp: "enter_app",
  ctaClick: "cta_click"
} as const;

declare global {
  interface Window {
    plausible?: { (event: string, opts?: { u?: string; props?: AnalyticsProps }): void; q?: unknown[] };
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    // PostHog's own SDK shape; loaded lazily, so kept loose on purpose.
    posthog?: { capture: (event: string, props?: AnalyticsProps) => void; init: (key: string, opts?: Record<string, unknown>) => void };
  }
}

// Vite exposes VITE_* vars + DEV/PROD flags on import.meta.env. Access the LITERAL
// `import.meta.env` — Vite injects it via static text replacement, so aliasing
// `import.meta` to a variable first and reading `.env` off that yields undefined
// at runtime. `?? {}` guards against any environment without the injection.
const env = (import.meta.env ?? {}) as unknown as Record<string, string | undefined> & { DEV?: boolean };
const isDev = Boolean(env.DEV);

let provider: Provider = "none";
let debug = false;
let started = false;

// Events fired before the provider script finishes loading are buffered here and
// flushed once it's ready, so we never drop the first pageview / conversion.
let ready = false;
const pending: Array<() => void> = [];
function whenReady(run: () => void) {
  if (ready) {
    run();
    return;
  }
  pending.push(run);
}
function markReady() {
  ready = true;
  pending.splice(0).forEach((run) => {
    try {
      run();
    } catch (err) {
      if (isDev) console.warn("[analytics] dispatch failed", err);
    }
  });
}

function detectProvider(): Provider {
  const explicit = (env.VITE_ANALYTICS_PROVIDER || "").trim().toLowerCase();
  if (explicit === "plausible" || explicit === "ga" || explicit === "posthog") return explicit;
  if (explicit === "none" || explicit === "off") return "none";
  // No explicit choice → infer from whichever key is present.
  if (env.VITE_PLAUSIBLE_DOMAIN) return "plausible";
  if (env.VITE_GA_ID) return "ga";
  if (env.VITE_POSTHOG_KEY) return "posthog";
  return "none";
}

function injectScript(src: string, attrs: Record<string, string> = {}): HTMLScriptElement {
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  Object.entries(attrs).forEach(([key, value]) => script.setAttribute(key, value));
  document.head.appendChild(script);
  return script;
}

function setupPlausible() {
  const domain = env.VITE_PLAUSIBLE_DOMAIN;
  if (!domain) return false;
  // Manual script variant: we send SPA pageviews ourselves (hash routing).
  const src = env.VITE_PLAUSIBLE_SRC || "https://plausible.io/js/script.manual.js";
  window.plausible =
    window.plausible ||
    (Object.assign(
      function (...args: unknown[]) {
        (window.plausible!.q = window.plausible!.q || []).push(args);
      },
      { q: [] as unknown[] }
    ) as Window["plausible"]);
  injectScript(src, { "data-domain": domain });
  markReady(); // native stub queues until the script drains it
  return true;
}

function setupGa() {
  const id = env.VITE_GA_ID;
  if (!id) return false;
  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function (...args: unknown[]) {
      window.dataLayer!.push(args);
    };
  injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
  window.gtag("js", new Date());
  // send_page_view:false — SPA pageviews are sent manually per welcome view.
  window.gtag("config", id, { send_page_view: false, anonymize_ip: true });
  markReady(); // gtag stub queues into dataLayer until gtag.js loads
  return true;
}

function setupPosthog() {
  const key = env.VITE_POSTHOG_KEY;
  if (!key) return false;
  const host = (env.VITE_POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
  const script = injectScript(`${host}/static/array.js`);
  script.onload = () => {
    try {
      window.posthog!.init(key, {
        api_host: host,
        capture_pageview: false, // manual SPA pageviews
        autocapture: false, // funnel is explicitly instrumented
        persistence: "localStorage", // cookieless
        disable_session_recording: true
      });
      markReady();
    } catch (err) {
      if (isDev) console.warn("[analytics] posthog init failed", err);
    }
  };
  script.onerror = () => {
    if (isDev) console.warn("[analytics] posthog script failed to load");
  };
  return true;
}

function currentUrl(): string {
  return typeof window !== "undefined" ? window.location.href : "";
}

function dispatchPageView(view: string) {
  if (provider === "plausible") {
    window.plausible?.("pageview", { u: currentUrl() });
  } else if (provider === "ga") {
    window.gtag?.("event", "page_view", {
      page_path: window.location.pathname + window.location.hash,
      page_title: view
    });
  } else if (provider === "posthog") {
    window.posthog?.capture("$pageview", { view, $current_url: currentUrl() });
  }
}

function dispatchEvent(name: string, props?: AnalyticsProps) {
  if (provider === "plausible") {
    window.plausible?.(name, props ? { props } : undefined);
  } else if (provider === "ga") {
    window.gtag?.("event", name, props ?? {});
  } else if (provider === "posthog") {
    window.posthog?.capture(name, props);
  }
}

/** Initialize analytics once, as early as possible (main.tsx). Safe to call twice. */
export function initAnalytics() {
  if (started || typeof window === "undefined") return;
  started = true;
  provider = detectProvider();
  // Log to console when explicitly asked, or in dev with no provider wired yet
  // (so the funnel is visible in the preview without sending anything anywhere).
  debug = env.VITE_ANALYTICS_DEBUG === "true" || (provider === "none" && isDev);

  if (provider === "plausible") setupPlausible();
  else if (provider === "ga") setupGa();
  else if (provider === "posthog") setupPosthog();

  if (debug) {
    // eslint-disable-next-line no-console
    console.info(
      `[analytics] provider=${provider}${provider === "none" ? " (DEBUG — no tracking sent; set VITE_ANALYTICS_PROVIDER to go live)" : ""}`
    );
  }
}

/** Record a funnel step. `view` is the welcome view name (e.g. "integrations"). */
export function trackPageView(view: string) {
  if (debug) {
    // eslint-disable-next-line no-console
    console.debug("[analytics] pageview:", view, currentUrl());
  }
  if (provider === "none") return;
  whenReady(() => dispatchPageView(view));
}

/** Record a funnel conversion / interaction. Use an `EVENTS.*` name. */
export function track(name: string, props?: AnalyticsProps) {
  if (debug) {
    // eslint-disable-next-line no-console
    console.debug("[analytics] event:", name, props ?? {});
  }
  if (provider === "none") return;
  whenReady(() => dispatchEvent(name, props));
}
