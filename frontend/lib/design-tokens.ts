/**
 * Design tokens — single source of truth for spacing, radius, typography, motion, and z-index.
 *
 * Colors are NOT duplicated here: the existing `app/globals.css` already defines a mature,
 * theme-aware color system (--bg, --text-1..4, --brand, --green, --amber, --red, --glass-*,
 * --shadow-*) that correctly handles light/dark mode via [data-theme]. Re-defining colors in JS
 * would create a second source of truth that drifts from the CSS. Components should reference
 * colors via `var(--token-name)` (see COLOR_VAR below for the canonical list), and use the
 * primitives in `components/ui/` rather than raw hex.
 *
 * Spacing/radius/typography ARE defined here (and mirrored as CSS vars in globals.css) because
 * inline components previously scattered raw px values (8,10,12,14,16,18,20,22,24,28,32,40,44...)
 * with no scale — that's the actual inconsistency to fix.
 */

export const spacing = {
  0: "0px",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  7: "28px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
  20: "80px",
} as const;

export const radius = {
  sm: "8px",
  md: "12px",
  lg: "18px",
  xl: "24px",
  full: "9999px",
} as const;

export const typography = {
  fontFamily: {
    sans: "'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
  },
  fontSize: {
    xs: "0.75rem", // 12px — meta/labels
    sm: "0.8125rem", // 13px — secondary text
    base: "0.875rem", // 14px — body default (matches existing .dark-table, .glass-input)
    lg: "1rem", // 16px
    xl: "1.125rem", // 18px
    "2xl": "1.5rem", // 24px — section headings
    "3xl": "2rem", // 32px
    "4xl": "2.6rem", // 41.6px — page hero (matches existing h1 usage)
  },
  fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 },
  lineHeight: { tight: 1.25, normal: 1.5, relaxed: 1.75 },
  letterSpacing: { tight: "-0.04em", snug: "-0.01em", normal: "0", wide: "0.02em", wider: "0.08em" },
} as const;

export const motion = {
  duration: { fast: 0.12, normal: 0.2, slow: 0.3 },
  spring: { type: "spring" as const, stiffness: 400, damping: 28 },
  springSoft: { type: "spring" as const, stiffness: 260, damping: 24 },
  ease: [0.4, 0, 0.2, 1] as const,
};

export const zIndex = {
  dropdown: 100,
  sidebar: 50,
  modal: 200,
  toast: 300,
  tooltip: 400,
} as const;

export const breakpoints = { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 } as const;

/** Canonical CSS custom properties already defined in globals.css — reference, not redefinition. */
export const COLOR_VAR = {
  bg: "var(--bg)",
  bg1: "var(--bg-1)",
  bg2: "var(--bg-2)",
  bg3: "var(--bg-3)",
  surface: "var(--surface)",
  surfaceHover: "var(--surface-hover)",
  border: "var(--border)",
  borderMid: "var(--border-mid)",
  brand: "var(--brand)",
  brandDim: "var(--brand-dim)",
  green: "var(--green)",
  amber: "var(--amber)",
  red: "var(--red)",
  text1: "var(--text-1)",
  text2: "var(--text-2)",
  text3: "var(--text-3)",
  text4: "var(--text-4)",
  glassBg: "var(--glass-bg)",
  glassBorder: "var(--glass-border)",
} as const;
