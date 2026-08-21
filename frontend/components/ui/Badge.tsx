import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "neutral";

/** Maps semantic variants onto the existing badge-* CSS classes already defined in globals.css. */
const VARIANT_CLASS: Record<BadgeVariant, string> = {
  default: "badge-open",
  success: "badge-won",
  warning: "badge-closed",
  danger: "badge-error",
  info: "badge-processing",
  neutral: "badge-draft",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: "sm" | "md";
  /** Show the leading dot indicator (default true — matches existing .badge::before). */
  dot?: boolean;
}

export function Badge({ variant = "default", size = "md", dot = true, className, style, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn("badge", VARIANT_CLASS[variant], className)}
      style={{
        fontSize: size === "sm" ? "0.65rem" : undefined,
        padding: size === "sm" ? "2px 8px" : undefined,
        // Hide the CSS ::before dot when dot=false — no dedicated class needed for one override.
        ...(dot ? {} : ({ "--badge-dot-display": "none" } as CSSProperties)),
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
