"use client";

import type { CSSProperties, ReactNode } from "react";

/* Ported from the shadcn "DisplayCards" to this codebase's stack (no Tailwind,
   no `cn`), matching the convention used by the other components in
   components/ui: plain markup plus an inline <style> for the parts that cannot
   be inline styles (pseudo-elements, hover states, media queries).

   The original's Tailwind utilities map across as:
     [grid-area:stack] / place-items-center → the .dcx-stack grid
     -skew-y-[8deg], translate-x/y-*        → the transform on [data-pos]
     after:bg-gradient-to-l from-background → .dcx-card::after
     before:bg-background/50 + grayscale    → .dcx-card[data-dim]::before
     bg-muted, text-muted-foreground, …     → the --wx-* design tokens, so the
                                              cards follow light/dark mode.
   The original's `iconClassName` / `titleClassName` were Tailwind color classes;
   here that is one `accent` prop taking any CSS color. */

export interface DisplayCardProps {
  icon?: ReactNode;
  title?: string;
  description?: string;
  date?: string;
  /** Any CSS color (e.g. "var(--wx-g-coral)") — tints the icon chip + title. */
  accent?: string;
  className?: string;
}

export interface DisplayCardsProps {
  cards?: DisplayCardProps[];
  className?: string;
}

const DEFAULT_CARDS: DisplayCardProps[] = [
  { title: "Featured", description: "Discover amazing content", date: "Just now" },
  { title: "Popular", description: "Trending this week", date: "2 days ago" },
  { title: "New", description: "Latest updates and features", date: "Today" }
];

const CSS = `
.dcx-stack {
  --dcx-w: 22rem;
  --dcx-dx: 64px;
  --dcx-dy: 40px;
  /* Themed surface layer. */
  --dcx-surface: color-mix(in srgb, var(--wx-card) 70%, transparent);
  --dcx-border: var(--wx-line);
  --dcx-dim: color-mix(in srgb, var(--wx-bg) 50%, transparent);
  --dcx-gray: 1;
  --dcx-fade: var(--wx-bg);
  --dcx-shadow: none;
  display: grid;
  grid-template-areas: "stack";
  place-items: center;
  animation: dcx-fade-in 700ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.dcx-card {
  grid-area: stack;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 6px;
  width: var(--dcx-w);
  height: 9rem;
  padding: 12px 16px;
  border-radius: 12px;
  border: 2px solid var(--dcx-border);
  background: var(--dcx-surface);
  box-shadow: var(--dcx-shadow);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  text-align: left;
  user-select: none;
  transition:
    transform 700ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 700ms ease,
    filter 700ms ease;
}
/* right-edge gradient fade, so the stack dissolves into the page */
.dcx-card::after {
  content: "";
  position: absolute;
  right: -4px;
  top: -5%;
  width: 20rem;
  height: 110%;
  background: linear-gradient(to left, var(--dcx-fade), transparent);
  pointer-events: none;
}
.dcx-card:hover { border-color: color-mix(in srgb, var(--wx-ink) 22%, transparent); }

/* the cards behind the front one are dimmed + desaturated until hovered */
.dcx-card[data-dim="1"] { filter: grayscale(var(--dcx-gray)); }
.dcx-card[data-dim="1"]::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  outline: 1px solid var(--dcx-border);
  background: var(--dcx-dim);
  transition: opacity 700ms ease;
  z-index: 1;
}
.dcx-card[data-dim="1"]:hover { filter: grayscale(0); }
.dcx-card[data-dim="1"]:hover::before { opacity: 0; }

/* staggered fan + per-card hover lift */
.dcx-card[data-pos="0"] { transform: skewY(-8deg) translate(0, 0); }
.dcx-card[data-pos="1"] { transform: skewY(-8deg) translate(var(--dcx-dx), var(--dcx-dy)); }
.dcx-card[data-pos="2"] { transform: skewY(-8deg) translate(calc(var(--dcx-dx) * 2), calc(var(--dcx-dy) * 2)); }
.dcx-card[data-pos="0"]:hover { transform: skewY(-8deg) translate(0, -40px); }
.dcx-card[data-pos="1"]:hover { transform: skewY(-8deg) translate(var(--dcx-dx), -4px); }
.dcx-card[data-pos="2"]:hover { transform: skewY(-8deg) translate(calc(var(--dcx-dx) * 2), var(--dcx-dy)); }

.dcx-row { display: flex; align-items: center; gap: 8px; position: relative; z-index: 2; }
.dcx-chip {
  display: inline-grid;
  place-items: center;
  padding: 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dcx-accent) 20%, transparent);
  color: var(--dcx-accent);
}
/* Selectors are deliberately specific (.dcx-stack .dcx-card p.dcx-*) so host
   pages that style bare <p> inside their sections — e.g. ".wx-band p" — cannot
   override the card's own typography. */
.dcx-stack .dcx-card p.dcx-title {
  margin: 0;
  max-width: none;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--dcx-accent);
}
.dcx-stack .dcx-card p.dcx-desc {
  margin: 0;
  max-width: none;
  position: relative;
  z-index: 2;
  font-size: 17px;
  line-height: 1.3;
  white-space: nowrap;
  color: var(--wx-ink);
}
.dcx-stack .dcx-card p.dcx-date {
  margin: 0;
  max-width: none;
  position: relative;
  z-index: 2;
  font-size: 13.5px;
  line-height: 1.3;
  color: var(--wx-faint);
}

@keyframes dcx-fade-in { from { opacity: 0; } to { opacity: 1; } }

@media (max-width: 720px) {
  .dcx-stack { --dcx-w: 16.5rem; --dcx-dx: 34px; --dcx-dy: 26px; }
  .dcx-card { height: 8rem; }
  .dcx-stack .dcx-card p.dcx-title,
  .dcx-stack .dcx-card p.dcx-desc { font-size: 15px; }
}
@media (prefers-reduced-motion: reduce) {
  .dcx-stack { animation: none; }
  .dcx-card { transition: none; }
}
`;

export default function DisplayCards({ cards, className }: DisplayCardsProps) {
  const items = cards?.length ? cards : DEFAULT_CARDS;

  return (
    <div className={className ? `dcx-stack ${className}` : "dcx-stack"}>
      <style>{CSS}</style>
      {items.map((card, index) => (
        <div
          key={card.title ?? index}
          className={card.className ? `dcx-card ${card.className}` : "dcx-card"}
          data-pos={index}
          data-dim={index < items.length - 1 ? "1" : undefined}
          style={{ "--dcx-accent": card.accent ?? "var(--wx-g-blue)" } as CSSProperties}
        >
          <div className="dcx-row">
            {card.icon ? <span className="dcx-chip">{card.icon}</span> : null}
            <p className="dcx-title">{card.title}</p>
          </div>
          <p className="dcx-desc">{card.description}</p>
          <p className="dcx-date">{card.date}</p>
        </div>
      ))}
    </div>
  );
}
