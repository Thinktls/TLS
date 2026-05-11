"use client";
import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";

export default function NLQueryPage() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const examples = [
    "Which buyer won the most deals this month?",
    "Show all anomalous bids in the last round",
    "What is the total deal value by commodity?",
    "Which buyers have not submitted bids in the last 90 days?",
    "Show the top 10 highest priced deals",
  ];

  async function ask(q: string) {
    setQuestion(q);
    setLoading(true);
    setResult(null);
    setError("");
    try {
      const res = await api.post("/query/", { question: q });
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Query failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminLayout>
      <div style={{ maxWidth: "860px" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "white", letterSpacing: "-0.03em", margin: "0 0 4px" }}>
          AI Query
        </h2>
        <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", marginBottom: "28px" }}>
          Ask questions about your bids in plain English. Powered by Claude.
        </p>

        {/* Query input */}
        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "18px",
          padding: "24px",
          marginBottom: "16px",
        }}>
          <div style={{ display: "flex", gap: "12px" }}>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask(question)}
              placeholder="Ask anything about your bids..."
              className="glass-input"
              style={{ flex: 1 }}
            />
            <button
              onClick={() => ask(question)}
              disabled={loading || !question.trim()}
              className="btn-brand"
              style={{ flexShrink: 0, padding: "10px 24px" }}
            >
              {loading ? "Asking..." : "Ask"}
            </button>
          </div>

          <div style={{ marginTop: "16px" }}>
            <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.3)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Examples
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {examples.map((ex) => (
                <button
                  key={ex}
                  onClick={() => ask(ex)}
                  style={{
                    padding: "5px 14px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "100px",
                    fontSize: "0.78rem",
                    color: "rgba(255,255,255,0.55)",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.09)";
                    (e.currentTarget as HTMLButtonElement).style.color = "white";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
                    (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.55)";
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div style={{
            padding: "12px 16px",
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: "12px",
            fontSize: "0.83rem",
            color: "#f87171",
            marginBottom: "16px",
          }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "18px",
            padding: "24px",
          }}>
            <p style={{ fontSize: "0.85rem", fontWeight: 500, color: "rgba(255,255,255,0.8)", marginBottom: "14px" }}>
              Q: {result.question}
            </p>

            <div style={{
              background: "rgba(0,0,0,0.3)",
              borderRadius: "10px",
              padding: "14px 16px",
              marginBottom: "16px",
            }}>
              <p style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.3)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Generated SQL
              </p>
              <code style={{ fontSize: "0.78rem", color: "rgba(147,197,253,0.8)", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                {result.sql}
              </code>
            </div>

            <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", marginBottom: "16px" }}>
              {result.count} row{result.count !== 1 ? "s" : ""} returned
            </p>

            {result.rows.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table className="dark-table">
                  <thead>
                    <tr>
                      {result.columns.map((col: string) => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row: any, i: number) => (
                      <tr key={i}>
                        {result.columns.map((col: string) => (
                          <td key={col}>{String(row[col] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
