/**
 * The frame every schedule drawer opens in: the dimmed layer, the panel at the right edge, a
 * header that stays and a body that scrolls under it. `JobDrawer` and `MilestoneDrawer` are both
 * this plus their own contents, so the things that are easy to get wrong — where it is painted,
 * the focus trap, the class the shell reads to move the rail — are settled once.
 */
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useModalDialog } from "../hooks";

/** On the body while a drawer is up, so the shell can take the icon rail out of the way. */
const OPEN_CLASS = "bf-job-drawer-open";

/**
 * WHERE THE DRAWER IS PAINTED. It is a modal overlay — `position: fixed`, the whole viewport,
 * z-index 95 so it sits over the top bar and the rail — and it used to be rendered as a child of
 * the page, which put it inside TWO stacking contexts that cap it long before that number is
 * read: `.schedule-page` (z-index 60, `isolation: isolate`) inside `.bfm-page` (z-index 1, skin
 * §79, the page you are leaving). The shell's top bar is z-index 40 in the context above both, so
 * it painted OVER the drawer's header — the title, its second line and the close disc were behind
 * the top bar, which reads as content cut off at the top with no way to scroll to it.
 *
 * So the layer goes where the schedule's other overlays already go: out of the page. Every rule
 * for it is scoped `.app-shell… .gantt-page .gantt-drawer`, so the host is the SHELL rather than
 * the body (the job picker's own backdrop is a body child, and its rules are written `body:has()`
 * for exactly that reason) and the portal carries `.gantt-page` — which is a scope, not a look:
 * the only two rules that name it alone set colour tokens.
 */
function overlayHost(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(".app-shell") ?? document.body;
}

export function ScheduleDrawer({
  title,
  sub,
  closeLabel,
  onClose,
  children
}: {
  title: string;
  sub?: ReactNode;
  /** What the close button announces — "Close job details", "Close milestone details". */
  closeLabel: string;
  onClose: () => void;
  /** The scrolling half, under the header. */
  children: ReactNode;
}) {
  const panel = useModalDialog<HTMLElement>(onClose);
  /* SYNCHRONOUSLY, on the first render: the panel has to mount in ONE commit. Resolving the host
     in a layout effect instead — render null, portal on the next pass — looks harmless and is not:
     `useModalDialog` reads its ref in an effect with `[]` deps and bails when the ref is still
     empty, so the panel arriving a pass late left Escape, the Tab trap and the return of focus to
     the card that opened it all silently dead (pages.test.tsx catches it).
     There is no commit where the shell is missing to resolve against: the drawers are opened by a
     click, long after the shell. */
  const [host] = useState(overlayHost);

  /* the rail is hidden for as long as the drawer is up, and only for that long: the person's own
     Hide choice lives in localStorage (railHidden.ts) and this must not write to it */
  useEffect(() => {
    const root = document.body;
    root.classList.add(OPEN_CLASS);
    return () => {
      if (root.classList.contains(OPEN_CLASS)) root.classList.remove(OPEN_CLASS);
    };
  }, []);

  const drawer = (
    <div className="gantt-drawer-layer" role="presentation">
      <div className="gantt-drawer-backdrop" onClick={onClose} />
      <aside className="gantt-drawer" role="dialog" aria-modal="true" aria-labelledby="gantt-drawer-title" ref={panel}>
        <div className="gantt-drawer-top">
          <div>
            <h2 id="gantt-drawer-title">{title}</h2>
            {sub && <p className="gantt-drawer-sub">{sub}</p>}
          </div>
          <button type="button" className="gantt-drawer-close" aria-label={closeLabel} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {/* The header stays; everything under it scrolls (the notifications drawer's shape). The
            panel used to be the scroller itself AND start at the top of the window, so its title
            and close button sat behind the top bar with no way to reach them. */}
        <div className="gantt-drawer-body">{children}</div>
      </aside>
    </div>
  );

  if (!host) return null;
  return createPortal(<div className="gantt-page gantt-drawer-portal">{drawer}</div>, host);
}
