"use client";
import { forwardRef, type HTMLAttributes } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { springTransition } from "@/lib/utils/motion";

export type CardPadding = "none" | "sm" | "md" | "lg";

const PADDING: Record<CardPadding, string> = { none: "0", sm: "16px", md: "24px", lg: "32px" };

/** Omit handlers whose signatures Framer Motion overrides (drag/animation events). */
type DivPropsSafe = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration"
>;

export interface CardProps extends DivPropsSafe {
  /** Adds a hover lift + brighter glass on interaction (use for clickable cards). */
  hoverable?: boolean;
  padding?: CardPadding;
  /** Use the accent variant (gradient border) for a highlighted/featured card. */
  accent?: boolean;
}

/**
 * Card primitive — wraps the existing .card / .card-accent CSS (glassmorphism, specular top
 * edge, theme-aware) so pages stop reimplementing card styles inline.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { hoverable, padding = "md", accent, className, style, children, ...rest },
  ref
) {
  return (
    <motion.div
      ref={ref}
      className={cn(accent ? "card-accent" : "card", className)}
      style={{ padding: PADDING[padding], ...style }}
      whileHover={hoverable ? { y: -2 } : undefined}
      transition={springTransition}
      {...rest}
    >
      {children}
    </motion.div>
  );
});
