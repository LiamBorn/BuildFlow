/**
 * <StaggerGroup> / <StaggerItem> — docs/motion-spec.md §2.3.
 *
 * The parent orchestrates; the children carry no timing of their own. The group
 * takes a STAGGER token, never a number, so "the nav icons" and "the cards in a
 * row" are told apart by name rather than by two nearly-equal literals.
 */
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { DUR, EASE, MOTION, REDUCED, STAGGER } from "./tokens";
import { useReducedMotion } from "./useReducedMotion";

type StaggerToken = keyof typeof STAGGER;

const group = (each: number, delay: number) => ({
  hidden: {},
  shown: { transition: { staggerChildren: each, delayChildren: delay } }
});

const item = (y: number, blur: boolean) => ({
  hidden: { opacity: 0, y, filter: blur ? `blur(${MOTION.blur}px)` : "blur(0px)" },
  shown: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: DUR.base, ease: EASE.out } }
});

const itemReduced = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: REDUCED.fade } }
};

export function StaggerGroup({
  children,
  stagger,
  delay = 0,
  scale = 1,
  className,
  as = "div",
  role,
  ariaLabel
}: {
  children: ReactNode;
  /** which STAGGER token spaces the children */
  stagger: StaggerToken;
  /** seconds before the first child — a BEAT */
  delay?: number;
  /** §3 asks the rail for `STAGGER.icon` x1.5; this is that multiplier */
  scale?: number;
  className?: string;
  as?: "div" | "nav" | "ul" | "section" | "header";
  role?: string;
  ariaLabel?: string;
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  // A reader who asked for less motion gets no stagger at all (§1) — every child
  // fades together, so `staggerChildren` goes to zero rather than to something small.
  const each = reduce ? 0 : STAGGER[stagger] * scale;
  return (
    <Tag className={className} role={role} aria-label={ariaLabel} variants={group(each, delay)} initial="hidden" animate="shown">
      {children}
    </Tag>
  );
}

export function StaggerItem({
  children,
  y = MOTION.rise,
  blur = true,
  className,
  as = "div"
}: {
  children: ReactNode;
  y?: number;
  blur?: boolean;
  className?: string;
  as?: "div" | "li" | "span" | "section";
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag className={className} variants={reduce ? itemReduced : item(y, blur)}>
      {children}
    </Tag>
  );
}
