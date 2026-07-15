"use client"

import { useMemo, type CSSProperties, type ElementType } from "react"

interface TextShimmerProps {
  children: string
  as?: ElementType
  className?: string
  duration?: number // seconds
  spread?: number
  baseColor?: string
  highlightColor?: string
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
  highlightColor = "#2f6bff",
}: TextShimmerProps) {
  // Bright-band width scales with the text length, like the original component.
  const dynamicSpread = useMemo(() => children.length * spread, [children, spread])

  const style = {
    "--shimmer-spread": `${dynamicSpread}px`,
    position: "relative",
    display: "inline-block",
    color: "transparent",
    backgroundImage: `linear-gradient(90deg, transparent calc(50% - var(--shimmer-spread)), ${highlightColor}, transparent calc(50% + var(--shimmer-spread))), linear-gradient(${baseColor}, ${baseColor})`,
    backgroundRepeat: "no-repeat, padding-box",
    backgroundSize: "250% 100%, auto",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    animation: `cc-text-shimmer ${duration}s linear infinite`,
  } as CSSProperties

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
  )
}
