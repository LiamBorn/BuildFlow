/**
 * <Reveal> — the workhorse (docs/motion-spec.md §2.2).
 *
 * opacity 0→1, y +16→0, blur(10px)→0, over DUR.base on EASE.out, once.
 *
 * `once` is not framer's viewport `once` — nothing here waits to be scrolled to.
 * §9.3 says an entrance runs once per mount and never on a data update, so the
 * animation is keyed to the mount and a re-render with new numbers does not
 * replay it.
 */
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { DUR, EASE, MOTION, REDUCED } from "./tokens";
import { useReducedMotion } from "./useReducedMotion";

export function Reveal({
  children,
  delay = 0,
  y = MOTION.rise,
  blur = true,
  className,
  as = "div"
}: {
  children: ReactNode;
  /** seconds from the cascade's start — a BEAT, never a literal */
  delay?: number;
  y?: number;
  blur?: boolean;
  className?: string;
  as?: "div" | "section" | "header" | "span" | "li";
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  if (reduce) {
    return (
      <Tag className={className} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: REDUCED.fade }}>
        {children}
      </Tag>
    );
  }
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y, filter: blur ? `blur(${MOTION.blur}px)` : "blur(0px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: DUR.base, ease: EASE.out, delay }}
    >
      {children}
    </Tag>
  );
}
