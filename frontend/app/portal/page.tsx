"use client";
import { useEffect, useState } from "react";
import BuyerLayout from "@/components/BuyerLayout";
import api from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { getFullName } from "@/lib/auth";
import { fmtDatetime } from "@/lib/format";
import Link from "next/link";

interface Deal {
  id: number; part_number: string; description: string;
  quantity: number; winning_price: number; total_value: number; status: string;
}
interface RoundRow {
  id: number; name: string; commodity: string; status: string;
  deadline: string | null; invite_status: string; lines_submitted: number; lines_won: number;
}

const COMMODITY_ICON: Record<string, string> = {
  laptops: "💻", desktops: "🖥", servers: "🖧", networking: "🌐",
  storage: "💾", peripherals: "🖱", other: "📦",
};
const ROUND_STATUS_COLOR: Record<string, { color: string; badge: string }> = {
  draft:      { color: "var(--text-4)",  badge: "badge-draft" },
  open:       { color: "var(--success)",        badge: "badge-open" },
  closed:     { color: "var(--warning)",        badge: "badge-closed" },
  processing: { color: "var(--info)",        badge: "badge-processing" },
  complete:   { color: "var(--violet-bright)",        badge: "badge-complete" },
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function MyDeals() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"rounds" | "deals">("rounds");
  const name = getFullName().split(" ")[0] || "there";

  useEffect(() => {
    Promise.all([
      api.get("/buyer/my-deals").then(r => r.data).catch(() => []),
      api.get("/buyer/my-rounds").then(r => r.data).catch(() => []),
    ]).then(([d, r]) => { setDeals(d); setRounds(r); }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <BuyerLayout>
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
        <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid var(--brand-dim)", borderTopColor: "var(--brand)", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </BuyerLayout>
  );

  const totalValue = deals.reduce((s, d) => s + d.total_value, 0);
  const openRounds = rounds.filter(r => r.status === "open");

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "7px 16px", borderRadius: "7px", fontSize: "0.82rem", cursor: "pointer", border: "none",
    background: active ? "var(--brand-dim)" : "transparent",
    color: active ? "var(--text-1)" : "var(--text-4)",
    fontWeight: active ? 600 : 400, transition: "all 0.15s", fontFamily: "inherit",
  });

  return (
    <BuyerLayout>
      <div style={{ maxWidth: "860px" }} className="animate-in">

        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <p style={{ fontSize: "0.78rem", color: "var(--text-4)", margin: "0 0 4px" }}>{greeting()},</p>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.04em", margin: "0 0 4px", lineHeight: 1.1 }}>
            {name} <span style={{ fontSize: "1rem" }}>👋</span>
          </h1>
          <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: 0 }}>
            {rounds.length} round{rounds.length !== 1 ? "s" : ""} invited · {openRounds.length} open
          </p>
        </div>

        {/* Alert if open rounds */}
        {openRounds.length > 0 && (
          <div style={{ marginBottom: "24px", padding: "14px 18px", background: "var(--success-dim)", border: "1px solid var(--success-dim)", borderRadius: "var(--radius)", display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--success-strong)", flexShrink: 0, animation: "pulse-glow 2s ease infinite" }} />
            <p style={{ fontSize: "0.82rem", color: "var(--text-1)", margin: 0 }}>
              <strong style={{ color: "var(--success)" }}>{openRounds.length} round{openRounds.length > 1 ? "s" : ""}</strong> currently accepting bids.{" "}
              <Link href={`/portal/bid?round=${openRounds[0].id}`} style={{ color: "var(--success)", textDecoration: "none", fontWeight: 600 }}>Submit your bid →</Link>
            </p>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "28px" }}>
          {[
            { label: "Rounds Invited",  value: rounds.length,  icon: "🗂", color: "var(--info)", gradient: "linear-gradient(135deg,var(--brand-dim),transparent)" },
            { label: "Deals Won",       value: deals.length,   icon: "🏆", color: "var(--success)", gradient: "linear-gradient(135deg,var(--success-dim),transparent)" },
            { label: "Total Value Won", value: `$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: "💰", color: "var(--violet-bright)", gradient: "linear-gradient(135deg,var(--violet-dim),transparent)" },
          ].map(({ label, value, icon, color, gradient }) => (
            <div key={label} style={{ background: gradient, border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px 22px" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "12px" }}>{icon}</div>
              <p style={{ fontSize: "1.8rem", fontWeight: 800, color, margin: "0 0 3px", letterSpacing: "-0.04em" }}>{value}</p>
              <p style={{ fontSize: "0.72rem", color: "var(--text-4)", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs — data-tour anchors the guided tour to the rounds section */}
        <div data-tour="portal-rounds" style={{ display: "flex", gap: "4px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "10px", padding: "4px", marginBottom: "20px", width: "fit-content" }}>
          <button style={tabStyle(tab === "rounds")} onClick={() => setTab("rounds")}>
            Bid Rounds ({rounds.length})
          </button>
          <button style={tabStyle(tab === "deals")} onClick={() => setTab("deals")}>
            Won Deals ({deals.length})
          </button>
        </div>

        {/* Rounds tab */}
        {tab === "rounds" && (
          rounds.length === 0 ? (
            <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius-xl)", padding: "64px", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "14px" }}>📭</div>
              <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-2)", margin: "0 0 6px" }}>No rounds yet</p>
              <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: 0 }}>You'll see rounds here once you're invited.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {rounds.map(r => {
                const meta = ROUND_STATUS_COLOR[r.status] || ROUND_STATUS_COLOR.draft;
                return (
                  <div key={r.id} style={{
                    background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
                    padding: "16px 20px", display: "flex", alignItems: "center", gap: "14px", transition: "border-color 0.15s",
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-mid)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
                  >
                    <div style={{
                      width: "40px", height: "40px", borderRadius: "10px", flexShrink: 0,
                      background: "var(--surface)", border: "1px solid var(--border)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem",
                    }}>{COMMODITY_ICON[r.commodity] || "📦"}</div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 700, color: "var(--text-1)", margin: "0 0 3px", fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</p>
                      <p style={{ fontSize: "0.73rem", color: "var(--text-4)", margin: 0 }}>
                        <span style={{ textTransform: "capitalize" }}>{r.commodity}</span>
                        {r.deadline && ` · Due ${fmtDatetime(r.deadline)}`}
                        {r.lines_submitted > 0 && ` · ${r.lines_submitted} lines submitted · ${r.lines_won} won`}
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
                      <span className={`badge ${meta.badge}`}>{r.status}</span>
                      {r.status === "open" && (
                        <Link href={`/portal/bid?round=${r.id}`} className="btn-brand" style={{ textDecoration: "none", fontSize: "0.75rem", padding: "6px 14px" }}>
                          Submit Bid
                        </Link>
                      )}
                      {r.status === "complete" && (
                        <>
                          <Link href={`/portal/results?round=${r.id}`} className="btn-ghost" style={{ textDecoration: "none", fontSize: "0.75rem", padding: "6px 12px" }}>Results</Link>
                          <button onClick={() => downloadFile(`/buyer/rounds/${r.id}/award-sheet`, `award_sheet_round_${r.id}.xlsx`)}
                            className="btn-brand" style={{ fontSize: "0.75rem", padding: "6px 12px" }}>
                            ↓ Sheet
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Deals tab */}
        {tab === "deals" && (
          deals.length === 0 ? (
            <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius-xl)", padding: "64px", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "14px" }}>🏆</div>
              <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-2)", margin: "0 0 6px" }}>No deals yet</p>
              <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: 0 }}>Submit competitive bids to start winning.</p>
            </div>
          ) : (
            <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", overflow: "hidden" }}>
              <table className="dark-table">
                <thead>
                  <tr>
                    <th>Part Number</th><th>Description</th>
                    <th style={{ textAlign: "right" }}>Qty</th>
                    <th style={{ textAlign: "right" }}>Your Price</th>
                    <th style={{ textAlign: "right" }}>Total Value</th>
                    <th style={{ textAlign: "center" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "var(--info)" }}>{d.part_number}</td>
                      <td style={{ maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.description}</td>
                      <td style={{ textAlign: "right" }}>{d.quantity}</td>
                      <td style={{ textAlign: "right", fontFamily: "monospace" }}>${d.winning_price.toFixed(2)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "var(--success)" }}>
                        ${d.total_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span className="badge badge-won">{d.status.replace(/_/g, " ")}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </BuyerLayout>
  );
}
