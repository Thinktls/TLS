"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import BuyerLayout from "@/components/BuyerLayout";
import api from "@/lib/api";
import { downloadFile } from "@/lib/download";

interface ResultLine {
  part_number: string; description: string | null; quantity: number | null;
  outcome: "WON" | "LOST"; your_price: number | null; winning_price: number | null;
}
interface RollupRow { model: string; description: string; won: number; lost: number; won_value: number; per_item: number | null; }
interface ResultData { round_id: number; results: ResultLine[]; rollup?: RollupRow[]; won: number; lost: number; }
interface RoundRow { id: number; name: string; status: string; lines_submitted: number; lines_won: number; }

function ResultsInner() {
  const params = useSearchParams();
  const preselect = params.get("round");
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [selected, setSelected] = useState<number | null>(preselect ? Number(preselect) : null);
  const [result, setResult] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterOutcome, setFilterOutcome] = useState<"all" | "WON" | "LOST" | "model">("all");

  useEffect(() => {
    api.get("/buyer/my-rounds").then(r => {
      const completed = r.data.filter((row: RoundRow) => row.status === "complete");
      setRounds(completed);
      const firstId = preselect ? Number(preselect) : (completed.length === 1 ? completed[0].id : null);
      if (firstId) { setSelected(firstId); fetchResults(firstId); }
    });
  }, []);

  async function fetchResults(id: number) {
    setLoading(true); setResult(null);
    try { const res = await api.get(`/buyer/my-results/${id}`); setResult(res.data); }
    finally { setLoading(false); }
  }

  function pick(id: number) { setSelected(id); fetchResults(id); setFilterOutcome("all"); }

  const filtered = result?.results.filter(l => filterOutcome === "all" || l.outcome === filterOutcome) ?? [];
  const winRate  = result && result.won + result.lost > 0
    ? ((result.won / (result.won + result.lost)) * 100).toFixed(0) : null;

  return (
    <BuyerLayout>
      <div style={{ maxWidth: "940px" }} className="animate-in">
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.04em", margin: "0 0 4px" }}>My Results</h1>
          <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: 0 }}>Bid outcomes for completed rounds.</p>
        </div>

        {rounds.length === 0 ? (
          <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius-xl)", padding: "72px", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "14px" }}>📊</div>
            <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-2)", margin: "0 0 6px" }}>No results yet</p>
            <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: 0 }}>Results appear here once a round you participated in has been processed.</p>
          </div>
        ) : (
          <>
            {/* Round pills */}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "24px" }}>
              {rounds.map(r => (
                <button key={r.id} onClick={() => pick(r.id)} style={{
                  padding: "7px 18px", borderRadius: "100px", cursor: "pointer",
                  background: selected === r.id ? "var(--brand-dim)" : "var(--bg-2)",
                  border: `1px solid ${selected === r.id ? "var(--brand-dim)" : "var(--border)"}`,
                  color: selected === r.id ? "var(--text-1)" : "var(--text-3)",
                  fontSize: "0.82rem", fontWeight: selected === r.id ? 700 : 400,
                  transition: "all 0.15s", fontFamily: "inherit",
                }}>
                  {r.name}
                </button>
              ))}
            </div>

            {loading && (
              <div style={{ display: "flex", justifyContent: "center", padding: "48px" }}>
                <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid var(--brand-dim)", borderTopColor: "var(--brand)", animation: "spin 0.8s linear infinite" }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {result && !loading && (
              <>
                {/* Stats row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    {[
                      { label: "Won",      val: result.won,  bg: "var(--success-dim)",  border: "var(--success-dim)",  color: "var(--success)" },
                      { label: "Lost",     val: result.lost, bg: "var(--danger-dim)",  border: "var(--danger-dim)", color: "var(--danger)" },
                      { label: "Win Rate", val: winRate ? `${winRate}%` : "—", bg: "var(--surface)", border: "var(--border)", color: "var(--text-1)" },
                    ].map(({ label, val, bg, border, color }) => (
                      <div key={label} style={{ padding: "12px 20px", background: bg, border: `1px solid ${border}`, borderRadius: "var(--radius)" }}>
                        <p style={{ fontSize: "0.65rem", color: "var(--text-4)", margin: "0 0 5px", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>{label}</p>
                        <p style={{ fontSize: "1.5rem", fontWeight: 800, color, margin: 0, letterSpacing: "-0.03em" }}>{val}</p>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => downloadFile(`/buyer/rounds/${result.round_id}/award-sheet`, `award_sheet_round_${result.round_id}.xlsx`)}
                    className="btn-brand" style={{ fontSize: "0.82rem" }}>
                    ↓ Award Sheet (.xlsx)
                  </button>
                </div>

                {/* Filter tabs */}
                <div style={{ display: "flex", gap: "4px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "10px", padding: "4px", width: "fit-content", marginBottom: "16px", flexWrap: "wrap" }}>
                  {(["all","WON","LOST","model"] as const).map(f => (
                    <button key={f} onClick={() => setFilterOutcome(f)} style={{
                      padding: "5px 14px", borderRadius: "7px", fontSize: "0.78rem", cursor: "pointer", border: "none",
                      background: filterOutcome === f ? "var(--brand-dim)" : "transparent",
                      color: filterOutcome === f ? "var(--text-1)" : "var(--text-4)",
                      fontWeight: filterOutcome === f ? 600 : 400, transition: "all 0.15s", fontFamily: "inherit",
                    }}>
                      {f === "all" ? `All (${result.results.length})` : f === "WON" ? `Won (${result.won})` : f === "LOST" ? `Lost (${result.lost})` : `Summed by Model (${result.rollup?.length ?? 0})`}
                    </button>
                  ))}
                </div>

                {/* Summed-by-model view — one line per model with won/lost totals, so a buyer
                    with thousands of per-device results sees the picture at a glance. */}
                {filterOutcome === "model" ? (
                  <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", overflow: "hidden" }}>
                    <table className="dark-table">
                      <thead>
                        <tr>
                          <th>Model</th><th>Description</th>
                          <th style={{ textAlign: "right" }}>Won</th>
                          <th style={{ textAlign: "right" }}>Lost</th>
                          <th style={{ textAlign: "right" }}>Per Item</th>
                          <th style={{ textAlign: "right" }}>Won Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(result.rollup ?? []).map((r, i) => (
                          <tr key={i}>
                            <td style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "var(--text-1)" }}>{r.model}</td>
                            <td style={{ maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-3)" }}>{r.description || "—"}</td>
                            <td style={{ textAlign: "right", color: r.won > 0 ? "var(--success)" : "var(--text-4)", fontWeight: r.won > 0 ? 700 : 400 }}>{r.won}</td>
                            <td style={{ textAlign: "right", color: r.lost > 0 ? "var(--info)" : "var(--text-4)" }}>{r.lost}</td>
                            <td style={{ textAlign: "right", fontFamily: "monospace", color: "var(--text-2)" }}>{r.per_item != null ? `$${r.per_item.toFixed(2)}` : "—"}</td>
                            <td style={{ textAlign: "right", fontFamily: "monospace", color: "var(--success)" }}>{r.won_value > 0 ? `$${r.won_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(result.rollup ?? []).length === 0 && (
                      <div style={{ padding: "40px", textAlign: "center", color: "var(--text-4)", fontSize: "0.85rem" }}>No results yet.</div>
                    )}
                  </div>
                ) : (<></>)}

                {/* Per-line table (hidden in the summed-by-model view) */}
                {filterOutcome !== "model" && (
                <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", overflow: "hidden" }}>
                  <table className="dark-table">
                    <thead>
                      <tr>
                        <th>Part Number</th><th>Description</th>
                        <th style={{ textAlign: "right" }}>Qty</th>
                        <th style={{ textAlign: "right" }}>Your Price</th>
                        <th style={{ textAlign: "right" }}>Winning Price</th>
                        <th style={{ textAlign: "center" }}>Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((line, i) => (
                        <tr key={i} style={{ background: line.outcome === "WON" ? "var(--success-dim)" : "transparent" }}>
                          <td style={{ fontFamily: "monospace", fontSize: "0.78rem", color: line.outcome === "WON" ? "var(--success)" : "var(--info)" }}>{line.part_number}</td>
                          <td style={{ maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.description || "—"}</td>
                          <td style={{ textAlign: "right", color: "var(--text-3)" }}>{line.quantity ?? "—"}</td>
                          <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                            {line.your_price != null ? `$${line.your_price.toFixed(2)}` : "—"}
                          </td>
                          <td style={{ textAlign: "right", fontFamily: "monospace", color: line.outcome === "WON" ? "var(--success)" : "var(--text-3)" }}>
                            {line.winning_price != null ? `$${line.winning_price.toFixed(2)}` : "—"}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <span className={`badge ${line.outcome === "WON" ? "badge-won" : "badge-lost"}`}>{line.outcome}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length === 0 && (
                    <div style={{ padding: "40px", textAlign: "center", color: "var(--text-4)", fontSize: "0.85rem" }}>No results match this filter.</div>
                  )}
                </div>
                )}
                <p style={{ fontSize: "0.7rem", color: "var(--text-4)", marginTop: "10px" }}>
                  * Winning prices for lost lines reflect competitive market pricing and may include adjustments.
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
    <Suspense fallback={<BuyerLayout><div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}><div style={{ width: "24px", height: "24px", borderRadius: "50%", border: "2px solid var(--brand-dim)", borderTopColor: "var(--brand)", animation: "spin 0.8s linear infinite" }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div></BuyerLayout>}>
      <ResultsInner />
    </Suspense>
  );
}
