/**
 * Interactive hover links — the 21st.dev component ported to plain CSS
 * (interactive-hover-links.css) on the framer-motion the client already has.
 * Each row is a big heading whose letters fan out on hover while a picture
 * floats after the pointer and an arrow slides in. The landing page's side menu
 * uses the single-row form (`InteractiveHoverLink`, a button that opens its
 * section); `InteractiveHoverLinks` keeps the original list-of-anchors form.
 */
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useRef, type MouseEvent, type ReactNode } from "react";

export type InteractiveHoverLinkItem = { heading: string; subheading: string; imgSrc: string; href: string };

export type InteractiveHoverLinkProps = {
  heading: string;
  subheading: string;
  imgSrc: string;
  /** Renders an anchor when given; a button otherwise. */
  href?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  /** For a row that opens something below it — sets aria-expanded and the `is-expanded` class. */
  expanded?: boolean;
  controlsId?: string;
  className?: string;
  /** Replaces the sliding arrow. */
  trailing?: ReactNode;
  /** Smaller type, picture and arrow with a quicker letter stagger — for rows inside a menu panel. */
  compact?: boolean;
  /** ARIA role for the row, e.g. "menuitem" inside a menu. */
  role?: string;
};

const spring = { type: "spring" as const };

export function InteractiveHoverLink({
  heading,
  subheading,
  imgSrc,
  href,
  onClick,
  expanded,
  controlsId,
  className,
  trailing,
  compact = false,
  role
}: InteractiveHoverLinkProps) {
  const ref = useRef<HTMLElement | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseXSpring = useSpring(x);
  const mouseYSpring = useSpring(y);
  const top = useTransform(mouseYSpring, [0.5, -0.5], ["40%", "60%"]);
  const left = useTransform(mouseXSpring, [0.5, -0.5], ["60%", "40%"]);

  const handleMouseMove = (event: MouseEvent<HTMLElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((event.clientX - rect.left) / rect.width - 0.5);
    y.set((event.clientY - rect.top) / rect.height - 0.5);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };
  const setRef = (node: HTMLElement | null) => {
    ref.current = node;
  };

  const body = (
    <>
      <div className="ihl-text">
        <motion.span
          variants={{ initial: { x: 0 }, whileHover: { x: -16 } }}
          transition={
            compact
              ? { type: "spring", staggerChildren: 0.03, delayChildren: 0.1 }
              : { type: "spring", staggerChildren: 0.075, delayChildren: 0.25 }
          }
          className="ihl-heading"
        >
          {heading.split("").map((letter, index) =>
            // a bare space stays a text node so a long heading can still wrap there
            letter === " " ? (
              " "
            ) : (
              <motion.span variants={{ initial: { x: 0 }, whileHover: { x: 16 } }} transition={spring} className="ihl-letter" key={index}>
                {letter}
              </motion.span>
            )
          )}
        </motion.span>
        <span className="ihl-subheading">{subheading}</span>
      </div>

      <motion.img
        style={{ top, left, translateX: "-10%", translateY: "-50%" }}
        variants={{ initial: { scale: 0, rotate: "-12.5deg" }, whileHover: { scale: 1, rotate: "12.5deg" } }}
        transition={spring}
        src={imgSrc}
        className="ihl-image"
        alt=""
        aria-hidden="true"
      />

      <div className="ihl-trailing">
        {trailing ?? (
          <motion.div
            variants={{ initial: { x: "100%", opacity: 0 }, whileHover: { x: "0%", opacity: 1 } }}
            transition={spring}
            className="ihl-arrow"
          >
            <ArrowRight />
          </motion.div>
        )}
      </div>
    </>
  );

  const classes = ["ihl-link", compact ? "is-compact" : "", expanded ? "is-expanded" : "", className ?? ""].filter(Boolean).join(" ");
  const shared = {
    onMouseMove: handleMouseMove,
    onMouseLeave: reset,
    initial: "initial",
    whileHover: "whileHover",
    className: classes,
    role
  };

  if (href) {
    return (
      <motion.a ref={setRef} href={href} onClick={onClick} {...shared}>
        {body}
      </motion.a>
    );
  }
  return (
    <motion.button ref={setRef} type="button" onClick={onClick} aria-expanded={expanded} aria-controls={controlsId} {...shared}>
      {body}
    </motion.button>
  );
}

/** The original list form: a section of anchor rows. */
export function InteractiveHoverLinks({ links = INTERACTIVE_LINKS }: { links?: InteractiveHoverLinkItem[] }) {
  return (
    <section className="ihl-section">
      <div className="ihl-list">
        {links.map((link) => (
          <InteractiveHoverLink key={link.heading} {...link} />
        ))}
      </div>
    </section>
  );
}

export const INTERACTIVE_LINKS: InteractiveHoverLinkItem[] = [
  {
    heading: "Services",
    subheading: "Discover what we offer",
    imgSrc: "https://cdn.21st.dev/assets/mirror/6a/6a8dafee634763ec77f3660430e416b605bc385b48a93106a5960c37f36d782a.jpg",
    href: "#"
  },
  {
    heading: "Team",
    subheading: "Meet the amazing people behind it",
    imgSrc: "https://cdn.21st.dev/assets/mirror/f3/f306e609793c7aee5e89377d8af8325e3cf2117da7a6b8713587bdc7116b8884.jpg",
    href: "#"
  },
  {
    heading: "Projects",
    subheading: "Explore our recent work",
    imgSrc: "https://cdn.21st.dev/assets/mirror/18/18b91c11d5e76aef735bb1ed896ac562c4058dfaaf6a110219cea15088942569.jpg",
    href: "#"
  },
  {
    heading: "Careers",
    subheading: "Join our growing team",
    imgSrc: "https://cdn.21st.dev/assets/mirror/8b/8bd175d566cc60ee871979454d299f373bf1423c52ea503aa5e9d27be674db1b.jpg",
    href: "#"
  },
  {
    heading: "Playground",
    subheading: "Fun experiments and side projects",
    imgSrc: "https://cdn.21st.dev/assets/mirror/82/82c9d1289f610153dcba6e3ba8f8e5a1a3f4978043303a5d1df36d50079dc2cf.jpg",
    href: "#"
  }
];
