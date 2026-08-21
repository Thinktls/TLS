import type { Variants, Transition } from "framer-motion";

/** Spring used for tactile UI feedback (buttons, cards, toggles) — feels responsive, not bouncy. */
export const springTransition: Transition = { type: "spring", stiffness: 400, damping: 28 };
export const springSoft: Transition = { type: "spring", stiffness: 260, damping: 24 };

/** Page/section entrance — fade + rise. Use with `initial="hidden" animate="visible"`. */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] } },
};

/** Stagger wrapper for a list of cards — apply to the parent, fadeInUp to each child. */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

/** Modal/dialog entrance — scale + fade with a spring settle. */
export const modalContent: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: springSoft },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.15 } },
};

export const modalBackdrop: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

/** Bottom-sheet entrance (mobile). */
export const sheetContent: Variants = {
  hidden: { opacity: 0, y: "100%" },
  visible: { opacity: 1, y: 0, transition: springSoft },
  exit: { opacity: 0, y: "100%", transition: { duration: 0.2 } },
};

/** Standard tap/hover feedback for interactive elements. Spread onto a motion component. */
export const tapFeedback = { whileTap: { scale: 0.98 }, transition: springTransition };
export const hoverLift = { whileHover: { y: -2 }, whileTap: { scale: 0.99 }, transition: springTransition };
