/**
 * <CountUp> — docs/motion-spec.md §2.5, the component form.
 *
 * Formatting stays with the caller: it hands in an `Intl.NumberFormat` and the
 * figure is run through it on every frame, so a currency keeps its symbol and
 * its separators all the way up rather than arriving at them on the last frame.
 *
 * The digits are set `tabular-nums` so the count does not shift the layout
 * under itself. Where a page already renders a formatted string, use
 * `components/ui/animated-figure.tsx` instead — it is this engine, reading the
 * format off the text the page wrote.
 */
import { useCountUp } from "./useCountUp";
import { DUR } from "./tokens";

const PLAIN = new Intl.NumberFormat("en-US");

export function CountUp({
  value,
  format = PLAIN,
  from = 0,
  duration = DUR.count,
  className
}: {
  value: number;
  format?: Intl.NumberFormat;
  from?: number;
  duration?: number;
  className?: string;
}) {
  const shown = useCountUp(value, { duration, from });
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {format.format(shown)}
    </span>
  );
}
