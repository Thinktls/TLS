"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import BuyerLayout from "@/components/BuyerLayout";
import api from "@/lib/api";
import { downloadFile } from "@/lib/download";

interface ResultLine {
  part_number: string;
  description: string | null;
  quantity: number | null;
  outcome: "WON" | "LOST";
  your_price: number | null;
  winning_price: number | null;
}

interface ResultData {
  round_id: number;
  results: ResultLine[];
  won: number;
  lost: number;
}

interface RoundRow {
  id: number;
  name: string;
  status: string;
  lines_submitted: number;
  lines_won: number;
}

function ResultsInner() {
  const searchParams = useSearchParams();
  const preselect = searchParams.get("round");

  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(preselect ? Number(preselect) : null);
  const [result, setResult] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/buyer/my-rounds").then((r) => {
      const completed = r.data.filter((row: RoundRow) => row.status === "complete");
      setRounds(completed);
      const firstId = preselect ? Number(preselect) : (completed.length === 1 ? completed[0].id : null);
      if (firstId) { setSelectedRound(firstId); fetchResults(firstId); }
    });
  }, []);

  async function fetchResults(roundId: number) {
    setLoading(true);
    setResult(null);
    try {
      const res = await api.get(`/buyer/my-results/${roundId}`);
      setResult(res.data);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectRound(id: number) {
    setSelectedRound(id);
    fetchResults(id);
  }

  return (
    <BuyerLayout>
      <div style={{ maxWidth: "900px" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "white", letterSpacing: "-0.03em", margin: "0 0 4px" }}>
          My Results
        </h2>
        <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", marginBottom: "28px" }}>
          Bid outcomes for completed rounds.
        </p>

        {rounds.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: "60px", color: "rgba(255,255,255,0.3)", fontSize: "0.9rem" }}>
            No completed rounds yet. Results appear here once a round has been processed.
          </div>
        ) : (
          <>
            {/* Round selector pills */}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "24px" }}>
              {rounds.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleSelectRound(r.id)}
                  style={{
                    padding: "7px 18px", borderRadius: "100px",
                    border: `1px solid ${selectedRound === r.id ? "rgba(61,129,227,0.5)" : "rgba(255,255,255,0.1)"}`,
                    background: selectedRound === r.id ? "rgba(61,129,227,0.18)" : "rgba(255,255,255,0.03)",
                    color: selectedRound === r.id ? "white" : "rgba(255,255,255,0.5)",
                    fontSize: "0.82rem", fontWeight: selectedRound === r.id ? 600 : 400,
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  {r.name}
                </button>
              ))}
            </div>

            {loading && (
              <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", paddingTop: "40px" }}>Loading results...</div>
            )}

            {result && !loading && (
              <>
                {/* Score cards + download */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
                  <div style={{ display: "flex", gap: "10px" }}>
                    {[
                      { label: "Won", value: result.won, bg: "rgba(52,211,153,0.1)", border: "rgba(52,211,153,0.2)", color: "#34d399" },
                      { label: "Lost", value: result.lost, bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.2)", color: "#f87171" },
                      {
                        label: "Win Rate",
                        value: result.won + result.lost > 0 ? `${((result.won / (result.won + result.lost)) * 100).toFixed(0)}%` : "—",
                        bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)", color: "white",
                      },
                    ].map(({ label, value, bg, border, color }) => (
                      <div key={label} style={{ padding: "12px 20px", background: bg, border: `1px solid ${border}`, borderRadius: "12px" }}>
                        <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
                        <p style={{ fontSize: "1.4rem", fontWeight: 700, color, margin: 0 }}>{value}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => downloadFile(`/buyer/rounds/${result.round_id}/award-sheet`, `award_sheet_round_${result.round_id}.xlsx`)}
                    className="btn-brand"
                    style={{ fontSize: "0.82rem" }}
                  >
                    ↓ Download Award Sheet
                  </button>
                </div>

                {/* Results table */}
                <div style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "18px", overflow: "hidden",
                }}>
                  <table className="dark-table">
                    <thead>
                      <tr>
                        <th>Part Number</th>
                        <th>Description</th>
                        <th style={{ textAlign: "right" }}>Qty</th>
                        <th style={{ textAlign: "right" }}>Your Price</th>
                        <th style={{ textAlign: "right" }}>Winning Price</th>
                        <th style={{ textAlign: "center" }}>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.results.map((line, idx) => (
                        <tr key={idx} style={{ background: line.outcome === "WON" ? "rgba(52,211,153,0.04)" : "transparent" }}>
                          <td style={{ fontFamily: "monospace", fontSize: "0.78rem" }}>{line.part_number}</td>
                          <td style={{ maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                            {line.description || "—"}
                          </td>
                          <td style={{ textAlign: "right" }}>{line.quantity ?? "—"}</td>
                          <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                            {line.your_price != null ? `$${line.your_price.toFixed(2)}` : "—"}
                          </td>
                          <td style={{ textAlign: "right", fontFamily: "monospace", color: line.outcome === "WON" ? "#34d399" : "rgba(255,255,255,0.6)" }}>
                            {line.winning_price != null ? `$${line.winning_price.toFixed(2)}` : "—"}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <span style={{
                              padding: "3px 10px", borderRadius: "100px", fontSize: "0.7rem", fontWeight: 700,
                              background: line.outcome === "WON" ? "rgba(52,211,153,0.15)" : "rgba(239,68,68,0.12)",
                              color: line.outcome === "WON" ? "#34d399" : "#f87171",
                            }}>
                              {line.outcome}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.2)", marginTop: "10px" }}>
                  * Winning prices shown for lost lines reflect competitive market pricing and may include adjustments.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </BuyerLayout>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<BuyerLayout><div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", paddingTop: 60 }}>Loading...</div></BuyerLayout>}>
      <ResultsInner />
    </Suspense>
  );
}
