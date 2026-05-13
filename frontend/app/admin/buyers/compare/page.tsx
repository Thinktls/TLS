"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";

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

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "2-digit" });
}

function Bar({ pct, color = "#3D81E3", height = 6 }: { pct: number; color?: string; height?: number }) {
  return (
    <div style={{ width: "100%", background: "rgba(255,255,255,0.06)", borderRadius: 100, height, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, background: color, height: "100%", borderRadius: 100, transition: "width 0.5s ease" }} />
    </div>
  );
}

function ScoreDot({ score }: { score: number }) {
  const color = score >= 75 ? "#34d399" : score >= 40 ? "#fbbf24" : "#f87171";
  const label = score >= 75 ? "High" : score >= 40 ? "Mid" : "Low";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
      <span style={{ fontSize: "0.75rem", color, fontWeight: 700 }}>{score.toFixed(1)}</span>
      <span style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.3)" }}>· {label}</span>
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

  if (loading) return <AdminLayout><div style={{ color: "rgba(255,255,255,0.4)", padding: "80px", textAlign: "center" }}>Loading…</div></AdminLayout>;
  if (error || !data) return <AdminLayout><div style={{ color: "#f87171", padding: "40px", textAlign: "center" }}>{error || "No data"}</div></AdminLayout>;

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
      <div style={{ maxWidth: "1200px" }}>
        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ color: "white", fontSize: "1.5rem", fontWeight: 700, margin: "0 0 6px" }}>Buyer Comparison</h1>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem" }}>
            {buyers.length} buyers · Avg win rate {avgWinRate.toFixed(1)}% · Total value awarded {fmt(totalValue)}
          </p>
        </div>

        {/* Summary KPI row */}
        <div className="mobile-stack" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "24px" }}>
          {[
            { label: "Total Buyers", value: buyers.length, sub: `${buyers.filter(b => b.is_active).length} active` },
            { label: "Total Awarded", value: fmt(totalValue), sub: "across all rounds", color: "#34d399" },
            { label: "Avg Win Rate", value: `${avgWinRate.toFixed(1)}%`, sub: "all buyers" },
            { label: "Top Scorer", value: buyers[0]?.company_name || "—", sub: `Score ${buyers[0]?.buyer_score?.toFixed(1) || 0}`, color: "#fbbf24" },
          ].map(k => (
            <div key={k.label} className="glass" style={{ borderRadius: "12px", padding: "16px 18px" }}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "6px" }}>{k.label}</div>
              <div style={{ color: (k as { color?: string }).color || "white", fontSize: "1.25rem", fontWeight: 800 }}>{k.value}</div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.72rem", marginTop: "4px" }}>{k.sub}</div>
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

          <div style={{ display: "flex", gap: "4px", background: "rgba(255,255,255,0.04)", borderRadius: "10px", padding: "4px" }}>
            {(["metrics", "rounds"] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  background: view === v ? "rgba(61,129,227,0.25)" : "none",
                  border: view === v ? "1px solid rgba(61,129,227,0.4)" : "1px solid transparent",
                  borderRadius: "8px",
                  color: view === v ? "white" : "rgba(255,255,255,0.4)",
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
                  background: sortKey === opt.key ? "rgba(61,129,227,0.2)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${sortKey === opt.key ? "rgba(61,129,227,0.4)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: "8px",
                  color: sortKey === opt.key ? "white" : "rgba(255,255,255,0.5)",
                  cursor: "pointer",
                  padding: "6px 12px",
                  fontSize: "0.78rem",
                  fontFamily: "inherit",
                }}
              >{opt.label}</button>
            ))}
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "7px", cursor: "pointer", fontSize: "0.8rem", color: "rgba(255,255,255,0.5)" }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} style={{ accentColor: "#3D81E3" }} />
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
                border: idx === 0 ? "1px solid rgba(61,129,227,0.25)" : "1px solid rgba(255,255,255,0.06)",
              }}>
                {/* Row header */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    {idx === 0 && <span style={{ fontSize: "0.7rem", background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)", borderRadius: "6px", padding: "2px 8px", fontWeight: 700, letterSpacing: "0.04em" }}>TOP</span>}
                    <div>
                      <Link href={`/admin/buyers/${b.id}`} style={{ textDecoration: "none" }}>
                        <div style={{ fontWeight: 700, color: "white", fontSize: "0.95rem" }}>{b.company_name}</div>
                      </Link>
                      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem" }}>{b.email}</div>
                    </div>
                    {!b.is_active && <span style={{ fontSize: "0.7rem", color: "#f87171", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: "6px", padding: "2px 8px" }}>Inactive</span>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <ScoreDot score={b.buyer_score} />
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.72rem", marginTop: "4px" }}>
                      {b.rounds_participated} round{b.rounds_participated !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>

                {/* Metric bars grid */}
                <div className="mobile-stack" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
                  {/* Value Awarded */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Value Awarded</span>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: b.total_deal_value > 0 ? "#34d399" : "rgba(255,255,255,0.3)" }}>
                        {b.total_deal_value > 0 ? fmt(b.total_deal_value) : "—"}
                      </span>
                    </div>
                    <Bar pct={b.total_deal_value / maxValue * 100} color="#34d399" height={6} />
                    <div style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.7rem", marginTop: "4px" }}>{b.total_deals_won} deals won</div>
                  </div>

                  {/* Win Rate */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Win Rate</span>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: b.win_rate_pct >= 50 ? "#34d399" : b.win_rate_pct >= 25 ? "#fbbf24" : "#f87171" }}>
                        {b.win_rate_pct.toFixed(1)}%
                      </span>
                    </div>
                    <Bar pct={b.win_rate_pct} color={b.win_rate_pct >= 50 ? "#34d399" : b.win_rate_pct >= 25 ? "#fbbf24" : "#f87171"} height={6} />
                    <div style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.7rem", marginTop: "4px" }}>
                      {b.total_lines_won}/{b.total_lines_bid} lines
                    </div>
                  </div>

                  {/* Activity */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Activity</span>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{b.total_lines_bid} lines</span>
                    </div>
                    <Bar pct={b.total_lines_bid / maxLines * 100} color="#60a5fa" height={6} />
                    <div style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.7rem", marginTop: "4px" }}>
                      Last bid: {fmtDate(b.last_bid_at)}
                    </div>
                  </div>
                </div>

                {/* Margin contribution */}
                {b.total_margin_contribution > 0 && (
                  <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.35)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>Margin Contribution</span>
                    <div style={{ flex: 1 }}>
                      <Bar pct={b.total_margin_contribution / maxMargin * 100} color="#a78bfa" height={4} />
                    </div>
                    <span style={{ fontSize: "0.82rem", color: "#a78bfa", fontWeight: 700, flexShrink: 0 }}>{fmt(b.total_margin_contribution)}</span>
                  </div>
                )}
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="glass" style={{ borderRadius: "12px", padding: "48px", textAlign: "center" }}>
                <p style={{ color: "rgba(255,255,255,0.35)" }}>No buyers match your filter.</p>
              </div>
            )}
          </div>
        )}

        {/* ── View: Rounds participation heatmap ── */}
        {view === "rounds" && (
          <div className="glass dark-table-wrapper" style={{ borderRadius: "14px", overflow: "hidden" }}>
            {rounds.length === 0 ? (
              <div style={{ padding: "48px", textAlign: "center", color: "rgba(255,255,255,0.35)" }}>No rounds found.</div>
            ) : (
              <table className="dark-table" style={{ minWidth: `${200 + rounds.length * 110}px` }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: "180px" }}>Buyer</th>
                    {rounds.map(r => (
                      <th key={r.id} style={{ textAlign: "center", minWidth: "100px" }}>
                        <Link href={`/admin/rounds/${r.id}`} style={{ color: "rgba(255,255,255,0.4)", textDecoration: "none", fontSize: "0.68rem" }}>
                          {r.name.length > 14 ? r.name.slice(0, 14) + "…" : r.name}
                        </Link>
                        <div style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.25)", marginTop: "2px", textTransform: "capitalize" }}>{r.status}</div>
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
                          <div style={{ fontWeight: 600, color: "white", fontSize: "0.82rem" }}>{b.company_name}</div>
                          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.7rem" }}>{b.email}</div>
                        </Link>
                      </td>
                      {b.round_participation.map(rp => (
                        <td key={rp.round_id} style={{ textAlign: "center", padding: "10px 8px" }}>
                          {!rp.participated ? (
                            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(255,255,255,0.03)", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ color: "rgba(255,255,255,0.12)", fontSize: "0.7rem" }}>—</span>
                            </div>
                          ) : rp.lines_won === 0 ? (
                            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1px" }}>
                              <span style={{ fontSize: "0.65rem", color: "#f87171", fontWeight: 700 }}>{rp.lines_bid}</span>
                              <span style={{ fontSize: "0.55rem", color: "rgba(248,113,113,0.6)" }}>bid</span>
                            </div>
                          ) : (
                            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1px" }}>
                              <span style={{ fontSize: "0.65rem", color: "#34d399", fontWeight: 700 }}>{rp.lines_won}</span>
                              <span style={{ fontSize: "0.55rem", color: "rgba(52,211,153,0.6)" }}>won</span>
                            </div>
                          )}
                        </td>
                      ))}
                      <td style={{ textAlign: "center" }}>
                        <span style={{
                          padding: "3px 10px", borderRadius: "100px", fontSize: "0.75rem", fontWeight: 700,
                          background: "rgba(61,129,227,0.1)", color: "#60a5fa",
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
            <div style={{ padding: "14px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: "16px", flexWrap: "wrap" }}>
              {[
                { color: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.25)", text: "#34d399", label: "Won lines" },
                { color: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.2)", text: "#f87171", label: "Bid, no wins" },
                { color: "rgba(255,255,255,0.03)", border: "transparent", text: "rgba(255,255,255,0.2)", label: "Not participated" },
              ].map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "14px", height: "14px", borderRadius: "4px", background: l.color, border: `1px solid ${l.border}` }} />
                  <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
