/**
 * The program's motion surface — docs/motion-spec.md §7.
 *
 * Feature code imports from here and nowhere else. Nothing outside this folder
 * writes a duration, an easing or a stagger; `tests/motion-language.test.ts`
 * fails the sheet for a literal timing and `tests/motion-tokens.test.ts` fails
 * this folder for drifting from the sheet.
 */
export {
  BEAT,
  BOARD_RANK_CAP,
  CHAR_BUDGET,
  DUR,
  EASE,
  MOTION,
  OPENING,
  OVERLAY,
  REDUCED,
  ROW,
  STAGGER,
  TRAIL,
  cssEase,
  cssVariables,
  ms
} from "./tokens";
export { useReducedMotion } from "./useReducedMotion";
export { Reveal } from "./Reveal";
export { StaggerGroup, StaggerItem } from "./Stagger";
export { TextReveal, charStep } from "./TextReveal";
export { CountUp } from "./CountUp";
export { useCountUp, canCountUp } from "./useCountUp";
export { AppFrame, useShellOpened, openingRunning, __resetOpeningGate } from "./AppFrame";
export { useOpening } from "./useOpening";
