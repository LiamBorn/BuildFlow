/* The Dashboard's workspace switcher (2026-09-15), on the reference's pattern: one control
   that names the active workspace by its trade, and a menu with a search box, the person's
   workspaces, and "+ Add workspace" at the foot. A workspace is a whole BuildFlow program --
   its own data, trade, team and trial -- so switching re-enters the app on the other one,
   and creating one hands off to the same onboarding the first workspace answered. */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Plus, Search } from "lucide-react";
import type { WorkspaceSummary, WorkspacesPayload } from "@buildflow/shared";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The one line under a workspace's title: where it stands. */
export function workspaceStanding(workspace: WorkspaceSummary): { label: string; tone: "muted" | "trial" | "ended" | "setup" } {
  // Only a workspace created beside the first can be seen before its onboarding is done -- the
  // first one sends its owner to onboarding instead of the Dashboard (the seeded demo aside).
  if (!workspace.onboardingCompletedAt && workspace.kind === "extra") return { label: "Finish setup", tone: "setup" };
  if (workspace.trialEndsAt) {
    const daysLeft = Math.ceil((new Date(workspace.trialEndsAt).getTime() - Date.now()) / DAY_MS);
    if (daysLeft <= 0) return { label: "Trial ended", tone: "ended" };
    return { label: `Trial · ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`, tone: "trial" };
  }
  return { label: workspace.kind === "home" ? "Your first workspace" : "Workspace", tone: "muted" };
}

export function WorkspaceSwitcher({
  workspaces,
  onSwitch,
  onCreate,
  busy = false,
  error = null
}: {
  workspaces: WorkspacesPayload;
  /** Resolve false to keep the menu open (the reason is in `error`); anything else closes it. */
  onSwitch: (id: string) => Promise<boolean | void> | boolean | void;
  onCreate: () => Promise<boolean | void> | boolean | void;
  busy?: boolean;
  error?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const active = workspaces.workspaces.find((workspace) => workspace.id === workspaces.activeId) ?? workspaces.workspaces[0];
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return workspaces.workspaces;
    return workspaces.workspaces.filter((workspace) => `${workspace.title} ${workspace.name}`.toLowerCase().includes(needle));
  }, [query, workspaces.workspaces]);
  const canAdd = workspaces.remaining > 0;

  // Outside click or Escape closes; opening lands the focus in the search box.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    searchRef.current?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!active) return null;
  const initial = (active.title || "W").slice(0, 1).toUpperCase();

  return (
    <div className={`bfws${open ? " is-open" : ""}`} ref={rootRef}>
      <span className="bfws-eyebrow">Workspace</span>
      <button
        type="button"
        className="bfws-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Workspace: ${active.title}`}
        title={`${active.title} · ${active.name}`}
        disabled={busy}
        onClick={() => {
          setQuery("");
          setOpen((current) => !current);
        }}
      >
        <span className="bfws-tile" aria-hidden="true">
          {initial}
        </span>
        <span className="bfws-trigger-title">{active.title}</span>
        <ChevronDown size={15} aria-hidden="true" className="bfws-chevron" />
      </button>

      {open && (
        <div className="bfws-menu" role="dialog" aria-label="Workspaces" id={menuId}>
          <label className="bfws-search">
            <Search size={14} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              aria-label="Search workspaces"
              placeholder="Search for a workspace"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <p className="bfws-heading">My workspaces</p>
          <ul className="bfws-list">
            {shown.map((workspace) => {
              const standing = workspaceStanding(workspace);
              const isActive = workspace.id === workspaces.activeId;
              return (
                <li key={workspace.id}>
                  <button
                    type="button"
                    className={`bfws-item${isActive ? " is-active" : ""}`}
                    aria-current={isActive ? "true" : undefined}
                    disabled={busy}
                    onClick={async () => {
                      if (isActive) {
                        setOpen(false);
                        return;
                      }
                      // the menu stays up while the switch runs, and stays up with the reason if it fails
                      if ((await onSwitch(workspace.id)) !== false) setOpen(false);
                    }}
                  >
                    <span className="bfws-tile" aria-hidden="true">
                      {(workspace.title || "W").slice(0, 1).toUpperCase()}
                    </span>
                    <span className="bfws-item-text">
                      <span className="bfws-item-title">{workspace.title}</span>
                      <span className="bfws-item-sub">
                        {workspace.name}
                        <span className={`bfws-standing is-${standing.tone}`}>{standing.label}</span>
                      </span>
                    </span>
                    {isActive && <Check size={15} aria-hidden="true" className="bfws-check" />}
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="bfws-empty">No workspace matches “{query.trim()}”.</li>}
          </ul>
          {error && (
            <p className="bfws-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="bfws-add"
            disabled={!canAdd || busy}
            title={
              canAdd
                ? "Set up another workspace: its own trade, team and a 7-day free trial"
                : `You've created all ${workspaces.limit} workspaces this account can have beside its first`
            }
            onClick={async () => {
              if ((await onCreate()) !== false) setOpen(false);
            }}
          >
            <Plus size={15} aria-hidden="true" />
            Add workspace
            <span className="bfws-add-count">
              {workspaces.remaining} of {workspaces.limit} left
            </span>
          </button>
          <p className="bfws-foot">
            <Building2 size={13} aria-hidden="true" />
            Each new workspace starts on a 7-day free trial and asks for its trade and team again.
          </p>
        </div>
      )}
    </div>
  );
}
