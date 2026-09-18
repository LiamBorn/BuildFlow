/* A figure that counts up to its value on arrival — the Client Desk language's count-up
   (2026-09-15). It takes the TEXT a page already renders — "2", "49%", "$39M", "1,240 hrs" —
   and animates the first run of digits in it, keeping the prefix and the suffix, so every page
   keeps formatting its own figures and nothing here has to know what a figure means.

   It animates only in a real browser with motion allowed. jsdom has no `document.fonts`, and a
   reader who asked for less motion gets the finished value on the first paint — which is also
   what keeps the tests reading the figure they always read. */
import { useEffect, useState } from "react";

const FIGURE = /^([^\d]*?)(-?\d[\d,]*(?:\.\d+)?)([\s\S]*)$/;

const canAnimate = () =>
  typeof document !== "undefined" &&
  "fonts" in document &&
  typeof window !== "undefined" &&
  typeof window.requestAnimationFrame === "function" &&
  !(typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

export function AnimatedFigure({ text, duration = 1100 }: { text: string | number; duration?: number }) {
  const source = String(text);
  const match = FIGURE.exec(source);
  const target = match ? Number(match[2].replace(/,/g, "")) : Number.NaN;
  const decimals = match && match[2].includes(".") ? match[2].split(".")[1].length : 0;
  const grouped = Boolean(match && match[2].includes(","));
  const animated = match !== null && Number.isFinite(target) && canAnimate();
  const [value, setValue] = useState(animated ? 0 : target);

  useEffect(() => {
    if (!animated) {
      setValue(target);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      // easeOutExpo — fast off the line, long settle
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setValue(target * eased);
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target, duration, animated]);

  if (!match || !Number.isFinite(target)) return <>{source}</>;
  const shown = value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
  // The reference's Fig: the currency prefix small and raised, the decimals in the faint ink,
  // the unit after the number at half size. The text is exactly what it was — the wrappers
  // only give the sheet three things to size and tint — so a page reads the figure it always did.
  const [whole, fraction] = shown.split(".");
  return (
    <>
      {match[1] && <i className="af-pre">{match[1]}</i>}
      {whole}
      {fraction !== undefined && <em className="af-frac">.{fraction}</em>}
      {match[3] && <em className="af-unit">{match[3]}</em>}
    </>
  );
}
