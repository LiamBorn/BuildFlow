/**
 * The elements of one screen, coming into focus top to bottom (2026-09-22).
 *
 * Each child gets its place in the cascade as `--i`; onboarding.css turns that into a delay,
 * and every one of them blurs and fades in where it already sits — nothing travels. Measured
 * off the reference recording at 40ms: ~160ms per element, ~100ms apart.
 *
 * THE CHILD LIST MUST NOT SHIFT while a screen is open. A wrapper keyed by position is a new
 * element to React the moment something is inserted above it — every field below a validation
 * error would remount, replaying its entrance and dropping the cursor from it. So a screen's
 * errors and hints live INSIDE their field's own child, a child that carries a key keeps it,
 * and only a child that is always there is placed by position.
 */
import { Children, isValidElement, type CSSProperties, type ReactNode } from "react";

export function Beats({ children }: { children: ReactNode }) {
  return (
    <>
      {Children.toArray(children).map((child, index) => (
        <div key={isValidElement(child) && child.key != null ? child.key : index} className="onb-beat" style={{ "--i": index } as CSSProperties}>
          {child}
        </div>
      ))}
    </>
  );
}
