"use client";

/**
 * LocationMap — the 21st.dev "expand-map" card, ported to this codebase's stack.
 *
 * The original is Tailwind + shadcn tokens; there is no Tailwind here, so the
 * classes became plain `lm-*` rules in expand-map.css written against the app's
 * own palette (--hsx-*). framer-motion is a real dependency, so every motion
 * value is the original's: the 3D tilt (spring 300/30 over a ±8° transform), the
 * expand (spring 400/35), the road path draws, the staggered building fade-ins
 * and the pin drop (spring 400/20, delay 0.3).
 *
 * Two deliberate differences, both because these cards live in a responsive grid
 * of job sites rather than alone on a page:
 *  - the card fills its grid cell and animates height only, so expanding one card
 *    never reflows the row;
 *  - the accent is per-card (`accent`), so a site's pin and underline carry its
 *    own status colour instead of one fixed emerald.
 */

import { useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";

export interface LocationMapProps {
  location?: string;
  coordinates?: string;
  /** The headline number: how many jobs sit at this location. */
  jobCount?: number;
  /** Status or any short line under the count. */
  meta?: ReactNode;
  /** Pin, underline and count colour. Defaults to the app's blue. */
  accent?: string;
  /** Shows the "Live" chip. */
  live?: boolean;
  selected?: boolean;
  className?: string;
  /** Fires on click alongside the expand toggle (select the site in the page). */
  onSelect?: () => void;
}

/* `opacity` cannot live in the style prop: framer animates opacity 0 → 1 on mount
   and would overwrite it, so each block carries its own fill alpha instead. */
const BUILDINGS: Array<{ style: CSSProperties; delay: number }> = [
  { style: { top: "40%", left: "10%", width: "15%", height: "20%", ["--lm-fill" as string]: "0.3" }, delay: 0.5 },
  { style: { top: "15%", left: "35%", width: "12%", height: "15%", ["--lm-fill" as string]: "0.25" }, delay: 0.6 },
  { style: { top: "70%", left: "75%", width: "18%", height: "18%", ["--lm-fill" as string]: "0.28" }, delay: 0.7 },
  { style: { top: "20%", right: "10%", width: "10%", height: "25%", ["--lm-fill" as string]: "0.22" }, delay: 0.55 },
  { style: { top: "55%", left: "5%", width: "8%", height: "12%", ["--lm-fill" as string]: "0.2" }, delay: 0.65 },
  { style: { top: "8%", left: "75%", width: "14%", height: "10%", ["--lm-fill" as string]: "0.22" }, delay: 0.75 }
];
export function LocationMap({
  location = "San Francisco, CA",
  coordinates = "37.7749° N, 122.4194° W",
  jobCount,
  meta,
  accent = "var(--bf-color-accent, #1c1c1c)",
  live = true,
  selected = false,
  className,
  onSelect
}: LocationMapProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useTransform(mouseY, [-50, 50], [8, -8]);
  const rotateY = useTransform(mouseX, [-50, 50], [-8, 8]);

  // framer-motion does NOT read prefers-reduced-motion on its own, and this component
  // is the densest piece of choreography in the product: a pointer-tracked tilt, an
  // expand spring, eleven pathLength road draws, six staggered building fades and a pin
  // drop, about twenty animations in all. expand-map.css's only reduced-motion block
  // kills a single .lm-surface transition, so everything else still ran.
  // `zero` collapses any transition to an instant one. The map still renders COMPLETE --
  // every road at full pathLength, every building at full opacity, the pin in place --
  // which is the correct reduced-motion behaviour: the content is never withheld, only
  // the choreography stops.
  const reduceMotion = useReducedMotion() === true;
  const zero = { duration: 0 };

  const springRotateX = useSpring(rotateX, reduceMotion ? zero : { stiffness: 300, damping: 30 });
  const springRotateY = useSpring(rotateY, reduceMotion ? zero : { stiffness: 300, damping: 30 });

  const handleMouseMove = (event: MouseEvent) => {
    // the tilt is zeroed at the source, so the motion values never leave 0 and the
    // spring has nothing to chase
    if (reduceMotion) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouseX.set(event.clientX - (rect.left + rect.width / 2));
    mouseY.set(event.clientY - (rect.top + rect.height / 2));
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
    setIsHovered(false);
  };

  const toggle = () => {
    setIsExpanded((current) => !current);
    onSelect?.();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle();
  };

  return (
    <motion.div
      ref={containerRef}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      aria-label={`${location}${jobCount === undefined ? "" : `, ${jobCount} job${jobCount === 1 ? "" : "s"}`}`}
      className={`lm-card${selected ? " is-selected" : ""}${className ? ` ${className}` : ""}`}
      style={{ perspective: 1000, ["--lm-accent" as string]: accent }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={toggle}
      onKeyDown={handleKeyDown}
    >
      <motion.div
        className="lm-surface"
        style={{ rotateX: springRotateX, rotateY: springRotateY, transformStyle: "preserve-3d" }}
        animate={{ height: isExpanded ? 280 : 140 }}
        transition={reduceMotion ? zero : { type: "spring", stiffness: 400, damping: 35 }}
      >
        <div className="lm-wash" />

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              className="lm-street"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? zero : { duration: 0.4, delay: 0.1 }}
            >
              <div className="lm-street-ground" />

              <svg className="lm-street-svg" preserveAspectRatio="none">
                {/* main roads */}
                {[35, 65].map((y, index) => (
                  <motion.line
                    key={`main-h-${y}`}
                    x1="0%"
                    y1={`${y}%`}
                    x2="100%"
                    y2={`${y}%`}
                    className="lm-road-main"
                    strokeWidth="4"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={reduceMotion ? zero : { duration: 0.8, delay: 0.2 + index * 0.1 }}
                  />
                ))}
                {[30, 70].map((x, index) => (
                  <motion.line
                    key={`main-v-${x}`}
                    x1={`${x}%`}
                    y1="0%"
                    x2={`${x}%`}
                    y2="100%"
                    className="lm-road-second"
                    strokeWidth="3"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={reduceMotion ? zero : { duration: 0.6, delay: 0.4 + index * 0.1 }}
                  />
                ))}
                {/* side streets */}
                {[20, 50, 80].map((y, index) => (
                  <motion.line
                    key={`h-${y}`}
                    x1="0%"
                    y1={`${y}%`}
                    x2="100%"
                    y2={`${y}%`}
                    className="lm-road-thin"
                    strokeWidth="1.5"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={reduceMotion ? zero : { duration: 0.5, delay: 0.6 + index * 0.1 }}
                  />
                ))}
                {[15, 45, 55, 85].map((x, index) => (
                  <motion.line
                    key={`v-${x}`}
                    x1={`${x}%`}
                    y1="0%"
                    x2={`${x}%`}
                    y2="100%"
                    className="lm-road-thin"
                    strokeWidth="1.5"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={reduceMotion ? zero : { duration: 0.5, delay: 0.7 + index * 0.1 }}
                  />
                ))}
              </svg>

              {BUILDINGS.map((building, index) => (
                <motion.div
                  key={`building-${index}`}
                  className="lm-building"
                  style={building.style}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={reduceMotion ? zero : { duration: 0.4, delay: building.delay }}
                />
              ))}

              <motion.div
                className="lm-pin"
                initial={{ scale: 0, y: -20 }}
                animate={{ scale: 1, y: 0 }}
                transition={reduceMotion ? zero : { type: "spring", stiffness: 400, damping: 20, delay: 0.3 }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="var(--lm-accent)" />
                  <circle cx="12" cy="9" r="2.5" fill="#fff" />
                </svg>
              </motion.div>

              <div className="lm-street-fade" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* the grid only reads while the card is collapsed */}
        <motion.div className="lm-grid" animate={{ opacity: isExpanded ? 0 : 0.05 }} transition={reduceMotion ? zero : { duration: 0.3 }}>
          <svg width="100%" height="100%">
            <defs>
              <pattern id="lm-grid-pattern" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#14203a" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#lm-grid-pattern)" />
          </svg>
        </motion.div>

        <div className="lm-body">
          <div className="lm-top">
            <motion.div className="lm-count" animate={{ opacity: isExpanded ? 0 : 1 }} transition={reduceMotion ? zero : { duration: 0.3 }}>
              {jobCount !== undefined && (
                <>
                  <strong>{jobCount}</strong>
                  <span>{jobCount === 1 ? "job" : "jobs"}</span>
                </>
              )}
            </motion.div>

            {live && (
              <motion.div className="lm-live" animate={{ scale: isHovered ? 1.05 : 1 }} transition={reduceMotion ? zero : { duration: 0.2 }}>
                <i />
                <span>Live</span>
              </motion.div>
            )}
          </div>

          <div className="lm-bottom">
            <motion.h3
              className="lm-title"
              animate={{ x: isHovered ? 4 : 0 }}
              transition={reduceMotion ? zero : { type: "spring", stiffness: 400, damping: 25 }}
              title={location}
            >
              {location}
            </motion.h3>

            {meta && <p className="lm-meta">{meta}</p>}

            <AnimatePresence>
              {isExpanded && (
                <motion.p
                  className="lm-coords tnum"
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  transition={reduceMotion ? zero : { duration: 0.25 }}
                >
                  {coordinates}
                </motion.p>
              )}
            </AnimatePresence>

            <motion.div
              className="lm-rule"
              initial={{ scaleX: 0, originX: 0 }}
              animate={{ scaleX: isHovered || isExpanded ? 1 : 0.3 }}
              transition={reduceMotion ? zero : { duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>
      </motion.div>

      <motion.p
        className="lm-hint"
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered && !isExpanded ? 1 : 0, y: isHovered ? 0 : 4 }}
        transition={reduceMotion ? zero : { duration: 0.2 }}
        aria-hidden="true"
      >
        Click to expand
      </motion.p>
    </motion.div>
  );
}
