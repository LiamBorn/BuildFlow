/**
 * The frame every auth screen shares (2026-09-22) — the question column on the left with the
 * brand at its head, and the framed card on the right showing the actual program.
 *
 * Four pages sit on it: signing in, and the three an emailed link lands on (choosing a new
 * password, confirming an address, accepting an invite). The five-step signup flow draws its
 * own column because it also carries the progress block; everything else is here, which is why
 * the class is `onb-solo` — one screen, not a step of five. `--onb-pane-top` adds the progress
 * block's height back so every heading in the family lands on the same pixel.
 *
 * `progress` is for the one screen that is the flow's TAIL rather than a single screen — the invite
 * step after the plan. Given, the flow's own progress block is drawn (and `onb-solo` dropped, since
 * the block now occupies the space that class adds back), so the bar the person watched fill across
 * the five steps finishes on the same pixel.
 *
 * `paneKey` is what makes a screen CHANGE rather than mutate: React remounts the pane when it
 * changes, so the cascade replays. Pair it with `usePaneSwap` where the old screen should fade
 * out first (it sets `leaving`), or change it on its own where there is nothing to fade — the
 * answer to an emailed token arriving, say.
 */
import type { CSSProperties, ReactNode } from "react";

/** The token an emailed link carries after "?" inside the hash: "#reset-password?token=…". */
export function tokenFromHash(): string {
  if (typeof window === "undefined") return "";
  const query = window.location.hash.split("?")[1] ?? "";
  return new URLSearchParams(query).get("token") ?? "";
}

export function AuthShell({
  id,
  onBack,
  backLabel = "Back to BuildFlow",
  preview,
  paneKey,
  leaving = false,
  progress,
  children
}: {
  /** The hash this page answers, kept as the element id the way each old page had it. */
  id: string;
  onBack: () => void;
  backLabel?: string;
  /** The card on the right — an <OnboardingPreview>, configured by the page. */
  preview: ReactNode;
  paneKey: string;
  leaving?: boolean;
  /** The flow's progress block, for a screen that ends the flow: its label and how full (0–1). */
  progress?: { label: string; fill: number };
  children: ReactNode;
}) {
  return (
    <main className={progress ? "onb" : "onb onb-solo"} id={id} aria-labelledby="onb-title">
      <div className="onb-col">
        <button type="button" className="onb-brand" onClick={onBack} aria-label={backLabel}>
          <img src="/buildflow-logo.png" alt="" />
          <span>BuildFlow</span>
        </button>
        <div className="onb-inner">
          {progress && (
            <div className="onb-progress">
              <span>{progress.label}</span>
              <div className="onb-progress-bar" aria-hidden="true">
                <i style={{ "--onb-fill": `${Math.round(progress.fill * 100)}%` } as CSSProperties} />
              </div>
            </div>
          )}
          <div className={`onb-pane${leaving ? " is-leaving" : ""}`} key={paneKey}>
            {children}
          </div>
        </div>
      </div>
      <aside className="onb-aside">{preview}</aside>
    </main>
  );
}
