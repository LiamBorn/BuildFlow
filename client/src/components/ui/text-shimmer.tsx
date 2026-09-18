"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ElementType } from "react";

interface TextShimmerProps {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number; // seconds
  spread?: number;
  baseColor?: string;
  highlightColor?: string;
}

/**
 * Reads `prefers-reduced-motion` and SUBSCRIBES to it, rather than sampling it once.
 * A one-time read in a `useState` initializer misses a reader who changes the system
 * setting while the app is open, and this component's animation is an infinite loop.
 * SSR-safe and jsdom-safe: returns false whenever matchMedia is absent, which is what
 * keeps every existing test on its current branch.
 */
function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(query.matches);
    const onChange = () => setReduce(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduce;
}

// Ported from the shadcn / framer-motion "TextShimmer" to this codebase's stack
// (no Tailwind, no `cn`), matching the convention used by the other component in
// components/ui: inline styles plus an inline <style> for the keyframes. The
// shimmer is a gradient highlight swept across `background-clip: text`, which is
// visually identical to the original's animated backgroundPosition.
export function TextShimmer({
  children,
  as: Component = "span",
  className = "",
  duration = 2,
  spread = 2,
  baseColor = "#9aa2ad",
  highlightColor = "var(--bf-color-accent, #1c1c1c)"
}: TextShimmerProps) {
  // Bright-band width scales with the text length, like the original component.
  const dynamicSpread = useMemo(() => children.length * spread, [children, spread]);
  const reduceMotion = usePrefersReducedMotion();

  // The animation shorthand lives in the INLINE style object, which is the whole
  // reason this guard has to be in JavaScript: an inline declaration cannot be
  // overridden by a @media (prefers-reduced-motion: reduce) rule in any stylesheet
  // without !important, so this was the one infinite loop in the product that no CSS
  // could stop. It is live -- BreezeAssistant's "generating" line -- so a reader who
  // asked for reduced motion watched a highlight sweep across that text forever.
  //
  // Under reduce the highlight layer is dropped entirely rather than merely frozen.
  // Freezing it would leave the sweep parked wherever background-position happened to
  // start and paint a static streak across the words, because `color` is transparent
  // and the text is painted by the gradient. Dropping it paints flat baseColor, so
  // the text reads normally and nothing moves.
  const paintedByGradient: CSSProperties = reduceMotion
    ? { color: baseColor }
    : ({
        "--shimmer-spread": `${dynamicSpread}px`,
        color: "transparent",
        backgroundImage: `linear-gradient(90deg, transparent calc(50% - var(--shimmer-spread)), ${highlightColor}, transparent calc(50% + var(--shimmer-spread))), linear-gradient(${baseColor}, ${baseColor})`,
        backgroundRepeat: "no-repeat, padding-box",
        backgroundSize: "250% 100%, auto",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        animation: `cc-text-shimmer ${duration}s linear infinite`
      } as CSSProperties);

  const style = {
    position: "relative",
    display: "inline-block",
    ...paintedByGradient
  } as CSSProperties;

  return (
    <>
      <style>{`
        @keyframes cc-text-shimmer {
          0% { background-position: 100% center; }
          100% { background-position: 0% center; }
        }
      `}</style>
      <Component className={className} style={style}>
        {children}
      </Component>
    </>
  );
}
