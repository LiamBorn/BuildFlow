import * as matchers from "@testing-library/jest-dom/matchers";
import { configure } from "@testing-library/react";
import { expect, vi } from "vitest";

expect.extend(matchers);

// `findBy*` and `waitFor` get patience proportionate to what they are waiting for.
//
// vite.config and appHarness both allow a case 20 seconds, but Testing Library's own async default
// is 1000ms, so every `findBy` gave up after a twentieth of the budget. Almost every case here
// opens a page of the product, and those renders are not small: measured on this machine, opening
// the TimeCard page takes 442ms warm and 2,119ms cold, and the Dashboard's panel board is the same
// order. Under load they cross a second, and the failure then reads "Unable to find role=heading X"
// — which looks like a broken page rather than one still rendering.
//
// That mismatch is what the suite's recurring "flakes" were: dashboard-entrance's TimeCard case and
// App.test's phone-first case each failed in a full run and passed alone, three times across two
// sessions, and each cost a fresh diagnosis.
//
// Five seconds, not twenty: long enough that a slow machine finishes, short enough that a case
// whose element never arrives still fails promptly. It only spends the extra time on failure.
configure({ asyncUtilTimeout: 5000 });

// The schedule board opens on the week containing "today", and scheduleUtils picks
// that week once at module load (`export const weekDays = buildCurrentWeek()`), as
// does App's `dashboardToday`. The fixtures are dated 2026-06-15..17, so on a real
// clock the fixture's jobs and assignments sit outside the visible week and every
// date-bound assertion rots as the calendar moves past them. Pin the clock here —
// setup files run before the test file imports App, which is the only point early
// enough to reach those load-time constants.
//
// Only Date is faked: the app's typewriters, debounced autocomplete, and reveal
// timers all run on setTimeout and must stay real for `findBy*` to ever resolve.
vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-06-16T12:00:00") });

// jsdom implements neither ResizeObserver nor IntersectionObserver, which the
// visual components observe elements with on mount. No-op stubs: nothing in the
// suite asserts on observed sizes or reveal-on-scroll, it just must not throw.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = NoopObserver as unknown as typeof ResizeObserver;
}
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = NoopObserver as unknown as typeof IntersectionObserver;
}

// jsdom has no media playback, so the autoplaying <video> in the welcome hero
// makes HTMLMediaElement.play() throw "Not implemented" on mount. It rejects
// rather than fails the test, but it floods every run's output. No test asserts
// on playback, so resolving is enough.
if (typeof window !== "undefined") {
  Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
    writable: true,
    value: () => Promise.resolve()
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, "pause", {
    writable: true,
    value: () => {}
  });
}

// jsdom implements `window` but not `window.matchMedia`, and the welcome-page
// motion components (WxTypewriter, WxRotatingHeadline, WxRotatingWord, ...) call
// it while rendering to honour prefers-reduced-motion. Without this stub they
// throw on mount and every test that renders <App /> fails. Reports "no
// preference" so animated components take their normal (non-reduced) path.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    })
  });
}
