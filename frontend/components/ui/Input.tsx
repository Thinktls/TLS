"use client";
import { forwardRef, useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";

interface FieldChromeProps {
  label?: string;
  error?: string;
  hint?: string;
  icon?: IconName;
  containerClassName?: string;
}

export interface InputProps
  extends FieldChromeProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {}

/**
 * Text input primitive — wraps the existing .glass-input CSS with a label/error/hint/icon slot
 * API, so forms stop hand-rolling label + input + error blocks inline.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, icon, containerClassName, className, id, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={containerClassName}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            display: "block", fontSize: "0.72rem", fontWeight: 700, color: "var(--text-4)",
            marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em",
          }}
        >
          {label}
        </label>
      )}
      <div style={{ position: "relative" }}>
        {icon && (
          <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-4)", pointerEvents: "none", display: "flex" }}>
            <Icon name={icon} size="sm" />
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={cn("glass-input", className)}
          style={icon ? { paddingLeft: "36px" } : undefined}
          {...rest}
        />
      </div>
      {error && (
        <p id={`${inputId}-error`} role="alert" style={{ margin: "6px 0 0", fontSize: "0.75rem", color: "#f87171" }}>
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${inputId}-hint`} style={{ margin: "6px 0 0", fontSize: "0.75rem", color: "var(--text-4)" }}>
          {hint}
        </p>
      )}
    </div>
  );
});

export interface TextareaProps extends FieldChromeProps, TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, containerClassName, className, id, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={containerClassName}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            display: "block", fontSize: "0.72rem", fontWeight: 700, color: "var(--text-4)",
            marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em",
          }}
        >
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        className={cn("glass-input", className)}
        style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
        {...rest}
      />
      {error && (
        <p role="alert" style={{ margin: "6px 0 0", fontSize: "0.75rem", color: "#f87171" }}>{error}</p>
      )}
      {!error && hint && (
        <p style={{ margin: "6px 0 0", fontSize: "0.75rem", color: "var(--text-4)" }}>{hint}</p>
      )}
    </div>
  );
});
