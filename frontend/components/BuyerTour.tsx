"use client";
/**
 * BuyerTour — guided onboarding tour for first-time buyers.
 *
 * Auto-starts when a buyer logs in for the first time (checked via localStorage).
 * Spotlights key nav items and portal features one step at a time.
 * Can be replayed from the profile page by calling resetBuyerTour() and refreshing,
 * or by dispatching the 'buyertour:replay' custom event.
 *
 * No third-party library — uses the existing design tokens and a box-shadow
 * spotlight technique (zero extra bundle weight).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

const TOUR_KEY = "buyer_tour_complete_v1";

export function resetBuyerTour() {
  localStorage.removeItem(TOUR_KEY);
  window.dispatchEvent(new CustomEvent("buyertour:replay"));
}

interface TourStep {
  id: string;
  target: string | null;
  title: string;
  body: string;
  position: "center" | "right" | "bottom" | "top" | "left";
}

const STEPS: TourStep[] = [
  {
    id: "welcome",
    target: null,
    title: "Welcome to ThinkTLS Bid Desk!",
    body: "You're set up as a verified buyer. This quick tour shows you exactly where to go and what to do — takes about 30 seconds. You can skip it anytime.",
    position: "center",
  },
  {
    id: "rounds",
    target: "[data-tour='portal-rounds']",
    title: "Your Bid Rounds",
    body: "When the ThinkTLS team invites you to a round, it appears right here. Open rounds have a green badge — those are live and accepting bids right now.",
    position: "bottom",
  },
  {
    id: "submit-bid",
    target: "[data-tour='nav-submit-bid']",
    title: "Submit a Bid",
    body: "Click here to enter a round. You can download a pre-filled Excel template, fill in your prices, and upload it back — or enter prices directly on screen with no file needed.",
    position: "right",
  },
  {
    id: "submission",
    target: "[data-tour='nav-submission']",
    title: "Track Your Submission",
    body: "After submitting, this page shows every bid line — which ones matched, which are under review, and any the system flagged. No guessing whether your file was received.",
    position: "right",
  },
  {
    id: "results",
    target: "[data-tour='nav-results']",
    title: "Results & Award Notices",
    body: "When a round closes, your results appear here. Lines you won show the awarded price. Lines you lost include a market reference price to help you bid more competitively next time.",
    position: "right",
  },
  {
    id: "chat",
    target: "[data-tour='chat-button']",
    title: "AI Assistant",
    body: "Questions about a round, your win rate, or upcoming deadlines? Ask the AI assistant in the corner — it knows your account and responds instantly.",
    position: "top",
  },
  {
    id: "done",
    target: null,
    title: "You're all set!",
    body: "That covers everything. Explore at your own pace — and if you ever want to replay this tour, just go to your Profile page.",
    position: "center",
  },
];

interface SpotlightRect {
  top: number; left: number; width: number; height: number;
}

function useElementRect(selector: string | null, active: boolean): SpotlightRect | null {
  const [rect, setRect] = useState<SpotlightRect | null>(null);

  useEffect(() => {
    if (!selector || !active) { setRect(null); return; }

    function measure() {
      const el = document.querySelector(selector!);
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }

    measure();
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, [selector, active]);

  return rect;
}

function Tooltip({
  step, rect, stepIndex, total, onNext, onPrev, onSkip,
}: {
  step: TourStep;
  rect: SpotlightRect | null;
  stepIndex: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}) {
  const GAP = 16;
  const PADDING = 8;
  const TW = 320;  // tooltip width

  const isCenter = step.position === "center" || !rect;
  const isLast = stepIndex === total - 1;
  const isFirst = stepIndex === 0;

  const containerStyle: React.CSSProperties = isCenter
    ? {
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        zIndex: 10000, width: TW,
      }
    : computePosition(step.position, rect!, GAP, PADDING, TW);

  return (
    <div style={{
      ...containerStyle,
      background: "rgba(15,15,24,0.96)",
      border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: "16px",
      padding: "20px",
      boxShadow: "0 24px 64px rgba(0,0,0,0.6), 0 2px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(61,129,227,0.18)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
    }}>
      {/* Step counter */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(61,129,227,0.9)" }}>
          {isFirst ? "Getting started" : isLast ? "All done" : `Step ${stepIndex} of ${total - 2}`}
        </span>
        {!isLast && (
          <button onClick={onSkip} style={{
            background: "none", border: "none", cursor: "pointer", fontSize: "0.72rem",
            color: "rgba(255,255,255,0.3)", fontFamily: "inherit", padding: "2px 6px",
            borderRadius: "4px", transition: "color 0.15s",
          }}
            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.6)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
          >
            Skip tour ✕
          </button>
        )}
      </div>

      {/* Progress dots */}
      {!isFirst && !isLast && (
        <div style={{ display: "flex", gap: "5px", marginBottom: "14px" }}>
          {STEPS.filter(s => s.id !== "welcome" && s.id !== "done").map((s, i) => (
            <div key={s.id} style={{
              width: "5px", height: "5px", borderRadius: "50%",
              background: i < stepIndex ? "#3D81E3" : i === stepIndex - 1 ? "#3D81E3" : "rgba(255,255,255,0.15)",
              transition: "background 0.2s",
            }} />
          ))}
        </div>
      )}

      {/* Content */}
      <h3 style={{ margin: "0 0 8px", fontSize: "0.95rem", fontWeight: 700, color: "white", letterSpacing: "-0.02em", lineHeight: 1.3 }}>
        {step.title}
      </h3>
      <p style={{ margin: "0 0 18px", fontSize: "0.82rem", color: "rgba(255,255,255,0.65)", lineHeight: 1.55 }}>
        {step.body}
      </p>

      {/* Actions */}
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        {!isFirst && !isLast && (
          <button onClick={onPrev} style={{
            background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px",
            padding: "8px 14px", fontSize: "0.8rem", fontFamily: "inherit",
            cursor: "pointer", transition: "all 0.15s", fontWeight: 500,
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
          >
            ← Back
          </button>
        )}
        <button onClick={onNext} style={{
          background: isLast ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#3D81E3,#5a6cf5)",
          color: "white", border: "none", borderRadius: "8px",
          padding: "8px 18px", fontSize: "0.8rem", fontFamily: "inherit",
          cursor: "pointer", fontWeight: 600, letterSpacing: "-0.01em",
          boxShadow: isLast ? "0 2px 12px rgba(16,185,129,0.3)" : "0 2px 12px rgba(61,129,227,0.3)",
          transition: "all 0.2s",
        }}
          onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-1px)")}
          onMouseLeave={e => (e.currentTarget.style.transform = "none")}
        >
          {isFirst ? "Start tour →" : isLast ? "Done ✓" : "Next →"}
        </button>
      </div>
    </div>
  );
}

function computePosition(
  position: string, rect: SpotlightRect, gap: number, padding: number, tw: number,
): React.CSSProperties {
  const TOOLTIP_HEIGHT = 200;

  switch (position) {
    case "right":
      return {
        position: "fixed",
        top: Math.max(gap, rect.top + rect.height / 2 - TOOLTIP_HEIGHT / 2),
        left: rect.left + rect.width + gap,
        zIndex: 10000, width: tw,
      };
    case "left":
      return {
        position: "fixed",
        top: Math.max(gap, rect.top + rect.height / 2 - TOOLTIP_HEIGHT / 2),
        left: rect.left - tw - gap,
        zIndex: 10000, width: tw,
      };
    case "bottom":
      return {
        position: "fixed",
        top: rect.top + rect.height + gap,
        left: Math.max(gap, Math.min(rect.left, window.innerWidth - tw - gap)),
        zIndex: 10000, width: tw,
      };
    case "top":
      return {
        position: "fixed",
        top: rect.top - TOOLTIP_HEIGHT - gap,
        left: Math.max(gap, Math.min(rect.left, window.innerWidth - tw - gap)),
        zIndex: 10000, width: tw,
      };
    default:
      return { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 10000, width: tw };
  }
}

export default function BuyerTour() {
  const [stepIndex, setStepIndex] = useState<number>(-1); // -1 = not started
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Auto-start for first-time buyers
    if (!localStorage.getItem(TOUR_KEY)) {
      const t = setTimeout(() => setStepIndex(0), 600);
      return () => clearTimeout(t);
    }

    // Listen for manual replay
    function onReplay() { setStepIndex(0); }
    window.addEventListener("buyertour:replay", onReplay);
    return () => window.removeEventListener("buyertour:replay", onReplay);
  }, []);

  const step = stepIndex >= 0 && stepIndex < STEPS.length ? STEPS[stepIndex] : null;
  const rect = useElementRect(step?.target ?? null, stepIndex >= 0);

  const finish = useCallback(() => {
    localStorage.setItem(TOUR_KEY, "1");
    setStepIndex(-1);
  }, []);

  const next = useCallback(() => {
    if (stepIndex >= STEPS.length - 1) { finish(); return; }
    setStepIndex(i => i + 1);
  }, [stepIndex, finish]);

  const prev = useCallback(() => {
    setStepIndex(i => Math.max(0, i - 1));
  }, []);

  // Keyboard: Escape to skip, ArrowRight to next, ArrowLeft to prev
  useEffect(() => {
    if (stepIndex < 0) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape")     { finish(); }
      if (e.key === "ArrowRight") { next(); }
      if (e.key === "ArrowLeft")  { prev(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepIndex, next, prev, finish]);

  if (!mounted || !step) return null;

  const hasTarget = !!step.target;
  const PADDING = 10;

  return createPortal(
    <>
      {/* Dark backdrop (always) */}
      <div
        onClick={finish}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.72)",
          zIndex: 9998,
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          transition: "opacity 0.2s",
        }}
      />

      {/* Spotlight cutout — only when there's a target element visible */}
      {hasTarget && rect && (
        <div style={{
          position: "fixed",
          top: rect.top - PADDING,
          left: rect.left - PADDING,
          width: rect.width + PADDING * 2,
          height: rect.height + PADDING * 2,
          borderRadius: "10px",
          zIndex: 9999,
          pointerEvents: "none",
          boxShadow: "0 0 0 2px rgba(61,129,227,0.6), 0 0 0 4px rgba(61,129,227,0.2)",
          background: "transparent",
        }} />
      )}

      {/* Tooltip card */}
      <Tooltip
        step={step}
        rect={hasTarget ? rect : null}
        stepIndex={stepIndex}
        total={STEPS.length}
        onNext={next}
        onPrev={prev}
        onSkip={finish}
      />
    </>,
    document.body,
  );
}
