/* Ported from 21st.dev "StaggerTestimonials" (shadcn + Tailwind) into this
   codebase's conventions: no Tailwind, no `cn`, no `@/` alias — inline styles
   plus one scoped <style> block, and the shadcn tokens mapped onto the landing
   tokens (primary → --wx-ink, card → --wx-card, border → --wx-line, muted → --wx-faint).

   A fan of clipped-corner cards: the centre card is lifted and inked, the rest
   stagger left and right with a slight alternating tilt. Clicking a card moves
   it to the centre; `move(steps)` is exposed through the ref so the caller's
   own arrows (and ← / → on the focused stage) can drive it. Generic over the
   item type — the caller renders each card's content. */
import { forwardRef, useEffect, useImperativeHandle, useState, type KeyboardEvent, type ReactNode } from "react";

const SQRT_5000 = Math.sqrt(5000);

export type StaggerCardsHandle = { move: (steps: number) => void };

type Slot<T> = { item: T; tempId: number };

export type StaggerCardsProps<T> = {
  items: T[];
  keyOf: (item: T) => string;
  renderCard: (item: T, isCenter: boolean) => ReactNode;
  /** Card side in px at ≥640px; phones get `mobileCardSize`. */
  cardSize?: number;
  mobileCardSize?: number;
  height?: number;
  ariaLabel?: string;
  /** Called when a card becomes the centre (click or move). */
  onCenterChange?: (item: T) => void;
  /** Optional layer painted behind each card's content (a gradient, an image). The card's own fill becomes a veil over it. */
  renderBackdrop?: (item: T, isCenter: boolean) => ReactNode;
  className?: string;
};

function StaggerCardsInner<T>(
  { items, keyOf, renderCard, cardSize = 365, mobileCardSize = 290, height = 600, ariaLabel = "Cards", onCenterChange, renderBackdrop, className = "" }: StaggerCardsProps<T>,
  ref: React.ForwardedRef<StaggerCardsHandle>
) {
  const [size, setSize] = useState(cardSize);
  const [list, setList] = useState<Slot<T>[]>(() => items.map((item, i) => ({ item, tempId: i })));

  // fresh items → fresh deck (the caller's data changed, not the user's position)
  useEffect(() => {
    setList(items.map((item, i) => ({ item, tempId: i })));
  }, [items]);

  const centerIndexFor = (length: number) => (length % 2 ? (length + 1) / 2 : length / 2);

  const move = (steps: number) => {
    setList((current) => {
      const next = [...current];
      if (steps > 0) {
        for (let i = steps; i > 0; i -= 1) {
          const first = next.shift();
          if (!first) return current;
          next.push({ ...first, tempId: Math.random() });
        }
      } else {
        for (let i = steps; i < 0; i += 1) {
          const last = next.pop();
          if (!last) return current;
          next.unshift({ ...last, tempId: Math.random() });
        }
      }
      const center = next[centerIndexFor(next.length)];
      if (center && onCenterChange) queueMicrotask(() => onCenterChange(center.item));
      return next;
    });
  };
  useImperativeHandle(ref, () => ({ move }), []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const update = () => setSize(media.matches ? cardSize : mobileCardSize);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [cardSize, mobileCardSize]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
    }
  };

  const centerIndex = centerIndexFor(list.length);

  return (
    <div
      className={`stagger-cards ${className}`.trim()}
      style={{ position: "relative", width: "100%", height, overflow: "hidden" }}
      role="region"
      aria-label={ariaLabel}
      aria-roledescription="carousel"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <style>{`
        .stagger-cards { outline: none; }
        .stagger-cards:focus-visible { box-shadow: inset 0 0 0 2px var(--wx-blue, #2f6bff); }
        .stagger-card {
          position: absolute; left: 50%; top: 50%; cursor: pointer; box-sizing: border-box; isolation: isolate;
          padding: 32px; border: 2px solid var(--wx-line, #d7dbe2);
          background: var(--wx-card, #fff); color: var(--wx-ink, #1c1c1a);
          transition: transform 0.5s ease-in-out, background 0.5s ease-in-out, border-color 0.5s ease-in-out, color 0.5s ease-in-out, box-shadow 0.5s ease-in-out;
          clip-path: polygon(50px 0%, calc(100% - 50px) 0%, 100% 50px, 100% 100%, calc(100% - 50px) 100%, 50px 100%, 0 100%, 0 0);
        }
        .stagger-card:hover { border-color: rgba(28, 28, 26, 0.45); }
        .stagger-card.is-center { z-index: 10; background: var(--wx-ink, #1c1c1a); color: #fdfcf9; border-color: var(--wx-ink, #1c1c1a); cursor: default; }
        .stagger-card .stagger-corner { position: absolute; display: block; transform-origin: top right; transform: rotate(45deg); background: var(--wx-line, #d7dbe2); }
        .stagger-card.is-center .stagger-corner { background: rgba(253, 252, 249, 0.35); }
        /* with a backdrop the card's fill becomes a veil: paper for the fan, ink for the centre */
        .stagger-card.has-backdrop { background: transparent; }
        .stagger-card.has-backdrop.is-center { background: transparent; }
        .stagger-card-backdrop { position: absolute; inset: 0; z-index: -2; overflow: hidden; pointer-events: none; }
        .stagger-card-veil { position: absolute; inset: 0; z-index: -1; pointer-events: none; background: rgba(250, 248, 238, 0.6); transition: background 0.5s ease-in-out; }
        .stagger-card.is-center .stagger-card-veil { background: rgba(22, 20, 28, 0.8); }
        @media (prefers-reduced-motion: reduce) { .stagger-card { transition: none; } }
      `}</style>
      {list.map((slot, index) => {
        const position = index - centerIndex;
        const isCenter = position === 0;
        return (
          <div
            key={slot.tempId}
            className={`stagger-card${isCenter ? " is-center" : ""}${renderBackdrop ? " has-backdrop" : ""}`}
            data-position={position}
            role="group"
            aria-roledescription="slide"
            aria-current={isCenter ? "true" : undefined}
            onClick={() => {
              if (!isCenter) move(position);
            }}
            style={{
              width: size,
              height: size,
              transform: `translate(-50%, -50%) translateX(${(size / 1.5) * position}px) translateY(${isCenter ? -65 : position % 2 ? 15 : -15}px) rotate(${isCenter ? 0 : position % 2 ? 2.5 : -2.5}deg)`,
              boxShadow: isCenter ? "0px 8px 0px 4px var(--wx-line, #d7dbe2)" : "0px 0px 0px 0px transparent"
            }}
          >
            {renderBackdrop && (
              <>
                <div className="stagger-card-backdrop" aria-hidden="true">
                  {renderBackdrop(slot.item, isCenter)}
                </div>
                <div className="stagger-card-veil" aria-hidden="true" />
              </>
            )}
            <span className="stagger-corner" aria-hidden="true" style={{ right: -2, top: 48, width: SQRT_5000, height: 2 }} />
            {renderCard(slot.item, isCenter)}
            <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              {keyOf(slot.item)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const StaggerCards = forwardRef(StaggerCardsInner) as <T>(
  props: StaggerCardsProps<T> & { ref?: React.ForwardedRef<StaggerCardsHandle> }
) => ReactNode;
