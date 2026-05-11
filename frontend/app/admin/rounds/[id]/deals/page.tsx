"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
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
  razor_push_status: string;
  razor_deal_id: string | null;
  approved_by: string | null;
}

const statusBadge: Record<string, { background: string; color: string }> = {
  pending_approval: { background: "rgba(251,191,36,0.15)",  color: "#fbbf24" },
  approved:         { background: "rgba(52,211,153,0.15)",  color: "#34d399" },
  rejected:         { background: "rgba(239,68,68,0.15)",   color: "#f87171" },
  pushed_to_razor:  { background: "rgba(61,129,227,0.15)",  color: "#60a5fa" },
};

export default function DealsPage() {
  const { id } = useParams();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await api.get(`/deals/rounds/${id}`);
    setDeals(res.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function action(dealId: number, endpoint: string) {
    setActing(dealId);
    try {
      const res = await api.post(`/deals/${dealId}/${endpoint}`);
      setMsg(JSON.stringify(res.data));
      load();
    } finally {
      setActing(null);
    }
  }

  if (loading) return (
    <AdminLayout>
      <div style={{ color: "rgba(255,255,255,0.3)", paddingTop: "60px", textAlign: "center" }}>Loading...</div>
    </AdminLayout>
  );

  const totalValue = deals
    .filter((d) => d.status !== "rejected")
    .reduce((s, d) => s + d.total_value, 0);

  return (
    <AdminLayout>
      <div style={{ maxWidth: "1000px" }}>
        <Link href={`/admin/rounds/${id}`} style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>
          ← Back to Round
        </Link>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "10px 0 28px" }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "white", letterSpacing: "-0.03em", margin: 0 }}>
            Deal Approval
          </h2>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", margin: "0 0 2px" }}>{deals.length} deals</p>
            <p style={{ fontSize: "1rem", fontWeight: 700, color: "white", margin: 0 }}>
              ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} total
            </p>
          </div>
        </div>

        {msg && (
          <div style={{
            marginBottom: "16px",
            padding: "10px 14px",
            background: "rgba(255,255,255,0.05)",
            borderRadius: "8px",
            fontSize: "0.75rem",
            color: "rgba(255,255,255,0.5)",
            fontFamily: "monospace",
            overflowX: "auto",
          }}>
            {msg}
          </div>
        )}

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
                <th style={{ textAlign: "right" }}>Price</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "center" }}>Status</th>
                <th style={{ textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => {
                const badge = statusBadge[d.status] || { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" };
                return (
                  <tr key={d.id}>
                    <td style={{ fontFamily: "monospace", fontSize: "0.78rem" }}>{d.part_number}</td>
                    <td style={{ maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.description}
                    </td>
                    <td style={{ textAlign: "right" }}>{d.quantity}</td>
                    <td style={{ textAlign: "right" }}>${d.winning_price.toFixed(2)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: "white" }}>
                      ${d.total_value.toLocaleString()}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{
                        ...badge,
                        padding: "3px 10px",
                        borderRadius: "100px",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}>
                        {d.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                        {d.status === "pending_approval" && (
                          <>
                            <button
                              onClick={() => action(d.id, "approve")}
                              disabled={acting === d.id}
                              style={{
                                padding: "4px 12px",
                                background: "rgba(52,211,153,0.15)",
                                color: "#34d399",
                                border: "1px solid rgba(52,211,153,0.2)",
                                borderRadius: "6px",
                                fontSize: "0.75rem",
                                cursor: "pointer",
                              }}
                            >Approve</button>
                            <button
                              onClick={() => action(d.id, "reject")}
                              disabled={acting === d.id}
                              style={{
                                padding: "4px 12px",
                                background: "rgba(239,68,68,0.12)",
                                color: "#f87171",
                                border: "1px solid rgba(239,68,68,0.2)",
                                borderRadius: "6px",
                                fontSize: "0.75rem",
                                cursor: "pointer",
                              }}
                            >Reject</button>
                          </>
                        )}
                        {d.status === "approved" && (
                          <button
                            onClick={() => action(d.id, "push-razor")}
                            disabled={acting === d.id}
                            style={{
                              padding: "4px 12px",
                              background: "rgba(61,129,227,0.15)",
                              color: "#60a5fa",
                              border: "1px solid rgba(61,129,227,0.2)",
                              borderRadius: "6px",
                              fontSize: "0.75rem",
                              cursor: "pointer",
                            }}
                          >Push to Razor</button>
                        )}
                        {d.razor_deal_id && (
                          <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.3)" }}>{d.razor_deal_id}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
