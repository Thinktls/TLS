"use client";
import { useEffect, useState } from "react";
import BuyerLayout from "@/components/BuyerLayout";
import api from "@/lib/api";

interface Deal {
  id: number;
  part_number: string;
  description: string;
  quantity: number;
  winning_price: number;
  total_value: number;
  status: string;
}

export default function MyDeals() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/buyer/my-deals").then((r) => setDeals(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <BuyerLayout>
      <div style={{ color: "rgba(255,255,255,0.3)", paddingTop: "60px", textAlign: "center" }}>Loading...</div>
    </BuyerLayout>
  );

  const totalValue = deals.reduce((s, d) => s + d.total_value, 0);

  return (
    <BuyerLayout>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "white", letterSpacing: "-0.03em", margin: "0 0 4px" }}>
        My Deals
      </h2>
      <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", marginBottom: "28px" }}>
        All rounds where you are the winning bidder.
      </p>

      {deals.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: "60px", color: "rgba(255,255,255,0.3)", fontSize: "0.9rem" }}>
          No deals yet. Submit a bid to get started.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "24px" }}>
            {[
              { label: "Deals Won", value: deals.length.toString() },
              { label: "Total Value", value: `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
            ].map(({ label, value }) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "16px",
                padding: "22px 24px",
              }}>
                <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
                <p style={{ fontSize: "1.8rem", fontWeight: 700, color: "white", margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>

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
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th style={{ textAlign: "center" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
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
                        padding: "3px 10px",
                        borderRadius: "100px",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        background: "rgba(52,211,153,0.15)",
                        color: "#34d399",
                      }}>
                        {d.status.replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </BuyerLayout>
  );
}
