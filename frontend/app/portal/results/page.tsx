"use client";
import { useEffect, useState } from "react";
import BuyerLayout from "@/components/BuyerLayout";
import api from "@/lib/api";

interface Result {
  part_number: string;
  description: string;
  outcome: "WON" | "LOST";
  your_price: number;
  winning_price: number;
}

export default function MyResults() {
  const [results, setResults] = useState<Result[]>([]);
  const [won, setWon] = useState(0);
  const [lost, setLost] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/buyer/my-results").then((r) => {
      setResults(r.data.results);
      setWon(r.data.won);
      setLost(r.data.lost);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <BuyerLayout>
      <div style={{ color: "rgba(255,255,255,0.3)", paddingTop: "60px", textAlign: "center" }}>Loading...</div>
    </BuyerLayout>
  );

  return (
    <BuyerLayout>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "white", letterSpacing: "-0.03em", margin: "0 0 4px" }}>
        My Results
      </h2>
      <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", marginBottom: "28px" }}>
        Win/loss summary across all rounds you&apos;ve participated in.
      </p>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "24px" }}>
        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "16px",
          padding: "22px 24px",
          textAlign: "center",
        }}>
          <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Bids</p>
          <p style={{ fontSize: "1.8rem", fontWeight: 700, color: "white", margin: 0 }}>{won + lost}</p>
        </div>
        <div style={{
          background: "rgba(52,211,153,0.06)",
          border: "1px solid rgba(52,211,153,0.15)",
          borderRadius: "16px",
          padding: "22px 24px",
          textAlign: "center",
        }}>
          <p style={{ fontSize: "0.72rem", color: "#34d399", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Won</p>
          <p style={{ fontSize: "1.8rem", fontWeight: 700, color: "#34d399", margin: 0 }}>{won}</p>
        </div>
        <div style={{
          background: "rgba(239,68,68,0.06)",
          border: "1px solid rgba(239,68,68,0.15)",
          borderRadius: "16px",
          padding: "22px 24px",
          textAlign: "center",
        }}>
          <p style={{ fontSize: "0.72rem", color: "#f87171", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Lost</p>
          <p style={{ fontSize: "1.8rem", fontWeight: 700, color: "#f87171", margin: 0 }}>{lost}</p>
        </div>
      </div>

      {results.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: "40px", color: "rgba(255,255,255,0.3)", fontSize: "0.9rem" }}>
          No results yet.
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
                <th style={{ textAlign: "right" }}>Your Price</th>
                <th style={{ textAlign: "right" }}>Winning Price</th>
                <th style={{ textAlign: "right" }}>Difference</th>
                <th style={{ textAlign: "center" }}>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => {
                const diff = r.winning_price - r.your_price;
                return (
                  <tr key={i}>
                    <td style={{ fontFamily: "monospace", fontSize: "0.78rem" }}>{r.part_number}</td>
                    <td style={{ maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.description}
                    </td>
                    <td style={{ textAlign: "right" }}>${r.your_price.toFixed(2)}</td>
                    <td style={{ textAlign: "right" }}>${r.winning_price.toFixed(2)}</td>
                    <td style={{
                      textAlign: "right",
                      fontSize: "0.78rem",
                      color: r.outcome === "LOST" ? "#f87171" : "rgba(255,255,255,0.3)",
                    }}>
                      {r.outcome === "LOST" ? `+$${diff.toFixed(2)}` : "—"}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{
                        padding: "3px 10px",
                        borderRadius: "100px",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        background: r.outcome === "WON" ? "rgba(52,211,153,0.15)" : "rgba(239,68,68,0.15)",
                        color: r.outcome === "WON" ? "#34d399" : "#f87171",
                      }}>
                        {r.outcome}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </BuyerLayout>
  );
}
