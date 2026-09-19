/**
 * <TextReveal> — the signature move (docs/motion-spec.md §2.4).
 *
 * The word sharpens left to right: each character carries its own blur, so the
 * leading ones are crisp while the trailing ones are still soft. In the
 * reference this is the only place a blur is spent on type, and §2.4 keeps it
 * that way — page titles (`h1`) only, never body copy or a label.
 *
 * A screen reader gets the whole string once, from `aria-label` on the wrapper;
 * every character span is `aria-hidden`, so the word is never spelled out.
 */
import { motion } from "framer-motion";
import type { CSSProperties } from "react";
import { BEAT, CHAR_BUDGET, DUR, EASE, MOTION, REDUCED, STAGGER } from "./tokens";
import { useOpening } from "./useOpening";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Seconds between one character and the next: STAGGER.char, unless the string is
 * long enough that a flat step would run past CHAR_BUDGET, in which case it shrinks
 * to fit. Exported so a caller can line something up behind a title, and written
 * onto the wrapper as `--bfm-char-step` so what the component actually used is
 * readable from the DOM rather than inferred. `--bfm-char-at` is the same idea
 * for the beat it starts on: framer keeps that in its variants, where a test
 * can only recompute the formula and pass however the component behaved.
 */
export const charStep = (text: string) => Math.min(STAGGER.char, CHAR_BUDGET / Math.max(1, text.length - 1));

export function TextReveal({
  text,
  delay,
  nested = false,
  className
}: {
  text: string;
  /**
   * Seconds from the cascade's start. Left out — which is the normal case — the
   * title takes its own beat, shifted for whether the chrome has already gone up.
   * §4: no page implements its own entrance timing, and a page title is the one
   * beat every page shares.
   */
  delay?: number;
  /**
   * Is this title INSIDE the card it names, rather than standing over the page?
   *
   * Eleven index pages put their `h1` in the head of the card that holds the
   * table — and a card arrives on the board beat, at opacity 0 until then. A
   * title timed to lead the page therefore wrote itself out completely behind
   * an invisible container, and the effect was never seen once. A nested title
   * writes with the rest of its card's contents instead, which is when there is
   * something there to read.
   */
  nested?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const opening = useOpening();
  const at = delay ?? opening.at(nested ? BEAT.boardContent : BEAT.title);
  // A long name compresses the step rather than running past the rest of the page.
  const step = charStep(text);
  if (reduce) {
    return (
      <motion.span
        className={className}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: REDUCED.fade, delay: at }}
      >
        {text}
      </motion.span>
    );
  }
  return (
    <motion.span
      className={className}
      aria-label={text}
      style={{ "--bfm-char-step": `${step}s`, "--bfm-char-at": `${at}s` } as CSSProperties}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: step, delayChildren: at } } }}
      initial="hidden"
      animate="shown"
    >
      {Array.from(text).map((character, index) => (
        <motion.span
          // The string is fixed for the life of one mount, so the index is stable.
          key={`${character}-${index}`}
          aria-hidden="true"
          // inline-block so translateY lands; a space cannot be inline-block and
          // keep its width, so it stays an ordinary non-breaking character.
          style={{ display: character === " " ? "inline" : "inline-block", whiteSpace: "pre" }}
          variants={{
            hidden: { opacity: 0, y: MOTION.rise / 2, filter: `blur(${MOTION.blurT}px)` },
            shown: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: DUR.base, ease: EASE.out } }
          }}
        >
          {character}
        </motion.span>
      ))}
    </motion.span>
  );
}
