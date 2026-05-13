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

const statusColor: Record<string, string> = {
  draft: "rgba(255,255,255,0.4)",
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
      background: "#0d1826",
      border: "1px solid rgba(61,129,227,0.3)",
      borderRadius: "10px",
      padding: "10px 14px",
      fontSize: "0.8rem",
    }}>
      <p style={{ color: "rgba(255,255,255,0.5)", margin: "0 0 4px" }}>{label}</p>
      <p style={{ color: "#34d399", fontWeight: 700, margin: "0 0 2px" }}>
        ${payload[0].value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </p>
      <p style={{ color: "rgba(255,255,255,0.35)", margin: 0 }}>{payload[0].payload.count} deals</p>
    </div>
  );
}

export default function ReportsDashboard() {
  const [data, setData] = useState<ReportData | null>(null);
  const [monthly, setMonthly] = useState<MonthlyBar[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/rounds/report/summary").then((r) => r.data).catch(() => null),
      api.get("/rounds/report/monthly-deal-value").then((r) => r.data).catch(() => []),
    ]).then(([summary, bars]) => {
      setData(summary);
      setMonthly(bars);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <AdminLayout>
      <div style={{ color: "rgba(255,255,255,0.3)", paddingTop: "60px", textAlign: "center" }}>Loading reports...</div>
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
    { label: "All-Time Deal Value", value: `$${kpis.total_deal_value_all_time.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: "white" },
    { label: "Avg Margin %", value: `${kpis.avg_margin_pct.toFixed(1)}%`, color: kpis.avg_margin_pct > 10 ? "#34d399" : "#fbbf24" },
    { label: "Active Buyers", value: kpis.active_buyers, color: "#a78bfa" },
    { label: "Unbid Rate", value: `${kpis.unbid_rate_pct.toFixed(1)}%`, color: kpis.unbid_rate_pct > 20 ? "#f87171" : "#60a5fa" },
    { label: "Total Rounds", value: kpis.total_rounds, color: "white" },
  ];

  return (
    <AdminLayout>
      <div style={{ maxWidth: "1100px" }}>
        <div style={{ marginBottom: "32px" }}>
          <h2 style={{ fontSize: "1.6rem", fontWeight: 700, color: "white", letterSpacing: "-0.03em", margin: 0 }}>
            Reports
          </h2>
          <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
            Platform-wide performance and buyer analytics
          </p>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "32px" }}>
          {kpiCards.map(({ label, value, color }) => (
            <div key={label} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "14px",
              padding: "20px",
            }}>
              <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {label}
              </p>
              <p style={{ fontSize: "1.8rem", fontWeight: 700, color: color as string, margin: 0 }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Monthly Deal Value Bar Chart (recharts) */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "16px",
          padding: "24px",
          marginBottom: "24px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <p style={{ fontWeight: 600, color: "white", margin: 0, fontSize: "0.9rem" }}>
              Monthly Deal Value
            </p>
            <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.3)", margin: 0 }}>Last 12 months · approved deals only</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={fmt}
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          {/* Buyer Performance Table */}
          <div style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "16px",
            padding: "24px",
          }}>
            <p style={{ fontWeight: 600, color: "white", margin: "0 0 16px", fontSize: "0.9rem" }}>
              Top Buyers by Margin
            </p>
            {top_buyers.length === 0 ? (
              <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.3)" }}>No buyer data yet.</p>
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
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: "10px",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.12)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.06)"; }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{
                          width: 22, height: 22, borderRadius: 6,
                          background: "rgba(255,255,255,0.06)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "0.65rem", fontWeight: 700, color: "rgba(255,255,255,0.5)",
                          flexShrink: 0,
                        }}>
                          {idx + 1}
                        </span>
                        <div>
                          <p style={{ margin: 0, fontSize: "0.82rem", fontWeight: 500, color: "white" }}>
                            {b.company_name || b.full_name}
                          </p>
                          <p style={{ margin: 0, fontSize: "0.7rem", color: "rgba(255,255,255,0.35)" }}>
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
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "16px",
            padding: "24px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <p style={{ fontWeight: 600, color: "white", margin: 0, fontSize: "0.9rem" }}>Recent Rounds</p>
              <Link href="/admin/rounds" style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", textDecoration: "none" }}>
                View all →
              </Link>
            </div>
            {recent_rounds.length === 0 ? (
              <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.3)" }}>No rounds yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {recent_rounds.map((r) => (
                  <Link key={r.id} href={`/admin/rounds/${r.id}`} style={{ textDecoration: "none" }}>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: "10px",
                    }}>
                      <div>
                        <p style={{ margin: 0, fontSize: "0.82rem", fontWeight: 500, color: "white" }}>{r.name}</p>
                        <p style={{ margin: 0, fontSize: "0.7rem", color: "rgba(255,255,255,0.35)" }}>
                          {r.total_line_items.toLocaleString()} items
                        </p>
                      </div>
                      <span style={{
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        padding: "2px 10px",
                        borderRadius: "100px",
                        background: "rgba(255,255,255,0.05)",
                        color: statusColor[r.status] || "rgba(255,255,255,0.5)",
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
