"use client";
import { useEffect, useState } from "react";
import BuyerLayout from "@/components/BuyerLayout";
import api from "@/lib/api";
import Link from "next/link";

interface Deal {
  id: number;
  part_number: string;
  description: string;
  quantity: number;
  winning_price: number;
  total_value: number;
  status: string;
}

interface RoundRow {
  id: number;
  name: string;
  commodity: string;
  status: string;
  deadline: string | null;
  invite_status: string;
  lines_submitted: number;
  lines_won: number;
}

const roundStatusColor: Record<string, string> = {
  draft: "rgba(255,255,255,0.35)",
  open: "#34d399",
  closed: "#fbbf24",
  processing: "#60a5fa",
  complete: "#a78bfa",
};

const API_BASE = "http://localhost:8000/api";

export default function MyDeals() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"rounds" | "deals">("rounds");

  useEffect(() => {
    Promise.all([
      api.get("/buyer/my-deals").then((r) => r.data).catch(() => []),
      api.get("/buyer/my-rounds").then((r) => r.data).catch(() => []),
    ]).then(([d, r]) => {
      setDeals(d);
      setRounds(r);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <BuyerLayout>
      <div style={{ color: "rgba(255,255,255,0.3)", paddingTop: "60px", textAlign: "center" }}>Loading...</div>
    </BuyerLayout>
  );

  const totalValue = deals.reduce((s, d) => s + d.total_value, 0);
  const totalWon = deals.length;
  const totalRounds = rounds.length;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 20px",
    borderRadius: "8px",
    fontSize: "0.85rem",
    fontWeight: active ? 600 : 400,
    color: active ? "white" : "rgba(255,255,255,0.4)",
    background: active ? "rgba(61,129,227,0.18)" : "transparent",
    border: active ? "1px solid rgba(61,129,227,0.3)" : "1px solid transparent",
    cursor: "pointer",
  });

  return (
    <BuyerLayout>
      <div style={{ maxWidth: "900px" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "white", letterSpacing: "-0.03em", margin: "0 0 4px" }}>
          My Dashboard
        </h2>
        <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", marginBottom: "28px" }}>
          Your bid rounds, results, and awarded deals.
        </p>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "28px" }}>
          {[
            { label: "Rounds Invited", value: totalRounds, color: "white" },
            { label: "Deals Won", value: totalWon, color: "#34d399" },
            { label: "Total Value Won", value: `$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: "#a78bfa" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "14px",
              padding: "20px",
            }}>
              <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
              <p style={{ fontSize: "1.8rem", fontWeight: 700, color, margin: 0 }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          <button style={tabStyle(activeTab === "rounds")} onClick={() => setActiveTab("rounds")}>Bid Rounds</button>
          <button style={tabStyle(activeTab === "deals")} onClick={() => setActiveTab("deals")}>Won Deals</button>
        </div>

        {/* Round History */}
        {activeTab === "rounds" && (
          rounds.length === 0 ? (
            <div style={{ textAlign: "center", paddingTop: "60px", color: "rgba(255,255,255,0.3)", fontSize: "0.9rem" }}>
              You haven't been invited to any rounds yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {rounds.map((r) => (
                <div key={r.id} style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "14px",
                  padding: "18px 20px",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                        <p style={{ fontWeight: 600, color: "white", margin: 0, fontSize: "0.92rem" }}>{r.name}</p>
                        <span style={{
                          fontSize: "0.68rem", fontWeight: 600, padding: "2px 9px", borderRadius: "100px",
                          background: "rgba(255,255,255,0.05)",
                          color: roundStatusColor[r.status] || "rgba(255,255,255,0.5)",
                          textTransform: "capitalize",
                        }}>{r.status}</span>
                      </div>
                      <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", margin: 0 }}>
                        {r.commodity}{r.deadline ? ` · Deadline ${new Date(r.deadline).toLocaleDateString()}` : ""}
                        {r.lines_submitted > 0 && ` · ${r.lines_submitted} lines submitted · ${r.lines_won} won`}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0, marginLeft: 16 }}>
                      {r.status === "open" && (
                        <Link href={`/portal/bid?round=${r.id}`} className="btn-brand" style={{ textDecoration: "none", fontSize: "0.78rem", padding: "6px 14px" }}>
                          Submit Bid
                        </Link>
                      )}
                      {r.status === "complete" && (
                        <>
                          <Link href={`/portal/results?round=${r.id}`} className="btn-ghost" style={{ textDecoration: "none", fontSize: "0.78rem", padding: "6px 14px" }}>
                            View Results
                          </Link>
                          <a
                            href={`${API_BASE}/buyer/rounds/${r.id}/award-sheet`}
                            className="btn-brand"
                            style={{ textDecoration: "none", fontSize: "0.78rem", padding: "6px 14px" }}
                            target="_blank"
                            rel="noreferrer"
                          >
                            ↓ Award Sheet
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Won Deals */}
        {activeTab === "deals" && (
          deals.length === 0 ? (
            <div style={{ textAlign: "center", paddingTop: "60px", color: "rgba(255,255,255,0.3)", fontSize: "0.9rem" }}>
              No deals yet. Submit bids to start winning.
            </div>
          ) : (
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "18px",
              overflow: "hidden",
            }}>
              <table className="dark-table">
                <thead>
                  <tr>
                    <th>Part Number</th>
                    <th>Description</th>
                    <th style={{ textAlign: "right" }}>Qty</th>
                    <th style={{ textAlign: "right" }}>Your Price</th>
                    <th style={{ textAlign: "right" }}>Total Value</th>
                    <th style={{ textAlign: "center" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontFamily: "monospace", fontSize: "0.78rem" }}>{d.part_number}</td>
                      <td style={{ maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.description}</td>
                      <td style={{ textAlign: "right" }}>{d.quantity}</td>
                      <td style={{ textAlign: "right", fontFamily: "monospace" }}>${d.winning_price.toFixed(2)}</td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: "white" }}>
                        ${d.total_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{
                          padding: "3px 10px", borderRadius: "100px", fontSize: "0.7rem", fontWeight: 600,
                          background: "rgba(52,211,153,0.15)", color: "#34d399",
                        }}>
                          {d.status.replace(/_/g, " ")}
                        </span>
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
