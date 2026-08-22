export const STATUS_COLOR = {
  draft:      { color: "var(--text-4)", bg: "var(--surface)",        dim: "var(--surface)" },
  open:       { color: "var(--success)",  bg: "var(--success-dim)",  dim: "var(--success-dim)" },
  closed:     { color: "var(--warning)",  bg: "var(--warning-dim)",  dim: "var(--warning-dim)" },
  processing: { color: "var(--info)",     bg: "var(--info-dim)",     dim: "var(--info-dim)" },
  complete:   { color: "var(--violet-bright)", bg: "var(--violet-dim)", dim: "var(--violet-dim)" },
  error:      { color: "var(--danger)",   bg: "var(--danger-dim)",   dim: "var(--danger-dim)" },
  matched:    { color: "var(--success-strong)", bg: "var(--success-dim)", dim: "var(--success-dim)" },
  exception:  { color: "var(--orange)",   bg: "var(--orange-dim)",   dim: "var(--orange-dim)" },
  won:        { color: "var(--success-strong)", bg: "var(--success-dim)", dim: "var(--success-dim)" },
  lost:       { color: "var(--danger-strong)",  bg: "var(--danger-dim)",  dim: "var(--danger-dim)" },
} as const;
export type StatusKey = keyof typeof STATUS_COLOR;
