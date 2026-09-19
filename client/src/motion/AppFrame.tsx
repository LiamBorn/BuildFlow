/**
 * <AppFrame> — the first-paint shell (docs/motion-spec.md §2.1) and the session
 * gate §3 asks for.
 *
 * WHY THIS IS NOT A `motion.div`. §2.1 wants the whole authenticated shell to
 * fade, scale 0.985 -> 1 and resolve a 10px blur. Framer animates by writing
 * inline style and LEAVING the finished value there — the shell would rest
 * under `filter: blur(0px)`, and both `filter` and `transform` make an element
 * the containing block for any `position: fixed` descendant. The rail's "Show
 * the sidebar" tab is exactly that. A CSS animation filling `backwards` leaves
 * nothing behind at all, so the shell rests with no filter and no transform;
 * the class comes off once the cascade settles, as §6 asks. Mounting a wrapper element
 * would also break `.app-shell.hs-shell.bf-shell` — the sheet's whole scope.
 *
 * The layer renders nothing. It sits inside the shell beside the other layers
 * and reaches the shell through `closest()`, so App.tsx gains one line.
 */
import { useEffect } from "react";
import { ms, OPENING } from "./tokens";
import { useReducedMotion } from "./useReducedMotion";

/** Set the first time the shell mounts in this tab; §3's "once per session". */
const OPENED = "bf:shell-opened";

const readOpened = () => {
  try {
    return window.sessionStorage.getItem(OPENED) === "1";
  } catch {
    // Safari in private mode throws on sessionStorage. A reader who cannot be
    // remembered sees the opening every time, which is the gentler failure.
    return false;
  }
};

const markOpened = () => {
  try {
    window.sessionStorage.setItem(OPENED, "1");
  } catch {
    /* nothing to do — see readOpened */
  }
};

/**
 * Is this page load the session's first open? Decided ONCE, when the first caller
 * asks, and then held for the life of the module.
 *
 * It cannot be re-read per call, and this is not a micro-optimisation. StrictMode
 * runs every effect twice in development: the first run would mark the session and
 * the second would find it already marked and skip, so the opening would never play
 * on a developer's machine and would play in production — the worst way round. The
 * held answer also keeps the cascade coherent: a panel that mounts late asks the
 * same question the title asked and gets the same answer.
 */
let firstOpen: boolean | null = null;

/**
 * Is the opening RUNNING right now — is `bfm-open` on the shell this moment?
 *
 * Not the same question as `firstOpen`, and the difference is a bug this cost.
 * `firstOpen` is decided once and never changes, but the class comes off when
 * the cascade settles, and the sheet's `--bfm-shift` flips with it. A page
 * opened after that read "the chrome is still going up" from the code while the
 * sheet had already decided otherwise, so its title waited out a beat that had
 * finished — and arrived AFTER its own figures and cards. The two have to be
 * asking the same question, so this is the one both of them ask.
 */
let openingActive = false;

const decideFirstOpen = () => {
  if (firstOpen === null) {
    firstOpen = typeof window === "undefined" ? false : !readOpened();
    // decided during the first render, before AppFrame's effect has run, so a
    // page mounting in that same pass gets the same answer the sheet will give
    openingActive = firstOpen;
  }
  return firstOpen;
};

/** Is `bfm-open` on the shell now? What `--bfm-shift` is keyed on. */
export const openingRunning = () => {
  decideFirstOpen();
  return openingActive;
};

/** Tests only: forget the decision, so a case can set up its own session state. */
export function __resetOpeningGate() {
  firstOpen = null;
  openingActive = false;
}

/** Has the shell already opened in this tab? */
export function useShellOpened(): boolean {
  // Deliberately not state: this is read during render and must not change under
  // a running cascade.
  return !decideFirstOpen();
}

export function AppFrame() {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (typeof document === "undefined") return;
    const shell = document.querySelector<HTMLElement>(".app-shell.hs-shell");
    if (!shell) return;
    if (!decideFirstOpen()) return;
    markOpened();
    if (reduce) return;
    // One class drives the whole opening: the shell's own fade, and the chrome
    // beats the sheet hangs off it. It comes off once the cascade has settled,
    // so nothing rests under `will-change` (§6) and a panel mounted later —
    // a section added back from the picker — arrives without replaying it.
    shell.classList.add("bfm-open");
    const settle = window.setTimeout(() => {
      shell.classList.remove("bfm-open");
      openingActive = false;
    }, ms(OPENING));
    return () => {
      window.clearTimeout(settle);
      shell.classList.remove("bfm-open");
      openingActive = false;
    };
  }, [reduce]);
  return null;
}
