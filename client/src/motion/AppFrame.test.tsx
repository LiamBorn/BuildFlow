/**
 * The once-a-session gate, and the development trap it is shaped around.
 *
 * StrictMode runs every effect twice. A gate that consumed the session flag on the
 * first run would find it already set on the second and skip — so the opening would
 * never play on a developer's machine and would play in production. These cases fail
 * if that shape ever comes back.
 */
import { StrictMode } from "react";
import { render, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppFrame, openingRunning, __resetOpeningGate } from "./AppFrame";
import { BEAT, OPENING, ms } from "./tokens";

const shell = () => document.querySelector<HTMLElement>(".app-shell.hs-shell")!;

const mountShell = () => {
  document.body.innerHTML = `<div class="app-shell hs-shell bf-shell"></div>`;
};

const reducedMotion = (reduce: boolean) => {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: reduce && query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false
      }) as unknown as MediaQueryList
  );
};

describe("the opening's once-a-session gate", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    __resetOpeningGate();
    reducedMotion(false);
    mountShell();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("still opens under StrictMode, whose double-invoked effect would otherwise swallow it", () => {
    render(
      <StrictMode>
        <AppFrame />
      </StrictMode>
    );
    expect(shell().classList.contains("bfm-open"), "the chrome assembles on the first open").toBe(true);
    expect(window.sessionStorage.getItem("bf:shell-opened")).toBe("1");
  });

  it("does not open a second time in the same session", () => {
    render(<AppFrame />);
    expect(shell().classList.contains("bfm-open")).toBe(true);
    cleanup();

    // a fresh module decision, as a reload would make, but the session remembers
    __resetOpeningGate();
    mountShell();
    render(<AppFrame />);
    expect(shell().classList.contains("bfm-open"), "the chrome is already up").toBe(false);
  });

  it("takes the class off once the cascade has settled, so nothing rests mid-animation", () => {
    vi.useFakeTimers();
    render(<AppFrame />);
    expect(shell().classList.contains("bfm-open")).toBe(true);
    vi.advanceTimersByTime(ms(OPENING) + 1);
    expect(shell().classList.contains("bfm-open")).toBe(false);
    vi.useRealTimers();
  });

  it("stops saying the chrome is going up once it has gone up", () => {
    // The bug: `firstOpen` is decided once and never changes, but `bfm-open` comes
    // off when the cascade settles and the sheet's --bfm-shift flips with it. A page
    // opened after that read "still assembling" from the code and "already up" from
    // the sheet, so its title waited out a beat that had finished and arrived AFTER
    // its own figures and cards. Both sides ask this one question now.
    vi.useFakeTimers();
    render(<AppFrame />);
    expect(openingRunning(), "while the chrome is assembling").toBe(true);
    expect(shell().classList.contains("bfm-open")).toBe(true);

    vi.advanceTimersByTime(ms(OPENING) + 1);

    expect(shell().classList.contains("bfm-open"), "the sheet says it is up").toBe(false);
    expect(openingRunning(), "and so must the code").toBe(false);
    vi.useRealTimers();
  });

  it("shifts a later page's beats by exactly what the chrome already spent", () => {
    // the two sides of --bfm-shift, in the two states
    vi.useFakeTimers();
    render(<AppFrame />);
    const during = openingRunning() ? 0 : BEAT.title;
    expect(during, "first open: nothing has happened yet, so nothing is subtracted").toBe(0);
    vi.advanceTimersByTime(ms(OPENING) + 1);
    const after = openingRunning() ? 0 : BEAT.title;
    expect(after, "later: the title's beat is already spent").toBe(BEAT.title);
    vi.useRealTimers();
  });

  it("marks the session but plays nothing for a reader who asked for less motion", () => {
    reducedMotion(true);
    render(<AppFrame />);
    expect(shell().classList.contains("bfm-open"), "no cascade").toBe(false);
    expect(window.sessionStorage.getItem("bf:shell-opened"), "but the session is spent").toBe("1");
  });
});
