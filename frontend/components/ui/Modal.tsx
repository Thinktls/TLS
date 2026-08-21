"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { modalBackdrop, modalContent } from "@/lib/utils/motion";
import { Icon } from "@/components/icons";

export type ModalSize = "sm" | "md" | "lg" | "full";

const MAX_WIDTH: Record<ModalSize, string> = { sm: "420px", md: "560px", lg: "760px", full: "94vw" };

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: ModalSize;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Modal/dialog primitive: Framer Motion spring entrance, backdrop blur, ESC + click-outside
 * close, and a focus trap. Replaces the three ad-hoc modal patterns (fixed inset, bottom-sheet,
 * confirm dialog) that had drifted across pages.
 */
export function Modal({ open, onClose, title, size = "md", children, footer }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // Minimal focus trap: keep Tab within the dialog.
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the dialog on open so keyboard/screen-reader users land inside it.
    requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial="hidden" animate="visible" exit="exit" variants={modalBackdrop}
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "var(--modal-backdrop-bg)", backdropFilter: "var(--modal-backdrop-blur)", WebkitBackdropFilter: "var(--modal-backdrop-blur)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            variants={modalContent}
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: "100%", maxWidth: MAX_WIDTH[size], maxHeight: "88vh", display: "flex", flexDirection: "column", padding: 0 }}
          >
            {title && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
                <h2 id={titleId} style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--text-1)" }}>{title}</h2>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-4)", padding: "4px", display: "flex" }}
                >
                  <Icon name="close" size="sm" />
                </button>
              </div>
            )}
            <div style={{ padding: "22px", overflowY: "auto" }}>{children}</div>
            {footer && (
              <div style={{ padding: "16px 22px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
