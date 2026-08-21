"use client";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { springTransition } from "@/lib/utils/motion";
import { Icon, type IconName } from "@/components/icons";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "btn-brand",
  secondary: "btn-ghost",
  ghost: "btn-ghost",
  danger: "btn-danger",
  success: "btn-brand",
};

const SIZE_STYLE: Record<ButtonSize, { padding: string; fontSize: string }> = {
  sm: { padding: "6px 14px", fontSize: "0.8rem" },
  md: { padding: "9px 20px", fontSize: "0.875rem" },
  lg: { padding: "12px 26px", fontSize: "0.95rem" },
};

interface BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Render as an icon-only button (adds aria-label requirement + square padding). */
  icon?: IconName;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
  children?: ReactNode;
  className?: string;
}

/** Event handlers whose signatures Framer Motion overrides (drag/animation events). */
type MotionConflictKeys = "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration";

interface ButtonAsButton
  extends BaseProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps | MotionConflictKeys> {
  href?: undefined;
}
interface ButtonAsLink extends BaseProps {
  href: string;
  target?: string;
  rel?: string;
}

export type ButtonProps = ButtonAsButton | ButtonAsLink;

/**
 * Primary button primitive. Wraps the existing .btn-brand / .btn-ghost / .btn-danger CSS
 * (glassmorphic, theme-aware) with a typed API, loading state, and a tap spring.
 * Renders a <Link> when `href` is passed, otherwise a <button>.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(props, ref) {
  const {
    variant = "primary",
    size = "md",
    loading = false,
    icon,
    iconPosition = "left",
    fullWidth,
    children,
    className,
  } = props;

  const sizeStyle = SIZE_STYLE[size];
  const content = (
    <>
      {loading ? (
        <Icon name="spinner" size={size === "sm" ? "xs" : "sm"} spin />
      ) : (
        icon && iconPosition === "left" && <Icon name={icon} size={size === "sm" ? "xs" : "sm"} />
      )}
      {children}
      {!loading && icon && iconPosition === "right" && <Icon name={icon} size={size === "sm" ? "xs" : "sm"} />}
    </>
  );

  const style = { ...sizeStyle, width: fullWidth ? "100%" : undefined, justifyContent: "center" as const };

  if ("href" in props && props.href) {
    const { href, target, rel } = props;
    return (
      <motion.span whileTap={{ scale: 0.98 }} transition={springTransition} style={{ display: fullWidth ? "block" : "inline-block" }}>
        <Link href={href} target={target} rel={rel} className={cn(VARIANT_CLASS[variant], className)} style={style}>
          {content}
        </Link>
      </motion.span>
    );
  }

  const { disabled, type = "button", onClick, style: callerStyle, ...rest } = props as ButtonAsButton;
  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      whileTap={disabled || loading ? undefined : { scale: 0.98 }}
      transition={springTransition}
      className={cn(VARIANT_CLASS[variant], className)}
      style={{ ...style, ...callerStyle }}
      {...rest}
    >
      {content}
    </motion.button>
  );
});
