"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import { fmtDatetimeShort } from "@/lib/format";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RoundOverview {
  total_master_items: number;
  items_with_bids: number;
  coverage_pct: number;
  total_bid_lines: number;
  matched_lines: number;
  exception_lines: number;
  exception_rate_pct: number;
  anomaly_count: number;
  total_deals: number;
  approved_deals: number;
  total_awarded_value: number;
  buyers_participated: number;
}

interface BuyerRow {
  id: number;
  company_name: string;
  email: string;
  lines_bid: number;
  lines_won: number;
  win_rate_pct: number;
  total_value_awarded: number;
  anomalies: number;
  submitted_at: string | null;
}

interface PriceRow {
  part_number: string;
  description: string;
  bids: number;
  min_price: number;
  max_price: number;
  median_price: number;
  mean_price: number;
  spread_pct: number;
  winning_price: number | null;
  reserve_price: number | null;
  has_anomaly: boolean;
}

interface TimelineRow {
  buyer_name: string;
  filename: string;
  lines: number;
  uploaded_at: string | null;
  status: string;
}

interface Analytics {
  round: { id: number; name: string; commodity: string; status: string; submission_deadline: string | null };
  overview: RoundOverview;
  match_methods: Record<string, number>;
  exception_breakdown: Record<string, number>;
  buyer_performance: BuyerRow[];
  price_distribution: PriceRow[];
  submission_timeline: TimelineRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null) { return fmtDatetimeShort(iso); }

function Bar({ pct, color = "#3D81E3", height = 6 }: { pct: number; color?: string; height?: number }) {
  return (
    <div style={{ width: "100%", background: "rgba(255,255,255,0.06)", borderRadius: 100, height, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, background: color, height: "100%", borderRadius: 100, transition: "width 0.6s ease" }} />
    </div>
  );
}

function KpiCard({ label, value, sub, color = "white" }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="glass" style={{ borderRadius: "12px", padding: "18px 20px" }}>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "8px" }}>{label}</div>
      <div style={{ color, fontSize: "1.5rem", fontWeight: 800, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.75rem", marginTop: "6px" }}>{sub}</div>}
    </div>
  );
}

const METHOD_COLOR: Record<string, string> = {
  exact: "#34d399",
  fuzzy: "#60a5fa",
  ai: "#a78bfa",
  unknown: "rgba(255,255,255,0.2)",
};

const EXC_COLOR: Record<string, string> = {
  unmatched: "#f87171",
  partial_match: "#fbbf24",
  below_reserve: "#fb923c",
  duplicate: "#a78bfa",
  unknown: "rgba(255,255,255,0.2)",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function RoundAnalyticsPage() {
  const { id } = useParams();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "buyers" | "prices" | "timeline">("overview");

  const load = useCallback(async () => {
    try {
      const result = await api.get<Analytics>(`/rounds/${id}/analytics`);
      setData(result.data);
    } catch {
      setError("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <AdminLayout>
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
        <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid rgba(61,129,227,0.3)", borderTopColor: "#3D81E3", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </AdminLayout>
  );

  if (error || !data) return (
    <AdminLayout>
      <div style={{ color: "#f87171", padding: "40px", textAlign: "center" }}>{error || "No data"}</div>
    </AdminLayout>
  );

  const { round, overview, match_methods, exception_breakdown, buyer_performance, price_distribution, submission_timeline } = data;
  const maxBuyerValue = Math.max(...buyer_performance.map(b => b.total_value_awarded), 1);

  const TABS = ["overview", "buyers", "prices", "timeline"] as const;

  return (
    <AdminLayout>
      <div style={{ maxWidth: "1100px" }} className="animate-in">
        {/* Breadcrumb + title */}
        <Link href={`/admin/rounds/${id}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "var(--text-4)", textDecoration: "none", marginBottom: "10px" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          {round.name}
        </Link>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "28px" }}>
          <div>
            <h1 style={{ color: "var(--text-1)", fontSize: "1.6rem", fontWeight: 800, letterSpacing: "-0.04em", margin: "0 0 4px" }}>Round Analytics</h1>
            <p style={{ color: "var(--text-4)", fontSize: "0.82rem", margin: 0 }}>
              {round.commodity} · {round.status} {round.submission_deadline ? `· Deadline ${fmtDate(round.submission_deadline)}` : ""}
            </p>
          </div>
          <Link href={`/admin/rounds/${id}/export`} style={{ textDecoration: "none" }}>
            <button className="btn-ghost" style={{ fontSize: "0.82rem" }}>Exports →</button>
          </Link>
        </div>

        {/* Top KPI row */}
        <div className="mobile-stack" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "28px" }}>
          <KpiCard label="Awarded Value" value={`$${fmt(overview.total_awarded_value)}`} sub={`${overview.approved_deals} deals`} color="#34d399" />
          <KpiCard label="Coverage" value={`${overview.coverage_pct}%`} sub={`${overview.items_with_bids}/${overview.total_master_items} items bid`} color="#60a5fa" />
          <KpiCard label="Exception Rate" value={`${overview.exception_rate_pct}%`} sub={`${overview.exception_lines} lines flagged`} color={overview.exception_rate_pct > 20 ? "#fbbf24" : "white"} />
          <KpiCard label="Buyers" value={overview.buyers_participated} sub={`${overview.total_bid_lines} lines submitted`} />
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "20px", borderBottom: "1px solid rgba(255,255,255,0.07)", paddingBottom: "0" }}>
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "10px 18px",
                fontSize: "0.85rem",
                fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? "white" : "rgba(255,255,255,0.4)",
                borderBottom: activeTab === tab ? "2px solid #3D81E3" : "2px solid transparent",
                marginBottom: "-1px",
                transition: "color 0.15s",
                fontFamily: "inherit",
                textTransform: "capitalize",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ── Tab: Overview ── */}
        {activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Match Methods */}
            <div className="glass" style={{ borderRadius: "14px", padding: "22px 24px" }}>
              <h3 style={{ color: "var(--text-1)", fontWeight: 600, fontSize: "0.95rem", margin: "0 0 18px" }}>Match Method Breakdown</h3>
              {Object.keys(match_methods).length === 0 ? (
                <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.85rem" }}>No matched lines yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {Object.entries(match_methods).sort((a, b) => b[1] - a[1]).map(([method, count]) => {
                    const pct = overview.matched_lines > 0 ? count / overview.matched_lines * 100 : 0;
                    return (
                      <div key={method}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span style={{ fontSize: "0.82rem", color: METHOD_COLOR[method] || "white", fontWeight: 600, textTransform: "capitalize" }}>{method}</span>
                          <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.55)" }}>{count} lines · {pct.toFixed(1)}%</span>
                        </div>
                        <Bar pct={pct} color={METHOD_COLOR[method] || "#3D81E3"} height={8} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Exception Breakdown + Anomalies side by side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div className="glass" style={{ borderRadius: "14px", padding: "22px 24px" }}>
                <h3 style={{ color: "var(--text-1)", fontWeight: 600, fontSize: "0.95rem", margin: "0 0 18px" }}>Exception Types</h3>
                {Object.keys(exception_breakdown).length === 0 ? (
                  <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.85rem" }}>No exceptions — clean round!</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {Object.entries(exception_breakdown).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                      <div key={type} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: EXC_COLOR[type] || "rgba(255,255,255,0.2)", flexShrink: 0 }} />
                          <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.7)", textTransform: "capitalize" }}>{type.replace(/_/g, " ")}</span>
                        </div>
                        <span style={{ fontSize: "0.82rem", fontWeight: 700, color: EXC_COLOR[type] || "white" }}>{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="glass" style={{ borderRadius: "14px", padding: "22px 24px" }}>
                <h3 style={{ color: "var(--text-1)", fontWeight: 600, fontSize: "0.95rem", margin: "0 0 18px" }}>Round Health</h3>
                {[
                  { label: "Items covered", pct: overview.coverage_pct, color: "#34d399" },
                  { label: "Lines matched", pct: overview.matched_lines / Math.max(overview.total_bid_lines, 1) * 100, color: "#60a5fa" },
                  { label: "Deals approved", pct: overview.approved_deals / Math.max(overview.total_deals, 1) * 100, color: "#a78bfa" },
                ].map(row => (
                  <div key={row.label} style={{ marginBottom: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>{row.label}</span>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: row.color }}>{row.pct.toFixed(1)}%</span>
                    </div>
                    <Bar pct={row.pct} color={row.color} height={6} />
                  </div>
                ))}
                <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>Anomalies detected</span>
                  <span style={{ color: overview.anomaly_count > 0 ? "#fbbf24" : "#34d399", fontWeight: 700 }}>
                    {overview.anomaly_count > 0 ? `⚠ ${overview.anomaly_count}` : "✓ None"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Buyers ── */}
        {activeTab === "buyers" && (
          <div className="glass dark-table-wrapper" style={{ borderRadius: "14px", overflow: "hidden" }}>
            {buyer_performance.length === 0 ? (
              <div style={{ padding: "48px", textAlign: "center", color: "rgba(255,255,255,0.35)" }}>No buyer data yet.</div>
            ) : (
              <table className="dark-table" style={{ minWidth: "750px" }}>
                <thead>
                  <tr>
                    <th>Buyer</th>
                    <th>Lines Bid</th>
                    <th>Won</th>
                    <th>Win Rate</th>
                    <th>Value Awarded</th>
                    <th>Share</th>
                    <th>Anomalies</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {buyer_performance.map((b, i) => (
                    <tr key={b.id}>
                      <td>
                        <Link href={`/admin/buyers/${b.id}`} style={{ textDecoration: "none" }}>
                          <div style={{ fontWeight: 600, color: "var(--text-1)", fontSize: "0.85rem" }}>{b.company_name}</div>
                          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.72rem" }}>{b.email}</div>
                        </Link>
                      </td>
                      <td style={{ color: "rgba(255,255,255,0.7)", textAlign: "center" }}>{b.lines_bid}</td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{ color: "#34d399", fontWeight: 700 }}>{b.lines_won}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{ flex: 1, minWidth: "60px" }}>
                            <Bar pct={b.win_rate_pct} color={b.win_rate_pct >= 50 ? "#34d399" : b.win_rate_pct >= 25 ? "#fbbf24" : "#f87171"} height={5} />
                          </div>
                          <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.6)", flexShrink: 0 }}>{b.win_rate_pct.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 700, color: b.total_value_awarded > 0 ? "#34d399" : "rgba(255,255,255,0.35)" }}>
                        {b.total_value_awarded > 0 ? `$${fmt(b.total_value_awarded)}` : "—"}
                      </td>
                      <td style={{ width: "100px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <div style={{ flex: 1 }}>
                            <Bar pct={b.total_value_awarded / maxBuyerValue * 100} color="#3D81E3" height={5} />
                          </div>
                          <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)" }}>
                            {(b.total_value_awarded / Math.max(overview.total_awarded_value, 1) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {b.anomalies > 0 ? (
                          <span style={{ color: "#fbbf24", fontWeight: 700 }}>⚠ {b.anomalies}</span>
                        ) : (
                          <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>
                        )}
                      </td>
                      <td style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.75rem" }}>{fmtDate(b.submitted_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Tab: Prices ── */}
        {activeTab === "prices" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.8rem", margin: "0 0 4px" }}>
              Items sorted by bid spread % (widest price gap = most competitive). Showing top {price_distribution.length}.
            </p>
            <div className="glass dark-table-wrapper" style={{ borderRadius: "14px", overflow: "hidden" }}>
              {price_distribution.length === 0 ? (
                <div style={{ padding: "48px", textAlign: "center", color: "rgba(255,255,255,0.35)" }}>No price data. Run winner selection first.</div>
              ) : (
                <table className="dark-table" style={{ minWidth: "800px" }}>
                  <thead>
                    <tr>
                      <th>Part Number</th>
                      <th>Bids</th>
                      <th>Min</th>
                      <th>Median</th>
                      <th>Max</th>
                      <th>Spread</th>
                      <th>Winner</th>
                      <th>Reserve</th>
                    </tr>
                  </thead>
                  <tbody>
                    {price_distribution.map((row, i) => (
                      <tr key={i}>
                        <td>
                          <div style={{ fontWeight: 600, color: "var(--text-1)", fontSize: "0.82rem" }}>{row.part_number}</div>
                          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.72rem" }}>{row.description}</div>
                          {row.has_anomaly && <span title="One or more bids on this item look like a price typo (far above or below the others). Review it on the Exceptions page." style={{ fontSize: "0.65rem", color: "#fbbf24", fontWeight: 700, cursor: "help" }}>⚠ ANOMALY</span>}
                        </td>
                        <td style={{ textAlign: "center", color: "rgba(255,255,255,0.6)" }}>{row.bids}</td>
                        <td style={{ color: "#f87171", fontWeight: 600 }}>${fmt(row.min_price)}</td>
                        <td style={{ color: "rgba(255,255,255,0.7)" }}>${fmt(row.median_price)}</td>
                        <td style={{ color: "#34d399", fontWeight: 600 }}>${fmt(row.max_price)}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <div style={{ width: "50px" }}>
                              <Bar pct={Math.min(row.spread_pct, 200) / 2} color={row.spread_pct > 50 ? "#fbbf24" : "#3D81E3"} height={5} />
                            </div>
                            <span style={{
                              fontSize: "0.78rem",
                              fontWeight: 700,
                              color: row.spread_pct > 100 ? "#f87171" : row.spread_pct > 50 ? "#fbbf24" : "#34d399",
                            }}>
                              {row.spread_pct.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td style={{ color: row.winning_price ? "#34d399" : "rgba(255,255,255,0.25)", fontWeight: row.winning_price ? 700 : 400 }}>
                          {row.winning_price ? `$${fmt(row.winning_price)}` : "—"}
                        </td>
                        <td style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.78rem" }}>
                          {row.reserve_price ? `$${fmt(row.reserve_price)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Timeline ── */}
        {activeTab === "timeline" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {submission_timeline.length === 0 ? (
              <div className="glass" style={{ borderRadius: "12px", padding: "48px", textAlign: "center" }}>
                <p style={{ color: "rgba(255,255,255,0.35)" }}>No bid files uploaded yet.</p>
              </div>
            ) : (
              submission_timeline.map((row, i) => (
                <div key={i} className="glass" style={{ borderRadius: "12px", padding: "16px 20px", display: "flex", alignItems: "center", gap: "16px" }}>
                  <div style={{
                    width: "36px", height: "36px", borderRadius: "50%",
                    background: row.status === "processed" ? "rgba(52,211,153,0.15)" : "rgba(251,191,36,0.12)",
                    border: `1px solid ${row.status === "processed" ? "rgba(52,211,153,0.3)" : "rgba(251,191,36,0.3)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.85rem", flexShrink: 0,
                  }}>
                    {row.status === "processed" ? "✓" : "⏳"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "var(--text-1)", fontSize: "0.88rem" }}>{row.buyer_name}</div>
                    <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.filename}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.82rem" }}>{row.lines} lines</div>
                    <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem" }}>{fmtDate(row.uploaded_at)}</div>
                  </div>
                  <span style={{
                    padding: "3px 10px", borderRadius: "100px", fontSize: "0.7rem", fontWeight: 700,
                    background: row.status === "processed" ? "rgba(52,211,153,0.1)" : "rgba(251,191,36,0.1)",
                    color: row.status === "processed" ? "#34d399" : "#fbbf24",
                    border: `1px solid ${row.status === "processed" ? "rgba(52,211,153,0.25)" : "rgba(251,191,36,0.25)"}`,
                    textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0,
                  }}>
                    {row.status}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
