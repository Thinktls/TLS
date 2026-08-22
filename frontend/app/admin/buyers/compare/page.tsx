"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import { fmtDate } from "@/lib/format";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RoundParticipation {
  round_id: number;
  round_name: string;
  lines_bid: number;
  lines_won: number;
  participated: boolean;
}

interface BuyerRow {
  id: number;
  full_name: string;
  company_name: string;
  email: string;
  is_active: boolean;
  fluff_percentage: number;
  win_rate_pct: number;
  total_lines_bid: number;
  total_lines_won: number;
  total_margin_contribution: number;
  buyer_score: number;
  total_deal_value: number;
  total_deals_won: number;
  last_bid_at: string | null;
  last_win_date: string | null;
  rounds_participated: number;
  round_participation: RoundParticipation[];
}

interface CompareData {
  buyers: BuyerRow[];
  rounds: { id: number; name: string; status: string }[];
}

type SortKey = "win_rate_pct" | "total_deal_value" | "buyer_score" | "total_lines_bid" | "total_margin_contribution";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}


function Bar({ pct, color = "var(--brand)", height = 6 }: { pct: number; color?: string; height?: number }) {
  return (
    <div style={{ width: "100%", background: "var(--surface)", borderRadius: 100, height, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, background: color, height: "100%", borderRadius: 100, transition: "width 0.5s ease" }} />
    </div>
  );
}

function ScoreDot({ score }: { score: number }) {
  const color = score >= 75 ? "var(--success)" : score >= 40 ? "var(--warning)" : "var(--danger)";
  const label = score >= 75 ? "High" : score >= 40 ? "Mid" : "Low";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
      <span style={{ fontSize: "0.75rem", color, fontWeight: 700 }}>{score.toFixed(1)}</span>
      <span style={{ fontSize: "0.68rem", color: "var(--text-4)" }}>· {label}</span>
    </div>
  );
}

// ── Sort / Filter controls ────────────────────────────────────────────────────

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "total_deal_value",          label: "Value Awarded" },
  { key: "win_rate_pct",              label: "Win Rate" },
  { key: "buyer_score",               label: "Score" },
  { key: "total_lines_bid",           label: "Activity" },
  { key: "total_margin_contribution", label: "Margin" },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BuyerComparePage() {
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total_deal_value");
  const [showInactive, setShowInactive] = useState(false);
  const [view, setView] = useState<"metrics" | "rounds">("metrics");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await api.get<CompareData>("/auth/buyers/compare");
      setData(result.data);
    } catch {
      setError("Failed to load buyer data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <AdminLayout>
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
        <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid var(--brand-dim)", borderTopColor: "var(--brand)", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </AdminLayout>
  );
  if (error || !data) return <AdminLayout><div style={{ color: "var(--danger)", padding: "40px", textAlign: "center" }}>{error || "No data"}</div></AdminLayout>;

  const { buyers, rounds } = data;

  const filtered = buyers
    .filter(b => showInactive ? true : b.is_active)
    .filter(b => !search || b.company_name.toLowerCase().includes(search.toLowerCase()) || b.email.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b[sortKey] - a[sortKey]);

  const maxValue = Math.max(...buyers.map(b => b.total_deal_value), 1);
  const maxLines = Math.max(...buyers.map(b => b.total_lines_bid), 1);
  const maxMargin = Math.max(...buyers.map(b => b.total_margin_contribution), 1);

  const totalValue = buyers.reduce((s, b) => s + b.total_deal_value, 0);
  const avgWinRate = buyers.length ? buyers.reduce((s, b) => s + b.win_rate_pct, 0) / buyers.length : 0;

  return (
    <AdminLayout>
      <div className="page-shell animate-in">
        {/* Header */}
        <div className="page-header">
          <div className="page-header-text">
            <p className="page-eyebrow">Buyers</p>
            <h1 className="page-title">Buyer Comparison</h1>
            <p className="page-subtitle">
              {buyers.length} buyers · Avg win rate {avgWinRate.toFixed(1)}% · Total value awarded {fmt(totalValue)}
            </p>
          </div>
        </div>

        {/* Summary KPI row */}
        <div className="mobile-stack kpi-grid" style={{ marginBottom: "24px" }}>
          {[
            { label: "Total Buyers", value: buyers.length, sub: `${buyers.filter(b => b.is_active).length} active` },
            { label: "Total Awarded", value: fmt(totalValue), sub: "across all rounds", color: "var(--success)" },
            { label: "Avg Win Rate", value: `${avgWinRate.toFixed(1)}%`, sub: "all buyers" },
            { label: "Top Scorer", value: buyers[0]?.company_name || "—", sub: `Score ${buyers[0]?.buyer_score?.toFixed(1) || 0}`, color: "var(--warning)" },
          ].map(k => (
            <div key={k.label} className="glass" style={{ borderRadius: "12px", padding: "16px 18px" }}>
              <div style={{ color: "var(--text-3)", fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "6px" }}>{k.label}</div>
              <div style={{ color: (k as { color?: string }).color || "var(--text-1)", fontSize: "1.25rem", fontWeight: 800 }}>{k.value}</div>
              <div style={{ color: "var(--text-4)", fontSize: "0.72rem", marginTop: "4px" }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", marginBottom: "20px" }}>
          <input
            className="glass-input"
            placeholder="Search buyer…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "200px" }}
          />

          <div style={{ display: "flex", gap: "4px", background: "var(--surface)", borderRadius: "10px", padding: "4px" }}>
            {(["metrics", "rounds"] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  background: view === v ? "var(--brand-dim)" : "none",
                  border: view === v ? "1px solid var(--brand-dim)" : "1px solid transparent",
                  borderRadius: "8px",
                  color: view === v ? "var(--text-1)" : "var(--text-3)",
                  cursor: "pointer",
                  padding: "6px 14px",
                  fontSize: "0.8rem",
                  fontFamily: "inherit",
                  textTransform: "capitalize",
                }}
              >{v}</button>
            ))}
          </div>

          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setSortKey(opt.key)}
                style={{
                  background: sortKey === opt.key ? "var(--brand-dim)" : "var(--surface)",
                  border: `1px solid ${sortKey === opt.key ? "var(--brand-dim)" : "var(--border)"}`,
                  borderRadius: "8px",
                  color: sortKey === opt.key ? "var(--text-1)" : "var(--text-3)",
                  cursor: "pointer",
                  padding: "6px 12px",
                  fontSize: "0.78rem",
                  fontFamily: "inherit",
                }}
              >{opt.label}</button>
            ))}
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "7px", cursor: "pointer", fontSize: "0.8rem", color: "var(--text-3)" }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} style={{ accentColor: "var(--brand)" }} />
            Show inactive
          </label>
        </div>

        {/* ── View: Metrics ── */}
        {view === "metrics" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {filtered.map((b, idx) => (
              <div key={b.id} className="glass" style={{
                borderRadius: "14px",
                padding: "20px 22px",
                opacity: b.is_active ? 1 : 0.5,
                border: idx === 0 ? "1px solid var(--brand-dim)" : "1px solid var(--border)",
              }}>
                {/* Row header */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    {idx === 0 && <span style={{ fontSize: "0.7rem", background: "var(--warning-dim)", color: "var(--warning)", border: "1px solid var(--warning-dim)", borderRadius: "6px", padding: "2px 8px", fontWeight: 700, letterSpacing: "0.04em" }}>TOP</span>}
                    <div>
                      <Link href={`/admin/buyers/${b.id}`} style={{ textDecoration: "none" }}>
                        <div style={{ fontWeight: 700, color: "var(--text-1)", fontSize: "0.95rem" }}>{b.company_name}</div>
                      </Link>
                      <div style={{ color: "var(--text-3)", fontSize: "0.75rem" }}>{b.email}</div>
                    </div>
                    {!b.is_active && <span style={{ fontSize: "0.7rem", color: "var(--danger)", background: "var(--danger-dim)", border: "1px solid var(--danger-dim)", borderRadius: "6px", padding: "2px 8px" }}>Inactive</span>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <ScoreDot score={b.buyer_score} />
                    <div style={{ color: "var(--text-4)", fontSize: "0.72rem", marginTop: "4px" }}>
                      {b.rounds_participated} round{b.rounds_participated !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>

                {/* Metric bars grid */}
                <div className="mobile-stack" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
                  {/* Value Awarded */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ fontSize: "0.73rem", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Value Awarded</span>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: b.total_deal_value > 0 ? "var(--success)" : "var(--text-4)" }}>
                        {b.total_deal_value > 0 ? fmt(b.total_deal_value) : "—"}
                      </span>
                    </div>
                    <Bar pct={b.total_deal_value / maxValue * 100} color="var(--success)" height={6} />
                    <div style={{ color: "var(--text-4)", fontSize: "0.7rem", marginTop: "4px" }}>{b.total_deals_won} deals won</div>
                  </div>

                  {/* Win Rate */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ fontSize: "0.73rem", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Win Rate</span>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: b.win_rate_pct >= 50 ? "var(--success)" : b.win_rate_pct >= 25 ? "var(--warning)" : "var(--danger)" }}>
                        {b.win_rate_pct.toFixed(1)}%
                      </span>
                    </div>
                    <Bar pct={b.win_rate_pct} color={b.win_rate_pct >= 50 ? "var(--success)" : b.win_rate_pct >= 25 ? "var(--warning)" : "var(--danger)"} height={6} />
                    <div style={{ color: "var(--text-4)", fontSize: "0.7rem", marginTop: "4px" }}>
                      {b.total_lines_won}/{b.total_lines_bid} lines
                    </div>
                  </div>

                  {/* Activity */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ fontSize: "0.73rem", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Activity</span>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-2)" }}>{b.total_lines_bid} lines</span>
                    </div>
                    <Bar pct={b.total_lines_bid / maxLines * 100} color="var(--info)" height={6} />
                    <div style={{ color: "var(--text-4)", fontSize: "0.7rem", marginTop: "4px" }}>
                      Last bid: {fmtDate(b.last_bid_at)}
                    </div>
                  </div>
                </div>

                {/* Margin contribution */}
                {b.total_margin_contribution > 0 && (
                  <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>Margin Contribution</span>
                    <div style={{ flex: 1 }}>
                      <Bar pct={b.total_margin_contribution / maxMargin * 100} color="var(--violet-bright)" height={4} />
                    </div>
                    <span style={{ fontSize: "0.82rem", color: "var(--violet-bright)", fontWeight: 700, flexShrink: 0 }}>{fmt(b.total_margin_contribution)}</span>
                  </div>
                )}
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="glass" style={{ borderRadius: "12px", padding: "48px", textAlign: "center" }}>
                <p style={{ color: "var(--text-3)" }}>No buyers match your filter.</p>
              </div>
            )}
          </div>
        )}

        {/* ── View: Rounds participation heatmap ── */}
        {view === "rounds" && (
          <div className="glass dark-table-wrapper" style={{ borderRadius: "14px", overflow: "hidden" }}>
            {rounds.length === 0 ? (
              <div style={{ padding: "48px", textAlign: "center", color: "var(--text-3)" }}>No rounds found.</div>
            ) : (
              <table className="dark-table" style={{ minWidth: `${200 + rounds.length * 110}px` }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: "180px" }}>Buyer</th>
                    {rounds.map(r => (
                      <th key={r.id} style={{ textAlign: "center", minWidth: "100px" }}>
                        <Link href={`/admin/rounds/${r.id}`} style={{ color: "var(--text-3)", textDecoration: "none", fontSize: "0.68rem" }}>
                          {r.name.length > 14 ? r.name.slice(0, 14) + "…" : r.name}
                        </Link>
                        <div style={{ fontSize: "0.6rem", color: "var(--text-4)", marginTop: "2px", textTransform: "capitalize" }}>{r.status}</div>
                      </th>
                    ))}
                    <th style={{ textAlign: "center" }}>Rounds</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(b => (
                    <tr key={b.id}>
                      <td>
                        <Link href={`/admin/buyers/${b.id}`} style={{ textDecoration: "none" }}>
                          <div style={{ fontWeight: 600, color: "var(--text-1)", fontSize: "0.82rem" }}>{b.company_name}</div>
                          <div style={{ color: "var(--text-4)", fontSize: "0.7rem" }}>{b.email}</div>
                        </Link>
                      </td>
                      {b.round_participation.map(rp => (
                        <td key={rp.round_id} style={{ textAlign: "center", padding: "10px 8px" }}>
                          {!rp.participated ? (
                            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "var(--surface)", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ color: "var(--text-4)", fontSize: "0.7rem" }}>—</span>
                            </div>
                          ) : rp.lines_won === 0 ? (
                            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "var(--danger-dim)", border: "1px solid var(--danger-dim)", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1px" }}>
                              <span style={{ fontSize: "0.65rem", color: "var(--danger)", fontWeight: 700 }}>{rp.lines_bid}</span>
                              <span style={{ fontSize: "0.55rem", color: "var(--danger-dim)" }}>bid</span>
                            </div>
                          ) : (
                            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "var(--success-dim)", border: "1px solid var(--success-dim)", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1px" }}>
                              <span style={{ fontSize: "0.65rem", color: "var(--success)", fontWeight: 700 }}>{rp.lines_won}</span>
                              <span style={{ fontSize: "0.55rem", color: "var(--success-dim)" }}>won</span>
                            </div>
                          )}
                        </td>
                      ))}
                      <td style={{ textAlign: "center" }}>
                        <span style={{
                          padding: "3px 10px", borderRadius: "100px", fontSize: "0.75rem", fontWeight: 700,
                          background: "var(--brand-dim)", color: "var(--info)",
                        }}>
                          {b.rounds_participated}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Legend */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: "16px", flexWrap: "wrap" }}>
              {[
                { color: "var(--success-dim)", border: "var(--success-dim)", text: "var(--success)", label: "Won lines" },
                { color: "var(--danger-dim)", border: "var(--danger-dim)", text: "var(--danger)", label: "Bid, no wins" },
                { color: "var(--surface)", border: "transparent", text: "var(--text-4)", label: "Not participated" },
              ].map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "14px", height: "14px", borderRadius: "4px", background: l.color, border: `1px solid ${l.border}` }} />
                  <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
