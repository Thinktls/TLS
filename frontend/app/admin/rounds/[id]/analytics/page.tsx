"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import { fmtDatetimeShort } from '@/lib/format';
import { STATUS_COLOR } from '@/lib/status';

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
  anomaly_buyers?: { buyer_id: number; name: string; price: number | null; resolved: boolean }[];
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

function Bar({ pct, color = "var(--info)", height = 6 }: { pct: number; color?: string; height?: number }) {
  return (
    <div style={{ width: "100%", background: "var(--surface)", borderRadius: 100, height, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, background: color, height: "100%", borderRadius: 100, transition: "width 0.6s ease" }} />
    </div>
  );
}

function KpiCard({ label, value, sub, color = "var(--text-1)" }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="glass" style={{ borderRadius: "12px", padding: "18px 20px" }}>
      <div style={{ color: "var(--text-3)", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "8px" }}>{label}</div>
      <div style={{ color, fontSize: "1.5rem", fontWeight: 800, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: "var(--text-4)", fontSize: "0.75rem", marginTop: "6px" }}>{sub}</div>}
    </div>
  );
}





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
        <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid rgba(61,129,227,0.3)", borderTopColor: "var(--info)", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </AdminLayout>
  );

  if (error || !data) return (
    <AdminLayout>
      <div style={{ color: "var(--danger)", padding: "40px", textAlign: "center" }}>{error || "No data"}</div>
    </AdminLayout>
  );

  const { round, overview, match_methods, exception_breakdown, buyer_performance, price_distribution, submission_timeline } = data;
  const maxBuyerValue = Math.max(...buyer_performance.map(b => b.total_value_awarded), 1);

  const TABS = ["overview", "buyers", "prices", "timeline"] as const;

  return (
    <AdminLayout>
      <div className="page-shell animate-in">
        {/* Breadcrumb + title */}
        <Link href={`/admin/rounds/${id}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "var(--text-4)", textDecoration: "none", marginBottom: "10px" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          {round.name}
        </Link>
        <div className="page-header">
          <div className="page-header-text">
            <p className="page-eyebrow">Rounds</p>
            <h1 className="page-title">Round Analytics</h1>
            <p className="page-subtitle">
              {round.commodity} · {round.status} {round.submission_deadline ? `· Deadline ${fmtDate(round.submission_deadline)}` : ""}
            </p>
          </div>
          <div className="page-actions">
            <Link href={`/admin/rounds/${id}/export`} style={{ textDecoration: "none" }}>
              <button className="btn-ghost" style={{ fontSize: "0.82rem" }}>Exports →</button>
            </Link>
          </div>
        </div>

        {/* Top KPI row */}
        <div className="mobile-stack kpi-grid" style={{ marginBottom: "28px" }}>
          <KpiCard label="Awarded Value" value={`$${fmt(overview.total_awarded_value)}`} sub={`${overview.approved_deals} deals`} color="var(--success)" />
          <KpiCard label="Coverage" value={`${overview.coverage_pct}%`} sub={`${overview.items_with_bids}/${overview.total_master_items} items bid`} color="var(--info)" />
          <KpiCard label="Exception Rate" value={`${overview.exception_rate_pct}%`} sub={`${overview.exception_lines} lines flagged`} color={overview.exception_rate_pct > 20 ? "var(--warning)" : "var(--text-1)"} />
          <KpiCard label="Buyers" value={overview.buyers_participated} sub={`${overview.total_bid_lines} lines submitted`} />
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "20px", borderBottom: "1px solid var(--border)", paddingBottom: "0" }}>
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
                color: activeTab === tab ? "var(--text-1)" : "var(--text-3)",
                borderBottom: activeTab === tab ? "2px solid var(--info)" : "2px solid transparent",
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
                <p style={{ color: "var(--text-3)", fontSize: "0.85rem" }}>No matched lines yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {Object.entries(match_methods).sort((a, b) => b[1] - a[1]).map(([method, count]) => {
                    const pct = overview.matched_lines > 0 ? count / overview.matched_lines * 100 : 0;
                    return (
                      <div key={method}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span style={{ fontSize: "0.82rem", color: (STATUS_COLOR as any)[method] || "var(--text-1)", fontWeight: 600, textTransform: "capitalize" }}>{method}</span>
                          <span style={{ fontSize: "0.82rem", color: "var(--text-2)" }}>{count} lines · {pct.toFixed(1)}%</span>
                        </div>
                        <Bar pct={pct} color={(STATUS_COLOR as any)[method] || "var(--info)"} height={8} />
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
                  <p style={{ color: "var(--text-3)", fontSize: "0.85rem" }}>No exceptions — clean round!</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {Object.entries(exception_breakdown).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                      <div key={type} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: (STATUS_COLOR as any)[type] || "var(--surface-hover)", flexShrink: 0 }} />
                          <span style={{ fontSize: "0.82rem", color: "var(--text-2)", textTransform: "capitalize" }}>{type.replace(/_/g, " ")}</span>
                        </div>
                        <span style={{ fontSize: "0.82rem", fontWeight: 700, color: (STATUS_COLOR as any)[type] || "var(--text-1)" }}>{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="glass" style={{ borderRadius: "14px", padding: "22px 24px" }}>
                <h3 style={{ color: "var(--text-1)", fontWeight: 600, fontSize: "0.95rem", margin: "0 0 18px" }}>Round Health</h3>
                {[
                  { label: "Items covered", pct: overview.coverage_pct, color: "var(--success)" },
                  { label: "Lines matched", pct: overview.matched_lines / Math.max(overview.total_bid_lines, 1) * 100, color: "var(--info)" },
                  { label: "Deals approved", pct: overview.approved_deals / Math.max(overview.total_deals, 1) * 100, color: "var(--violet-bright)" },
                ].map(row => (
                  <div key={row.label} style={{ marginBottom: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-2)" }}>{row.label}</span>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: row.color }}>{row.pct.toFixed(1)}%</span>
                    </div>
                    <Bar pct={row.pct} color={row.color} height={6} />
                  </div>
                ))}
                <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                  <span style={{ color: "var(--text-3)" }}>Anomalies detected</span>
                  <span style={{ color: overview.anomaly_count > 0 ? "var(--warning)" : "var(--success)", fontWeight: 700 }}>
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
              <div style={{ padding: "48px", textAlign: "center", color: "var(--text-3)" }}>No buyer data yet.</div>
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
                          <div style={{ color: "var(--text-3)", fontSize: "0.72rem" }}>{b.email}</div>
                        </Link>
                      </td>
                      <td style={{ color: "var(--text-2)", textAlign: "center" }}>{b.lines_bid}</td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{ color: "var(--success)", fontWeight: 700 }}>{b.lines_won}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{ flex: 1, minWidth: "60px" }}>
                            <Bar pct={b.win_rate_pct} color={b.win_rate_pct >= 50 ? "var(--success)" : b.win_rate_pct >= 25 ? "var(--warning)" : "var(--danger)"} height={5} />
                          </div>
                          <span style={{ fontSize: "0.78rem", color: "var(--text-2)", flexShrink: 0 }}>{b.win_rate_pct.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 700, color: b.total_value_awarded > 0 ? "var(--success)" : "var(--text-3)" }}>
                        {b.total_value_awarded > 0 ? `$${fmt(b.total_value_awarded)}` : "—"}
                      </td>
                      <td style={{ width: "100px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <div style={{ flex: 1 }}>
                            <Bar pct={b.total_value_awarded / maxBuyerValue * 100} color="var(--info)" height={5} />
                          </div>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>
                            {(b.total_value_awarded / Math.max(overview.total_awarded_value, 1) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {b.anomalies > 0 ? (
                          <span style={{ color: "var(--warning)", fontWeight: 700 }}>⚠ {b.anomalies}</span>
                        ) : (
                          <span style={{ color: "var(--text-4)" }}>—</span>
                        )}
                      </td>
                      <td style={{ color: "var(--text-3)", fontSize: "0.75rem" }}>{fmtDate(b.submitted_at)}</td>
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
            <p style={{ color: "var(--text-3)", fontSize: "0.8rem", margin: "0 0 4px" }}>
              Items sorted by bid spread % (widest price gap = most competitive). Showing top {price_distribution.length}.
            </p>
            <div className="glass dark-table-wrapper" style={{ borderRadius: "14px", overflow: "hidden" }}>
              {price_distribution.length === 0 ? (
                <div style={{ padding: "48px", textAlign: "center", color: "var(--text-3)" }}>No price data. Run winner selection first.</div>
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
                          <div style={{ color: "var(--text-3)", fontSize: "0.72rem" }}>{row.description}</div>
                          {/* Name whose bid was flagged and link straight to where it can be
                              approved — a bare "ANOMALY" badge gave the admin nothing to act on. */}
                          {row.has_anomaly && (
                            <div style={{ marginTop: "3px" }}>
                              {(row.anomaly_buyers ?? []).map((ab) => (
                                <a
                                  key={ab.buyer_id}
                                  href={`/admin/rounds/${id}/exceptions?type=price_anomaly`}
                                  title={`${ab.name} bid ${ab.price != null ? `$${ab.price.toFixed(2)}` : "—"} on this item, which looks like a price typo. Click to review and approve or remove it.`}
                                  style={{
                                    display: "inline-block", marginRight: "6px",
                                    fontSize: "0.65rem", fontWeight: 700,
                                    color: ab.resolved ? "var(--success)" : "var(--warning)",
                                    textDecoration: "none",
                                    borderBottom: "1px dotted currentColor",
                                  }}
                                >
                                  {ab.resolved ? "✓" : "⚠"} {ab.name}
                                  {ab.price != null ? ` · $${ab.price.toFixed(2)}` : ""}
                                  {ab.resolved ? " (approved)" : " — review"}
                                </a>
                              ))}
                              {(row.anomaly_buyers ?? []).length === 0 && (
                                <span title="A bid on this item looks like a price typo. Review it on the Exceptions page." style={{ fontSize: "0.65rem", color: "var(--warning)", fontWeight: 700, cursor: "help" }}>⚠ ANOMALY</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: "center", color: "var(--text-2)" }}>{row.bids}</td>
                        <td style={{ color: "var(--danger)", fontWeight: 600 }}>${fmt(row.min_price)}</td>
                        <td style={{ color: "var(--text-2)" }}>${fmt(row.median_price)}</td>
                        <td style={{ color: "var(--success)", fontWeight: 600 }}>${fmt(row.max_price)}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <div style={{ width: "50px" }}>
                              <Bar pct={Math.min(row.spread_pct, 200) / 2} color={row.spread_pct > 50 ? "var(--warning)" : "var(--info)"} height={5} />
                            </div>
                            <span style={{
                              fontSize: "0.78rem",
                              fontWeight: 700,
                              color: row.spread_pct > 100 ? "var(--danger)" : row.spread_pct > 50 ? "var(--warning)" : "var(--success)",
                            }}>
                              {row.spread_pct.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td style={{ color: row.winning_price ? "var(--success)" : "var(--text-4)", fontWeight: row.winning_price ? 700 : 400 }}>
                          {row.winning_price ? `$${fmt(row.winning_price)}` : "—"}
                        </td>
                        <td style={{ color: "var(--text-3)", fontSize: "0.78rem" }}>
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
                <p style={{ color: "var(--text-3)" }}>No bid files uploaded yet.</p>
              </div>
            ) : (
              submission_timeline.map((row, i) => (
                <div key={i} className="glass" style={{ borderRadius: "12px", padding: "16px 20px", display: "flex", alignItems: "center", gap: "16px" }}>
                  <div style={{
                    width: "36px", height: "36px", borderRadius: "50%",
                    background: row.status === "processed" ? "var(--success-bg)" : "var(--warning-bg)",
                    border: `1px solid ${row.status === "processed" ? "var(--success-border)" : "var(--warning-border)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.85rem", flexShrink: 0,
                  }}>
                    {row.status === "processed" ? "✓" : "⏳"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "var(--text-1)", fontSize: "0.88rem" }}>{row.buyer_name}</div>
                    <div style={{ color: "var(--text-3)", fontSize: "0.75rem", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.filename}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ color: "var(--text-2)", fontSize: "0.82rem" }}>{row.lines} lines</div>
                    <div style={{ color: "var(--text-3)", fontSize: "0.75rem" }}>{fmtDate(row.uploaded_at)}</div>
                  </div>
                  <span style={{
                    padding: "3px 10px", borderRadius: "100px", fontSize: "0.7rem", fontWeight: 700,
                    background: row.status === "processed" ? "var(--success-bg)" : "var(--warning-bg)",
                    color: row.status === "processed" ? "var(--success)" : "var(--warning)",
                    border: `1px solid ${row.status === "processed" ? "var(--success-border)" : "var(--warning-border)"}`,
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
