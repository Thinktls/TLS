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
    "What is the total deal value by commodity?",
    "Show the top 10 highest priced deals",
    "Show all anomalous bids in the last round",
    "Which buyers have not submitted bids in the last 90 days?",
  ];

  async function ask(q: string) {
    if (!q.trim()) return;
    setQuestion(q);
    setLoading(true);
    setResult(null);
    setError("");
    try {
      const res = await api.post("/query/", { question: q });
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Query failed. Try rephrasing your question.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminLayout>
      <div style={{ maxWidth: "900px" }} className="animate-in">
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "white", letterSpacing: "-0.04em", margin: "0 0 4px" }}>
          AI Query
        </h1>
        <p style={{ fontSize: "0.82rem", color: "var(--text-4)", marginBottom: "28px" }}>
          Ask questions about your bids in plain English — the AI translates to SQL and runs it live.
        </p>

        {/* Query input */}
        <div style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          padding: "24px",
          marginBottom: "16px",
        }}>
          <div style={{ display: "flex", gap: "12px" }}>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && ask(question)}
              placeholder="e.g. Which buyer won the most deals this month?"
              className="glass-input"
              style={{ flex: 1 }}
            />
            <button
              onClick={() => ask(question)}
              disabled={loading || !question.trim()}
              className="btn-brand"
              style={{ flexShrink: 0, padding: "10px 24px", minWidth: "90px" }}
            >
              {loading ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "12px", height: "12px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </span>
              ) : "Ask →"}
            </button>
          </div>

          <div style={{ marginTop: "16px" }}>
            <p style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.25)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>
              Example questions
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
              {examples.map((ex) => (
                <button
                  key={ex}
                  onClick={() => ask(ex)}
                  disabled={loading}
                  style={{
                    padding: "5px 14px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "100px",
                    fontSize: "0.77rem",
                    color: "rgba(255,255,255,0.5)",
                    cursor: loading ? "not-allowed" : "pointer",
                    transition: "all 0.15s",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      (e.currentTarget as HTMLButtonElement).style.background = "rgba(61,129,227,0.12)";
                      (e.currentTarget as HTMLButtonElement).style.color = "white";
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(61,129,227,0.3)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
                    (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.5)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)";
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
            padding: "14px 18px",
            background: "rgba(239,68,68,0.10)",
            border: "1px solid rgba(239,68,68,0.22)",
            borderRadius: "var(--radius-lg)",
            fontSize: "0.83rem",
            color: "#f87171",
            marginBottom: "16px",
            whiteSpace: "pre-wrap",
            fontFamily: error.includes("\n") ? "monospace" : "inherit",
          }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-xl)",
            padding: "24px",
          }}>
            {/* Question */}
            <div style={{ marginBottom: "18px" }}>
              <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>Question</p>
              <p style={{ fontSize: "0.92rem", fontWeight: 500, color: "rgba(255,255,255,0.9)", margin: 0 }}>
                {result.question}
              </p>
            </div>

            {/* Generated SQL */}
            <div style={{ background: "rgba(0,0,0,0.35)", borderRadius: "10px", padding: "14px 16px", marginBottom: "18px" }}>
              <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "rgba(255,255,255,0.3)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Generated SQL
              </p>
              <code style={{ fontSize: "0.79rem", color: "rgba(147,197,253,0.85)", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                {result.sql}
              </code>
            </div>

            {/* Result count + table */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: result.count > 0 ? "14px" : "0" }}>
              <span style={{
                padding: "3px 12px",
                borderRadius: "100px",
                fontSize: "0.75rem",
                fontWeight: 700,
                background: result.count > 0 ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.06)",
                color: result.count > 0 ? "#34d399" : "rgba(255,255,255,0.35)",
                border: `1px solid ${result.count > 0 ? "rgba(52,211,153,0.25)" : "rgba(255,255,255,0.1)"}`,
              }}>
                {result.count} {result.count === 1 ? "row" : "rows"} returned
              </span>
              {result.truncated && (
                <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.3)" }}>
                  · showing first 200
                </span>
              )}
            </div>

            {result.count === 0 && (
              <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.3)", margin: "8px 0 0", fontStyle: "italic" }}>
                No matching records found. The query ran successfully — your data just doesn't match this condition.
              </p>
            )}

            {result.rows.length > 0 && (
              <div style={{ overflowX: "auto", borderRadius: "10px", border: "1px solid var(--border)" }}>
                <table className="dark-table" style={{ minWidth: "100%" }}>
                  <thead>
                    <tr>
                      {result.columns.map((col: string) => (
                        <th key={col}>{col.replace(/_/g, " ")}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row: any, i: number) => (
                      <tr key={i}>
                        {result.columns.map((col: string) => (
                          <td key={col} style={{ fontFamily: typeof row[col] === "number" ? "monospace" : "inherit" }}>
                            {row[col] == null ? "—" : typeof row[col] === "number" && !Number.isInteger(row[col])
                              ? `$${Number(row[col]).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : String(row[col])}
                          </td>
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
