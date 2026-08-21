"use client";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

interface KPIs {
  total_deal_value_30d: number;
  total_deal_value_all_time: number;
  avg_margin_pct: number;
  active_buyers: number;
  unbid_rate_pct: number;
  total_rounds: number;
  total_deals: number;
}

interface BuyerRow {
  id: number;
  full_name: string;
  company_name: string;
  win_rate: number;
  total_lines_won: number;
  total_lines_bid: number;
  total_margin_contribution: number;
  buyer_score: number;
}

interface RoundRow {
  id: number;
  name: string;
  status: string;
  total_line_items: number;
}

interface ReportData {
  kpis: KPIs;
  top_buyers: BuyerRow[];
  recent_rounds: RoundRow[];
}

interface MonthlyBar {
  month: string;
  value: number;
  count: number;
}

interface RoundTrend {
  id: number; name: string; commodity: string; completed_at: string | null;
  deals: number; total_value: number; avg_price: number;
  participants: number; invited: number; participation_pct: number; exception_rate_pct: number;
}

const statusColor: Record<string, string> = {
  draft: "var(--text-3)",
  open: "#34d399",
  closed: "#fbbf24",
  processing: "#60a5fa",
  complete: "#a78bfa",
};

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--bg-2)",
      border: "1px solid rgba(61,129,227,0.3)",
      borderRadius: "10px",
      padding: "10px 14px",
      fontSize: "0.8rem",
    }}>
      <p style={{ color: "var(--text-3)", margin: "0 0 4px" }}>{label}</p>
      <p style={{ color: "#34d399", fontWeight: 700, margin: "0 0 2px" }}>
        ${payload[0].value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </p>
      <p style={{ color: "var(--text-3)", margin: 0 }}>{payload[0].payload.count} deals</p>
    </div>
  );
}

export default function ReportsDashboard() {
  const [data, setData] = useState<ReportData | null>(null);
  const [monthly, setMonthly] = useState<MonthlyBar[]>([]);
  const [trends, setTrends] = useState<RoundTrend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/rounds/report/summary").then((r) => r.data).catch(() => null),
      api.get("/rounds/report/monthly-deal-value").then((r) => r.data).catch(() => []),
      api.get("/rounds/report/round-trends?limit=12").then((r) => r.data?.rounds ?? []).catch(() => []),
    ]).then(([summary, bars, tr]) => {
      setData(summary);
      setMonthly(bars);
      setTrends(tr);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <AdminLayout>
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
        <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid rgba(61,129,227,0.3)", borderTopColor: "#3D81E3", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </AdminLayout>
  );

  if (!data) return (
    <AdminLayout>
      <div style={{ color: "#f87171", paddingTop: "60px", textAlign: "center" }}>Failed to load report data.</div>
    </AdminLayout>
  );

  const { kpis, top_buyers, recent_rounds } = data;
  const maxVal = Math.max(...monthly.map((m) => m.value), 1);

  const kpiCards = [
    { label: "Deal Value (30d)", value: `$${kpis.total_deal_value_30d.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: "#34d399" },
    { label: "All-Time Deal Value", value: `$${kpis.total_deal_value_all_time.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: "var(--text-1)" },
    { label: "Avg Margin %", value: `${kpis.avg_margin_pct.toFixed(1)}%`, color: kpis.avg_margin_pct > 10 ? "#34d399" : "#fbbf24" },
    { label: "Active Buyers", value: kpis.active_buyers, color: "#a78bfa" },
    { label: "Unbid Rate", value: `${kpis.unbid_rate_pct.toFixed(1)}%`, color: kpis.unbid_rate_pct > 20 ? "#f87171" : "#60a5fa" },
    { label: "Total Rounds", value: kpis.total_rounds, color: "var(--text-1)" },
  ];

  return (
    <AdminLayout>
      <div style={{ maxWidth: "1100px" }} className="animate-in">
        <div style={{ marginBottom: "32px" }}>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.04em", margin: "0 0 4px" }}>
            Reports
          </h1>
          <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: 0 }}>
            Platform-wide performance and buyer analytics
          </p>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "32px" }}>
          {kpiCards.map(({ label, value, color }) => (
            <div key={label} style={{
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-xl)",
              padding: "20px",
            }}>
              <p style={{ fontSize: "0.7rem", color: "var(--text-3)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {label}
              </p>
              <p style={{ fontSize: "1.8rem", fontWeight: 700, color: color as string, margin: 0 }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Monthly Deal Value Bar Chart (recharts) */}
        <div style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          padding: "24px",
          marginBottom: "24px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <p style={{ fontWeight: 600, color: "var(--text-1)", margin: 0, fontSize: "0.9rem" }}>
              Monthly Deal Value
            </p>
            <p style={{ fontSize: "0.72rem", color: "var(--text-4)", margin: 0 }}>Last 12 months · approved deals only</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: "var(--text-3)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={fmt}
                tick={{ fill: "var(--text-4)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--surface)" }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {monthly.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.value === maxVal ? "#3D81E3" : "rgba(61,129,227,0.45)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Round-over-round trends — deal value per completed round with participation/exception context */}
        {trends.length > 0 && (
          <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "24px", marginBottom: "16px" }}>
            <p style={{ fontWeight: 600, color: "var(--text-1)", margin: "0 0 4px", fontSize: "0.9rem" }}>Round-over-Round Trends</p>
            <p style={{ fontSize: "0.75rem", color: "var(--text-4)", margin: "0 0 16px" }}>Deal value per completed round (most recent {trends.length}).</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trends} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--text-3)", fontSize: 10 }} tickFormatter={(v: string) => (v.length > 10 ? v.slice(0, 10) + "…" : v)} />
                <YAxis tick={{ fill: "var(--text-3)", fontSize: 10 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((v: number, _n: unknown, item: any) => {
                    const r = item?.payload as RoundTrend | undefined;
                    return [`$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, r ? `${r.deals} deals · ${r.participation_pct}% bid · ${r.exception_rate_pct}% exceptions` : "Deal value"];
                  }) as never}
                />
                <Bar dataKey="total_value" radius={[4, 4, 0, 0]}>
                  {trends.map((t, i) => (
                    <Cell key={`t-${i}`} fill={t.exception_rate_pct > 5 ? "rgba(251,191,36,0.7)" : "rgba(52,211,153,0.6)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ overflowX: "auto", marginTop: "12px" }}>
              <table className="dark-table" style={{ width: "100%", minWidth: "560px" }}>
                <thead>
                  <tr>
                    <th>Round</th>
                    <th style={{ textAlign: "right" }}>Deals</th>
                    <th style={{ textAlign: "right" }}>Value</th>
                    <th style={{ textAlign: "right" }}>Avg Price</th>
                    <th style={{ textAlign: "right" }}>Participation</th>
                    <th style={{ textAlign: "right" }}>Exceptions</th>
                  </tr>
                </thead>
                <tbody>
                  {[...trends].reverse().map((t) => (
                    <tr key={t.id}>
                      <td style={{ color: "var(--text-1)", fontSize: "0.82rem" }}>{t.name}<span style={{ color: "var(--text-4)", fontSize: "0.7rem" }}> · {t.commodity}</span></td>
                      <td style={{ textAlign: "right" }}>{t.deals.toLocaleString()}</td>
                      <td style={{ textAlign: "right", color: "#34d399", fontWeight: 600 }}>${t.total_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td style={{ textAlign: "right", color: "var(--text-3)" }}>{t.avg_price ? `$${t.avg_price.toFixed(2)}` : "—"}</td>
                      <td style={{ textAlign: "right", color: "var(--text-3)" }}>{t.participants}/{t.invited} ({t.participation_pct}%)</td>
                      <td style={{ textAlign: "right", color: t.exception_rate_pct > 5 ? "#fbbf24" : "var(--text-3)" }}>{t.exception_rate_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          {/* Buyer Performance Table */}
          <div style={{
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-xl)",
            padding: "24px",
          }}>
            <p style={{ fontWeight: 600, color: "var(--text-1)", margin: "0 0 16px", fontSize: "0.9rem" }}>
              Top Buyers by Margin
            </p>
            {top_buyers.length === 0 ? (
              <p style={{ fontSize: "0.82rem", color: "var(--text-4)" }}>No buyer data yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {top_buyers.map((b, idx) => (
                  <Link key={b.id} href={`/admin/buyers/${b.id}`} style={{ textDecoration: "none" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "10px",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-mid)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"; }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{
                          width: 22, height: 22, borderRadius: 6,
                          background: "var(--surface)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "0.65rem", fontWeight: 700, color: "var(--text-3)",
                          flexShrink: 0,
                        }}>
                          {idx + 1}
                        </span>
                        <div>
                          <p style={{ margin: 0, fontSize: "0.82rem", fontWeight: 500, color: "var(--text-1)" }}>
                            {b.company_name || b.full_name}
                          </p>
                          <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--text-3)" }}>
                            {b.total_lines_won} won / {b.total_lines_bid} bid · {b.win_rate.toFixed(1)}% win rate
                          </p>
                        </div>
                      </div>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#34d399", fontFamily: "monospace" }}>
                        ${b.total_margin_contribution.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recent Rounds */}
          <div style={{
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-xl)",
            padding: "24px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <p style={{ fontWeight: 600, color: "var(--text-1)", margin: 0, fontSize: "0.9rem" }}>Recent Rounds</p>
              <Link href="/admin/rounds" style={{ fontSize: "0.75rem", color: "var(--text-3)", textDecoration: "none" }}>
                View all →
              </Link>
            </div>
            {recent_rounds.length === 0 ? (
              <p style={{ fontSize: "0.82rem", color: "var(--text-4)" }}>No rounds yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {recent_rounds.map((r) => (
                  <Link key={r.id} href={`/admin/rounds/${r.id}`} style={{ textDecoration: "none" }}>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "10px",
                    }}>
                      <div>
                        <p style={{ margin: 0, fontSize: "0.82rem", fontWeight: 500, color: "var(--text-1)" }}>{r.name}</p>
                        <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--text-3)" }}>
                          {r.total_line_items.toLocaleString()} items
                        </p>
                      </div>
                      <span style={{
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        padding: "2px 10px",
                        borderRadius: "100px",
                        background: "var(--surface)",
                        color: statusColor[r.status] || "var(--text-3)",
                        textTransform: "capitalize",
                      }}>
                        {r.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
